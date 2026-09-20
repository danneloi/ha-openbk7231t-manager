(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  function apiUrl(path) {
    return path.replace(/^\//, "");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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

  // --- i18n (kept independent from app.js's IIFE-local dictionary, but
  // shares the same localStorage key so the language choice stays in sync
  // when navigating between this page and the main device list). ----------

  const SUPPORTED_LANGS = ["de", "en", "en-US", "fr", "es", "pt"];
  const LANG_KEY = "obk_lang";
  const THEME_KEY = "obk_theme";

  const I18N = {
    de: {
      migrateTitle: "ESPHome ↔ OpenBeken Migration",
      backToDevices: "Zurück zur Geräteliste",
      themeToggle: "Hell/Dunkel umschalten",
      migrateWarning: "Experimentelle Funktion. Wähle den Chip/das Board sorgfältig – eine falsche Auswahl kann das Gerät unbrauchbar machen. Halte für den Ernstfall einen UART-Wiederherstellungsweg bereit. Diese Seite schickt niemals selbstständig Firmware an ein Gerät: das UF2 lädst du hier nur herunter und spielst es manuell über ESPHomes eigene OTA-Funktion auf; dafür muss in der Geräte-YAML bereits \"ota: platform: web_server\" (bzw. \"web_server:\") eingerichtet sein – falls nicht, musst du das Gerät zuerst einmal ganz normal per ESPHome aktualisieren, um diese Funktion zu ergänzen.",
      uf2Header: "1. OpenBeken-Firmware als UF2 erzeugen",
      uf2Intro: "Wähle den Chip bzw. das Modul deines ESPHome-Geräts. Das Add-on lädt die passende OpenBeken-Firmware des aktuellen Release herunter und verpackt sie als UF2-Datei, die du anschließend über ESPHomes eigene Update-Oberfläche manuell hochlädst.",
      uf2Build: "UF2 erzeugen",
      uf2Download: "UF2 herunterladen",
      uf2Building: "Erzeuge UF2-Datei…",
      uf2Done: "Fertig: {filename} (Firmware {fwName} {fwVersion}).",
      uf2Error: "Fehler: {msg}",
      uf2NoBoard: "Bitte zuerst ein Board auswählen.",
      uf2Instructions: [
        "Falls noch nicht geschehen: In der ESPHome-YAML \"web_server:\" sowie \"ota: platform: web_server\" ergänzen und das Gerät einmal ganz normal per ESPHome aktualisieren, damit es diese Funktion bekommt.",
        "UF2-Datei oben herunterladen.",
        "Im ESPHome-Dashboard beim Gerät auf \"Install\" bzw. \"Update\" klicken und die heruntergeladene .uf2-Datei als lokale Datei hochladen (oder direkt http://<Geräte-IP>/update im Browser öffnen).",
        "Warten, bis das Gerät neu gestartet ist – es läuft danach mit OpenBeken-Firmware und sollte in der Geräteliste dieses Add-ons per Scan auffindbar sein.",
      ],
      boardGroupGeneric: "Generisch (empfohlen)",
      boardGroupSpecific: "Spezifisches Modul",
      loadBoardsError: "Board-Liste konnte nicht geladen werden: {msg}",
      yamlHeader: "2. ESPHome-YAML einlesen",
      yamlIntro: "Lade die YAML-Konfiguration, mit der dieses Gerät aktuell unter ESPHome läuft, hoch. Die Seite erkennt gpio-basierte Relais, Taster und Lichter/Ausgänge und übersetzt sie in die entsprechenden OpenBeken-Befehle.",
      yamlAnalyze: "Analysieren",
      yamlAnalyzing: "Analysiere…",
      yamlError: "Fehler: {msg}",
      yamlNoFile: "Bitte zuerst eine YAML-Datei auswählen.",
      yamlNoPinsFound: "Es wurden keine Pins gefunden.",
      colPin: "Pin",
      colRole: "Rolle",
      colChannel: "Kanal",
      colSource: "Quelle",
      yamlWarningsTitle: "Nicht automatisch übersetzt:",
      yamlCommandsLabel: "Generierte Befehle (bei Bedarf vor dem Senden anpassen):",
      copyToClipboard: "In Zwischenablage kopieren",
      copyDone: "Kopiert!",
      copyFailed: "Kopieren fehlgeschlagen - bitte manuell markieren und kopieren.",
      applyHeader: "3. Konfiguration an frisch geflashtes Gerät senden",
      applyIntro: "Sobald das Gerät mit OpenBeken läuft und im Netzwerk erreichbar ist, kannst du die oben generierten (oder von Hand angepassten) Befehle direkt an seine IP-Adresse senden.",
      applyIpPlaceholder: "IP-Adresse (z. B. 192.168.1.50)",
      applyPasswordPlaceholder: "Admin-Passwort (falls gesetzt)",
      applySend: "Senden",
      applySending: "Sende Befehle…",
      applyIpMissing: "Bitte eine IP-Adresse angeben.",
      applyNoCommands: "Keine Befehle zum Senden vorhanden.",
      applyError: "Fehler: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Fehlgeschlagen ({error}): {command}",
    },
    en: {
      migrateTitle: "ESPHome ↔ OpenBeken Migration",
      backToDevices: "Back to device list",
      themeToggle: "Toggle light/dark mode",
      migrateWarning: "Experimental feature. Choose the chip/board carefully - the wrong choice can make the device unusable. Keep a UART recovery path ready just in case. This page never pushes firmware to a device on its own: you download the UF2 here and upload it manually through ESPHome's own OTA feature; that requires \"ota: platform: web_server\" (and \"web_server:\") to already be set up in the device's YAML - if it isn't, update the device once normally through ESPHome first to add that.",
      uf2Header: "1. Build OpenBeken firmware as a UF2",
      uf2Intro: "Choose the chip/module of your ESPHome device. The add-on downloads the matching OpenBeken firmware from the current release and packages it as a UF2 file, which you then upload manually through ESPHome's own update page.",
      uf2Build: "Build UF2",
      uf2Download: "Download UF2",
      uf2Building: "Building UF2 file…",
      uf2Done: "Done: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Error: {msg}",
      uf2NoBoard: "Please choose a board first.",
      uf2Instructions: [
        "If you haven't already: add \"web_server:\" and \"ota: platform: web_server\" to the ESPHome YAML and update the device once normally through ESPHome so it gets that feature.",
        "Download the UF2 file above.",
        "In the ESPHome dashboard, click \"Install\"/\"Update\" for the device and upload the downloaded .uf2 as a local file (or open http://<device-ip>/update directly in your browser).",
        "Wait for the device to reboot - it now runs OpenBeken firmware and should be discoverable via this add-on's network scan.",
      ],
      boardGroupGeneric: "Generic (recommended)",
      boardGroupSpecific: "Specific module",
      loadBoardsError: "Could not load the board list: {msg}",
      yamlHeader: "2. Read an ESPHome YAML",
      yamlIntro: "Upload the YAML config this device currently runs under ESPHome. The page detects gpio-based relays, buttons and lights/outputs and translates them into the matching OpenBeken commands.",
      yamlAnalyze: "Analyze",
      yamlAnalyzing: "Analyzing…",
      yamlError: "Error: {msg}",
      yamlNoFile: "Please choose a YAML file first.",
      yamlNoPinsFound: "No pins were found.",
      colPin: "Pin",
      colRole: "Role",
      colChannel: "Channel",
      colSource: "Source",
      yamlWarningsTitle: "Not translated automatically:",
      yamlCommandsLabel: "Generated commands (edit if needed before sending):",
      copyToClipboard: "Copy to clipboard",
      copyDone: "Copied!",
      copyFailed: "Copy failed - please select and copy manually.",
      applyHeader: "3. Send configuration to the freshly flashed device",
      applyIntro: "Once the device is running OpenBeken and reachable on the network, you can send the commands generated above (or edited by hand) straight to its IP address.",
      applyIpPlaceholder: "IP address (e.g. 192.168.1.50)",
      applyPasswordPlaceholder: "Admin password (if set)",
      applySend: "Send",
      applySending: "Sending commands…",
      applyIpMissing: "Please enter an IP address.",
      applyNoCommands: "No commands to send.",
      applyError: "Error: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Failed ({error}): {command}",
    },
    fr: {
      migrateTitle: "Migration ESPHome ↔ OpenBeken",
      backToDevices: "Retour à la liste des appareils",
      themeToggle: "Basculer le mode clair/sombre",
      migrateWarning: "Fonctionnalité expérimentale. Choisis la puce/carte avec soin - un mauvais choix peut rendre l'appareil inutilisable. Garde une solution de récupération UART sous la main au cas où. Cette page n'envoie jamais elle-même de firmware à un appareil : tu télécharges ici le UF2 et le mets à jour manuellement via la fonction OTA propre à ESPHome ; cela suppose que \"ota: platform: web_server\" (et \"web_server:\") soit déjà configuré dans la YAML de l'appareil - sinon, mets d'abord l'appareil à jour normalement via ESPHome pour ajouter cette fonction.",
      uf2Header: "1. Générer le firmware OpenBeken en UF2",
      uf2Intro: "Choisis la puce/le module de ton appareil ESPHome. L'add-on télécharge le firmware OpenBeken correspondant à la release actuelle et le convertit en fichier UF2, que tu téléverses ensuite manuellement via la page de mise à jour d'ESPHome.",
      uf2Build: "Générer le UF2",
      uf2Download: "Télécharger le UF2",
      uf2Building: "Génération du fichier UF2…",
      uf2Done: "Terminé : {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Erreur : {msg}",
      uf2NoBoard: "Choisis d'abord une carte.",
      uf2Instructions: [
        "Si ce n'est pas déjà fait : ajoute \"web_server:\" et \"ota: platform: web_server\" à la YAML ESPHome et mets l'appareil à jour une fois normalement via ESPHome pour qu'il obtienne cette fonction.",
        "Télécharge le fichier UF2 ci-dessus.",
        "Dans le tableau de bord ESPHome, clique sur \"Install\"/\"Update\" pour l'appareil et téléverse le fichier .uf2 téléchargé comme fichier local (ou ouvre directement http://<ip-appareil>/update dans ton navigateur).",
        "Attends que l'appareil redémarre - il fonctionne désormais avec le firmware OpenBeken et devrait être détectable via le scan réseau de cet add-on.",
      ],
      boardGroupGeneric: "Générique (recommandé)",
      boardGroupSpecific: "Module spécifique",
      loadBoardsError: "Impossible de charger la liste des cartes : {msg}",
      yamlHeader: "2. Lire une YAML ESPHome",
      yamlIntro: "Téléverse la configuration YAML avec laquelle cet appareil fonctionne actuellement sous ESPHome. La page détecte les relais, boutons et lumières/sorties basés sur gpio et les traduit en commandes OpenBeken correspondantes.",
      yamlAnalyze: "Analyser",
      yamlAnalyzing: "Analyse…",
      yamlError: "Erreur : {msg}",
      yamlNoFile: "Choisis d'abord un fichier YAML.",
      yamlNoPinsFound: "Aucune broche n'a été trouvée.",
      colPin: "Broche",
      colRole: "Rôle",
      colChannel: "Canal",
      colSource: "Source",
      yamlWarningsTitle: "Non traduit automatiquement :",
      yamlCommandsLabel: "Commandes générées (à modifier si besoin avant l'envoi) :",
      copyToClipboard: "Copier dans le presse-papiers",
      copyDone: "Copié !",
      copyFailed: "Échec de la copie - sélectionne et copie manuellement.",
      applyHeader: "3. Envoyer la configuration à l'appareil fraîchement flashé",
      applyIntro: "Une fois que l'appareil fonctionne avec OpenBeken et est joignable sur le réseau, tu peux envoyer les commandes générées ci-dessus (ou modifiées à la main) directement à son adresse IP.",
      applyIpPlaceholder: "Adresse IP (p. ex. 192.168.1.50)",
      applyPasswordPlaceholder: "Mot de passe admin (si défini)",
      applySend: "Envoyer",
      applySending: "Envoi des commandes…",
      applyIpMissing: "Merci d'indiquer une adresse IP.",
      applyNoCommands: "Aucune commande à envoyer.",
      applyError: "Erreur : {msg}",
      resultOk: "OK : {command}",
      resultFail: "Échec ({error}) : {command}",
    },
    es: {
      migrateTitle: "Migración ESPHome ↔ OpenBeken",
      backToDevices: "Volver a la lista de dispositivos",
      themeToggle: "Cambiar modo claro/oscuro",
      migrateWarning: "Función experimental. Elige el chip/la placa con cuidado - una elección incorrecta puede dejar el dispositivo inutilizable. Ten a mano una vía de recuperación por UART por si acaso. Esta página nunca envía firmware a un dispositivo por sí sola: aquí descargas el UF2 y lo instalas manualmente mediante la propia función OTA de ESPHome; para ello, \"ota: platform: web_server\" (y \"web_server:\") ya debe estar configurado en la YAML del dispositivo - si no lo está, actualiza primero el dispositivo normalmente con ESPHome para añadir esa función.",
      uf2Header: "1. Generar el firmware de OpenBeken como UF2",
      uf2Intro: "Elige el chip o módulo de tu dispositivo ESPHome. El add-on descarga el firmware de OpenBeken correspondiente de la release actual y lo empaqueta como archivo UF2, que después subes manualmente mediante la propia página de actualización de ESPHome.",
      uf2Build: "Generar UF2",
      uf2Download: "Descargar UF2",
      uf2Building: "Generando archivo UF2…",
      uf2Done: "Listo: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Error: {msg}",
      uf2NoBoard: "Primero elige una placa.",
      uf2Instructions: [
        "Si aún no lo has hecho: añade \"web_server:\" y \"ota: platform: web_server\" a la YAML de ESPHome y actualiza el dispositivo una vez con normalidad mediante ESPHome para que obtenga esa función.",
        "Descarga el archivo UF2 de arriba.",
        "En el panel de ESPHome, haz clic en \"Install\"/\"Update\" para el dispositivo y sube el .uf2 descargado como archivo local (o abre directamente http://<ip-dispositivo>/update en tu navegador).",
        "Espera a que el dispositivo se reinicie - ahora funciona con firmware de OpenBeken y debería poder encontrarse mediante el escaneo de red de este add-on.",
      ],
      boardGroupGeneric: "Genérico (recomendado)",
      boardGroupSpecific: "Módulo específico",
      loadBoardsError: "No se pudo cargar la lista de placas: {msg}",
      yamlHeader: "2. Leer una YAML de ESPHome",
      yamlIntro: "Sube la configuración YAML con la que este dispositivo funciona actualmente en ESPHome. La página detecta relés, botones y luces/salidas basados en gpio y los traduce a los comandos de OpenBeken correspondientes.",
      yamlAnalyze: "Analizar",
      yamlAnalyzing: "Analizando…",
      yamlError: "Error: {msg}",
      yamlNoFile: "Primero elige un archivo YAML.",
      yamlNoPinsFound: "No se encontraron pines.",
      colPin: "Pin",
      colRole: "Rol",
      colChannel: "Canal",
      colSource: "Fuente",
      yamlWarningsTitle: "No traducido automáticamente:",
      yamlCommandsLabel: "Comandos generados (ajusta si es necesario antes de enviar):",
      copyToClipboard: "Copiar al portapapeles",
      copyDone: "¡Copiado!",
      copyFailed: "Error al copiar - selecciona y copia manualmente.",
      applyHeader: "3. Enviar configuración al dispositivo recién flasheado",
      applyIntro: "Una vez que el dispositivo funcione con OpenBeken y sea accesible en la red, puedes enviar los comandos generados arriba (o editados a mano) directamente a su dirección IP.",
      applyIpPlaceholder: "Dirección IP (p. ej. 192.168.1.50)",
      applyPasswordPlaceholder: "Contraseña de administrador (si está definida)",
      applySend: "Enviar",
      applySending: "Enviando comandos…",
      applyIpMissing: "Introduce una dirección IP.",
      applyNoCommands: "No hay comandos para enviar.",
      applyError: "Error: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Fallido ({error}): {command}",
    },
    pt: {
      migrateTitle: "Migração ESPHome ↔ OpenBeken",
      backToDevices: "Voltar à lista de dispositivos",
      themeToggle: "Alternar modo claro/escuro",
      migrateWarning: "Funcionalidade experimental. Escolhe o chip/a placa com cuidado - uma escolha errada pode tornar o dispositivo inutilizável. Mantém uma via de recuperação por UART preparada só por precaução. Esta página nunca envia firmware para um dispositivo sozinha: aqui descarregas o UF2 e instalas-o manualmente através da própria função OTA do ESPHome; para isso, \"ota: platform: web_server\" (e \"web_server:\") já deve estar configurado na YAML do dispositivo - se não estiver, atualiza primeiro o dispositivo normalmente com o ESPHome para adicionar essa função.",
      uf2Header: "1. Gerar o firmware do OpenBeken como UF2",
      uf2Intro: "Escolhe o chip ou módulo do teu dispositivo ESPHome. O add-on descarrega o firmware do OpenBeken correspondente à release atual e empacota-o como um ficheiro UF2, que depois carregas manualmente através da própria página de atualização do ESPHome.",
      uf2Build: "Gerar UF2",
      uf2Download: "Descarregar UF2",
      uf2Building: "A gerar ficheiro UF2…",
      uf2Done: "Concluído: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Erro: {msg}",
      uf2NoBoard: "Escolhe primeiro uma placa.",
      uf2Instructions: [
        "Se ainda não o fizeste: adiciona \"web_server:\" e \"ota: platform: web_server\" à YAML do ESPHome e atualiza o dispositivo uma vez normalmente através do ESPHome para que obtenha essa função.",
        "Descarrega o ficheiro UF2 acima.",
        "No painel do ESPHome, clica em \"Install\"/\"Update\" para o dispositivo e carrega o .uf2 descarregado como ficheiro local (ou abre diretamente http://<ip-do-dispositivo>/update no teu navegador).",
        "Espera que o dispositivo reinicie - agora corre com firmware do OpenBeken e deve ser detetável através da pesquisa de rede deste add-on.",
      ],
      boardGroupGeneric: "Genérico (recomendado)",
      boardGroupSpecific: "Módulo específico",
      loadBoardsError: "Não foi possível carregar a lista de placas: {msg}",
      yamlHeader: "2. Ler uma YAML do ESPHome",
      yamlIntro: "Carrega a configuração YAML com que este dispositivo funciona atualmente no ESPHome. A página deteta relés, botões e luzes/saídas baseados em gpio e traduz-os para os comandos correspondentes do OpenBeken.",
      yamlAnalyze: "Analisar",
      yamlAnalyzing: "A analisar…",
      yamlError: "Erro: {msg}",
      yamlNoFile: "Escolhe primeiro um ficheiro YAML.",
      yamlNoPinsFound: "Não foram encontrados pinos.",
      colPin: "Pino",
      colRole: "Função",
      colChannel: "Canal",
      colSource: "Origem",
      yamlWarningsTitle: "Não traduzido automaticamente:",
      yamlCommandsLabel: "Comandos gerados (ajusta se necessário antes de enviar):",
      copyToClipboard: "Copiar para a área de transferência",
      copyDone: "Copiado!",
      copyFailed: "Falha ao copiar - seleciona e copia manualmente.",
      applyHeader: "3. Enviar configuração para o dispositivo recém-flashado",
      applyIntro: "Assim que o dispositivo estiver a correr OpenBeken e acessível na rede, podes enviar os comandos gerados acima (ou editados manualmente) diretamente para o seu endereço IP.",
      applyIpPlaceholder: "Endereço IP (p. ex. 192.168.1.50)",
      applyPasswordPlaceholder: "Palavra-passe de administrador (se definida)",
      applySend: "Enviar",
      applySending: "A enviar comandos…",
      applyIpMissing: "Indica um endereço IP.",
      applyNoCommands: "Não há comandos para enviar.",
      applyError: "Erro: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Falhou ({error}): {command}",
    },
  };
  I18N["en-US"] = I18N.en;

  function getLang() {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
    } catch (e) { /* localStorage unavailable */ }
    return "de";
  }

  function t(key, vars) {
    const dict = I18N[getLang()] || I18N.de;
    let s = dict[key];
    if (s === undefined) return key;
    if (Array.isArray(s)) return s;
    if (vars) {
      for (const k in vars) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]);
      }
    }
    return s;
  }

  function applyStaticTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const val = t(el.getAttribute("data-i18n"));
      if (!Array.isArray(val)) el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const val = t(el.getAttribute("data-i18n-html"));
      const items = Array.isArray(val) ? val : [val];
      el.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    });
    document.title = `OpenBK7231T Manager - ${t("migrateTitle")}`;
  }

  const langSelect = $("#lang-select");
  if (langSelect) {
    langSelect.value = getLang();
    langSelect.addEventListener("change", () => {
      try { localStorage.setItem(LANG_KEY, langSelect.value); } catch (e) { /* ignore */ }
      applyStaticTranslations();
      populateBoards();
    });
  }
  applyStaticTranslations();

  // --- Theme (kept consistent with the main page's obk_theme key) --------

  const themeToggleBtn = $("#btn-theme-toggle");
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function currentEffectiveTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    if (stored === "light" || stored === "dark") return stored;
    return systemPrefersDark() ? "dark" : "light";
  }
  function applyTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
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
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      applyTheme();
    });
  }
  try { applyTheme(); } catch (e) { /* ignore */ }

  // --- 1. UF2 builder -------------------------------------------------------

  const boardSelect = $("#board-select");
  const uf2Status = $("#uf2-status");
  const uf2Result = $("#uf2-result");
  const uf2DownloadLink = $("#uf2-download-link");

  async function populateBoards() {
    const previousValue = boardSelect.value;
    try {
      const boards = await api("GET", "api/migrate/boards");
      const byFamily = {};
      boards.forEach((b) => { (byFamily[b.family] = byFamily[b.family] || []).push(b); });
      boardSelect.innerHTML = "";
      Object.keys(byFamily).sort().forEach((family) => {
        const generic = byFamily[family].filter((b) => b.generic);
        const specific = byFamily[family].filter((b) => !b.generic);
        if (generic.length) {
          const grp = document.createElement("optgroup");
          grp.label = `${family} - ${t("boardGroupGeneric")}`;
          generic.forEach((b) => grp.appendChild(new Option(b.title, b.name)));
          boardSelect.appendChild(grp);
        }
        if (specific.length) {
          const grp = document.createElement("optgroup");
          grp.label = `${family} - ${t("boardGroupSpecific")}`;
          specific.forEach((b) => grp.appendChild(new Option(b.title, b.name)));
          boardSelect.appendChild(grp);
        }
      });
      if (previousValue) boardSelect.value = previousValue;
    } catch (e) {
      uf2Status.textContent = t("loadBoardsError", { msg: e.message });
    }
  }
  populateBoards();

  $("#btn-build-uf2").addEventListener("click", async (ev) => {
    if (!boardSelect.value) {
      uf2Status.textContent = t("uf2NoBoard");
      return;
    }
    uf2Result.hidden = true;
    uf2Status.textContent = t("uf2Building");
    ev.target.disabled = true;
    try {
      const data = await api("POST", "api/migrate/uf2", { board: boardSelect.value });
      uf2Status.textContent = t("uf2Done", { filename: data.filename, fwName: data.fw_name, fwVersion: data.fw_version });
      uf2DownloadLink.href = apiUrl(data.download_url);
      uf2Result.hidden = false;
    } catch (e) {
      uf2Status.textContent = t("uf2Error", { msg: e.message });
    } finally {
      ev.target.disabled = false;
    }
  });

  // --- 2. ESPHome YAML parser -------------------------------------------

  const yamlStatus = $("#yaml-status");
  const yamlResult = $("#yaml-result");
  const pinRows = $("#pin-rows");
  const yamlWarningsTitle = $("#yaml-warnings-title");
  const yamlWarnings = $("#yaml-warnings");
  const commandsTextarea = $("#commands-textarea");

  $("#btn-parse-yaml").addEventListener("click", async (ev) => {
    const fileInput = $("#yaml-file");
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      yamlStatus.textContent = t("yamlNoFile");
      return;
    }
    yamlResult.hidden = true;
    yamlStatus.textContent = t("yamlAnalyzing");
    ev.target.disabled = true;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(apiUrl("api/migrate/parse-yaml"), { method: "POST", body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

      pinRows.innerHTML = data.pins.map((p) => `
        <tr>
          <td>${escapeHtml(p.pin)}</td>
          <td>${escapeHtml(p.role)}</td>
          <td>${escapeHtml(p.channel)}</td>
          <td>${escapeHtml(p.source)}</td>
        </tr>`).join("") || `<tr><td colspan="4" class="empty-row">${escapeHtml(t("yamlNoPinsFound"))}</td></tr>`;

      if (data.warnings && data.warnings.length) {
        yamlWarningsTitle.hidden = false;
        yamlWarnings.innerHTML = data.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("");
      } else {
        yamlWarningsTitle.hidden = true;
        yamlWarnings.innerHTML = "";
      }

      commandsTextarea.value = (data.commands || []).join("\n");
      yamlStatus.textContent = "";
      yamlResult.hidden = false;
    } catch (e) {
      yamlStatus.textContent = t("yamlError", { msg: e.message });
    } finally {
      ev.target.disabled = false;
    }
  });

  $("#btn-copy-commands").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(commandsTextarea.value);
      yamlStatus.textContent = t("copyDone");
    } catch (e) {
      yamlStatus.textContent = t("copyFailed");
      commandsTextarea.select();
    }
  });

  // --- 3. Apply config to a device ---------------------------------------

  const applyResults = $("#apply-results");

  $("#btn-apply-config").addEventListener("click", async (ev) => {
    const ip = $("#apply-ip").value.trim();
    const password = $("#apply-password").value || undefined;
    const commands = commandsTextarea.value.split("\n").map((l) => l.trim()).filter(Boolean);
    applyResults.innerHTML = "";
    if (!ip) {
      applyResults.innerHTML = `<li class="fail">${escapeHtml(t("applyIpMissing"))}</li>`;
      return;
    }
    if (!commands.length) {
      applyResults.innerHTML = `<li class="fail">${escapeHtml(t("applyNoCommands"))}</li>`;
      return;
    }
    ev.target.disabled = true;
    applyResults.innerHTML = `<li class="muted">${escapeHtml(t("applySending"))}</li>`;
    try {
      const data = await api("POST", "api/migrate/apply-config", { ip, password, commands });
      applyResults.innerHTML = data.results.map((r) => {
        const cls = r.ok ? "ok" : "fail";
        const text = r.ok ? t("resultOk", { command: r.command }) : t("resultFail", { command: r.command, error: r.error });
        return `<li class="${cls}">${escapeHtml(text)}</li>`;
      }).join("");
    } catch (e) {
      applyResults.innerHTML = `<li class="fail">${escapeHtml(t("applyError", { msg: e.message }))}</li>`;
    } finally {
      ev.target.disabled = false;
    }
  });
})();
