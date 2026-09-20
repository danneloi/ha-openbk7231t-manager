"""Experimental helper for migrating a device from ESPHome to OpenBK7231T_App
("OpenBeken") over OTA, and back-translating an existing ESPHome YAML's pin
assignments into OpenBeken console commands.

This only supports chips built on the LibreTiny platform (ESPHome's own
platform for Beken BK72xx and a few Realtek/Lightning MCUs) - that's the only
platform where ESPHome and OpenBeken firmware can run on the exact same
silicon, and the only one `ltchiptool` (github.com/libretiny-eu/ltchiptool)
knows how to package a foreign firmware image for.

Two independent pieces live here:

  1. UF2 building: download the OpenBeken OTA asset for a given target board
     (mapping board -> LibreTiny chip family -> our own OTA_ASSET_TEMPLATES
     chipset key) and package it into a `.uf2` file via `ltchiptool uf2
     write` - the same file format/scheme ESPHome's own OTA tooling expects
     on these chips (confirmed against real ltchiptool output: the
     "device:download" target produces a UF2 with a "download" partition,
     which is what the community's OpenBeken_uf2_firmware project uses to
     flash OpenBeken onto an ESPHome/LibreTiny device via the ESPHome
     dashboard's own firmware upload). We never touch the device directly
     for this step - the user uploads the resulting file through ESPHome's
     own OTA mechanism themselves.

  2. ESPHome YAML translation: a best-effort reader for an *existing*
     ESPHome YAML config (the one already driving a device before
     migrating it) that pulls out `switch`/`binary_sensor`/`light`+`output`
     GPIO pin assignments and turns them into the equivalent OpenBeken
     console commands (`setPinRole`/`setPinChannel`), the same command
     shape used by the official OpenBekenIOT/webapp "device template"
     importer (its `templateParser.js` emits
     `backlog setPinRole <pin> <role>;setPinChannel <pin> <channel>`,
     applied to a device via its Tasmota-compatible `GET /cm?cmnd=`
     endpoint - see obk_client.send_command_cm()). This is a heuristic,
     not a full ESPHome config compiler: anything beyond simple gpio
     switches/buttons/lights is reported as a warning instead of guessed.
"""
from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import yaml

log = logging.getLogger("migrate_esphome")

# ltchiptool Board.family.short_name -> our own github_release.chipset key.
# Only chips listed here are offered anywhere in this feature - anything
# ltchiptool supports but we can't map to one of our own OTA_ASSET_TEMPLATES
# entries (e.g. BK7231Q) is intentionally left out rather than guessed.
LT_FAMILY_TO_OBK_CHIPSET: Dict[str, str] = {
    "BK7231N": "BK7231N",
    "BK7231T": "BK7231T",
    "BK7238": "BK7238",
    "BK7251": "BK7252",  # ltchiptool's internal family name for this chip; OpenBeken calls it BK7252
    "LN882H": "LN882H",
    "RTL8710B": "RTL8710B",
    "RTL8720C": "RTL87X0C",  # OpenBeken's umbrella name for RTL8720CF/CM ("RTL87X0C")
}


# ---------------------------------------------------------------------------
# Board list (for the "which chip/module" dropdown)
# ---------------------------------------------------------------------------

def list_boards() -> List[dict]:
    """All ltchiptool boards for chips we can also fetch OpenBeken firmware
    for, each annotated with which of our own chipset keys it maps to."""
    from ltchiptool import Board  # imported lazily - not needed unless this feature is used

    boards = []
    for name in Board.get_list():
        try:
            b = Board(name)
        except Exception:  # noqa: BLE001
            continue
        family = b.family.short_name
        chipset = LT_FAMILY_TO_OBK_CHIPSET.get(family)
        if not chipset:
            continue
        boards.append({
            "name": b.name,
            "title": b.title,
            "family": family,
            "chipset": chipset,
            "generic": bool(b.is_generic),
            "vendor": b.vendor,
        })
    # Generic boards first within each family - they're the safe default for
    # a device that was never flashed via a board-specific ltchiptool profile
    # to begin with (i.e. every device that started out on ESPHome).
    boards.sort(key=lambda x: (x["family"], not x["generic"], x["title"]))
    return boards


def find_board(name: str) -> Optional[dict]:
    for b in list_boards():
        if b["name"] == name:
            return b
    return None


# ---------------------------------------------------------------------------
# UF2 building
# ---------------------------------------------------------------------------

class UF2BuildError(Exception):
    pass


def build_uf2(
    board_name: str,
    firmware_path: str,
    fw_name: str,
    fw_version: str,
    out_path: str,
    timeout: float = 60.0,
) -> None:
    """Package an existing OpenBeken OTA firmware file (.rbl/.img, already
    downloaded via github_release.ensure_firmware_cached) into a `.uf2` file
    at `out_path`, using ltchiptool's own CLI (run out-of-process so its
    click/logging setup never touches this app's own logging config).

    Raises UF2BuildError with a human-readable message on failure.
    """
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cmd = [
        sys.executable, "-m", "ltchiptool", "uf2", "write",
        "-o", out_path,
        "-b", board_name,
        "-F", f"{fw_name}:{fw_version}",
        f"{firmware_path}=device:download",
    ]
    log.info("Building UF2 for board=%s: %s", board_name, " ".join(cmd))
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise UF2BuildError(f"ltchiptool timed out after {timeout:.0f}s: {exc}") from exc
    except OSError as exc:
        raise UF2BuildError(f"Could not start ltchiptool: {exc}") from exc
    if result.returncode != 0 or not os.path.exists(out_path):
        detail = (result.stderr or result.stdout or "unknown error").strip()
        raise UF2BuildError(f"ltchiptool failed: {detail}")


# ---------------------------------------------------------------------------
# ESPHome YAML -> OpenBeken pin-role command translation
# ---------------------------------------------------------------------------

@dataclass
class PinAssignment:
    pin: int
    role: str  # "Rel" | "Btn" | "LED"
    channel: int
    source: str  # e.g. "switch: Kitchen Relay" - for display only


@dataclass
class TranslationResult:
    pins: List[PinAssignment] = field(default_factory=list)
    commands: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class _PermissiveLoader(yaml.SafeLoader):
    """A YAML loader that tolerates ESPHome's custom tags (!secret,
    !lambda, !include, ...) by turning them into a harmless placeholder
    string instead of raising - we only care about plain pin numbers/ids,
    never about secrets or lambda code, so losing that content is fine."""


def _ignore_tag(loader: yaml.Loader, tag_suffix: str, node: yaml.Node):
    if isinstance(node, yaml.ScalarNode):
        return f"__esphome_tag_{tag_suffix}__"
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node)
    return None


_PermissiveLoader.add_multi_constructor("!", _ignore_tag)


def _extract_pin_number(pin_value) -> Optional[int]:
    if isinstance(pin_value, dict):
        pin_value = pin_value.get("number")
    if pin_value is None:
        return None
    if isinstance(pin_value, bool):
        return None
    if isinstance(pin_value, int):
        return pin_value
    match = re.search(r"(\d+)", str(pin_value))
    return int(match.group(1)) if match else None


def _apply_substitutions(node, subs: Dict[str, str]):
    """ESPHome's `${name}` substitution syntax isn't resolved by a plain
    YAML parser - do a best-effort textual replacement on every string leaf
    using the top-level `substitutions:` block, since pin numbers are
    sometimes templated that way (e.g. `pin: ${relay_pin}`)."""
    if not subs:
        return node
    if isinstance(node, str):
        for key, value in subs.items():
            node = node.replace(f"${{{key}}}", str(value))
        return node
    if isinstance(node, list):
        return [_apply_substitutions(item, subs) for item in node]
    if isinstance(node, dict):
        return {k: _apply_substitutions(v, subs) for k, v in node.items()}
    return node


def _name_of(entry: dict, fallback: str) -> str:
    return str(entry.get("name") or entry.get("id") or fallback)


def translate_esphome_yaml(yaml_text: str) -> TranslationResult:
    result = TranslationResult()
    try:
        raw = yaml.load(yaml_text, Loader=_PermissiveLoader)
    except yaml.YAMLError as exc:
        result.warnings.append(f"YAML konnte nicht gelesen werden: {exc}")
        return result
    if not isinstance(raw, dict):
        result.warnings.append("Das ist keine gültige ESPHome-YAML (kein Objekt auf oberster Ebene).")
        return result

    subs = raw.get("substitutions") if isinstance(raw.get("substitutions"), dict) else {}
    doc = _apply_substitutions(raw, subs) if subs else raw

    channel_counters = {"Rel": 0, "Btn": 0, "LED": 0}
    used_pins: Dict[int, str] = {}

    def assign(pin: Optional[int], role: str, source: str) -> None:
        if pin is None:
            result.warnings.append(f"{source}: Pin konnte nicht bestimmt werden, bitte manuell prüfen.")
            return
        if pin in used_pins:
            result.warnings.append(
                f"{source}: Pin {pin} wurde bereits als {used_pins[pin]} zugewiesen - übersprungen."
            )
            return
        channel = channel_counters[role]
        channel_counters[role] += 1
        used_pins[pin] = f"{role} (Kanal {channel})"
        result.pins.append(PinAssignment(pin=pin, role=role, channel=channel, source=source))

    # --- switches (relays) -------------------------------------------------
    for entry in (doc.get("switch") or []):
        if not isinstance(entry, dict) or entry.get("platform") != "gpio":
            continue
        name = _name_of(entry, "Switch")
        pin = _extract_pin_number(entry.get("pin"))
        assign(pin, "Rel", f"switch '{name}'")

    # --- binary sensors (buttons) -------------------------------------------
    for entry in (doc.get("binary_sensor") or []):
        if not isinstance(entry, dict) or entry.get("platform") != "gpio":
            continue
        name = _name_of(entry, "Button")
        pin = _extract_pin_number(entry.get("pin"))
        assign(pin, "Btn", f"binary_sensor '{name}'")

    # --- outputs (used by lights below) -------------------------------------
    outputs_by_id: Dict[str, int] = {}
    output_platforms: Dict[str, str] = {}
    for entry in (doc.get("output") or []):
        if not isinstance(entry, dict):
            continue
        out_id = entry.get("id")
        pin = _extract_pin_number(entry.get("pin"))
        if out_id and pin is not None:
            outputs_by_id[out_id] = pin
            output_platforms[out_id] = str(entry.get("platform") or "?")

    # --- lights (LEDs, possibly multi-channel) ------------------------------
    referenced_outputs = set()
    light_channel_keys = ("output", "red", "green", "blue", "white", "cold_white", "warm_white")
    for entry in (doc.get("light") or []):
        if not isinstance(entry, dict):
            continue
        name = _name_of(entry, "Light")
        ref_ids = []
        for key in light_channel_keys:
            val = entry.get(key)
            if isinstance(val, str):
                ref_ids.append(val)
        for val in (entry.get("outputs") or []):
            if isinstance(val, str):
                ref_ids.append(val)
        if not ref_ids:
            result.warnings.append(f"light '{name}': keine erkennbare GPIO-Ausgabe, bitte manuell prüfen.")
            continue
        if len(ref_ids) > 1:
            result.warnings.append(
                f"light '{name}': mehrere Kanäle ({', '.join(ref_ids)}) - Farbmischung/Gruppierung "
                "geht bei der Übersetzung verloren, jeder Pin wird einzeln als LED gesetzt."
            )
        for out_id in ref_ids:
            referenced_outputs.add(out_id)
            pin = outputs_by_id.get(out_id)
            if pin is None:
                result.warnings.append(f"light '{name}': Ausgabe '{out_id}' nicht gefunden.")
                continue
            assign(pin, "LED", f"light '{name}' (Ausgabe '{out_id}')")

    for out_id, pin in outputs_by_id.items():
        if out_id not in referenced_outputs:
            result.warnings.append(
                f"output '{out_id}' (Pin {pin}, platform '{output_platforms.get(out_id)}') wird von "
                "keinem Licht verwendet - nicht automatisch übersetzt."
            )

    if not result.pins:
        result.warnings.append(
            "Es konnten keine einfachen GPIO-Pins (switch/binary_sensor/light+output) gefunden werden."
        )

    for p in sorted(result.pins, key=lambda p: p.pin):
        result.commands.append(f"backlog setPinRole {p.pin} {p.role};setPinChannel {p.pin} {p.channel}")

    return result
