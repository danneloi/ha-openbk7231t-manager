"""Sends persistent notifications to Home Assistant Core via the Supervisor
API proxy (requires `homeassistant_api: true` in config.yaml, which exposes
http://supervisor/core/api and injects SUPERVISOR_TOKEN into the add-on's
environment automatically).

Safe to call even when SUPERVISOR_TOKEN isn't set (e.g. while testing the
add-on outside of Home Assistant) -- it just logs and returns False.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import requests

log = logging.getLogger("ha_notify")

CORE_API_BASE = os.environ.get("OBK_CORE_API_BASE", "http://supervisor/core/api")


def _token() -> Optional[str]:
    return os.environ.get("SUPERVISOR_TOKEN")


def create_persistent_notification(title: str, message: str, notification_id: str) -> bool:
    token = _token()
    if not token:
        log.info("SUPERVISOR_TOKEN not set - skipping HA notification: %s", title)
        return False

    url = f"{CORE_API_BASE}/services/persistent_notification/create"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"title": title, "message": message, "notification_id": notification_id}
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if resp.status_code >= 300:
            log.warning("HA notification failed: HTTP %s %s", resp.status_code, resp.text[:200])
            return False
        return True
    except requests.RequestException as exc:
        log.warning("HA notification failed: %s", exc)
        return False
