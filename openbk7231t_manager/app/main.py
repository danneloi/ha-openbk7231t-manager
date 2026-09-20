from __future__ import annotations

import logging
import os
import re
import sys
import threading
import time
from typing import Optional

from flask import Flask, jsonify, request, send_from_directory, send_file
from waitress import serve as waitress_serve

import config as cfgmod
import discovery
import github_release
import ha_notify
import migrate_esphome
import notifiers
import obk_client
import store as storemod
import supervisor_api
import version_utils

APP_DIR = os.path.dirname(os.path.abspath(__file__))

settings = cfgmod.load_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("main")

if "OBK_INGRESS_PORT" not in os.environ:
    # config.yaml sets ingress_port: 0, which means the Supervisor picked a
    # free host port for us (we run with host_network: true, so a hardcoded
    # port here could collide with anything else on the HA host). Ask for
    # the port it actually assigned; fall back to the dataclass default
    # (8099) only if that lookup isn't possible, e.g. when running this
    # image standalone outside of Home Assistant.
    resolved = supervisor_api.get_self_ingress_port()
    if resolved:
        settings.ingress_port = resolved
    else:
        log.warning(
            "Could not determine the Supervisor-assigned ingress port; "
            "falling back to %s. If the add-on fails to bind this port, "
            "another program on this host is already using it.",
            settings.ingress_port,
        )

device_store = storemod.DeviceStore(settings.data_dir)
app_state = storemod.AppState(settings.data_dir)
notification_store = storemod.NotificationStore(settings.data_dir)
FIRMWARE_CACHE_DIR = os.path.join(settings.data_dir, "firmware")
MIGRATE_UF2_CACHE_DIR = os.path.join(settings.data_dir, "migrate_uf2")

UPDATE_POLL_INTERVAL_S = 5
UPDATE_TIMEOUT_S = 240  # give a device up to 4 minutes to come back after OTA
DOWNLOAD_GRACE_S = 45  # if the device hasn't even fetched the firmware image
# from us within this long, the ota_http command almost certainly was never
# really executed on the device - even though both /api/cmnd and its /cm
# fallback can answer HTTP 200 without that being any guarantee (see
# obk_client.trigger_ota_http). Failing fast here, instead of silently
# waiting out the full UPDATE_TIMEOUT_S, turns an unexplained
# "Zeitüberschreitung" into an actionable message.

# Tracks the last time each device IP hit our own firmware-download endpoint
# (see serve_firmware()/_run_asset_app below), so _watch_update() can tell a
# real "device is flashing, just slow" timeout apart from "the device never
# even tried to download the image" - something neither /api/cmnd's nor
# /cm's HTTP response can tell us on its own.
_download_events: dict[str, float] = {}
_download_events_lock = threading.Lock()


def _note_firmware_download(ip: str) -> None:
    with _download_events_lock:
        _download_events[ip] = time.time()


def _firmware_downloaded_since(ip: str, since: float) -> bool:
    with _download_events_lock:
        seen = _download_events.get(ip)
    return seen is not None and seen >= since

DEFAULT_MESSAGE_TEMPLATE = "OpenBK7231T_App {version} ist verfügbar. Betroffene Geräte: {devices}."

# Secret fields per channel type - never sent back to the browser in full,
# only as a "...set or not" flag, the same way device passwords are handled.
SECRET_CONFIG_FIELDS = ("bot_token", "apikey")

_state_lock = threading.Lock()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _password_lookup(ip: str) -> Optional[str]:
    dev = device_store.find_by_ip(ip)
    return dev.get("password") if dev else None


def _enrich_device(dev: dict, release: Optional[github_release.ReleaseInfo]) -> dict:
    out = dict(dev)
    out.pop("password", None)
    out["has_password"] = bool(dev.get("password"))
    chipset = dev.get("chipset")
    current_version = dev.get("current_version")
    ota_filename = github_release.ota_asset_filename(chipset, release.tag_name) if (release and chipset) else None
    out["ota_supported"] = ota_filename is not None
    out["uart_only"] = (chipset or "").strip().upper() in github_release.UART_ONLY_CHIPSETS
    if release:
        out["latest_version"] = release.tag_name
        out["update_available"] = bool(
            ota_filename and version_utils.is_newer(release.tag_name, current_version)
        )
    else:
        out["latest_version"] = None
        out["update_available"] = False
    return out


_CHANNEL_TYPE_NAMES = {"ha": "Home Assistant", "telegram": "Telegram", "whatsapp": "WhatsApp"}


def _default_channel_name(ch_type: str) -> str:
    return _CHANNEL_TYPE_NAMES.get(ch_type, ch_type)


def _enrich_channel(channel: dict) -> dict:
    """Strip secrets out of a channel before it goes to the browser, leaving
    only a "<field>_set" boolean the UI can use to show a placeholder."""
    out = dict(channel)
    cfg = dict(out.get("config") or {})
    for key in SECRET_CONFIG_FIELDS:
        cfg[f"{key}_set"] = bool(cfg.get(key))
        if key in cfg:
            cfg[key] = ""
    out["config"] = cfg
    return out


def _merge_channel_config(existing_config: Optional[dict], incoming_config: Optional[dict]) -> dict:
    """Merge incoming config fields onto the existing ones, but never
    overwrite a secret field (bot_token/apikey) with a blank value - that
    lets the UI leave a masked secret field untouched when editing a
    channel instead of forcing the user to re-enter it every time."""
    merged = dict(existing_config or {})
    for key, value in (incoming_config or {}).items():
        if key in SECRET_CONFIG_FIELDS and not value:
            continue
        merged[key] = value
    return merged


def _current_release() -> Optional[github_release.ReleaseInfo]:
    state = app_state.get()
    data = state.get("last_release")
    if not data:
        return None
    try:
        return github_release.ReleaseInfo.from_dict(data)
    except (KeyError, TypeError):
        return None


def _poll_device_once(dev: dict) -> None:
    info = obk_client.get_info(dev["ip"], password=dev.get("password"))
    if info is None:
        device_store.update_fields(dev["id"], online=False, last_checked=time.time())
        return
    version = version_utils.extract_version_from_build_string(info.build)
    fields = dict(
        online=True,
        last_checked=time.time(),
        last_seen=time.time(),
        build_str=info.build,
        chipset=info.chipset,
        mac=info.mac or dev.get("mac"),
        short_name=info.short_name,
        current_version=version,
    )
    # Re-key device id to the MAC once we learn it, if it was IP-keyed before.
    if info.mac and dev["id"].startswith("ip-"):
        new_id = storemod.DeviceStore.make_id(dev["ip"], info.mac)
        if new_id != dev["id"]:
            merged = {**dev, **fields, "id": new_id}
            device_store.upsert(merged)
            device_store.delete(dev["id"])
            return
    device_store.update_fields(dev["id"], **fields)


def _watch_update(
    device_id: str,
    previous_version: Optional[str],
    target_version: str,
    dev_ip: str,
    expect_pull_download: bool,
) -> None:
    started_at = time.time()
    deadline = started_at + UPDATE_TIMEOUT_S
    # Give the device a moment to actually start downloading/flashing before
    # we start hammering it (and before we treat a brief blip as "done").
    time.sleep(10)
    saw_offline = False
    # The download-grace fast-fail only makes sense for the ota_http/"pull"
    # fallback (see _start_update): when we pushed the firmware bytes
    # directly via /api/ota, there is no separate "device fetches from our
    # server" step to observe, so there's nothing to wait for here - treat
    # it as satisfied immediately.
    saw_download = (not expect_pull_download) or _firmware_downloaded_since(dev_ip, started_at)
    while time.time() < deadline:
        dev = device_store.get(device_id)
        if dev is None:
            return
        if expect_pull_download and not saw_download:
            saw_download = _firmware_downloaded_since(dev_ip, started_at)
            if not saw_download and time.time() - started_at > DOWNLOAD_GRACE_S:
                # The device never even fetched the firmware image from us -
                # the ota_http command almost certainly was never really
                # executed on the device, regardless of the HTTP status the
                # trigger request got back. Fail fast with a diagnosable
                # reason instead of burning the rest of UPDATE_TIMEOUT_S.
                log.warning(
                    "OTA update for %s (%s) timed out after %.0fs: device "
                    "never fetched the firmware image from our server "
                    "(port %s)",
                    device_id, dev_ip, time.time() - started_at,
                    settings.firmware_server_port,
                )
                device_store.update_fields(
                    device_id,
                    update_state="timeout",
                    update_finished_at=time.time(),
                    last_error=(
                        "Gerät hat nie versucht, die Firmware-Datei vom "
                        "Add-on herunterzuladen. Der Update-Befehl wurde "
                        "vermutlich vom Gerät nicht wirklich ausgeführt, "
                        "auch wenn die Anfrage mit HTTP 200 beantwortet "
                        "wurde - oder das Gerät kann den Firmware-Server "
                        "des Add-ons (Port "
                        f"{settings.firmware_server_port}) im Netzwerk "
                        "nicht erreichen."
                    ),
                )
                return
        info = obk_client.get_info(dev["ip"], password=dev.get("password"), timeout=3)
        if info is None:
            saw_offline = True
            time.sleep(UPDATE_POLL_INTERVAL_S)
            continue
        new_version = version_utils.extract_version_from_build_string(info.build)
        device_store.update_fields(
            device_id,
            online=True,
            last_checked=time.time(),
            last_seen=time.time(),
            build_str=info.build,
            current_version=new_version,
        )
        if new_version and (
            version_utils.versions_equal(new_version, target_version)
            or (saw_offline and not version_utils.versions_equal(new_version, previous_version))
        ):
            device_store.update_fields(device_id, update_state="success", update_finished_at=time.time())
            return
        if not saw_offline:
            # Device hasn't even rebooted yet - keep waiting.
            time.sleep(UPDATE_POLL_INTERVAL_S)
            continue
        time.sleep(UPDATE_POLL_INTERVAL_S)

    log.warning(
        "OTA update for %s (%s) timed out after the full %ss watch window "
        "(pull-fallback=%s, firmware was %sdownloaded)",
        device_id, dev_ip, UPDATE_TIMEOUT_S, expect_pull_download, "" if saw_download else "never ",
    )
    if not expect_pull_download:
        last_error = (
            "Firmware wurde erfolgreich an das Gerät übertragen, aber es hat "
            "sich danach nicht mit der neuen Version zurückgemeldet (Flash- "
            "oder Neustart-Vorgang auf dem Gerät hat vermutlich nicht "
            "funktioniert oder länger gedauert als die Wartezeit)."
        )
    elif saw_download:
        last_error = (
            "Firmware wurde heruntergeladen, aber das Gerät hat sich nach "
            "dem Update-Befehl nicht mit der neuen Version zurückgemeldet."
        )
    else:
        last_error = (
            "Gerät hat nie versucht, die Firmware-Datei vom Add-on "
            "herunterzuladen."
        )
    device_store.update_fields(
        device_id,
        update_state="timeout",
        update_finished_at=time.time(),
        last_error=last_error,
    )


def _start_update(dev: dict, release: github_release.ReleaseInfo) -> dict:
    chipset = dev.get("chipset")
    filename = github_release.ota_asset_filename(chipset, release.tag_name)
    if not filename:
        return {"ok": False, "error": f"Kein Netzwerk-OTA-Image für Chipsatz '{chipset}' verfügbar."}

    try:
        local_path = github_release.ensure_firmware_cached(release, chipset, FIRMWARE_CACHE_DIR)
    except Exception as exc:  # noqa: BLE001
        log.exception("Firmware download failed")
        return {"ok": False, "error": f"Download der Firmware fehlgeschlagen: {exc}"}

    # Preferred path: push the firmware bytes directly to the device's
    # /api/ota endpoint - the same mechanism the firmware's own "Web
    # Application" drag-and-drop page and the official BK7231GUIFlashTool
    # use. The device never has to parse a URL itself here, which sidesteps
    # a confirmed real bug on RTL87X0C ("Realtek Ameba") builds where the
    # firmware's own URL parser for ota_http corrupts the target host's IP
    # (verified via packet capture - see obk_client.push_ota() docstring).
    try:
        with open(local_path, "rb") as fh:
            firmware_bytes = fh.read()
    except OSError as exc:
        return {"ok": False, "error": f"Konnte gecachte Firmware-Datei nicht lesen: {exc}"}

    log.info(
        "Starting OTA for %s (%s): pushing %d bytes directly to /api/ota",
        dev["id"], dev["ip"], len(firmware_bytes),
    )
    push_result = obk_client.push_ota(dev["ip"], firmware_bytes, password=dev.get("password"))
    expect_pull_download = False

    if push_result["ok"]:
        # A successful /api/ota push doesn't always trigger an automatic
        # reboot on every chipset - the reference GUI tool always follows
        # up with an explicit reboot call, so we do too.
        obk_client.reboot(dev["ip"], password=dev.get("password"))
    else:
        log.warning(
            "Direct OTA push to %s (%s) failed (%s) - falling back to the "
            "ota_http URL-based trigger",
            dev["id"], dev["ip"], push_result.get("error"),
        )
        local_ip = discovery.local_ip_for(dev["ip"]) or discovery.get_local_ip()
        if not local_ip:
            return {
                "ok": False,
                "error": (
                    f"Direkter Upload fehlgeschlagen ({push_result.get('error')}), "
                    "und konnte für den Fallback auch keine eigene "
                    "Netzwerkadresse bestimmen."
                ),
            }
        firmware_url = f"http://{local_ip}:{settings.firmware_server_port}/firmware/{release.tag_name}/{filename}"
        log.info("Fallback OTA for %s (%s): telling it to fetch %s", dev["id"], dev["ip"], firmware_url)
        # Clear any stale download record for this IP (e.g. from a
        # previous, unrelated update) so _watch_update doesn't mistake it
        # for evidence that *this* OTA attempt is actually in flight.
        with _download_events_lock:
            _download_events.pop(dev["ip"], None)
        pull_result = obk_client.trigger_ota_http(dev["ip"], firmware_url, password=dev.get("password"))
        if not pull_result["ok"]:
            return {
                "ok": False,
                "error": (
                    f"Gerät hat sowohl den direkten Upload ({push_result.get('error')}) "
                    f"als auch den URL-Update-Befehl abgelehnt: {pull_result.get('error')}"
                ),
            }
        expect_pull_download = True

    device_store.update_fields(
        dev["id"],
        update_state="updating",
        update_started_at=time.time(),
        update_target_version=release.tag_name,
        last_error=None,
    )
    threading.Thread(
        target=_watch_update,
        args=(dev["id"], dev.get("current_version"), release.tag_name, dev["ip"], expect_pull_download),
        daemon=True,
    ).start()
    return {"ok": True}


# --------------------------------------------------------------------------
# Background scheduler
# --------------------------------------------------------------------------

def _background_loop() -> None:
    last_poll = 0.0
    last_release_check = 0.0
    # Do an initial release check shortly after startup.
    time.sleep(5)
    while True:
        now = time.time()
        try:
            if now - last_poll >= settings.poll_interval_minutes * 60:
                for dev in device_store.list():
                    if dev.get("update_state") == "updating":
                        continue  # the dedicated watcher thread owns this device right now
                    _poll_device_once(dev)
                last_poll = now
        except Exception:  # noqa: BLE001
            log.exception("Error while polling devices")

        try:
            if now - last_release_check >= settings.release_check_interval_hours * 3600:
                _check_release_and_notify()
                last_release_check = now
        except Exception:  # noqa: BLE001
            log.exception("Error while checking for a new release")

        time.sleep(20)


def _check_release_and_notify() -> github_release.ReleaseInfo:
    release = github_release.fetch_latest_release()
    state = app_state.get()
    app_state.set(last_release=release.to_dict(), last_release_check=time.time())

    if settings.notify_on_update and state.get("last_notified_version") != release.tag_name:
        outdated = []
        for dev in device_store.list():
            filename = github_release.ota_asset_filename(dev.get("chipset"), release.tag_name)
            if filename and version_utils.is_newer(release.tag_name, dev.get("current_version")):
                outdated.append(dev.get("name") or dev.get("short_name") or dev.get("ip"))
        if outdated:
            # Only remember this version as "notified" once we actually had
            # something to say about it - if this check ran before any
            # devices were known yet, we want to notify later once a
            # device turns out to need this same release.
            names = ", ".join(sorted(outdated))
            title = "OpenBK7231T: neue Firmware verfügbar"
            channels = [c for c in notification_store.list() if c.get("enabled", True)]
            if channels:
                for channel in channels:
                    template = channel.get("message_template") or DEFAULT_MESSAGE_TEMPLATE
                    try:
                        message = template.format(version=release.tag_name, devices=names)
                    except (KeyError, IndexError, ValueError):
                        message = template
                    ok, error = notifiers.send(channel, title, message)
                    if not ok:
                        log.warning(
                            "Benachrichtigung über Kanal '%s' (%s) fehlgeschlagen: %s",
                            channel.get("name") or channel.get("id"),
                            channel.get("type"),
                            error,
                        )
            else:
                # No channel configured yet - fall back to the built-in HA
                # persistent notification so nobody misses an update.
                ha_notify.create_persistent_notification(
                    title=title,
                    message=(
                        f"OpenBK7231T_App {release.tag_name} ist verfügbar. "
                        f"Betroffene Geräte: {names}. Öffne das OpenBK7231T Manager "
                        f"Add-on, um zu aktualisieren."
                    ),
                    notification_id="openbk7231t_manager_update",
                )
            app_state.set(last_notified_version=release.tag_name)
    return release


# --------------------------------------------------------------------------
# Ingress web app (UI + JSON API) - proxied/authenticated by HA Supervisor
# --------------------------------------------------------------------------

ui_app = Flask(__name__, static_folder=os.path.join(APP_DIR, "static"))


@ui_app.get("/")
@ui_app.get("/index.html")
def index():
    return send_from_directory(APP_DIR, "index.html")


@ui_app.get("/migrate.html")
def migrate_page():
    return send_from_directory(APP_DIR, "migrate.html")


@ui_app.get("/api/devices")
def api_list_devices():
    release = _current_release()
    return jsonify([_enrich_device(d, release) for d in sorted(device_store.list(), key=lambda d: d.get("name") or d.get("ip") or "")])


@ui_app.post("/api/devices")
def api_add_device():
    body = request.get_json(force=True, silent=True) or {}
    ip = (body.get("ip") or "").strip()
    if not ip:
        return jsonify({"error": "IP-Adresse fehlt"}), 400
    password = body.get("password") or None
    name = (body.get("name") or "").strip() or None

    info = obk_client.get_info(ip, password=password)
    if info is None:
        return jsonify({"error": f"Kein OpenBK7231T-Gerät unter {ip} gefunden (falsches Passwort oder nicht erreichbar?)."}), 400

    version = version_utils.extract_version_from_build_string(info.build)
    dev_id = storemod.DeviceStore.make_id(ip, info.mac)
    device = {
        "id": dev_id,
        "ip": ip,
        "name": name or info.short_name or ip,
        "mac": info.mac,
        "chipset": info.chipset,
        "short_name": info.short_name,
        "build_str": info.build,
        "current_version": version,
        "online": True,
        "last_seen": time.time(),
        "last_checked": time.time(),
        "update_state": "idle",
    }
    if password:
        device["password"] = password
    device_store.upsert(device)
    return jsonify(_enrich_device(device_store.get(dev_id), _current_release())), 201


@ui_app.patch("/api/devices/<device_id>")
def api_update_device(device_id):
    dev = device_store.get(device_id)
    if not dev:
        return jsonify({"error": "Gerät nicht gefunden"}), 404
    body = request.get_json(force=True, silent=True) or {}
    fields = {}
    if "name" in body:
        fields["name"] = (body.get("name") or "").strip() or dev.get("ip")
    if "password" in body:
        fields["password"] = body.get("password") or None
    device_store.update_fields(device_id, **fields)
    return jsonify(_enrich_device(device_store.get(device_id), _current_release()))


@ui_app.delete("/api/devices/<device_id>")
def api_delete_device(device_id):
    ok = device_store.delete(device_id)
    return jsonify({"ok": ok}), (200 if ok else 404)


@ui_app.get("/api/devices/<device_id>/sensors")
def api_device_sensors(device_id):
    dev = device_store.get(device_id)
    if not dev:
        return jsonify({"error": "Gerät nicht gefunden"}), 404
    result = obk_client.get_sensor_status(dev["ip"], password=dev.get("password"))
    if not result["ok"]:
        return jsonify({"error": result["error"], "sensors": {}}), 502
    overrides = dev.get("sensor_label_overrides") or {}
    for key, custom_label in overrides.items():
        if key in result["sensors"] and custom_label:
            result["sensors"][key]["label"] = custom_label
            result["sensors"][key]["custom"] = True
    return jsonify(result)


@ui_app.patch("/api/devices/<device_id>/sensor-labels")
def api_update_sensor_label(device_id):
    """Lets the user rename a single sensor's display label. Overrides are
    stored per device/key and re-applied on top of the protocol-level
    default label every time /sensors is queried (see above)."""
    dev = device_store.get(device_id)
    if not dev:
        return jsonify({"error": "Gerät nicht gefunden"}), 404
    body = request.get_json(force=True, silent=True) or {}
    key = (body.get("key") or "").strip()
    if not key:
        return jsonify({"error": "Sensor-Schlüssel fehlt"}), 400
    label = (body.get("label") or "").strip()
    overrides = dict(dev.get("sensor_label_overrides") or {})
    if label:
        overrides[key] = label
    else:
        overrides.pop(key, None)  # empty label clears the override, reverting to the default
    device_store.update_fields(device_id, sensor_label_overrides=overrides)
    return jsonify({"ok": True, "sensor_label_overrides": overrides})


@ui_app.post("/api/devices/<device_id>/refresh")
def api_refresh_device(device_id):
    dev = device_store.get(device_id)
    if not dev:
        return jsonify({"error": "Gerät nicht gefunden"}), 404
    _poll_device_once(dev)
    return jsonify(_enrich_device(device_store.get(device_id), _current_release()))


@ui_app.post("/api/devices/<device_id>/update")
def api_update_device_firmware(device_id):
    dev = device_store.get(device_id)
    if not dev:
        return jsonify({"error": "Gerät nicht gefunden"}), 404
    release = _current_release()
    if not release:
        return jsonify({"error": "Noch keine Release-Informationen vorhanden. Bitte zuerst auf Releases prüfen."}), 400
    result = _start_update(dev, release)
    if not result["ok"]:
        device_store.update_fields(device_id, update_state="failed", last_error=result["error"])
        return jsonify({"error": result["error"]}), 400
    return jsonify(_enrich_device(device_store.get(device_id), release))


@ui_app.post("/api/devices/update_all")
def api_update_all():
    release = _current_release()
    if not release:
        return jsonify({"error": "Noch keine Release-Informationen vorhanden."}), 400
    started, skipped = [], []
    for dev in device_store.list():
        enriched = _enrich_device(dev, release)
        if not enriched["update_available"]:
            continue
        name = dev.get("name") or dev.get("ip")
        result = _start_update(dev, release)
        if result["ok"]:
            started.append({"id": dev["id"], "name": name})
        else:
            skipped.append({"id": dev["id"], "name": name, "error": result["error"]})
        time.sleep(2)  # stagger so we don't saturate the LAN/wifi
    return jsonify({"started": started, "skipped": skipped})


@ui_app.get("/api/release")
def api_release():
    state = app_state.get()
    return jsonify({
        "release": state.get("last_release"),
        "last_checked": state.get("last_release_check"),
    })


@ui_app.post("/api/release/check")
def api_release_check():
    try:
        release = _check_release_and_notify()
    except Exception as exc:  # noqa: BLE001
        log.exception("Manual release check failed")
        return jsonify({"error": str(exc)}), 502
    return jsonify(release.to_dict())


@ui_app.get("/api/migrate/boards")
def api_migrate_boards():
    return jsonify(migrate_esphome.list_boards())


@ui_app.post("/api/migrate/uf2")
def api_migrate_build_uf2():
    body = request.get_json(force=True, silent=True) or {}
    board_name = (body.get("board") or "").strip()
    board = migrate_esphome.find_board(board_name)
    if not board:
        return jsonify({"error": f"Unbekanntes Board '{board_name}'."}), 400

    release = _current_release()
    if not release:
        return jsonify({"error": "Noch keine Release-Informationen vorhanden. Bitte zuerst auf Releases prüfen."}), 400

    chipset = board["chipset"]
    filename = github_release.ota_asset_filename(chipset, release.tag_name)
    if not filename:
        return jsonify({"error": f"Kein OpenBeken-OTA-Image für Chipsatz '{chipset}' in Release {release.tag_name} verfügbar."}), 400

    try:
        firmware_path = github_release.ensure_firmware_cached(release, chipset, FIRMWARE_CACHE_DIR)
    except Exception as exc:  # noqa: BLE001
        log.exception("Firmware download for migration failed")
        return jsonify({"error": f"Download der Firmware fehlgeschlagen: {exc}"}), 502

    fw_name = filename.rsplit("_", 1)[0]
    uf2_dir = os.path.join(MIGRATE_UF2_CACHE_DIR, board["name"])
    uf2_filename = f"{fw_name}_{release.tag_name}.uf2"
    uf2_path = os.path.join(uf2_dir, uf2_filename)

    if not os.path.exists(uf2_path):
        try:
            migrate_esphome.build_uf2(board["name"], firmware_path, fw_name, release.tag_name, uf2_path)
        except migrate_esphome.UF2BuildError as exc:
            log.exception("UF2 build failed")
            return jsonify({"error": f"UF2-Erstellung fehlgeschlagen: {exc}"}), 502

    return jsonify({
        "ok": True,
        "board": board["name"],
        "chipset": chipset,
        "fw_name": fw_name,
        "fw_version": release.tag_name,
        "filename": uf2_filename,
        "download_url": f"api/migrate/uf2-file/{board['name']}/{release.tag_name}",
    })


_SAFE_TAG_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


@ui_app.get("/api/migrate/uf2-file/<board_name>/<version>")
def api_migrate_uf2_file(board_name, version):
    # board_name/version both end up in a filesystem path below, so only
    # ever accept values that came from our own list_boards()/release info -
    # this whitelist check also doubles as path-traversal protection.
    board = migrate_esphome.find_board(board_name)
    if not board or not _SAFE_TAG_RE.match(version):
        return jsonify({"error": "Unbekanntes Board oder ungültige Version."}), 404
    uf2_dir = os.path.join(MIGRATE_UF2_CACHE_DIR, board["name"])
    matches = [f for f in os.listdir(uf2_dir) if f.endswith(f"_{version}.uf2")] if os.path.isdir(uf2_dir) else []
    if not matches:
        return jsonify({"error": "Datei nicht gefunden - bitte zuerst erzeugen."}), 404
    return send_from_directory(uf2_dir, matches[0], as_attachment=True, download_name=matches[0])


@ui_app.post("/api/migrate/parse-yaml")
def api_migrate_parse_yaml():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Keine Datei hochgeladen."}), 400
    raw = file.read(1_000_000)  # 1 MB is far more than any real ESPHome YAML needs
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return jsonify({"error": "Datei ist keine gültige UTF-8-Textdatei."}), 400
    result = migrate_esphome.translate_esphome_yaml(text)
    return jsonify({
        "pins": [
            {"pin": p.pin, "role": p.role, "channel": p.channel, "source": p.source}
            for p in result.pins
        ],
        "commands": result.commands,
        "warnings": result.warnings,
    })


@ui_app.post("/api/migrate/apply-config")
def api_migrate_apply_config():
    body = request.get_json(force=True, silent=True) or {}
    ip = (body.get("ip") or "").strip()
    if not ip:
        return jsonify({"error": "IP-Adresse fehlt"}), 400
    password = body.get("password") or None
    commands = body.get("commands") or []
    if not isinstance(commands, list) or not commands:
        return jsonify({"error": "Keine Befehle übergeben."}), 400

    results = []
    for command in commands:
        outcome = obk_client.send_command_cm(ip, str(command), password=password)
        results.append({"command": command, "ok": outcome["ok"], "error": outcome.get("error")})
    return jsonify({"results": results})


@ui_app.get("/api/scan")
def api_scan():
    subnet = request.args.get("subnet") or settings.scan_subnet or None
    try:
        found = discovery.discover(subnet, password_lookup=_password_lookup)
    except Exception as exc:  # noqa: BLE001
        log.exception("Scan failed")
        return jsonify({"error": str(exc)}), 502
    known_ips = {d.get("ip") for d in device_store.list()}
    results = []
    for info in found:
        results.append({
            "ip": info.ip,
            "mac": info.mac,
            "chipset": info.chipset,
            "short_name": info.short_name,
            "build": info.build,
            "version": version_utils.extract_version_from_build_string(info.build),
            "already_added": info.ip in known_ips,
        })
    return jsonify({"subnet": subnet or discovery.guess_local_subnet(), "results": results})


@ui_app.get("/api/settings")
def api_settings():
    return jsonify({
        "scan_subnet": settings.scan_subnet,
        "poll_interval_minutes": settings.poll_interval_minutes,
        "release_check_interval_hours": settings.release_check_interval_hours,
        "notify_on_update": settings.notify_on_update,
        "firmware_server_port": settings.firmware_server_port,
    })


@ui_app.get("/api/notifications")
def api_list_notifications():
    channels = sorted(notification_store.list(), key=lambda c: c.get("created_at", 0))
    return jsonify([_enrich_channel(c) for c in channels])


@ui_app.get("/api/notifications/ha_services")
def api_notifications_ha_services():
    return jsonify(notifiers.list_ha_notify_services())


@ui_app.get("/api/notifications/message_placeholders")
def api_notifications_placeholders():
    return jsonify({
        "placeholders": ["version", "devices"],
        "default_template": DEFAULT_MESSAGE_TEMPLATE,
    })


@ui_app.post("/api/notifications")
def api_add_notification():
    body = request.get_json(force=True, silent=True) or {}
    ch_type = (body.get("type") or "").strip()
    if ch_type not in notifiers.CHANNEL_TYPES:
        return jsonify({"error": "Unbekannter Benachrichtigungstyp."}), 400
    channel = {
        "type": ch_type,
        "name": (body.get("name") or "").strip() or _default_channel_name(ch_type),
        "enabled": bool(body.get("enabled", True)),
        "message_template": (body.get("message_template") or "").strip() or DEFAULT_MESSAGE_TEMPLATE,
        "config": _merge_channel_config({}, body.get("config") or {}),
    }
    saved = notification_store.upsert(channel)
    return jsonify(_enrich_channel(saved)), 201


@ui_app.patch("/api/notifications/<channel_id>")
def api_update_notification(channel_id):
    existing = notification_store.get(channel_id)
    if not existing:
        return jsonify({"error": "Kanal nicht gefunden"}), 404
    body = request.get_json(force=True, silent=True) or {}
    fields = {}
    if "name" in body:
        fields["name"] = (body.get("name") or "").strip() or existing.get("name")
    if "enabled" in body:
        fields["enabled"] = bool(body.get("enabled"))
    if "message_template" in body:
        fields["message_template"] = (body.get("message_template") or "").strip() or DEFAULT_MESSAGE_TEMPLATE
    if "config" in body:
        fields["config"] = _merge_channel_config(existing.get("config"), body.get("config") or {})
    notification_store.update_fields(channel_id, **fields)
    return jsonify(_enrich_channel(notification_store.get(channel_id)))


@ui_app.delete("/api/notifications/<channel_id>")
def api_delete_notification(channel_id):
    ok = notification_store.delete(channel_id)
    return jsonify({"ok": ok}), (200 if ok else 404)


@ui_app.post("/api/notifications/<channel_id>/test")
def api_test_notification(channel_id):
    channel = notification_store.get(channel_id)
    if not channel:
        return jsonify({"error": "Kanal nicht gefunden"}), 404
    template = channel.get("message_template") or DEFAULT_MESSAGE_TEMPLATE
    try:
        message = template.format(version="1.99.999", devices="Test-Gerät")
    except (KeyError, IndexError, ValueError):
        message = template
    ok, error = notifiers.send(channel, "OpenBK7231T Manager: Test-Benachrichtigung", message)
    if not ok:
        return jsonify({"ok": False, "error": error}), 400
    return jsonify({"ok": True})


@ui_app.get("/healthz")
def healthz():
    return jsonify({"ok": True})


# --------------------------------------------------------------------------
# Plain (non-ingress) firmware server - must be reachable, unauthenticated,
# by IoT devices on the LAN, so it cannot live behind Supervisor ingress.
# --------------------------------------------------------------------------

asset_app = Flask(__name__)


@asset_app.get("/firmware/<version>/<path:filename>")
def serve_firmware(version, filename):
    # Record that *some* device at this IP reached our firmware server at
    # all - this is the only reliable signal _watch_update() has that an
    # ota_http command actually got executed on the device, since neither
    # /api/cmnd's status-mapped reply nor the /cm fallback can be trusted
    # for that (see obk_client.trigger_ota_http).
    log.info("Device %s is fetching firmware %s/%s", request.remote_addr, version, filename)
    _note_firmware_download(request.remote_addr)
    directory = os.path.join(FIRMWARE_CACHE_DIR, version)
    return send_from_directory(directory, filename, mimetype="application/octet-stream")


@asset_app.get("/healthz")
def asset_healthz():
    return jsonify({"ok": True})


def _serve(app: Flask, port: int, name: str) -> None:
    # Flask's own app.run() is a development-only server (it prints a
    # "WARNING: This is a development server" banner and isn't hardened for
    # untrusted or concurrent traffic). waitress is a small, pure-Python
    # production WSGI server with no extra system dependencies - a drop-in
    # replacement here since this add-on only serves a handful of local,
    # trusted clients (the browser tab and the OpenBK7231T devices
    # themselves fetching firmware).
    try:
        waitress_serve(app, host="0.0.0.0", port=port, threads=8)
    except OSError as exc:
        log.error(
            "Could not bind the %s server to port %s (%s). Something else on "
            "this Home Assistant host is already using that port. For the "
            "firmware server, change 'firmware_server_port' in the add-on's "
            "Configuration tab; for the web UI port, this is normally "
            "assigned automatically by the Supervisor - try restarting the "
            "add-on, and if it keeps happening please report it.",
            name,
            port,
            exc,
        )
        raise


def _run_ui_app():
    _serve(ui_app, settings.ingress_port, "web UI (ingress)")


def _run_asset_app():
    _serve(asset_app, settings.firmware_server_port, "firmware")


def main():
    os.makedirs(FIRMWARE_CACHE_DIR, exist_ok=True)
    log.info(
        "OpenBK7231T Manager starting - ingress port %s, firmware port %s",
        settings.ingress_port,
        settings.firmware_server_port,
    )
    threading.Thread(target=_background_loop, daemon=True).start()
    threading.Thread(target=_run_asset_app, daemon=True).start()
    _run_ui_app()


if __name__ == "__main__":
    main()
