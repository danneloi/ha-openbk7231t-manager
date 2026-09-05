"""Discovery of OpenBK7231T_App devices on the local network.

Two complementary strategies are used:

1. SSDP (UPnP) multicast M-SEARCH. OpenBK7231T_App devices can optionally
   run the built-in "SSDP" driver (src/driver/drv_ssdp.c) which answers
   M-SEARCH requests on 239.255.255.250:1900 with "SERVER: OpenBk" and a
   LOCATION header pointing at http://<ip>:80/ssdp.xml. This is fast and
   works across routed multicast, but only finds devices that have that
   driver started (it is not guaranteed to be enabled on every device).

2. A concurrent TCP sweep of /api/info across a subnet. This is slower but
   works for every device regardless of which drivers are enabled, as long
   as we're scanning the right /24. It is the reliable fallback.

Both feed into obk_client.get_info() so a discovered IP is always verified
to actually be an OpenBK7231T_App device before being reported.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional

from obk_client import DeviceInfo, get_info

log = logging.getLogger("discovery")

SSDP_ADDR = "239.255.255.250"
SSDP_PORT = 1900
SSDP_MSEARCH = (
    "M-SEARCH * HTTP/1.1\r\n"
    "HOST: 239.255.255.250:1900\r\n"
    'MAN: "ssdp:discover"\r\n'
    "MX: 2\r\n"
    "ST: upnp:rootdevice\r\n"
    "\r\n"
)
_LOCATION_RE = re.compile(r"LOCATION:\s*http://([0-9.]+):\d+", re.IGNORECASE)


def get_local_ip() -> Optional[str]:
    """Best-effort local outbound IP address (no packets are actually sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("198.51.100.1", 80))  # TEST-NET-2, RFC 5737 - never routed
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def local_ip_for(target_ip: str) -> Optional[str]:
    """Best-effort local IP address that would be used to reach `target_ip`.

    Used so the firmware-download URL we hand to a device always advertises
    the correct interface address, even on multi-homed Home Assistant hosts.
    No packet is actually sent for a UDP "connect".
    """
    # Devices are normally addressed by bare IP, but tests/tools may pass
    # "host:port" - strip that back down to a connectable hostname.
    host = target_ip.rsplit(":", 1)[0] if target_ip.count(":") == 1 else target_ip
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((host, 80))
        return s.getsockname()[0]
    except OSError:
        return get_local_ip()
    finally:
        s.close()


def guess_local_subnet() -> Optional[str]:
    ip = get_local_ip()
    if not ip:
        return None
    return str(ipaddress.ip_network(f"{ip}/24", strict=False))


def ssdp_discover(timeout: float = 2.5) -> List[str]:
    """Return a list of candidate IPs that answered an SSDP M-SEARCH.

    Any UPnP rootdevice reply is collected here (not just ones claiming to
    be "OpenBk") because some users' devices may not send a SERVER header
    exactly matching, and the candidate is verified via /api/info anyway.
    """
    found: Dict[str, None] = {}
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.settimeout(timeout)
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.sendto(SSDP_MSEARCH.encode("utf-8"), (SSDP_ADDR, SSDP_PORT))
        end = time.time() + timeout
        while time.time() < end:
            try:
                data, addr = sock.recvfrom(2048)
            except socket.timeout:
                break
            except OSError:
                break
            text = data.decode("utf-8", errors="ignore")
            m = _LOCATION_RE.search(text)
            ip = m.group(1) if m else addr[0]
            found[ip] = None
    except OSError as exc:
        log.info("SSDP discovery unavailable: %s", exc)
    finally:
        sock.close()
    return list(found.keys())


def scan_subnet(subnet_cidr: str, password_lookup=None, max_workers: int = 64, timeout: float = 1.5) -> List[DeviceInfo]:
    """Concurrently probe every host in `subnet_cidr` for /api/info.

    `password_lookup(ip) -> Optional[str]` may be supplied so previously
    known devices that require a password can still be re-verified during a
    scan; unknown devices are probed without a password.
    """
    network = ipaddress.ip_network(subnet_cidr, strict=False)
    hosts = list(network.hosts())
    if len(hosts) > 4094:
        raise ValueError("Subnet too large to scan (max /20)")

    results: List[DeviceInfo] = []

    def _probe(ip_obj) -> Optional[DeviceInfo]:
        ip = str(ip_obj)
        pw = password_lookup(ip) if password_lookup else None
        return get_info(ip, password=pw, timeout=timeout)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_probe, h): h for h in hosts}
        for fut in as_completed(futures):
            try:
                info = fut.result()
            except Exception as exc:  # pragma: no cover - defensive
                log.debug("Probe failed: %s", exc)
                info = None
            if info:
                results.append(info)
    return results


def discover(subnet_cidr: Optional[str], password_lookup=None, ssdp_timeout: float = 2.5, scan_timeout: float = 1.5) -> List[DeviceInfo]:
    """Combined discovery: fast SSDP pass first, then a full subnet sweep.

    Devices found only via SSDP but outside the configured/guessed subnet
    are still included (we verify+fetch their info directly by IP).
    """
    subnet = subnet_cidr or guess_local_subnet()
    found_by_ip: Dict[str, DeviceInfo] = {}

    for ip in ssdp_discover(timeout=ssdp_timeout):
        pw = password_lookup(ip) if password_lookup else None
        info = get_info(ip, password=pw, timeout=scan_timeout)
        if info:
            found_by_ip[ip] = info

    if subnet:
        try:
            for info in scan_subnet(subnet, password_lookup=password_lookup, timeout=scan_timeout):
                found_by_ip[info.ip] = info
        except ValueError as exc:
            log.warning("Skipping subnet sweep: %s", exc)

    return list(found_by_ip.values())
