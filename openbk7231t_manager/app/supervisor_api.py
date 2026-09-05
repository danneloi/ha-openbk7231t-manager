"""Small helper for talking to the Supervisor's own API (not the Home
Assistant Core API proxy that ha_notify.py uses).

Used at startup to discover the actual ingress port the Supervisor picked
for us. This add-on runs with `host_network: true` (needed so it can scan
the LAN and hand devices firmware files directly), which means a hardcoded
`ingress_port` in config.yaml binds directly on the Home Assistant host's
network stack and can collide with anything else already using that port.
The documented fix is `ingress_port: 0` in config.yaml, which tells the
Supervisor to pick a free port itself; the add-on then asks for it back via
GET http://supervisor/addons/self/info (requires `hassio_api: true`).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import requests

log = logging.getLogger("supervisor_api")

SUPERVISOR_API_BASE = os.environ.get("OBK_SUPERVISOR_API_BASE", "http://supervisor")


def _token() -> Optional[str]:
    return os.environ.get("SUPERVISOR_TOKEN")


def get_self_ingress_port(timeout: float = 10.0) -> Optional[int]:
    token = _token()
    if not token:
        log.info("SUPERVISOR_TOKEN not set - can't ask the Supervisor for our ingress port")
        return None

    url = f"{SUPERVISOR_API_BASE}/addons/self/info"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        body = resp.json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("Could not query %s: %s", url, exc)
        return None

    # The Supervisor API wraps responses as {"result": "ok", "data": {...}},
    # but be defensive in case that ever changes.
    data = body.get("data", body) if isinstance(body, dict) else {}
    port = data.get("ingress_port")
    if isinstance(port, int) and port > 0:
        return port
    log.warning("Supervisor response had no usable ingress_port: %r", body)
    return None
