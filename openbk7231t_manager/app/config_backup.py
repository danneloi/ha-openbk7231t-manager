"""Per-device configuration backup/restore.

OpenBK7231T_App persists a device's GPIO pin role/channel mapping and its
startup command script (the "autoexec"-equivalent - a list of console
commands run on every boot) directly on the device's flash. There is no
built-in export/import feature in the firmware's own web UI, but the same
two REST endpoints its "Pins" configuration page itself uses give us
everything we need (verified against openshwprojects/OpenBK7231T_App's
src/httpserver/rest_interface.c, http_rest_get_pins()/http_rest_post_pins()):

  GET  http://<ip>/api/pins
      -> JSON: {"rolenames": [...], "roles": [...], "channels": [...],
                 "channels2": [...]?, "states": [...]}
      `channels2` is only present at all if at least one entry is non-zero
      (used for advanced/extended channel mappings, e.g. some dimmers).
      `states` is the current live channel values, not configuration - we
      keep it in the stored backup for reference but never send it back.

  POST http://<ip>/api/pins       body: JSON {"roles": [...], "channels":
                                   [...], "deviceCommand": "<startup cmds>"}
      -> Applies the given pin roles/channels and replaces the persisted
         startup command script, then saves to flash
         (CFG_Save_SetupTimer()). "channels2" and "states" are not read by
         the POST handler, so an advanced/extended channel mapping can be
         backed up here for reference but not restored this way.

The startup command script itself is also echoed back (read-only) as the
"startcmd" field of GET /api/info - see obk_client.get_info().

Backups are stored as one JSON file per snapshot under
DATA_DIR/config_backups/<device_id>/<backup_id>.json. A rolling window
(MAX_PER_DEVICE, oldest first) keeps this from growing forever - these
files are tiny (a GPIO map plus a short command script, usually well under
5 KB each) compared to the firmware/UF2 cache, so a simple fixed count is
enough; no size-based cleanup like cache_manager.py is needed here.
"""
from __future__ import annotations

import json
import os
import time
from typing import List, Optional

import obk_client
import version_utils

REASON_MANUAL = "manual"
REASON_PRE_UPDATE = "pre_update"

MAX_PER_DEVICE = 20


class BackupError(Exception):
    """Raised when a backup could not be created (device unreachable, an
    unexpected response, ...). The message is human-readable and safe to
    show directly in the UI / log."""


def _device_dir(base_dir: str, device_id: str) -> str:
    return os.path.join(base_dir, device_id)


def _backup_path(base_dir: str, device_id: str, backup_id: str) -> Optional[str]:
    # backup_id always comes from our own str(int(time.time()*1000)), but
    # guard against path traversal regardless since it can arrive from a
    # URL path segment.
    if not backup_id or not backup_id.isdigit():
        return None
    return os.path.join(_device_dir(base_dir, device_id), f"{backup_id}.json")


def list_backups(base_dir: str, device_id: str) -> List[dict]:
    """All backups for one device, oldest first."""
    d = _device_dir(base_dir, device_id)
    if not os.path.isdir(d):
        return []
    out: List[dict] = []
    for filename in os.listdir(d):
        if not filename.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, filename), "r", encoding="utf-8") as fh:
                out.append(json.load(fh))
        except (OSError, ValueError):
            continue
    out.sort(key=lambda e: e.get("created_at", 0))
    return out


def list_all_backups(base_dir: str) -> List[dict]:
    """Every backup across every device, oldest first."""
    if not os.path.isdir(base_dir):
        return []
    out: List[dict] = []
    for device_id in os.listdir(base_dir):
        if os.path.isdir(os.path.join(base_dir, device_id)):
            out.extend(list_backups(base_dir, device_id))
    out.sort(key=lambda e: e.get("created_at", 0))
    return out


def get_backup(base_dir: str, device_id: str, backup_id: str) -> Optional[dict]:
    path = _backup_path(base_dir, device_id, backup_id)
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _prune(base_dir: str, device_id: str, max_per_device: int) -> None:
    entries = list_backups(base_dir, device_id)  # oldest first
    excess = len(entries) - max_per_device
    if excess <= 0:
        return
    for entry in entries[:excess]:
        path = _backup_path(base_dir, device_id, entry.get("id", ""))
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


def create_backup(base_dir: str, device: dict, reason: str, max_per_device: int = MAX_PER_DEVICE) -> dict:
    """Fetch the device's current pin config + startup command and store it
    as a new backup entry. Raises BackupError on failure."""
    ip = device["ip"]
    password = device.get("password")

    info = obk_client.get_info(ip, password=password)
    if info is None:
        raise BackupError("Gerät nicht erreichbar (falsches Passwort oder offline?).")

    pins_result = obk_client.get_pins(ip, password=password)
    if not pins_result.get("ok"):
        raise BackupError(pins_result.get("error") or "Pin-Konfiguration konnte nicht gelesen werden.")
    pins = pins_result.get("data") or {}

    device_command = (info.raw or {}).get("startcmd")
    version = version_utils.extract_version_from_build_string(info.build)

    backup_id = str(int(time.time() * 1000))
    entry = {
        "id": backup_id,
        "device_id": device["id"],
        "device_name": device.get("name") or device.get("short_name") or ip,
        "ip": ip,
        "created_at": time.time(),
        "reason": reason,
        "chipset": info.chipset,
        "version": version,
        "rolenames": pins.get("rolenames"),
        "roles": pins.get("roles"),
        "channels": pins.get("channels"),
        "channels2": pins.get("channels2"),
        "device_command": device_command,
    }

    device_dir = _device_dir(base_dir, device["id"])
    os.makedirs(device_dir, exist_ok=True)
    path = _backup_path(base_dir, device["id"], backup_id)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(entry, fh, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)

    _prune(base_dir, device["id"], max_per_device)
    return entry


def delete_backup(base_dir: str, device_id: str, backup_id: str) -> bool:
    path = _backup_path(base_dir, device_id, backup_id)
    if not path or not os.path.isfile(path):
        return False
    os.remove(path)
    try:
        d = _device_dir(base_dir, device_id)
        if not os.listdir(d):
            os.rmdir(d)
    except OSError:
        pass
    return True


def restore_backup(ip: str, password: Optional[str], entry: dict) -> dict:
    """Push a saved snapshot's roles/channels/startup-command back to the
    device via POST /api/pins. Returns {"ok": bool, "error": str|None}."""
    payload: dict = {}
    if entry.get("roles") is not None:
        payload["roles"] = entry["roles"]
    if entry.get("channels") is not None:
        payload["channels"] = entry["channels"]
    if entry.get("device_command") is not None:
        payload["deviceCommand"] = entry["device_command"]
    if not payload:
        return {"ok": False, "error": "Backup enthält keine wiederherstellbaren Daten."}
    return obk_client.post_pins(ip, payload, password=password)
