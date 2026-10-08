(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const deviceRows = $("#device-rows");
  const releaseBadge = $("#release-badge");
  const bannerUpdate = $("#banner-update");
  const bannerUpdateText = $("#banner-update-text");

  function apiUrl(path) {
    // Relative to the current page URL so this keeps working behind Home
    // Assistant's ingress reverse-proxy sub-path.
    return path.replace(/^\//, "");
  }

  async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(apiUrl(path), opts);
    let data = null;
    try { data = await resp.json(); } catch (e) { /* no body */ }
    if (!resp.ok) {
      const message = (data && data.error) || `HTTP ${resp.status}`;
      throw new Error(message);
    }
    return data;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Very small, safe subset-of-Markdown renderer for GitHub release notes:
  // everything is HTML-escaped first, then only a handful of common
  // Markdown constructs (headings, bold/italic, inline code, links, bullet
  // lists, paragraphs) are turned into HTML - good enough for release notes
  // without pulling in a full Markdown library.
  function renderMarkdownLite(md) {
    if (!md) return "";
    const lines = escapeHtml(md).replace(/\r\n?/g, "\n").split("\n");
    const htmlParts = [];
    let listOpen = false;
    let paraLines = [];

    function inline(s) {
      return s
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }
    function flushPara() {
      if (paraLines.length) {
        htmlParts.push(`<p>${inline(paraLines.join(" "))}</p>`);
        paraLines = [];
      }
    }
    function closeList() {
      if (listOpen) {
        htmlParts.push("</ul>");
        listOpen = false;
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (!line) {
        flushPara();
        closeList();
      } else if (heading) {
        flushPara();
        closeList();
        const tag = heading[1].length <= 2 ? "h3" : "h4";
        htmlParts.push(`<${tag}>${inline(heading[2])}</${tag}>`);
      } else if (bullet) {
        flushPara();
        if (!listOpen) { htmlParts.push("<ul>"); listOpen = true; }
        htmlParts.push(`<li>${inline(bullet[1])}</li>`);
      } else {
        closeList();
        paraLines.push(line);
      }
    }
    flushPara();
    closeList();
    return htmlParts.join("");
  }

  // --- Internationalization ---------------------------------------------
  //
  // A lightweight dictionary-based i18n layer. Static markup is translated
  // via [data-i18n]/[data-i18n-placeholder]/[data-i18n-title] attributes;
  // everything rendered dynamically from JS calls t(key, vars) directly.
  // The chosen language is remembered in localStorage and re-applied (incl.
  // re-rendering already-loaded device/settings/sensor data) on change.

  const LANG_KEY = "obk_lang";
  const SUPPORTED_LANGS = ["de", "en", "en-US", "bg", "hr", "cs", "da", "nl", "et", "fi", "fr", "el", "hu", "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv"];
  const DEFAULT_LANG = "de";

  // Date-formatting locale per UI language - "en" uses a day/month order
  // closer to the German convention this add-on originally shipped with,
  // "en-US" gets the month/day order Americans actually expect.
  const DATE_LOCALES = { de: "de-DE", en: "en-GB", "en-US": "en-US", bg: "bg-BG", hr: "hr-HR", cs: "cs-CZ", da: "da-DK", nl: "nl-NL", et: "et-EE", fi: "fi-FI", fr: "fr-FR", el: "el-GR", hu: "hu-HU", ga: "ga-IE", it: "it-IT", lv: "lv-LV", lt: "lt-LT", mt: "mt-MT", pl: "pl-PL", pt: "pt-PT", ro: "ro-RO", sk: "sk-SK", sl: "sl-SI", es: "es-ES", sv: "sv-SE" };

  const I18N = {
    de: {
      checkRelease: "Auf Updates prüfen",
      themeToggle: "Hell/Dunkel umschalten",
      updateAll: "Alle aktualisieren",
      devicesHeader: "Geräte",
      scanNetwork: "Netzwerk scannen",
      addDevice: "Gerät hinzufügen",
      addIpPlaceholder: "IP-Adresse (z. B. 192.168.1.50)",
      addNamePlaceholder: "Name (optional)",
      addPasswordPlaceholder: "Admin-Passwort (falls gesetzt)",
      add: "Hinzufügen",
      cancel: "Abbrechen",
      colName: "Name", colIp: "IP", colChipset: "Chipsatz", colVersion: "Version", colStatus: "Status", colActions: "Aktionen",
      loadingDevices: "Lade Geräte…",
      emptyDevices: "Noch keine Geräte hinzugefügt. Scanne das Netzwerk oder füge eines manuell hinzu.",
      scanResultsHeader: "Scan-Ergebnisse",
      close: "Schließen",
      notificationsHeader: "Benachrichtigungen",
      notificationsIntro: "Lege fest, wie du benachrichtigt werden möchtest, wenn eine neue OpenBK7231T_App-Firmware erscheint. Du kannst mehrere Kanäle gleichzeitig einrichten. Ist kein Kanal aktiv, verwendet das Add-on stattdessen eine normale Home-Assistant-Benachrichtigung.",
      addChannel: "Kanal hinzufügen",
      chooseChannelType: "Kanaltyp auswählen:",
      settingsHeader: "Einstellungen",
      statusUpdating: "Wird aktualisiert…",
      statusFailed: "Fehlgeschlagen",
      statusTimeout: "Zeitüberschreitung",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "nur UART/SPI-Flash möglich",
      unknownVersion: "unbekannt",
      newVersionPrefix: "neu: ",
      updateTitleUartOnly: "Dieser Chipsatz unterstützt kein Netzwerk-Update (nur UART/SPI-Flash).",
      updateTitleUpdating: "Update läuft bereits.",
      updateTitleNoUpdateKnown: "Aktuell keine neuere Version bekannt - klicke trotzdem, um die Firmware erneut zu übertragen.",
      refreshTitle: "Werte neu abfragen",
      updateBtnLabel: "Firmware-Update",
      deleteTitle: "Gerät entfernen",
      openDeviceTitle: "Gerät im Browser öffnen",
      confirmUpdateAll: "Alle Geräte mit verfügbarem Update jetzt aktualisieren?",
      confirmUpdateDevice: "Firmware-Update jetzt starten? Das Gerät startet danach neu.",
      confirmUpdateDeviceNoUpdate: "Aktuell ist keine neuere Version bekannt. Firmware trotzdem neu übertragen?",
      confirmDelete: "Dieses Gerät aus der Liste entfernen?",
      confirmDeleteChannel: "Diesen Benachrichtigungskanal entfernen?",
      alertDeviceOffline: "Gerät \"{name}\" antwortet nicht (offline oder falsches Passwort).",
      alertActionFailed: "Aktion fehlgeschlagen: {msg}",
      alertRenameFailed: "Umbenennen fehlgeschlagen: {msg}",
      alertCheckFailed: "Prüfung fehlgeschlagen: {msg}",
      alertUpdateAllFailed: "Update fehlgeschlagen: {msg}",
      alertNoUpdatesFound: "Keine Geräte mit verfügbarem Update gefunden.",
      alertUpdatesStarted: "{count} Update(s) gestartet.\n{skippedCount} übersprungen:\n{details}",
      alertUpdateFailedDetail: "Update fehlgeschlagen:\n\n{detail}",
      alertUpdateFailedGeneric: "Das Update ist fehlgeschlagen oder in eine Zeitüberschreitung gelaufen. Genauere Angaben liegen nicht vor.",
      alertAddFailed: "Hinzufügen fehlgeschlagen: {msg}",
      alertScanFailed: "Scan fehlgeschlagen: {msg}",
      alertSaveFailed: "Speichern fehlgeschlagen: {msg}",
      alertDeleteChannelFailed: "Entfernen fehlgeschlagen: {msg}",
      alertCreateChannelFailed: "Anlegen fehlgeschlagen: {msg}",
      alertSensorLabelSaveFailed: "Umbenennen des Sensors fehlgeschlagen: {msg}",
      bannerUpdateText: "Neue Firmware verfügbar für {count} Gerät(e).",
      scanningStatus: "Scanne Netzwerk… dies kann bis zu 20 Sekunden dauern.",
      scanResultStatus: "Subnetz: {subnet} – {count} Gerät(e) gefunden.",
      subnetUnknown: "unbekannt",
      alreadyAdded: "bereits hinzugefügt",
      addBtn: "Hinzufügen",
      noDevicesFoundScan: "Keine Geräte gefunden.",
      settingsScanSubnet: "Scan-Subnetz",
      settingsAuto: "automatisch",
      settingsPollInterval: "Abfrageintervall",
      settingsMinutesUnit: "Min.",
      settingsReleaseCheckInterval: "Release-Prüfintervall",
      settingsHoursUnit: "Std.",
      settingsNotifications: "Benachrichtigungen",
      settingsEnabled: "aktiviert",
      settingsDisabled: "deaktiviert",
      settingsFirmwarePort: "Firmware-Server-Port",
      sensorLoading: "Lade Sensordaten…",
      sensorNoData: "Dieses Gerät meldet keine Sensordaten (z. B. keine Energiemessung/Temperaturfühler verbaut).",
      sensorLoadError: "Sensordaten konnten nicht geladen werden: {msg}",
      renameSensorPrompt: "Neuer Anzeigename für diesen Sensor (leer lassen, um zurückzusetzen):",
      category_wifi: "WLAN-Verbindung",
      category_power: "Verbrauch",
      category_diagnostics: "Diagnose",
      category_environment: "Umgebung",
      category_other: "Sonstiges",
      sensor_rssi: "RSSI",
      sensor_signal: "WLAN-Signal",
      sensor_ssid: "SSID",
      sensor_uptime: "Uptime",
      sensor_uptime_sec: "Uptime (Sekunden)",
      sensor_heap: "Freier Speicher",
      sensor_power: "Leistung",
      sensor_apparent_power: "Scheinleistung",
      sensor_reactive_power: "Blindleistung",
      sensor_power_factor: "Leistungsfaktor",
      sensor_voltage: "Spannung",
      sensor_current: "Strom",
      sensor_frequency: "Frequenz",
      sensor_energy_total: "Energie gesamt",
      sensor_energy_last_hour: "Energie letzte Stunde",
      sensor_energy_yesterday: "Energie gestern",
      sensor_temperature: "Temperatur",
      sensor_humidity: "Luftfeuchtigkeit",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nie",
      releaseNotChecked: "Release: noch nicht geprüft",
      releaseLabel: "Release: {tag}",
      lastChecked: "Zuletzt geprüft: {date}",
      viewReleaseNotes: "Release-Notes anzeigen",
      releasePublished: "Veröffentlicht: {date}",
      releaseNoNotes: "Keine Release-Notes vorhanden.",
      viewOnGithub: "Auf GitHub ansehen",
      githubRepoTitle: "OpenBK7231T_App auf GitHub öffnen",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Firmware-Cache",
      cacheCleanupNow: "Jetzt aufräumen",
      cacheIntro: "Heruntergeladene OpenBeken-Firmware und erzeugte UF2-Dateien (siehe \"ESPHome ↔ OpenBeken\") werden dauerhaft gespeichert und nicht von selbst gelöscht. Hier siehst du, was belegt ist, kannst einzelne Dateien entfernen und eine automatische Aufräumgrenze einrichten - dabei wird immer zuerst das Älteste gelöscht.",
      cacheColType: "Typ",
      cacheColLabel: "Bezeichnung",
      cacheColFile: "Datei",
      cacheColSize: "Größe",
      cacheColDate: "Hinzugefügt",
      cacheLoading: "Lade Cache…",
      cacheEmpty: "Cache ist leer.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} Datei(en), insgesamt {size}.",
      cacheMaxSizeLabel: "Maximale Cache-Größe (MB)",
      cacheAutoCleanupLabel: "Automatisch aufräumen, sobald überschritten",
      cacheSaveSettings: "Speichern",
      cacheSettingsSaved: "Gespeichert.",
      cacheConfirmDelete: "Diese Datei aus dem Cache löschen?",
      cacheConfirmCleanup: "Älteste Cache-Dateien löschen, bis die eingestellte Größe wieder unterschritten ist?",
      cacheCleanupNothing: "Cache ist bereits innerhalb der eingestellten Größe - nichts gelöscht.",
      cacheCleanupDone: "{count} Datei(en) gelöscht.",
      cacheAlertDeleteFailed: "Löschen fehlgeschlagen: {msg}",
      cacheAlertCleanupFailed: "Aufräumen fehlgeschlagen: {msg}",
      cacheAlertSettingsFailed: "Speichern fehlgeschlagen: {msg}",
      notifActive: "aktiv",
      notifInactive: "inaktiv",
      notifSave: "Speichern",
      notifTest: "Testnachricht senden",
      notifRemove: "Entfernen",
      notifTestSending: "Sende Testnachricht…",
      notifTestSent: "Testnachricht wurde gesendet.",
      notifTestFailed: "Fehlgeschlagen: {msg}",
      noChannelYet: "Noch kein Benachrichtigungskanal eingerichtet.",
      saveChannel: "Kanal speichern",
      notifHaLabel: "Home-Assistant-Notify-Ziel",
      notifHaHint: 'Der Name eines bestehenden <code>notify.*</code>-Dienstes, z. B. "mobile_app_handy" oder "persistent_notification". Nichts weiter einzurichten.',
      notifTelegramTokenLabel: "Bot-Token",
      notifTelegramTokenHint: 'Von @BotFather in Telegram: Chat öffnen, "/newbot" senden, Anweisungen folgen.',
      notifTelegramChatIdLabel: "Chat-ID",
      notifTelegramChatIdHint: 'Deinem Bot eine Nachricht schreiben, dann im Browser https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates öffnen - "chat":{"id": ...} ist die Chat-ID.',
      notifWhatsappPhoneLabel: "Telefonnummer",
      notifWhatsappPhoneHint: "Mit Ländervorwahl, z. B. 49151234567.",
      notifWhatsappApikeyLabel: "API-Key (CallMeBot)",
      notifWhatsappApikeyHint: 'Kostenloser WhatsApp-Bot ohne Meta-Business-Konto: Speichere +34 644 84 71 04 als Kontakt, schicke ihm per WhatsApp die Nachricht "I allow callmebot to send me messages" und du bekommst deinen persönlichen API-Key per WhatsApp zurück.',
      notifNameLabel: "Name",
      notifNamePlaceholder: "z. B. Handy Alex",
      notifMessageLabel: "Nachricht",
      notifMessageHint: "Platzhalter: {version} = neue Firmware-Version, {devices} = betroffene Geräte.",
      notifDefaultTemplate: "OpenBK7231T_App {version} ist verfügbar. Betroffene Geräte: {devices}.",
      notifActiveLabel: "Aktiv",
      notifKeepUnchanged: "•••• (unverändert lassen zum Beibehalten)",
      notifApikeyPlaceholderExample: "z. B. 123456",
      backupsHeader: "Konfigurations-Backups",
      backupsIntro: "Sichert vor jedem Update automatisch die GPIO-Pin-/Kanal-Zuordnung und das Startbefehl-Skript eines Geräts, damit du ein Update rückgängig machen kannst, das die Konfiguration zurücksetzt oder beschädigt. Du kannst unten auch jederzeit manuell ein Backup für ein Gerät auslösen.",
      backupColDevice: "Gerät",
      backupColTime: "Zeitpunkt",
      backupColReason: "Anlass",
      backupColVersion: "Firmware",
      backupReasonManual: "Manuell",
      backupReasonPreUpdate: "Vor Update",
      backupEmpty: "Noch keine Backups vorhanden.",
      backupNowTitle: "Konfiguration jetzt sichern",
      backupRestoreTitle: "Diese Konfiguration wiederherstellen",
      backupDownloadTitle: "Backup herunterladen",
      backupConfirmRestore: "Diese Konfiguration wirklich auf dem Gerät wiederherstellen? Die aktuellen Pin-/Kanal-Einstellungen und der Startbefehl werden überschrieben.",
      backupAlertRestoreFailed: "Wiederherstellung fehlgeschlagen: {msg}",
      backupRestoredAlert: "Konfiguration wiederhergestellt.",
      backupConfirmDelete: "Dieses Backup wirklich löschen?",
      backupAlertDeleteFailed: "Löschen fehlgeschlagen: {msg}",
      backupAlertCreateFailed: "Backup fehlgeschlagen: {msg}",
      sensor_reboot_count: "Neustarts (geschätzt)",
      sensor_last_seen: "Zuletzt gesehen",
    },
    en: {
      checkRelease: "Check for updates",
      themeToggle: "Toggle light/dark mode",
      updateAll: "Update all",
      devicesHeader: "Devices",
      scanNetwork: "Scan network",
      addDevice: "Add device",
      addIpPlaceholder: "IP address (e.g. 192.168.1.50)",
      addNamePlaceholder: "Name (optional)",
      addPasswordPlaceholder: "Admin password (if set)",
      add: "Add",
      cancel: "Cancel",
      colName: "Name", colIp: "IP", colChipset: "Chipset", colVersion: "Version", colStatus: "Status", colActions: "Actions",
      loadingDevices: "Loading devices…",
      emptyDevices: "No devices added yet. Scan the network or add one manually.",
      scanResultsHeader: "Scan results",
      close: "Close",
      notificationsHeader: "Notifications",
      notificationsIntro: "Choose how you'd like to be notified when a new OpenBK7231T_App firmware is released. You can set up several channels at once. If no channel is active, the add-on falls back to a normal Home Assistant notification.",
      addChannel: "Add channel",
      chooseChannelType: "Choose a channel type:",
      settingsHeader: "Settings",
      statusUpdating: "Updating…",
      statusFailed: "Failed",
      statusTimeout: "Timed out",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "UART/SPI flashing only",
      unknownVersion: "unknown",
      newVersionPrefix: "new: ",
      updateTitleUartOnly: "This chipset does not support a network update (UART/SPI flashing only).",
      updateTitleUpdating: "An update is already in progress.",
      updateTitleNoUpdateKnown: "No newer version is currently known - click anyway to re-flash the firmware.",
      refreshTitle: "Re-query device",
      updateBtnLabel: "Firmware update",
      deleteTitle: "Remove device",
      openDeviceTitle: "Open device in browser",
      confirmUpdateAll: "Update all devices with an available update now?",
      confirmUpdateDevice: "Start the firmware update now? The device will reboot afterwards.",
      confirmUpdateDeviceNoUpdate: "No newer version is currently known. Re-flash the firmware anyway?",
      confirmDelete: "Remove this device from the list?",
      confirmDeleteChannel: "Remove this notification channel?",
      alertDeviceOffline: "Device \"{name}\" is not responding (offline or wrong password).",
      alertActionFailed: "Action failed: {msg}",
      alertRenameFailed: "Renaming failed: {msg}",
      alertCheckFailed: "Check failed: {msg}",
      alertUpdateAllFailed: "Update failed: {msg}",
      alertNoUpdatesFound: "No devices with an available update were found.",
      alertUpdatesStarted: "{count} update(s) started.\n{skippedCount} skipped:\n{details}",
      alertUpdateFailedDetail: "Update failed:\n\n{detail}",
      alertUpdateFailedGeneric: "The update failed or timed out. No further details are available.",
      alertAddFailed: "Adding failed: {msg}",
      alertScanFailed: "Scan failed: {msg}",
      alertSaveFailed: "Saving failed: {msg}",
      alertDeleteChannelFailed: "Removing failed: {msg}",
      alertCreateChannelFailed: "Creating failed: {msg}",
      alertSensorLabelSaveFailed: "Renaming the sensor failed: {msg}",
      bannerUpdateText: "New firmware available for {count} device(s).",
      scanningStatus: "Scanning network… this can take up to 20 seconds.",
      scanResultStatus: "Subnet: {subnet} – {count} device(s) found.",
      subnetUnknown: "unknown",
      alreadyAdded: "already added",
      addBtn: "Add",
      noDevicesFoundScan: "No devices found.",
      settingsScanSubnet: "Scan subnet",
      settingsAuto: "automatic",
      settingsPollInterval: "Poll interval",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Release check interval",
      settingsHoursUnit: "h",
      settingsNotifications: "Notifications",
      settingsEnabled: "enabled",
      settingsDisabled: "disabled",
      settingsFirmwarePort: "Firmware server port",
      sensorLoading: "Loading sensor data…",
      sensorNoData: "This device does not report any sensor data (e.g. no power meter/temperature sensor installed).",
      sensorLoadError: "Could not load sensor data: {msg}",
      renameSensorPrompt: "New display name for this sensor (leave empty to reset):",
      category_wifi: "Wi-Fi connection",
      category_power: "Power consumption",
      category_diagnostics: "Diagnostics",
      category_environment: "Environment",
      category_other: "Other",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi signal",
      sensor_ssid: "SSID",
      sensor_uptime: "Uptime",
      sensor_uptime_sec: "Uptime (seconds)",
      sensor_heap: "Free memory",
      sensor_power: "Power",
      sensor_apparent_power: "Apparent power",
      sensor_reactive_power: "Reactive power",
      sensor_power_factor: "Power factor",
      sensor_voltage: "Voltage",
      sensor_current: "Current",
      sensor_frequency: "Frequency",
      sensor_energy_total: "Total energy",
      sensor_energy_last_hour: "Energy last hour",
      sensor_energy_yesterday: "Energy yesterday",
      sensor_temperature: "Temperature",
      sensor_humidity: "Humidity",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "never",
      releaseNotChecked: "Release: not checked yet",
      releaseLabel: "Release: {tag}",
      lastChecked: "Last checked: {date}",
      viewReleaseNotes: "View release notes",
      releasePublished: "Published: {date}",
      releaseNoNotes: "No release notes available.",
      viewOnGithub: "View on GitHub",
      githubRepoTitle: "Open OpenBK7231T_App on GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Firmware cache",
      cacheCleanupNow: "Clean up now",
      cacheIntro: "Downloaded OpenBeken firmware and generated UF2 files (see \"ESPHome ↔ OpenBeken\") are stored permanently and never deleted on their own. Here you can see what's taking up space, remove individual files, and set an automatic cleanup limit - the oldest files are always deleted first.",
      cacheColType: "Type",
      cacheColLabel: "Label",
      cacheColFile: "File",
      cacheColSize: "Size",
      cacheColDate: "Added",
      cacheLoading: "Loading cache…",
      cacheEmpty: "Cache is empty.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} file(s), {size} total.",
      cacheMaxSizeLabel: "Maximum cache size (MB)",
      cacheAutoCleanupLabel: "Clean up automatically once exceeded",
      cacheSaveSettings: "Save",
      cacheSettingsSaved: "Saved.",
      cacheConfirmDelete: "Delete this file from the cache?",
      cacheConfirmCleanup: "Delete the oldest cached files until the configured size is no longer exceeded?",
      cacheCleanupNothing: "Cache is already within the configured size - nothing deleted.",
      cacheCleanupDone: "{count} file(s) deleted.",
      cacheAlertDeleteFailed: "Delete failed: {msg}",
      cacheAlertCleanupFailed: "Cleanup failed: {msg}",
      cacheAlertSettingsFailed: "Save failed: {msg}",
      notifActive: "active",
      notifInactive: "inactive",
      notifSave: "Save",
      notifTest: "Send test message",
      notifRemove: "Remove",
      notifTestSending: "Sending test message…",
      notifTestSent: "Test message was sent.",
      notifTestFailed: "Failed: {msg}",
      noChannelYet: "No notification channel set up yet.",
      saveChannel: "Save channel",
      notifHaLabel: "Home Assistant notify target",
      notifHaHint: 'The name of an existing <code>notify.*</code> service, e.g. "mobile_app_phone" or "persistent_notification". Nothing else to set up.',
      notifTelegramTokenLabel: "Bot token",
      notifTelegramTokenHint: 'From @BotFather in Telegram: open a chat, send "/newbot", follow the instructions.',
      notifTelegramChatIdLabel: "Chat ID",
      notifTelegramChatIdHint: 'Send your bot a message, then open https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates in a browser - "chat":{"id": ...} is your chat ID.',
      notifWhatsappPhoneLabel: "Phone number",
      notifWhatsappPhoneHint: "Including country code, e.g. 491511234567.",
      notifWhatsappApikeyLabel: "API key (CallMeBot)",
      notifWhatsappApikeyHint: 'Free WhatsApp bot, no Meta business account needed: save +34 644 84 71 04 as a contact, send it the WhatsApp message "I allow callmebot to send me messages", and you\'ll get your personal API key back via WhatsApp.',
      notifNameLabel: "Name",
      notifNamePlaceholder: "e.g. Alex's phone",
      notifMessageLabel: "Message",
      notifMessageHint: "Placeholders: {version} = new firmware version, {devices} = affected devices.",
      notifDefaultTemplate: "OpenBK7231T_App {version} is available. Affected devices: {devices}.",
      notifActiveLabel: "Active",
      notifKeepUnchanged: "•••• (leave unchanged to keep it)",
      notifApikeyPlaceholderExample: "e.g. 123456",
      backupsHeader: "Configuration Backups",
      backupsIntro: "Automatically saves a device's GPIO pin/channel mapping and startup command script before every update, so you can undo an update that resets or corrupts its configuration. You can also trigger a backup manually for any device below.",
      backupColDevice: "Device",
      backupColTime: "Time",
      backupColReason: "Reason",
      backupColVersion: "Firmware",
      backupReasonManual: "Manual",
      backupReasonPreUpdate: "Before update",
      backupEmpty: "No backups yet.",
      backupNowTitle: "Back up configuration now",
      backupRestoreTitle: "Restore this configuration",
      backupDownloadTitle: "Download backup",
      backupConfirmRestore: "Really restore this configuration to the device? Its current pin/channel settings and startup command will be overwritten.",
      backupAlertRestoreFailed: "Restore failed: {msg}",
      backupRestoredAlert: "Configuration restored.",
      backupConfirmDelete: "Really delete this backup?",
      backupAlertDeleteFailed: "Delete failed: {msg}",
      backupAlertCreateFailed: "Backup failed: {msg}",
      sensor_reboot_count: "Reboots (estimated)",
      sensor_last_seen: "Last seen",
    },
    fr: {
      checkRelease: "Vérifier les mises à jour",
      themeToggle: "Basculer clair/sombre",
      updateAll: "Tout mettre à jour",
      devicesHeader: "Appareils",
      scanNetwork: "Scanner le réseau",
      addDevice: "Ajouter un appareil",
      addIpPlaceholder: "Adresse IP (p. ex. 192.168.1.50)",
      addNamePlaceholder: "Nom (optionnel)",
      addPasswordPlaceholder: "Mot de passe admin (si défini)",
      add: "Ajouter",
      cancel: "Annuler",
      colName: "Nom", colIp: "IP", colChipset: "Puce", colVersion: "Version", colStatus: "Statut", colActions: "Actions",
      loadingDevices: "Chargement des appareils…",
      emptyDevices: "Aucun appareil ajouté pour l'instant. Scannez le réseau ou ajoutez-en un manuellement.",
      scanResultsHeader: "Résultats du scan",
      close: "Fermer",
      notificationsHeader: "Notifications",
      notificationsIntro: "Choisissez comment être averti lorsqu'un nouveau firmware OpenBK7231T_App est disponible. Vous pouvez configurer plusieurs canaux à la fois. Si aucun canal n'est actif, l'add-on utilise une notification Home Assistant normale.",
      addChannel: "Ajouter un canal",
      chooseChannelType: "Choisir un type de canal :",
      settingsHeader: "Paramètres",
      statusUpdating: "Mise à jour…",
      statusFailed: "Échec",
      statusTimeout: "Délai dépassé",
      statusOffline: "Hors ligne",
      statusOnline: "En ligne",
      uartOnlyHint: "flash UART/SPI uniquement",
      unknownVersion: "inconnu",
      newVersionPrefix: "nouveau : ",
      updateTitleUartOnly: "Cette puce ne prend pas en charge la mise à jour réseau (flash UART/SPI uniquement).",
      updateTitleUpdating: "Une mise à jour est déjà en cours.",
      updateTitleNoUpdateKnown: "Aucune version plus récente connue actuellement - cliquez quand même pour retransmettre le firmware.",
      refreshTitle: "Réinterroger l'appareil",
      updateBtnLabel: "Mise à jour du firmware",
      deleteTitle: "Supprimer l'appareil",
      openDeviceTitle: "Ouvrir l'appareil dans le navigateur",
      confirmUpdateAll: "Mettre à jour maintenant tous les appareils pour lesquels une mise à jour est disponible ?",
      confirmUpdateDevice: "Démarrer la mise à jour du firmware maintenant ? L'appareil redémarrera ensuite.",
      confirmUpdateDeviceNoUpdate: "Aucune version plus récente n'est connue actuellement. Retransmettre quand même le firmware ?",
      confirmDelete: "Supprimer cet appareil de la liste ?",
      confirmDeleteChannel: "Supprimer ce canal de notification ?",
      alertDeviceOffline: "L'appareil « {name} » ne répond pas (hors ligne ou mot de passe incorrect).",
      alertActionFailed: "Action échouée : {msg}",
      alertRenameFailed: "Renommage échoué : {msg}",
      alertCheckFailed: "Vérification échouée : {msg}",
      alertUpdateAllFailed: "Mise à jour échouée : {msg}",
      alertNoUpdatesFound: "Aucun appareil avec une mise à jour disponible n'a été trouvé.",
      alertUpdatesStarted: "{count} mise(s) à jour démarrée(s).\n{skippedCount} ignorée(s) :\n{details}",
      alertUpdateFailedDetail: "Mise à jour échouée :\n\n{detail}",
      alertUpdateFailedGeneric: "La mise à jour a échoué ou a dépassé le délai. Aucun détail supplémentaire n'est disponible.",
      alertAddFailed: "Ajout échoué : {msg}",
      alertScanFailed: "Scan échoué : {msg}",
      alertSaveFailed: "Enregistrement échoué : {msg}",
      alertDeleteChannelFailed: "Suppression échouée : {msg}",
      alertCreateChannelFailed: "Création échouée : {msg}",
      alertSensorLabelSaveFailed: "Le renommage du capteur a échoué : {msg}",
      bannerUpdateText: "Nouveau firmware disponible pour {count} appareil(s).",
      scanningStatus: "Scan du réseau… cela peut prendre jusqu'à 20 secondes.",
      scanResultStatus: "Sous-réseau : {subnet} – {count} appareil(s) trouvé(s).",
      subnetUnknown: "inconnu",
      alreadyAdded: "déjà ajouté",
      addBtn: "Ajouter",
      noDevicesFoundScan: "Aucun appareil trouvé.",
      settingsScanSubnet: "Sous-réseau scanné",
      settingsAuto: "automatique",
      settingsPollInterval: "Intervalle d'interrogation",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Intervalle de vérification des releases",
      settingsHoursUnit: "h",
      settingsNotifications: "Notifications",
      settingsEnabled: "activées",
      settingsDisabled: "désactivées",
      settingsFirmwarePort: "Port du serveur de firmware",
      sensorLoading: "Chargement des données des capteurs…",
      sensorNoData: "Cet appareil ne signale aucune donnée de capteur (p. ex. pas de mesure d'énergie/sonde de température installée).",
      sensorLoadError: "Impossible de charger les données des capteurs : {msg}",
      renameSensorPrompt: "Nouveau nom d'affichage pour ce capteur (laisser vide pour réinitialiser) :",
      category_wifi: "Connexion Wi-Fi",
      category_power: "Consommation",
      category_diagnostics: "Diagnostic",
      category_environment: "Environnement",
      category_other: "Autre",
      sensor_rssi: "RSSI",
      sensor_signal: "Signal Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Disponibilité",
      sensor_uptime_sec: "Disponibilité (secondes)",
      sensor_heap: "Mémoire libre",
      sensor_power: "Puissance",
      sensor_apparent_power: "Puissance apparente",
      sensor_reactive_power: "Puissance réactive",
      sensor_power_factor: "Facteur de puissance",
      sensor_voltage: "Tension",
      sensor_current: "Courant",
      sensor_frequency: "Fréquence",
      sensor_energy_total: "Énergie totale",
      sensor_energy_last_hour: "Énergie dernière heure",
      sensor_energy_yesterday: "Énergie hier",
      sensor_temperature: "Température",
      sensor_humidity: "Humidité",
      sensor_co2: "CO2",
      sensor_tvoc: "COVT",
      never: "jamais",
      releaseNotChecked: "Release : pas encore vérifiée",
      releaseLabel: "Release : {tag}",
      lastChecked: "Dernière vérification : {date}",
      viewReleaseNotes: "Voir les notes de version",
      releasePublished: "Publiée le : {date}",
      releaseNoNotes: "Aucune note de version disponible.",
      viewOnGithub: "Voir sur GitHub",
      githubRepoTitle: "Ouvrir OpenBK7231T_App sur GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Cache des firmwares",
      cacheCleanupNow: "Nettoyer maintenant",
      cacheIntro: "Les firmwares OpenBeken téléchargés et les fichiers UF2 générés (voir « ESPHome ↔ OpenBeken ») sont conservés en permanence et ne sont jamais supprimés automatiquement. Vous pouvez voir ici ce qui occupe de l'espace, supprimer des fichiers individuellement et définir une limite de nettoyage automatique - les fichiers les plus anciens sont toujours supprimés en premier.",
      cacheColType: "Type",
      cacheColLabel: "Désignation",
      cacheColFile: "Fichier",
      cacheColSize: "Taille",
      cacheColDate: "Ajouté",
      cacheLoading: "Chargement du cache…",
      cacheEmpty: "Le cache est vide.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} fichier(s), {size} au total.",
      cacheMaxSizeLabel: "Taille maximale du cache (Mo)",
      cacheAutoCleanupLabel: "Nettoyer automatiquement en cas de dépassement",
      cacheSaveSettings: "Enregistrer",
      cacheSettingsSaved: "Enregistré.",
      cacheConfirmDelete: "Supprimer ce fichier du cache ?",
      cacheConfirmCleanup: "Supprimer les fichiers les plus anciens du cache jusqu'à repasser sous la taille configurée ?",
      cacheCleanupNothing: "Le cache est déjà dans la limite configurée - rien n'a été supprimé.",
      cacheCleanupDone: "{count} fichier(s) supprimé(s).",
      cacheAlertDeleteFailed: "Échec de la suppression : {msg}",
      cacheAlertCleanupFailed: "Échec du nettoyage : {msg}",
      cacheAlertSettingsFailed: "Échec de l'enregistrement : {msg}",
      notifActive: "actif",
      notifInactive: "inactif",
      notifSave: "Enregistrer",
      notifTest: "Envoyer un message test",
      notifRemove: "Supprimer",
      notifTestSending: "Envoi du message test…",
      notifTestSent: "Le message test a été envoyé.",
      notifTestFailed: "Échec : {msg}",
      noChannelYet: "Aucun canal de notification configuré pour l'instant.",
      saveChannel: "Enregistrer le canal",
      notifHaLabel: "Cible de notification Home Assistant",
      notifHaHint: 'Le nom d\'un service <code>notify.*</code> existant, p. ex. "mobile_app_telephone" ou "persistent_notification". Rien d\'autre à configurer.',
      notifTelegramTokenLabel: "Jeton du bot",
      notifTelegramTokenHint: 'Depuis @BotFather sur Telegram : ouvrez une discussion, envoyez "/newbot", suivez les instructions.',
      notifTelegramChatIdLabel: "ID de chat",
      notifTelegramChatIdHint: 'Envoyez un message à votre bot, puis ouvrez https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates dans un navigateur - "chat":{"id": ...} est votre ID de chat.',
      notifWhatsappPhoneLabel: "Numéro de téléphone",
      notifWhatsappPhoneHint: "Avec l'indicatif du pays, p. ex. 33612345678.",
      notifWhatsappApikeyLabel: "Clé API (CallMeBot)",
      notifWhatsappApikeyHint: 'Bot WhatsApp gratuit sans compte Meta Business : enregistrez +34 644 84 71 04 comme contact, envoyez-lui le message WhatsApp "I allow callmebot to send me messages", vous recevrez votre clé API personnelle par WhatsApp.',
      notifNameLabel: "Nom",
      notifNamePlaceholder: "p. ex. téléphone d'Alex",
      notifMessageLabel: "Message",
      notifMessageHint: "Espaces réservés : {version} = nouvelle version du firmware, {devices} = appareils concernés.",
      notifDefaultTemplate: "OpenBK7231T_App {version} est disponible. Appareils concernés : {devices}.",
      notifActiveLabel: "Actif",
      notifKeepUnchanged: "•••• (laisser inchangé pour conserver)",
      notifApikeyPlaceholderExample: "p. ex. 123456",
      backupsHeader: "Sauvegardes de configuration",
      backupsIntro: "Enregistre automatiquement l'affectation des broches/canaux GPIO et le script de commande de démarrage d'un appareil avant chaque mise à jour, afin de pouvoir annuler une mise à jour qui réinitialise ou corrompt sa configuration. Vous pouvez aussi déclencher une sauvegarde manuellement pour n'importe quel appareil ci-dessous.",
      backupColDevice: "Appareil",
      backupColTime: "Horodatage",
      backupColReason: "Motif",
      backupColVersion: "Firmware",
      backupReasonManual: "Manuel",
      backupReasonPreUpdate: "Avant mise à jour",
      backupEmpty: "Aucune sauvegarde pour le moment.",
      backupNowTitle: "Sauvegarder la configuration maintenant",
      backupRestoreTitle: "Restaurer cette configuration",
      backupDownloadTitle: "Télécharger la sauvegarde",
      backupConfirmRestore: "Vraiment restaurer cette configuration sur l'appareil ? Les réglages actuels des broches/canaux et la commande de démarrage seront écrasés.",
      backupAlertRestoreFailed: "Échec de la restauration : {msg}",
      backupRestoredAlert: "Configuration restaurée.",
      backupConfirmDelete: "Vraiment supprimer cette sauvegarde ?",
      backupAlertDeleteFailed: "Échec de la suppression : {msg}",
      backupAlertCreateFailed: "Échec de la sauvegarde : {msg}",
      sensor_reboot_count: "Redémarrages (estimé)",
      sensor_last_seen: "Vu pour la dernière fois",
    },
    es: {
      checkRelease: "Buscar actualizaciones",
      themeToggle: "Cambiar modo claro/oscuro",
      updateAll: "Actualizar todo",
      devicesHeader: "Dispositivos",
      scanNetwork: "Escanear red",
      addDevice: "Añadir dispositivo",
      addIpPlaceholder: "Dirección IP (p. ej. 192.168.1.50)",
      addNamePlaceholder: "Nombre (opcional)",
      addPasswordPlaceholder: "Contraseña de administrador (si está definida)",
      add: "Añadir",
      cancel: "Cancelar",
      colName: "Nombre", colIp: "IP", colChipset: "Chipset", colVersion: "Versión", colStatus: "Estado", colActions: "Acciones",
      loadingDevices: "Cargando dispositivos…",
      emptyDevices: "Todavía no se ha añadido ningún dispositivo. Escanea la red o añade uno manualmente.",
      scanResultsHeader: "Resultados del escaneo",
      close: "Cerrar",
      notificationsHeader: "Notificaciones",
      notificationsIntro: "Elige cómo quieres que se te avise cuando aparezca un nuevo firmware de OpenBK7231T_App. Puedes configurar varios canales a la vez. Si ningún canal está activo, el add-on usa una notificación normal de Home Assistant.",
      addChannel: "Añadir canal",
      chooseChannelType: "Elige un tipo de canal:",
      settingsHeader: "Ajustes",
      statusUpdating: "Actualizando…",
      statusFailed: "Fallido",
      statusTimeout: "Tiempo agotado",
      statusOffline: "Sin conexión",
      statusOnline: "En línea",
      uartOnlyHint: "solo flasheo UART/SPI",
      unknownVersion: "desconocida",
      newVersionPrefix: "nueva: ",
      updateTitleUartOnly: "Este chipset no admite actualización por red (solo flasheo UART/SPI).",
      updateTitleUpdating: "Ya hay una actualización en curso.",
      updateTitleNoUpdateKnown: "Actualmente no se conoce una versión más reciente - haz clic de todos modos para volver a transferir el firmware.",
      refreshTitle: "Volver a consultar el dispositivo",
      updateBtnLabel: "Actualización de firmware",
      deleteTitle: "Eliminar dispositivo",
      openDeviceTitle: "Abrir el dispositivo en el navegador",
      confirmUpdateAll: "¿Actualizar ahora todos los dispositivos con una actualización disponible?",
      confirmUpdateDevice: "¿Iniciar la actualización de firmware ahora? El dispositivo se reiniciará después.",
      confirmUpdateDeviceNoUpdate: "Actualmente no se conoce una versión más reciente. ¿Volver a transferir el firmware de todos modos?",
      confirmDelete: "¿Eliminar este dispositivo de la lista?",
      confirmDeleteChannel: "¿Eliminar este canal de notificación?",
      alertDeviceOffline: "El dispositivo \"{name}\" no responde (sin conexión o contraseña incorrecta).",
      alertActionFailed: "La acción falló: {msg}",
      alertRenameFailed: "No se pudo renombrar: {msg}",
      alertCheckFailed: "La comprobación falló: {msg}",
      alertUpdateAllFailed: "La actualización falló: {msg}",
      alertNoUpdatesFound: "No se encontraron dispositivos con una actualización disponible.",
      alertUpdatesStarted: "{count} actualización(es) iniciada(s).\n{skippedCount} omitida(s):\n{details}",
      alertUpdateFailedDetail: "La actualización falló:\n\n{detail}",
      alertUpdateFailedGeneric: "La actualización falló o superó el tiempo de espera. No hay más detalles disponibles.",
      alertAddFailed: "No se pudo añadir: {msg}",
      alertScanFailed: "El escaneo falló: {msg}",
      alertSaveFailed: "No se pudo guardar: {msg}",
      alertDeleteChannelFailed: "No se pudo eliminar: {msg}",
      alertCreateChannelFailed: "No se pudo crear: {msg}",
      alertSensorLabelSaveFailed: "No se pudo renombrar el sensor: {msg}",
      bannerUpdateText: "Nuevo firmware disponible para {count} dispositivo(s).",
      scanningStatus: "Escaneando la red… esto puede tardar hasta 20 segundos.",
      scanResultStatus: "Subred: {subnet} – {count} dispositivo(s) encontrado(s).",
      subnetUnknown: "desconocida",
      alreadyAdded: "ya añadido",
      addBtn: "Añadir",
      noDevicesFoundScan: "No se encontraron dispositivos.",
      settingsScanSubnet: "Subred de escaneo",
      settingsAuto: "automática",
      settingsPollInterval: "Intervalo de consulta",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Intervalo de comprobación de releases",
      settingsHoursUnit: "h",
      settingsNotifications: "Notificaciones",
      settingsEnabled: "activadas",
      settingsDisabled: "desactivadas",
      settingsFirmwarePort: "Puerto del servidor de firmware",
      sensorLoading: "Cargando datos de sensores…",
      sensorNoData: "Este dispositivo no informa datos de sensores (p. ej. no tiene medidor de energía/sonda de temperatura).",
      sensorLoadError: "No se pudieron cargar los datos de los sensores: {msg}",
      renameSensorPrompt: "Nuevo nombre para este sensor (déjalo vacío para restablecer):",
      category_wifi: "Conexión Wi-Fi",
      category_power: "Consumo",
      category_diagnostics: "Diagnóstico",
      category_environment: "Entorno",
      category_other: "Otros",
      sensor_rssi: "RSSI",
      sensor_signal: "Señal Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Tiempo de actividad",
      sensor_uptime_sec: "Tiempo de actividad (segundos)",
      sensor_heap: "Memoria libre",
      sensor_power: "Potencia",
      sensor_apparent_power: "Potencia aparente",
      sensor_reactive_power: "Potencia reactiva",
      sensor_power_factor: "Factor de potencia",
      sensor_voltage: "Voltaje",
      sensor_current: "Corriente",
      sensor_frequency: "Frecuencia",
      sensor_energy_total: "Energía total",
      sensor_energy_last_hour: "Energía última hora",
      sensor_energy_yesterday: "Energía ayer",
      sensor_temperature: "Temperatura",
      sensor_humidity: "Humedad",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nunca",
      releaseNotChecked: "Release: aún no comprobada",
      releaseLabel: "Release: {tag}",
      lastChecked: "Última comprobación: {date}",
      viewReleaseNotes: "Ver notas de la versión",
      releasePublished: "Publicada: {date}",
      releaseNoNotes: "No hay notas de la versión disponibles.",
      viewOnGithub: "Ver en GitHub",
      githubRepoTitle: "Abrir OpenBK7231T_App en GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Caché de firmware",
      cacheCleanupNow: "Limpiar ahora",
      cacheIntro: "El firmware de OpenBeken descargado y los archivos UF2 generados (ver «ESPHome ↔ OpenBeken») se guardan de forma permanente y nunca se eliminan solos. Aquí puedes ver qué ocupa espacio, eliminar archivos individuales y configurar un límite de limpieza automática - siempre se elimina primero lo más antiguo.",
      cacheColType: "Tipo",
      cacheColLabel: "Descripción",
      cacheColFile: "Archivo",
      cacheColSize: "Tamaño",
      cacheColDate: "Añadido",
      cacheLoading: "Cargando caché…",
      cacheEmpty: "El caché está vacío.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} archivo(s), {size} en total.",
      cacheMaxSizeLabel: "Tamaño máximo del caché (MB)",
      cacheAutoCleanupLabel: "Limpiar automáticamente al superarse",
      cacheSaveSettings: "Guardar",
      cacheSettingsSaved: "Guardado.",
      cacheConfirmDelete: "¿Eliminar este archivo del caché?",
      cacheConfirmCleanup: "¿Eliminar los archivos más antiguos del caché hasta volver a estar por debajo del tamaño configurado?",
      cacheCleanupNothing: "El caché ya está dentro del tamaño configurado - no se eliminó nada.",
      cacheCleanupDone: "{count} archivo(s) eliminado(s).",
      cacheAlertDeleteFailed: "Error al eliminar: {msg}",
      cacheAlertCleanupFailed: "Error al limpiar: {msg}",
      cacheAlertSettingsFailed: "Error al guardar: {msg}",
      notifActive: "activo",
      notifInactive: "inactivo",
      notifSave: "Guardar",
      notifTest: "Enviar mensaje de prueba",
      notifRemove: "Eliminar",
      notifTestSending: "Enviando mensaje de prueba…",
      notifTestSent: "Se envió el mensaje de prueba.",
      notifTestFailed: "Fallido: {msg}",
      noChannelYet: "Todavía no se ha configurado ningún canal de notificación.",
      saveChannel: "Guardar canal",
      notifHaLabel: "Destino de notificación de Home Assistant",
      notifHaHint: 'El nombre de un servicio <code>notify.*</code> existente, p. ej. "mobile_app_movil" o "persistent_notification". No hay nada más que configurar.',
      notifTelegramTokenLabel: "Token del bot",
      notifTelegramTokenHint: 'Desde @BotFather en Telegram: abre un chat, envía "/newbot" y sigue las instrucciones.',
      notifTelegramChatIdLabel: "ID de chat",
      notifTelegramChatIdHint: 'Envía un mensaje a tu bot y luego abre https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates en el navegador - "chat":{"id": ...} es tu ID de chat.',
      notifWhatsappPhoneLabel: "Número de teléfono",
      notifWhatsappPhoneHint: "Con prefijo de país, p. ej. 34612345678.",
      notifWhatsappApikeyLabel: "Clave API (CallMeBot)",
      notifWhatsappApikeyHint: 'Bot de WhatsApp gratuito sin cuenta de Meta Business: guarda +34 644 84 71 04 como contacto, envíale por WhatsApp el mensaje "I allow callmebot to send me messages" y recibirás tu clave API personal por WhatsApp.',
      notifNameLabel: "Nombre",
      notifNamePlaceholder: "p. ej. móvil de Alex",
      notifMessageLabel: "Mensaje",
      notifMessageHint: "Marcadores: {version} = nueva versión de firmware, {devices} = dispositivos afectados.",
      notifDefaultTemplate: "OpenBK7231T_App {version} está disponible. Dispositivos afectados: {devices}.",
      notifActiveLabel: "Activo",
      notifKeepUnchanged: "•••• (dejar sin cambios para mantenerla)",
      notifApikeyPlaceholderExample: "p. ej. 123456",
      backupsHeader: "Copias de seguridad de configuración",
      backupsIntro: "Guarda automáticamente la asignación de pines/canales GPIO y el script de comandos de inicio de un dispositivo antes de cada actualización, para poder deshacer una actualización que restablezca o dañe su configuración. También puedes crear una copia de seguridad manualmente para cualquier dispositivo a continuación.",
      backupColDevice: "Dispositivo",
      backupColTime: "Fecha y hora",
      backupColReason: "Motivo",
      backupColVersion: "Firmware",
      backupReasonManual: "Manual",
      backupReasonPreUpdate: "Antes de actualizar",
      backupEmpty: "Todavía no hay copias de seguridad.",
      backupNowTitle: "Guardar copia de seguridad ahora",
      backupRestoreTitle: "Restaurar esta configuración",
      backupDownloadTitle: "Descargar copia de seguridad",
      backupConfirmRestore: "¿Restaurar realmente esta configuración en el dispositivo? Se sobrescribirán los ajustes actuales de pines/canales y el comando de inicio.",
      backupAlertRestoreFailed: "Error al restaurar: {msg}",
      backupRestoredAlert: "Configuración restaurada.",
      backupConfirmDelete: "¿Eliminar realmente esta copia de seguridad?",
      backupAlertDeleteFailed: "Error al eliminar: {msg}",
      backupAlertCreateFailed: "Error al crear la copia de seguridad: {msg}",
      sensor_reboot_count: "Reinicios (estimado)",
      sensor_last_seen: "Visto por última vez",
    },
    pt: {
      checkRelease: "Verificar atualizações",
      themeToggle: "Alternar modo claro/escuro",
      updateAll: "Atualizar tudo",
      devicesHeader: "Dispositivos",
      scanNetwork: "Procurar na rede",
      addDevice: "Adicionar dispositivo",
      addIpPlaceholder: "Endereço IP (ex.: 192.168.1.50)",
      addNamePlaceholder: "Nome (opcional)",
      addPasswordPlaceholder: "Palavra-passe de administrador (se definida)",
      add: "Adicionar",
      cancel: "Cancelar",
      colName: "Nome", colIp: "IP", colChipset: "Chipset", colVersion: "Versão", colStatus: "Estado", colActions: "Ações",
      loadingDevices: "A carregar dispositivos…",
      emptyDevices: "Ainda não foi adicionado nenhum dispositivo. Procure na rede ou adicione um manualmente.",
      scanResultsHeader: "Resultados da procura",
      close: "Fechar",
      notificationsHeader: "Notificações",
      notificationsIntro: "Escolha como quer ser notificado quando surgir um novo firmware do OpenBK7231T_App. Pode configurar vários canais ao mesmo tempo. Se nenhum canal estiver ativo, o add-on usa uma notificação normal do Home Assistant.",
      addChannel: "Adicionar canal",
      chooseChannelType: "Escolha um tipo de canal:",
      settingsHeader: "Definições",
      statusUpdating: "A atualizar…",
      statusFailed: "Falhou",
      statusTimeout: "Tempo esgotado",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "apenas gravação UART/SPI",
      unknownVersion: "desconhecida",
      newVersionPrefix: "nova: ",
      updateTitleUartOnly: "Este chipset não suporta atualização pela rede (apenas gravação UART/SPI).",
      updateTitleUpdating: "Já há uma atualização em curso.",
      updateTitleNoUpdateKnown: "Atualmente não é conhecida uma versão mais recente - clique mesmo assim para reenviar o firmware.",
      refreshTitle: "Consultar dispositivo novamente",
      updateBtnLabel: "Atualização de firmware",
      deleteTitle: "Remover dispositivo",
      openDeviceTitle: "Abrir o dispositivo no navegador",
      confirmUpdateAll: "Atualizar agora todos os dispositivos com atualização disponível?",
      confirmUpdateDevice: "Iniciar agora a atualização de firmware? O dispositivo irá reiniciar de seguida.",
      confirmUpdateDeviceNoUpdate: "Atualmente não é conhecida uma versão mais recente. Reenviar o firmware mesmo assim?",
      confirmDelete: "Remover este dispositivo da lista?",
      confirmDeleteChannel: "Remover este canal de notificação?",
      alertDeviceOffline: "O dispositivo \"{name}\" não está a responder (offline ou palavra-passe errada).",
      alertActionFailed: "Ação falhou: {msg}",
      alertRenameFailed: "Falha ao renomear: {msg}",
      alertCheckFailed: "Falha na verificação: {msg}",
      alertUpdateAllFailed: "Falha na atualização: {msg}",
      alertNoUpdatesFound: "Não foram encontrados dispositivos com atualização disponível.",
      alertUpdatesStarted: "{count} atualização(ões) iniciada(s).\n{skippedCount} ignorada(s):\n{details}",
      alertUpdateFailedDetail: "Falha na atualização:\n\n{detail}",
      alertUpdateFailedGeneric: "A atualização falhou ou excedeu o tempo limite. Não há mais detalhes disponíveis.",
      alertAddFailed: "Falha ao adicionar: {msg}",
      alertScanFailed: "Falha na procura: {msg}",
      alertSaveFailed: "Falha ao guardar: {msg}",
      alertDeleteChannelFailed: "Falha ao remover: {msg}",
      alertCreateChannelFailed: "Falha ao criar: {msg}",
      alertSensorLabelSaveFailed: "Falha ao renomear o sensor: {msg}",
      bannerUpdateText: "Novo firmware disponível para {count} dispositivo(s).",
      scanningStatus: "A procurar na rede… isto pode demorar até 20 segundos.",
      scanResultStatus: "Sub-rede: {subnet} – {count} dispositivo(s) encontrado(s).",
      subnetUnknown: "desconhecida",
      alreadyAdded: "já adicionado",
      addBtn: "Adicionar",
      noDevicesFoundScan: "Nenhum dispositivo encontrado.",
      settingsScanSubnet: "Sub-rede de procura",
      settingsAuto: "automática",
      settingsPollInterval: "Intervalo de consulta",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Intervalo de verificação de releases",
      settingsHoursUnit: "h",
      settingsNotifications: "Notificações",
      settingsEnabled: "ativadas",
      settingsDisabled: "desativadas",
      settingsFirmwarePort: "Porta do servidor de firmware",
      sensorLoading: "A carregar dados dos sensores…",
      sensorNoData: "Este dispositivo não reporta dados de sensores (p. ex. sem medidor de energia/sonda de temperatura).",
      sensorLoadError: "Não foi possível carregar os dados dos sensores: {msg}",
      renameSensorPrompt: "Novo nome de exibição para este sensor (deixe vazio para repor):",
      category_wifi: "Ligação Wi-Fi",
      category_power: "Consumo",
      category_diagnostics: "Diagnóstico",
      category_environment: "Ambiente",
      category_other: "Outros",
      sensor_rssi: "RSSI",
      sensor_signal: "Sinal Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Tempo ativo",
      sensor_uptime_sec: "Tempo ativo (segundos)",
      sensor_heap: "Memória livre",
      sensor_power: "Potência",
      sensor_apparent_power: "Potência aparente",
      sensor_reactive_power: "Potência reativa",
      sensor_power_factor: "Fator de potência",
      sensor_voltage: "Tensão",
      sensor_current: "Corrente",
      sensor_frequency: "Frequência",
      sensor_energy_total: "Energia total",
      sensor_energy_last_hour: "Energia última hora",
      sensor_energy_yesterday: "Energia ontem",
      sensor_temperature: "Temperatura",
      sensor_humidity: "Humidade",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nunca",
      releaseNotChecked: "Release: ainda não verificada",
      releaseLabel: "Release: {tag}",
      lastChecked: "Última verificação: {date}",
      viewReleaseNotes: "Ver notas da versão",
      releasePublished: "Publicada: {date}",
      releaseNoNotes: "Não há notas de versão disponíveis.",
      viewOnGithub: "Ver no GitHub",
      githubRepoTitle: "Abrir o OpenBK7231T_App no GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Cache de firmware",
      cacheCleanupNow: "Limpar agora",
      cacheIntro: "O firmware OpenBeken descarregado e os ficheiros UF2 gerados (ver \"ESPHome ↔ OpenBeken\") são guardados permanentemente e nunca são eliminados sozinhos. Aqui podes ver o que está a ocupar espaço, remover ficheiros individualmente e definir um limite de limpeza automática - os ficheiros mais antigos são sempre eliminados primeiro.",
      cacheColType: "Tipo",
      cacheColLabel: "Descrição",
      cacheColFile: "Ficheiro",
      cacheColSize: "Tamanho",
      cacheColDate: "Adicionado",
      cacheLoading: "A carregar cache…",
      cacheEmpty: "A cache está vazia.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} ficheiro(s), {size} no total.",
      cacheMaxSizeLabel: "Tamanho máximo da cache (MB)",
      cacheAutoCleanupLabel: "Limpar automaticamente quando excedido",
      cacheSaveSettings: "Guardar",
      cacheSettingsSaved: "Guardado.",
      cacheConfirmDelete: "Eliminar este ficheiro da cache?",
      cacheConfirmCleanup: "Eliminar os ficheiros mais antigos da cache até ficar novamente abaixo do tamanho configurado?",
      cacheCleanupNothing: "A cache já está dentro do tamanho configurado - nada foi eliminado.",
      cacheCleanupDone: "{count} ficheiro(s) eliminado(s).",
      cacheAlertDeleteFailed: "Falha ao eliminar: {msg}",
      cacheAlertCleanupFailed: "Falha ao limpar: {msg}",
      cacheAlertSettingsFailed: "Falha ao guardar: {msg}",
      notifActive: "ativo",
      notifInactive: "inativo",
      notifSave: "Guardar",
      notifTest: "Enviar mensagem de teste",
      notifRemove: "Remover",
      notifTestSending: "A enviar mensagem de teste…",
      notifTestSent: "A mensagem de teste foi enviada.",
      notifTestFailed: "Falhou: {msg}",
      noChannelYet: "Ainda não foi configurado nenhum canal de notificação.",
      saveChannel: "Guardar canal",
      notifHaLabel: "Destino de notificação do Home Assistant",
      notifHaHint: 'O nome de um serviço <code>notify.*</code> existente, p. ex. "mobile_app_telemovel" ou "persistent_notification". Não há mais nada a configurar.',
      notifTelegramTokenLabel: "Token do bot",
      notifTelegramTokenHint: 'No @BotFather do Telegram: abra um chat, envie "/newbot" e siga as instruções.',
      notifTelegramChatIdLabel: "ID de chat",
      notifTelegramChatIdHint: 'Envie uma mensagem ao seu bot e depois abra https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates no navegador - "chat":{"id": ...} é o seu ID de chat.',
      notifWhatsappPhoneLabel: "Número de telefone",
      notifWhatsappPhoneHint: "Com o indicativo do país, p. ex. 351912345678.",
      notifWhatsappApikeyLabel: "Chave de API (CallMeBot)",
      notifWhatsappApikeyHint: 'Bot de WhatsApp gratuito sem conta Meta Business: guarde +34 644 84 71 04 como contacto, envie-lhe pelo WhatsApp a mensagem "I allow callmebot to send me messages" e receberá a sua chave de API pessoal pelo WhatsApp.',
      notifNameLabel: "Nome",
      notifNamePlaceholder: "p. ex. telemóvel do Alex",
      notifMessageLabel: "Mensagem",
      notifMessageHint: "Marcadores: {version} = nova versão de firmware, {devices} = dispositivos afetados.",
      notifDefaultTemplate: "OpenBK7231T_App {version} está disponível. Dispositivos afetados: {devices}.",
      notifActiveLabel: "Ativo",
      notifKeepUnchanged: "•••• (deixar sem alterar para manter)",
      notifApikeyPlaceholderExample: "p. ex. 123456",
      backupsHeader: "Cópias de segurança da configuração",
      backupsIntro: "Guarda automaticamente o mapeamento de pinos/canais GPIO e o script de comandos de arranque de um dispositivo antes de cada atualização, para que possas anular uma atualização que reponha ou corrompa a sua configuração. Também podes criar uma cópia de segurança manualmente para qualquer dispositivo abaixo.",
      backupColDevice: "Dispositivo",
      backupColTime: "Data/hora",
      backupColReason: "Motivo",
      backupColVersion: "Firmware",
      backupReasonManual: "Manual",
      backupReasonPreUpdate: "Antes da atualização",
      backupEmpty: "Ainda não há cópias de segurança.",
      backupNowTitle: "Criar cópia de segurança agora",
      backupRestoreTitle: "Restaurar esta configuração",
      backupDownloadTitle: "Transferir cópia de segurança",
      backupConfirmRestore: "Restaurar mesmo esta configuração no dispositivo? As definições atuais de pinos/canais e o comando de arranque serão substituídos.",
      backupAlertRestoreFailed: "Falha ao restaurar: {msg}",
      backupRestoredAlert: "Configuração restaurada.",
      backupConfirmDelete: "Eliminar mesmo esta cópia de segurança?",
      backupAlertDeleteFailed: "Falha ao eliminar: {msg}",
      backupAlertCreateFailed: "Falha ao criar a cópia de segurança: {msg}",
      sensor_reboot_count: "Reinicializações (estimado)",
      sensor_last_seen: "Visto pela última vez",
    },
    bg: {
      checkRelease: "Проверка за актуализации",
      themeToggle: "Превключване на светла/тъмна тема",
      updateAll: "Актуализирай всички",
      devicesHeader: "Устройства",
      scanNetwork: "Сканиране на мрежата",
      addDevice: "Добавяне на устройство",
      addIpPlaceholder: "IP адрес (напр. 192.168.1.50)",
      addNamePlaceholder: "Име (по избор)",
      addPasswordPlaceholder: "Администраторска парола (ако е зададена)",
      add: "Добави",
      cancel: "Отказ",
      colName: "Име",
      colIp: "IP",
      colChipset: "Чипсет",
      colVersion: "Версия",
      colStatus: "Статус",
      colActions: "Действия",
      loadingDevices: "Зареждане на устройства…",
      emptyDevices: "Все още няма добавени устройства. Сканирайте мрежата или добавете едно ръчно.",
      scanResultsHeader: "Резултати от сканирането",
      close: "Затвори",
      notificationsHeader: "Известия",
      notificationsIntro: "Изберете как искате да бъдете уведомявани, когато излезе нов фърмуер OpenBK7231T_App. Можете да настроите няколко канала едновременно. Ако няма активен канал, добавката преминава към обикновено известие в Home Assistant.",
      addChannel: "Добавяне на канал",
      chooseChannelType: "Изберете тип канал:",
      settingsHeader: "Настройки",
      statusUpdating: "Актуализиране…",
      statusFailed: "Неуспешно",
      statusTimeout: "Изтече времето",
      statusOffline: "Офлайн",
      statusOnline: "Онлайн",
      uartOnlyHint: "Само флашване през UART/SPI",
      unknownVersion: "неизвестна",
      newVersionPrefix: "нова: ",
      updateTitleUartOnly: "Този чипсет не поддържа актуализация през мрежата (само флашване през UART/SPI).",
      updateTitleUpdating: "В момента вече тече актуализация.",
      updateTitleNoUpdateKnown: "В момента не е известна по-нова версия - все пак можете да кликнете за повторно флашване на фърмуера.",
      refreshTitle: "Ново запитване към устройството",
      updateBtnLabel: "Актуализация на фърмуера",
      deleteTitle: "Премахване на устройство",
      openDeviceTitle: "Отваряне на устройството в браузъра",
      confirmUpdateAll: "Да се актуализират ли сега всички устройства с налична актуализация?",
      confirmUpdateDevice: "Да стартира ли актуализацията на фърмуера сега? След това устройството ще се рестартира.",
      confirmUpdateDeviceNoUpdate: "В момента не е известна по-нова версия. Да се флашне ли фърмуерът все пак?",
      confirmDelete: "Да се премахне ли това устройство от списъка?",
      confirmDeleteChannel: "Да се премахне ли този канал за известия?",
      alertDeviceOffline: "Устройството \"{name}\" не отговаря (офлайн или грешна парола).",
      alertActionFailed: "Действието бе неуспешно: {msg}",
      alertRenameFailed: "Преименуването бе неуспешно: {msg}",
      alertCheckFailed: "Проверката бе неуспешна: {msg}",
      alertUpdateAllFailed: "Актуализацията бе неуспешна: {msg}",
      alertNoUpdatesFound: "Не бяха намерени устройства с налична актуализация.",
      alertUpdatesStarted: "Стартирани са {count} актуализация(ии).\n{skippedCount} пропуснати:\n{details}",
      alertUpdateFailedDetail: "Актуализацията бе неуспешна:\n\n{detail}",
      alertUpdateFailedGeneric: "Актуализацията се провали или изтече времето за изчакване. Няма налична допълнителна информация.",
      alertAddFailed: "Добавянето бе неуспешно: {msg}",
      alertScanFailed: "Сканирането бе неуспешно: {msg}",
      alertSaveFailed: "Записването бе неуспешно: {msg}",
      alertDeleteChannelFailed: "Премахването бе неуспешно: {msg}",
      alertCreateChannelFailed: "Създаването бе неуспешно: {msg}",
      alertSensorLabelSaveFailed: "Преименуването на сензора бе неуспешно: {msg}",
      bannerUpdateText: "Наличен е нов фърмуер за {count} устройство(а).",
      scanningStatus: "Сканиране на мрежата… това може да отнеме до 20 секунди.",
      scanResultStatus: "Подмрежа: {subnet} – намерени {count} устройство(а).",
      subnetUnknown: "неизвестна",
      alreadyAdded: "вече е добавено",
      addBtn: "Добави",
      noDevicesFoundScan: "Не бяха намерени устройства.",
      settingsScanSubnet: "Подмрежа за сканиране",
      settingsAuto: "автоматично",
      settingsPollInterval: "Интервал на запитване",
      settingsMinutesUnit: "мин",
      settingsReleaseCheckInterval: "Интервал за проверка на версии",
      settingsHoursUnit: "ч",
      settingsNotifications: "Известия",
      settingsEnabled: "активирано",
      settingsDisabled: "деактивирано",
      settingsFirmwarePort: "Порт на сървъра за фърмуер",
      sensorLoading: "Зареждане на данни от сензора…",
      sensorNoData: "Това устройство не съобщава данни от сензори (напр. няма инсталиран измервател на мощност/сензор за температура).",
      sensorLoadError: "Данните от сензора не можаха да бъдат заредени: {msg}",
      renameSensorPrompt: "Ново показвано име за този сензор (оставете празно за нулиране):",
      category_wifi: "Wi-Fi връзка",
      category_power: "Консумация на енергия",
      category_diagnostics: "Диагностика",
      category_environment: "Околна среда",
      category_other: "Други",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi сигнал",
      sensor_ssid: "SSID",
      sensor_uptime: "Време на работа",
      sensor_uptime_sec: "Време на работа (секунди)",
      sensor_heap: "Свободна памет",
      sensor_power: "Мощност",
      sensor_apparent_power: "Пълна мощност",
      sensor_reactive_power: "Реактивна мощност",
      sensor_power_factor: "Фактор на мощността",
      sensor_voltage: "Напрежение",
      sensor_current: "Ток",
      sensor_frequency: "Честота",
      sensor_energy_total: "Обща енергия",
      sensor_energy_last_hour: "Енергия за последния час",
      sensor_energy_yesterday: "Енергия вчера",
      sensor_temperature: "Температура",
      sensor_humidity: "Влажност",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "никога",
      releaseNotChecked: "Версия: все още не е проверена",
      releaseLabel: "Версия: {tag}",
      lastChecked: "Последна проверка: {date}",
      viewReleaseNotes: "Преглед на бележките към версията",
      releasePublished: "Публикувано: {date}",
      releaseNoNotes: "Няма налични бележки към версията.",
      viewOnGithub: "Преглед в GitHub",
      githubRepoTitle: "Отваряне на OpenBK7231T_App в GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Кеш на фърмуера",
      cacheCleanupNow: "Изчисти сега",
      cacheIntro: "Изтегленият фърмуер OpenBeken и генерираните UF2 файлове (вижте \"ESPHome ↔ OpenBeken\") се съхраняват постоянно и никога не се изтриват сами. Тук можете да видите какво заема място, да премахнете отделни файлове и да зададете лимит за автоматично изчистване - най-старите файлове винаги се изтриват първи.",
      cacheColType: "Тип",
      cacheColLabel: "Етикет",
      cacheColFile: "Файл",
      cacheColSize: "Размер",
      cacheColDate: "Добавен",
      cacheLoading: "Зареждане на кеша…",
      cacheEmpty: "Кешът е празен.",
      cacheKindFirmware: "Фърмуер",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} файл(а), общо {size}.",
      cacheMaxSizeLabel: "Максимален размер на кеша (MB)",
      cacheAutoCleanupLabel: "Автоматично изчистване при превишаване",
      cacheSaveSettings: "Запази",
      cacheSettingsSaved: "Записано.",
      cacheConfirmDelete: "Да се изтрие ли този файл от кеша?",
      cacheConfirmCleanup: "Да се изтрият ли най-старите кеширани файлове, докато настроеният размер вече не бъде превишаван?",
      cacheCleanupNothing: "Кешът вече е в рамките на настроения размер - нищо не е изтрито.",
      cacheCleanupDone: "Изтрити са {count} файл(а).",
      cacheAlertDeleteFailed: "Изтриването бе неуспешно: {msg}",
      cacheAlertCleanupFailed: "Изчистването бе неуспешно: {msg}",
      cacheAlertSettingsFailed: "Записът бе неуспешен: {msg}",
      notifActive: "активен",
      notifInactive: "неактивен",
      notifSave: "Запази",
      notifTest: "Изпращане на тестово съобщение",
      notifRemove: "Премахни",
      notifTestSending: "Изпращане на тестово съобщение…",
      notifTestSent: "Тестовото съобщение бе изпратено.",
      notifTestFailed: "Неуспешно: {msg}",
      noChannelYet: "Все още няма настроен канал за известия.",
      saveChannel: "Запазване на канала",
      notifHaLabel: "Цел за известяване в Home Assistant",
      notifHaHint: "Името на съществуваща услуга <code>notify.*</code>, напр. \"mobile_app_phone\" или \"persistent_notification\". Нищо друго не е нужно да се настройва.",
      notifTelegramTokenLabel: "Токен на бота",
      notifTelegramTokenHint: "От @BotFather в Telegram: отворете чат, изпратете \"/newbot\" и следвайте инструкциите.",
      notifTelegramChatIdLabel: "ID на чата",
      notifTelegramChatIdHint: "Изпратете съобщение на бота си, след което отворете https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates в браузър - \"chat\":{\"id\": ...} е вашият chat ID.",
      notifWhatsappPhoneLabel: "Телефонен номер",
      notifWhatsappPhoneHint: "Включително код на държавата, напр. 491511234567.",
      notifWhatsappApikeyLabel: "API ключ (CallMeBot)",
      notifWhatsappApikeyHint: "Безплатен WhatsApp бот, без нужда от бизнес акаунт в Meta: запазете +34 644 84 71 04 като контакт, изпратете му WhatsApp съобщението \"I allow callmebot to send me messages\" и ще получите обратно личния си API ключ през WhatsApp.",
      notifNameLabel: "Име",
      notifNamePlaceholder: "напр. телефонът на Алекс",
      notifMessageLabel: "Съобщение",
      notifMessageHint: "Променливи: {version} = нова версия на фърмуера, {devices} = засегнати устройства.",
      notifDefaultTemplate: "OpenBK7231T_App {version} е наличен. Засегнати устройства: {devices}.",
      notifActiveLabel: "Активен",
      notifKeepUnchanged: "•••• (оставете непроменено, за да го запазите)",
      notifApikeyPlaceholderExample: "напр. 123456",
      backupsHeader: "Резервни копия на конфигурацията",
      backupsIntro: "Автоматично запазва съответствието на GPIO пиновете/каналите и стартовия команден скрипт на устройството преди всяка актуализация, за да можеш да отмениш актуализация, която нулира или поврежда конфигурацията му. По-долу можеш и ръчно да стартираш резервно копие за произволно устройство.",
      backupColDevice: "Устройство",
      backupColTime: "Час",
      backupColReason: "Причина",
      backupColVersion: "Фърмуер",
      backupReasonManual: "Ръчно",
      backupReasonPreUpdate: "Преди актуализация",
      backupEmpty: "Все още няма резервни копия.",
      backupNowTitle: "Направи резервно копие сега",
      backupRestoreTitle: "Възстанови тази конфигурация",
      backupDownloadTitle: "Изтегли резервното копие",
      backupConfirmRestore: "Наистина ли да се възстанови тази конфигурация на устройството? Текущите настройки на пиновете/каналите и стартовата команда ще бъдат презаписани.",
      backupAlertRestoreFailed: "Възстановяването бе неуспешно: {msg}",
      backupRestoredAlert: "Конфигурацията е възстановена.",
      backupConfirmDelete: "Наистина ли да се изтрие това резервно копие?",
      backupAlertDeleteFailed: "Изтриването бе неуспешно: {msg}",
      backupAlertCreateFailed: "Резервното копиране бе неуспешно: {msg}",
      sensor_reboot_count: "Рестартирания (приблизително)",
      sensor_last_seen: "Последно видяно",
    },
    hr: {
      checkRelease: "Provjeri ažuriranja",
      themeToggle: "Prebaci svijetli/tamni način rada",
      updateAll: "Ažuriraj sve",
      devicesHeader: "Uređaji",
      scanNetwork: "Skeniraj mrežu",
      addDevice: "Dodaj uređaj",
      addIpPlaceholder: "IP adresa (npr. 192.168.1.50)",
      addNamePlaceholder: "Naziv (neobavezno)",
      addPasswordPlaceholder: "Administratorska lozinka (ako je postavljena)",
      add: "Dodaj",
      cancel: "Odustani",
      colName: "Naziv",
      colIp: "IP",
      colChipset: "Čipset",
      colVersion: "Verzija",
      colStatus: "Status",
      colActions: "Radnje",
      loadingDevices: "Učitavanje uređaja…",
      emptyDevices: "Još nema dodanih uređaja. Skenirajte mrežu ili dodajte uređaj ručno.",
      scanResultsHeader: "Rezultati skeniranja",
      close: "Zatvori",
      notificationsHeader: "Obavijesti",
      notificationsIntro: "Odaberite kako želite biti obaviješteni kada izađe novi firmware OpenBK7231T_App. Možete postaviti nekoliko kanala odjednom. Ako nijedan kanal nije aktivan, dodatak koristi običnu Home Assistant obavijest.",
      addChannel: "Dodaj kanal",
      chooseChannelType: "Odaberite vrstu kanala:",
      settingsHeader: "Postavke",
      statusUpdating: "Ažuriranje…",
      statusFailed: "Neuspjelo",
      statusTimeout: "Isteklo vrijeme",
      statusOffline: "Izvan mreže",
      statusOnline: "Na mreži",
      uartOnlyHint: "Samo flashanje putem UART/SPI",
      unknownVersion: "nepoznata",
      newVersionPrefix: "nova: ",
      updateTitleUartOnly: "Ovaj čipset ne podržava ažuriranje putem mreže (samo flashanje putem UART/SPI).",
      updateTitleUpdating: "Ažuriranje je već u tijeku.",
      updateTitleNoUpdateKnown: "Trenutno nije poznata novija verzija - svejedno kliknite za ponovno flashanje firmvera.",
      refreshTitle: "Ponovno upitaj uređaj",
      updateBtnLabel: "Ažuriranje firmvera",
      deleteTitle: "Ukloni uređaj",
      openDeviceTitle: "Otvori uređaj u pregledniku",
      confirmUpdateAll: "Ažurirati sada sve uređaje za koje je dostupno ažuriranje?",
      confirmUpdateDevice: "Pokrenuti ažuriranje firmvera sada? Uređaj će se nakon toga ponovno pokrenuti.",
      confirmUpdateDeviceNoUpdate: "Trenutno nije poznata novija verzija. Ipak ponovno flashati firmver?",
      confirmDelete: "Ukloniti ovaj uređaj s popisa?",
      confirmDeleteChannel: "Ukloniti ovaj kanal za obavijesti?",
      alertDeviceOffline: "Uređaj \"{name}\" ne odgovara (izvan mreže ili pogrešna lozinka).",
      alertActionFailed: "Radnja nije uspjela: {msg}",
      alertRenameFailed: "Preimenovanje nije uspjelo: {msg}",
      alertCheckFailed: "Provjera nije uspjela: {msg}",
      alertUpdateAllFailed: "Ažuriranje nije uspjelo: {msg}",
      alertNoUpdatesFound: "Nisu pronađeni uređaji s dostupnim ažuriranjem.",
      alertUpdatesStarted: "Pokrenuto je {count} ažuriranje(a).\n{skippedCount} preskočeno:\n{details}",
      alertUpdateFailedDetail: "Ažuriranje nije uspjelo:\n\n{detail}",
      alertUpdateFailedGeneric: "Ažuriranje nije uspjelo ili je isteklo vrijeme čekanja. Nema dostupnih dodatnih pojedinosti.",
      alertAddFailed: "Dodavanje nije uspjelo: {msg}",
      alertScanFailed: "Skeniranje nije uspjelo: {msg}",
      alertSaveFailed: "Spremanje nije uspjelo: {msg}",
      alertDeleteChannelFailed: "Uklanjanje nije uspjelo: {msg}",
      alertCreateChannelFailed: "Stvaranje nije uspjelo: {msg}",
      alertSensorLabelSaveFailed: "Preimenovanje senzora nije uspjelo: {msg}",
      bannerUpdateText: "Novi firmver dostupan za {count} uređaj(a).",
      scanningStatus: "Skeniranje mreže… ovo može potrajati do 20 sekundi.",
      scanResultStatus: "Podmreža: {subnet} – pronađeno {count} uređaj(a).",
      subnetUnknown: "nepoznato",
      alreadyAdded: "već dodano",
      addBtn: "Dodaj",
      noDevicesFoundScan: "Nisu pronađeni uređaji.",
      settingsScanSubnet: "Podmreža za skeniranje",
      settingsAuto: "automatski",
      settingsPollInterval: "Interval provjere",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Interval provjere izdanja",
      settingsHoursUnit: "h",
      settingsNotifications: "Obavijesti",
      settingsEnabled: "omogućeno",
      settingsDisabled: "onemogućeno",
      settingsFirmwarePort: "Port poslužitelja za firmver",
      sensorLoading: "Učitavanje podataka senzora…",
      sensorNoData: "Ovaj uređaj ne prijavljuje nikakve podatke senzora (npr. nema ugrađenog mjerača snage/senzora temperature).",
      sensorLoadError: "Podatke senzora nije bilo moguće učitati: {msg}",
      renameSensorPrompt: "Novi prikazani naziv za ovaj senzor (ostavite prazno za vraćanje na izvorno):",
      category_wifi: "Wi-Fi veza",
      category_power: "Potrošnja energije",
      category_diagnostics: "Dijagnostika",
      category_environment: "Okoliš",
      category_other: "Ostalo",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi signal",
      sensor_ssid: "SSID",
      sensor_uptime: "Vrijeme rada",
      sensor_uptime_sec: "Vrijeme rada (sekunde)",
      sensor_heap: "Slobodna memorija",
      sensor_power: "Snaga",
      sensor_apparent_power: "Prividna snaga",
      sensor_reactive_power: "Jalova snaga",
      sensor_power_factor: "Faktor snage",
      sensor_voltage: "Napon",
      sensor_current: "Struja",
      sensor_frequency: "Frekvencija",
      sensor_energy_total: "Ukupna energija",
      sensor_energy_last_hour: "Energija u zadnjem satu",
      sensor_energy_yesterday: "Energija jučer",
      sensor_temperature: "Temperatura",
      sensor_humidity: "Vlažnost",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nikad",
      releaseNotChecked: "Izdanje: još nije provjereno",
      releaseLabel: "Izdanje: {tag}",
      lastChecked: "Zadnja provjera: {date}",
      viewReleaseNotes: "Prikaži bilješke o izdanju",
      releasePublished: "Objavljeno: {date}",
      releaseNoNotes: "Nema dostupnih bilješki o izdanju.",
      viewOnGithub: "Prikaži na GitHubu",
      githubRepoTitle: "Otvori OpenBK7231T_App na GitHubu",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Predmemorija firmvera",
      cacheCleanupNow: "Očisti sada",
      cacheIntro: "Preuzeti firmver OpenBeken i generirane UF2 datoteke (pogledajte \"ESPHome ↔ OpenBeken\") pohranjuju se trajno i nikada se ne brišu same od sebe. Ovdje možete vidjeti što zauzima prostor, ukloniti pojedinačne datoteke i postaviti ograničenje za automatsko čišćenje - najstarije datoteke uvijek se brišu prve.",
      cacheColType: "Vrsta",
      cacheColLabel: "Oznaka",
      cacheColFile: "Datoteka",
      cacheColSize: "Veličina",
      cacheColDate: "Dodano",
      cacheLoading: "Učitavanje predmemorije…",
      cacheEmpty: "Predmemorija je prazna.",
      cacheKindFirmware: "Firmver",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} datoteka, ukupno {size}.",
      cacheMaxSizeLabel: "Maksimalna veličina predmemorije (MB)",
      cacheAutoCleanupLabel: "Automatski očisti nakon prekoračenja",
      cacheSaveSettings: "Spremi",
      cacheSettingsSaved: "Spremljeno.",
      cacheConfirmDelete: "Izbrisati ovu datoteku iz predmemorije?",
      cacheConfirmCleanup: "Izbrisati najstarije datoteke iz predmemorije dok se više ne premašuje postavljena veličina?",
      cacheCleanupNothing: "Predmemorija je već unutar postavljene veličine - ništa nije izbrisano.",
      cacheCleanupDone: "Izbrisano je {count} datoteka.",
      cacheAlertDeleteFailed: "Brisanje nije uspjelo: {msg}",
      cacheAlertCleanupFailed: "Čišćenje nije uspjelo: {msg}",
      cacheAlertSettingsFailed: "Spremanje nije uspjelo: {msg}",
      notifActive: "aktivan",
      notifInactive: "neaktivan",
      notifSave: "Spremi",
      notifTest: "Pošalji testnu poruku",
      notifRemove: "Ukloni",
      notifTestSending: "Slanje testne poruke…",
      notifTestSent: "Testna poruka je poslana.",
      notifTestFailed: "Neuspjelo: {msg}",
      noChannelYet: "Još nije postavljen kanal za obavijesti.",
      saveChannel: "Spremi kanal",
      notifHaLabel: "Cilj obavijesti u Home Assistantu",
      notifHaHint: "Naziv postojeće usluge <code>notify.*</code>, npr. \"mobile_app_phone\" ili \"persistent_notification\". Ništa drugo nije potrebno postaviti.",
      notifTelegramTokenLabel: "Token bota",
      notifTelegramTokenHint: "Od @BotFather u Telegramu: otvorite razgovor, pošaljite \"/newbot\" i slijedite upute.",
      notifTelegramChatIdLabel: "ID razgovora",
      notifTelegramChatIdHint: "Pošaljite poruku svom botu, a zatim otvorite https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates u pregledniku - \"chat\":{\"id\": ...} je vaš chat ID.",
      notifWhatsappPhoneLabel: "Broj telefona",
      notifWhatsappPhoneHint: "Uključujući pozivni broj države, npr. 491511234567.",
      notifWhatsappApikeyLabel: "API ključ (CallMeBot)",
      notifWhatsappApikeyHint: "Besplatan WhatsApp bot, bez potrebe za poslovnim računom na Meti: spremite +34 644 84 71 04 kao kontakt, pošaljite mu WhatsApp poruku \"I allow callmebot to send me messages\" i dobit ćete natrag svoj osobni API ključ putem WhatsAppa.",
      notifNameLabel: "Naziv",
      notifNamePlaceholder: "npr. Alexov telefon",
      notifMessageLabel: "Poruka",
      notifMessageHint: "Zamjenski znakovi: {version} = nova verzija firmvera, {devices} = pogođeni uređaji.",
      notifDefaultTemplate: "OpenBK7231T_App {version} je dostupan. Pogođeni uređaji: {devices}.",
      notifActiveLabel: "Aktivan",
      notifKeepUnchanged: "•••• (ostavite nepromijenjeno da ga zadržite)",
      notifApikeyPlaceholderExample: "npr. 123456",
      backupsHeader: "Sigurnosne kopije konfiguracije",
      backupsIntro: "Automatski sprema raspored GPIO pinova/kanala i skriptu naredbi za pokretanje uređaja prije svakog ažuriranja, kako biste mogli poništiti ažuriranje koje resetira ili ošteti njegovu konfiguraciju. Sigurnosnu kopiju možete pokrenuti i ručno za bilo koji uređaj u nastavku.",
      backupColDevice: "Uređaj",
      backupColTime: "Vrijeme",
      backupColReason: "Razlog",
      backupColVersion: "Firmver",
      backupReasonManual: "Ručno",
      backupReasonPreUpdate: "Prije ažuriranja",
      backupEmpty: "Još nema sigurnosnih kopija.",
      backupNowTitle: "Izradi sigurnosnu kopiju sada",
      backupRestoreTitle: "Vrati ovu konfiguraciju",
      backupDownloadTitle: "Preuzmi sigurnosnu kopiju",
      backupConfirmRestore: "Zaista vratiti ovu konfiguraciju na uređaj? Trenutne postavke pinova/kanala i naredba za pokretanje bit će prepisane.",
      backupAlertRestoreFailed: "Vraćanje nije uspjelo: {msg}",
      backupRestoredAlert: "Konfiguracija je vraćena.",
      backupConfirmDelete: "Zaista izbrisati ovu sigurnosnu kopiju?",
      backupAlertDeleteFailed: "Brisanje nije uspjelo: {msg}",
      backupAlertCreateFailed: "Izrada sigurnosne kopije nije uspjela: {msg}",
      sensor_reboot_count: "Ponovna pokretanja (procjena)",
      sensor_last_seen: "Zadnje viđeno",
    },
    cs: {
      checkRelease: "Zkontrolovat aktualizace",
      themeToggle: "Přepnout světlý/tmavý režim",
      updateAll: "Aktualizovat vše",
      devicesHeader: "Zařízení",
      scanNetwork: "Prohledat síť",
      addDevice: "Přidat zařízení",
      addIpPlaceholder: "IP adresa (např. 192.168.1.50)",
      addNamePlaceholder: "Název (volitelné)",
      addPasswordPlaceholder: "Heslo správce (pokud je nastaveno)",
      add: "Přidat",
      cancel: "Zrušit",
      colName: "Název",
      colIp: "IP",
      colChipset: "Čipset",
      colVersion: "Verze",
      colStatus: "Stav",
      colActions: "Akce",
      loadingDevices: "Načítání zařízení…",
      emptyDevices: "Zatím nebyla přidána žádná zařízení. Prohledejte síť nebo přidejte zařízení ručně.",
      scanResultsHeader: "Výsledky hledání",
      close: "Zavřít",
      notificationsHeader: "Oznámení",
      notificationsIntro: "Vyberte, jak chcete být upozorněni na vydání nového firmwaru OpenBK7231T_App. Můžete nastavit více kanálů najednou. Pokud není aktivní žádný kanál, doplněk použije běžné oznámení Home Assistant.",
      addChannel: "Přidat kanál",
      chooseChannelType: "Vyberte typ kanálu:",
      settingsHeader: "Nastavení",
      statusUpdating: "Aktualizuje se…",
      statusFailed: "Selhalo",
      statusTimeout: "Časový limit vypršel",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Pouze nahrávání přes UART/SPI",
      unknownVersion: "neznámá",
      newVersionPrefix: "nová: ",
      updateTitleUartOnly: "Tento čipset nepodporuje aktualizaci přes síť (pouze nahrávání přes UART/SPI).",
      updateTitleUpdating: "Aktualizace již probíhá.",
      updateTitleNoUpdateKnown: "Momentálně není známa žádná novější verze - přesto můžete kliknout a nahrát firmware znovu.",
      refreshTitle: "Znovu načíst zařízení",
      updateBtnLabel: "Aktualizace firmwaru",
      deleteTitle: "Odebrat zařízení",
      openDeviceTitle: "Otevřít zařízení v prohlížeči",
      confirmUpdateAll: "Aktualizovat nyní všechna zařízení, pro která je k dispozici aktualizace?",
      confirmUpdateDevice: "Spustit nyní aktualizaci firmwaru? Zařízení se poté restartuje.",
      confirmUpdateDeviceNoUpdate: "Momentálně není známa žádná novější verze. Přesto znovu nahrát firmware?",
      confirmDelete: "Odebrat toto zařízení ze seznamu?",
      confirmDeleteChannel: "Odebrat tento oznamovací kanál?",
      alertDeviceOffline: "Zařízení \"{name}\" neodpovídá (je offline nebo je nastaveno špatné heslo).",
      alertActionFailed: "Akce selhala: {msg}",
      alertRenameFailed: "Přejmenování selhalo: {msg}",
      alertCheckFailed: "Kontrola selhala: {msg}",
      alertUpdateAllFailed: "Aktualizace selhala: {msg}",
      alertNoUpdatesFound: "Nebyla nalezena žádná zařízení s dostupnou aktualizací.",
      alertUpdatesStarted: "{count} aktualizace/í spuštěno.\n{skippedCount} přeskočeno:\n{details}",
      alertUpdateFailedDetail: "Aktualizace selhala:\n\n{detail}",
      alertUpdateFailedGeneric: "Aktualizace selhala nebo vypršel časový limit. Další podrobnosti nejsou k dispozici.",
      alertAddFailed: "Přidání selhalo: {msg}",
      alertScanFailed: "Prohledávání selhalo: {msg}",
      alertSaveFailed: "Uložení selhalo: {msg}",
      alertDeleteChannelFailed: "Odebrání selhalo: {msg}",
      alertCreateChannelFailed: "Vytvoření selhalo: {msg}",
      alertSensorLabelSaveFailed: "Přejmenování senzoru selhalo: {msg}",
      bannerUpdateText: "Nový firmware je k dispozici pro {count} zařízení.",
      scanningStatus: "Prohledávání sítě… může to trvat až 20 sekund.",
      scanResultStatus: "Podsíť: {subnet} – nalezeno zařízení: {count}.",
      subnetUnknown: "neznámá",
      alreadyAdded: "již přidáno",
      addBtn: "Přidat",
      noDevicesFoundScan: "Nebyla nalezena žádná zařízení.",
      settingsScanSubnet: "Prohledávaná podsíť",
      settingsAuto: "automaticky",
      settingsPollInterval: "Interval dotazování",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Interval kontroly nových verzí",
      settingsHoursUnit: "h",
      settingsNotifications: "Oznámení",
      settingsEnabled: "zapnuto",
      settingsDisabled: "vypnuto",
      settingsFirmwarePort: "Port serveru s firmwarem",
      sensorLoading: "Načítání dat ze senzorů…",
      sensorNoData: "Toto zařízení nehlásí žádná data ze senzorů (např. není nainstalován měřič spotřeby / teplotní senzor).",
      sensorLoadError: "Data ze senzorů se nepodařilo načíst: {msg}",
      renameSensorPrompt: "Nový zobrazovaný název tohoto senzoru (ponechte prázdné pro obnovení):",
      category_wifi: "Připojení Wi-Fi",
      category_power: "Spotřeba energie",
      category_diagnostics: "Diagnostika",
      category_environment: "Prostředí",
      category_other: "Ostatní",
      sensor_rssi: "RSSI",
      sensor_signal: "Síla signálu Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Doba běhu",
      sensor_uptime_sec: "Doba běhu (v sekundách)",
      sensor_heap: "Volná paměť",
      sensor_power: "Výkon",
      sensor_apparent_power: "Zdánlivý výkon",
      sensor_reactive_power: "Jalový výkon",
      sensor_power_factor: "Účiník",
      sensor_voltage: "Napětí",
      sensor_current: "Proud",
      sensor_frequency: "Frekvence",
      sensor_energy_total: "Celková energie",
      sensor_energy_last_hour: "Energie za poslední hodinu",
      sensor_energy_yesterday: "Energie za včerejšek",
      sensor_temperature: "Teplota",
      sensor_humidity: "Vlhkost",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nikdy",
      releaseNotChecked: "Verze: zatím nezkontrolováno",
      releaseLabel: "Verze: {tag}",
      lastChecked: "Naposledy zkontrolováno: {date}",
      viewReleaseNotes: "Zobrazit poznámky k verzi",
      releasePublished: "Vydáno: {date}",
      releaseNoNotes: "Nejsou k dispozici žádné poznámky k verzi.",
      viewOnGithub: "Zobrazit na GitHubu",
      githubRepoTitle: "Otevřít OpenBK7231T_App na GitHubu",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Mezipaměť firmwaru",
      cacheCleanupNow: "Vyčistit nyní",
      cacheIntro: "Stažený firmware OpenBeken a vygenerované soubory UF2 (viz \"ESPHome ↔ OpenBeken\") se ukládají trvale a samy od sebe se nikdy nemažou. Zde vidíte, co zabírá místo, můžete odstranit jednotlivé soubory a nastavit limit pro automatické čištění - nejstarší soubory se vždy mažou jako první.",
      cacheColType: "Typ",
      cacheColLabel: "Popisek",
      cacheColFile: "Soubor",
      cacheColSize: "Velikost",
      cacheColDate: "Přidáno",
      cacheLoading: "Načítání mezipaměti…",
      cacheEmpty: "Mezipaměť je prázdná.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "Počet souborů: {count}, celkem {size}.",
      cacheMaxSizeLabel: "Maximální velikost mezipaměti (MB)",
      cacheAutoCleanupLabel: "Po překročení automaticky vyčistit",
      cacheSaveSettings: "Uložit",
      cacheSettingsSaved: "Uloženo.",
      cacheConfirmDelete: "Smazat tento soubor z mezipaměti?",
      cacheConfirmCleanup: "Smazat nejstarší soubory v mezipaměti, dokud nebude nastavená velikost dodržena?",
      cacheCleanupNothing: "Mezipaměť je již v rámci nastavené velikosti - nic nebylo smazáno.",
      cacheCleanupDone: "Smazáno souborů: {count}.",
      cacheAlertDeleteFailed: "Smazání selhalo: {msg}",
      cacheAlertCleanupFailed: "Čištění selhalo: {msg}",
      cacheAlertSettingsFailed: "Uložení selhalo: {msg}",
      notifActive: "aktivní",
      notifInactive: "neaktivní",
      notifSave: "Uložit",
      notifTest: "Odeslat testovací zprávu",
      notifRemove: "Odebrat",
      notifTestSending: "Odesílání testovací zprávy…",
      notifTestSent: "Testovací zpráva byla odeslána.",
      notifTestFailed: "Selhalo: {msg}",
      noChannelYet: "Zatím není nastaven žádný oznamovací kanál.",
      saveChannel: "Uložit kanál",
      notifHaLabel: "Cíl oznámení Home Assistant",
      notifHaHint: "Název existující služby <code>notify.*</code>, např. \"mobile_app_phone\" nebo \"persistent_notification\". Nic dalšího není potřeba nastavovat.",
      notifTelegramTokenLabel: "Token bota",
      notifTelegramTokenHint: "Získáte ho od @BotFather v Telegramu: otevřete chat, odešlete \"/newbot\" a postupujte podle pokynů.",
      notifTelegramChatIdLabel: "ID chatu",
      notifTelegramChatIdHint: "Pošlete svému botovi zprávu a poté v prohlížeči otevřete https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} je vaše ID chatu.",
      notifWhatsappPhoneLabel: "Telefonní číslo",
      notifWhatsappPhoneHint: "Včetně předvolby země, např. 491511234567.",
      notifWhatsappApikeyLabel: "API klíč (CallMeBot)",
      notifWhatsappApikeyHint: "Bezplatný WhatsApp bot, není potřeba firemní účet Meta: uložte si +34 644 84 71 04 jako kontakt, pošlete mu zprávu WhatsApp \"I allow callmebot to send me messages\" a svůj osobní API klíč dostanete zpět přes WhatsApp.",
      notifNameLabel: "Název",
      notifNamePlaceholder: "např. Petrův telefon",
      notifMessageLabel: "Zpráva",
      notifMessageHint: "Zástupné symboly: {version} = nová verze firmwaru, {devices} = dotčená zařízení.",
      notifDefaultTemplate: "Je k dispozici OpenBK7231T_App {version}. Dotčená zařízení: {devices}.",
      notifActiveLabel: "Aktivní",
      notifKeepUnchanged: "•••• (ponechte beze změny, chcete-li ho zachovat)",
      notifApikeyPlaceholderExample: "např. 123456",
      backupsHeader: "Zálohy konfigurace",
      backupsIntro: "Před každou aktualizací automaticky uloží mapování GPIO pinů/kanálů a skript spouštěcích příkazů zařízení, abyste mohli vrátit zpět aktualizaci, která resetuje nebo poškodí jeho konfiguraci. Zálohu můžete kdykoli spustit i ručně pro libovolné zařízení níže.",
      backupColDevice: "Zařízení",
      backupColTime: "Čas",
      backupColReason: "Důvod",
      backupColVersion: "Firmware",
      backupReasonManual: "Ručně",
      backupReasonPreUpdate: "Před aktualizací",
      backupEmpty: "Zatím žádné zálohy.",
      backupNowTitle: "Zálohovat konfiguraci nyní",
      backupRestoreTitle: "Obnovit tuto konfiguraci",
      backupDownloadTitle: "Stáhnout zálohu",
      backupConfirmRestore: "Opravdu obnovit tuto konfiguraci na zařízení? Aktuální nastavení pinů/kanálů a spouštěcí příkaz budou přepsány.",
      backupAlertRestoreFailed: "Obnovení selhalo: {msg}",
      backupRestoredAlert: "Konfigurace byla obnovena.",
      backupConfirmDelete: "Opravdu smazat tuto zálohu?",
      backupAlertDeleteFailed: "Smazání selhalo: {msg}",
      backupAlertCreateFailed: "Zálohování selhalo: {msg}",
      sensor_reboot_count: "Restarty (odhad)",
      sensor_last_seen: "Naposledy viděno",
    },
    da: {
      checkRelease: "Søg efter opdateringer",
      themeToggle: "Skift mellem lys/mørk tilstand",
      updateAll: "Opdater alle",
      devicesHeader: "Enheder",
      scanNetwork: "Scan netværk",
      addDevice: "Tilføj enhed",
      addIpPlaceholder: "IP-adresse (f.eks. 192.168.1.50)",
      addNamePlaceholder: "Navn (valgfrit)",
      addPasswordPlaceholder: "Administratoradgangskode (hvis angivet)",
      add: "Tilføj",
      cancel: "Annuller",
      colName: "Navn",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Version",
      colStatus: "Status",
      colActions: "Handlinger",
      loadingDevices: "Indlæser enheder…",
      emptyDevices: "Der er endnu ikke tilføjet nogen enheder. Scan netværket, eller tilføj en manuelt.",
      scanResultsHeader: "Scanningsresultater",
      close: "Luk",
      notificationsHeader: "Notifikationer",
      notificationsIntro: "Vælg, hvordan du vil have besked, når der udgives en ny OpenBK7231T_App-firmware. Du kan konfigurere flere kanaler samtidig. Hvis ingen kanal er aktiv, falder tilføjelsen tilbage på en almindelig Home Assistant-notifikation.",
      addChannel: "Tilføj kanal",
      chooseChannelType: "Vælg en kanaltype:",
      settingsHeader: "Indstillinger",
      statusUpdating: "Opdaterer…",
      statusFailed: "Mislykkedes",
      statusTimeout: "Timeout",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Kun UART/SPI-flashning",
      unknownVersion: "ukendt",
      newVersionPrefix: "ny: ",
      updateTitleUartOnly: "Dette chipset understøtter ikke opdatering via netværket (kun UART/SPI-flashning).",
      updateTitleUpdating: "Der er allerede en opdatering i gang.",
      updateTitleNoUpdateKnown: "Der er i øjeblikket ikke kendskab til en nyere version - klik alligevel for at genflashe firmwaren.",
      refreshTitle: "Forespørg enhed igen",
      updateBtnLabel: "Firmwareopdatering",
      deleteTitle: "Fjern enhed",
      openDeviceTitle: "Åbn enhed i browser",
      confirmUpdateAll: "Vil du opdatere alle enheder med en tilgængelig opdatering nu?",
      confirmUpdateDevice: "Vil du starte firmwareopdateringen nu? Enheden genstarter bagefter.",
      confirmUpdateDeviceNoUpdate: "Der er i øjeblikket ikke kendskab til en nyere version. Vil du genflashe firmwaren alligevel?",
      confirmDelete: "Vil du fjerne denne enhed fra listen?",
      confirmDeleteChannel: "Vil du fjerne denne notifikationskanal?",
      alertDeviceOffline: "Enheden \"{name}\" svarer ikke (offline eller forkert adgangskode).",
      alertActionFailed: "Handlingen mislykkedes: {msg}",
      alertRenameFailed: "Omdøbning mislykkedes: {msg}",
      alertCheckFailed: "Kontrol mislykkedes: {msg}",
      alertUpdateAllFailed: "Opdatering mislykkedes: {msg}",
      alertNoUpdatesFound: "Der blev ikke fundet nogen enheder med en tilgængelig opdatering.",
      alertUpdatesStarted: "{count} opdatering(er) startet.\n{skippedCount} sprunget over:\n{details}",
      alertUpdateFailedDetail: "Opdatering mislykkedes:\n\n{detail}",
      alertUpdateFailedGeneric: "Opdateringen mislykkedes eller fik timeout. Der er ingen yderligere detaljer tilgængelige.",
      alertAddFailed: "Tilføjelse mislykkedes: {msg}",
      alertScanFailed: "Scanning mislykkedes: {msg}",
      alertSaveFailed: "Gemning mislykkedes: {msg}",
      alertDeleteChannelFailed: "Fjernelse mislykkedes: {msg}",
      alertCreateChannelFailed: "Oprettelse mislykkedes: {msg}",
      alertSensorLabelSaveFailed: "Omdøbning af sensoren mislykkedes: {msg}",
      bannerUpdateText: "Ny firmware tilgængelig til {count} enhed(er).",
      scanningStatus: "Scanner netværk… det kan tage op til 20 sekunder.",
      scanResultStatus: "Subnet: {subnet} – {count} enhed(er) fundet.",
      subnetUnknown: "ukendt",
      alreadyAdded: "allerede tilføjet",
      addBtn: "Tilføj",
      noDevicesFoundScan: "Ingen enheder fundet.",
      settingsScanSubnet: "Subnet til scanning",
      settingsAuto: "automatisk",
      settingsPollInterval: "Pollinginterval",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Interval for kontrol af udgivelser",
      settingsHoursUnit: "t",
      settingsNotifications: "Notifikationer",
      settingsEnabled: "aktiveret",
      settingsDisabled: "deaktiveret",
      settingsFirmwarePort: "Port til firmwareserver",
      sensorLoading: "Indlæser sensordata…",
      sensorNoData: "Denne enhed rapporterer ingen sensordata (f.eks. ingen effektmåler/temperatursensor installeret).",
      sensorLoadError: "Kunne ikke indlæse sensordata: {msg}",
      renameSensorPrompt: "Nyt visningsnavn til denne sensor (lad stå tomt for at nulstille):",
      category_wifi: "Wi-Fi-forbindelse",
      category_power: "Strømforbrug",
      category_diagnostics: "Diagnostik",
      category_environment: "Miljø",
      category_other: "Andet",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi-signal",
      sensor_ssid: "SSID",
      sensor_uptime: "Oppetid",
      sensor_uptime_sec: "Oppetid (sekunder)",
      sensor_heap: "Ledig hukommelse",
      sensor_power: "Effekt",
      sensor_apparent_power: "Tilsyneladende effekt",
      sensor_reactive_power: "Reaktiv effekt",
      sensor_power_factor: "Effektfaktor",
      sensor_voltage: "Spænding",
      sensor_current: "Strøm",
      sensor_frequency: "Frekvens",
      sensor_energy_total: "Samlet energi",
      sensor_energy_last_hour: "Energi seneste time",
      sensor_energy_yesterday: "Energi i går",
      sensor_temperature: "Temperatur",
      sensor_humidity: "Luftfugtighed",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "aldrig",
      releaseNotChecked: "Udgivelse: endnu ikke kontrolleret",
      releaseLabel: "Udgivelse: {tag}",
      lastChecked: "Sidst kontrolleret: {date}",
      viewReleaseNotes: "Se udgivelsesnoter",
      releasePublished: "Udgivet: {date}",
      releaseNoNotes: "Ingen udgivelsesnoter tilgængelige.",
      viewOnGithub: "Se på GitHub",
      githubRepoTitle: "Åbn OpenBK7231T_App på GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Firmwarecache",
      cacheCleanupNow: "Ryd op nu",
      cacheIntro: "Downloadet OpenBeken-firmware og genererede UF2-filer (se \"ESPHome ↔ OpenBeken\") gemmes permanent og bliver aldrig slettet af sig selv. Her kan du se, hvad der fylder, fjerne enkelte filer og angive en grænse for automatisk oprydning - de ældste filer slettes altid først.",
      cacheColType: "Type",
      cacheColLabel: "Etiket",
      cacheColFile: "Fil",
      cacheColSize: "Størrelse",
      cacheColDate: "Tilføjet",
      cacheLoading: "Indlæser cache…",
      cacheEmpty: "Cachen er tom.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} fil(er), {size} i alt.",
      cacheMaxSizeLabel: "Maksimal cachestørrelse (MB)",
      cacheAutoCleanupLabel: "Ryd automatisk op, når grænsen overskrides",
      cacheSaveSettings: "Gem",
      cacheSettingsSaved: "Gemt.",
      cacheConfirmDelete: "Vil du slette denne fil fra cachen?",
      cacheConfirmCleanup: "Vil du slette de ældste cachede filer, indtil den konfigurerede størrelse ikke længere overskrides?",
      cacheCleanupNothing: "Cachen er allerede inden for den konfigurerede størrelse - intet blev slettet.",
      cacheCleanupDone: "{count} fil(er) slettet.",
      cacheAlertDeleteFailed: "Sletning mislykkedes: {msg}",
      cacheAlertCleanupFailed: "Oprydning mislykkedes: {msg}",
      cacheAlertSettingsFailed: "Gemning mislykkedes: {msg}",
      notifActive: "aktiv",
      notifInactive: "inaktiv",
      notifSave: "Gem",
      notifTest: "Send testbesked",
      notifRemove: "Fjern",
      notifTestSending: "Sender testbesked…",
      notifTestSent: "Testbeskeden blev sendt.",
      notifTestFailed: "Mislykkedes: {msg}",
      noChannelYet: "Der er endnu ikke konfigureret nogen notifikationskanal.",
      saveChannel: "Gem kanal",
      notifHaLabel: "Home Assistant-notifikationsmål",
      notifHaHint: "Navnet på en eksisterende <code>notify.*</code>-tjeneste, f.eks. \"mobile_app_phone\" eller \"persistent_notification\". Der er ikke andet, der skal konfigureres.",
      notifTelegramTokenLabel: "Bot-token",
      notifTelegramTokenHint: "Fra @BotFather i Telegram: åbn en chat, send \"/newbot\", og følg vejledningen.",
      notifTelegramChatIdLabel: "Chat-id",
      notifTelegramChatIdHint: "Send din bot en besked, og åbn derefter https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates i en browser - \"chat\":{\"id\": ...} er dit chat-id.",
      notifWhatsappPhoneLabel: "Telefonnummer",
      notifWhatsappPhoneHint: "Inklusive landekode, f.eks. 491511234567.",
      notifWhatsappApikeyLabel: "API-nøgle (CallMeBot)",
      notifWhatsappApikeyHint: "Gratis WhatsApp-bot, intet Meta-erhvervskonto nødvendigt: gem +34 644 84 71 04 som kontakt, send den WhatsApp-beskeden \"I allow callmebot to send me messages\", så får du din personlige API-nøgle tilbage via WhatsApp.",
      notifNameLabel: "Navn",
      notifNamePlaceholder: "f.eks. Alex' telefon",
      notifMessageLabel: "Besked",
      notifMessageHint: "Pladsholdere: {version} = ny firmwareversion, {devices} = berørte enheder.",
      notifDefaultTemplate: "OpenBK7231T_App {version} er tilgængelig. Berørte enheder: {devices}.",
      notifActiveLabel: "Aktiv",
      notifKeepUnchanged: "•••• (lad stå uændret for at beholde den)",
      notifApikeyPlaceholderExample: "f.eks. 123456",
      backupsHeader: "Konfigurationsbackup",
      backupsIntro: "Gemmer automatisk enhedens GPIO-pin-/kanaltilknytning og opstartskommando-script før hver opdatering, så du kan fortryde en opdatering, der nulstiller eller ødelægger dens konfiguration. Du kan også oprette en backup manuelt for enhver enhed nedenfor.",
      backupColDevice: "Enhed",
      backupColTime: "Tidspunkt",
      backupColReason: "Årsag",
      backupColVersion: "Firmware",
      backupReasonManual: "Manuel",
      backupReasonPreUpdate: "Før opdatering",
      backupEmpty: "Ingen backupper endnu.",
      backupNowTitle: "Sikkerhedskopiér konfiguration nu",
      backupRestoreTitle: "Gendan denne konfiguration",
      backupDownloadTitle: "Download backup",
      backupConfirmRestore: "Vil du virkelig gendanne denne konfiguration på enheden? De nuværende pin-/kanalindstillinger og opstartskommandoen bliver overskrevet.",
      backupAlertRestoreFailed: "Gendannelse mislykkedes: {msg}",
      backupRestoredAlert: "Konfiguration gendannet.",
      backupConfirmDelete: "Vil du virkelig slette denne backup?",
      backupAlertDeleteFailed: "Sletning mislykkedes: {msg}",
      backupAlertCreateFailed: "Backup mislykkedes: {msg}",
      sensor_reboot_count: "Genstarter (estimeret)",
      sensor_last_seen: "Sidst set",
    },
    nl: {
      checkRelease: "Controleren op updates",
      themeToggle: "Licht/donker thema wisselen",
      updateAll: "Alles bijwerken",
      devicesHeader: "Apparaten",
      scanNetwork: "Netwerk scannen",
      addDevice: "Apparaat toevoegen",
      addIpPlaceholder: "IP-adres (bijv. 192.168.1.50)",
      addNamePlaceholder: "Naam (optioneel)",
      addPasswordPlaceholder: "Beheerderswachtwoord (indien ingesteld)",
      add: "Toevoegen",
      cancel: "Annuleren",
      colName: "Naam",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Versie",
      colStatus: "Status",
      colActions: "Acties",
      loadingDevices: "Apparaten laden…",
      emptyDevices: "Nog geen apparaten toegevoegd. Scan het netwerk of voeg er handmatig een toe.",
      scanResultsHeader: "Scanresultaten",
      close: "Sluiten",
      notificationsHeader: "Meldingen",
      notificationsIntro: "Kies hoe je op de hoogte wilt worden gebracht wanneer er een nieuwe OpenBK7231T_App-firmware verschijnt. Je kunt meerdere kanalen tegelijk instellen. Is geen enkel kanaal actief, dan valt de add-on terug op een gewone Home Assistant-melding.",
      addChannel: "Kanaal toevoegen",
      chooseChannelType: "Kies een kanaaltype:",
      settingsHeader: "Instellingen",
      statusUpdating: "Bijwerken…",
      statusFailed: "Mislukt",
      statusTimeout: "Time-out",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Alleen flashen via UART/SPI",
      unknownVersion: "onbekend",
      newVersionPrefix: "nieuw: ",
      updateTitleUartOnly: "Deze chipset ondersteunt geen update via het netwerk (alleen flashen via UART/SPI).",
      updateTitleUpdating: "Er is al een update bezig.",
      updateTitleNoUpdateKnown: "Er is momenteel geen nieuwere versie bekend - klik toch om de firmware opnieuw te flashen.",
      refreshTitle: "Apparaat opnieuw bevragen",
      updateBtnLabel: "Firmware-update",
      deleteTitle: "Apparaat verwijderen",
      openDeviceTitle: "Apparaat openen in browser",
      confirmUpdateAll: "Nu alle apparaten bijwerken waarvoor een update beschikbaar is?",
      confirmUpdateDevice: "Nu de firmware-update starten? Het apparaat start daarna opnieuw op.",
      confirmUpdateDeviceNoUpdate: "Er is momenteel geen nieuwere versie bekend. Toch de firmware opnieuw flashen?",
      confirmDelete: "Dit apparaat uit de lijst verwijderen?",
      confirmDeleteChannel: "Dit meldingskanaal verwijderen?",
      alertDeviceOffline: "Apparaat \"{name}\" reageert niet (offline of onjuist wachtwoord).",
      alertActionFailed: "Actie mislukt: {msg}",
      alertRenameFailed: "Hernoemen mislukt: {msg}",
      alertCheckFailed: "Controle mislukt: {msg}",
      alertUpdateAllFailed: "Update mislukt: {msg}",
      alertNoUpdatesFound: "Er zijn geen apparaten gevonden met een beschikbare update.",
      alertUpdatesStarted: "{count} update(s) gestart.\n{skippedCount} overgeslagen:\n{details}",
      alertUpdateFailedDetail: "Update mislukt:\n\n{detail}",
      alertUpdateFailedGeneric: "De update is mislukt of heeft een time-out gehad. Er zijn geen verdere details beschikbaar.",
      alertAddFailed: "Toevoegen mislukt: {msg}",
      alertScanFailed: "Scannen mislukt: {msg}",
      alertSaveFailed: "Opslaan mislukt: {msg}",
      alertDeleteChannelFailed: "Verwijderen mislukt: {msg}",
      alertCreateChannelFailed: "Aanmaken mislukt: {msg}",
      alertSensorLabelSaveFailed: "Hernoemen van de sensor mislukt: {msg}",
      bannerUpdateText: "Nieuwe firmware beschikbaar voor {count} apparaat/apparaten.",
      scanningStatus: "Netwerk scannen… dit kan tot 20 seconden duren.",
      scanResultStatus: "Subnet: {subnet} – {count} apparaat/apparaten gevonden.",
      subnetUnknown: "onbekend",
      alreadyAdded: "al toegevoegd",
      addBtn: "Toevoegen",
      noDevicesFoundScan: "Geen apparaten gevonden.",
      settingsScanSubnet: "Te scannen subnet",
      settingsAuto: "automatisch",
      settingsPollInterval: "Poll-interval",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Interval voor releasecontrole",
      settingsHoursUnit: "u",
      settingsNotifications: "Meldingen",
      settingsEnabled: "ingeschakeld",
      settingsDisabled: "uitgeschakeld",
      settingsFirmwarePort: "Poort van de firmwareserver",
      sensorLoading: "Sensorgegevens laden…",
      sensorNoData: "Dit apparaat rapporteert geen sensorgegevens (bijv. geen energiemeter/temperatuursensor geïnstalleerd).",
      sensorLoadError: "Kan sensorgegevens niet laden: {msg}",
      renameSensorPrompt: "Nieuwe weergavenaam voor deze sensor (laat leeg om te resetten):",
      category_wifi: "Wifi-verbinding",
      category_power: "Stroomverbruik",
      category_diagnostics: "Diagnostiek",
      category_environment: "Omgeving",
      category_other: "Overig",
      sensor_rssi: "RSSI",
      sensor_signal: "Wifi-signaal",
      sensor_ssid: "SSID",
      sensor_uptime: "Uptime",
      sensor_uptime_sec: "Uptime (seconden)",
      sensor_heap: "Vrij geheugen",
      sensor_power: "Vermogen",
      sensor_apparent_power: "Schijnbaar vermogen",
      sensor_reactive_power: "Blindvermogen",
      sensor_power_factor: "Vermogensfactor",
      sensor_voltage: "Spanning",
      sensor_current: "Stroom",
      sensor_frequency: "Frequentie",
      sensor_energy_total: "Totale energie",
      sensor_energy_last_hour: "Energie afgelopen uur",
      sensor_energy_yesterday: "Energie gisteren",
      sensor_temperature: "Temperatuur",
      sensor_humidity: "Luchtvochtigheid",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nooit",
      releaseNotChecked: "Release: nog niet gecontroleerd",
      releaseLabel: "Release: {tag}",
      lastChecked: "Laatst gecontroleerd: {date}",
      viewReleaseNotes: "Releasenotities bekijken",
      releasePublished: "Gepubliceerd op: {date}",
      releaseNoNotes: "Geen releasenotities beschikbaar.",
      viewOnGithub: "Bekijken op GitHub",
      githubRepoTitle: "OpenBK7231T_App openen op GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Firmwarecache",
      cacheCleanupNow: "Nu opschonen",
      cacheIntro: "Gedownloade OpenBeken-firmware en gegenereerde UF2-bestanden (zie \"ESPHome ↔ OpenBeken\") worden permanent bewaard en nooit vanzelf verwijderd. Hier zie je wat ruimte inneemt, kun je losse bestanden verwijderen en een limiet voor automatisch opschonen instellen - de oudste bestanden worden altijd als eerste verwijderd.",
      cacheColType: "Type",
      cacheColLabel: "Label",
      cacheColFile: "Bestand",
      cacheColSize: "Grootte",
      cacheColDate: "Toegevoegd",
      cacheLoading: "Cache laden…",
      cacheEmpty: "Cache is leeg.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} bestand(en), {size} totaal.",
      cacheMaxSizeLabel: "Maximale cachegrootte (MB)",
      cacheAutoCleanupLabel: "Automatisch opschonen zodra de limiet is overschreden",
      cacheSaveSettings: "Opslaan",
      cacheSettingsSaved: "Opgeslagen.",
      cacheConfirmDelete: "Dit bestand uit de cache verwijderen?",
      cacheConfirmCleanup: "De oudste gecachte bestanden verwijderen totdat de ingestelde grootte niet meer wordt overschreden?",
      cacheCleanupNothing: "De cache valt al binnen de ingestelde grootte - er is niets verwijderd.",
      cacheCleanupDone: "{count} bestand(en) verwijderd.",
      cacheAlertDeleteFailed: "Verwijderen mislukt: {msg}",
      cacheAlertCleanupFailed: "Opschonen mislukt: {msg}",
      cacheAlertSettingsFailed: "Opslaan mislukt: {msg}",
      notifActive: "actief",
      notifInactive: "inactief",
      notifSave: "Opslaan",
      notifTest: "Testbericht versturen",
      notifRemove: "Verwijderen",
      notifTestSending: "Testbericht versturen…",
      notifTestSent: "Het testbericht is verzonden.",
      notifTestFailed: "Mislukt: {msg}",
      noChannelYet: "Nog geen meldingskanaal ingesteld.",
      saveChannel: "Kanaal opslaan",
      notifHaLabel: "Home Assistant-meldingsdoel",
      notifHaHint: "De naam van een bestaande <code>notify.*</code>-service, bijv. \"mobile_app_phone\" of \"persistent_notification\". Verder hoef je niets in te stellen.",
      notifTelegramTokenLabel: "Bot-token",
      notifTelegramTokenHint: "Via @BotFather in Telegram: open een chat, stuur \"/newbot\" en volg de instructies.",
      notifTelegramChatIdLabel: "Chat-ID",
      notifTelegramChatIdHint: "Stuur je bot een bericht en open vervolgens https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates in een browser - \"chat\":{\"id\": ...} is je chat-ID.",
      notifWhatsappPhoneLabel: "Telefoonnummer",
      notifWhatsappPhoneHint: "Inclusief landcode, bijv. 491511234567.",
      notifWhatsappApikeyLabel: "API-sleutel (CallMeBot)",
      notifWhatsappApikeyHint: "Gratis WhatsApp-bot, geen Meta-zakelijk account nodig: sla +34 644 84 71 04 op als contact, stuur het het WhatsApp-bericht \"I allow callmebot to send me messages\" en je krijgt je persoonlijke API-sleutel terug via WhatsApp.",
      notifNameLabel: "Naam",
      notifNamePlaceholder: "bijv. Alex' telefoon",
      notifMessageLabel: "Bericht",
      notifMessageHint: "Plaatshouders: {version} = nieuwe firmwareversie, {devices} = betrokken apparaten.",
      notifDefaultTemplate: "OpenBK7231T_App {version} is beschikbaar. Betrokken apparaten: {devices}.",
      notifActiveLabel: "Actief",
      notifKeepUnchanged: "•••• (laat ongewijzigd om te behouden)",
      notifApikeyPlaceholderExample: "bijv. 123456",
      backupsHeader: "Configuratiebackups",
      backupsIntro: "Slaat automatisch de GPIO-pin-/kanaaltoewijzing en het opstartcommando-script van een apparaat op vóór elke update, zodat je een update die de configuratie reset of beschadigt ongedaan kunt maken. Je kunt hieronder ook handmatig een back-up maken voor elk apparaat.",
      backupColDevice: "Apparaat",
      backupColTime: "Tijdstip",
      backupColReason: "Reden",
      backupColVersion: "Firmware",
      backupReasonManual: "Handmatig",
      backupReasonPreUpdate: "Vóór update",
      backupEmpty: "Nog geen back-ups.",
      backupNowTitle: "Configuratie nu back-uppen",
      backupRestoreTitle: "Deze configuratie herstellen",
      backupDownloadTitle: "Back-up downloaden",
      backupConfirmRestore: "Deze configuratie echt terugzetten op het apparaat? De huidige pin-/kanaalinstellingen en het opstartcommando worden overschreven.",
      backupAlertRestoreFailed: "Herstellen mislukt: {msg}",
      backupRestoredAlert: "Configuratie hersteld.",
      backupConfirmDelete: "Deze back-up echt verwijderen?",
      backupAlertDeleteFailed: "Verwijderen mislukt: {msg}",
      backupAlertCreateFailed: "Back-up maken mislukt: {msg}",
      sensor_reboot_count: "Herstarts (geschat)",
      sensor_last_seen: "Laatst gezien",
    },
    et: {
      checkRelease: "Kontrolli värskendusi",
      themeToggle: "Lülita hele/tume režiim",
      updateAll: "Värskenda kõiki",
      devicesHeader: "Seadmed",
      scanNetwork: "Skanni võrku",
      addDevice: "Lisa seade",
      addIpPlaceholder: "IP-aadress (nt 192.168.1.50)",
      addNamePlaceholder: "Nimi (valikuline)",
      addPasswordPlaceholder: "Administraatori parool (kui on määratud)",
      add: "Lisa",
      cancel: "Tühista",
      colName: "Nimi",
      colIp: "IP",
      colChipset: "Kiibistik",
      colVersion: "Versioon",
      colStatus: "Olek",
      colActions: "Toimingud",
      loadingDevices: "Seadmete laadimine…",
      emptyDevices: "Ühtegi seadet pole veel lisatud. Skanni võrku või lisa seade käsitsi.",
      scanResultsHeader: "Skannimise tulemused",
      close: "Sulge",
      notificationsHeader: "Teavitused",
      notificationsIntro: "Vali, kuidas soovid saada teavitusi, kui ilmub uus OpenBK7231T_App püsivara. Korraga saab seadistada mitu kanalit. Kui ükski kanal pole aktiivne, kasutab lisandmoodul tavalist Home Assistanti teavitust.",
      addChannel: "Lisa kanal",
      chooseChannelType: "Vali kanali tüüp:",
      settingsHeader: "Seaded",
      statusUpdating: "Värskendamine…",
      statusFailed: "Ebaõnnestus",
      statusTimeout: "Aegumine",
      statusOffline: "Võrguühenduseta",
      statusOnline: "Ühendatud",
      uartOnlyHint: "Ainult flashimine läbi UART/SPI",
      unknownVersion: "teadmata",
      newVersionPrefix: "uus: ",
      updateTitleUartOnly: "See kiibistik ei toeta võrgu kaudu värskendamist (ainult flashimine läbi UART/SPI).",
      updateTitleUpdating: "Värskendamine on juba käimas.",
      updateTitleNoUpdateKnown: "Praegu ei ole teada uuemat versiooni - vajuta ikkagi püsivara uuesti flashimiseks.",
      refreshTitle: "Küsitle seadet uuesti",
      updateBtnLabel: "Püsivara värskendus",
      deleteTitle: "Eemalda seade",
      openDeviceTitle: "Ava seade brauseris",
      confirmUpdateAll: "Kas värskendada kohe kõik seadmed, millel on saadaval värskendus?",
      confirmUpdateDevice: "Kas alustada püsivara värskendust kohe? Seade taaskäivitub seejärel.",
      confirmUpdateDeviceNoUpdate: "Praegu ei ole teada uuemat versiooni. Kas flashida püsivara ikkagi uuesti?",
      confirmDelete: "Kas eemaldada see seade loendist?",
      confirmDeleteChannel: "Kas eemaldada see teavituskanal?",
      alertDeviceOffline: "Seade \"{name}\" ei vasta (võrguühenduseta või vale parool).",
      alertActionFailed: "Toiming ebaõnnestus: {msg}",
      alertRenameFailed: "Ümbernimetamine ebaõnnestus: {msg}",
      alertCheckFailed: "Kontroll ebaõnnestus: {msg}",
      alertUpdateAllFailed: "Värskendamine ebaõnnestus: {msg}",
      alertNoUpdatesFound: "Ühtegi saadaoleva värskendusega seadet ei leitud.",
      alertUpdatesStarted: "Käivitati {count} värskendust.\nVahele jäeti {skippedCount}:\n{details}",
      alertUpdateFailedDetail: "Värskendamine ebaõnnestus:\n\n{detail}",
      alertUpdateFailedGeneric: "Värskendamine ebaõnnestus või aegus. Täpsemad üksikasjad puuduvad.",
      alertAddFailed: "Lisamine ebaõnnestus: {msg}",
      alertScanFailed: "Skannimine ebaõnnestus: {msg}",
      alertSaveFailed: "Salvestamine ebaõnnestus: {msg}",
      alertDeleteChannelFailed: "Eemaldamine ebaõnnestus: {msg}",
      alertCreateChannelFailed: "Loomine ebaõnnestus: {msg}",
      alertSensorLabelSaveFailed: "Anduri ümbernimetamine ebaõnnestus: {msg}",
      bannerUpdateText: "Uus püsivara saadaval {count} seadmele.",
      scanningStatus: "Võrgu skannimine… see võib kesta kuni 20 sekundit.",
      scanResultStatus: "Alamvõrk: {subnet} – leiti {count} seade(t).",
      subnetUnknown: "teadmata",
      alreadyAdded: "juba lisatud",
      addBtn: "Lisa",
      noDevicesFoundScan: "Ühtegi seadet ei leitud.",
      settingsScanSubnet: "Skannitav alamvõrk",
      settingsAuto: "automaatne",
      settingsPollInterval: "Küsitlusintervall",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Väljalaske kontrolli intervall",
      settingsHoursUnit: "h",
      settingsNotifications: "Teavitused",
      settingsEnabled: "lubatud",
      settingsDisabled: "keelatud",
      settingsFirmwarePort: "Püsivara serveri port",
      sensorLoading: "Anduri andmete laadimine…",
      sensorNoData: "See seade ei edasta anduriandmeid (nt puudub paigaldatud voolumõõtur või temperatuuriandur).",
      sensorLoadError: "Anduri andmeid ei õnnestunud laadida: {msg}",
      renameSensorPrompt: "Selle anduri uus kuvatav nimi (jäta tühjaks lähtestamiseks):",
      category_wifi: "Wi-Fi ühendus",
      category_power: "Energiatarve",
      category_diagnostics: "Diagnostika",
      category_environment: "Keskkond",
      category_other: "Muu",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi signaal",
      sensor_ssid: "SSID",
      sensor_uptime: "Töötamise aeg",
      sensor_uptime_sec: "Töötamise aeg (sekundites)",
      sensor_heap: "Vaba mälu",
      sensor_power: "Võimsus",
      sensor_apparent_power: "Näiline võimsus",
      sensor_reactive_power: "Reaktiivvõimsus",
      sensor_power_factor: "Võimsustegur",
      sensor_voltage: "Pinge",
      sensor_current: "Vool",
      sensor_frequency: "Sagedus",
      sensor_energy_total: "Koguenergia",
      sensor_energy_last_hour: "Energia viimasel tunnil",
      sensor_energy_yesterday: "Energia eile",
      sensor_temperature: "Temperatuur",
      sensor_humidity: "Õhuniiskus",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "mitte kunagi",
      releaseNotChecked: "Väljalase: pole veel kontrollitud",
      releaseLabel: "Väljalase: {tag}",
      lastChecked: "Viimati kontrollitud: {date}",
      viewReleaseNotes: "Vaata väljalaske märkmeid",
      releasePublished: "Avaldatud: {date}",
      releaseNoNotes: "Väljalaske märkmed puuduvad.",
      viewOnGithub: "Vaata GitHubis",
      githubRepoTitle: "Ava OpenBK7231T_App GitHubis",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Püsivara vahemälu",
      cacheCleanupNow: "Korista kohe",
      cacheIntro: "Allalaaditud OpenBekeni püsivara ja loodud UF2 failid (vt \"ESPHome ↔ OpenBeken\") salvestatakse püsivalt ega kustu kunagi iseenesest. Siin näed, mis ruumi võtab, saad kustutada üksikuid faile ja seada automaatse koristuse piirmäära - vanimad failid kustutatakse alati esimesena.",
      cacheColType: "Tüüp",
      cacheColLabel: "Silt",
      cacheColFile: "Fail",
      cacheColSize: "Suurus",
      cacheColDate: "Lisatud",
      cacheLoading: "Vahemälu laadimine…",
      cacheEmpty: "Vahemälu on tühi.",
      cacheKindFirmware: "Püsivara",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} faili, kokku {size}.",
      cacheMaxSizeLabel: "Vahemälu maksimaalne suurus (MB)",
      cacheAutoCleanupLabel: "Korista automaatselt, kui piir on ületatud",
      cacheSaveSettings: "Salvesta",
      cacheSettingsSaved: "Salvestatud.",
      cacheConfirmDelete: "Kas kustutada see fail vahemälust?",
      cacheConfirmCleanup: "Kas kustutada vanimad vahemälus olevad failid, kuni määratud suurust enam ei ületata?",
      cacheCleanupNothing: "Vahemälu on juba määratud suuruse piires - midagi ei kustutatud.",
      cacheCleanupDone: "Kustutati {count} faili.",
      cacheAlertDeleteFailed: "Kustutamine ebaõnnestus: {msg}",
      cacheAlertCleanupFailed: "Koristamine ebaõnnestus: {msg}",
      cacheAlertSettingsFailed: "Salvestamine ebaõnnestus: {msg}",
      notifActive: "aktiivne",
      notifInactive: "mitteaktiivne",
      notifSave: "Salvesta",
      notifTest: "Saada testsõnum",
      notifRemove: "Eemalda",
      notifTestSending: "Testsõnumi saatmine…",
      notifTestSent: "Testsõnum saadeti.",
      notifTestFailed: "Ebaõnnestus: {msg}",
      noChannelYet: "Ühtegi teavituskanalit pole veel seadistatud.",
      saveChannel: "Salvesta kanal",
      notifHaLabel: "Home Assistanti teavituse sihtmärk",
      notifHaHint: "Olemasoleva <code>notify.*</code> teenuse nimi, nt \"mobile_app_phone\" või \"persistent_notification\". Muud pole vaja seadistada.",
      notifTelegramTokenLabel: "Boti token",
      notifTelegramTokenHint: "Aadressilt @BotFather Telegramis: ava vestlus, saada \"/newbot\" ja järgi juhiseid.",
      notifTelegramChatIdLabel: "Vestluse ID",
      notifTelegramChatIdHint: "Saada oma botile sõnum ja seejärel ava brauseris https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} on sinu chat ID.",
      notifWhatsappPhoneLabel: "Telefoninumber",
      notifWhatsappPhoneHint: "Koos riigikoodiga, nt 491511234567.",
      notifWhatsappApikeyLabel: "API-võti (CallMeBot)",
      notifWhatsappApikeyHint: "Tasuta WhatsAppi bot, Meta ärikontot pole vaja: salvesta +34 644 84 71 04 kontaktiks, saada talle WhatsAppi sõnum \"I allow callmebot to send me messages\" ja saad oma isikliku API-võtme tagasi WhatsAppi teel.",
      notifNameLabel: "Nimi",
      notifNamePlaceholder: "nt Alexi telefon",
      notifMessageLabel: "Sõnum",
      notifMessageHint: "Kohahoidjad: {version} = uus püsivara versioon, {devices} = mõjutatud seadmed.",
      notifDefaultTemplate: "OpenBK7231T_App {version} on saadaval. Mõjutatud seadmed: {devices}.",
      notifActiveLabel: "Aktiivne",
      notifKeepUnchanged: "•••• (jäta muutmata, et see säiliks)",
      notifApikeyPlaceholderExample: "nt 123456",
      backupsHeader: "Seadistuse varukoopiad",
      backupsIntro: "Salvestab enne iga uuendust automaatselt seadme GPIO-viikude/kanalite vastenduse ja käivitusskripti, et saaksid tühistada uuenduse, mis lähtestab või rikub selle seadistuse. Varukoopia saab allpool luua ka käsitsi mis tahes seadme jaoks.",
      backupColDevice: "Seade",
      backupColTime: "Aeg",
      backupColReason: "Põhjus",
      backupColVersion: "Püsivara",
      backupReasonManual: "Käsitsi",
      backupReasonPreUpdate: "Enne uuendust",
      backupEmpty: "Varukoopiaid pole veel.",
      backupNowTitle: "Salvesta seadistus praegu",
      backupRestoreTitle: "Taasta see seadistus",
      backupDownloadTitle: "Laadi varukoopia alla",
      backupConfirmRestore: "Kas taastada see seadistus tõesti seadmesse? Praegused viigu-/kanaliseaded ja käivituskäsk kirjutatakse üle.",
      backupAlertRestoreFailed: "Taastamine ebaõnnestus: {msg}",
      backupRestoredAlert: "Seadistus taastatud.",
      backupConfirmDelete: "Kas see varukoopia tõesti kustutada?",
      backupAlertDeleteFailed: "Kustutamine ebaõnnestus: {msg}",
      backupAlertCreateFailed: "Varundamine ebaõnnestus: {msg}",
      sensor_reboot_count: "Taaskäivitused (hinnanguline)",
      sensor_last_seen: "Viimati nähtud",
    },
    fi: {
      checkRelease: "Tarkista päivitykset",
      themeToggle: "Vaihda vaalea/tumma tila",
      updateAll: "Päivitä kaikki",
      devicesHeader: "Laitteet",
      scanNetwork: "Skannaa verkko",
      addDevice: "Lisää laite",
      addIpPlaceholder: "IP-osoite (esim. 192.168.1.50)",
      addNamePlaceholder: "Nimi (valinnainen)",
      addPasswordPlaceholder: "Järjestelmänvalvojan salasana (jos asetettu)",
      add: "Lisää",
      cancel: "Peruuta",
      colName: "Nimi",
      colIp: "IP",
      colChipset: "Piirisarja",
      colVersion: "Versio",
      colStatus: "Tila",
      colActions: "Toiminnot",
      loadingDevices: "Ladataan laitteita…",
      emptyDevices: "Laitteita ei ole vielä lisätty. Skannaa verkko tai lisää laite manuaalisesti.",
      scanResultsHeader: "Skannaustulokset",
      close: "Sulje",
      notificationsHeader: "Ilmoitukset",
      notificationsIntro: "Valitse, miten haluat saada ilmoituksen, kun uusi OpenBK7231T_App-laiteohjelmisto julkaistaan. Voit ottaa käyttöön useita kanavia samanaikaisesti. Jos yksikään kanava ei ole aktiivinen, lisäosa käyttää tavallista Home Assistant -ilmoitusta.",
      addChannel: "Lisää kanava",
      chooseChannelType: "Valitse kanavan tyyppi:",
      settingsHeader: "Asetukset",
      statusUpdating: "Päivitetään…",
      statusFailed: "Epäonnistui",
      statusTimeout: "Aikakatkaisu",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Vain UART/SPI-vilkutus",
      unknownVersion: "tuntematon",
      newVersionPrefix: "uusi: ",
      updateTitleUartOnly: "Tämä piirisarja ei tue verkkopäivitystä (vain UART/SPI-vilkutus).",
      updateTitleUpdating: "Päivitys on jo käynnissä.",
      updateTitleNoUpdateKnown: "Uudempaa versiota ei tällä hetkellä tiedossa - voit silti klikata vilkuttaaksesi laiteohjelmiston uudelleen.",
      refreshTitle: "Päivitä laitteen tiedot",
      updateBtnLabel: "Laiteohjelmistopäivitys",
      deleteTitle: "Poista laite",
      openDeviceTitle: "Avaa laite selaimessa",
      confirmUpdateAll: "Päivitetäänkö kaikki laitteet, joille on saatavilla päivitys, nyt?",
      confirmUpdateDevice: "Käynnistetäänkö laiteohjelmistopäivitys nyt? Laite käynnistyy sen jälkeen uudelleen.",
      confirmUpdateDeviceNoUpdate: "Uudempaa versiota ei tällä hetkellä tiedossa. Vilkutetaanko laiteohjelmisto silti uudelleen?",
      confirmDelete: "Poistetaanko tämä laite listalta?",
      confirmDeleteChannel: "Poistetaanko tämä ilmoituskanava?",
      alertDeviceOffline: "Laite \"{name}\" ei vastaa (offline-tilassa tai väärä salasana).",
      alertActionFailed: "Toiminto epäonnistui: {msg}",
      alertRenameFailed: "Nimen vaihto epäonnistui: {msg}",
      alertCheckFailed: "Tarkistus epäonnistui: {msg}",
      alertUpdateAllFailed: "Päivitys epäonnistui: {msg}",
      alertNoUpdatesFound: "Laitteita, joille on saatavilla päivitys, ei löytynyt.",
      alertUpdatesStarted: "{count} päivitys(tä) käynnistetty.\n{skippedCount} ohitettu:\n{details}",
      alertUpdateFailedDetail: "Päivitys epäonnistui:\n\n{detail}",
      alertUpdateFailedGeneric: "Päivitys epäonnistui tai aikakatkaistiin. Lisätietoja ei ole saatavilla.",
      alertAddFailed: "Lisäys epäonnistui: {msg}",
      alertScanFailed: "Skannaus epäonnistui: {msg}",
      alertSaveFailed: "Tallennus epäonnistui: {msg}",
      alertDeleteChannelFailed: "Poistaminen epäonnistui: {msg}",
      alertCreateChannelFailed: "Luonti epäonnistui: {msg}",
      alertSensorLabelSaveFailed: "Anturin nimeäminen epäonnistui: {msg}",
      bannerUpdateText: "Uusi laiteohjelmisto saatavilla {count} laitteelle.",
      scanningStatus: "Skannataan verkkoa… tämä voi kestää jopa 20 sekuntia.",
      scanResultStatus: "Aliverkko: {subnet} – {count} laitetta löytyi.",
      subnetUnknown: "tuntematon",
      alreadyAdded: "jo lisätty",
      addBtn: "Lisää",
      noDevicesFoundScan: "Laitteita ei löytynyt.",
      settingsScanSubnet: "Skannattava aliverkko",
      settingsAuto: "automaattinen",
      settingsPollInterval: "Kyselyväli",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Julkaisujen tarkistusväli",
      settingsHoursUnit: "h",
      settingsNotifications: "Ilmoitukset",
      settingsEnabled: "käytössä",
      settingsDisabled: "pois käytöstä",
      settingsFirmwarePort: "Laiteohjelmistopalvelimen portti",
      sensorLoading: "Ladataan anturitietoja…",
      sensorNoData: "Tämä laite ei raportoi anturitietoja (esim. tehomittaria/lämpötila-anturia ei ole asennettu).",
      sensorLoadError: "Anturitietoja ei voitu ladata: {msg}",
      renameSensorPrompt: "Uusi näyttönimi tälle anturille (jätä tyhjäksi palauttaaksesi oletuksen):",
      category_wifi: "Wi-Fi-yhteys",
      category_power: "Virrankulutus",
      category_diagnostics: "Diagnostiikka",
      category_environment: "Ympäristö",
      category_other: "Muu",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi-signaali",
      sensor_ssid: "SSID",
      sensor_uptime: "Käyttöaika",
      sensor_uptime_sec: "Käyttöaika (sekunteina)",
      sensor_heap: "Vapaa muisti",
      sensor_power: "Teho",
      sensor_apparent_power: "Näennäisteho",
      sensor_reactive_power: "Loisteho",
      sensor_power_factor: "Tehokerroin",
      sensor_voltage: "Jännite",
      sensor_current: "Virta",
      sensor_frequency: "Taajuus",
      sensor_energy_total: "Kokonaisenergia",
      sensor_energy_last_hour: "Energia viime tunnilta",
      sensor_energy_yesterday: "Energia eilen",
      sensor_temperature: "Lämpötila",
      sensor_humidity: "Kosteus",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "ei koskaan",
      releaseNotChecked: "Julkaisu: ei vielä tarkistettu",
      releaseLabel: "Julkaisu: {tag}",
      lastChecked: "Viimeksi tarkistettu: {date}",
      viewReleaseNotes: "Näytä julkaisutiedot",
      releasePublished: "Julkaistu: {date}",
      releaseNoNotes: "Julkaisutietoja ei ole saatavilla.",
      viewOnGithub: "Näytä GitHubissa",
      githubRepoTitle: "Avaa OpenBK7231T_App GitHubissa",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Laiteohjelmistovälimuisti",
      cacheCleanupNow: "Siivoa nyt",
      cacheIntro: "Ladatut OpenBeken-laiteohjelmistot ja luodut UF2-tiedostot (katso \"ESPHome ↔ OpenBeken\") tallennetaan pysyvästi eikä niitä poisteta koskaan itsestään. Täältä näet, mikä vie tilaa, voit poistaa yksittäisiä tiedostoja ja asettaa automaattisen siivousrajan - vanhimmat tiedostot poistetaan aina ensin.",
      cacheColType: "Tyyppi",
      cacheColLabel: "Nimike",
      cacheColFile: "Tiedosto",
      cacheColSize: "Koko",
      cacheColDate: "Lisätty",
      cacheLoading: "Ladataan välimuistia…",
      cacheEmpty: "Välimuisti on tyhjä.",
      cacheKindFirmware: "Laiteohjelmisto",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} tiedostoa, yhteensä {size}.",
      cacheMaxSizeLabel: "Välimuistin enimmäiskoko (Mt)",
      cacheAutoCleanupLabel: "Siivoa automaattisesti, kun raja ylittyy",
      cacheSaveSettings: "Tallenna",
      cacheSettingsSaved: "Tallennettu.",
      cacheConfirmDelete: "Poistetaanko tämä tiedosto välimuistista?",
      cacheConfirmCleanup: "Poistetaanko vanhimmat välimuistissa olevat tiedostot, kunnes asetettu koko ei enää ylity?",
      cacheCleanupNothing: "Välimuisti on jo asetetun koon rajoissa - mitään ei poistettu.",
      cacheCleanupDone: "{count} tiedostoa poistettu.",
      cacheAlertDeleteFailed: "Poisto epäonnistui: {msg}",
      cacheAlertCleanupFailed: "Siivous epäonnistui: {msg}",
      cacheAlertSettingsFailed: "Tallennus epäonnistui: {msg}",
      notifActive: "aktiivinen",
      notifInactive: "ei aktiivinen",
      notifSave: "Tallenna",
      notifTest: "Lähetä testiviesti",
      notifRemove: "Poista",
      notifTestSending: "Lähetetään testiviestiä…",
      notifTestSent: "Testiviesti lähetetty.",
      notifTestFailed: "Epäonnistui: {msg}",
      noChannelYet: "Ilmoituskanavaa ei ole vielä määritetty.",
      saveChannel: "Tallenna kanava",
      notifHaLabel: "Home Assistant -ilmoituskohde",
      notifHaHint: "Olemassa olevan <code>notify.*</code>-palvelun nimi, esim. \"mobile_app_phone\" tai \"persistent_notification\". Muuta ei tarvitse asettaa.",
      notifTelegramTokenLabel: "Botin token",
      notifTelegramTokenHint: "Saat sen @BotFatherilta Telegramissa: avaa keskustelu, lähetä \"/newbot\" ja seuraa ohjeita.",
      notifTelegramChatIdLabel: "Keskustelun ID",
      notifTelegramChatIdHint: "Lähetä botillesi viesti ja avaa sitten selaimessa https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} on keskustelusi ID.",
      notifWhatsappPhoneLabel: "Puhelinnumero",
      notifWhatsappPhoneHint: "Maatunnuksen kanssa, esim. 491511234567.",
      notifWhatsappApikeyLabel: "API-avain (CallMeBot)",
      notifWhatsappApikeyHint: "Ilmainen WhatsApp-botti, Meta-yritystiliä ei tarvita: tallenna +34 644 84 71 04 yhteystiedoksi, lähetä sille WhatsApp-viesti \"I allow callmebot to send me messages\", niin saat oman API-avaimesi takaisin WhatsAppilla.",
      notifNameLabel: "Nimi",
      notifNamePlaceholder: "esim. Allan puhelin",
      notifMessageLabel: "Viesti",
      notifMessageHint: "Muuttujat: {version} = uusi laiteohjelmistoversio, {devices} = laitteet, joita koskee.",
      notifDefaultTemplate: "OpenBK7231T_App {version} on saatavilla. Laitteet, joita koskee: {devices}.",
      notifActiveLabel: "Aktiivinen",
      notifKeepUnchanged: "•••• (jätä muuttamatta säilyttääksesi sen)",
      notifApikeyPlaceholderExample: "esim. 123456",
      backupsHeader: "Asetusten varmuuskopiot",
      backupsIntro: "Tallentaa automaattisesti laitteen GPIO-nastojen/kanavien vastaavuudet ja käynnistyskomentoskriptin ennen jokaista päivitystä, jotta voit peruuttaa päivityksen, joka nollaa tai vioittaa sen asetukset. Voit myös luoda varmuuskopion manuaalisesti millä tahansa alla olevalla laitteella.",
      backupColDevice: "Laite",
      backupColTime: "Ajankohta",
      backupColReason: "Syy",
      backupColVersion: "Laiteohjelmisto",
      backupReasonManual: "Manuaalinen",
      backupReasonPreUpdate: "Ennen päivitystä",
      backupEmpty: "Ei vielä varmuuskopioita.",
      backupNowTitle: "Varmuuskopioi asetukset nyt",
      backupRestoreTitle: "Palauta tämä asetus",
      backupDownloadTitle: "Lataa varmuuskopio",
      backupConfirmRestore: "Palautetaanko tämä asetus todella laitteeseen? Nykyiset nasta-/kanava-asetukset ja käynnistyskomento korvataan.",
      backupAlertRestoreFailed: "Palautus epäonnistui: {msg}",
      backupRestoredAlert: "Asetukset palautettu.",
      backupConfirmDelete: "Poistetaanko tämä varmuuskopio todella?",
      backupAlertDeleteFailed: "Poisto epäonnistui: {msg}",
      backupAlertCreateFailed: "Varmuuskopiointi epäonnistui: {msg}",
      sensor_reboot_count: "Uudelleenkäynnistykset (arvio)",
      sensor_last_seen: "Viimeksi nähty",
    },
    el: {
      checkRelease: "Έλεγχος για ενημερώσεις",
      themeToggle: "Εναλλαγή φωτεινού/σκοτεινού θέματος",
      updateAll: "Ενημέρωση όλων",
      devicesHeader: "Συσκευές",
      scanNetwork: "Σάρωση δικτύου",
      addDevice: "Προσθήκη συσκευής",
      addIpPlaceholder: "Διεύθυνση IP (π.χ. 192.168.1.50)",
      addNamePlaceholder: "Όνομα (προαιρετικό)",
      addPasswordPlaceholder: "Κωδικός διαχειριστή (εάν έχει οριστεί)",
      add: "Προσθήκη",
      cancel: "Ακύρωση",
      colName: "Όνομα",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Έκδοση",
      colStatus: "Κατάσταση",
      colActions: "Ενέργειες",
      loadingDevices: "Φόρτωση συσκευών…",
      emptyDevices: "Δεν έχουν προστεθεί συσκευές ακόμα. Σαρώστε το δίκτυο ή προσθέστε μία χειροκίνητα.",
      scanResultsHeader: "Αποτελέσματα σάρωσης",
      close: "Κλείσιμο",
      notificationsHeader: "Ειδοποιήσεις",
      notificationsIntro: "Επιλέξτε πώς θέλετε να ειδοποιείστε όταν κυκλοφορεί νέο firmware OpenBK7231T_App. Μπορείτε να ρυθμίσετε πολλά κανάλια ταυτόχρονα. Αν κανένα κανάλι δεν είναι ενεργό, το πρόσθετο χρησιμοποιεί μια απλή ειδοποίηση Home Assistant.",
      addChannel: "Προσθήκη καναλιού",
      chooseChannelType: "Επιλέξτε τύπο καναλιού:",
      settingsHeader: "Ρυθμίσεις",
      statusUpdating: "Ενημέρωση…",
      statusFailed: "Απέτυχε",
      statusTimeout: "Λήξη χρονικού ορίου",
      statusOffline: "Εκτός σύνδεσης",
      statusOnline: "Σε σύνδεση",
      uartOnlyHint: "Μόνο flashing μέσω UART/SPI",
      unknownVersion: "άγνωστη",
      newVersionPrefix: "νέα: ",
      updateTitleUartOnly: "Αυτό το chipset δεν υποστηρίζει ενημέρωση μέσω δικτύου (μόνο flashing μέσω UART/SPI).",
      updateTitleUpdating: "Μια ενημέρωση βρίσκεται ήδη σε εξέλιξη.",
      updateTitleNoUpdateKnown: "Δεν είναι γνωστή αυτή τη στιγμή νεότερη έκδοση - κάντε κλικ ούτως ή άλλως για επανεγγραφή του firmware.",
      refreshTitle: "Επανερώτηση συσκευής",
      updateBtnLabel: "Ενημέρωση firmware",
      deleteTitle: "Αφαίρεση συσκευής",
      openDeviceTitle: "Άνοιγμα συσκευής στο πρόγραμμα περιήγησης",
      confirmUpdateAll: "Να ενημερωθούν τώρα όλες οι συσκευές που έχουν διαθέσιμη ενημέρωση;",
      confirmUpdateDevice: "Έναρξη ενημέρωσης firmware τώρα; Η συσκευή θα επανεκκινήσει στη συνέχεια.",
      confirmUpdateDeviceNoUpdate: "Δεν είναι γνωστή αυτή τη στιγμή νεότερη έκδοση. Να γίνει επανεγγραφή του firmware ούτως ή άλλως;",
      confirmDelete: "Αφαίρεση αυτής της συσκευής από τη λίστα;",
      confirmDeleteChannel: "Αφαίρεση αυτού του καναλιού ειδοποιήσεων;",
      alertDeviceOffline: "Η συσκευή \"{name}\" δεν αποκρίνεται (εκτός σύνδεσης ή λάθος κωδικός).",
      alertActionFailed: "Η ενέργεια απέτυχε: {msg}",
      alertRenameFailed: "Η μετονομασία απέτυχε: {msg}",
      alertCheckFailed: "Ο έλεγχος απέτυχε: {msg}",
      alertUpdateAllFailed: "Η ενημέρωση απέτυχε: {msg}",
      alertNoUpdatesFound: "Δεν βρέθηκαν συσκευές με διαθέσιμη ενημέρωση.",
      alertUpdatesStarted: "Ξεκίνησαν {count} ενημέρωση(εις).\n{skippedCount} παραλείφθηκαν:\n{details}",
      alertUpdateFailedDetail: "Η ενημέρωση απέτυχε:\n\n{detail}",
      alertUpdateFailedGeneric: "Η ενημέρωση απέτυχε ή έληξε ο χρόνος αναμονής. Δεν υπάρχουν περαιτέρω λεπτομέρειες.",
      alertAddFailed: "Η προσθήκη απέτυχε: {msg}",
      alertScanFailed: "Η σάρωση απέτυχε: {msg}",
      alertSaveFailed: "Η αποθήκευση απέτυχε: {msg}",
      alertDeleteChannelFailed: "Η αφαίρεση απέτυχε: {msg}",
      alertCreateChannelFailed: "Η δημιουργία απέτυχε: {msg}",
      alertSensorLabelSaveFailed: "Η μετονομασία του αισθητήρα απέτυχε: {msg}",
      bannerUpdateText: "Νέο firmware διαθέσιμο για {count} συσκευή(ές).",
      scanningStatus: "Σάρωση δικτύου… αυτό μπορεί να διαρκέσει έως 20 δευτερόλεπτα.",
      scanResultStatus: "Υποδίκτυο: {subnet} – βρέθηκαν {count} συσκευή(ές).",
      subnetUnknown: "άγνωστο",
      alreadyAdded: "έχει ήδη προστεθεί",
      addBtn: "Προσθήκη",
      noDevicesFoundScan: "Δεν βρέθηκαν συσκευές.",
      settingsScanSubnet: "Υποδίκτυο σάρωσης",
      settingsAuto: "αυτόματο",
      settingsPollInterval: "Διάστημα ερωτημάτων",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Διάστημα ελέγχου νέων εκδόσεων",
      settingsHoursUnit: "h",
      settingsNotifications: "Ειδοποιήσεις",
      settingsEnabled: "ενεργοποιημένο",
      settingsDisabled: "απενεργοποιημένο",
      settingsFirmwarePort: "Θύρα διακομιστή firmware",
      sensorLoading: "Φόρτωση δεδομένων αισθητήρα…",
      sensorNoData: "Αυτή η συσκευή δεν αναφέρει δεδομένα αισθητήρα (π.χ. δεν έχει εγκατεστημένο μετρητή ισχύος/αισθητήρα θερμοκρασίας).",
      sensorLoadError: "Δεν ήταν δυνατή η φόρτωση δεδομένων αισθητήρα: {msg}",
      renameSensorPrompt: "Νέο εμφανιζόμενο όνομα για αυτόν τον αισθητήρα (αφήστε κενό για επαναφορά):",
      category_wifi: "Σύνδεση Wi-Fi",
      category_power: "Κατανάλωση ενέργειας",
      category_diagnostics: "Διαγνωστικά",
      category_environment: "Περιβάλλον",
      category_other: "Άλλο",
      sensor_rssi: "RSSI",
      sensor_signal: "Σήμα Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Χρόνος λειτουργίας",
      sensor_uptime_sec: "Χρόνος λειτουργίας (δευτερόλεπτα)",
      sensor_heap: "Ελεύθερη μνήμη",
      sensor_power: "Ισχύς",
      sensor_apparent_power: "Φαινόμενη ισχύς",
      sensor_reactive_power: "Άεργος ισχύς",
      sensor_power_factor: "Συντελεστής ισχύος",
      sensor_voltage: "Τάση",
      sensor_current: "Ρεύμα",
      sensor_frequency: "Συχνότητα",
      sensor_energy_total: "Συνολική ενέργεια",
      sensor_energy_last_hour: "Ενέργεια τελευταίας ώρας",
      sensor_energy_yesterday: "Ενέργεια χθες",
      sensor_temperature: "Θερμοκρασία",
      sensor_humidity: "Υγρασία",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "ποτέ",
      releaseNotChecked: "Έκδοση: δεν έχει ελεγχθεί ακόμα",
      releaseLabel: "Έκδοση: {tag}",
      lastChecked: "Τελευταίος έλεγχος: {date}",
      viewReleaseNotes: "Προβολή σημειώσεων έκδοσης",
      releasePublished: "Δημοσιεύτηκε: {date}",
      releaseNoNotes: "Δεν υπάρχουν διαθέσιμες σημειώσεις έκδοσης.",
      viewOnGithub: "Προβολή στο GitHub",
      githubRepoTitle: "Άνοιγμα του OpenBK7231T_App στο GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Κρυφή μνήμη firmware",
      cacheCleanupNow: "Εκκαθάριση τώρα",
      cacheIntro: "Το κατεβασμένο firmware OpenBeken και τα δημιουργημένα αρχεία UF2 (βλ. \"ESPHome ↔ OpenBeken\") αποθηκεύονται μόνιμα και δεν διαγράφονται ποτέ από μόνα τους. Εδώ μπορείτε να δείτε τι καταλαμβάνει χώρο, να αφαιρέσετε μεμονωμένα αρχεία και να ορίσετε ένα όριο αυτόματης εκκαθάρισης - τα παλαιότερα αρχεία διαγράφονται πάντα πρώτα.",
      cacheColType: "Τύπος",
      cacheColLabel: "Ετικέτα",
      cacheColFile: "Αρχείο",
      cacheColSize: "Μέγεθος",
      cacheColDate: "Προστέθηκε",
      cacheLoading: "Φόρτωση κρυφής μνήμης…",
      cacheEmpty: "Η κρυφή μνήμη είναι άδεια.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} αρχείο(α), σύνολο {size}.",
      cacheMaxSizeLabel: "Μέγιστο μέγεθος κρυφής μνήμης (MB)",
      cacheAutoCleanupLabel: "Αυτόματη εκκαθάριση μόλις ξεπεραστεί το όριο",
      cacheSaveSettings: "Αποθήκευση",
      cacheSettingsSaved: "Αποθηκεύτηκε.",
      cacheConfirmDelete: "Διαγραφή αυτού του αρχείου από την κρυφή μνήμη;",
      cacheConfirmCleanup: "Διαγραφή των παλαιότερων αρχείων της κρυφής μνήμης μέχρι να μην ξεπερνιέται πλέον το ρυθμισμένο μέγεθος;",
      cacheCleanupNothing: "Η κρυφή μνήμη είναι ήδη εντός του ρυθμισμένου μεγέθους - δεν διαγράφηκε τίποτα.",
      cacheCleanupDone: "Διαγράφηκαν {count} αρχείο(α).",
      cacheAlertDeleteFailed: "Η διαγραφή απέτυχε: {msg}",
      cacheAlertCleanupFailed: "Η εκκαθάριση απέτυχε: {msg}",
      cacheAlertSettingsFailed: "Η αποθήκευση απέτυχε: {msg}",
      notifActive: "ενεργό",
      notifInactive: "ανενεργό",
      notifSave: "Αποθήκευση",
      notifTest: "Αποστολή δοκιμαστικού μηνύματος",
      notifRemove: "Αφαίρεση",
      notifTestSending: "Αποστολή δοκιμαστικού μηνύματος…",
      notifTestSent: "Το δοκιμαστικό μήνυμα στάλθηκε.",
      notifTestFailed: "Απέτυχε: {msg}",
      noChannelYet: "Δεν έχει ρυθμιστεί ακόμα κανάλι ειδοποιήσεων.",
      saveChannel: "Αποθήκευση καναλιού",
      notifHaLabel: "Στόχος ειδοποίησης Home Assistant",
      notifHaHint: "Το όνομα μιας υπάρχουσας υπηρεσίας <code>notify.*</code>, π.χ. \"mobile_app_phone\" ή \"persistent_notification\". Δεν χρειάζεται τίποτα άλλο.",
      notifTelegramTokenLabel: "Token bot",
      notifTelegramTokenHint: "Από τον @BotFather στο Telegram: ανοίξτε μια συνομιλία, στείλτε \"/newbot\" και ακολουθήστε τις οδηγίες.",
      notifTelegramChatIdLabel: "ID συνομιλίας",
      notifTelegramChatIdHint: "Στείλτε ένα μήνυμα στο bot σας και μετά ανοίξτε το https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates σε έναν browser - το \"chat\":{\"id\": ...} είναι το chat ID σας.",
      notifWhatsappPhoneLabel: "Αριθμός τηλεφώνου",
      notifWhatsappPhoneHint: "Συμπεριλαμβανομένου του κωδικού χώρας, π.χ. 491511234567.",
      notifWhatsappApikeyLabel: "Κλειδί API (CallMeBot)",
      notifWhatsappApikeyHint: "Δωρεάν bot για WhatsApp, χωρίς ανάγκη για επιχειρηματικό λογαριασμό Meta: αποθηκεύστε το +34 644 84 71 04 ως επαφή, στείλτε του το μήνυμα WhatsApp \"I allow callmebot to send me messages\" και θα λάβετε πίσω το προσωπικό σας κλειδί API μέσω WhatsApp.",
      notifNameLabel: "Όνομα",
      notifNamePlaceholder: "π.χ. το κινητό του Άλεξ",
      notifMessageLabel: "Μήνυμα",
      notifMessageHint: "Μεταβλητές: {version} = νέα έκδοση firmware, {devices} = επηρεαζόμενες συσκευές.",
      notifDefaultTemplate: "Το OpenBK7231T_App {version} είναι διαθέσιμο. Επηρεαζόμενες συσκευές: {devices}.",
      notifActiveLabel: "Ενεργό",
      notifKeepUnchanged: "•••• (αφήστε το αμετάβλητο για να το διατηρήσετε)",
      notifApikeyPlaceholderExample: "π.χ. 123456",
      backupsHeader: "Αντίγραφα ασφαλείας διαμόρφωσης",
      backupsIntro: "Αποθηκεύει αυτόματα την αντιστοίχιση ακροδεκτών/καναλιών GPIO και το σενάριο εντολών εκκίνησης μιας συσκευής πριν από κάθε ενημέρωση, ώστε να μπορείτε να αναιρέσετε μια ενημέρωση που επαναφέρει ή καταστρέφει τη διαμόρφωσή της. Μπορείτε επίσης να δημιουργήσετε αντίγραφο ασφαλείας χειροκίνητα για οποιαδήποτε συσκευή παρακάτω.",
      backupColDevice: "Συσκευή",
      backupColTime: "Ώρα",
      backupColReason: "Αιτία",
      backupColVersion: "Υλικολογισμικό",
      backupReasonManual: "Χειροκίνητα",
      backupReasonPreUpdate: "Πριν την ενημέρωση",
      backupEmpty: "Δεν υπάρχουν ακόμη αντίγραφα ασφαλείας.",
      backupNowTitle: "Δημιουργία αντιγράφου ασφαλείας τώρα",
      backupRestoreTitle: "Επαναφορά αυτής της διαμόρφωσης",
      backupDownloadTitle: "Λήψη αντιγράφου ασφαλείας",
      backupConfirmRestore: "Πραγματική επαναφορά αυτής της διαμόρφωσης στη συσκευή; Οι τρέχουσες ρυθμίσεις ακροδεκτών/καναλιών και η εντολή εκκίνησης θα αντικατασταθούν.",
      backupAlertRestoreFailed: "Η επαναφορά απέτυχε: {msg}",
      backupRestoredAlert: "Η διαμόρφωση επαναφέρθηκε.",
      backupConfirmDelete: "Πραγματική διαγραφή αυτού του αντιγράφου ασφαλείας;",
      backupAlertDeleteFailed: "Η διαγραφή απέτυχε: {msg}",
      backupAlertCreateFailed: "Η δημιουργία αντιγράφου ασφαλείας απέτυχε: {msg}",
      sensor_reboot_count: "Επανεκκινήσεις (εκτίμηση)",
      sensor_last_seen: "Τελευταία εμφάνιση",
    },
    hu: {
      checkRelease: "Frissítések keresése",
      themeToggle: "Világos/sötét mód váltása",
      updateAll: "Összes frissítése",
      devicesHeader: "Eszközök",
      scanNetwork: "Hálózat keresése",
      addDevice: "Eszköz hozzáadása",
      addIpPlaceholder: "IP-cím (pl. 192.168.1.50)",
      addNamePlaceholder: "Név (nem kötelező)",
      addPasswordPlaceholder: "Rendszergazdai jelszó (ha van beállítva)",
      add: "Hozzáadás",
      cancel: "Mégse",
      colName: "Név",
      colIp: "IP",
      colChipset: "Chipkészlet",
      colVersion: "Verzió",
      colStatus: "Állapot",
      colActions: "Műveletek",
      loadingDevices: "Eszközök betöltése…",
      emptyDevices: "Még nincs hozzáadott eszköz. Keress a hálózaton, vagy adj hozzá egyet manuálisan.",
      scanResultsHeader: "Keresési eredmények",
      close: "Bezárás",
      notificationsHeader: "Értesítések",
      notificationsIntro: "Válaszd ki, hogyan szeretnél értesítést kapni, amikor új OpenBK7231T_App firmware jelenik meg. Egyszerre több csatornát is beállíthatsz. Ha egyik csatorna sem aktív, a kiegészítő egy szokásos Home Assistant értesítést küld.",
      addChannel: "Csatorna hozzáadása",
      chooseChannelType: "Válaszd ki a csatorna típusát:",
      settingsHeader: "Beállítások",
      statusUpdating: "Frissítés folyamatban…",
      statusFailed: "Sikertelen",
      statusTimeout: "Időtúllépés",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Csak UART/SPI programozás",
      unknownVersion: "ismeretlen",
      newVersionPrefix: "új: ",
      updateTitleUartOnly: "Ez a chipkészlet nem támogatja a hálózati frissítést (csak UART/SPI programozás).",
      updateTitleUpdating: "Már folyamatban van egy frissítés.",
      updateTitleNoUpdateKnown: "Jelenleg nincs ismert újabb verzió - kattints ide, ha mégis szeretnéd újraírni a firmware-t.",
      refreshTitle: "Eszköz adatainak frissítése",
      updateBtnLabel: "Firmware-frissítés",
      deleteTitle: "Eszköz eltávolítása",
      openDeviceTitle: "Eszköz megnyitása böngészőben",
      confirmUpdateAll: "Frissíted most az összes eszközt, amelyhez elérhető frissítés?",
      confirmUpdateDevice: "Elindítod most a firmware-frissítést? Az eszköz ezután újraindul.",
      confirmUpdateDeviceNoUpdate: "Jelenleg nincs ismert újabb verzió. Mégis újraírod a firmware-t?",
      confirmDelete: "Eltávolítod ezt az eszközt a listáról?",
      confirmDeleteChannel: "Eltávolítod ezt az értesítési csatornát?",
      alertDeviceOffline: "A(z) \"{name}\" eszköz nem válaszol (offline állapotban van, vagy hibás a jelszó).",
      alertActionFailed: "A művelet sikertelen: {msg}",
      alertRenameFailed: "Az átnevezés sikertelen: {msg}",
      alertCheckFailed: "Az ellenőrzés sikertelen: {msg}",
      alertUpdateAllFailed: "A frissítés sikertelen: {msg}",
      alertNoUpdatesFound: "Nem található olyan eszköz, amelyhez elérhető lenne frissítés.",
      alertUpdatesStarted: "{count} frissítés elindítva.\n{skippedCount} kihagyva:\n{details}",
      alertUpdateFailedDetail: "A frissítés sikertelen volt:\n\n{detail}",
      alertUpdateFailedGeneric: "A frissítés sikertelen volt, vagy túllépte az időkorlátot. Nincs több elérhető részlet.",
      alertAddFailed: "A hozzáadás sikertelen: {msg}",
      alertScanFailed: "A keresés sikertelen: {msg}",
      alertSaveFailed: "A mentés sikertelen: {msg}",
      alertDeleteChannelFailed: "Az eltávolítás sikertelen: {msg}",
      alertCreateChannelFailed: "A létrehozás sikertelen: {msg}",
      alertSensorLabelSaveFailed: "Az érzékelő átnevezése sikertelen: {msg}",
      bannerUpdateText: "Új firmware érhető el {count} eszközhöz.",
      scanningStatus: "Hálózat keresése… ez akár 20 másodpercig is eltarthat.",
      scanResultStatus: "Alhálózat: {subnet} – {count} eszköz található.",
      subnetUnknown: "ismeretlen",
      alreadyAdded: "már hozzáadva",
      addBtn: "Hozzáadás",
      noDevicesFoundScan: "Nem található eszköz.",
      settingsScanSubnet: "Keresendő alhálózat",
      settingsAuto: "automatikus",
      settingsPollInterval: "Lekérdezési időköz",
      settingsMinutesUnit: "perc",
      settingsReleaseCheckInterval: "Kiadás-ellenőrzési időköz",
      settingsHoursUnit: "ó",
      settingsNotifications: "Értesítések",
      settingsEnabled: "bekapcsolva",
      settingsDisabled: "kikapcsolva",
      settingsFirmwarePort: "Firmware-szerver portja",
      sensorLoading: "Érzékelőadatok betöltése…",
      sensorNoData: "Ez az eszköz nem küld érzékelőadatokat (pl. nincs telepítve fogyasztásmérő/hőmérséklet-érzékelő).",
      sensorLoadError: "Az érzékelőadatok betöltése sikertelen: {msg}",
      renameSensorPrompt: "Az érzékelő új megjelenítendő neve (hagyd üresen a visszaállításhoz):",
      category_wifi: "Wi-Fi-kapcsolat",
      category_power: "Energiafogyasztás",
      category_diagnostics: "Diagnosztika",
      category_environment: "Környezet",
      category_other: "Egyéb",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi-jel",
      sensor_ssid: "SSID",
      sensor_uptime: "Üzemidő",
      sensor_uptime_sec: "Üzemidő (másodperc)",
      sensor_heap: "Szabad memória",
      sensor_power: "Teljesítmény",
      sensor_apparent_power: "Látszólagos teljesítmény",
      sensor_reactive_power: "Meddő teljesítmény",
      sensor_power_factor: "Teljesítménytényező",
      sensor_voltage: "Feszültség",
      sensor_current: "Áramerősség",
      sensor_frequency: "Frekvencia",
      sensor_energy_total: "Összes energia",
      sensor_energy_last_hour: "Energia az elmúlt órában",
      sensor_energy_yesterday: "Energia tegnap",
      sensor_temperature: "Hőmérséklet",
      sensor_humidity: "Páratartalom",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "soha",
      releaseNotChecked: "Kiadás: még nincs ellenőrizve",
      releaseLabel: "Kiadás: {tag}",
      lastChecked: "Utoljára ellenőrizve: {date}",
      viewReleaseNotes: "Kiadási megjegyzések megtekintése",
      releasePublished: "Közzétéve: {date}",
      releaseNoNotes: "Nincsenek elérhető kiadási megjegyzések.",
      viewOnGithub: "Megtekintés a GitHubon",
      githubRepoTitle: "Az OpenBK7231T_App megnyitása a GitHubon",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Firmware-gyorsítótár",
      cacheCleanupNow: "Tisztítás most",
      cacheIntro: "A letöltött OpenBeken firmware-ek és a generált UF2 fájlok (lásd: \"ESPHome ↔ OpenBeken\") tartósan tárolódnak, és soha nem törlődnek maguktól. Itt láthatod, mi foglalja a helyet, eltávolíthatsz egyes fájlokat, és beállíthatsz egy automatikus tisztítási korlátot - mindig a legrégebbi fájlok törlődnek először.",
      cacheColType: "Típus",
      cacheColLabel: "Címke",
      cacheColFile: "Fájl",
      cacheColSize: "Méret",
      cacheColDate: "Hozzáadva",
      cacheLoading: "Gyorsítótár betöltése…",
      cacheEmpty: "A gyorsítótár üres.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} fájl, összesen {size}.",
      cacheMaxSizeLabel: "Maximális gyorsítótár-méret (MB)",
      cacheAutoCleanupLabel: "Automatikus tisztítás túllépés esetén",
      cacheSaveSettings: "Mentés",
      cacheSettingsSaved: "Mentve.",
      cacheConfirmDelete: "Törlöd ezt a fájlt a gyorsítótárból?",
      cacheConfirmCleanup: "Törlöd a legrégebbi gyorsítótárazott fájlokat, amíg a beállított méret már nem lesz túllépve?",
      cacheCleanupNothing: "A gyorsítótár már a beállított méreten belül van - semmi nem törlődött.",
      cacheCleanupDone: "{count} fájl törölve.",
      cacheAlertDeleteFailed: "A törlés sikertelen: {msg}",
      cacheAlertCleanupFailed: "A tisztítás sikertelen: {msg}",
      cacheAlertSettingsFailed: "A mentés sikertelen: {msg}",
      notifActive: "aktív",
      notifInactive: "inaktív",
      notifSave: "Mentés",
      notifTest: "Tesztüzenet küldése",
      notifRemove: "Eltávolítás",
      notifTestSending: "Tesztüzenet küldése…",
      notifTestSent: "A tesztüzenet elküldve.",
      notifTestFailed: "Sikertelen: {msg}",
      noChannelYet: "Még nincs beállítva értesítési csatorna.",
      saveChannel: "Csatorna mentése",
      notifHaLabel: "Home Assistant értesítési cél",
      notifHaHint: "Egy meglévő <code>notify.*</code> szolgáltatás neve, pl. \"mobile_app_phone\" vagy \"persistent_notification\". Mást nem kell beállítani.",
      notifTelegramTokenLabel: "Bot token",
      notifTelegramTokenHint: "A @BotFathertől kapod Telegramon: nyiss egy csevegést, küldd el a \"/newbot\" parancsot, és kövesd az utasításokat.",
      notifTelegramChatIdLabel: "Csevegés azonosítója",
      notifTelegramChatIdHint: "Küldj egy üzenetet a botodnak, majd nyisd meg böngészőben a https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates címet - a \"chat\":{\"id\": ...} a csevegésed azonosítója.",
      notifWhatsappPhoneLabel: "Telefonszám",
      notifWhatsappPhoneHint: "Országhívószámmal együtt, pl. 491511234567.",
      notifWhatsappApikeyLabel: "API-kulcs (CallMeBot)",
      notifWhatsappApikeyHint: "Ingyenes WhatsApp bot, Meta üzleti fiók nélkül: mentsd el a +34 644 84 71 04 számot névjegyként, küldd el neki a \"I allow callmebot to send me messages\" WhatsApp üzenetet, és visszakapod a saját API-kulcsodat WhatsAppon.",
      notifNameLabel: "Név",
      notifNamePlaceholder: "pl. Peti telefonja",
      notifMessageLabel: "Üzenet",
      notifMessageHint: "Helyőrzők: {version} = az új firmware verziója, {devices} = az érintett eszközök.",
      notifDefaultTemplate: "Elérhető az OpenBK7231T_App {version}. Érintett eszközök: {devices}.",
      notifActiveLabel: "Aktív",
      notifKeepUnchanged: "•••• (hagyd változatlanul, ha meg szeretnéd tartani)",
      notifApikeyPlaceholderExample: "pl. 123456",
      backupsHeader: "Konfigurációs biztonsági mentések",
      backupsIntro: "Minden frissítés előtt automatikusan elmenti az eszköz GPIO-tű-/csatorna-hozzárendelését és indítási parancsfájlját, hogy visszavonhass egy olyan frissítést, amely visszaállítja vagy megrongálja a konfigurációját. Alább bármelyik eszközhöz manuálisan is indíthatsz mentést.",
      backupColDevice: "Eszköz",
      backupColTime: "Időpont",
      backupColReason: "Ok",
      backupColVersion: "Firmware",
      backupReasonManual: "Manuális",
      backupReasonPreUpdate: "Frissítés előtt",
      backupEmpty: "Még nincs mentés.",
      backupNowTitle: "Konfiguráció mentése most",
      backupRestoreTitle: "Ezen konfiguráció visszaállítása",
      backupDownloadTitle: "Mentés letöltése",
      backupConfirmRestore: "Valóban visszaállítod ezt a konfigurációt az eszközön? A jelenlegi tű-/csatornabeállítások és az indítási parancs felülíródnak.",
      backupAlertRestoreFailed: "A visszaállítás sikertelen: {msg}",
      backupRestoredAlert: "A konfiguráció visszaállítva.",
      backupConfirmDelete: "Valóban törlöd ezt a mentést?",
      backupAlertDeleteFailed: "A törlés sikertelen: {msg}",
      backupAlertCreateFailed: "A mentés sikertelen: {msg}",
      sensor_reboot_count: "Újraindítások (becsült)",
      sensor_last_seen: "Utoljára látva",
    },
    ga: {
      checkRelease: "Seiceáil nuashonruithe",
      themeToggle: "Athraigh idir mód geal/dorcha",
      updateAll: "Nuashonraigh gach ceann",
      devicesHeader: "Gléasanna",
      scanNetwork: "Scan an líonra",
      addDevice: "Cuir gléas leis",
      addIpPlaceholder: "Seoladh IP (m.sh. 192.168.1.50)",
      addNamePlaceholder: "Ainm (roghnach)",
      addPasswordPlaceholder: "Pasfhocal riarthóra (má tá ceann socraithe)",
      add: "Cuir leis",
      cancel: "Cealaigh",
      colName: "Ainm",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Leagan",
      colStatus: "Stádas",
      colActions: "Gníomhartha",
      loadingDevices: "Gléasanna á lódáil…",
      emptyDevices: "Níor cuireadh aon ghléas leis fós. Déan scanadh ar an líonra nó cuir gléas leis de láimh.",
      scanResultsHeader: "Torthaí an scanta",
      close: "Dún",
      notificationsHeader: "Fógraí",
      notificationsIntro: "Roghnaigh conas ba mhaith leat fógra a fháil nuair a scaoiltear bogearra frithchuimilte OpenBK7231T_App nua. Is féidir leat roinnt cainéal a shocrú ag an am céanna. Mura bhfuil aon chainéal gníomhach, úsáidfidh an breiseán gnáthfhógra Home Assistant ina ionad.",
      addChannel: "Cuir cainéal leis",
      chooseChannelType: "Roghnaigh cineál cainéil:",
      settingsHeader: "Socruithe",
      statusUpdating: "Á nuashonrú…",
      statusFailed: "Theip air",
      statusTimeout: "Ligeadh an t-am istigh",
      statusOffline: "As líne",
      statusOnline: "Ar líne",
      uartOnlyHint: "Splancadh UART/SPI amháin",
      unknownVersion: "anaithnid",
      newVersionPrefix: "nua: ",
      updateTitleUartOnly: "Ní thacaíonn an chipset seo le nuashonrú tríd an líonra (splancadh UART/SPI amháin).",
      updateTitleUpdating: "Tá nuashonrú ar siúl cheana féin.",
      updateTitleNoUpdateKnown: "Níl aon leagan níos nuaí ar eolas faoi láthair - cliceáil ar aon nós chun an bogearra frithchuimilte a athsplancadh.",
      refreshTitle: "Ceistigh an gléas arís",
      updateBtnLabel: "Nuashonrú bogearra frithchuimilte",
      deleteTitle: "Bain an gléas",
      openDeviceTitle: "Oscail an gléas sa bhrabhsálaí",
      confirmUpdateAll: "An bhfuil fonn ort na gléasanna go léir a bhfuil nuashonrú ar fáil dóibh a nuashonrú anois?",
      confirmUpdateDevice: "An dtosóidh an nuashonrú bogearra frithchuimilte anois? Atosóidh an gléas ina dhiaidh sin.",
      confirmUpdateDeviceNoUpdate: "Níl aon leagan níos nuaí ar eolas faoi láthair. An bhfuil fonn ort an bogearra frithchuimilte a athsplancadh ar aon nós?",
      confirmDelete: "An bhfuil fonn ort an gléas seo a bhaint den liosta?",
      confirmDeleteChannel: "An bhfuil fonn ort an cainéal fógraí seo a bhaint?",
      alertDeviceOffline: "Níl an gléas \"{name}\" ag freagairt (tá sé as líne nó tá an pasfhocal mícheart).",
      alertActionFailed: "Theip ar an ngníomh: {msg}",
      alertRenameFailed: "Theip ar an athainmniú: {msg}",
      alertCheckFailed: "Theip ar an tseiceáil: {msg}",
      alertUpdateAllFailed: "Theip ar an nuashonrú: {msg}",
      alertNoUpdatesFound: "Níor aimsíodh aon ghléas a bhfuil nuashonrú ar fáil dó.",
      alertUpdatesStarted: "Tosaíodh {count} nuashonrú.\n{skippedCount} scipeáilte:\n{details}",
      alertUpdateFailedDetail: "Theip ar an nuashonrú:\n\n{detail}",
      alertUpdateFailedGeneric: "Theip ar an nuashonrú nó ligeadh an t-am istigh. Níl aon sonraí breise ar fáil.",
      alertAddFailed: "Theip ar an gcur leis: {msg}",
      alertScanFailed: "Theip ar an scanadh: {msg}",
      alertSaveFailed: "Theip ar an sábháil: {msg}",
      alertDeleteChannelFailed: "Theip ar an mbaint: {msg}",
      alertCreateChannelFailed: "Theip ar an gcruthú: {msg}",
      alertSensorLabelSaveFailed: "Theip ar athainmniú an bhraiteora: {msg}",
      bannerUpdateText: "Tá bogearra frithchuimilte nua ar fáil do {count} ghléas.",
      scanningStatus: "Ag scanadh an líonra… d'fhéadfadh sé seo suas le 20 soicind a thógáil.",
      scanResultStatus: "Fo-líonra: {subnet} – {count} gléas aimsithe.",
      subnetUnknown: "anaithnid",
      alreadyAdded: "curtha leis cheana féin",
      addBtn: "Cuir leis",
      noDevicesFoundScan: "Níor aimsíodh aon ghléas.",
      settingsScanSubnet: "Fo-líonra le scanadh",
      settingsAuto: "uathoibríoch",
      settingsPollInterval: "Eatramh pobalbhreithe",
      settingsMinutesUnit: "nóim",
      settingsReleaseCheckInterval: "Eatramh seiceála eisiúintí",
      settingsHoursUnit: "u",
      settingsNotifications: "Fógraí",
      settingsEnabled: "cumasaithe",
      settingsDisabled: "díchumasaithe",
      settingsFirmwarePort: "Port freastalaí an bhogearra frithchuimilte",
      sensorLoading: "Sonraí an bhraiteora á lódáil…",
      sensorNoData: "Ní thuairiscíonn an gléas seo aon sonraí braiteora (m.sh. níl aon mhéadar cumhachta/braiteoir teochta suiteáilte).",
      sensorLoadError: "Níorbh fhéidir sonraí an bhraiteora a lódáil: {msg}",
      renameSensorPrompt: "Ainm taispeána nua don bhraiteoir seo (fág bán chun athshocrú):",
      category_wifi: "Ceangal Wi-Fi",
      category_power: "Tomhaltas cumhachta",
      category_diagnostics: "Diagnóisic",
      category_environment: "Timpeallacht",
      category_other: "Eile",
      sensor_rssi: "RSSI",
      sensor_signal: "Comhartha Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Am fónaimh",
      sensor_uptime_sec: "Am fónaimh (soicindí)",
      sensor_heap: "Cuimhne shaor",
      sensor_power: "Cumhacht",
      sensor_apparent_power: "Cumhacht dhealraitheach",
      sensor_reactive_power: "Cumhacht imoibríoch",
      sensor_power_factor: "Fachtóir cumhachta",
      sensor_voltage: "Voltas",
      sensor_current: "Sruth",
      sensor_frequency: "Minicíocht",
      sensor_energy_total: "Fuinneamh iomlán",
      sensor_energy_last_hour: "Fuinneamh na huaire seo caite",
      sensor_energy_yesterday: "Fuinneamh inné",
      sensor_temperature: "Teocht",
      sensor_humidity: "Taise",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "riamh",
      releaseNotChecked: "Eisiúint: níor seiceáladh fós",
      releaseLabel: "Eisiúint: {tag}",
      lastChecked: "Seiceáladh go deireanach: {date}",
      viewReleaseNotes: "Féach ar nótaí an eisiúna",
      releasePublished: "Foilsithe: {date}",
      releaseNoNotes: "Níl aon nótaí eisiúna ar fáil.",
      viewOnGithub: "Féach ar GitHub",
      githubRepoTitle: "Oscail OpenBK7231T_App ar GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Taisce bogearra frithchuimilte",
      cacheCleanupNow: "Glan suas anois",
      cacheIntro: "Stóráiltear an bogearra frithchuimilte OpenBeken a íoslódáladh agus na comhaid UF2 a gineadh (féach \"ESPHome ↔ OpenBeken\") go buan agus ní scriostar iad leo féin choíche. Anseo is féidir leat a fheiceáil cad atá ag tógáil spáis, comhaid aonair a bhaint, agus teorainn ghlanadh uathoibríoch a shocrú - scriostar na comhaid is sine i gcónaí ar dtús.",
      cacheColType: "Cineál",
      cacheColLabel: "Lipéad",
      cacheColFile: "Comhad",
      cacheColSize: "Méid",
      cacheColDate: "Curtha leis",
      cacheLoading: "Taisce á lódáil…",
      cacheEmpty: "Tá an taisce folamh.",
      cacheKindFirmware: "Bogearra frithchuimilte",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} comhad, {size} san iomlán.",
      cacheMaxSizeLabel: "Uasmhéid na taisce (MB)",
      cacheAutoCleanupLabel: "Glan go huathoibríoch nuair a shároítear é",
      cacheSaveSettings: "Sábháil",
      cacheSettingsSaved: "Sábháilte.",
      cacheConfirmDelete: "An bhfuil fonn ort an comhad seo a scriosadh ón taisce?",
      cacheConfirmCleanup: "An bhfuil fonn ort na comhaid taisce is sine a scriosadh go dtí nach sáraítear an méid socraithe a thuilleadh?",
      cacheCleanupNothing: "Tá an taisce laistigh den méid socraithe cheana féin - níor scriosadh aon rud.",
      cacheCleanupDone: "Scriosadh {count} comhad.",
      cacheAlertDeleteFailed: "Theip ar an scriosadh: {msg}",
      cacheAlertCleanupFailed: "Theip ar an nglanadh: {msg}",
      cacheAlertSettingsFailed: "Theip ar an sábháil: {msg}",
      notifActive: "gníomhach",
      notifInactive: "neamhghníomhach",
      notifSave: "Sábháil",
      notifTest: "Seol teachtaireacht tástála",
      notifRemove: "Bain",
      notifTestSending: "Teachtaireacht tástála á seoladh…",
      notifTestSent: "Seoladh an teachtaireacht tástála.",
      notifTestFailed: "Theip: {msg}",
      noChannelYet: "Níl aon chainéal fógraí socraithe fós.",
      saveChannel: "Sábháil an cainéal",
      notifHaLabel: "Sprioc fógra Home Assistant",
      notifHaHint: "Ainm seirbhíse <code>notify.*</code> atá ann cheana, m.sh. \"mobile_app_phone\" nó \"persistent_notification\". Níl aon rud eile le socrú.",
      notifTelegramTokenLabel: "Comhartha an bhoit",
      notifTelegramTokenHint: "Ó @BotFather ar Telegram: oscail comhrá, seol \"/newbot\", agus lean na treoracha.",
      notifTelegramChatIdLabel: "Aitheantas comhrá",
      notifTelegramChatIdHint: "Seol teachtaireacht chuig do bhot, ansin oscail https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates i mbrabhsálaí - is é \"chat\":{\"id\": ...} d'aitheantas comhrá.",
      notifWhatsappPhoneLabel: "Uimhir theileafóin",
      notifWhatsappPhoneHint: "Cód tíre san áireamh, m.sh. 491511234567.",
      notifWhatsappApikeyLabel: "Eochair API (CallMeBot)",
      notifWhatsappApikeyHint: "Bot WhatsApp saor in aisce, gan cuntas gnó Meta ag teastáil: sábháil +34 644 84 71 04 mar theagmhálaí, seol an teachtaireacht WhatsApp \"I allow callmebot to send me messages\" chuige, agus gheobhaidh tú d'eochair API phearsanta ar ais trí WhatsApp.",
      notifNameLabel: "Ainm",
      notifNamePlaceholder: "m.sh. fón Alex",
      notifMessageLabel: "Teachtaireacht",
      notifMessageHint: "Ionadchoinneálaithe: {version} = leagan nua an bhogearra frithchuimilte, {devices} = na gléasanna a bhfuil tionchar orthu.",
      notifDefaultTemplate: "Tá OpenBK7231T_App {version} ar fáil. Gléasanna a bhfuil tionchar orthu: {devices}.",
      notifActiveLabel: "Gníomhach",
      notifKeepUnchanged: "•••• (fág gan athrú chun é a choinneáil)",
      notifApikeyPlaceholderExample: "m.sh. 123456",
      backupsHeader: "Cúltacaí Cumraíochta",
      backupsIntro: "Sábhálann sé go huathoibríoch mapáil na bpiontaí/cainéal GPIO agus script na n-orduithe tosaithe roimh gach nuashonrú, ionas gur féidir leat nuashonrú a chuireann an chumraíocht ar ais nó a dhéanann damáiste di a chealú. Is féidir leat cúltaca a dhéanamh de láimh freisin d'aon ghléas thíos.",
      backupColDevice: "Gléas",
      backupColTime: "Am",
      backupColReason: "Cúis",
      backupColVersion: "Bogearra Dochtain",
      backupReasonManual: "De láimh",
      backupReasonPreUpdate: "Roimh nuashonrú",
      backupEmpty: "Níl aon chúltacaí ann fós.",
      backupNowTitle: "Déan cúltaca den chumraíocht anois",
      backupRestoreTitle: "Athchóirigh an chumraíocht seo",
      backupDownloadTitle: "Íoslódáil an cúltaca",
      backupConfirmRestore: "An bhfuil tú cinnte gur mian leat an chumraíocht seo a athchóiriú ar an ngléas? Forscríobhfar na socruithe reatha piontaí/cainéal agus an t-ordú tosaithe.",
      backupAlertRestoreFailed: "Theip ar an athchóiriú: {msg}",
      backupRestoredAlert: "Cumraíocht athchóirithe.",
      backupConfirmDelete: "An bhfuil tú cinnte gur mian leat an cúltaca seo a scriosadh?",
      backupAlertDeleteFailed: "Theip ar an scriosadh: {msg}",
      backupAlertCreateFailed: "Theip ar an gcúltacú: {msg}",
      sensor_reboot_count: "Atosuithe (measta)",
      sensor_last_seen: "Feicthe go deireanach",
    },
    it: {
      checkRelease: "Cerca aggiornamenti",
      themeToggle: "Attiva/disattiva modalità chiara/scura",
      updateAll: "Aggiorna tutto",
      devicesHeader: "Dispositivi",
      scanNetwork: "Scansiona rete",
      addDevice: "Aggiungi dispositivo",
      addIpPlaceholder: "Indirizzo IP (es. 192.168.1.50)",
      addNamePlaceholder: "Nome (facoltativo)",
      addPasswordPlaceholder: "Password amministratore (se impostata)",
      add: "Aggiungi",
      cancel: "Annulla",
      colName: "Nome",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Versione",
      colStatus: "Stato",
      colActions: "Azioni",
      loadingDevices: "Caricamento dispositivi…",
      emptyDevices: "Nessun dispositivo aggiunto ancora. Scansiona la rete oppure aggiungine uno manualmente.",
      scanResultsHeader: "Risultati scansione",
      close: "Chiudi",
      notificationsHeader: "Notifiche",
      notificationsIntro: "Scegli come vuoi essere avvisato quando viene rilasciato un nuovo firmware OpenBK7231T_App. Puoi configurare più canali contemporaneamente. Se nessun canale è attivo, l'add-on utilizzerà una normale notifica di Home Assistant.",
      addChannel: "Aggiungi canale",
      chooseChannelType: "Scegli un tipo di canale:",
      settingsHeader: "Impostazioni",
      statusUpdating: "Aggiornamento in corso…",
      statusFailed: "Non riuscito",
      statusTimeout: "Tempo scaduto",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Solo flashing UART/SPI",
      unknownVersion: "sconosciuta",
      newVersionPrefix: "nuova: ",
      updateTitleUartOnly: "Questo chipset non supporta l'aggiornamento via rete (solo flashing UART/SPI).",
      updateTitleUpdating: "È già in corso un aggiornamento.",
      updateTitleNoUpdateKnown: "Al momento non è nota alcuna versione più recente: fai comunque clic per riflashare il firmware.",
      refreshTitle: "Interroga di nuovo il dispositivo",
      updateBtnLabel: "Aggiornamento firmware",
      deleteTitle: "Rimuovi dispositivo",
      openDeviceTitle: "Apri il dispositivo nel browser",
      confirmUpdateAll: "Aggiornare ora tutti i dispositivi per cui è disponibile un aggiornamento?",
      confirmUpdateDevice: "Avviare ora l'aggiornamento del firmware? Il dispositivo si riavvierà al termine.",
      confirmUpdateDeviceNoUpdate: "Al momento non è nota alcuna versione più recente. Riflashare comunque il firmware?",
      confirmDelete: "Rimuovere questo dispositivo dall'elenco?",
      confirmDeleteChannel: "Rimuovere questo canale di notifica?",
      alertDeviceOffline: "Il dispositivo \"{name}\" non risponde (offline o password errata).",
      alertActionFailed: "Azione non riuscita: {msg}",
      alertRenameFailed: "Ridenominazione non riuscita: {msg}",
      alertCheckFailed: "Controllo non riuscito: {msg}",
      alertUpdateAllFailed: "Aggiornamento non riuscito: {msg}",
      alertNoUpdatesFound: "Non è stato trovato alcun dispositivo con un aggiornamento disponibile.",
      alertUpdatesStarted: "{count} aggiornamento/i avviato/i.\n{skippedCount} saltato/i:\n{details}",
      alertUpdateFailedDetail: "Aggiornamento non riuscito:\n\n{detail}",
      alertUpdateFailedGeneric: "L'aggiornamento non è riuscito o è scaduto. Non sono disponibili ulteriori dettagli.",
      alertAddFailed: "Aggiunta non riuscita: {msg}",
      alertScanFailed: "Scansione non riuscita: {msg}",
      alertSaveFailed: "Salvataggio non riuscito: {msg}",
      alertDeleteChannelFailed: "Rimozione non riuscita: {msg}",
      alertCreateChannelFailed: "Creazione non riuscita: {msg}",
      alertSensorLabelSaveFailed: "Ridenominazione del sensore non riuscita: {msg}",
      bannerUpdateText: "Nuovo firmware disponibile per {count} dispositivo/i.",
      scanningStatus: "Scansione della rete in corso… può richiedere fino a 20 secondi.",
      scanResultStatus: "Sottorete: {subnet} – {count} dispositivo/i trovato/i.",
      subnetUnknown: "sconosciuta",
      alreadyAdded: "già aggiunto",
      addBtn: "Aggiungi",
      noDevicesFoundScan: "Nessun dispositivo trovato.",
      settingsScanSubnet: "Sottorete di scansione",
      settingsAuto: "automatico",
      settingsPollInterval: "Intervallo di polling",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Intervallo di controllo release",
      settingsHoursUnit: "h",
      settingsNotifications: "Notifiche",
      settingsEnabled: "attivo",
      settingsDisabled: "disattivato",
      settingsFirmwarePort: "Porta del server firmware",
      sensorLoading: "Caricamento dati del sensore…",
      sensorNoData: "Questo dispositivo non riporta alcun dato dei sensori (ad es. nessun misuratore di potenza/sensore di temperatura installato).",
      sensorLoadError: "Impossibile caricare i dati del sensore: {msg}",
      renameSensorPrompt: "Nuovo nome visualizzato per questo sensore (lascia vuoto per ripristinare):",
      category_wifi: "Connessione Wi-Fi",
      category_power: "Consumo energetico",
      category_diagnostics: "Diagnostica",
      category_environment: "Ambiente",
      category_other: "Altro",
      sensor_rssi: "RSSI",
      sensor_signal: "Segnale Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Tempo di attività",
      sensor_uptime_sec: "Tempo di attività (secondi)",
      sensor_heap: "Memoria libera",
      sensor_power: "Potenza",
      sensor_apparent_power: "Potenza apparente",
      sensor_reactive_power: "Potenza reattiva",
      sensor_power_factor: "Fattore di potenza",
      sensor_voltage: "Tensione",
      sensor_current: "Corrente",
      sensor_frequency: "Frequenza",
      sensor_energy_total: "Energia totale",
      sensor_energy_last_hour: "Energia nell'ultima ora",
      sensor_energy_yesterday: "Energia ieri",
      sensor_temperature: "Temperatura",
      sensor_humidity: "Umidità",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "mai",
      releaseNotChecked: "Release: non ancora controllata",
      releaseLabel: "Release: {tag}",
      lastChecked: "Ultimo controllo: {date}",
      viewReleaseNotes: "Visualizza note di rilascio",
      releasePublished: "Pubblicata il: {date}",
      releaseNoNotes: "Nessuna nota di rilascio disponibile.",
      viewOnGithub: "Visualizza su GitHub",
      githubRepoTitle: "Apri OpenBK7231T_App su GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Cache firmware",
      cacheCleanupNow: "Pulisci ora",
      cacheIntro: "Il firmware OpenBeken scaricato e i file UF2 generati (vedi \"ESPHome ↔ OpenBeken\") vengono conservati in modo permanente e non vengono mai eliminati da soli. Qui puoi vedere cosa occupa spazio, rimuovere singoli file e impostare un limite di pulizia automatica - i file più vecchi vengono sempre eliminati per primi.",
      cacheColType: "Tipo",
      cacheColLabel: "Etichetta",
      cacheColFile: "File",
      cacheColSize: "Dimensione",
      cacheColDate: "Aggiunto",
      cacheLoading: "Caricamento cache…",
      cacheEmpty: "La cache è vuota.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} file, {size} totali.",
      cacheMaxSizeLabel: "Dimensione massima della cache (MB)",
      cacheAutoCleanupLabel: "Pulisci automaticamente al superamento del limite",
      cacheSaveSettings: "Salva",
      cacheSettingsSaved: "Salvato.",
      cacheConfirmDelete: "Eliminare questo file dalla cache?",
      cacheConfirmCleanup: "Eliminare i file più vecchi nella cache finché la dimensione configurata non viene più superata?",
      cacheCleanupNothing: "La cache è già entro la dimensione configurata - nulla è stato eliminato.",
      cacheCleanupDone: "{count} file eliminati.",
      cacheAlertDeleteFailed: "Eliminazione non riuscita: {msg}",
      cacheAlertCleanupFailed: "Pulizia non riuscita: {msg}",
      cacheAlertSettingsFailed: "Salvataggio non riuscito: {msg}",
      notifActive: "attivo",
      notifInactive: "inattivo",
      notifSave: "Salva",
      notifTest: "Invia messaggio di prova",
      notifRemove: "Rimuovi",
      notifTestSending: "Invio messaggio di prova…",
      notifTestSent: "Il messaggio di prova è stato inviato.",
      notifTestFailed: "Non riuscito: {msg}",
      noChannelYet: "Nessun canale di notifica configurato ancora.",
      saveChannel: "Salva canale",
      notifHaLabel: "Destinazione notifica Home Assistant",
      notifHaHint: "Il nome di un servizio <code>notify.*</code> esistente, ad es. \"mobile_app_phone\" o \"persistent_notification\". Non c'è altro da configurare.",
      notifTelegramTokenLabel: "Token del bot",
      notifTelegramTokenHint: "Da @BotFather su Telegram: apri una chat, invia \"/newbot\" e segui le istruzioni.",
      notifTelegramChatIdLabel: "ID chat",
      notifTelegramChatIdHint: "Invia un messaggio al tuo bot, poi apri https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates in un browser - \"chat\":{\"id\": ...} è il tuo ID chat.",
      notifWhatsappPhoneLabel: "Numero di telefono",
      notifWhatsappPhoneHint: "Incluso il prefisso internazionale, ad es. 491511234567.",
      notifWhatsappApikeyLabel: "Chiave API (CallMeBot)",
      notifWhatsappApikeyHint: "Bot WhatsApp gratuito, non serve un account business Meta: salva +34 644 84 71 04 come contatto, invia il messaggio WhatsApp \"I allow callmebot to send me messages\" e riceverai la tua chiave API personale via WhatsApp.",
      notifNameLabel: "Nome",
      notifNamePlaceholder: "ad es. il telefono di Alex",
      notifMessageLabel: "Messaggio",
      notifMessageHint: "Segnaposto: {version} = nuova versione del firmware, {devices} = dispositivi interessati.",
      notifDefaultTemplate: "OpenBK7231T_App {version} è disponibile. Dispositivi interessati: {devices}.",
      notifActiveLabel: "Attivo",
      notifKeepUnchanged: "•••• (lascia invariato per mantenerlo)",
      notifApikeyPlaceholderExample: "ad es. 123456",
      backupsHeader: "Backup della configurazione",
      backupsIntro: "Salva automaticamente la mappatura dei pin/canali GPIO e lo script dei comandi di avvio di un dispositivo prima di ogni aggiornamento, così puoi annullare un aggiornamento che ripristina o danneggia la sua configurazione. Puoi anche avviare un backup manualmente per qualsiasi dispositivo qui sotto.",
      backupColDevice: "Dispositivo",
      backupColTime: "Data e ora",
      backupColReason: "Motivo",
      backupColVersion: "Firmware",
      backupReasonManual: "Manuale",
      backupReasonPreUpdate: "Prima dell'aggiornamento",
      backupEmpty: "Nessun backup ancora.",
      backupNowTitle: "Esegui backup della configurazione ora",
      backupRestoreTitle: "Ripristina questa configurazione",
      backupDownloadTitle: "Scarica il backup",
      backupConfirmRestore: "Ripristinare davvero questa configurazione sul dispositivo? Le impostazioni attuali di pin/canali e il comando di avvio verranno sovrascritti.",
      backupAlertRestoreFailed: "Ripristino non riuscito: {msg}",
      backupRestoredAlert: "Configurazione ripristinata.",
      backupConfirmDelete: "Eliminare davvero questo backup?",
      backupAlertDeleteFailed: "Eliminazione non riuscita: {msg}",
      backupAlertCreateFailed: "Backup non riuscito: {msg}",
      sensor_reboot_count: "Riavvii (stimato)",
      sensor_last_seen: "Visto l'ultima volta",
    },
    lv: {
      checkRelease: "Pārbaudīt atjauninājumus",
      themeToggle: "Pārslēgt gaišo/tumšo režīmu",
      updateAll: "Atjaunināt visas",
      devicesHeader: "Ierīces",
      scanNetwork: "Skenēt tīklu",
      addDevice: "Pievienot ierīci",
      addIpPlaceholder: "IP adrese (piem., 192.168.1.50)",
      addNamePlaceholder: "Nosaukums (nav obligāts)",
      addPasswordPlaceholder: "Administratora parole (ja iestatīta)",
      add: "Pievienot",
      cancel: "Atcelt",
      colName: "Nosaukums",
      colIp: "IP",
      colChipset: "Mikroshēma",
      colVersion: "Versija",
      colStatus: "Statuss",
      colActions: "Darbības",
      loadingDevices: "Ielādē ierīces…",
      emptyDevices: "Vēl nav pievienota neviena ierīce. Skenējiet tīklu vai pievienojiet to manuāli.",
      scanResultsHeader: "Skenēšanas rezultāti",
      close: "Aizvērt",
      notificationsHeader: "Paziņojumi",
      notificationsIntro: "Izvēlieties, kā vēlaties saņemt paziņojumu, kad tiek izlaista jauna OpenBK7231T_App programmaparatūra. Varat iestatīt vairākus kanālus vienlaikus. Ja neviens kanāls nav aktīvs, papildinājums izmantos parastu Home Assistant paziņojumu.",
      addChannel: "Pievienot kanālu",
      chooseChannelType: "Izvēlieties kanāla veidu:",
      settingsHeader: "Iestatījumi",
      statusUpdating: "Notiek atjaunināšana…",
      statusFailed: "Neizdevās",
      statusTimeout: "Iestājās noildze",
      statusOffline: "Bezsaistē",
      statusOnline: "Tiešsaistē",
      uartOnlyHint: "Tikai UART/SPI iezibināšana",
      unknownVersion: "nezināma",
      newVersionPrefix: "jauna: ",
      updateTitleUartOnly: "Šī mikroshēma neatbalsta atjaunināšanu caur tīklu (tikai UART/SPI iezibināšana).",
      updateTitleUpdating: "Atjaunināšana jau tiek veikta.",
      updateTitleNoUpdateKnown: "Pašlaik nav zināma jaunāka versija - noklikšķiniet tik un tā, lai atkārtoti iezibinātu programmaparatūru.",
      refreshTitle: "Vēlreiz aptaujāt ierīci",
      updateBtnLabel: "Programmaparatūras atjauninājums",
      deleteTitle: "Noņemt ierīci",
      openDeviceTitle: "Atvērt ierīci pārlūkā",
      confirmUpdateAll: "Vai tagad atjaunināt visas ierīces, kurām pieejams atjauninājums?",
      confirmUpdateDevice: "Vai sākt programmaparatūras atjaunināšanu tagad? Pēc tam ierīce restartēsies.",
      confirmUpdateDeviceNoUpdate: "Pašlaik nav zināma jaunāka versija. Vai tik un tā atkārtoti iezibināt programmaparatūru?",
      confirmDelete: "Vai noņemt šo ierīci no saraksta?",
      confirmDeleteChannel: "Vai noņemt šo paziņojumu kanālu?",
      alertDeviceOffline: "Ierīce \"{name}\" neatbild (tā ir bezsaistē vai parole ir nepareiza).",
      alertActionFailed: "Darbība neizdevās: {msg}",
      alertRenameFailed: "Pārdēvēšana neizdevās: {msg}",
      alertCheckFailed: "Pārbaude neizdevās: {msg}",
      alertUpdateAllFailed: "Atjaunināšana neizdevās: {msg}",
      alertNoUpdatesFound: "Netika atrasta neviena ierīce ar pieejamu atjauninājumu.",
      alertUpdatesStarted: "Sākta(s) {count} atjaunināšana(s).\n{skippedCount} izlaistas:\n{details}",
      alertUpdateFailedDetail: "Atjaunināšana neizdevās:\n\n{detail}",
      alertUpdateFailedGeneric: "Atjaunināšana neizdevās vai iestājās noildze. Sīkāka informācija nav pieejama.",
      alertAddFailed: "Pievienošana neizdevās: {msg}",
      alertScanFailed: "Skenēšana neizdevās: {msg}",
      alertSaveFailed: "Saglabāšana neizdevās: {msg}",
      alertDeleteChannelFailed: "Noņemšana neizdevās: {msg}",
      alertCreateChannelFailed: "Izveide neizdevās: {msg}",
      alertSensorLabelSaveFailed: "Sensora pārdēvēšana neizdevās: {msg}",
      bannerUpdateText: "Pieejama jauna programmaparatūra {count} ierīcei(-ēm).",
      scanningStatus: "Skenē tīklu… tas var aizņemt līdz 20 sekundēm.",
      scanResultStatus: "Apakštīkls: {subnet} – atrasta(s) {count} ierīce(-es).",
      subnetUnknown: "nezināms",
      alreadyAdded: "jau pievienota",
      addBtn: "Pievienot",
      noDevicesFoundScan: "Ierīces nav atrastas.",
      settingsScanSubnet: "Skenējamais apakštīkls",
      settingsAuto: "automātisks",
      settingsPollInterval: "Aptaujas intervāls",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Izlaidumu pārbaudes intervāls",
      settingsHoursUnit: "h",
      settingsNotifications: "Paziņojumi",
      settingsEnabled: "ieslēgts",
      settingsDisabled: "izslēgts",
      settingsFirmwarePort: "Programmaparatūras servera ports",
      sensorLoading: "Ielādē sensora datus…",
      sensorNoData: "Šī ierīce nesūta nekādus sensoru datus (piem., nav uzstādīts jaudas skaitītājs/temperatūras sensors).",
      sensorLoadError: "Neizdevās ielādēt sensora datus: {msg}",
      renameSensorPrompt: "Jauns šī sensora attēlotais nosaukums (atstājiet tukšu, lai atiestatītu):",
      category_wifi: "Wi-Fi savienojums",
      category_power: "Enerģijas patēriņš",
      category_diagnostics: "Diagnostika",
      category_environment: "Vide",
      category_other: "Citi",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi signāls",
      sensor_ssid: "SSID",
      sensor_uptime: "Darbības laiks",
      sensor_uptime_sec: "Darbības laiks (sekundēs)",
      sensor_heap: "Brīvā atmiņa",
      sensor_power: "Jauda",
      sensor_apparent_power: "Pilnā jauda",
      sensor_reactive_power: "Reaktīvā jauda",
      sensor_power_factor: "Jaudas koeficients",
      sensor_voltage: "Spriegums",
      sensor_current: "Strāva",
      sensor_frequency: "Frekvence",
      sensor_energy_total: "Kopējā enerģija",
      sensor_energy_last_hour: "Enerģija pēdējā stundā",
      sensor_energy_yesterday: "Enerģija vakar",
      sensor_temperature: "Temperatūra",
      sensor_humidity: "Mitrums",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nekad",
      releaseNotChecked: "Izlaidums: vēl nav pārbaudīts",
      releaseLabel: "Izlaidums: {tag}",
      lastChecked: "Pēdējoreiz pārbaudīts: {date}",
      viewReleaseNotes: "Skatīt izlaiduma piezīmes",
      releasePublished: "Publicēts: {date}",
      releaseNoNotes: "Izlaiduma piezīmes nav pieejamas.",
      viewOnGithub: "Skatīt GitHub",
      githubRepoTitle: "Atvērt OpenBK7231T_App vietnē GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Programmaparatūras kešatmiņa",
      cacheCleanupNow: "Notīrīt tagad",
      cacheIntro: "Lejupielādētā OpenBeken programmaparatūra un izveidotie UF2 faili (skatiet \"ESPHome ↔ OpenBeken\") tiek glabāti pastāvīgi un paši no sevis netiek dzēsti. Šeit varat redzēt, kas aizņem vietu, dzēst atsevišķus failus un iestatīt automātiskas notīrīšanas limitu - vispirms vienmēr tiek dzēsti vecākie faili.",
      cacheColType: "Veids",
      cacheColLabel: "Nosaukums",
      cacheColFile: "Fails",
      cacheColSize: "Izmērs",
      cacheColDate: "Pievienots",
      cacheLoading: "Ielādē kešatmiņu…",
      cacheEmpty: "Kešatmiņa ir tukša.",
      cacheKindFirmware: "Programmaparatūra",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} fails(-i), kopā {size}.",
      cacheMaxSizeLabel: "Maksimālais kešatmiņas izmērs (MB)",
      cacheAutoCleanupLabel: "Notīrīt automātiski, tiklīdz limits pārsniegts",
      cacheSaveSettings: "Saglabāt",
      cacheSettingsSaved: "Saglabāts.",
      cacheConfirmDelete: "Vai dzēst šo failu no kešatmiņas?",
      cacheConfirmCleanup: "Vai dzēst vecākos kešatmiņas failus, līdz iestatītais izmērs vairs nav pārsniegts?",
      cacheCleanupNothing: "Kešatmiņa jau atbilst iestatītajam izmēram - nekas netika dzēsts.",
      cacheCleanupDone: "Izdzēsts(-i) {count} fails(-i).",
      cacheAlertDeleteFailed: "Dzēšana neizdevās: {msg}",
      cacheAlertCleanupFailed: "Notīrīšana neizdevās: {msg}",
      cacheAlertSettingsFailed: "Saglabāšana neizdevās: {msg}",
      notifActive: "aktīvs",
      notifInactive: "neaktīvs",
      notifSave: "Saglabāt",
      notifTest: "Sūtīt testa ziņu",
      notifRemove: "Noņemt",
      notifTestSending: "Sūta testa ziņu…",
      notifTestSent: "Testa ziņa tika nosūtīta.",
      notifTestFailed: "Neizdevās: {msg}",
      noChannelYet: "Vēl nav iestatīts neviens paziņojumu kanāls.",
      saveChannel: "Saglabāt kanālu",
      notifHaLabel: "Home Assistant paziņojumu mērķis",
      notifHaHint: "Esošā <code>notify.*</code> pakalpojuma nosaukums, piem., \"mobile_app_phone\" vai \"persistent_notification\". Nekas cits nav jāiestata.",
      notifTelegramTokenLabel: "Bota tokens",
      notifTelegramTokenHint: "No @BotFather Telegram: atveriet sarunu, nosūtiet \"/newbot\" un sekojiet norādījumiem.",
      notifTelegramChatIdLabel: "Tērzēšanas ID",
      notifTelegramChatIdHint: "Nosūtiet savam botam ziņu, tad pārlūkā atveriet https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} ir jūsu tērzēšanas ID.",
      notifWhatsappPhoneLabel: "Tālruņa numurs",
      notifWhatsappPhoneHint: "Ieskaitot valsts kodu, piem., 491511234567.",
      notifWhatsappApikeyLabel: "API atslēga (CallMeBot)",
      notifWhatsappApikeyHint: "Bezmaksas WhatsApp bots, Meta uzņēmuma konts nav vajadzīgs: saglabājiet +34 644 84 71 04 kā kontaktu, nosūtiet tam WhatsApp ziņu \"I allow callmebot to send me messages\", un jūs saņemsiet savu personīgo API atslēgu atpakaļ pa WhatsApp.",
      notifNameLabel: "Nosaukums",
      notifNamePlaceholder: "piem., Alekša telefons",
      notifMessageLabel: "Ziņa",
      notifMessageHint: "Aizvietotāji: {version} = jaunā programmaparatūras versija, {devices} = skartās ierīces.",
      notifDefaultTemplate: "Pieejama OpenBK7231T_App {version}. Skartās ierīces: {devices}.",
      notifActiveLabel: "Aktīvs",
      notifKeepUnchanged: "•••• (atstājiet nemainītu, lai to saglabātu)",
      notifApikeyPlaceholderExample: "piem., 123456",
      backupsHeader: "Konfigurācijas dublējumi",
      backupsIntro: "Pirms katra atjauninājuma automātiski saglabā ierīces GPIO kontaktu/kanālu kartējumu un startēšanas komandu skriptu, lai varētu atsaukt atjauninājumu, kas atiestata vai sabojā tās konfigurāciju. Dublējumu var izveidot arī manuāli jebkurai ierīcei zemāk.",
      backupColDevice: "Ierīce",
      backupColTime: "Laiks",
      backupColReason: "Iemesls",
      backupColVersion: "Aparātprogrammatūra",
      backupReasonManual: "Manuāli",
      backupReasonPreUpdate: "Pirms atjauninājuma",
      backupEmpty: "Vēl nav dublējumu.",
      backupNowTitle: "Dublēt konfigurāciju tagad",
      backupRestoreTitle: "Atjaunot šo konfigurāciju",
      backupDownloadTitle: "Lejupielādēt dublējumu",
      backupConfirmRestore: "Vai tiešām atjaunot šo konfigurāciju ierīcē? Pašreizējie kontaktu/kanālu iestatījumi un startēšanas komanda tiks pārrakstīti.",
      backupAlertRestoreFailed: "Atjaunošana neizdevās: {msg}",
      backupRestoredAlert: "Konfigurācija atjaunota.",
      backupConfirmDelete: "Vai tiešām dzēst šo dublējumu?",
      backupAlertDeleteFailed: "Dzēšana neizdevās: {msg}",
      backupAlertCreateFailed: "Dublēšana neizdevās: {msg}",
      sensor_reboot_count: "Pārstartēšanas (aptuveni)",
      sensor_last_seen: "Pēdējoreiz redzēts",
    },
    lt: {
      checkRelease: "Tikrinti atnaujinimus",
      themeToggle: "Perjungti šviesų / tamsų režimą",
      updateAll: "Atnaujinti visus",
      devicesHeader: "Įrenginiai",
      scanNetwork: "Nuskaityti tinklą",
      addDevice: "Pridėti įrenginį",
      addIpPlaceholder: "IP adresas (pvz., 192.168.1.50)",
      addNamePlaceholder: "Pavadinimas (neprivaloma)",
      addPasswordPlaceholder: "Administratoriaus slaptažodis (jei nustatytas)",
      add: "Pridėti",
      cancel: "Atšaukti",
      colName: "Pavadinimas",
      colIp: "IP",
      colChipset: "Lustas",
      colVersion: "Versija",
      colStatus: "Būsena",
      colActions: "Veiksmai",
      loadingDevices: "Įkeliami įrenginiai…",
      emptyDevices: "Kol kas nepridėta jokių įrenginių. Nuskaitykite tinklą arba pridėkite įrenginį rankiniu būdu.",
      scanResultsHeader: "Nuskaitymo rezultatai",
      close: "Uždaryti",
      notificationsHeader: "Pranešimai",
      notificationsIntro: "Pasirinkite, kaip norėtumėte gauti pranešimą, kai išleidžiama nauja OpenBK7231T_App programinė aparatinė įranga. Galite nustatyti kelis kanalus vienu metu. Jei neaktyvus nė vienas kanalas, priedas naudos įprastą Home Assistant pranešimą.",
      addChannel: "Pridėti kanalą",
      chooseChannelType: "Pasirinkite kanalo tipą:",
      settingsHeader: "Nustatymai",
      statusUpdating: "Atnaujinama…",
      statusFailed: "Nepavyko",
      statusTimeout: "Baigėsi laikas",
      statusOffline: "Neprisijungęs",
      statusOnline: "Prisijungęs",
      uartOnlyHint: "Tik UART/SPI įrašymas",
      unknownVersion: "nežinoma",
      newVersionPrefix: "nauja: ",
      updateTitleUartOnly: "Šis lustas nepalaiko atnaujinimo per tinklą (tik UART/SPI įrašymas).",
      updateTitleUpdating: "Atnaujinimas jau vyksta.",
      updateTitleNoUpdateKnown: "Šiuo metu naujesnė versija nežinoma - vis tiek spustelėkite, jei norite iš naujo įrašyti programinę aparatinę įrangą.",
      refreshTitle: "Iš naujo užklausti įrenginį",
      updateBtnLabel: "Programinės aparatinės įrangos atnaujinimas",
      deleteTitle: "Pašalinti įrenginį",
      openDeviceTitle: "Atidaryti įrenginį naršyklėje",
      confirmUpdateAll: "Atnaujinti dabar visus įrenginius, kuriems yra prieinamas atnaujinimas?",
      confirmUpdateDevice: "Pradėti programinės aparatinės įrangos atnaujinimą dabar? Po to įrenginys bus paleistas iš naujo.",
      confirmUpdateDeviceNoUpdate: "Šiuo metu naujesnė versija nežinoma. Vis tiek iš naujo įrašyti programinę aparatinę įrangą?",
      confirmDelete: "Pašalinti šį įrenginį iš sąrašo?",
      confirmDeleteChannel: "Pašalinti šį pranešimų kanalą?",
      alertDeviceOffline: "Įrenginys \"{name}\" neatsako (jis neprisijungęs arba slaptažodis neteisingas).",
      alertActionFailed: "Veiksmas nepavyko: {msg}",
      alertRenameFailed: "Pervadinti nepavyko: {msg}",
      alertCheckFailed: "Patikrinti nepavyko: {msg}",
      alertUpdateAllFailed: "Atnaujinti nepavyko: {msg}",
      alertNoUpdatesFound: "Nerasta įrenginių, kuriems yra prieinamas atnaujinimas.",
      alertUpdatesStarted: "Pradėta atnaujinimų: {count}.\nPraleista {skippedCount}:\n{details}",
      alertUpdateFailedDetail: "Atnaujinti nepavyko:\n\n{detail}",
      alertUpdateFailedGeneric: "Atnaujinimas nepavyko arba baigėsi laikas. Daugiau informacijos nėra.",
      alertAddFailed: "Pridėti nepavyko: {msg}",
      alertScanFailed: "Nuskaityti nepavyko: {msg}",
      alertSaveFailed: "Išsaugoti nepavyko: {msg}",
      alertDeleteChannelFailed: "Pašalinti nepavyko: {msg}",
      alertCreateChannelFailed: "Sukurti nepavyko: {msg}",
      alertSensorLabelSaveFailed: "Pervadinti jutiklį nepavyko: {msg}",
      bannerUpdateText: "Yra nauja programinė aparatinė įranga {count} įrenginiui(-iams).",
      scanningStatus: "Nuskaitomas tinklas… tai gali užtrukti iki 20 sekundžių.",
      scanResultStatus: "Potinklis: {subnet} – rasta įrenginių: {count}.",
      subnetUnknown: "nežinomas",
      alreadyAdded: "jau pridėtas",
      addBtn: "Pridėti",
      noDevicesFoundScan: "Įrenginių nerasta.",
      settingsScanSubnet: "Skenuojamas potinklis",
      settingsAuto: "automatinis",
      settingsPollInterval: "Apklausos intervalas",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Naujinių patikros intervalas",
      settingsHoursUnit: "val.",
      settingsNotifications: "Pranešimai",
      settingsEnabled: "įjungta",
      settingsDisabled: "išjungta",
      settingsFirmwarePort: "Programinės aparatinės įrangos serverio prievadas",
      sensorLoading: "Įkeliami jutiklio duomenys…",
      sensorNoData: "Šis įrenginys nepraneša jokių jutiklio duomenų (pvz., neįdiegtas galios matuoklis / temperatūros jutiklis).",
      sensorLoadError: "Nepavyko įkelti jutiklio duomenų: {msg}",
      renameSensorPrompt: "Naujas šio jutiklio rodomas pavadinimas (palikite tuščią, kad atkurtumėte numatytąjį):",
      category_wifi: "Wi-Fi ryšys",
      category_power: "Energijos suvartojimas",
      category_diagnostics: "Diagnostika",
      category_environment: "Aplinka",
      category_other: "Kita",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi signalas",
      sensor_ssid: "SSID",
      sensor_uptime: "Veikimo laikas",
      sensor_uptime_sec: "Veikimo laikas (sekundėmis)",
      sensor_heap: "Laisva atmintis",
      sensor_power: "Galia",
      sensor_apparent_power: "Pilnutinė galia",
      sensor_reactive_power: "Reaktyvioji galia",
      sensor_power_factor: "Galios koeficientas",
      sensor_voltage: "Įtampa",
      sensor_current: "Srovė",
      sensor_frequency: "Dažnis",
      sensor_energy_total: "Bendra energija",
      sensor_energy_last_hour: "Energija per paskutinę valandą",
      sensor_energy_yesterday: "Vakar suvartota energija",
      sensor_temperature: "Temperatūra",
      sensor_humidity: "Drėgmė",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "niekada",
      releaseNotChecked: "Laida: dar netikrinta",
      releaseLabel: "Laida: {tag}",
      lastChecked: "Paskutinį kartą tikrinta: {date}",
      viewReleaseNotes: "Peržiūrėti laidos aprašymą",
      releasePublished: "Paskelbta: {date}",
      releaseNoNotes: "Laidos aprašymo nėra.",
      viewOnGithub: "Žiūrėti GitHub",
      githubRepoTitle: "Atidaryti OpenBK7231T_App svetainėje GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Programinės aparatinės įrangos talpykla",
      cacheCleanupNow: "Išvalyti dabar",
      cacheIntro: "Atsisiųsta OpenBeken programinė aparatinė įranga ir sugeneruoti UF2 failai (žr. \"ESPHome ↔ OpenBeken\") saugomi nuolat ir patys savaime nėra ištrinami. Čia matote, kas užima vietą, galite pašalinti atskirus failus ir nustatyti automatinio valymo ribą - seniausi failai visada ištrinami pirmiausia.",
      cacheColType: "Tipas",
      cacheColLabel: "Pavadinimas",
      cacheColFile: "Failas",
      cacheColSize: "Dydis",
      cacheColDate: "Pridėta",
      cacheLoading: "Įkeliama talpykla…",
      cacheEmpty: "Talpykla tuščia.",
      cacheKindFirmware: "Programinė aparatinė įranga",
      cacheKindUf2: "UF2",
      cacheTotal: "Failų: {count}, iš viso: {size}.",
      cacheMaxSizeLabel: "Didžiausias talpyklos dydis (MB)",
      cacheAutoCleanupLabel: "Valyti automatiškai, kai viršijama",
      cacheSaveSettings: "Išsaugoti",
      cacheSettingsSaved: "Išsaugota.",
      cacheConfirmDelete: "Ištrinti šį failą iš talpyklos?",
      cacheConfirmCleanup: "Ištrinti seniausius talpyklos failus, kol nebebus viršijamas nustatytas dydis?",
      cacheCleanupNothing: "Talpykla jau neviršija nustatyto dydžio - nieko neištrinta.",
      cacheCleanupDone: "Ištrinta failų: {count}.",
      cacheAlertDeleteFailed: "Ištrinti nepavyko: {msg}",
      cacheAlertCleanupFailed: "Išvalyti nepavyko: {msg}",
      cacheAlertSettingsFailed: "Išsaugoti nepavyko: {msg}",
      notifActive: "aktyvus",
      notifInactive: "neaktyvus",
      notifSave: "Išsaugoti",
      notifTest: "Siųsti bandomąją žinutę",
      notifRemove: "Pašalinti",
      notifTestSending: "Siunčiama bandomoji žinutė…",
      notifTestSent: "Bandomoji žinutė išsiųsta.",
      notifTestFailed: "Nepavyko: {msg}",
      noChannelYet: "Kol kas nesukurtas nė vienas pranešimų kanalas.",
      saveChannel: "Išsaugoti kanalą",
      notifHaLabel: "Home Assistant pranešimų paskirties vieta",
      notifHaHint: "Esamos <code>notify.*</code> paslaugos pavadinimas, pvz., \"mobile_app_phone\" arba \"persistent_notification\". Daugiau nieko nustatyti nereikia.",
      notifTelegramTokenLabel: "Boto prieigos raktas",
      notifTelegramTokenHint: "Iš @BotFather programoje Telegram: atidarykite pokalbį, išsiųskite \"/newbot\" ir vykdykite instrukcijas.",
      notifTelegramChatIdLabel: "Pokalbio ID",
      notifTelegramChatIdHint: "Išsiųskite savo botui žinutę, tada naršyklėje atidarykite https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} yra jūsų pokalbio ID.",
      notifWhatsappPhoneLabel: "Telefono numeris",
      notifWhatsappPhoneHint: "Įskaitant šalies kodą, pvz., 491511234567.",
      notifWhatsappApikeyLabel: "API raktas (CallMeBot)",
      notifWhatsappApikeyHint: "Nemokamas WhatsApp botas, Meta verslo paskyros nereikia: išsaugokite +34 644 84 71 04 kaip kontaktą, išsiųskite jam WhatsApp žinutę \"I allow callmebot to send me messages\" ir per WhatsApp gausite savo asmeninį API raktą.",
      notifNameLabel: "Pavadinimas",
      notifNamePlaceholder: "pvz., Aleksandro telefonas",
      notifMessageLabel: "Žinutė",
      notifMessageHint: "Vietos ženklai: {version} = nauja programinės aparatinės įrangos versija, {devices} = paveikti įrenginiai.",
      notifDefaultTemplate: "Yra OpenBK7231T_App {version}. Paveikti įrenginiai: {devices}.",
      notifActiveLabel: "Aktyvus",
      notifKeepUnchanged: "•••• (palikite nepakeistą, kad išliktų)",
      notifApikeyPlaceholderExample: "pvz., 123456",
      backupsHeader: "Konfigūracijos atsarginės kopijos",
      backupsIntro: "Prieš kiekvieną atnaujinimą automatiškai išsaugo įrenginio GPIO kontaktų/kanalų susiejimą ir paleisties komandų scenarijų, kad galėtum atšaukti atnaujinimą, kuris nustato iš naujo arba sugadina jo konfigūraciją. Atsarginę kopiją taip pat gali sukurti rankiniu būdu bet kuriam įrenginiui žemiau.",
      backupColDevice: "Įrenginys",
      backupColTime: "Laikas",
      backupColReason: "Priežastis",
      backupColVersion: "Programinė aparatinė įranga",
      backupReasonManual: "Rankiniu būdu",
      backupReasonPreUpdate: "Prieš atnaujinimą",
      backupEmpty: "Atsarginių kopijų dar nėra.",
      backupNowTitle: "Sukurti konfigūracijos atsarginę kopiją dabar",
      backupRestoreTitle: "Atkurti šią konfigūraciją",
      backupDownloadTitle: "Atsisiųsti atsarginę kopiją",
      backupConfirmRestore: "Ar tikrai atkurti šią konfigūraciją įrenginyje? Dabartiniai kontaktų/kanalų nustatymai ir paleisties komanda bus perrašyti.",
      backupAlertRestoreFailed: "Atkūrimas nepavyko: {msg}",
      backupRestoredAlert: "Konfigūracija atkurta.",
      backupConfirmDelete: "Ar tikrai ištrinti šią atsarginę kopiją?",
      backupAlertDeleteFailed: "Ištrinti nepavyko: {msg}",
      backupAlertCreateFailed: "Nepavyko sukurti atsarginės kopijos: {msg}",
      sensor_reboot_count: "Paleidimai iš naujo (apytiksliai)",
      sensor_last_seen: "Paskutinį kartą matytas",
    },
    mt: {
      checkRelease: "Iċċekkja l-aġġornamenti",
      themeToggle: "Aqleb bejn il-mod ċar/skur",
      updateAll: "Aġġorna kollox",
      devicesHeader: "Apparati",
      scanNetwork: "Skennja n-network",
      addDevice: "Żid apparat",
      addIpPlaceholder: "Indirizz IP (eż. 192.168.1.50)",
      addNamePlaceholder: "Isem (mhux obbligatorju)",
      addPasswordPlaceholder: "Password tal-amministratur (jekk issettjata)",
      add: "Żid",
      cancel: "Ikkanċella",
      colName: "Isem",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Verżjoni",
      colStatus: "Status",
      colActions: "Azzjonijiet",
      loadingDevices: "Qed jitgħabbew l-apparati…",
      emptyDevices: "Għadu ma ġie miżjud l-ebda apparat. Skennja n-network jew żid wieħed manwalment.",
      scanResultsHeader: "Riżultati tal-iskennjar",
      close: "Agħlaq",
      notificationsHeader: "Notifiki",
      notificationsIntro: "Agħżel kif tixtieq tiġi nnotifikat meta tinħareġ firmware ġdida OpenBK7231T_App. Tista' tissettja diversi kanali f'daqqa. Jekk l-ebda kanal ma jkun attiv, l-add-on jaqa' lura fuq notifika normali ta' Home Assistant.",
      addChannel: "Żid kanal",
      chooseChannelType: "Agħżel tip ta' kanal:",
      settingsHeader: "Settings",
      statusUpdating: "Qed jiġi aġġornat…",
      statusFailed: "Falla",
      statusTimeout: "Il-ħin skada",
      statusOffline: "Mhux konness",
      statusOnline: "Konness",
      uartOnlyHint: "Flashing UART/SPI biss",
      unknownVersion: "mhux magħruf",
      newVersionPrefix: "ġdid: ",
      updateTitleUartOnly: "Dan iċ-chipset ma jappoġġax aġġornament min-network (flashing UART/SPI biss).",
      updateTitleUpdating: "Aġġornament diġà għaddej.",
      updateTitleNoUpdateKnown: "Bħalissa mhi magħrufa l-ebda verżjoni aktar ġdida - agħfas xorta waħda biex terġa' tiflasja l-firmware.",
      refreshTitle: "Staqsi mill-ġdid lill-apparat",
      updateBtnLabel: "Aġġornament tal-firmware",
      deleteTitle: "Neħħi l-apparat",
      openDeviceTitle: "Iftaħ l-apparat fil-browser",
      confirmUpdateAll: "Tixtieq taġġorna issa l-apparati kollha li għandhom aġġornament disponibbli?",
      confirmUpdateDevice: "Tibda l-aġġornament tal-firmware issa? Wara, l-apparat jerġa' jitqabbad.",
      confirmUpdateDeviceNoUpdate: "Bħalissa mhi magħrufa l-ebda verżjoni aktar ġdida. Terġa' tiflasja l-firmware xorta waħda?",
      confirmDelete: "Tneħħi dan l-apparat mil-lista?",
      confirmDeleteChannel: "Tneħħi dan il-kanal tan-notifiki?",
      alertDeviceOffline: "L-apparat \"{name}\" mhux qed iwieġeb (mhux konness jew password ħażina).",
      alertActionFailed: "L-azzjoni fallita: {msg}",
      alertRenameFailed: "It-tibdil tal-isem falla: {msg}",
      alertCheckFailed: "Iċ-ċekk falla: {msg}",
      alertUpdateAllFailed: "L-aġġornament falla: {msg}",
      alertNoUpdatesFound: "Ma nstab l-ebda apparat b'aġġornament disponibbli.",
      alertUpdatesStarted: "{count} aġġornament(i) bdew.\n{skippedCount} inqabżu:\n{details}",
      alertUpdateFailedDetail: "L-aġġornament falla:\n\n{detail}",
      alertUpdateFailedGeneric: "L-aġġornament falla jew il-ħin skada. M'hemm l-ebda dettall ieħor disponibbli.",
      alertAddFailed: "Iż-żieda falliet: {msg}",
      alertScanFailed: "L-iskennjar falla: {msg}",
      alertSaveFailed: "Is-salvar falla: {msg}",
      alertDeleteChannelFailed: "It-tneħħija falliet: {msg}",
      alertCreateChannelFailed: "Il-ħolqien falla: {msg}",
      alertSensorLabelSaveFailed: "It-tibdil tal-isem tas-sensor falla: {msg}",
      bannerUpdateText: "Firmware ġdida disponibbli għal {count} apparat(i).",
      scanningStatus: "Qed jiġi skennjat in-network… dan jista' jdum sa 20 sekonda.",
      scanResultStatus: "Subnet: {subnet} – {count} apparat(i) misjuba.",
      subnetUnknown: "mhux magħruf",
      alreadyAdded: "diġà miżjud",
      addBtn: "Żid",
      noDevicesFoundScan: "Ma nstab l-ebda apparat.",
      settingsScanSubnet: "Subnet li għandu jiġi skennjat",
      settingsAuto: "awtomatiku",
      settingsPollInterval: "Intervall ta' stħarriġ",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Intervall ta' verifika ta' releases",
      settingsHoursUnit: "h",
      settingsNotifications: "Notifiki",
      settingsEnabled: "attivat",
      settingsDisabled: "diżattivat",
      settingsFirmwarePort: "Port tas-server tal-firmware",
      sensorLoading: "Qed jitgħabbew id-dejta tas-sensor…",
      sensorNoData: "Dan l-apparat ma jirrapporta l-ebda dejta ta' sensor (eż. l-ebda power meter/sensor tat-temperatura installat).",
      sensorLoadError: "Ma setgħetx titgħabba d-dejta tas-sensor: {msg}",
      renameSensorPrompt: "Isem ġdid għal dan is-sensor (ħalli vojt biex tirrisettja):",
      category_wifi: "Konnessjoni Wi-Fi",
      category_power: "Konsum tal-enerġija",
      category_diagnostics: "Dijanjostika",
      category_environment: "Ambjent",
      category_other: "Oħrajn",
      sensor_rssi: "RSSI",
      sensor_signal: "Sinjal Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Ħin ta' tħaddim",
      sensor_uptime_sec: "Ħin ta' tħaddim (sekondi)",
      sensor_heap: "Memorja libera",
      sensor_power: "Potenza",
      sensor_apparent_power: "Potenza apparenti",
      sensor_reactive_power: "Potenza reattiva",
      sensor_power_factor: "Fattur tal-potenza",
      sensor_voltage: "Vultaġġ",
      sensor_current: "Kurrent",
      sensor_frequency: "Frekwenza",
      sensor_energy_total: "Enerġija totali",
      sensor_energy_last_hour: "Enerġija fl-aħħar siegħa",
      sensor_energy_yesterday: "Enerġija lbieraħ",
      sensor_temperature: "Temperatura",
      sensor_humidity: "Umdità",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "qatt",
      releaseNotChecked: "Release: għadha ma ġietx ivverifikata",
      releaseLabel: "Release: {tag}",
      lastChecked: "L-aħħar verifika: {date}",
      viewReleaseNotes: "Ara n-noti tar-release",
      releasePublished: "Ippubblikat: {date}",
      releaseNoNotes: "M'hemm l-ebda noti ta' release disponibbli.",
      viewOnGithub: "Ara fuq GitHub",
      githubRepoTitle: "Iftaħ OpenBK7231T_App fuq GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Cache tal-firmware",
      cacheCleanupNow: "Naddaf issa",
      cacheIntro: "Il-firmware OpenBeken imniżżla u l-fajls UF2 iġġenerati (ara \"ESPHome ↔ OpenBeken\") jinħażnu b'mod permanenti u qatt ma jitħassru weħidhom. Hawnhekk tista' tara x'qed jokkupa l-ispazju, tneħħi fajls individwali, u tissettja limitu ta' tindif awtomatiku - il-fajls l-eqdem dejjem jitħassru l-ewwel.",
      cacheColType: "Tip",
      cacheColLabel: "Tikketta",
      cacheColFile: "Fajl",
      cacheColSize: "Daqs",
      cacheColDate: "Miżjud",
      cacheLoading: "Qed titgħabba l-cache…",
      cacheEmpty: "Il-cache vojta.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} fajl(s), total ta' {size}.",
      cacheMaxSizeLabel: "Daqs massimu tal-cache (MB)",
      cacheAutoCleanupLabel: "Naddaf awtomatikament ladarba jinqabeż",
      cacheSaveSettings: "Issejvja",
      cacheSettingsSaved: "Issejvjat.",
      cacheConfirmDelete: "Tħassar dan il-fajl mill-cache?",
      cacheConfirmCleanup: "Tħassar l-eqdem fajls fil-cache sakemm id-daqs konfigurat ma jibqax jinqabeż?",
      cacheCleanupNothing: "Il-cache diġà fil-limitu konfigurat - xejn ma tħassar.",
      cacheCleanupDone: "{count} fajl(s) tħassru.",
      cacheAlertDeleteFailed: "It-tħassir falla: {msg}",
      cacheAlertCleanupFailed: "It-tindif falla: {msg}",
      cacheAlertSettingsFailed: "Is-salvar falla: {msg}",
      notifActive: "attiv",
      notifInactive: "mhux attiv",
      notifSave: "Issejvja",
      notifTest: "Ibgħat messaġġ ta' test",
      notifRemove: "Neħħi",
      notifTestSending: "Qed jintbagħat messaġġ ta' test…",
      notifTestSent: "Il-messaġġ ta' test intbagħat.",
      notifTestFailed: "Falla: {msg}",
      noChannelYet: "Għadu ma ġie ssettjat l-ebda kanal ta' notifika.",
      saveChannel: "Issejvja l-kanal",
      notifHaLabel: "Destinazzjoni ta' notifika ta' Home Assistant",
      notifHaHint: "L-isem ta' servizz <code>notify.*</code> eżistenti, eż. \"mobile_app_phone\" jew \"persistent_notification\". M'hemm xejn iktar x'tissettja.",
      notifTelegramTokenLabel: "Token tal-bot",
      notifTelegramTokenHint: "Minn @BotFather fuq Telegram: iftaħ chat, ibgħat \"/newbot\", u segwi l-istruzzjonijiet.",
      notifTelegramChatIdLabel: "Chat ID",
      notifTelegramChatIdHint: "Ibgħat messaġġ lill-bot tiegħek, imbagħad iftaħ https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates f'browser - \"chat\":{\"id\": ...} huwa ċ-Chat ID tiegħek.",
      notifWhatsappPhoneLabel: "Numru tat-telefon",
      notifWhatsappPhoneHint: "Bil-kodiċi tal-pajjiż inkluż, eż. 491511234567.",
      notifWhatsappApikeyLabel: "Ċavetta API (CallMeBot)",
      notifWhatsappApikeyHint: "Bot ta' WhatsApp b'xejn, mhux meħtieġ kont tan-negozju ta' Meta: issejvja +34 644 84 71 04 bħala kuntatt, ibagħtlu l-messaġġ WhatsApp \"I allow callmebot to send me messages\", u tirċievi lura ċ-ċavetta API personali tiegħek permezz ta' WhatsApp.",
      notifNameLabel: "Isem",
      notifNamePlaceholder: "eż. il-mowbajl ta' Alex",
      notifMessageLabel: "Messaġġ",
      notifMessageHint: "Placeholders: {version} = il-verżjoni l-ġdida tal-firmware, {devices} = l-apparati affettwati.",
      notifDefaultTemplate: "OpenBK7231T_App {version} disponibbli. Apparati affettwati: {devices}.",
      notifActiveLabel: "Attiv",
      notifKeepUnchanged: "•••• (ħalliha kif inhi biex iżżommha)",
      notifApikeyPlaceholderExample: "eż. 123456",
      backupsHeader: "Backups tal-konfigurazzjoni",
      backupsIntro: "Jissejvja awtomatikament il-mapp tal-pins/channels GPIO u l-iskript tal-kmandi tal-istartjar ta' apparat qabel kull aġġornament, sabiex tkun tista' tħassar aġġornament li jirrisettja jew jagħmel ħsara lill-konfigurazzjoni tiegħu. Tista' wkoll tibda backup manwalment għal kwalunkwe apparat hawn taħt.",
      backupColDevice: "Apparat",
      backupColTime: "Ħin",
      backupColReason: "Raġuni",
      backupColVersion: "Firmware",
      backupReasonManual: "Manwali",
      backupReasonPreUpdate: "Qabel l-aġġornament",
      backupEmpty: "Għadu m'hemm l-ebda backup.",
      backupNowTitle: "Ibbekkja l-konfigurazzjoni issa",
      backupRestoreTitle: "Irrestawra din il-konfigurazzjoni",
      backupDownloadTitle: "Niżżel il-backup",
      backupConfirmRestore: "Verament tirrestawra din il-konfigurazzjoni fuq l-apparat? L-issettjar attwali tal-pins/channels u l-kmand tal-istartjar se jinkitbu fuqhom.",
      backupAlertRestoreFailed: "Ir-restawr falla: {msg}",
      backupRestoredAlert: "Il-konfigurazzjoni ġiet irrestawrata.",
      backupConfirmDelete: "Verament tħassar dan il-backup?",
      backupAlertDeleteFailed: "It-tħassir falla: {msg}",
      backupAlertCreateFailed: "Il-backup falla: {msg}",
      sensor_reboot_count: "Riavvijamenti (stmat)",
      sensor_last_seen: "Deher l-aħħar",
    },
    pl: {
      checkRelease: "Sprawdź aktualizacje",
      themeToggle: "Przełącz tryb jasny/ciemny",
      updateAll: "Aktualizuj wszystko",
      devicesHeader: "Urządzenia",
      scanNetwork: "Skanuj sieć",
      addDevice: "Dodaj urządzenie",
      addIpPlaceholder: "Adres IP (np. 192.168.1.50)",
      addNamePlaceholder: "Nazwa (opcjonalnie)",
      addPasswordPlaceholder: "Hasło administratora (jeśli ustawione)",
      add: "Dodaj",
      cancel: "Anuluj",
      colName: "Nazwa",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Wersja",
      colStatus: "Status",
      colActions: "Akcje",
      loadingDevices: "Ładowanie urządzeń…",
      emptyDevices: "Nie dodano jeszcze żadnych urządzeń. Zeskanuj sieć lub dodaj urządzenie ręcznie.",
      scanResultsHeader: "Wyniki skanowania",
      close: "Zamknij",
      notificationsHeader: "Powiadomienia",
      notificationsIntro: "Wybierz, w jaki sposób chcesz być powiadamiany o wydaniu nowego firmware'u OpenBK7231T_App. Możesz skonfigurować kilka kanałów naraz. Jeśli żaden kanał nie jest aktywny, dodatek użyje zwykłego powiadomienia Home Assistant.",
      addChannel: "Dodaj kanał",
      chooseChannelType: "Wybierz typ kanału:",
      settingsHeader: "Ustawienia",
      statusUpdating: "Aktualizowanie…",
      statusFailed: "Niepowodzenie",
      statusTimeout: "Upłynął limit czasu",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Tylko flashowanie UART/SPI",
      unknownVersion: "nieznana",
      newVersionPrefix: "nowa: ",
      updateTitleUartOnly: "Ten chipset nie obsługuje aktualizacji sieciowej (tylko flashowanie UART/SPI).",
      updateTitleUpdating: "Aktualizacja jest już w toku.",
      updateTitleNoUpdateKnown: "Obecnie nie jest znana nowsza wersja - kliknij mimo to, aby ponownie wgrać firmware.",
      refreshTitle: "Odpytaj urządzenie ponownie",
      updateBtnLabel: "Aktualizacja firmware",
      deleteTitle: "Usuń urządzenie",
      openDeviceTitle: "Otwórz urządzenie w przeglądarce",
      confirmUpdateAll: "Zaktualizować teraz wszystkie urządzenia, dla których dostępna jest aktualizacja?",
      confirmUpdateDevice: "Rozpocząć teraz aktualizację firmware? Urządzenie zostanie następnie zrestartowane.",
      confirmUpdateDeviceNoUpdate: "Obecnie nie jest znana nowsza wersja. Mimo to ponownie wgrać firmware?",
      confirmDelete: "Usunąć to urządzenie z listy?",
      confirmDeleteChannel: "Usunąć ten kanał powiadomień?",
      alertDeviceOffline: "Urządzenie \"{name}\" nie odpowiada (offline lub błędne hasło).",
      alertActionFailed: "Akcja nie powiodła się: {msg}",
      alertRenameFailed: "Zmiana nazwy nie powiodła się: {msg}",
      alertCheckFailed: "Sprawdzenie nie powiodło się: {msg}",
      alertUpdateAllFailed: "Aktualizacja nie powiodła się: {msg}",
      alertNoUpdatesFound: "Nie znaleziono żadnych urządzeń z dostępną aktualizacją.",
      alertUpdatesStarted: "Rozpoczęto {count} aktualizacji.\nPominięto {skippedCount}:\n{details}",
      alertUpdateFailedDetail: "Aktualizacja nie powiodła się:\n\n{detail}",
      alertUpdateFailedGeneric: "Aktualizacja nie powiodła się lub upłynął limit czasu. Brak dodatkowych szczegółów.",
      alertAddFailed: "Dodawanie nie powiodło się: {msg}",
      alertScanFailed: "Skanowanie nie powiodło się: {msg}",
      alertSaveFailed: "Zapisywanie nie powiodło się: {msg}",
      alertDeleteChannelFailed: "Usuwanie nie powiodło się: {msg}",
      alertCreateChannelFailed: "Tworzenie nie powiodło się: {msg}",
      alertSensorLabelSaveFailed: "Zmiana nazwy czujnika nie powiodła się: {msg}",
      bannerUpdateText: "Nowy firmware dostępny dla {count} urządzeń.",
      scanningStatus: "Skanowanie sieci… może to potrwać do 20 sekund.",
      scanResultStatus: "Podsieć: {subnet} – znaleziono {count} urządzeń.",
      subnetUnknown: "nieznana",
      alreadyAdded: "już dodano",
      addBtn: "Dodaj",
      noDevicesFoundScan: "Nie znaleziono żadnych urządzeń.",
      settingsScanSubnet: "Skanowana podsieć",
      settingsAuto: "automatycznie",
      settingsPollInterval: "Interwał odpytywania",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Interwał sprawdzania wydań",
      settingsHoursUnit: "h",
      settingsNotifications: "Powiadomienia",
      settingsEnabled: "włączone",
      settingsDisabled: "wyłączone",
      settingsFirmwarePort: "Port serwera firmware",
      sensorLoading: "Ładowanie danych czujnika…",
      sensorNoData: "To urządzenie nie zgłasza żadnych danych z czujników (np. brak zainstalowanego licznika mocy/czujnika temperatury).",
      sensorLoadError: "Nie można załadować danych czujnika: {msg}",
      renameSensorPrompt: "Nowa nazwa wyświetlana dla tego czujnika (pozostaw puste, aby zresetować):",
      category_wifi: "Połączenie Wi-Fi",
      category_power: "Zużycie energii",
      category_diagnostics: "Diagnostyka",
      category_environment: "Środowisko",
      category_other: "Inne",
      sensor_rssi: "RSSI",
      sensor_signal: "Sygnał Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Czas pracy",
      sensor_uptime_sec: "Czas pracy (sekundy)",
      sensor_heap: "Wolna pamięć",
      sensor_power: "Moc",
      sensor_apparent_power: "Moc pozorna",
      sensor_reactive_power: "Moc bierna",
      sensor_power_factor: "Współczynnik mocy",
      sensor_voltage: "Napięcie",
      sensor_current: "Prąd",
      sensor_frequency: "Częstotliwość",
      sensor_energy_total: "Całkowita energia",
      sensor_energy_last_hour: "Energia w ostatniej godzinie",
      sensor_energy_yesterday: "Energia wczoraj",
      sensor_temperature: "Temperatura",
      sensor_humidity: "Wilgotność",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nigdy",
      releaseNotChecked: "Wydanie: jeszcze nie sprawdzono",
      releaseLabel: "Wydanie: {tag}",
      lastChecked: "Ostatnio sprawdzono: {date}",
      viewReleaseNotes: "Zobacz informacje o wydaniu",
      releasePublished: "Opublikowano: {date}",
      releaseNoNotes: "Brak dostępnych informacji o wydaniu.",
      viewOnGithub: "Zobacz na GitHub",
      githubRepoTitle: "Otwórz OpenBK7231T_App na GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Pamięć podręczna firmware",
      cacheCleanupNow: "Wyczyść teraz",
      cacheIntro: "Pobrany firmware OpenBeken i wygenerowane pliki UF2 (zobacz \"ESPHome ↔ OpenBeken\") są przechowywane na stałe i nigdy nie są usuwane samoczynnie. Tutaj możesz zobaczyć, co zajmuje miejsce, usunąć pojedyncze pliki i ustawić limit automatycznego czyszczenia - najstarsze pliki są zawsze usuwane jako pierwsze.",
      cacheColType: "Typ",
      cacheColLabel: "Etykieta",
      cacheColFile: "Plik",
      cacheColSize: "Rozmiar",
      cacheColDate: "Dodano",
      cacheLoading: "Ładowanie pamięci podręcznej…",
      cacheEmpty: "Pamięć podręczna jest pusta.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} plików, {size} łącznie.",
      cacheMaxSizeLabel: "Maksymalny rozmiar pamięci podręcznej (MB)",
      cacheAutoCleanupLabel: "Czyść automatycznie po przekroczeniu limitu",
      cacheSaveSettings: "Zapisz",
      cacheSettingsSaved: "Zapisano.",
      cacheConfirmDelete: "Usunąć ten plik z pamięci podręcznej?",
      cacheConfirmCleanup: "Usunąć najstarsze pliki z pamięci podręcznej, aż ustawiony rozmiar przestanie być przekraczany?",
      cacheCleanupNothing: "Pamięć podręczna już mieści się w ustawionym rozmiarze - nic nie usunięto.",
      cacheCleanupDone: "Usunięto {count} plików.",
      cacheAlertDeleteFailed: "Usuwanie nie powiodło się: {msg}",
      cacheAlertCleanupFailed: "Czyszczenie nie powiodło się: {msg}",
      cacheAlertSettingsFailed: "Zapisywanie nie powiodło się: {msg}",
      notifActive: "aktywny",
      notifInactive: "nieaktywny",
      notifSave: "Zapisz",
      notifTest: "Wyślij wiadomość testową",
      notifRemove: "Usuń",
      notifTestSending: "Wysyłanie wiadomości testowej…",
      notifTestSent: "Wiadomość testowa została wysłana.",
      notifTestFailed: "Niepowodzenie: {msg}",
      noChannelYet: "Nie skonfigurowano jeszcze żadnego kanału powiadomień.",
      saveChannel: "Zapisz kanał",
      notifHaLabel: "Cel powiadomień Home Assistant",
      notifHaHint: "Nazwa istniejącej usługi <code>notify.*</code>, np. \"mobile_app_phone\" lub \"persistent_notification\". Nic więcej nie trzeba konfigurować.",
      notifTelegramTokenLabel: "Token bota",
      notifTelegramTokenHint: "Od @BotFather w Telegramie: otwórz czat, wyślij \"/newbot\" i postępuj zgodnie z instrukcjami.",
      notifTelegramChatIdLabel: "ID czatu",
      notifTelegramChatIdHint: "Wyślij wiadomość do swojego bota, a następnie otwórz w przeglądarce https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} to Twoje ID czatu.",
      notifWhatsappPhoneLabel: "Numer telefonu",
      notifWhatsappPhoneHint: "Wraz z numerem kierunkowym kraju, np. 491511234567.",
      notifWhatsappApikeyLabel: "Klucz API (CallMeBot)",
      notifWhatsappApikeyHint: "Darmowy bot WhatsApp, nie wymaga konta biznesowego Meta: zapisz +34 644 84 71 04 jako kontakt, wyślij mu wiadomość WhatsApp \"I allow callmebot to send me messages\", a otrzymasz swój osobisty klucz API przez WhatsApp.",
      notifNameLabel: "Nazwa",
      notifNamePlaceholder: "np. telefon Aleksa",
      notifMessageLabel: "Wiadomość",
      notifMessageHint: "Symbole zastępcze: {version} = nowa wersja firmware, {devices} = urządzenia, których to dotyczy.",
      notifDefaultTemplate: "Dostępna jest wersja OpenBK7231T_App {version}. Urządzenia, których to dotyczy: {devices}.",
      notifActiveLabel: "Aktywny",
      notifKeepUnchanged: "•••• (pozostaw bez zmian, aby zachować)",
      notifApikeyPlaceholderExample: "np. 123456",
      backupsHeader: "Kopie zapasowe konfiguracji",
      backupsIntro: "Automatycznie zapisuje mapowanie pinów/kanałów GPIO oraz skrypt poleceń startowych urządzenia przed każdą aktualizacją, dzięki czemu możesz cofnąć aktualizację, która resetuje lub uszkadza jego konfigurację. Kopię zapasową możesz też utworzyć ręcznie dla dowolnego urządzenia poniżej.",
      backupColDevice: "Urządzenie",
      backupColTime: "Czas",
      backupColReason: "Powód",
      backupColVersion: "Firmware",
      backupReasonManual: "Ręcznie",
      backupReasonPreUpdate: "Przed aktualizacją",
      backupEmpty: "Brak kopii zapasowych.",
      backupNowTitle: "Utwórz kopię zapasową konfiguracji teraz",
      backupRestoreTitle: "Przywróć tę konfigurację",
      backupDownloadTitle: "Pobierz kopię zapasową",
      backupConfirmRestore: "Na pewno przywrócić tę konfigurację na urządzeniu? Bieżące ustawienia pinów/kanałów oraz polecenie startowe zostaną nadpisane.",
      backupAlertRestoreFailed: "Przywracanie nie powiodło się: {msg}",
      backupRestoredAlert: "Konfiguracja przywrócona.",
      backupConfirmDelete: "Na pewno usunąć tę kopię zapasową?",
      backupAlertDeleteFailed: "Usuwanie nie powiodło się: {msg}",
      backupAlertCreateFailed: "Tworzenie kopii zapasowej nie powiodło się: {msg}",
      sensor_reboot_count: "Restarty (szacunkowo)",
      sensor_last_seen: "Ostatnio widziano",
    },
    ro: {
      checkRelease: "Verifică actualizările",
      themeToggle: "Comută modul luminos/întunecat",
      updateAll: "Actualizează tot",
      devicesHeader: "Dispozitive",
      scanNetwork: "Scanează rețeaua",
      addDevice: "Adaugă dispozitiv",
      addIpPlaceholder: "Adresă IP (ex. 192.168.1.50)",
      addNamePlaceholder: "Nume (opțional)",
      addPasswordPlaceholder: "Parolă de administrator (dacă este setată)",
      add: "Adaugă",
      cancel: "Anulează",
      colName: "Nume",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Versiune",
      colStatus: "Stare",
      colActions: "Acțiuni",
      loadingDevices: "Se încarcă dispozitivele…",
      emptyDevices: "Nu a fost adăugat încă niciun dispozitiv. Scanează rețeaua sau adaugă unul manual.",
      scanResultsHeader: "Rezultatele scanării",
      close: "Închide",
      notificationsHeader: "Notificări",
      notificationsIntro: "Alege cum vrei să fii notificat când apare un nou firmware OpenBK7231T_App. Poți configura mai multe canale în același timp. Dacă niciun canal nu este activ, add-on-ul revine la o notificare obișnuită Home Assistant.",
      addChannel: "Adaugă canal",
      chooseChannelType: "Alege un tip de canal:",
      settingsHeader: "Setări",
      statusUpdating: "Se actualizează…",
      statusFailed: "Eșuat",
      statusTimeout: "Timp expirat",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Doar programare prin UART/SPI",
      unknownVersion: "necunoscută",
      newVersionPrefix: "nou: ",
      updateTitleUartOnly: "Acest chipset nu acceptă actualizarea prin rețea (doar programare prin UART/SPI).",
      updateTitleUpdating: "O actualizare este deja în curs.",
      updateTitleNoUpdateKnown: "Momentan nu se cunoaște nicio versiune mai nouă - poți totuși apăsa pentru a reprograma firmware-ul.",
      refreshTitle: "Reinterogare dispozitiv",
      updateBtnLabel: "Actualizare firmware",
      deleteTitle: "Elimină dispozitivul",
      openDeviceTitle: "Deschide dispozitivul în browser",
      confirmUpdateAll: "Actualizezi acum toate dispozitivele pentru care este disponibilă o actualizare?",
      confirmUpdateDevice: "Pornești acum actualizarea firmware-ului? Dispozitivul se va reporni după aceea.",
      confirmUpdateDeviceNoUpdate: "Momentan nu se cunoaște nicio versiune mai nouă. Reprogramezi totuși firmware-ul?",
      confirmDelete: "Elimini acest dispozitiv din listă?",
      confirmDeleteChannel: "Elimini acest canal de notificare?",
      alertDeviceOffline: "Dispozitivul \"{name}\" nu răspunde (este offline sau are o parolă greșită).",
      alertActionFailed: "Acțiunea a eșuat: {msg}",
      alertRenameFailed: "Redenumirea a eșuat: {msg}",
      alertCheckFailed: "Verificarea a eșuat: {msg}",
      alertUpdateAllFailed: "Actualizarea a eșuat: {msg}",
      alertNoUpdatesFound: "Nu s-a găsit niciun dispozitiv cu o actualizare disponibilă.",
      alertUpdatesStarted: "{count} actualizare(i) pornite.\n{skippedCount} omise:\n{details}",
      alertUpdateFailedDetail: "Actualizarea a eșuat:\n\n{detail}",
      alertUpdateFailedGeneric: "Actualizarea a eșuat sau a expirat timpul de așteptare. Nu sunt disponibile mai multe detalii.",
      alertAddFailed: "Adăugarea a eșuat: {msg}",
      alertScanFailed: "Scanarea a eșuat: {msg}",
      alertSaveFailed: "Salvarea a eșuat: {msg}",
      alertDeleteChannelFailed: "Eliminarea a eșuat: {msg}",
      alertCreateChannelFailed: "Crearea a eșuat: {msg}",
      alertSensorLabelSaveFailed: "Redenumirea senzorului a eșuat: {msg}",
      bannerUpdateText: "Este disponibil firmware nou pentru {count} dispozitiv(e).",
      scanningStatus: "Se scanează rețeaua… acest lucru poate dura până la 20 de secunde.",
      scanResultStatus: "Subrețea: {subnet} – {count} dispozitiv(e) găsit(e).",
      subnetUnknown: "necunoscută",
      alreadyAdded: "deja adăugat",
      addBtn: "Adaugă",
      noDevicesFoundScan: "Nu a fost găsit niciun dispozitiv.",
      settingsScanSubnet: "Subrețea de scanat",
      settingsAuto: "automat",
      settingsPollInterval: "Interval de interogare",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Interval de verificare a versiunilor",
      settingsHoursUnit: "h",
      settingsNotifications: "Notificări",
      settingsEnabled: "activat",
      settingsDisabled: "dezactivat",
      settingsFirmwarePort: "Portul serverului de firmware",
      sensorLoading: "Se încarcă datele senzorului…",
      sensorNoData: "Acest dispozitiv nu raportează date de la senzori (de ex. nu are instalat un contor de putere/senzor de temperatură).",
      sensorLoadError: "Datele senzorului nu au putut fi încărcate: {msg}",
      renameSensorPrompt: "Noul nume afișat pentru acest senzor (lasă gol pentru a reseta):",
      category_wifi: "Conexiune Wi-Fi",
      category_power: "Consum de energie",
      category_diagnostics: "Diagnosticare",
      category_environment: "Mediu",
      category_other: "Altele",
      sensor_rssi: "RSSI",
      sensor_signal: "Semnal Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Timp de funcționare",
      sensor_uptime_sec: "Timp de funcționare (secunde)",
      sensor_heap: "Memorie liberă",
      sensor_power: "Putere",
      sensor_apparent_power: "Putere aparentă",
      sensor_reactive_power: "Putere reactivă",
      sensor_power_factor: "Factor de putere",
      sensor_voltage: "Tensiune",
      sensor_current: "Curent",
      sensor_frequency: "Frecvență",
      sensor_energy_total: "Energie totală",
      sensor_energy_last_hour: "Energie în ultima oră",
      sensor_energy_yesterday: "Energie ieri",
      sensor_temperature: "Temperatură",
      sensor_humidity: "Umiditate",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "niciodată",
      releaseNotChecked: "Versiune: neverificată încă",
      releaseLabel: "Versiune: {tag}",
      lastChecked: "Ultima verificare: {date}",
      viewReleaseNotes: "Vezi notele de lansare",
      releasePublished: "Publicată: {date}",
      releaseNoNotes: "Nu sunt disponibile note de lansare.",
      viewOnGithub: "Vezi pe GitHub",
      githubRepoTitle: "Deschide OpenBK7231T_App pe GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Cache de firmware",
      cacheCleanupNow: "Curăță acum",
      cacheIntro: "Firmware-urile OpenBeken descărcate și fișierele UF2 generate (vezi \"ESPHome ↔ OpenBeken\") sunt stocate permanent și nu sunt niciodată șterse automat. Aici poți vedea ce ocupă spațiu, poți elimina fișiere individuale și poți seta o limită de curățare automată - fișierele cele mai vechi sunt întotdeauna șterse primele.",
      cacheColType: "Tip",
      cacheColLabel: "Etichetă",
      cacheColFile: "Fișier",
      cacheColSize: "Dimensiune",
      cacheColDate: "Adăugat",
      cacheLoading: "Se încarcă memoria cache…",
      cacheEmpty: "Memoria cache este goală.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} fișier(e), {size} în total.",
      cacheMaxSizeLabel: "Dimensiunea maximă a memoriei cache (MB)",
      cacheAutoCleanupLabel: "Curăță automat la depășire",
      cacheSaveSettings: "Salvează",
      cacheSettingsSaved: "Salvat.",
      cacheConfirmDelete: "Ștergi acest fișier din memoria cache?",
      cacheConfirmCleanup: "Ștergi cele mai vechi fișiere din cache până când dimensiunea configurată nu mai este depășită?",
      cacheCleanupNothing: "Memoria cache se încadrează deja în dimensiunea configurată - nu s-a șters nimic.",
      cacheCleanupDone: "{count} fișier(e) șterse.",
      cacheAlertDeleteFailed: "Ștergerea a eșuat: {msg}",
      cacheAlertCleanupFailed: "Curățarea a eșuat: {msg}",
      cacheAlertSettingsFailed: "Salvarea a eșuat: {msg}",
      notifActive: "activ",
      notifInactive: "inactiv",
      notifSave: "Salvează",
      notifTest: "Trimite mesaj de test",
      notifRemove: "Elimină",
      notifTestSending: "Se trimite mesajul de test…",
      notifTestSent: "Mesajul de test a fost trimis.",
      notifTestFailed: "Eșuat: {msg}",
      noChannelYet: "Niciun canal de notificare configurat încă.",
      saveChannel: "Salvează canalul",
      notifHaLabel: "Țintă de notificare Home Assistant",
      notifHaHint: "Numele unui serviciu <code>notify.*</code> existent, de ex. \"mobile_app_phone\" sau \"persistent_notification\". Nu mai trebuie configurat nimic altceva.",
      notifTelegramTokenLabel: "Token de bot",
      notifTelegramTokenHint: "Îl obții de la @BotFather în Telegram: deschide o conversație, trimite \"/newbot\" și urmează instrucțiunile.",
      notifTelegramChatIdLabel: "ID conversație",
      notifTelegramChatIdHint: "Trimite botului tău un mesaj, apoi deschide în browser https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} este ID-ul conversației tale.",
      notifWhatsappPhoneLabel: "Număr de telefon",
      notifWhatsappPhoneHint: "Inclusiv prefixul țării, de ex. 491511234567.",
      notifWhatsappApikeyLabel: "Cheie API (CallMeBot)",
      notifWhatsappApikeyHint: "Bot WhatsApp gratuit, nu necesită cont business Meta: salvează +34 644 84 71 04 ca și contact, trimite-i mesajul WhatsApp \"I allow callmebot to send me messages\", iar cheia ta API personală îți va fi trimisă înapoi prin WhatsApp.",
      notifNameLabel: "Nume",
      notifNamePlaceholder: "ex. telefonul lui Alex",
      notifMessageLabel: "Mesaj",
      notifMessageHint: "Substituenți: {version} = noua versiune de firmware, {devices} = dispozitivele afectate.",
      notifDefaultTemplate: "OpenBK7231T_App {version} este disponibil. Dispozitive afectate: {devices}.",
      notifActiveLabel: "Activ",
      notifKeepUnchanged: "•••• (lasă neschimbat pentru a-l păstra)",
      notifApikeyPlaceholderExample: "ex. 123456",
      backupsHeader: "Copii de siguranță ale configurației",
      backupsIntro: "Salvează automat maparea pinilor/canalelor GPIO și scriptul de comenzi de pornire ale unui dispozitiv înainte de fiecare actualizare, astfel încât să poți anula o actualizare care resetează sau corupe configurația acestuia. Poți crea o copie de siguranță și manual pentru orice dispozitiv de mai jos.",
      backupColDevice: "Dispozitiv",
      backupColTime: "Data și ora",
      backupColReason: "Motiv",
      backupColVersion: "Firmware",
      backupReasonManual: "Manual",
      backupReasonPreUpdate: "Înainte de actualizare",
      backupEmpty: "Încă nu există copii de siguranță.",
      backupNowTitle: "Creează copie de siguranță a configurației acum",
      backupRestoreTitle: "Restaurează această configurație",
      backupDownloadTitle: "Descarcă copia de siguranță",
      backupConfirmRestore: "Chiar restaurezi această configurație pe dispozitiv? Setările curente ale pinilor/canalelor și comanda de pornire vor fi suprascrise.",
      backupAlertRestoreFailed: "Restaurarea a eșuat: {msg}",
      backupRestoredAlert: "Configurație restaurată.",
      backupConfirmDelete: "Chiar ștergi această copie de siguranță?",
      backupAlertDeleteFailed: "Ștergerea a eșuat: {msg}",
      backupAlertCreateFailed: "Crearea copiei de siguranță a eșuat: {msg}",
      sensor_reboot_count: "Reporniri (estimat)",
      sensor_last_seen: "Ultima dată văzut",
    },
    sk: {
      checkRelease: "Skontrolovať aktualizácie",
      themeToggle: "Prepnúť svetlý/tmavý režim",
      updateAll: "Aktualizovať všetko",
      devicesHeader: "Zariadenia",
      scanNetwork: "Skenovať sieť",
      addDevice: "Pridať zariadenie",
      addIpPlaceholder: "IP adresa (napr. 192.168.1.50)",
      addNamePlaceholder: "Názov (voliteľné)",
      addPasswordPlaceholder: "Heslo správcu (ak je nastavené)",
      add: "Pridať",
      cancel: "Zrušiť",
      colName: "Názov",
      colIp: "IP",
      colChipset: "Čipset",
      colVersion: "Verzia",
      colStatus: "Stav",
      colActions: "Akcie",
      loadingDevices: "Načítavajú sa zariadenia…",
      emptyDevices: "Zatiaľ neboli pridané žiadne zariadenia. Naskenujte sieť alebo pridajte zariadenie ručne.",
      scanResultsHeader: "Výsledky skenovania",
      close: "Zavrieť",
      notificationsHeader: "Upozornenia",
      notificationsIntro: "Vyberte, ako chcete byť upozornení na vydanie nového firmvéru OpenBK7231T_App. Môžete nastaviť viacero kanálov naraz. Ak nie je aktívny žiadny kanál, doplnok použije bežné upozornenie Home Assistant.",
      addChannel: "Pridať kanál",
      chooseChannelType: "Vyberte typ kanála:",
      settingsHeader: "Nastavenia",
      statusUpdating: "Aktualizuje sa…",
      statusFailed: "Zlyhalo",
      statusTimeout: "Vypršal časový limit",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Iba nahrávanie cez UART/SPI",
      unknownVersion: "neznáma",
      newVersionPrefix: "nová: ",
      updateTitleUartOnly: "Tento čipset nepodporuje aktualizáciu cez sieť (iba nahrávanie cez UART/SPI).",
      updateTitleUpdating: "Aktualizácia už prebieha.",
      updateTitleNoUpdateKnown: "Momentálne nie je známa žiadna novšia verzia - napriek tomu môžete kliknúť a nahrať firmvér znova.",
      refreshTitle: "Znova načítať zariadenie",
      updateBtnLabel: "Aktualizácia firmvéru",
      deleteTitle: "Odstrániť zariadenie",
      openDeviceTitle: "Otvoriť zariadenie v prehliadači",
      confirmUpdateAll: "Aktualizovať teraz všetky zariadenia, pre ktoré je k dispozícii aktualizácia?",
      confirmUpdateDevice: "Spustiť teraz aktualizáciu firmvéru? Zariadenie sa potom reštartuje.",
      confirmUpdateDeviceNoUpdate: "Momentálne nie je známa žiadna novšia verzia. Napriek tomu znova nahrať firmvér?",
      confirmDelete: "Odstrániť toto zariadenie zo zoznamu?",
      confirmDeleteChannel: "Odstrániť tento oznamovací kanál?",
      alertDeviceOffline: "Zariadenie \"{name}\" neodpovedá (je offline alebo je nesprávne heslo).",
      alertActionFailed: "Akcia zlyhala: {msg}",
      alertRenameFailed: "Premenovanie zlyhalo: {msg}",
      alertCheckFailed: "Kontrola zlyhala: {msg}",
      alertUpdateAllFailed: "Aktualizácia zlyhala: {msg}",
      alertNoUpdatesFound: "Nenašli sa žiadne zariadenia s dostupnou aktualizáciou.",
      alertUpdatesStarted: "Spustených aktualizácií: {count}.\nPreskočených: {skippedCount}:\n{details}",
      alertUpdateFailedDetail: "Aktualizácia zlyhala:\n\n{detail}",
      alertUpdateFailedGeneric: "Aktualizácia zlyhala alebo vypršal časový limit. Ďalšie podrobnosti nie sú k dispozícii.",
      alertAddFailed: "Pridanie zlyhalo: {msg}",
      alertScanFailed: "Skenovanie zlyhalo: {msg}",
      alertSaveFailed: "Uloženie zlyhalo: {msg}",
      alertDeleteChannelFailed: "Odstránenie zlyhalo: {msg}",
      alertCreateChannelFailed: "Vytvorenie zlyhalo: {msg}",
      alertSensorLabelSaveFailed: "Premenovanie senzora zlyhalo: {msg}",
      bannerUpdateText: "Nový firmvér je k dispozícii pre {count} zariadení.",
      scanningStatus: "Skenovanie siete… môže to trvať až 20 sekúnd.",
      scanResultStatus: "Podsieť: {subnet} – nájdených zariadení: {count}.",
      subnetUnknown: "neznáma",
      alreadyAdded: "už pridané",
      addBtn: "Pridať",
      noDevicesFoundScan: "Nenašli sa žiadne zariadenia.",
      settingsScanSubnet: "Skenovaná podsieť",
      settingsAuto: "automaticky",
      settingsPollInterval: "Interval dopytovania",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Interval kontroly vydaní",
      settingsHoursUnit: "h",
      settingsNotifications: "Upozornenia",
      settingsEnabled: "zapnuté",
      settingsDisabled: "vypnuté",
      settingsFirmwarePort: "Port servera s firmvérom",
      sensorLoading: "Načítavajú sa dáta zo senzorov…",
      sensorNoData: "Toto zariadenie nehlási žiadne dáta zo senzorov (napr. nie je nainštalovaný merač spotreby/teplotný senzor).",
      sensorLoadError: "Dáta zo senzorov sa nepodarilo načítať: {msg}",
      renameSensorPrompt: "Nový zobrazovaný názov tohto senzora (nechajte prázdne na obnovenie):",
      category_wifi: "Pripojenie Wi-Fi",
      category_power: "Spotreba energie",
      category_diagnostics: "Diagnostika",
      category_environment: "Prostredie",
      category_other: "Ostatné",
      sensor_rssi: "RSSI",
      sensor_signal: "Sila signálu Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Doba prevádzky",
      sensor_uptime_sec: "Doba prevádzky (v sekundách)",
      sensor_heap: "Voľná pamäť",
      sensor_power: "Výkon",
      sensor_apparent_power: "Zdanlivý výkon",
      sensor_reactive_power: "Jalový výkon",
      sensor_power_factor: "Účinník",
      sensor_voltage: "Napätie",
      sensor_current: "Prúd",
      sensor_frequency: "Frekvencia",
      sensor_energy_total: "Celková energia",
      sensor_energy_last_hour: "Energia za poslednú hodinu",
      sensor_energy_yesterday: "Energia za včerajšok",
      sensor_temperature: "Teplota",
      sensor_humidity: "Vlhkosť",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nikdy",
      releaseNotChecked: "Verzia: zatiaľ neskontrolované",
      releaseLabel: "Verzia: {tag}",
      lastChecked: "Naposledy skontrolované: {date}",
      viewReleaseNotes: "Zobraziť poznámky k vydaniu",
      releasePublished: "Vydané: {date}",
      releaseNoNotes: "Nie sú k dispozícii žiadne poznámky k vydaniu.",
      viewOnGithub: "Zobraziť na GitHube",
      githubRepoTitle: "Otvoriť OpenBK7231T_App na GitHube",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Vyrovnávacia pamäť firmvéru",
      cacheCleanupNow: "Vyčistiť teraz",
      cacheIntro: "Stiahnutý firmvér OpenBeken a vygenerované súbory UF2 (pozri \"ESPHome ↔ OpenBeken\") sa ukladajú natrvalo a samy od seba sa nikdy nemažú. Tu vidíte, čo zaberá miesto, môžete odstrániť jednotlivé súbory a nastaviť limit pre automatické čistenie - najstaršie súbory sa vždy mažú ako prvé.",
      cacheColType: "Typ",
      cacheColLabel: "Popis",
      cacheColFile: "Súbor",
      cacheColSize: "Veľkosť",
      cacheColDate: "Pridané",
      cacheLoading: "Načítava sa vyrovnávacia pamäť…",
      cacheEmpty: "Vyrovnávacia pamäť je prázdna.",
      cacheKindFirmware: "Firmvér",
      cacheKindUf2: "UF2",
      cacheTotal: "Počet súborov: {count}, spolu {size}.",
      cacheMaxSizeLabel: "Maximálna veľkosť vyrovnávacej pamäte (MB)",
      cacheAutoCleanupLabel: "Po prekročení automaticky vyčistiť",
      cacheSaveSettings: "Uložiť",
      cacheSettingsSaved: "Uložené.",
      cacheConfirmDelete: "Odstrániť tento súbor z vyrovnávacej pamäte?",
      cacheConfirmCleanup: "Odstrániť najstaršie súbory vo vyrovnávacej pamäti, kým nebude dodržaná nastavená veľkosť?",
      cacheCleanupNothing: "Vyrovnávacia pamäť je už v rámci nastavenej veľkosti - nič sa neodstránilo.",
      cacheCleanupDone: "Odstránených súborov: {count}.",
      cacheAlertDeleteFailed: "Odstránenie zlyhalo: {msg}",
      cacheAlertCleanupFailed: "Čistenie zlyhalo: {msg}",
      cacheAlertSettingsFailed: "Uloženie zlyhalo: {msg}",
      notifActive: "aktívny",
      notifInactive: "neaktívny",
      notifSave: "Uložiť",
      notifTest: "Odoslať testovaciu správu",
      notifRemove: "Odstrániť",
      notifTestSending: "Odosiela sa testovacia správa…",
      notifTestSent: "Testovacia správa bola odoslaná.",
      notifTestFailed: "Zlyhalo: {msg}",
      noChannelYet: "Zatiaľ nie je nastavený žiadny oznamovací kanál.",
      saveChannel: "Uložiť kanál",
      notifHaLabel: "Cieľ upozornenia Home Assistant",
      notifHaHint: "Názov existujúcej služby <code>notify.*</code>, napr. \"mobile_app_phone\" alebo \"persistent_notification\". Nič iné netreba nastavovať.",
      notifTelegramTokenLabel: "Token bota",
      notifTelegramTokenHint: "Získate ho od @BotFather v Telegrame: otvorte chat, odošlite \"/newbot\" a postupujte podľa pokynov.",
      notifTelegramChatIdLabel: "ID chatu",
      notifTelegramChatIdHint: "Pošlite svojmu botovi správu a potom v prehliadači otvorte https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} je vaše ID chatu.",
      notifWhatsappPhoneLabel: "Telefónne číslo",
      notifWhatsappPhoneHint: "Vrátane predvoľby krajiny, napr. 491511234567.",
      notifWhatsappApikeyLabel: "API kľúč (CallMeBot)",
      notifWhatsappApikeyHint: "Bezplatný WhatsApp bot, netreba firemný účet Meta: uložte si +34 644 84 71 04 ako kontakt, pošlite mu WhatsApp správu \"I allow callmebot to send me messages\" a svoj osobný API kľúč dostanete späť cez WhatsApp.",
      notifNameLabel: "Názov",
      notifNamePlaceholder: "napr. Petrov telefón",
      notifMessageLabel: "Správa",
      notifMessageHint: "Zástupné symboly: {version} = nová verzia firmvéru, {devices} = dotknuté zariadenia.",
      notifDefaultTemplate: "K dispozícii je OpenBK7231T_App {version}. Dotknuté zariadenia: {devices}.",
      notifActiveLabel: "Aktívny",
      notifKeepUnchanged: "•••• (nechajte bez zmeny, ak ho chcete zachovať)",
      notifApikeyPlaceholderExample: "napr. 123456",
      backupsHeader: "Zálohy konfigurácie",
      backupsIntro: "Pred každou aktualizáciou automaticky uloží mapovanie GPIO pinov/kanálov a skript spúšťacích príkazov zariadenia, aby ste mohli vrátiť späť aktualizáciu, ktorá resetuje alebo poškodí jeho konfiguráciu. Zálohu môžete kedykoľvek spustiť aj ručne pre ľubovoľné zariadenie nižšie.",
      backupColDevice: "Zariadenie",
      backupColTime: "Čas",
      backupColReason: "Dôvod",
      backupColVersion: "Firmvér",
      backupReasonManual: "Ručne",
      backupReasonPreUpdate: "Pred aktualizáciou",
      backupEmpty: "Zatiaľ žiadne zálohy.",
      backupNowTitle: "Zálohovať konfiguráciu teraz",
      backupRestoreTitle: "Obnoviť túto konfiguráciu",
      backupDownloadTitle: "Stiahnuť zálohu",
      backupConfirmRestore: "Naozaj obnoviť túto konfiguráciu na zariadení? Aktuálne nastavenia pinov/kanálov a spúšťací príkaz budú prepísané.",
      backupAlertRestoreFailed: "Obnovenie zlyhalo: {msg}",
      backupRestoredAlert: "Konfigurácia bola obnovená.",
      backupConfirmDelete: "Naozaj odstrániť túto zálohu?",
      backupAlertDeleteFailed: "Odstránenie zlyhalo: {msg}",
      backupAlertCreateFailed: "Zálohovanie zlyhalo: {msg}",
      sensor_reboot_count: "Reštarty (odhad)",
      sensor_last_seen: "Naposledy videný",
    },
    sl: {
      checkRelease: "Preveri posodobitve",
      themeToggle: "Preklop svetlega/temnega načina",
      updateAll: "Posodobi vse",
      devicesHeader: "Naprave",
      scanNetwork: "Preišči omrežje",
      addDevice: "Dodaj napravo",
      addIpPlaceholder: "Naslov IP (npr. 192.168.1.50)",
      addNamePlaceholder: "Ime (neobvezno)",
      addPasswordPlaceholder: "Skrbniško geslo (če je nastavljeno)",
      add: "Dodaj",
      cancel: "Prekliči",
      colName: "Ime",
      colIp: "IP",
      colChipset: "Čipset",
      colVersion: "Različica",
      colStatus: "Stanje",
      colActions: "Dejanja",
      loadingDevices: "Nalaganje naprav…",
      emptyDevices: "Še ni dodanih naprav. Preiščite omrežje ali dodajte napravo ročno.",
      scanResultsHeader: "Rezultati iskanja",
      close: "Zapri",
      notificationsHeader: "Obvestila",
      notificationsIntro: "Izberite, kako želite biti obveščeni, ko izide nova različica strojne programske opreme OpenBK7231T_App. Hkrati lahko nastavite več kanalov. Če noben kanal ni aktiven, dodatek uporabi običajno obvestilo Home Assistant.",
      addChannel: "Dodaj kanal",
      chooseChannelType: "Izberite vrsto kanala:",
      settingsHeader: "Nastavitve",
      statusUpdating: "Posodabljanje…",
      statusFailed: "Neuspešno",
      statusTimeout: "Časovna omejitev potekla",
      statusOffline: "Brez povezave",
      statusOnline: "Povezano",
      uartOnlyHint: "Samo flashanje prek UART/SPI",
      unknownVersion: "neznana",
      newVersionPrefix: "nova: ",
      updateTitleUartOnly: "Ta čipset ne podpira posodobitve prek omrežja (samo flashanje prek UART/SPI).",
      updateTitleUpdating: "Posodobitev že poteka.",
      updateTitleNoUpdateKnown: "Trenutno ni znana novejša različica - kljub temu kliknite za ponovno flashanje firmwara.",
      refreshTitle: "Ponovno poizvedi napravo",
      updateBtnLabel: "Posodobitev firmwara",
      deleteTitle: "Odstrani napravo",
      openDeviceTitle: "Odpri napravo v brskalniku",
      confirmUpdateAll: "Ali želite zdaj posodobiti vse naprave, za katere je na voljo posodobitev?",
      confirmUpdateDevice: "Ali želite zdaj zagnati posodobitev firmwara? Naprava se bo nato znova zagnala.",
      confirmUpdateDeviceNoUpdate: "Trenutno ni znana novejša različica. Ali kljub temu ponovno flashati firmware?",
      confirmDelete: "Ali želite odstraniti to napravo s seznama?",
      confirmDeleteChannel: "Ali želite odstraniti ta kanal za obvestila?",
      alertDeviceOffline: "Naprava \"{name}\" se ne odziva (brez povezave ali napačno geslo).",
      alertActionFailed: "Dejanje ni uspelo: {msg}",
      alertRenameFailed: "Preimenovanje ni uspelo: {msg}",
      alertCheckFailed: "Preverjanje ni uspelo: {msg}",
      alertUpdateAllFailed: "Posodobitev ni uspela: {msg}",
      alertNoUpdatesFound: "Ni bilo najdenih naprav z razpoložljivo posodobitvijo.",
      alertUpdatesStarted: "Zagnanih {count} posodobitev.\n{skippedCount} preskočenih:\n{details}",
      alertUpdateFailedDetail: "Posodobitev ni uspela:\n\n{detail}",
      alertUpdateFailedGeneric: "Posodobitev ni uspela ali je potekla časovna omejitev. Dodatne podrobnosti niso na voljo.",
      alertAddFailed: "Dodajanje ni uspelo: {msg}",
      alertScanFailed: "Iskanje ni uspelo: {msg}",
      alertSaveFailed: "Shranjevanje ni uspelo: {msg}",
      alertDeleteChannelFailed: "Odstranjevanje ni uspelo: {msg}",
      alertCreateChannelFailed: "Ustvarjanje ni uspelo: {msg}",
      alertSensorLabelSaveFailed: "Preimenovanje senzorja ni uspelo: {msg}",
      bannerUpdateText: "Na voljo je nov firmware za {count} naprav(o).",
      scanningStatus: "Preiskovanje omrežja… to lahko traja do 20 sekund.",
      scanResultStatus: "Podomrežje: {subnet} – najdenih {count} naprav.",
      subnetUnknown: "neznano",
      alreadyAdded: "že dodano",
      addBtn: "Dodaj",
      noDevicesFoundScan: "Ni bilo najdenih naprav.",
      settingsScanSubnet: "Podomrežje za iskanje",
      settingsAuto: "samodejno",
      settingsPollInterval: "Interval poizvedovanja",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Interval preverjanja izdaj",
      settingsHoursUnit: "h",
      settingsNotifications: "Obvestila",
      settingsEnabled: "omogočeno",
      settingsDisabled: "onemogočeno",
      settingsFirmwarePort: "Vrata strežnika za firmware",
      sensorLoading: "Nalaganje podatkov senzorja…",
      sensorNoData: "Ta naprava ne poroča o nobenih podatkih senzorjev (npr. nima nameščenega merilnika moči/temperaturnega senzorja).",
      sensorLoadError: "Podatkov senzorja ni bilo mogoče naložiti: {msg}",
      renameSensorPrompt: "Novo prikazano ime za ta senzor (pustite prazno za ponastavitev):",
      category_wifi: "Povezava Wi-Fi",
      category_power: "Poraba energije",
      category_diagnostics: "Diagnostika",
      category_environment: "Okolje",
      category_other: "Drugo",
      sensor_rssi: "RSSI",
      sensor_signal: "Signal Wi-Fi",
      sensor_ssid: "SSID",
      sensor_uptime: "Čas delovanja",
      sensor_uptime_sec: "Čas delovanja (sekunde)",
      sensor_heap: "Prosti pomnilnik",
      sensor_power: "Moč",
      sensor_apparent_power: "Navidezna moč",
      sensor_reactive_power: "Jalova moč",
      sensor_power_factor: "Faktor moči",
      sensor_voltage: "Napetost",
      sensor_current: "Tok",
      sensor_frequency: "Frekvenca",
      sensor_energy_total: "Skupna energija",
      sensor_energy_last_hour: "Energija v zadnji uri",
      sensor_energy_yesterday: "Energija včeraj",
      sensor_temperature: "Temperatura",
      sensor_humidity: "Vlažnost",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "nikoli",
      releaseNotChecked: "Izdaja: še ni preverjeno",
      releaseLabel: "Izdaja: {tag}",
      lastChecked: "Nazadnje preverjeno: {date}",
      viewReleaseNotes: "Ogled opomb ob izdaji",
      releasePublished: "Objavljeno: {date}",
      releaseNoNotes: "Opombe ob izdaji niso na voljo.",
      viewOnGithub: "Ogled na GitHubu",
      githubRepoTitle: "Odpri OpenBK7231T_App na GitHubu",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Predpomnilnik firmwara",
      cacheCleanupNow: "Počisti zdaj",
      cacheIntro: "Preneseni firmware OpenBeken in ustvarjene datoteke UF2 (glejte \"ESPHome ↔ OpenBeken\") so shranjeni trajno in se nikoli ne izbrišejo sami od sebe. Tukaj lahko vidite, kaj zaseda prostor, odstranite posamezne datoteke in nastavite mejo za samodejno čiščenje - najstarejše datoteke se vedno izbrišejo prve.",
      cacheColType: "Vrsta",
      cacheColLabel: "Oznaka",
      cacheColFile: "Datoteka",
      cacheColSize: "Velikost",
      cacheColDate: "Dodano",
      cacheLoading: "Nalaganje predpomnilnika…",
      cacheEmpty: "Predpomnilnik je prazen.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} datotek, skupaj {size}.",
      cacheMaxSizeLabel: "Največja velikost predpomnilnika (MB)",
      cacheAutoCleanupLabel: "Samodejno počisti ob preseganju",
      cacheSaveSettings: "Shrani",
      cacheSettingsSaved: "Shranjeno.",
      cacheConfirmDelete: "Ali želite izbrisati to datoteko iz predpomnilnika?",
      cacheConfirmCleanup: "Ali želite izbrisati najstarejše predpomnjene datoteke, dokler nastavljena velikost ne bo več presežena?",
      cacheCleanupNothing: "Predpomnilnik je že znotraj nastavljene velikosti - nič ni bilo izbrisano.",
      cacheCleanupDone: "Izbrisanih {count} datotek.",
      cacheAlertDeleteFailed: "Brisanje ni uspelo: {msg}",
      cacheAlertCleanupFailed: "Čiščenje ni uspelo: {msg}",
      cacheAlertSettingsFailed: "Shranjevanje ni uspelo: {msg}",
      notifActive: "aktiven",
      notifInactive: "neaktiven",
      notifSave: "Shrani",
      notifTest: "Pošlji testno sporočilo",
      notifRemove: "Odstrani",
      notifTestSending: "Pošiljanje testnega sporočila…",
      notifTestSent: "Testno sporočilo je bilo poslano.",
      notifTestFailed: "Neuspešno: {msg}",
      noChannelYet: "Kanal za obvestila še ni nastavljen.",
      saveChannel: "Shrani kanal",
      notifHaLabel: "Cilj obveščanja Home Assistant",
      notifHaHint: "Ime obstoječe storitve <code>notify.*</code>, npr. \"mobile_app_phone\" ali \"persistent_notification\". Ni treba nastaviti ničesar drugega.",
      notifTelegramTokenLabel: "Token bota",
      notifTelegramTokenHint: "Od @BotFather v Telegramu: odprite pogovor, pošljite \"/newbot\" in sledite navodilom.",
      notifTelegramChatIdLabel: "ID pogovora",
      notifTelegramChatIdHint: "Pošljite svojemu botu sporočilo, nato v brskalniku odprite https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates - \"chat\":{\"id\": ...} je vaš chat ID.",
      notifWhatsappPhoneLabel: "Telefonska številka",
      notifWhatsappPhoneHint: "Vključno s klicno kodo države, npr. 491511234567.",
      notifWhatsappApikeyLabel: "Ključ API (CallMeBot)",
      notifWhatsappApikeyHint: "Brezplačen WhatsApp bot, brez potrebe po poslovnem računu Meta: shranite +34 644 84 71 04 kot stik, mu pošljite sporočilo WhatsApp \"I allow callmebot to send me messages\" in prek WhatsAppa boste prejeli svoj osebni ključ API.",
      notifNameLabel: "Ime",
      notifNamePlaceholder: "npr. Alexov telefon",
      notifMessageLabel: "Sporočilo",
      notifMessageHint: "Spremenljivke: {version} = nova različica firmwara, {devices} = prizadete naprave.",
      notifDefaultTemplate: "OpenBK7231T_App {version} je na voljo. Prizadete naprave: {devices}.",
      notifActiveLabel: "Aktivno",
      notifKeepUnchanged: "•••• (pustite nespremenjeno, da ga obdržite)",
      notifApikeyPlaceholderExample: "npr. 123456",
      backupsHeader: "Varnostne kopije konfiguracije",
      backupsIntro: "Pred vsako posodobitvijo samodejno shrani preslikavo GPIO nožic/kanalov in skript zagonskih ukazov naprave, da lahko razveljaviš posodobitev, ki ponastavi ali poškoduje njeno konfiguracijo. Varnostno kopijo lahko spodaj kadar koli ustvariš tudi ročno za katero koli napravo.",
      backupColDevice: "Naprava",
      backupColTime: "Čas",
      backupColReason: "Razlog",
      backupColVersion: "Vdelana programska oprema",
      backupReasonManual: "Ročno",
      backupReasonPreUpdate: "Pred posodobitvijo",
      backupEmpty: "Še ni varnostnih kopij.",
      backupNowTitle: "Ustvari varnostno kopijo konfiguracije zdaj",
      backupRestoreTitle: "Obnovi to konfiguracijo",
      backupDownloadTitle: "Prenesi varnostno kopijo",
      backupConfirmRestore: "Ali res želite obnoviti to konfiguracijo na napravi? Trenutne nastavitve nožic/kanalov in zagonski ukaz bodo prepisani.",
      backupAlertRestoreFailed: "Obnovitev ni uspela: {msg}",
      backupRestoredAlert: "Konfiguracija je bila obnovljena.",
      backupConfirmDelete: "Ali res želite izbrisati to varnostno kopijo?",
      backupAlertDeleteFailed: "Brisanje ni uspelo: {msg}",
      backupAlertCreateFailed: "Ustvarjanje varnostne kopije ni uspelo: {msg}",
      sensor_reboot_count: "Ponovni zagoni (ocenjeno)",
      sensor_last_seen: "Nazadnje viden",
    },
    sv: {
      checkRelease: "Sök efter uppdateringar",
      themeToggle: "Växla ljust/mörkt läge",
      updateAll: "Uppdatera alla",
      devicesHeader: "Enheter",
      scanNetwork: "Skanna nätverk",
      addDevice: "Lägg till enhet",
      addIpPlaceholder: "IP-adress (t.ex. 192.168.1.50)",
      addNamePlaceholder: "Namn (valfritt)",
      addPasswordPlaceholder: "Administratörslösenord (om inställt)",
      add: "Lägg till",
      cancel: "Avbryt",
      colName: "Namn",
      colIp: "IP",
      colChipset: "Chipset",
      colVersion: "Version",
      colStatus: "Status",
      colActions: "Åtgärder",
      loadingDevices: "Laddar enheter…",
      emptyDevices: "Inga enheter tillagda än. Skanna nätverket eller lägg till en manuellt.",
      scanResultsHeader: "Skanningsresultat",
      close: "Stäng",
      notificationsHeader: "Aviseringar",
      notificationsIntro: "Välj hur du vill bli meddelad när en ny OpenBK7231T_App-firmware släpps. Du kan ställa in flera kanaler samtidigt. Om ingen kanal är aktiv används en vanlig Home Assistant-avisering istället.",
      addChannel: "Lägg till kanal",
      chooseChannelType: "Välj en kanaltyp:",
      settingsHeader: "Inställningar",
      statusUpdating: "Uppdaterar…",
      statusFailed: "Misslyckades",
      statusTimeout: "Tidsgräns överskreds",
      statusOffline: "Offline",
      statusOnline: "Online",
      uartOnlyHint: "Endast UART/SPI-flashning",
      unknownVersion: "okänd",
      newVersionPrefix: "ny: ",
      updateTitleUartOnly: "Det här chipsetet stöder inte uppdatering via nätverket (endast UART/SPI-flashning).",
      updateTitleUpdating: "En uppdatering pågår redan.",
      updateTitleNoUpdateKnown: "Ingen nyare version är för närvarande känd - klicka ändå för att flasha om firmware.",
      refreshTitle: "Fråga enheten igen",
      updateBtnLabel: "Firmware-uppdatering",
      deleteTitle: "Ta bort enhet",
      openDeviceTitle: "Öppna enheten i webbläsaren",
      confirmUpdateAll: "Uppdatera nu alla enheter som har en tillgänglig uppdatering?",
      confirmUpdateDevice: "Starta firmware-uppdateringen nu? Enheten startas om efteråt.",
      confirmUpdateDeviceNoUpdate: "Ingen nyare version är för närvarande känd. Flasha om firmware ändå?",
      confirmDelete: "Ta bort den här enheten från listan?",
      confirmDeleteChannel: "Ta bort den här aviseringskanalen?",
      alertDeviceOffline: "Enheten \"{name}\" svarar inte (offline eller fel lösenord).",
      alertActionFailed: "Åtgärden misslyckades: {msg}",
      alertRenameFailed: "Namnbytet misslyckades: {msg}",
      alertCheckFailed: "Kontrollen misslyckades: {msg}",
      alertUpdateAllFailed: "Uppdateringen misslyckades: {msg}",
      alertNoUpdatesFound: "Inga enheter med en tillgänglig uppdatering hittades.",
      alertUpdatesStarted: "{count} uppdatering(ar) startade.\n{skippedCount} hoppades över:\n{details}",
      alertUpdateFailedDetail: "Uppdateringen misslyckades:\n\n{detail}",
      alertUpdateFailedGeneric: "Uppdateringen misslyckades eller fick tidsgränsen överskriden. Inga fler detaljer är tillgängliga.",
      alertAddFailed: "Det gick inte att lägga till: {msg}",
      alertScanFailed: "Skanningen misslyckades: {msg}",
      alertSaveFailed: "Det gick inte att spara: {msg}",
      alertDeleteChannelFailed: "Det gick inte att ta bort: {msg}",
      alertCreateChannelFailed: "Det gick inte att skapa: {msg}",
      alertSensorLabelSaveFailed: "Det gick inte att döpa om sensorn: {msg}",
      bannerUpdateText: "Ny firmware tillgänglig för {count} enhet(er).",
      scanningStatus: "Skannar nätverket… det kan ta upp till 20 sekunder.",
      scanResultStatus: "Subnät: {subnet} – {count} enhet(er) hittades.",
      subnetUnknown: "okänt",
      alreadyAdded: "redan tillagd",
      addBtn: "Lägg till",
      noDevicesFoundScan: "Inga enheter hittades.",
      settingsScanSubnet: "Subnät att skanna",
      settingsAuto: "automatiskt",
      settingsPollInterval: "Pollningsintervall",
      settingsMinutesUnit: "min",
      settingsReleaseCheckInterval: "Intervall för versionskontroll",
      settingsHoursUnit: "h",
      settingsNotifications: "Aviseringar",
      settingsEnabled: "aktiverat",
      settingsDisabled: "inaktiverat",
      settingsFirmwarePort: "Port för firmware-server",
      sensorLoading: "Laddar sensordata…",
      sensorNoData: "Den här enheten rapporterar ingen sensordata (t.ex. ingen effektmätare/temperatursensor installerad).",
      sensorLoadError: "Det gick inte att ladda sensordata: {msg}",
      renameSensorPrompt: "Nytt visningsnamn för den här sensorn (lämna tomt för att återställa):",
      category_wifi: "Wi-Fi-anslutning",
      category_power: "Strömförbrukning",
      category_diagnostics: "Diagnostik",
      category_environment: "Miljö",
      category_other: "Övrigt",
      sensor_rssi: "RSSI",
      sensor_signal: "Wi-Fi-signal",
      sensor_ssid: "SSID",
      sensor_uptime: "Drifttid",
      sensor_uptime_sec: "Drifttid (sekunder)",
      sensor_heap: "Ledigt minne",
      sensor_power: "Effekt",
      sensor_apparent_power: "Skenbar effekt",
      sensor_reactive_power: "Reaktiv effekt",
      sensor_power_factor: "Effektfaktor",
      sensor_voltage: "Spänning",
      sensor_current: "Ström",
      sensor_frequency: "Frekvens",
      sensor_energy_total: "Total energi",
      sensor_energy_last_hour: "Energi senaste timmen",
      sensor_energy_yesterday: "Energi igår",
      sensor_temperature: "Temperatur",
      sensor_humidity: "Luftfuktighet",
      sensor_co2: "CO2",
      sensor_tvoc: "TVOC",
      never: "aldrig",
      releaseNotChecked: "Version: inte kontrollerad än",
      releaseLabel: "Version: {tag}",
      lastChecked: "Senast kontrollerad: {date}",
      viewReleaseNotes: "Visa versionsinformation",
      releasePublished: "Publicerad: {date}",
      releaseNoNotes: "Ingen versionsinformation tillgänglig.",
      viewOnGithub: "Visa på GitHub",
      githubRepoTitle: "Öppna OpenBK7231T_App på GitHub",
      migrateNavButton: "ESPHome ↔ OpenBeken",
      cacheHeader: "Firmware-cache",
      cacheCleanupNow: "Städa upp nu",
      cacheIntro: "Nedladdad OpenBeken-firmware och genererade UF2-filer (se \"ESPHome ↔ OpenBeken\") sparas permanent och tas aldrig bort av sig själva. Här ser du vad som tar upp plats, kan ta bort enskilda filer och ställa in en gräns för automatisk uppstädning - de äldsta filerna tas alltid bort först.",
      cacheColType: "Typ",
      cacheColLabel: "Etikett",
      cacheColFile: "Fil",
      cacheColSize: "Storlek",
      cacheColDate: "Tillagd",
      cacheLoading: "Laddar cache…",
      cacheEmpty: "Cachen är tom.",
      cacheKindFirmware: "Firmware",
      cacheKindUf2: "UF2",
      cacheTotal: "{count} fil(er), {size} totalt.",
      cacheMaxSizeLabel: "Maximal cachestorlek (MB)",
      cacheAutoCleanupLabel: "Städa upp automatiskt när gränsen överskrids",
      cacheSaveSettings: "Spara",
      cacheSettingsSaved: "Sparat.",
      cacheConfirmDelete: "Ta bort den här filen från cachen?",
      cacheConfirmCleanup: "Ta bort de äldsta cachade filerna tills den inställda storleken inte längre överskrids?",
      cacheCleanupNothing: "Cachen ligger redan inom den inställda storleken - inget togs bort.",
      cacheCleanupDone: "{count} fil(er) togs bort.",
      cacheAlertDeleteFailed: "Det gick inte att ta bort: {msg}",
      cacheAlertCleanupFailed: "Uppstädningen misslyckades: {msg}",
      cacheAlertSettingsFailed: "Det gick inte att spara: {msg}",
      notifActive: "aktiv",
      notifInactive: "inaktiv",
      notifSave: "Spara",
      notifTest: "Skicka testmeddelande",
      notifRemove: "Ta bort",
      notifTestSending: "Skickar testmeddelande…",
      notifTestSent: "Testmeddelandet skickades.",
      notifTestFailed: "Misslyckades: {msg}",
      noChannelYet: "Ingen aviseringskanal inställd än.",
      saveChannel: "Spara kanal",
      notifHaLabel: "Home Assistant-aviseringsmål",
      notifHaHint: "Namnet på en befintlig <code>notify.*</code>-tjänst, t.ex. \"mobile_app_phone\" eller \"persistent_notification\". Inget annat behöver ställas in.",
      notifTelegramTokenLabel: "Bot-token",
      notifTelegramTokenHint: "Från @BotFather i Telegram: öppna en chatt, skicka \"/newbot\" och följ instruktionerna.",
      notifTelegramChatIdLabel: "Chatt-ID",
      notifTelegramChatIdHint: "Skicka ett meddelande till din bot och öppna sedan https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates i en webbläsare - \"chat\":{\"id\": ...} är ditt chatt-ID.",
      notifWhatsappPhoneLabel: "Telefonnummer",
      notifWhatsappPhoneHint: "Inklusive landskod, t.ex. 491511234567.",
      notifWhatsappApikeyLabel: "API-nyckel (CallMeBot)",
      notifWhatsappApikeyHint: "Gratis WhatsApp-bot, inget Meta-företagskonto krävs: spara +34 644 84 71 04 som kontakt, skicka WhatsApp-meddelandet \"I allow callmebot to send me messages\" till den, så får du din personliga API-nyckel tillbaka via WhatsApp.",
      notifNameLabel: "Namn",
      notifNamePlaceholder: "t.ex. Alex telefon",
      notifMessageLabel: "Meddelande",
      notifMessageHint: "Platshållare: {version} = ny firmware-version, {devices} = berörda enheter.",
      notifDefaultTemplate: "OpenBK7231T_App {version} är tillgänglig. Berörda enheter: {devices}.",
      notifActiveLabel: "Aktiv",
      notifKeepUnchanged: "•••• (lämna oförändrat för att behålla det)",
      notifApikeyPlaceholderExample: "t.ex. 123456",
      backupsHeader: "Konfigurationssäkerhetskopior",
      backupsIntro: "Sparar automatiskt enhetens GPIO-pin-/kanaltilldelning och startkommandoskript före varje uppdatering, så att du kan ångra en uppdatering som återställer eller skadar dess konfiguration. Du kan även skapa en säkerhetskopia manuellt för valfri enhet nedan.",
      backupColDevice: "Enhet",
      backupColTime: "Tidpunkt",
      backupColReason: "Anledning",
      backupColVersion: "Firmware",
      backupReasonManual: "Manuellt",
      backupReasonPreUpdate: "Före uppdatering",
      backupEmpty: "Inga säkerhetskopior än.",
      backupNowTitle: "Säkerhetskopiera konfiguration nu",
      backupRestoreTitle: "Återställ denna konfiguration",
      backupDownloadTitle: "Ladda ner säkerhetskopia",
      backupConfirmRestore: "Vill du verkligen återställa denna konfiguration på enheten? De aktuella pin-/kanalinställningarna och startkommandot skrivs över.",
      backupAlertRestoreFailed: "Återställningen misslyckades: {msg}",
      backupRestoredAlert: "Konfigurationen har återställts.",
      backupConfirmDelete: "Vill du verkligen ta bort denna säkerhetskopia?",
      backupAlertDeleteFailed: "Borttagningen misslyckades: {msg}",
      backupAlertCreateFailed: "Säkerhetskopieringen misslyckades: {msg}",
      sensor_reboot_count: "Omstarter (uppskattat)",
      sensor_last_seen: "Senast sedd",
    },
  };
  I18N["en-US"] = I18N.en; // identical strings; only the date locale differs (see DATE_LOCALES)

  function getLang() {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
    } catch (e) { /* localStorage unavailable */ }
    return DEFAULT_LANG;
  }

  function setLang(lang) {
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
  }

  function t(key, vars) {
    const lang = getLang();
    let str = (I18N[lang] && I18N[lang][key]) || I18N[DEFAULT_LANG][key] || key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        str = str.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
      }
    }
    return str;
  }

  function applyStaticTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
  }

  function fmtDate(ts) {
    if (!ts) return t("never");
    const d = new Date(ts * 1000);
    return d.toLocaleString(DATE_LOCALES[getLang()] || "de-DE");
  }

  function fmtBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  const langSelect = $("#lang-select");
  if (langSelect) {
    langSelect.value = getLang();
    langSelect.addEventListener("change", () => {
      setLang(langSelect.value);
      applyStaticTranslations();
      renderDevices(lastDevices);
      updateBanner(lastDevices);
      loadSettings();
      loadCache();
      loadBackups();
      loadRelease();
      loadChannels().catch(() => {});
      if (typeof renderNewChannelFields === "function" && !newChannelForm.hidden) renderNewChannelFields();
      if (sensorModalDeviceId) {
        const dev = lastDevices.find((d) => d.id === sensorModalDeviceId);
        if (dev) updateSensorModalHeader(dev);
        loadSensorData(sensorModalDeviceId);
      }
    });
  }
  applyStaticTranslations();

  // --- Collapsible panels ----------------------------------------------------
  //
  // Each panel's heading is a button; clicking it toggles that panel's body
  // open/closed. State persists per-browser in localStorage so the layout
  // stays the way the user left it across reloads.

  const PANEL_STATE_KEY = "obk_panel_state";
  const PANEL_DEFAULTS = { devices: true, notifications: false, settings: false, cache: false, backups: false };

  function getPanelState() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(PANEL_STATE_KEY) || "{}") || {};
    } catch (e) {
      stored = {};
    }
    return Object.assign({}, PANEL_DEFAULTS, stored);
  }

  function setPanelState(key, isOpen) {
    const state = getPanelState();
    state[key] = isOpen;
    try {
      localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore */
    }
  }

  function applyPanelState() {
    const state = getPanelState();
    document.querySelectorAll(".panel-toggle[data-panel-key]").forEach((btn) => {
      const key = btn.getAttribute("data-panel-key");
      const isOpen = !!state[key];
      const body = btn.closest(".panel-header").parentElement.querySelector(".panel-body");
      btn.setAttribute("aria-expanded", String(isOpen));
      if (body) body.hidden = !isOpen;
    });
  }

  document.querySelectorAll(".panel-toggle[data-panel-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-panel-key");
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      setPanelState(key, !isOpen);
      applyPanelState();
    });
  });
  applyPanelState();

  // --- Dark mode ------------------------------------------------------------
  //
  // Follows the OS/browser preference (prefers-color-scheme) by default; the
  // toggle button stores an explicit override in localStorage that wins over
  // the OS setting until the user clears it again by toggling back to the
  // side that already matches the system.

  const THEME_KEY = "obk_theme"; // "light" | "dark" | absent (=auto)
  const themeToggleBtn = $("#btn-theme-toggle");

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function currentEffectiveTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return systemPrefersDark() ? "dark" : "light";
  }

  function applyTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    if (themeToggleBtn) {
      themeToggleBtn.textContent = currentEffectiveTheme() === "dark" ? "☀️" : "🌙";
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const next = currentEffectiveTheme() === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme();
    });
  }
  try {
    applyTheme();
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (!localStorage.getItem(THEME_KEY)) applyTheme();
      });
    }
  } catch (e) { /* localStorage unavailable - just keep the light default */ }

  // --- Numeric formatting / RSSI color-coding --------------------------------

  function roundNum(v) {
    return Math.round(v * 100) / 100;
  }

  function fmtSensorValue(value) {
    if (typeof value === "number") {
      return String(roundNum(value));
    }
    return String(value);
  }

  // RSSI here is the firmware's own 0-100 "quality" percentage (see
  // obk_client.get_sensor_status - a separate "signal" field in dBm exists
  // for the raw radio value). >=70% is a strong link, 40-69% is a link
  // that still works but may see occasional drops, below that is weak
  // enough to cause flaky OTA/behaviour.
  function rssiColorClass(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return "";
    if (n >= 70) return "rssi-good";
    if (n >= 40) return "rssi-medium";
    return "rssi-bad";
  }

  // --- Device list ------------------------------------------------------------

  const ICON_SYNC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
  const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
  const ICON_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
  const ICON_SAVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
  const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

  function statusPill(dev) {
    if (dev.update_state === "updating") return `<span class="status-pill status-update">${t("statusUpdating")}</span>`;
    if (dev.update_state === "failed") return `<span class="status-pill status-failed" title="${(dev.last_error || "").replace(/"/g, "")}">${t("statusFailed")}</span>`;
    if (dev.update_state === "timeout") return `<span class="status-pill status-failed" title="${(dev.last_error || "").replace(/"/g, "")}">${t("statusTimeout")}</span>`;
    if (!dev.online) return `<span class="status-pill status-offline">${t("statusOffline")}</span>`;
    return `<span class="status-pill status-online">${t("statusOnline")}</span>`;
  }

  function versionCell(dev) {
    let html = dev.current_version || t("unknownVersion");
    if (dev.update_available) {
      html += `<span class="latest">${t("newVersionPrefix")}${dev.latest_version}</span>`;
    } else if (dev.uart_only) {
      html += `<span class="latest">${t("uartOnlyHint")}</span>`;
    }
    return html;
  }

  function updateButtonTitle(dev) {
    if (dev.uart_only) return t("updateTitleUartOnly");
    if (dev.update_state === "updating") return t("updateTitleUpdating");
    if (!dev.update_available) return t("updateTitleNoUpdateKnown");
    return "";
  }

  function renderDevices(devices) {
    if (!devices.length) {
      deviceRows.innerHTML = `<tr><td colspan="6" class="empty-row">${t("emptyDevices")}</td></tr>`;
      return;
    }
    deviceRows.innerHTML = devices.map((dev) => {
      // Only the chipset name has no network-OTA asset at all (UART/SPI
      // only) or an update currently running is a real reason to block the
      // button - "no newer version known yet" should still be clickable so
      // the user always gets a concrete result instead of a dead button.
      const canUpdate = !dev.uart_only && dev.update_state !== "updating";
      const updateTitle = updateButtonTitle(dev);
      return `
        <tr data-id="${dev.id}" class="device-row">
          <td>
            <div class="device-name-cell">
              <span class="device-name-text" data-id="${dev.id}">${escapeHtml(dev.name || dev.ip)}</span>
            </div>
          </td>
          <td>${dev.ip}</td>
          <td>${dev.chipset || "?"}</td>
          <td class="version-cell">${versionCell(dev)}</td>
          <td>${statusPill(dev)}</td>
          <td class="row-actions no-detail">
            <button class="icon-btn icon-btn-sync btn-refresh" data-id="${dev.id}" title="${escapeAttr(t("refreshTitle"))}">${ICON_SYNC}</button>
            <button class="btn btn-primary btn-update" data-id="${dev.id}" title="${escapeAttr(updateTitle)}" ${canUpdate ? "" : "disabled"}>${t("updateBtnLabel")}</button>
            <button class="icon-btn icon-btn-save btn-backup-now" data-id="${dev.id}" title="${escapeAttr(t("backupNowTitle"))}">${ICON_SAVE}</button>
            <button class="icon-btn icon-btn-delete btn-delete" data-id="${dev.id}" title="${escapeAttr(t("deleteTitle"))}">${ICON_TRASH}</button>
            <button class="icon-btn icon-btn-open btn-open-device" data-ip="${escapeAttr(dev.ip)}" title="${escapeAttr(t("openDeviceTitle"))}">${ICON_OPEN}</button>
          </td>
        </tr>`;
    }).join("");
  }

  let lastDevices = [];
  let lastReleaseData = null;
  let lastReleaseChecked = null;

  function updateBanner(devices) {
    const outdated = devices.filter((d) => d.update_available);
    if (outdated.length) {
      bannerUpdate.hidden = false;
      bannerUpdateText.textContent = t("bannerUpdateText", { count: outdated.length });
    } else {
      bannerUpdate.hidden = true;
    }
  }

  async function loadDevices() {
    const devices = await api("GET", "api/devices");
    lastDevices = devices;
    renderDevices(devices);
    updateBanner(devices);

    // Keep an open sensor modal in sync with fresh device state (e.g. name).
    if (sensorModalDeviceId) {
      const dev = devices.find((d) => d.id === sensorModalDeviceId);
      if (dev) updateSensorModalHeader(dev);
    }
  }

  async function loadRelease() {
    const data = await api("GET", "api/release");
    lastReleaseData = data.release || null;
    lastReleaseChecked = data.last_checked || null;
    if (data.release) {
      releaseBadge.textContent = t("releaseLabel", { tag: data.release.tag_name });
      releaseBadge.title = t("lastChecked", { date: fmtDate(data.last_checked) });
    } else {
      releaseBadge.textContent = t("releaseNotChecked");
    }
  }

  async function loadSettings() {
    const s = await api("GET", "api/settings");
    const list = $("#settings-list");
    const rows = [
      [t("settingsScanSubnet"), s.scan_subnet || t("settingsAuto")],
      [t("settingsPollInterval"), `${s.poll_interval_minutes} ${t("settingsMinutesUnit")}`],
      [t("settingsReleaseCheckInterval"), `${s.release_check_interval_hours} ${t("settingsHoursUnit")}`],
      [t("settingsNotifications"), s.notify_on_update ? t("settingsEnabled") : t("settingsDisabled")],
      [t("settingsFirmwarePort"), s.firmware_server_port],
    ];
    list.innerHTML = rows.map(([k, v]) => `<span class="setting-item"><span class="setting-label">${escapeHtml(k)}:</span> <span class="setting-value">${escapeHtml(String(v))}</span></span>`).join("");
  }

  const CACHE_KIND_LABEL_KEY = { firmware: "cacheKindFirmware", uf2: "cacheKindUf2" };

  function renderCache(data) {
    const rows = $("#cache-rows");
    const entries = data.entries || [];
    if (!entries.length) {
      rows.innerHTML = `<tr><td colspan="6" class="empty-row" data-i18n="cacheEmpty">${escapeHtml(t("cacheEmpty"))}</td></tr>`;
    } else {
      // Newest first for readability; auto-/manual cleanup still removes
      // the oldest ones regardless of how the list is displayed here.
      const sorted = [...entries].sort((a, b) => b.mtime - a.mtime);
      rows.innerHTML = sorted.map((e) => `
        <tr>
          <td>${escapeHtml(t(CACHE_KIND_LABEL_KEY[e.kind] || e.kind))}</td>
          <td>${escapeHtml(e.label)}</td>
          <td>${escapeHtml(e.filename)}</td>
          <td>${escapeHtml(fmtBytes(e.size_bytes))}</td>
          <td>${escapeHtml(fmtDate(e.mtime))}</td>
          <td class="row-actions">
            <button class="icon-btn icon-btn-delete btn-cache-delete" data-id="${escapeAttr(e.id)}" title="${escapeAttr(t("deleteTitle"))}">${ICON_TRASH}</button>
          </td>
        </tr>
      `).join("");
    }
    $("#cache-total").textContent = t("cacheTotal", { size: fmtBytes(data.total_bytes || 0), count: entries.length });
    const maxSizeInput = $("#cache-max-size");
    const autoCleanupInput = $("#cache-auto-cleanup");
    if (document.activeElement !== maxSizeInput) maxSizeInput.value = data.max_size_mb;
    if (document.activeElement !== autoCleanupInput) autoCleanupInput.checked = !!data.auto_cleanup;
  }

  async function loadCache() {
    const data = await api("GET", "api/cache");
    renderCache(data);
  }

  const BACKUP_REASON_LABEL_KEY = { manual: "backupReasonManual", pre_update: "backupReasonPreUpdate" };

  function renderBackups(data) {
    const rows = $("#backup-rows");
    const entries = data.entries || [];
    if (!entries.length) {
      rows.innerHTML = `<tr><td colspan="5" class="empty-row" data-i18n="backupEmpty">${escapeHtml(t("backupEmpty"))}</td></tr>`;
      return;
    }
    // Newest first for readability.
    const sorted = [...entries].sort((a, b) => b.created_at - a.created_at);
    rows.innerHTML = sorted.map((e) => `
      <tr>
        <td>${escapeHtml(e.device_name || e.ip || "?")}</td>
        <td>${escapeHtml(fmtDate(e.created_at))}</td>
        <td>${escapeHtml(t(BACKUP_REASON_LABEL_KEY[e.reason] || e.reason))}</td>
        <td>${escapeHtml(e.version || "?")}</td>
        <td class="row-actions">
          <button class="icon-btn icon-btn-sync btn-backup-restore" data-device-id="${escapeAttr(e.device_id)}" data-id="${escapeAttr(e.id)}" title="${escapeAttr(t("backupRestoreTitle"))}">${ICON_SYNC}</button>
          <button class="icon-btn btn-backup-download" data-device-id="${escapeAttr(e.device_id)}" data-id="${escapeAttr(e.id)}" title="${escapeAttr(t("backupDownloadTitle"))}">${ICON_DOWNLOAD}</button>
          <button class="icon-btn icon-btn-delete btn-backup-delete" data-device-id="${escapeAttr(e.device_id)}" data-id="${escapeAttr(e.id)}" title="${escapeAttr(t("deleteTitle"))}">${ICON_TRASH}</button>
        </td>
      </tr>
    `).join("");
  }

  async function loadBackups() {
    const data = await api("GET", "api/backups");
    renderBackups(data);
  }

  async function refreshAll() {
    await Promise.all([loadDevices(), loadRelease()]);
  }

  // --- Event wiring -------------------------------------------------------

  $("#btn-check-release").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    try {
      await api("POST", "api/release/check");
      await refreshAll();
    } catch (e) {
      alert(t("alertCheckFailed", { msg: e.message }));
    } finally {
      ev.target.disabled = false;
    }
  });

  $("#cache-rows").addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".btn-cache-delete");
    if (!btn) return;
    if (!confirm(t("cacheConfirmDelete"))) return;
    btn.disabled = true;
    try {
      await api("POST", "api/cache/delete", { id: btn.dataset.id });
      await loadCache();
    } catch (e) {
      alert(t("cacheAlertDeleteFailed", { msg: e.message }));
      btn.disabled = false;
    }
  });

  $("#backup-rows").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    const deviceId = btn.dataset.deviceId;
    const backupId = btn.dataset.id;
    if (btn.classList.contains("btn-backup-download")) {
      window.open(apiUrl(`api/backups/${deviceId}/${backupId}/download`), "_blank", "noopener");
      return;
    }
    if (btn.classList.contains("btn-backup-restore")) {
      if (!confirm(t("backupConfirmRestore"))) return;
      btn.disabled = true;
      try {
        await api("POST", `api/backups/${deviceId}/${backupId}/restore`);
        alert(t("backupRestoredAlert"));
      } catch (e) {
        alert(t("backupAlertRestoreFailed", { msg: e.message }));
      } finally {
        btn.disabled = false;
      }
      return;
    }
    if (btn.classList.contains("btn-backup-delete")) {
      if (!confirm(t("backupConfirmDelete"))) return;
      btn.disabled = true;
      try {
        await api("POST", `api/backups/${deviceId}/${backupId}/delete`);
        await loadBackups();
      } catch (e) {
        alert(t("backupAlertDeleteFailed", { msg: e.message }));
        btn.disabled = false;
      }
    }
  });

  $("#btn-cache-cleanup").addEventListener("click", async (ev) => {
    if (!confirm(t("cacheConfirmCleanup"))) return;
    ev.target.disabled = true;
    try {
      const result = await api("POST", "api/cache/cleanup", {});
      renderCache(result);
      if (!result.deleted.length) {
        alert(t("cacheCleanupNothing"));
      } else {
        alert(t("cacheCleanupDone", { count: result.deleted.length }));
      }
    } catch (e) {
      alert(t("cacheAlertCleanupFailed", { msg: e.message }));
    } finally {
      ev.target.disabled = false;
    }
  });

  $("#btn-cache-save-settings").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    const statusEl = $("#cache-settings-status");
    statusEl.textContent = "";
    try {
      const maxSizeMb = parseInt($("#cache-max-size").value, 10);
      const autoCleanup = $("#cache-auto-cleanup").checked;
      const result = await api("POST", "api/cache/settings", { max_size_mb: maxSizeMb, auto_cleanup: autoCleanup });
      $("#cache-max-size").value = result.max_size_mb;
      $("#cache-auto-cleanup").checked = result.auto_cleanup;
      statusEl.textContent = t("cacheSettingsSaved");
    } catch (e) {
      statusEl.textContent = t("cacheAlertSettingsFailed", { msg: e.message });
    } finally {
      ev.target.disabled = false;
    }
  });

  $("#btn-update-all").addEventListener("click", async (ev) => {
    if (!confirm(t("confirmUpdateAll"))) return;
    ev.target.disabled = true;
    try {
      const result = await api("POST", "api/devices/update_all");
      await loadDevices();
      const started = result.started || [];
      const skipped = result.skipped || [];
      if (!started.length && !skipped.length) {
        alert(t("alertNoUpdatesFound"));
      } else if (skipped.length) {
        const details = skipped.map((s) => `${s.name}: ${s.error}`).join("\n");
        alert(t("alertUpdatesStarted", { count: started.length, skippedCount: skipped.length, details }));
      }
    } catch (e) {
      alert(t("alertUpdateAllFailed", { msg: e.message }));
    } finally {
      ev.target.disabled = false;
    }
  });

  $("#btn-show-add").addEventListener("click", () => {
    $("#form-add-device").hidden = false;
  });
  $("#btn-cancel-add").addEventListener("click", () => {
    $("#form-add-device").hidden = true;
    $("#add-device-error").hidden = true;
  });

  $("#form-add-device").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const ip = $("#add-ip").value.trim();
    const name = $("#add-name").value.trim();
    const password = $("#add-password").value;
    const errEl = $("#add-device-error");
    errEl.hidden = true;
    try {
      await api("POST", "api/devices", { ip, name, password });
      $("#add-ip").value = "";
      $("#add-name").value = "";
      $("#add-password").value = "";
      $("#form-add-device").hidden = true;
      await loadDevices();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.hidden = false;
    }
  });

  deviceRows.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (btn) {
      const id = btn.dataset.id;
      if (btn.classList.contains("btn-open-device")) {
        window.open(`http://${btn.dataset.ip}/`, "_blank", "noopener");
        return;
      }
      if (btn.classList.contains("btn-backup-now")) {
        btn.disabled = true;
        try {
          await api("POST", `api/devices/${id}/backups`);
          await loadBackups();
        } catch (e) {
          alert(t("backupAlertCreateFailed", { msg: e.message }));
        } finally {
          btn.disabled = false;
        }
        return;
      }
      try {
        if (btn.classList.contains("btn-refresh")) {
          btn.disabled = true;
          const dev = await api("POST", `api/devices/${id}/refresh`);
          await loadDevices();
          if (!dev.online) {
            alert(t("alertDeviceOffline", { name: dev.name || dev.ip }));
          }
        } else if (btn.classList.contains("btn-update")) {
          const dev = lastDevices.find((d) => d.id === id);
          const msg = (dev && !dev.update_available) ? t("confirmUpdateDeviceNoUpdate") : t("confirmUpdateDevice");
          if (!confirm(msg)) return;
          btn.disabled = true;
          await api("POST", `api/devices/${id}/update`);
          await loadDevices();
        } else if (btn.classList.contains("btn-delete")) {
          if (!confirm(t("confirmDelete"))) return;
          await api("DELETE", `api/devices/${id}`);
          await loadDevices();
        }
      } catch (e) {
        alert(t("alertActionFailed", { msg: e.message }));
      } finally {
        btn.disabled = false;
      }
      return;
    }

    // The status pill's tooltip (title attribute) carries the detailed
    // reason for a "Fehlgeschlagen"/"Zeitüberschreitung" status, but hover
    // tooltips don't work on touchscreens - this add-on is often opened on
    // a tablet/phone. Tapping the pill shows the same text as an alert so
    // it's reachable without a mouse.
    const pill = ev.target.closest(".status-pill.status-failed");
    if (pill) {
      const detail = pill.getAttribute("title");
      alert(detail ? t("alertUpdateFailedDetail", { detail }) : t("alertUpdateFailedGeneric"));
      return;
    }

    // Clicking anywhere else on a device row - including the device name,
    // which is now a fixed label rather than an inline-editable input -
    // opens the sensor detail view; renaming the device now happens inside
    // that popup. Only the action-buttons cell ("no-detail") is excluded.
    const cell = ev.target.closest("td");
    if (cell && cell.classList.contains("no-detail")) return;
    const row = ev.target.closest("tr[data-id]");
    if (!row) return;
    openSensorModal(row.dataset.id);
  });

  // --- Scan panel -----------------------------------------------------------

  const scanPanel = $("#scan-panel");
  const scanRows = $("#scan-rows");
  const scanStatus = $("#scan-status");

  $("#btn-scan").addEventListener("click", async (ev) => {
    scanPanel.hidden = false;
    scanStatus.textContent = t("scanningStatus");
    scanRows.innerHTML = "";
    ev.target.disabled = true;
    try {
      const data = await api("GET", "api/scan");
      scanStatus.textContent = t("scanResultStatus", { subnet: data.subnet || t("subnetUnknown"), count: data.results.length });
      scanRows.innerHTML = data.results.map((r) => `
        <tr>
          <td>${r.ip}</td>
          <td>${r.chipset || "?"}</td>
          <td>${r.version || "?"}</td>
          <td>${r.already_added
            ? `<span class="muted">${t("alreadyAdded")}</span>`
            : `<button class="btn btn-primary btn-scan-add" data-ip="${r.ip}">${t("addBtn")}</button>`}</td>
        </tr>`).join("") || `<tr><td colspan="4" class="empty-row">${t("noDevicesFoundScan")}</td></tr>`;
    } catch (e) {
      scanStatus.textContent = t("alertScanFailed", { msg: e.message });
    } finally {
      ev.target.disabled = false;
    }
  });

  $("#btn-close-scan").addEventListener("click", () => { scanPanel.hidden = true; });

  scanRows.addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".btn-scan-add");
    if (!btn) return;
    btn.disabled = true;
    try {
      await api("POST", "api/devices", { ip: btn.dataset.ip });
      btn.outerHTML = `<span class="muted">${t("alreadyAdded")}</span>`;
      await loadDevices();
    } catch (e) {
      alert(t("alertAddFailed", { msg: e.message }));
      btn.disabled = false;
    }
  });

  // --- Device sensor detail modal --------------------------------------------

  const sensorModalOverlay = $("#sensor-modal-overlay");
  const sensorModalNameInput = $("#sensor-modal-name-input");
  const sensorModalSubtitle = $("#sensor-modal-subtitle");
  const sensorModalStatus = $("#sensor-modal-status");
  const sensorCategories = $("#sensor-categories");
  let sensorModalDeviceId = null;
  let sensorModalTimer = null;

  const CATEGORY_ORDER = ["wifi", "power", "diagnostics", "environment", "other"];

  function updateSensorModalHeader(dev) {
    sensorModalNameInput.value = dev.name || dev.ip;
    sensorModalSubtitle.textContent = `${dev.ip} · ${dev.chipset || "?"} · ${dev.current_version || t("unknownVersion")}`;
  }

  function sensorLabelFor(key, sensor) {
    if (sensor.custom && sensor.label) return sensor.label;
    return t("sensor_" + key) !== "sensor_" + key ? t("sensor_" + key) : sensor.label;
  }

  function renderSensorCard(key, sensor) {
    const unit = sensor.unit ? `<span class="sensor-unit">${escapeHtml(sensor.unit)}</span>` : "";
    const valueClass = key === "rssi" ? ` ${rssiColorClass(sensor.value)}` : "";
    const label = sensorLabelFor(key, sensor);
    const displayValue = sensor.is_timestamp ? fmtDate(sensor.value) : fmtSensorValue(sensor.value);
    return `
      <div class="sensor-card" data-key="${escapeAttr(key)}">
        <div class="sensor-label" data-key="${escapeAttr(key)}" title="${escapeAttr(t("renameSensorPrompt"))}">${escapeHtml(label)}</div>
        <div class="sensor-value${valueClass}">${escapeHtml(displayValue)}${unit}</div>
      </div>`;
  }

  async function loadSensorData(deviceId) {
    try {
      const data = await api("GET", `api/devices/${deviceId}/sensors`);
      const sensors = data.sensors || {};
      const keys = Object.keys(sensors);
      if (!keys.length) {
        sensorModalStatus.textContent = t("sensorNoData");
        sensorCategories.innerHTML = "";
        return;
      }
      sensorModalStatus.textContent = "";
      const byCategory = {};
      for (const key of keys) {
        const cat = sensors[key].category || "other";
        (byCategory[cat] = byCategory[cat] || []).push(key);
      }
      sensorCategories.innerHTML = CATEGORY_ORDER.filter((cat) => byCategory[cat] && byCategory[cat].length).map((cat) => `
        <div class="sensor-category">
          <h3 class="sensor-category-title">${t("category_" + cat)}</h3>
          <div class="sensor-grid">
            ${byCategory[cat].map((key) => renderSensorCard(key, sensors[key])).join("")}
          </div>
        </div>`).join("");
    } catch (e) {
      sensorModalStatus.textContent = t("sensorLoadError", { msg: e.message });
      sensorCategories.innerHTML = "";
    }
  }

  function openSensorModal(deviceId) {
    const dev = lastDevices.find((d) => d.id === deviceId);
    if (!dev) return;
    sensorModalDeviceId = deviceId;
    updateSensorModalHeader(dev);
    sensorModalStatus.textContent = t("sensorLoading");
    sensorCategories.innerHTML = "";
    sensorModalOverlay.hidden = false;
    loadSensorData(deviceId);
    if (sensorModalTimer) clearInterval(sensorModalTimer);
    sensorModalTimer = setInterval(() => loadSensorData(deviceId), 8000);
  }

  function closeSensorModal() {
    sensorModalOverlay.hidden = true;
    sensorModalDeviceId = null;
    if (sensorModalTimer) {
      clearInterval(sensorModalTimer);
      sensorModalTimer = null;
    }
  }

  $("#btn-close-sensor-modal").addEventListener("click", closeSensorModal);
  sensorModalOverlay.addEventListener("click", (ev) => {
    if (ev.target === sensorModalOverlay) closeSensorModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !sensorModalOverlay.hidden) closeSensorModal();
  });

  // --- Release notes modal ------------------------------------------------

  const releaseModalOverlay = $("#release-modal-overlay");
  const releaseModalTitle = $("#release-modal-title");
  const releaseModalSubtitle = $("#release-modal-subtitle");
  const releaseModalBody = $("#release-modal-body");
  const releaseModalLink = $("#release-modal-link");

  function openReleaseModal() {
    if (!lastReleaseData) return;
    releaseModalTitle.textContent = lastReleaseData.name || t("releaseLabel", { tag: lastReleaseData.tag_name });
    const parts = [];
    if (lastReleaseData.published_at) {
      parts.push(t("releasePublished", { date: new Date(lastReleaseData.published_at).toLocaleString(DATE_LOCALES[getLang()] || "de-DE") }));
    }
    if (lastReleaseChecked) {
      parts.push(t("lastChecked", { date: fmtDate(lastReleaseChecked) }));
    }
    releaseModalSubtitle.textContent = parts.join(" · ");
    releaseModalBody.innerHTML = lastReleaseData.body
      ? renderMarkdownLite(lastReleaseData.body)
      : `<p class="muted">${escapeHtml(t("releaseNoNotes"))}</p>`;
    releaseModalLink.href = lastReleaseData.html_url || "https://github.com/openshwprojects/OpenBK7231T_App/releases";
    releaseModalOverlay.hidden = false;
  }

  function closeReleaseModal() {
    releaseModalOverlay.hidden = true;
  }

  releaseBadge.addEventListener("click", openReleaseModal);
  $("#btn-close-release-modal").addEventListener("click", closeReleaseModal);
  releaseModalOverlay.addEventListener("click", (ev) => {
    if (ev.target === releaseModalOverlay) closeReleaseModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !releaseModalOverlay.hidden) closeReleaseModal();
  });

  // Renaming the device now happens inside the popup (the table only shows
  // a fixed name and opens this popup on click - see the deviceRows click
  // handler above).
  sensorModalNameInput.addEventListener("change", async () => {
    if (!sensorModalDeviceId) return;
    try {
      await api("PATCH", `api/devices/${sensorModalDeviceId}`, { name: sensorModalNameInput.value });
      await loadDevices();
    } catch (e) {
      alert(t("alertRenameFailed", { msg: e.message }));
    }
  });

  // Click-to-rename for individual sensor labels within the popup.
  sensorCategories.addEventListener("click", (ev) => {
    const labelEl = ev.target.closest(".sensor-label");
    if (!labelEl || labelEl.querySelector("input")) return;
    const key = labelEl.dataset.key;
    const currentText = labelEl.textContent;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "sensor-label-input";
    input.value = currentText;
    labelEl.textContent = "";
    labelEl.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const newLabel = input.value.trim();
      if (newLabel === currentText) {
        labelEl.textContent = currentText;
        return;
      }
      try {
        await api("PATCH", `api/devices/${sensorModalDeviceId}/sensor-labels`, { key, label: newLabel });
        await loadSensorData(sensorModalDeviceId);
      } catch (e) {
        alert(t("alertSensorLabelSaveFailed", { msg: e.message }));
        labelEl.textContent = currentText;
      }
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (kev) => {
      if (kev.key === "Enter") { kev.preventDefault(); input.blur(); }
      if (kev.key === "Escape") { done = true; labelEl.textContent = currentText; }
    });
  });

  // --- Notification channels --------------------------------------------------
  //
  // Icons are small inline SVGs (brand-colored, simplified) so the channel
  // type picker is recognizable at a glance instead of relying on text.

  const CHANNEL_ICONS = {
    ha: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2.7 2.5 11h2.6v9h6V14h2v6h6v-9h2.6L12 2.7Z" fill="#18BCF2"/></svg>`,
    telegram: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#29A9EA"/><path d="M5.4 12.1l12.7-4.9c.6-.2 1.1.1.9.9l-2.2 10.2c-.2.7-.6.9-1.2.5l-3.3-2.4-1.6 1.5c-.2.2-.3.3-.6.3l.2-3.1 5.7-5.1c.2-.2 0-.4-.3-.2l-7 4.4-3-1c-.7-.2-.7-.7.2-1.1Z" fill="#fff"/></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#25D366"/><path d="M12 5a7 7 0 0 0-6 10.6L5 19l3.5-1A7 7 0 1 0 12 5Zm4.1 9.9c-.2.5-1 1-1.4 1-.4 0-.9.1-2.9-.9-2.4-1.2-3.9-3.6-4-3.8-.1-.2-1-1.3-1-2.5s.6-1.8.8-2c.2-.2.5-.3.6-.3h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2.1.4 0 .6l-.4.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.6-.7c.2-.2.4-.2.6-.1l1.5.7c.2.1.4.2.4.3.1.2.1.7-.1 1.2Z" fill="#fff"/></svg>`,
  };
  const CHANNEL_LABELS = { ha: "Home Assistant", telegram: "Telegram", whatsapp: "WhatsApp" };

  const channelList = $("#channel-list");
  const btnShowAddChannel = $("#btn-show-add-channel");
  const newChannelForm = $("#new-channel-form");
  const channelTypePicker = $("#channel-type-picker");
  const newChannelFields = $("#new-channel-fields");

  let haServicesCache = null;
  async function getHaServices() {
    if (haServicesCache) return haServicesCache;
    try {
      haServicesCache = await api("GET", "api/notifications/ha_services");
    } catch (e) {
      haServicesCache = [];
    }
    return haServicesCache;
  }

  function configFieldsHtml(type, cfg, prefix) {
    cfg = cfg || {};
    if (type === "ha") {
      return `
        <label>${t("notifHaLabel")}
          <span class="field-hint">${t("notifHaHint")}</span>
          <input list="${prefix}-ha-services" name="service" value="${escapeAttr(cfg.service || "")}" placeholder="mobile_app_handy">
          <datalist id="${prefix}-ha-services"></datalist>
        </label>`;
    }
    if (type === "telegram") {
      const tokenPlaceholder = cfg.bot_token_set ? t("notifKeepUnchanged") : "123456789:AA...";
      return `
        <label>${t("notifTelegramTokenLabel")}
          <span class="field-hint">${t("notifTelegramTokenHint")}</span>
          <input type="password" name="bot_token" placeholder="${escapeAttr(tokenPlaceholder)}">
        </label>
        <label>${t("notifTelegramChatIdLabel")}
          <span class="field-hint">${t("notifTelegramChatIdHint")}</span>
          <input name="chat_id" value="${escapeAttr(cfg.chat_id || "")}" placeholder="123456789">
        </label>`;
    }
    if (type === "whatsapp") {
      const apikeyPlaceholder = cfg.apikey_set ? t("notifKeepUnchanged") : t("notifApikeyPlaceholderExample");
      return `
        <label>${t("notifWhatsappPhoneLabel")}
          <span class="field-hint">${t("notifWhatsappPhoneHint")}</span>
          <input name="phone" value="${escapeAttr(cfg.phone || "")}" placeholder="49151234567">
        </label>
        <label>${t("notifWhatsappApikeyLabel")}
          <span class="field-hint">${t("notifWhatsappApikeyHint")}</span>
          <input type="password" name="apikey" placeholder="${escapeAttr(apikeyPlaceholder)}">
        </label>`;
    }
    return "";
  }

  function commonFieldsHtml(channel) {
    channel = channel || {};
    return `
      <label>${t("notifNameLabel")}
        <input name="name" value="${escapeAttr(channel.name || "")}" placeholder="${escapeAttr(t("notifNamePlaceholder"))}">
      </label>
      <label>${t("notifMessageLabel")}
        <span class="field-hint">${t("notifMessageHint")}</span>
        <textarea name="message_template">${escapeHtml(channel.message_template || t("notifDefaultTemplate"))}</textarea>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" name="enabled" ${channel.enabled === false ? "" : "checked"} style="width:auto;">
        ${t("notifActiveLabel")}
      </label>`;
  }

  function renderChannelList(channels) {
    if (!channels.length) {
      channelList.innerHTML = `<p class="muted">${t("noChannelYet")}</p>`;
      return;
    }
    channelList.innerHTML = channels.map((ch) => `
      <div class="channel-card" data-id="${ch.id}">
        <div class="channel-card-header">
          ${CHANNEL_ICONS[ch.type] || ""}
          <span class="channel-name">${escapeHtml(ch.name)}</span>
          <span class="channel-type-label">${CHANNEL_LABELS[ch.type] || ch.type}</span>
          <span class="status-pill ${ch.enabled === false ? "status-offline" : "status-online"}">${ch.enabled === false ? t("notifInactive") : t("notifActive")}</span>
        </div>
        <form class="channel-form" data-id="${ch.id}" data-type="${ch.type}">
          ${commonFieldsHtml(ch)}
          ${configFieldsHtml(ch.type, ch.config, "edit-" + ch.id)}
          <div class="channel-card-actions">
            <button type="submit" class="btn btn-primary btn-small">${t("notifSave")}</button>
            <button type="button" class="btn btn-secondary btn-small btn-test-channel" data-id="${ch.id}">${t("notifTest")}</button>
            <button type="button" class="btn btn-danger btn-small btn-delete-channel" data-id="${ch.id}">${t("notifRemove")}</button>
          </div>
          <p class="test-result" data-id="${ch.id}" hidden></p>
        </form>
      </div>`).join("");

    if (channelList.querySelector('[name="service"]')) {
      getHaServices().then((services) => {
        channelList.querySelectorAll("datalist").forEach((dl) => {
          dl.innerHTML = services.map((s) => `<option value="${escapeAttr(s)}">`).join("");
        });
      });
    }
  }

  async function loadChannels() {
    const channels = await api("GET", "api/notifications");
    renderChannelList(channels);
  }

  function formToChannelPayload(form) {
    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"),
      message_template: fd.get("message_template"),
      enabled: fd.get("enabled") === "on",
      config: {},
    };
    for (const [key, value] of fd.entries()) {
      if (key === "name" || key === "message_template" || key === "enabled") continue;
      payload.config[key] = value;
    }
    return payload;
  }

  channelList.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const id = form.dataset.id;
    try {
      await api("PATCH", `api/notifications/${id}`, formToChannelPayload(form));
      await loadChannels();
    } catch (e) {
      alert(t("alertSaveFailed", { msg: e.message }));
    }
  });

  channelList.addEventListener("click", async (ev) => {
    const testBtn = ev.target.closest(".btn-test-channel");
    const delBtn = ev.target.closest(".btn-delete-channel");
    if (testBtn) {
      const id = testBtn.dataset.id;
      const resultEl = channelList.querySelector(`.test-result[data-id="${id}"]`);
      testBtn.disabled = true;
      resultEl.hidden = false;
      resultEl.className = "test-result";
      resultEl.textContent = t("notifTestSending");
      try {
        await api("POST", `api/notifications/${id}/test`);
        resultEl.className = "test-result ok";
        resultEl.textContent = t("notifTestSent");
      } catch (e) {
        resultEl.className = "test-result fail";
        resultEl.textContent = t("notifTestFailed", { msg: e.message });
      } finally {
        testBtn.disabled = false;
      }
    } else if (delBtn) {
      if (!confirm(t("confirmDeleteChannel"))) return;
      try {
        await api("DELETE", `api/notifications/${delBtn.dataset.id}`);
        await loadChannels();
      } catch (e) {
        alert(t("alertDeleteChannelFailed", { msg: e.message }));
      }
    }
  });

  let selectedNewChannelType = null;

  function renderChannelTypePicker() {
    channelTypePicker.innerHTML = Object.keys(CHANNEL_ICONS).map((type) => `
      <button type="button" class="channel-type-btn ${type === selectedNewChannelType ? "selected" : ""}" data-type="${type}">
        ${CHANNEL_ICONS[type]}
        <span>${CHANNEL_LABELS[type]}</span>
      </button>`).join("");
  }

  function renderNewChannelFields() {
    if (!selectedNewChannelType) {
      newChannelFields.innerHTML = "";
      return;
    }
    newChannelFields.innerHTML = `
      <form class="channel-form" id="add-channel-form">
        ${commonFieldsHtml({})}
        ${configFieldsHtml(selectedNewChannelType, {}, "new")}
        <div class="channel-card-actions">
          <button type="submit" class="btn btn-primary btn-small">${t("saveChannel")}</button>
          <button type="button" class="btn btn-link btn-small" id="btn-cancel-add-channel">${t("cancel")}</button>
        </div>
      </form>`;
    if (newChannelFields.querySelector('[name="service"]')) {
      getHaServices().then((services) => {
        const dl = newChannelFields.querySelector("datalist");
        if (dl) dl.innerHTML = services.map((s) => `<option value="${escapeAttr(s)}">`).join("");
      });
    }
    $("#btn-cancel-add-channel").addEventListener("click", () => {
      selectedNewChannelType = null;
      renderChannelTypePicker();
      renderNewChannelFields();
    });
    $("#add-channel-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const payload = formToChannelPayload(ev.target);
      payload.type = selectedNewChannelType;
      try {
        await api("POST", "api/notifications", payload);
        selectedNewChannelType = null;
        newChannelForm.hidden = true;
        renderChannelTypePicker();
        renderNewChannelFields();
        await loadChannels();
      } catch (e) {
        alert(t("alertCreateChannelFailed", { msg: e.message }));
      }
    });
  }

  btnShowAddChannel.addEventListener("click", () => {
    newChannelForm.hidden = false;
    renderChannelTypePicker();
    renderNewChannelFields();
  });

  channelTypePicker.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".channel-type-btn");
    if (!btn) return;
    selectedNewChannelType = btn.dataset.type;
    renderChannelTypePicker();
    renderNewChannelFields();
  });

  // --- Init + polling -------------------------------------------------------

  refreshAll();
  loadSettings();
  loadCache();
  loadBackups();
  loadChannels();
  setInterval(loadDevices, 10000);
})();
