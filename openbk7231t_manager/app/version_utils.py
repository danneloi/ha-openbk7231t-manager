"""Helpers for parsing and comparing OpenBK7231T_App firmware version strings.

The device's /api/info endpoint returns a "build" field that looks like:
    "Built on Aug 20 2026 10:00:00 version 1.18.309"

GitHub release tags for the firmware are plain semver-ish strings such as
"1.18.309" (see openshwprojects/OpenBK7231T_App .releaserc.yaml, tagFormat:
"${version}"). This module extracts and compares those version strings.
"""
from __future__ import annotations

import re
from typing import Optional, Tuple

_VERSION_IN_BUILD_RE = re.compile(r"version\s+([0-9][0-9A-Za-z_.\-]*)", re.IGNORECASE)
_NUMERIC_RE = re.compile(r"\d+")


def extract_version_from_build_string(build_str: Optional[str]) -> Optional[str]:
    """Extract e.g. "1.18.309" out of the device's "build" info field."""
    if not build_str:
        return None
    m = _VERSION_IN_BUILD_RE.search(build_str)
    if not m:
        return None
    version = m.group(1).strip().rstrip(".")
    return version or None


def _version_key(version: str) -> Tuple[int, ...]:
    """Turn "1.18.309" into (1, 18, 309) for comparison purposes.

    Falls back gracefully on unexpected formats by extracting all numeric
    groups it can find; unparsable strings sort lowest so we never claim an
    update is available/missing based on garbage input.
    """
    if not version:
        return tuple()
    parts = _NUMERIC_RE.findall(version)
    return tuple(int(p) for p in parts) if parts else tuple()


def is_newer(candidate: Optional[str], current: Optional[str]) -> bool:
    """Return True if `candidate` version is strictly newer than `current`."""
    if not candidate:
        return False
    if not current:
        # We don't know the current version - be conservative, don't claim
        # an update is available just because we couldn't read the version.
        return False
    ck = _version_key(candidate)
    kk = _version_key(current)
    if not ck or not kk:
        return False
    return ck > kk


def versions_equal(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    return _version_key(a) == _version_key(b)
