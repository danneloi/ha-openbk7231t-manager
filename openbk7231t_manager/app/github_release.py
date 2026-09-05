"""Checks GitHub for the latest OpenBK7231T_App release and downloads the
correct OTA asset for a given chipset.

Asset naming was taken directly from the project's own release-notes
template (.releaserc.yaml in openshwprojects/OpenBK7231T_App): each release
tag (e.g. "1.18.309") ships one firmware file per supported chipset, and
only some chipsets have a network-OTA-capable ".rbl"/"*_OTA.*" asset at all
-- others (e.g. BK7231M) can only be reflashed over UART/SPI.
"""
from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional

import requests

log = logging.getLogger("github_release")

REPO = "openshwprojects/OpenBK7231T_App"
# Overridable via env var purely so integration tests can point this at a
# local mock server instead of the real GitHub API; unset in production.
GITHUB_API_BASE = os.environ.get("OBK_GITHUB_API_BASE", "https://api.github.com")
API_LATEST_RELEASE = f"{GITHUB_API_BASE}/repos/{REPO}/releases/latest"
RELEASES_HTML_URL = f"https://github.com/{REPO}/releases"
USER_AGENT = "openbk7231t-manager-homeassistant-addon"

# chipset (PLATFORM_MCU_NAME, as reported by /api/info) -> OTA asset filename
# template. Only chipsets that actually publish a network-OTA-capable asset
# are listed; everything else must be reflashed over UART/SPI.
OTA_ASSET_TEMPLATES: Dict[str, str] = {
    "BK7231T": "OpenBK7231T_{version}.rbl",
    "BK7231N": "OpenBK7231N_{version}.rbl",
    "BK7231U": "OpenBK7231U_{version}.rbl",
    "BK7236": "OpenBK7236_{version}.rbl",
    "BK7238": "OpenBK7238_{version}.rbl",
    "BK7239N": "OpenBK7239N_{version}.rbl",
    "BK7252": "OpenBK7252_{version}.rbl",
    "BK7252N": "OpenBK7252N_{version}.rbl",
    "XR806": "OpenXR806_{version}_ota.img",
    "XR872": "OpenXR872_{version}_ota.img",
    "BL602": "OpenBL602_{version}_OTA.bin.xz.ota",
    "W800": "OpenW800_{version}_ota.img",
    "W600": "OpenW600_{version}_gz.img",
    "LN882H": "OpenLN882H_{version}_OTA.bin",
    "RTL8710A": "OpenRTL8710A_{version}_ota.img",
    "RTL8710B": "OpenRTL8710B_{version}_ota.img",
    "RTL87X0C": "OpenRTL87X0C_{version}_ota.img",
    "RTL8720D": "OpenRTL8720D_{version}_ota.img",
    "RTL8721DA": "OpenRTL8721DA_{version}_ota.img",
    "RTL8720E": "OpenRTL8720E_{version}_ota.img",
    "ECR6600": "OpenECR6600_{version}_ota.img",
    "ESP32": "OpenESP32_{version}_4M.img",
    "ESP32S2": "OpenESP32S2_{version}_4M.img",
    "ESP32S3": "OpenESP32S3_{version}_4M.img",
    "ESP32C2": "OpenESP32C2_{version}_4M.img",
    "ESP32C3": "OpenESP32C3_{version}_4M.img",
    "ESP32C6": "OpenESP32C6_{version}_4M.img",
    "ESP8266": "OpenESP8266_{version}.img",
    "RDA5981": "OpenRDA5981_{version}_ota.img",
    "LN8825": "OpenLN8825_{version}_ota.img",
    "GD32VW553": "OpenGD32VW553_{version}_ota.img",
}

# Chipsets that OpenBK7231T_App builds but which have NO network-OTA asset
# at all today (UART/SPI reflash only) -- kept here just so the UI can show
# a clear, specific message instead of a generic "unsupported".
UART_ONLY_CHIPSETS = {"BK7231M", "XR809", "TR6260", "TXW81X", "ESP32C61"}


def ota_asset_filename(chipset: Optional[str], version: str) -> Optional[str]:
    if not chipset:
        return None
    template = OTA_ASSET_TEMPLATES.get(chipset.strip().upper())
    if not template:
        return None
    return template.format(version=version)


@dataclass
class ReleaseInfo:
    tag_name: str
    name: str
    html_url: str
    published_at: Optional[str]
    body: str
    assets: List[Dict]  # [{name, browser_download_url, size}]

    def asset_url(self, filename: str) -> Optional[str]:
        for asset in self.assets:
            if asset.get("name") == filename:
                return asset.get("browser_download_url")
        # Fall back to a case-insensitive match: the release-asset naming
        # scheme is reverse-engineered from the project's CI config, and a
        # future release could differ from our template only in casing.
        lowered = filename.lower()
        for asset in self.assets:
            if (asset.get("name") or "").lower() == lowered:
                return asset.get("browser_download_url")
        return None

    def to_dict(self) -> Dict:
        return {
            "tag_name": self.tag_name,
            "name": self.name,
            "html_url": self.html_url,
            "published_at": self.published_at,
            "body": self.body,
            "assets": self.assets,
        }

    @staticmethod
    def from_dict(d: Dict) -> "ReleaseInfo":
        return ReleaseInfo(
            tag_name=d["tag_name"],
            name=d.get("name", d["tag_name"]),
            html_url=d.get("html_url", RELEASES_HTML_URL),
            published_at=d.get("published_at"),
            body=d.get("body", ""),
            assets=d.get("assets", []),
        )


def fetch_latest_release(timeout: float = 10.0) -> ReleaseInfo:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    resp = requests.get(API_LATEST_RELEASE, headers=headers, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    assets = [
        {
            "name": a.get("name"),
            "browser_download_url": a.get("browser_download_url"),
            "size": a.get("size"),
        }
        for a in data.get("assets", [])
    ]
    return ReleaseInfo(
        tag_name=data["tag_name"].lstrip("v"),
        name=data.get("name") or data["tag_name"],
        html_url=data.get("html_url", RELEASES_HTML_URL),
        published_at=data.get("published_at"),
        body=data.get("body", "") or "",
        assets=assets,
    )


_download_lock = threading.Lock()


def ensure_firmware_cached(release: ReleaseInfo, chipset: str, cache_dir: str, timeout: float = 60.0) -> str:
    """Download (if not already cached) the OTA asset for `chipset` at this
    release's version. Returns the local file path. Raises on failure."""
    filename = ota_asset_filename(chipset, release.tag_name)
    if not filename:
        raise ValueError(f"Chipset '{chipset}' has no known network-OTA asset")

    url = release.asset_url(filename)
    if not url:
        raise ValueError(f"Release {release.tag_name} has no asset named '{filename}'")

    version_dir = os.path.join(cache_dir, release.tag_name)
    local_path = os.path.join(version_dir, filename)

    with _download_lock:
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            return local_path

        os.makedirs(version_dir, exist_ok=True)
        tmp_path = local_path + ".part"
        log.info("Downloading firmware %s -> %s", url, local_path)
        with requests.get(url, stream=True, timeout=timeout, headers={"User-Agent": USER_AGENT}) as resp:
            resp.raise_for_status()
            with open(tmp_path, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        fh.write(chunk)
        os.replace(tmp_path, local_path)
        return local_path
