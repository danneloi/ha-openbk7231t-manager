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
  const SUPPORTED_LANGS = ["de", "en", "en-US", "fr", "es", "pt"];
  const DEFAULT_LANG = "de";

  // Date-formatting locale per UI language - "en" uses a day/month order
  // closer to the German convention this add-on originally shipped with,
  // "en-US" gets the month/day order Americans actually expect.
  const DATE_LOCALES = { de: "de-DE", en: "en-GB", "en-US": "en-US", fr: "fr-FR", es: "es-ES", pt: "pt-PT" };

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

  const langSelect = $("#lang-select");
  if (langSelect) {
    langSelect.value = getLang();
    langSelect.addEventListener("change", () => {
      setLang(langSelect.value);
      applyStaticTranslations();
      renderDevices(lastDevices);
      updateBanner(lastDevices);
      loadSettings();
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
    return `
      <div class="sensor-card" data-key="${escapeAttr(key)}">
        <div class="sensor-label" data-key="${escapeAttr(key)}" title="${escapeAttr(t("renameSensorPrompt"))}">${escapeHtml(label)}</div>
        <div class="sensor-value${valueClass}">${escapeHtml(fmtSensorValue(sensor.value))}${unit}</div>
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
  loadChannels();
  setInterval(loadDevices, 10000);
})();
