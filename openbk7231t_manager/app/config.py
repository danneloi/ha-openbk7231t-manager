from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

OPTIONS_PATH = os.environ.get("OBK_OPTIONS_PATH", "/data/options.json")
DATA_DIR = os.environ.get("OBK_DATA_DIR", "/data")

DEFAULTS = {
    "scan_subnet": "",
    "poll_interval_minutes": 15,
    "release_check_interval_hours": 6,
    "notify_on_update": True,
    "firmware_server_port": 8098,
    "log_level": "info",
}


@dataclass
class Settings:
    scan_subnet: str
    poll_interval_minutes: int
    release_check_interval_hours: int
    notify_on_update: bool
    firmware_server_port: int
    log_level: str
    data_dir: str
    ingress_port: int = int(os.environ.get("OBK_INGRESS_PORT", "8099"))


def load_settings() -> Settings:
    values = dict(DEFAULTS)
    if os.path.exists(OPTIONS_PATH):
        try:
            with open(OPTIONS_PATH, "r", encoding="utf-8") as fh:
                values.update(json.load(fh))
        except (json.JSONDecodeError, OSError) as exc:
            logging.getLogger("config").warning("Could not read %s: %s", OPTIONS_PATH, exc)
    return Settings(
        scan_subnet=values.get("scan_subnet") or "",
        poll_interval_minutes=int(values.get("poll_interval_minutes", 15)),
        release_check_interval_hours=int(values.get("release_check_interval_hours", 6)),
        notify_on_update=bool(values.get("notify_on_update", True)),
        firmware_server_port=int(values.get("firmware_server_port", 8098)),
        log_level=str(values.get("log_level", "info")),
        data_dir=DATA_DIR,
    )
