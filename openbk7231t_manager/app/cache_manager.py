"""Housekeeping for the two on-disk caches that grow over time but are
never pruned by the code that creates them:

- FIRMWARE_CACHE_DIR/<release-tag>/<filename> - OpenBeken OTA firmware
  images downloaded for normal device updates (see github_release.py) and
  reused as the input for UF2 builds on the migration page.
- MIGRATE_UF2_CACHE_DIR/<board-name>/<filename>.uf2 - UF2 packages built
  for the ESPHome-migration page (see migrate_esphome.py).

Both directories live under the add-on's persistent /data volume, so
Home Assistant never clears them on its own; without this module they
would just keep growing release after release. This module lets the user
see what's cached, delete individual files, and auto-prune the oldest
files (by modification time - the files most recently downloaded/built
are always kept) once a configurable total size is exceeded.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Callable, List, Optional

FIRMWARE_KIND = "firmware"
UF2_KIND = "uf2"


@dataclass
class CacheEntry:
    id: str
    kind: str
    label: str
    filename: str
    size_bytes: int
    mtime: float


def _walk_kind(base_dir: str, kind: str, label_fn: Callable[[str, str], str]) -> List[CacheEntry]:
    entries: List[CacheEntry] = []
    if not os.path.isdir(base_dir):
        return entries
    for group_name in sorted(os.listdir(base_dir)):
        group_dir = os.path.join(base_dir, group_name)
        if not os.path.isdir(group_dir):
            continue
        for filename in sorted(os.listdir(group_dir)):
            file_path = os.path.join(group_dir, filename)
            if not os.path.isfile(file_path) or filename.endswith(".part"):
                continue
            try:
                stat = os.stat(file_path)
            except OSError:
                continue
            entries.append(CacheEntry(
                id=f"{kind}:{group_name}/{filename}",
                kind=kind,
                label=label_fn(group_name, filename),
                filename=filename,
                size_bytes=stat.st_size,
                mtime=stat.st_mtime,
            ))
    return entries


def list_entries(
    firmware_dir: str,
    uf2_dir: str,
    board_title_fn: Optional[Callable[[str], Optional[str]]] = None,
) -> List[CacheEntry]:
    """Everything currently cached, oldest first."""
    entries = _walk_kind(firmware_dir, FIRMWARE_KIND, lambda version, _filename: f"Release {version}")

    def _uf2_label(board_name: str, _filename: str) -> str:
        title = board_title_fn(board_name) if board_title_fn else None
        return title or board_name

    entries += _walk_kind(uf2_dir, UF2_KIND, _uf2_label)
    entries.sort(key=lambda e: e.mtime)
    return entries


def total_size(entries: List[CacheEntry]) -> int:
    return sum(e.size_bytes for e in entries)


def _resolve_safe(base_dir: str, rel_path: str) -> Optional[str]:
    if not rel_path or ".." in rel_path.replace("\\", "/").split("/"):
        return None
    abs_base = os.path.realpath(base_dir)
    candidate = os.path.realpath(os.path.join(base_dir, rel_path))
    if candidate != abs_base and not candidate.startswith(abs_base + os.sep):
        return None
    return candidate


def _entry_path(firmware_dir: str, uf2_dir: str, entry_id: str) -> Optional[str]:
    if ":" not in entry_id:
        return None
    kind, rel_path = entry_id.split(":", 1)
    if kind == FIRMWARE_KIND:
        return _resolve_safe(firmware_dir, rel_path)
    if kind == UF2_KIND:
        return _resolve_safe(uf2_dir, rel_path)
    return None


def delete_entry(firmware_dir: str, uf2_dir: str, entry_id: str) -> bool:
    path = _entry_path(firmware_dir, uf2_dir, entry_id)
    if not path or not os.path.isfile(path):
        return False
    os.remove(path)
    group_dir = os.path.dirname(path)
    try:
        if not os.listdir(group_dir):
            os.rmdir(group_dir)
    except OSError:
        pass
    return True


def cleanup_oldest(
    firmware_dir: str,
    uf2_dir: str,
    max_size_bytes: int,
    board_title_fn: Optional[Callable[[str], Optional[str]]] = None,
) -> List[CacheEntry]:
    """Delete the oldest cached files (by modification time) until the
    combined size of what's left is at or under `max_size_bytes`. Newer
    files are only touched if removing every older file still isn't
    enough. Returns the entries that were deleted."""
    entries = list_entries(firmware_dir, uf2_dir, board_title_fn=board_title_fn)  # oldest first
    current_total = total_size(entries)
    deleted: List[CacheEntry] = []
    for entry in entries:
        if current_total <= max_size_bytes:
            break
        if delete_entry(firmware_dir, uf2_dir, entry.id):
            deleted.append(entry)
            current_total -= entry.size_bytes
    return deleted
