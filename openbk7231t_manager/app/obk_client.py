"""HTTP client for talking to a single OpenBK7231T_App device.

Protocol reference (verified against the openshwprojects/OpenBK7231T_App
source, src/httpserver/rest_interface.c and src/httpserver/http_basic_auth.c):

  GET  http://<ip>/api/info
      -> JSON: {uptime_s, build, ip, mac, flags, mqtthost, mqtttopic,
                 chipset, webapp, shortName, startcmd, supportsSSDP,
                 supportsClientDeviceDB}
      "build" looks like "Built on <date> <time> version <X.Y.Z>".
      "chipset" is the PLATFORM_MCU_NAME, e.g. "BK7231T".

  POST http://<ip>/api/cmnd            body: raw console command text
      -> JSON: {"success":200,"msg":"...","res":...} or {"error":<code>,...}
      Used here to run "ota_http <url>" which asynchronously makes the
      device download a firmware file over plain HTTP and flash it,
      rebooting automatically when done. IMPORTANT: this endpoint maps the
      console command's internal result code to the HTTP status (200 on
      CMD_RES_OK, 501 on unknown command, 400 for everything else -
      rest_interface.c http_rest_post_cmd()). On real hardware this mapping
      has proven unreliable across firmware versions/commands (observed:
      HTTP 400 for a plain "Status 0" query even though the command itself
      is a harmless no-op stub that always succeeds) - so this client does
      not trust it as the sole signal for read-only status queries, and
      retries once via /cm (below) for OTA triggers before giving up.

  GET  http://<ip>/cm?cmnd=<command>   (also accepts POST/PUT with the same
                                         "cmnd" field in the body)
      -> JSON: the raw JSON reply for that command, UNWRAPPED (no
         "success"/"res" envelope), always with HTTP 200 regardless of
         whether the console command itself succeeded (http_fns.c
         http_fn_cm() never inspects CMD_ExecuteCommand()'s result code).
      This is the actual Tasmota-compatible endpoint the firmware's own
      source comments use for testing Status queries (e.g. "Test command:
      http://192.168.0.159/cm?cmnd=STATUS%208"), and is what this client
      uses for reading sensor/status data - it sidesteps the /api/cmnd
      status-code quirk entirely for a plain read.

  POST http://<ip>/api/ota            body: raw firmware file bytes
      -> HTTP 200 once the device has received and flashed the file.
      This is the endpoint the firmware's own built-in "Web Application"
      page uses for its drag-and-drop update feature (see the inline JS in
      src/httpserver/http_fns.c: fetch('/api/ota',{method:'POST',body:f}))
      and what the official BK7231GUIFlashTool desktop tool uses. Unlike
      "ota_http <url>" (below), the device never has to parse a URL at all
      here - the caller pushes the bytes directly - so it sidesteps a real,
      confirmed bug on at least RTL87X0C ("Realtek Ameba") firmware builds
      where the built-in URL-parsing helper used by ota_http corrupts the
      target host's IP address (observed via packet capture: given the
      correct URL for a host such as 192.168.42.50, the device ARPed for
      192.168.42.42 instead - the third octet got duplicated into the last
      one, dropping the real last octet entirely - and consequently never
      even attempted a connection to the real target). This makes /api/ota
      the preferred,
      primary way this client triggers an update; ota_http is kept only as
      a fallback for the rare device where /api/ota itself doesn't work.
      The device does not necessarily reboot on its own after flashing (the
      reference GUI tool always follows up with an explicit POST
      /api/reboot; this client does the same).

  POST http://<ip>/api/reboot          body: (none)
      -> Reboots the device. Used after a successful /api/ota push.

  HTTP Basic Auth: username is always "admin", password is whatever the
  device's web admin password is configured to (empty by default -> no
  auth required at all). Applies to every endpoint above.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import requests

log = logging.getLogger("obk_client")

DEFAULT_TIMEOUT = 4.0


@dataclass
class DeviceInfo:
    ip: str
    uptime_s: Optional[int] = None
    build: Optional[str] = None
    mac: Optional[str] = None
    chipset: Optional[str] = None
    short_name: Optional[str] = None
    mqtt_host: Optional[str] = None
    supports_ssdp: Optional[bool] = None
    raw: Optional[dict] = None


def _auth(password: Optional[str]):
    if password:
        return ("admin", password)
    return None


def get_info(ip: str, password: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT) -> Optional[DeviceInfo]:
    """Fetch /api/info from a device. Returns None if unreachable or not an OBK device."""
    url = f"http://{ip}/api/info"
    try:
        resp = requests.get(url, auth=_auth(password), timeout=timeout)
    except requests.RequestException:
        return None
    if resp.status_code == 401:
        log.info("Device %s requires a password we don't have (or the wrong one)", ip)
        return None
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None
    # Sanity check: this must actually look like an OpenBK7231T_App device.
    if "chipset" not in data or "build" not in data:
        return None
    return DeviceInfo(
        ip=ip,
        uptime_s=data.get("uptime_s"),
        build=data.get("build"),
        mac=data.get("mac"),
        chipset=data.get("chipset"),
        short_name=data.get("shortName"),
        mqtt_host=data.get("mqtthost"),
        supports_ssdp=bool(data.get("supportsSSDP")),
        raw=data,
    )


def send_command(ip: str, command: str, password: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """POST a console command to the device's /api/cmnd endpoint.

    Returns a dict: {"ok": bool, "status_code": int|None, "body": dict|str|None, "error": str|None}
    """
    url = f"http://{ip}/api/cmnd"
    try:
        resp = requests.post(url, data=command, auth=_auth(password), timeout=timeout)
    except requests.RequestException as exc:
        return {"ok": False, "status_code": None, "body": None, "error": str(exc)}

    body: object
    try:
        body = resp.json()
    except ValueError:
        body = resp.text

    ok = resp.status_code == 200
    return {"ok": ok, "status_code": resp.status_code, "body": body, "error": None if ok else f"HTTP {resp.status_code}"}


def send_command_cm(ip: str, command: str, password: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Run a console command via the Tasmota-compatible GET /cm endpoint.

    Unlike POST /api/cmnd, this endpoint always answers HTTP 200 (as long as
    the device responds at all) - the firmware never maps the console
    command's internal result code to an HTTP status here. That makes it
    the right choice for read-only status queries, and a useful fallback
    for commands that /api/cmnd rejects for reasons unrelated to whether
    the command itself is valid.

    Returns the same shape as send_command(): {"ok", "status_code", "body", "error"}.
    """
    url = f"http://{ip}/cm"
    try:
        resp = requests.get(url, params={"cmnd": command}, auth=_auth(password), timeout=timeout)
    except requests.RequestException as exc:
        return {"ok": False, "status_code": None, "body": None, "error": str(exc)}

    body: object
    try:
        body = resp.json()
    except ValueError:
        body = resp.text

    ok = resp.status_code == 200
    return {"ok": ok, "status_code": resp.status_code, "body": body, "error": None if ok else f"HTTP {resp.status_code}"}


def trigger_ota_http(ip: str, firmware_url: str, password: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Ask the device to download+flash a firmware file from `firmware_url`.

    This maps directly to the device's built-in `ota_http <url>` console
    command. The call returns as soon as the device *accepts* the request;
    the actual download/flash/reboot happens asynchronously on the device.

    Tries POST /api/cmnd first (it gives a real success/failure signal via
    HTTP status + a "msg" field). Some real-world firmware builds have been
    observed to answer even this harmless, always-valid command with an
    unexpected HTTP 400 (the same status-code-mapping quirk documented on
    send_command()/send_command_cm() above) - if that happens, retry once
    via GET /cm, which reliably reaches the same console command handler.
    """
    command = f"ota_http {firmware_url}"
    result = send_command(ip, command, password=password, timeout=timeout)
    if result["ok"]:
        return result

    log.warning(
        "POST /api/cmnd rejected 'ota_http' for %s (%s) - retrying via GET /cm",
        ip,
        result.get("error"),
    )
    fallback = send_command_cm(ip, command, password=password, timeout=timeout)
    if fallback["ok"]:
        return fallback
    # Neither worked - surface the original (more informative) error.
    return result


def push_ota(ip: str, firmware_bytes: bytes, password: Optional[str] = None, timeout: float = 120.0) -> dict:
    """Upload firmware bytes directly to the device's /api/ota endpoint.

    This is the same mechanism the firmware's own "Web Application" OTA
    page and the official BK7231GUIFlashTool use for drag-and-drop updates:
    the caller pushes the file; the device streams it straight to flash as
    the POST body arrives (see hal_ota_*.c http_rest_post_flash()) and
    never has to parse a URL itself. Prefer this over trigger_ota_http()
    for exactly that reason. Needs a generous timeout - the device is
    writing to flash as bytes arrive, which is far slower than a normal
    HTTP request.
    """
    url = f"http://{ip}/api/ota"
    try:
        resp = requests.post(
            url,
            data=firmware_bytes,
            headers={"Content-Type": "application/octet-stream"},
            auth=_auth(password),
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return {"ok": False, "status_code": None, "error": str(exc)}
    ok = resp.status_code == 200
    return {"ok": ok, "status_code": resp.status_code, "error": None if ok else f"HTTP {resp.status_code}"}


def reboot(ip: str, password: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT) -> dict:
    url = f"http://{ip}/api/reboot"
    try:
        resp = requests.post(url, auth=_auth(password), timeout=timeout)
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": resp.status_code == 200, "status_code": resp.status_code}


# ---------------------------------------------------------------------------
# Sensor / status detail (device detail view)
# ---------------------------------------------------------------------------
#
# OpenBK7231T_App implements a Tasmota-compatible "Status" console command
# (src/httpserver/json_interface.c). Sending "Status 0" (no sub-number, or
# 0) runs http_tasmota_json_status_generic(), which prints every status
# section - including StatusSNS (sensors: power-monitoring ENERGY block,
# temperature/humidity) and StatusSTS (Uptime, Heap, and a nested Wifi
# object with RSSI) - combined in a single reply, so one HTTP round trip
# is enough instead of querying "Status 8"/"Status 11" separately.
#
# Fields are NOT guaranteed to be present:
#   - The ENERGY block only appears on chipsets wired to a power-monitoring
#     chip (BL0937/BL0942/HLW8112/...); DRV_IsMeasuringPower() gates it.
#   - Temperature/Humidity are only present for boards with that driver
#     enabled, and live under a driver-specific key (ESP32/SHT3X/DS18B20/
#     CHT83XX/DHT/SGP) rather than a single fixed field name.
#   - RSSI/Signal/SSId live nested under StatusSTS.Wifi, not top-level.

_TEMP_HUMIDITY_DRIVER_KEYS = ("ESP32", "SHT3X", "DS18B20", "CHT83XX", "DHT", "SGP")

# (source JSON key(s), our output key, human label, unit or None)
_ENERGY_FIELDS = [
    ("Power", "power", "Power", "W"),
    ("ApparentPower", "apparent_power", "Apparent Power", "VA"),
    ("ReactivePower", "reactive_power", "Reactive Power", "VAr"),
    ("Factor", "power_factor", "Power Factor", None),
    ("Voltage", "voltage", "Voltage", "V"),
    ("Current", "current", "Current", "A"),
    ("Frequency", "frequency", "Frequency", "Hz"),
    ("ConsumptionTotal", "energy_total", "Energy Total", "kWh"),
    ("Total", "energy_total", "Energy Total", "kWh"),  # older/alt field name
    ("ConsumptionLastHour", "energy_last_hour", "Energy Last Hour", "Wh"),
    ("Yesterday", "energy_yesterday", "Energy Yesterday", "kWh"),
]

# Groups sensor output keys into the categories the UI shows the sensor
# detail popup subdivided into (WLAN-Verbindung / Verbrauch / Diagnose /
# Umgebung). Frontend translation strings for these live in app.js; any key
# not listed here falls back to an "other" bucket there.
_SENSOR_CATEGORIES = {
    "rssi": "wifi",
    "signal": "wifi",
    "ssid": "wifi",
    "uptime": "diagnostics",
    "uptime_sec": "diagnostics",
    "heap": "diagnostics",
    "power": "power",
    "apparent_power": "power",
    "reactive_power": "power",
    "power_factor": "power",
    "voltage": "power",
    "current": "power",
    "frequency": "power",
    "energy_total": "power",
    "energy_last_hour": "power",
    "energy_yesterday": "power",
    "temperature": "environment",
    "humidity": "environment",
    "co2": "environment",
    "tvoc": "environment",
}


def _sensor_category(out_key: str) -> str:
    return _SENSOR_CATEGORIES.get(out_key, "other")


def get_sensor_status(ip: str, password: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Fetch and flatten the device's combined Tasmota-style status report.

    Returns {"ok": bool, "error": str|None, "sensors": {key: {label, value,
    unit}}}. `sensors` only contains keys the device actually reported.
    """
    result = send_command_cm(ip, "Status 0", password=password, timeout=timeout)
    if not result["ok"]:
        return {"ok": False, "error": result.get("error") or "Gerät nicht erreichbar.", "sensors": {}}
    body = result.get("body")
    if not isinstance(body, dict):
        return {"ok": False, "error": "Unerwartete Antwort vom Gerät.", "sensors": {}}

    sns = body.get("StatusSNS") or {}
    sts = body.get("StatusSTS") or {}
    energy = sns.get("ENERGY") or {}
    sensors: dict = {}

    wifi = sts.get("Wifi") or {}
    if "RSSI" in wifi:
        sensors["rssi"] = {"label": "RSSI", "value": wifi.get("RSSI"), "unit": "%"}
    if "Signal" in wifi:
        sensors["signal"] = {"label": "WLAN-Signal", "value": wifi.get("Signal"), "unit": "dBm"}
    if "SSId" in wifi:
        sensors["ssid"] = {"label": "SSID", "value": wifi.get("SSId"), "unit": None}

    if "Uptime" in sts:
        sensors["uptime"] = {"label": "Uptime", "value": sts.get("Uptime"), "unit": None}
    if "UptimeSec" in sts:
        sensors["uptime_sec"] = {"label": "Uptime (Sekunden)", "value": sts.get("UptimeSec"), "unit": "s"}
    if "Heap" in sts:
        sensors["heap"] = {"label": "Freier Speicher", "value": sts.get("Heap"), "unit": "kB"}

    for src_key, out_key, label, unit in _ENERGY_FIELDS:
        if src_key in energy and out_key not in sensors:
            sensors[out_key] = {"label": label, "value": energy.get(src_key), "unit": unit}

    for driver in _TEMP_HUMIDITY_DRIVER_KEYS:
        block = sns.get(driver)
        if not isinstance(block, dict):
            continue
        if "Temperature" in block and "temperature" not in sensors:
            sensors["temperature"] = {"label": "Temperature", "value": block.get("Temperature"), "unit": "°C"}
        if "Humidity" in block and "humidity" not in sensors:
            sensors["humidity"] = {"label": "Humidity", "value": block.get("Humidity"), "unit": "%"}
        if "CO2" in block and "co2" not in sensors:
            sensors["co2"] = {"label": "CO2", "value": block.get("CO2"), "unit": "ppm"}
        if "Tvoc" in block and "tvoc" not in sensors:
            sensors["tvoc"] = {"label": "TVOC", "value": block.get("Tvoc"), "unit": "ppb"}

    for out_key, entry in sensors.items():
        entry["category"] = _sensor_category(out_key)
        entry["custom"] = False

    return {"ok": True, "error": None, "sensors": sensors}
