"""Simple thread-safe JSON-file persistence for devices and add-on state.

No database dependency is needed for what is realistically a few dozen
devices at most, so plain JSON files under /data (the add-on's persistent
storage, provided by Home Assistant via the "data" map type) are enough.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

log = logging.getLogger("store")


class JsonStore:
    def __init__(self, path: str, default: Any):
        self._path = path
        self._lock = threading.RLock()
        self._data = default
        self._load(default)

    def _load(self, default: Any) -> None:
        with self._lock:
            if os.path.exists(self._path):
                try:
                    with open(self._path, "r", encoding="utf-8") as fh:
                        self._data = json.load(fh)
                    return
                except (json.JSONDecodeError, OSError) as exc:
                    log.warning("Could not read %s (%s), starting fresh", self._path, exc)
            self._data = json.loads(json.dumps(default))  # deep copy
            self._save_locked()

    def _save_locked(self) -> None:
        tmp_path = self._path + ".tmp"
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(self._data, fh, indent=2, ensure_ascii=False, sort_keys=True)
        os.replace(tmp_path, self._path)

    def get_all(self) -> Any:
        with self._lock:
            return json.loads(json.dumps(self._data))

    def replace_all(self, data: Any) -> None:
        with self._lock:
            self._data = data
            self._save_locked()

    def mutate(self, fn):
        """Run fn(data) under the lock, persist afterwards, return fn's result."""
        with self._lock:
            result = fn(self._data)
            self._save_locked()
            return result


class DeviceStore:
    """Devices keyed by an internal id (MAC address when known, else IP)."""

    def __init__(self, data_dir: str):
        self._store = JsonStore(os.path.join(data_dir, "devices.json"), {"devices": {}})

    @staticmethod
    def make_id(ip: str, mac: Optional[str]) -> str:
        if mac:
            return mac.lower().replace(":", "").replace("-", "")
        return f"ip-{ip}"

    def list(self) -> List[Dict]:
        data = self._store.get_all()
        return list(data.get("devices", {}).values())

    def get(self, device_id: str) -> Optional[Dict]:
        data = self._store.get_all()
        return data.get("devices", {}).get(device_id)

    def find_by_ip(self, ip: str) -> Optional[Dict]:
        for dev in self.list():
            if dev.get("ip") == ip:
                return dev
        return None

    def upsert(self, device: Dict) -> Dict:
        def _do(data):
            devices = data.setdefault("devices", {})
            dev_id = device.get("id")
            if not dev_id:
                dev_id = self.make_id(device["ip"], device.get("mac"))
                device["id"] = dev_id
            existing = devices.get(dev_id, {})
            merged = {**existing, **device}
            merged.setdefault("added_at", time.time())
            devices[dev_id] = merged
            return merged

        return self._store.mutate(_do)

    def update_fields(self, device_id: str, **fields) -> Optional[Dict]:
        def _do(data):
            devices = data.setdefault("devices", {})
            if device_id not in devices:
                return None
            devices[device_id].update(fields)
            return devices[device_id]

        return self._store.mutate(_do)

    def delete(self, device_id: str) -> bool:
        def _do(data):
            devices = data.setdefault("devices", {})
            if device_id in devices:
                del devices[device_id]
                return True
            return False

        return self._store.mutate(_do)


class NotificationStore:
    """Configured notification channels (Home Assistant/Telegram/WhatsApp),
    keyed by an internal id. Kept in their own JSON file rather than the
    add-on's options schema because each channel type needs a different,
    freely-editable set of fields (bot tokens, phone numbers, ...)."""

    def __init__(self, data_dir: str):
        self._store = JsonStore(os.path.join(data_dir, "notifications.json"), {"channels": {}})

    def list(self) -> List[Dict]:
        data = self._store.get_all()
        return list(data.get("channels", {}).values())

    def get(self, channel_id: str) -> Optional[Dict]:
        data = self._store.get_all()
        return data.get("channels", {}).get(channel_id)

    def upsert(self, channel: Dict) -> Dict:
        def _do(data):
            channels = data.setdefault("channels", {})
            ch_id = channel.get("id") or new_job_id()
            channel["id"] = ch_id
            existing = channels.get(ch_id, {})
            merged = {**existing, **channel}
            merged.setdefault("created_at", time.time())
            channels[ch_id] = merged
            return merged

        return self._store.mutate(_do)

    def update_fields(self, channel_id: str, **fields) -> Optional[Dict]:
        def _do(data):
            channels = data.setdefault("channels", {})
            if channel_id not in channels:
                return None
            channels[channel_id].update(fields)
            return channels[channel_id]

        return self._store.mutate(_do)

    def delete(self, channel_id: str) -> bool:
        def _do(data):
            channels = data.setdefault("channels", {})
            if channel_id in channels:
                del channels[channel_id]
                return True
            return False

        return self._store.mutate(_do)


class AppState:
    """Small key/value state store for release-check bookkeeping."""

    def __init__(self, data_dir: str):
        self._store = JsonStore(
            os.path.join(data_dir, "state.json"),
            {
                "last_release": None,
                "last_release_check": None,
                "last_notified_version": None,
                "settings_override": {},
            },
        )

    def get(self) -> Dict:
        return self._store.get_all()

    def set(self, **fields) -> Dict:
        def _do(data):
            data.update(fields)
            return data

        return self._store.mutate(_do)


def new_job_id() -> str:
    return uuid.uuid4().hex[:12]
