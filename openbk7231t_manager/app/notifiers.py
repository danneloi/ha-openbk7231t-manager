"""Sends "new firmware available" notifications through a user-chosen
channel: a native Home Assistant notify service, a Telegram bot, or
WhatsApp via CallMeBot's free API.

Every channel type needs different one-time setup on the user's side. This
module intentionally asks for the bare minimum per type:

  Home Assistant ("ha")
    Just the name of an existing `notify.<service>` target, e.g.
    "mobile_app_pixel" or "persistent_notification" - nothing to create,
    Home Assistant already knows about every notify target it has.
      -> POST http://supervisor/core/api/services/notify/<service>
         body: {"title": ..., "message": ...}

  Telegram ("telegram")
    Needs a bot token and a chat id, both obtained once, outside of this
    add-on:
      1. Open a chat with @BotFather in Telegram, send "/newbot" and follow
         the prompts. BotFather replies with the bot token
         (looks like "123456789:AA...").
      2. Send any message to your new bot, then open
         https://api.telegram.org/bot<TOKEN>/getUpdates in a browser - the
         JSON reply contains "chat":{"id": ...}. That number is the chat id.
      -> POST https://api.telegram.org/bot<token>/sendMessage
         body: {"chat_id": ..., "text": ...}

  WhatsApp ("whatsapp"), via CallMeBot
    https://www.callmebot.com/blog/free-api-whatsapp-messages/ is the
    simplest free WhatsApp send-API that does not require a Meta
    Business/developer account. Needs a phone number and a personal API
    key, obtained once by the user:
      1. Save this number in your phone's contacts: +34 644 84 71 04
      2. Send it the WhatsApp message: "I allow callmebot to send me
         messages" (exact wording).
      3. Wait for CallMeBot to reply with your personal API key.
      -> GET https://api.callmebot.com/whatsapp.php
           ?phone=<number incl. country code>&text=<text>&apikey=<key>
"""
from __future__ import annotations

import logging
import os
from typing import Optional
from urllib.parse import quote

import requests

log = logging.getLogger("notifiers")

CORE_API_BASE = os.environ.get("OBK_CORE_API_BASE", "http://supervisor/core/api")
TELEGRAM_API_BASE = os.environ.get("OBK_TELEGRAM_API_BASE", "https://api.telegram.org")
CALLMEBOT_API_BASE = os.environ.get("OBK_CALLMEBOT_API_BASE", "https://api.callmebot.com")

CHANNEL_TYPES = ("ha", "telegram", "whatsapp")


def _supervisor_token() -> Optional[str]:
    return os.environ.get("SUPERVISOR_TOKEN")


def send_ha(service: str, title: str, message: str, timeout: float = 10.0):
    token = _supervisor_token()
    if not token:
        return False, "SUPERVISOR_TOKEN nicht gesetzt (läuft dieses Add-on gerade außerhalb von Home Assistant?)."
    service = (service or "").strip()
    if service.startswith("notify."):
        service = service[len("notify."):]
    if not service:
        return False, "Kein Home-Assistant-Notify-Ziel ausgewählt."
    url = f"{CORE_API_BASE}/services/notify/{service}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"title": title, "message": message}
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
        if resp.status_code >= 300:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, None
    except requests.RequestException as exc:
        return False, str(exc)


def send_telegram(bot_token: str, chat_id: str, message: str, timeout: float = 10.0):
    bot_token = (bot_token or "").strip()
    chat_id = (chat_id or "").strip()
    if not bot_token or not chat_id:
        return False, "Bot-Token oder Chat-ID fehlt."
    url = f"{TELEGRAM_API_BASE}/bot{bot_token}/sendMessage"
    try:
        resp = requests.post(url, json={"chat_id": chat_id, "text": message}, timeout=timeout)
        if resp.status_code >= 300:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        try:
            payload = resp.json()
        except ValueError:
            return True, None
        if isinstance(payload, dict) and not payload.get("ok", True):
            return False, str(payload.get("description") or payload)
        return True, None
    except requests.RequestException as exc:
        return False, str(exc)


def send_whatsapp(phone: str, apikey: str, message: str, timeout: float = 10.0):
    phone = (phone or "").strip().replace(" ", "").replace("+", "")
    apikey = (apikey or "").strip()
    if not phone or not apikey:
        return False, "Telefonnummer oder API-Key fehlt."
    url = (
        f"{CALLMEBOT_API_BASE}/whatsapp.php"
        f"?phone={quote(phone)}&text={quote(message)}&apikey={quote(apikey)}"
    )
    try:
        resp = requests.get(url, timeout=timeout)
        if resp.status_code >= 300:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, None
    except requests.RequestException as exc:
        return False, str(exc)


def send(channel: dict, title: str, message: str):
    """Dispatch to the right sender based on channel['type']."""
    ch_type = channel.get("type")
    cfg = channel.get("config") or {}
    if ch_type == "ha":
        return send_ha(cfg.get("service", ""), title, message)
    if ch_type == "telegram":
        return send_telegram(cfg.get("bot_token", ""), cfg.get("chat_id", ""), f"{title}\n\n{message}")
    if ch_type == "whatsapp":
        return send_whatsapp(cfg.get("phone", ""), cfg.get("apikey", ""), f"{title}\n\n{message}")
    return False, f"Unbekannter Kanaltyp: {ch_type}"


def list_ha_notify_services(timeout: float = 10.0):
    """Query HA Core's /services for the 'notify' domain, so the UI can
    offer a dropdown instead of asking the user to type a service name."""
    token = _supervisor_token()
    if not token:
        return []
    url = f"{CORE_API_BASE}/services"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        body = resp.json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("Could not list Home Assistant notify services: %s", exc)
        return []
    if not isinstance(body, list):
        return []
    for domain_block in body:
        if isinstance(domain_block, dict) and domain_block.get("domain") == "notify":
            services = domain_block.get("services") or {}
            return sorted(services.keys())
    return []
