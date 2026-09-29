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

  const SUPPORTED_LANGS = ["de", "en", "en-US", "bg", "hr", "cs", "da", "nl", "et", "fi", "fr", "el", "hu", "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv"];
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
    bg: {
      migrateTitle: "Миграция ESPHome ↔ OpenBeken",
      backToDevices: "Обратно към списъка с устройства",
      themeToggle: "Превключване на светла/тъмна тема",
      migrateWarning: "Експериментална функция. Изберете чипа/платката внимателно - грешен избор може да направи устройството неизползваемо. Дръжте готов начин за възстановяване през UART за всеки случай. Тази страница никога сама не изпраща фърмуер към устройство: тук изтегляте UF2 файла и го качвате ръчно чрез собствената OTA функция на ESPHome; за целта е нужно \"ota: platform: web_server\" (и \"web_server:\") вече да са настроени в YAML файла на устройството - ако не са, първо актуализирайте устройството веднъж нормално през ESPHome, за да се добави това.",
      uf2Header: "1. Създаване на фърмуер OpenBeken като UF2",
      uf2Intro: "Изберете чипа/модула на своето устройство с ESPHome. Добавката изтегля съответния фърмуер OpenBeken от текущата версия и го пакетира като UF2 файл, който след това качвате ръчно чрез собствената страница за актуализация на ESPHome.",
      uf2Build: "Създай UF2",
      uf2Download: "Изтегли UF2",
      uf2Building: "Създаване на UF2 файл…",
      uf2Done: "Готово: {filename} (фърмуер {fwName} {fwVersion}).",
      uf2Error: "Грешка: {msg}",
      uf2NoBoard: "Моля, първо изберете платка.",
      uf2Instructions: [
      "Ако все още не сте го направили: добавете \"web_server:\" и \"ota: platform: web_server\" в YAML файла на ESPHome и актуализирайте устройството веднъж по обичайния начин през ESPHome, за да получи тази функция.",
      "Изтеглете UF2 файла по-горе.",
      "В таблото на ESPHome кликнете \"Install\"/\"Update\" за устройството и качете изтегления .uf2 като локален файл (или отворете директно http://<device-ip>/update в браузъра си).",
      "Изчакайте устройството да се рестартира - вече работи с фърмуер OpenBeken и трябва да бъде откриваемо чрез сканирането на мрежата на тази добавка.",
    ],
      boardGroupGeneric: "Общ (препоръчително)",
      boardGroupSpecific: "Конкретен модул",
      loadBoardsError: "Списъкът с платки не можа да бъде зареден: {msg}",
      yamlHeader: "2. Прочитане на YAML файл на ESPHome",
      yamlIntro: "Качете YAML конфигурацията, с която това устройство в момента работи под ESPHome. Страницата открива релета, бутони и светлини/изходи, базирани на GPIO, и ги превежда в съответните команди на OpenBeken.",
      yamlAnalyze: "Анализирай",
      yamlAnalyzing: "Анализиране…",
      yamlError: "Грешка: {msg}",
      yamlNoFile: "Моля, първо изберете YAML файл.",
      yamlNoPinsFound: "Не бяха намерени пинове.",
      colPin: "Пин",
      colRole: "Роля",
      colChannel: "Канал",
      colSource: "Източник",
      yamlWarningsTitle: "Не са преведени автоматично:",
      yamlCommandsLabel: "Генерирани команди (редактирайте при нужда преди изпращане):",
      copyToClipboard: "Копиране в клипборда",
      copyDone: "Копирано!",
      copyFailed: "Копирането бе неуспешно - моля, изберете и копирайте ръчно.",
      applyHeader: "3. Изпращане на конфигурация към току-що флашнатото устройство",
      applyIntro: "След като устройството работи с OpenBeken и е достъпно в мрежата, можете да изпратите генерираните по-горе команди (или ръчно редактирани) директно към неговия IP адрес.",
      applyIpPlaceholder: "IP адрес (напр. 192.168.1.50)",
      applyPasswordPlaceholder: "Администраторска парола (ако е зададена)",
      applySend: "Изпрати",
      applySending: "Изпращане на команди…",
      applyIpMissing: "Моля, въведете IP адрес.",
      applyNoCommands: "Няма команди за изпращане.",
      applyError: "Грешка: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Неуспешно ({error}): {command}",
    },
    hr: {
      migrateTitle: "Migracija ESPHome ↔ OpenBeken",
      backToDevices: "Natrag na popis uređaja",
      themeToggle: "Prebaci svijetli/tamni način rada",
      migrateWarning: "Eksperimentalna značajka. Pažljivo odaberite čip/pločicu - pogrešan izbor može učiniti uređaj neupotrebljivim. Za svaki slučaj pripremite način oporavka putem UART-a. Ova stranica nikada sama ne šalje firmver na uređaj: ovdje preuzimate UF2 datoteku i ručno je učitavate putem vlastite OTA značajke ESPHomea; za to je potrebno da \"ota: platform: web_server\" (i \"web_server:\") već budu postavljeni u YAML datoteci uređaja - ako nisu, prvo jednom ažurirajte uređaj na uobičajen način putem ESPHomea kako biste to dodali.",
      uf2Header: "1. Izradite firmver OpenBeken kao UF2",
      uf2Intro: "Odaberite čip/modul svog ESPHome uređaja. Dodatak preuzima odgovarajući firmver OpenBeken iz trenutnog izdanja i pakira ga kao UF2 datoteku, koju zatim ručno učitavate putem vlastite stranice za ažuriranje ESPHomea.",
      uf2Build: "Izradi UF2",
      uf2Download: "Preuzmi UF2",
      uf2Building: "Izrada UF2 datoteke…",
      uf2Done: "Gotovo: {filename} (firmver {fwName} {fwVersion}).",
      uf2Error: "Pogreška: {msg}",
      uf2NoBoard: "Molimo prvo odaberite pločicu.",
      uf2Instructions: [
      "Ako još niste: dodajte \"web_server:\" i \"ota: platform: web_server\" u ESPHome YAML i jednom ažurirajte uređaj na uobičajen način putem ESPHomea kako bi dobio tu značajku.",
      "Preuzmite UF2 datoteku iznad.",
      "Na ESPHome nadzornoj ploči kliknite \"Install\"/\"Update\" za uređaj i učitajte preuzeti .uf2 kao lokalnu datoteku (ili izravno otvorite http://<device-ip>/update u svom pregledniku).",
      "Pričekajte da se uređaj ponovno pokrene - sada radi s firmverom OpenBeken i trebao bi biti otkriven putem skeniranja mreže ovog dodatka.",
    ],
      boardGroupGeneric: "Generički (preporučeno)",
      boardGroupSpecific: "Specifičan modul",
      loadBoardsError: "Popis pločica nije bilo moguće učitati: {msg}",
      yamlHeader: "2. Učitajte ESPHome YAML",
      yamlIntro: "Učitajte YAML konfiguraciju s kojom ovaj uređaj trenutno radi pod ESPHomeom. Stranica prepoznaje releje, tipke i svjetla/izlaze temeljene na GPIO-u i prevodi ih u odgovarajuće OpenBeken naredbe.",
      yamlAnalyze: "Analiziraj",
      yamlAnalyzing: "Analiziranje…",
      yamlError: "Pogreška: {msg}",
      yamlNoFile: "Molimo prvo odaberite YAML datoteku.",
      yamlNoPinsFound: "Nisu pronađeni pinovi.",
      colPin: "Pin",
      colRole: "Uloga",
      colChannel: "Kanal",
      colSource: "Izvor",
      yamlWarningsTitle: "Nije automatski prevedeno:",
      yamlCommandsLabel: "Generirane naredbe (uredite prema potrebi prije slanja):",
      copyToClipboard: "Kopiraj u međuspremnik",
      copyDone: "Kopirano!",
      copyFailed: "Kopiranje nije uspjelo - odaberite i kopirajte ručno.",
      applyHeader: "3. Pošaljite konfiguraciju na tek flashani uređaj",
      applyIntro: "Kada uređaj radi s OpenBekenom i dostupan je na mreži, generirane naredbe iznad (ili ručno uređene) možete poslati izravno na njegovu IP adresu.",
      applyIpPlaceholder: "IP adresa (npr. 192.168.1.50)",
      applyPasswordPlaceholder: "Administratorska lozinka (ako je postavljena)",
      applySend: "Pošalji",
      applySending: "Slanje naredbi…",
      applyIpMissing: "Unesite IP adresu.",
      applyNoCommands: "Nema naredbi za slanje.",
      applyError: "Pogreška: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Neuspjelo ({error}): {command}",
    },
    cs: {
      migrateTitle: "Migrace ESPHome ↔ OpenBeken",
      backToDevices: "Zpět na seznam zařízení",
      themeToggle: "Přepnout světlý/tmavý režim",
      migrateWarning: "Experimentální funkce. Vyberte čip/desku pečlivě - špatná volba může zařízení znefunkčnit. Pro jistotu mějte připravenou možnost obnovy přes UART. Tato stránka nikdy sama neodesílá firmware do zařízení: UF2 zde stáhnete a nahrajete ho ručně přes vlastní OTA funkci ESPHome; to vyžaduje, aby v YAML zařízení už bylo nastaveno \"ota: platform: web_server\" (a \"web_server:\") - pokud tomu tak není, nejprve zařízení jednou běžně aktualizujte přes ESPHome, aby tuto funkci získalo.",
      uf2Header: "1. Sestavit firmware OpenBeken jako UF2",
      uf2Intro: "Vyberte čip/modul svého zařízení ESPHome. Doplněk stáhne odpovídající firmware OpenBeken z aktuální verze a zabalí ho do souboru UF2, který poté ručně nahrajete přes vlastní aktualizační stránku ESPHome.",
      uf2Build: "Sestavit UF2",
      uf2Download: "Stáhnout UF2",
      uf2Building: "Sestavování souboru UF2…",
      uf2Done: "Hotovo: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Chyba: {msg}",
      uf2NoBoard: "Nejprve vyberte desku.",
      uf2Instructions: [
      "Pokud jste to ještě neudělali: přidejte \"web_server:\" a \"ota: platform: web_server\" do YAML ESPHome a jednou zařízení běžně aktualizujte přes ESPHome, aby tuto funkci získalo.",
      "Stáhněte soubor UF2 výše.",
      "V dashboardu ESPHome klikněte u zařízení na \"Install\"/\"Update\" a nahrajte stažený soubor .uf2 jako místní soubor (nebo otevřete přímo v prohlížeči http://<device-ip>/update).",
      "Počkejte, až se zařízení restartuje - nyní běží na firmwaru OpenBeken a mělo by být zjistitelné síťovým prohledáváním tohoto doplňku.",
    ],
      boardGroupGeneric: "Obecná (doporučeno)",
      boardGroupSpecific: "Konkrétní modul",
      loadBoardsError: "Seznam desek se nepodařilo načíst: {msg}",
      yamlHeader: "2. Načíst YAML soubor ESPHome",
      yamlIntro: "Nahrajte YAML konfiguraci, se kterou toto zařízení aktuálně běží pod ESPHome. Stránka rozpozná relé, tlačítka a světla/výstupy založené na GPIO a převede je na odpovídající příkazy OpenBeken.",
      yamlAnalyze: "Analyzovat",
      yamlAnalyzing: "Analyzování…",
      yamlError: "Chyba: {msg}",
      yamlNoFile: "Nejprve vyberte soubor YAML.",
      yamlNoPinsFound: "Nebyly nalezeny žádné piny.",
      colPin: "Pin",
      colRole: "Role",
      colChannel: "Kanál",
      colSource: "Zdroj",
      yamlWarningsTitle: "Nepřeloženo automaticky:",
      yamlCommandsLabel: "Vygenerované příkazy (před odesláním je v případě potřeby upravte):",
      copyToClipboard: "Kopírovat do schránky",
      copyDone: "Zkopírováno!",
      copyFailed: "Kopírování se nezdařilo - vyberte a zkopírujte ručně.",
      applyHeader: "3. Odeslat konfiguraci na nově nahrané zařízení",
      applyIntro: "Jakmile zařízení běží na OpenBeken a je dostupné v síti, můžete výše vygenerované příkazy (nebo ručně upravené) odeslat přímo na jeho IP adresu.",
      applyIpPlaceholder: "IP adresa (např. 192.168.1.50)",
      applyPasswordPlaceholder: "Heslo správce (pokud je nastaveno)",
      applySend: "Odeslat",
      applySending: "Odesílání příkazů…",
      applyIpMissing: "Zadejte IP adresu.",
      applyNoCommands: "Žádné příkazy k odeslání.",
      applyError: "Chyba: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Selhalo ({error}): {command}",
    },
    da: {
      migrateTitle: "ESPHome ↔ OpenBeken-migrering",
      backToDevices: "Tilbage til enhedslisten",
      themeToggle: "Skift mellem lys/mørk tilstand",
      migrateWarning: "Eksperimentel funktion. Vælg chip/board omhyggeligt - det forkerte valg kan gøre enheden ubrugelig. Hav en UART-gendannelsesvej klar, bare i tilfælde af. Denne side pusher aldrig selv firmware til en enhed: du downloader UF2-filen her og uploader den manuelt via ESPHomes egen OTA-funktion; det kræver, at \"ota: platform: web_server\" (og \"web_server:\") allerede er sat op i enhedens YAML - hvis ikke, så opdater enheden én gang normalt via ESPHome først for at tilføje det.",
      uf2Header: "1. Byg OpenBeken-firmware som en UF2",
      uf2Intro: "Vælg chip/modul til din ESPHome-enhed. Tilføjelsen downloader den matchende OpenBeken-firmware fra den aktuelle udgivelse og pakker den som en UF2-fil, som du derefter uploader manuelt via ESPHomes egen opdateringsside.",
      uf2Build: "Byg UF2",
      uf2Download: "Download UF2",
      uf2Building: "Bygger UF2-fil…",
      uf2Done: "Færdig: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Fejl: {msg}",
      uf2NoBoard: "Vælg venligst et board først.",
      uf2Instructions: [
      "Hvis du ikke allerede har gjort det: tilføj \"web_server:\" og \"ota: platform: web_server\" til ESPHome-YAML'en, og opdater enheden én gang normalt via ESPHome, så den får den funktion.",
      "Download UF2-filen ovenfor.",
      "Klik på \"Install\"/\"Update\" for enheden i ESPHome-dashboardet, og upload den downloadede .uf2-fil som en lokal fil (eller åbn http://<device-ip>/update direkte i din browser).",
      "Vent på, at enheden genstarter - den kører nu OpenBeken-firmware og bør kunne findes via denne tilføjelses netværksscanning.",
    ],
      boardGroupGeneric: "Generisk (anbefalet)",
      boardGroupSpecific: "Specifikt modul",
      loadBoardsError: "Kunne ikke indlæse boardlisten: {msg}",
      yamlHeader: "2. Læs en ESPHome-YAML",
      yamlIntro: "Upload den YAML-konfiguration, som denne enhed i øjeblikket kører under ESPHome. Siden registrerer gpio-baserede relæer, knapper og lys/udgange og oversætter dem til de tilsvarende OpenBeken-kommandoer.",
      yamlAnalyze: "Analysér",
      yamlAnalyzing: "Analyserer…",
      yamlError: "Fejl: {msg}",
      yamlNoFile: "Vælg venligst en YAML-fil først.",
      yamlNoPinsFound: "Der blev ikke fundet nogen pins.",
      colPin: "Pin",
      colRole: "Rolle",
      colChannel: "Kanal",
      colSource: "Kilde",
      yamlWarningsTitle: "Ikke oversat automatisk:",
      yamlCommandsLabel: "Genererede kommandoer (rediger om nødvendigt, før du sender):",
      copyToClipboard: "Kopiér til udklipsholder",
      copyDone: "Kopieret!",
      copyFailed: "Kopiering mislykkedes - marker og kopiér manuelt.",
      applyHeader: "3. Send konfiguration til den nyligt flashede enhed",
      applyIntro: "Når enheden kører OpenBeken og kan tilgås på netværket, kan du sende de ovenfor genererede kommandoer (eller dem, du har redigeret manuelt) direkte til dens IP-adresse.",
      applyIpPlaceholder: "IP-adresse (f.eks. 192.168.1.50)",
      applyPasswordPlaceholder: "Administratoradgangskode (hvis angivet)",
      applySend: "Send",
      applySending: "Sender kommandoer…",
      applyIpMissing: "Indtast en IP-adresse.",
      applyNoCommands: "Ingen kommandoer at sende.",
      applyError: "Fejl: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Mislykkedes ({error}): {command}",
    },
    nl: {
      migrateTitle: "ESPHome ↔ OpenBeken-migratie",
      backToDevices: "Terug naar apparatenlijst",
      themeToggle: "Licht/donker thema wisselen",
      migrateWarning: "Experimentele functie. Kies de chip/het board zorgvuldig - een verkeerde keuze kan het apparaat onbruikbaar maken. Houd voor de zekerheid een UART-herstelpad achter de hand. Deze pagina pusht nooit zelf firmware naar een apparaat: je downloadt hier de UF2 en uploadt deze handmatig via de eigen OTA-functie van ESPHome; daarvoor moet \"ota: platform: web_server\" (en \"web_server:\") al zijn ingesteld in de YAML van het apparaat - is dat niet zo, werk het apparaat dan eerst eenmaal normaal bij via ESPHome om dat toe te voegen.",
      uf2Header: "1. OpenBeken-firmware bouwen als UF2",
      uf2Intro: "Kies de chip/module van je ESPHome-apparaat. De add-on downloadt de bijbehorende OpenBeken-firmware uit de huidige release en verpakt deze als een UF2-bestand, dat je vervolgens handmatig uploadt via de eigen updatepagina van ESPHome.",
      uf2Build: "UF2 bouwen",
      uf2Download: "UF2 downloaden",
      uf2Building: "UF2-bestand bouwen…",
      uf2Done: "Klaar: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Fout: {msg}",
      uf2NoBoard: "Kies eerst een board.",
      uf2Instructions: [
      "Als je dit nog niet hebt gedaan: voeg \"web_server:\" en \"ota: platform: web_server\" toe aan de ESPHome-YAML en werk het apparaat eenmaal normaal bij via ESPHome, zodat het deze functie krijgt.",
      "Download het UF2-bestand hierboven.",
      "Klik in het ESPHome-dashboard op \"Install\"/\"Update\" voor het apparaat en upload het gedownloade .uf2-bestand als lokaal bestand (of open http://<device-ip>/update rechtstreeks in je browser).",
      "Wacht tot het apparaat opnieuw opstart - het draait nu OpenBeken-firmware en zou vindbaar moeten zijn via de netwerkscan van deze add-on.",
    ],
      boardGroupGeneric: "Generiek (aanbevolen)",
      boardGroupSpecific: "Specifieke module",
      loadBoardsError: "Kan de boardlijst niet laden: {msg}",
      yamlHeader: "2. Een ESPHome-YAML inlezen",
      yamlIntro: "Upload de YAML-configuratie die dit apparaat momenteel onder ESPHome gebruikt. De pagina detecteert gpio-gebaseerde relais, knoppen en lampen/uitgangen en vertaalt ze naar de bijbehorende OpenBeken-commando's.",
      yamlAnalyze: "Analyseren",
      yamlAnalyzing: "Analyseren…",
      yamlError: "Fout: {msg}",
      yamlNoFile: "Kies eerst een YAML-bestand.",
      yamlNoPinsFound: "Er zijn geen pinnen gevonden.",
      colPin: "Pin",
      colRole: "Rol",
      colChannel: "Kanaal",
      colSource: "Bron",
      yamlWarningsTitle: "Niet automatisch vertaald:",
      yamlCommandsLabel: "Gegenereerde commando's (indien nodig aanpassen voor je verstuurt):",
      copyToClipboard: "Kopiëren naar klembord",
      copyDone: "Gekopieerd!",
      copyFailed: "Kopiëren mislukt - selecteer en kopieer handmatig.",
      applyHeader: "3. Configuratie versturen naar het zojuist geflashte apparaat",
      applyIntro: "Zodra het apparaat OpenBeken draait en bereikbaar is op het netwerk, kun je de hierboven gegenereerde (of handmatig aangepaste) commando's rechtstreeks naar het IP-adres sturen.",
      applyIpPlaceholder: "IP-adres (bijv. 192.168.1.50)",
      applyPasswordPlaceholder: "Beheerderswachtwoord (indien ingesteld)",
      applySend: "Versturen",
      applySending: "Commando's versturen…",
      applyIpMissing: "Voer een IP-adres in.",
      applyNoCommands: "Geen commando's om te versturen.",
      applyError: "Fout: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Mislukt ({error}): {command}",
    },
    et: {
      migrateTitle: "ESPHome ↔ OpenBeken migratsioon",
      backToDevices: "Tagasi seadmete loendi juurde",
      themeToggle: "Lülita hele/tume režiim",
      migrateWarning: "Eksperimentaalne funktsioon. Vali kiip/plaat hoolikalt - vale valik võib muuta seadme kasutuskõlbmatuks. Hoia igaks juhuks valmis UART taastetee. See leht ei saada kunagi ise püsivara seadmesse: siin laadid alla UF2 faili ja laadid selle käsitsi üles ESPHome enda OTA funktsiooni kaudu; selleks peab seadme YAML-failis juba olema seadistatud \"ota: platform: web_server\" (ja \"web_server:\") - kui pole, siis värskenda seadet kõigepealt üks kord tavapäraselt ESPHome kaudu, et see lisada.",
      uf2Header: "1. Ehita OpenBekeni püsivara UF2-na",
      uf2Intro: "Vali oma ESPHome seadme kiip/moodul. Lisandmoodul laadib alla sobiva OpenBekeni püsivara praegusest väljalaskest ja pakib selle UF2 failiks, mille laadid seejärel käsitsi üles ESPHome enda värskenduslehe kaudu.",
      uf2Build: "Ehita UF2",
      uf2Download: "Laadi alla UF2",
      uf2Building: "UF2 faili loomine…",
      uf2Done: "Valmis: {filename} (püsivara {fwName} {fwVersion}).",
      uf2Error: "Viga: {msg}",
      uf2NoBoard: "Palun vali kõigepealt plaat.",
      uf2Instructions: [
      "Kui sa pole seda veel teinud: lisa ESPHome YAML-i \"web_server:\" ja \"ota: platform: web_server\" ning värskenda seadet üks kord tavapäraselt ESPHome kaudu, et see funktsioon lisandub.",
      "Laadi ülal olev UF2 fail alla.",
      "Klõpsa ESPHome töölaual seadme juures \"Install\"/\"Update\" ja laadi allalaaditud .uf2 fail üles kohaliku failina (või ava brauseris otse http://<device-ip>/update).",
      "Oota, kuni seade taaskäivitub - see kasutab nüüd OpenBekeni püsivara ja peaks olema leitav selle lisandmooduli võrguskannimise kaudu.",
    ],
      boardGroupGeneric: "Üldine (soovitatud)",
      boardGroupSpecific: "Konkreetne moodul",
      loadBoardsError: "Plaatide loendit ei õnnestunud laadida: {msg}",
      yamlHeader: "2. Loe ESPHome YAML-fail",
      yamlIntro: "Laadi üles YAML-seadistus, mille alusel see seade praegu ESPHome'is töötab. Leht tuvastab GPIO-põhised releed, nupud ja tuled/väljundid ning tõlgib need vastavateks OpenBekeni käskudeks.",
      yamlAnalyze: "Analüüsi",
      yamlAnalyzing: "Analüüsimine…",
      yamlError: "Viga: {msg}",
      yamlNoFile: "Palun vali kõigepealt YAML-fail.",
      yamlNoPinsFound: "Ühtegi pini ei leitud.",
      colPin: "Pin",
      colRole: "Roll",
      colChannel: "Kanal",
      colSource: "Allikas",
      yamlWarningsTitle: "Automaatselt ei tõlgitud:",
      yamlCommandsLabel: "Loodud käsud (vajadusel muuda enne saatmist):",
      copyToClipboard: "Kopeeri lõikelauale",
      copyDone: "Kopeeritud!",
      copyFailed: "Kopeerimine ebaõnnestus - vali ja kopeeri käsitsi.",
      applyHeader: "3. Saada seadistus äsja flashitud seadmesse",
      applyIntro: "Kui seade töötab OpenBekeniga ja on võrgus kättesaadav, saad ülal loodud käsud (või käsitsi muudetud käsud) saata otse selle IP-aadressile.",
      applyIpPlaceholder: "IP-aadress (nt 192.168.1.50)",
      applyPasswordPlaceholder: "Administraatori parool (kui on määratud)",
      applySend: "Saada",
      applySending: "Käskude saatmine…",
      applyIpMissing: "Palun sisesta IP-aadress.",
      applyNoCommands: "Saatmiseks pole ühtegi käsku.",
      applyError: "Viga: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Ebaõnnestus ({error}): {command}",
    },
    fi: {
      migrateTitle: "ESPHome ↔ OpenBeken -migraatio",
      backToDevices: "Takaisin laiteluetteloon",
      themeToggle: "Vaihda vaalea/tumma tila",
      migrateWarning: "Kokeellinen ominaisuus. Valitse piiri/kortti huolellisesti - väärä valinta voi tehdä laitteesta käyttökelvottoman. Pidä UART-palautusreitti valmiina varmuuden vuoksi. Tämä sivu ei koskaan lähetä laiteohjelmistoa laitteelle itsestään: lataat UF2:n täältä ja lataat sen manuaalisesti ESPHomen omalla OTA-ominaisuudella; tämä edellyttää, että \"ota: platform: web_server\" (ja \"web_server:\") on jo asetettu laitteen YAML-tiedostoon - jos ei ole, päivitä laite ensin kerran normaalisti ESPHomen kautta lisätäksesi sen.",
      uf2Header: "1. Rakenna OpenBeken-laiteohjelmisto UF2-tiedostoksi",
      uf2Intro: "Valitse ESPHome-laitteesi piiri/moduuli. Lisäosa lataa vastaavan OpenBeken-laiteohjelmiston nykyisestä julkaisusta ja pakkaa sen UF2-tiedostoksi, jonka lataat sitten manuaalisesti ESPHomen omalla päivityssivulla.",
      uf2Build: "Rakenna UF2",
      uf2Download: "Lataa UF2",
      uf2Building: "Rakennetaan UF2-tiedostoa…",
      uf2Done: "Valmis: {filename} (laiteohjelmisto {fwName} {fwVersion}).",
      uf2Error: "Virhe: {msg}",
      uf2NoBoard: "Valitse ensin kortti.",
      uf2Instructions: [
      "Jos et ole vielä tehnyt niin: lisää \"web_server:\" ja \"ota: platform: web_server\" ESPHome-YAML-tiedostoon ja päivitä laite kerran normaalisti ESPHomen kautta, jotta se saa tämän ominaisuuden.",
      "Lataa yllä oleva UF2-tiedosto.",
      "Napsauta ESPHome-hallintapaneelissa laitteen kohdalla \"Install\"/\"Update\" ja lataa ladattu .uf2-tiedosto paikallisena tiedostona (tai avaa http://<device-ip>/update suoraan selaimessasi).",
      "Odota, että laite käynnistyy uudelleen - se käyttää nyt OpenBeken-laiteohjelmistoa ja sen pitäisi löytyä tämän lisäosan verkkoskannauksella.",
    ],
      boardGroupGeneric: "Yleinen (suositeltu)",
      boardGroupSpecific: "Tietty moduuli",
      loadBoardsError: "Korttiluetteloa ei voitu ladata: {msg}",
      yamlHeader: "2. Lue ESPHome-YAML",
      yamlIntro: "Lataa YAML-määritys, jolla tämä laite tällä hetkellä toimii ESPHomessa. Sivu tunnistaa gpio-pohjaiset releet, painikkeet sekä valot/lähdöt ja muuntaa ne vastaaviksi OpenBeken-komennoiksi.",
      yamlAnalyze: "Analysoi",
      yamlAnalyzing: "Analysoidaan…",
      yamlError: "Virhe: {msg}",
      yamlNoFile: "Valitse ensin YAML-tiedosto.",
      yamlNoPinsFound: "Pinnejä ei löytynyt.",
      colPin: "Pinni",
      colRole: "Rooli",
      colChannel: "Kanava",
      colSource: "Lähde",
      yamlWarningsTitle: "Ei käännetty automaattisesti:",
      yamlCommandsLabel: "Luodut komennot (muokkaa tarvittaessa ennen lähetystä):",
      copyToClipboard: "Kopioi leikepöydälle",
      copyDone: "Kopioitu!",
      copyFailed: "Kopiointi epäonnistui - valitse ja kopioi manuaalisesti.",
      applyHeader: "3. Lähetä määritykset juuri vilkutetulle laitteelle",
      applyIntro: "Kun laite käyttää OpenBekenia ja on tavoitettavissa verkossa, voit lähettää yllä luodut komennot (tai käsin muokatut) suoraan sen IP-osoitteeseen.",
      applyIpPlaceholder: "IP-osoite (esim. 192.168.1.50)",
      applyPasswordPlaceholder: "Järjestelmänvalvojan salasana (jos asetettu)",
      applySend: "Lähetä",
      applySending: "Lähetetään komentoja…",
      applyIpMissing: "Anna IP-osoite.",
      applyNoCommands: "Ei lähetettäviä komentoja.",
      applyError: "Virhe: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Epäonnistui ({error}): {command}",
    },
    el: {
      migrateTitle: "Μετάβαση ESPHome ↔ OpenBeken",
      backToDevices: "Επιστροφή στη λίστα συσκευών",
      themeToggle: "Εναλλαγή φωτεινού/σκοτεινού θέματος",
      migrateWarning: "Πειραματική λειτουργία. Επιλέξτε προσεκτικά το chip/board - μια λάθος επιλογή μπορεί να καταστήσει τη συσκευή αχρησιμοποίητη. Κρατήστε έτοιμη μια διαδρομή ανάκτησης μέσω UART για κάθε ενδεχόμενο. Αυτή η σελίδα δεν στέλνει ποτέ firmware σε μια συσκευή από μόνη της: κατεβάζετε εδώ το UF2 και το ανεβάζετε χειροκίνητα μέσω της δικής της λειτουργίας OTA του ESPHome· αυτό απαιτεί να έχει ήδη ρυθμιστεί \"ota: platform: web_server\" (και \"web_server:\") στο YAML της συσκευής - αν όχι, ενημερώστε πρώτα μία φορά τη συσκευή κανονικά μέσω ESPHome για να το προσθέσετε.",
      uf2Header: "1. Δημιουργία firmware OpenBeken ως UF2",
      uf2Intro: "Επιλέξτε το chip/module της συσκευής ESPHome σας. Το πρόσθετο κατεβάζει το αντίστοιχο firmware OpenBeken από την τρέχουσα έκδοση και το πακετάρει ως αρχείο UF2, το οποίο στη συνέχεια ανεβάζετε χειροκίνητα μέσω της δικής της σελίδας ενημέρωσης του ESPHome.",
      uf2Build: "Δημιουργία UF2",
      uf2Download: "Λήψη UF2",
      uf2Building: "Δημιουργία αρχείου UF2…",
      uf2Done: "Ολοκληρώθηκε: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Σφάλμα: {msg}",
      uf2NoBoard: "Επιλέξτε πρώτα ένα board.",
      uf2Instructions: [
      "Αν δεν το έχετε κάνει ήδη: προσθέστε \"web_server:\" και \"ota: platform: web_server\" στο YAML του ESPHome και ενημερώστε τη συσκευή μία φορά κανονικά μέσω ESPHome ώστε να αποκτήσει αυτή τη λειτουργία.",
      "Κατεβάστε το αρχείο UF2 παραπάνω.",
      "Στο dashboard του ESPHome, κάντε κλικ στο \"Install\"/\"Update\" για τη συσκευή και ανεβάστε το κατεβασμένο .uf2 ως τοπικό αρχείο (ή ανοίξτε απευθείας το http://<device-ip>/update στο πρόγραμμα περιήγησής σας).",
      "Περιμένετε να επανεκκινήσει η συσκευή - πλέον εκτελεί firmware OpenBeken και θα πρέπει να είναι ανιχνεύσιμη μέσω της σάρωσης δικτύου αυτού του πρόσθετου.",
    ],
      boardGroupGeneric: "Γενικό (προτεινόμενο)",
      boardGroupSpecific: "Συγκεκριμένο module",
      loadBoardsError: "Δεν ήταν δυνατή η φόρτωση της λίστας boards: {msg}",
      yamlHeader: "2. Ανάγνωση ενός YAML του ESPHome",
      yamlIntro: "Ανεβάστε τη διαμόρφωση YAML που εκτελεί αυτή τη στιγμή αυτή η συσκευή στο ESPHome. Η σελίδα εντοπίζει ρελέ, κουμπιά και φώτα/εξόδους βασισμένα σε GPIO και τα μεταφράζει στις αντίστοιχες εντολές OpenBeken.",
      yamlAnalyze: "Ανάλυση",
      yamlAnalyzing: "Ανάλυση…",
      yamlError: "Σφάλμα: {msg}",
      yamlNoFile: "Επιλέξτε πρώτα ένα αρχείο YAML.",
      yamlNoPinsFound: "Δεν βρέθηκαν pins.",
      colPin: "Pin",
      colRole: "Ρόλος",
      colChannel: "Κανάλι",
      colSource: "Πηγή",
      yamlWarningsTitle: "Δεν μεταφράστηκαν αυτόματα:",
      yamlCommandsLabel: "Δημιουργημένες εντολές (επεξεργαστείτε αν χρειάζεται πριν την αποστολή):",
      copyToClipboard: "Αντιγραφή στο πρόχειρο",
      copyDone: "Αντιγράφηκε!",
      copyFailed: "Η αντιγραφή απέτυχε - επιλέξτε και αντιγράψτε χειροκίνητα.",
      applyHeader: "3. Αποστολή ρυθμίσεων στη συσκευή που μόλις έγινε flash",
      applyIntro: "Μόλις η συσκευή εκτελεί OpenBeken και είναι προσβάσιμη στο δίκτυο, μπορείτε να στείλετε τις παραπάνω εντολές (ή όσες επεξεργαστήκατε χειροκίνητα) απευθείας στη διεύθυνση IP της.",
      applyIpPlaceholder: "Διεύθυνση IP (π.χ. 192.168.1.50)",
      applyPasswordPlaceholder: "Κωδικός διαχειριστή (εάν έχει οριστεί)",
      applySend: "Αποστολή",
      applySending: "Αποστολή εντολών…",
      applyIpMissing: "Εισαγάγετε μια διεύθυνση IP.",
      applyNoCommands: "Δεν υπάρχουν εντολές προς αποστολή.",
      applyError: "Σφάλμα: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Απέτυχε ({error}): {command}",
    },
    hu: {
      migrateTitle: "ESPHome ↔ OpenBeken migráció",
      backToDevices: "Vissza az eszközlistához",
      themeToggle: "Világos/sötét mód váltása",
      migrateWarning: "Kísérleti funkció. Válaszd ki gondosan a chipet/panelt - a rossz választás használhatatlanná teheti az eszközt. A biztonság kedvéért tarts készenlétben egy UART-alapú helyreállítási lehetőséget. Ez az oldal soha nem küld önállóan firmware-t az eszközre: itt letöltöd az UF2 fájlt, majd manuálisan feltöltöd az ESPHome saját OTA funkciójával; ehhez az szükséges, hogy az eszköz YAML-jában már be legyen állítva az \"ota: platform: web_server\" (és a \"web_server:\") - ha még nincs, először frissítsd az eszközt egyszer a szokásos módon ESPHome-on keresztül, hogy megkapja ezt a funkciót.",
      uf2Header: "1. OpenBeken firmware összeállítása UF2 formátumban",
      uf2Intro: "Válaszd ki az ESPHome-eszközöd chipjét/moduljét. A kiegészítő letölti a megfelelő OpenBeken firmware-t az aktuális kiadásból, és UF2 fájlként csomagolja, amit aztán manuálisan feltölthetsz az ESPHome saját frissítési oldalán.",
      uf2Build: "UF2 összeállítása",
      uf2Download: "UF2 letöltése",
      uf2Building: "UF2 fájl összeállítása…",
      uf2Done: "Kész: {filename} (firmware: {fwName} {fwVersion}).",
      uf2Error: "Hiba: {msg}",
      uf2NoBoard: "Előbb válassz egy panelt.",
      uf2Instructions: [
      "Ha még nem tetted meg: add hozzá a \"web_server:\" és az \"ota: platform: web_server\" sorokat az ESPHome YAML-hoz, majd frissítsd egyszer az eszközt a szokásos módon ESPHome-on keresztül, hogy megkapja ezt a funkciót.",
      "Töltsd le a fenti UF2 fájlt.",
      "Az ESPHome irányítópultján kattints az eszköznél az \"Install\"/\"Update\" gombra, és töltsd fel a letöltött .uf2 fájlt helyi fájlként (vagy nyisd meg közvetlenül a böngészőben a http://<device-ip>/update címet).",
      "Várd meg, amíg az eszköz újraindul - mostantól OpenBeken firmware-t futtat, és a kiegészítő hálózati keresésével megtalálhatónak kell lennie.",
    ],
      boardGroupGeneric: "Általános (ajánlott)",
      boardGroupSpecific: "Konkrét modul",
      loadBoardsError: "A panellista betöltése sikertelen: {msg}",
      yamlHeader: "2. ESPHome YAML beolvasása",
      yamlIntro: "Töltsd fel azt a YAML konfigurációt, amellyel ez az eszköz jelenleg fut ESPHome alatt. Az oldal felismeri a GPIO-alapú reléket, gombokat és lámpákat/kimeneteket, és lefordítja azokat a megfelelő OpenBeken parancsokra.",
      yamlAnalyze: "Elemzés",
      yamlAnalyzing: "Elemzés folyamatban…",
      yamlError: "Hiba: {msg}",
      yamlNoFile: "Előbb válassz egy YAML fájlt.",
      yamlNoPinsFound: "Nem található pin.",
      colPin: "Láb (pin)",
      colRole: "Szerep",
      colChannel: "Csatorna",
      colSource: "Forrás",
      yamlWarningsTitle: "Nem lett automatikusan lefordítva:",
      yamlCommandsLabel: "Generált parancsok (küldés előtt szükség esetén szerkeszd őket):",
      copyToClipboard: "Másolás vágólapra",
      copyDone: "Másolva!",
      copyFailed: "A másolás sikertelen - jelöld ki és másold ki kézzel.",
      applyHeader: "3. Konfiguráció küldése a frissen feltöltött eszközre",
      applyIntro: "Ha az eszköz már OpenBekent futtat, és elérhető a hálózaton, elküldheted a fent generált (vagy kézzel szerkesztett) parancsokat közvetlenül az IP-címére.",
      applyIpPlaceholder: "IP-cím (pl. 192.168.1.50)",
      applyPasswordPlaceholder: "Rendszergazdai jelszó (ha van beállítva)",
      applySend: "Küldés",
      applySending: "Parancsok küldése…",
      applyIpMissing: "Add meg az IP-címet.",
      applyNoCommands: "Nincs küldendő parancs.",
      applyError: "Hiba: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Sikertelen ({error}): {command}",
    },
    ga: {
      migrateTitle: "Imirce ESPHome ↔ OpenBeken",
      backToDevices: "Ar ais go dtí liosta na ngléasanna",
      themeToggle: "Athraigh idir mód geal/dorcha",
      migrateWarning: "Gné thurgnamhach. Roghnaigh an sliseog/bord go cúramach - d'fhéadfadh rogha mhícheart an gléas a fhágáil gan úsáid. Coinnigh bealach téarnaimh UART réidh ar eagla na heagla. Ní chuireann an leathanach seo bogearra frithchuimilte chuig gléas leis féin choíche: íoslódálann tú an UF2 anseo agus uaslódálann tú de láimh é trí ghné OTA ESPHome féin; teastaíonn go mbeadh \"ota: platform: web_server\" (agus \"web_server:\") socraithe cheana féin i YAML an ghléis - mura bhfuil, nuashonraigh an gléas uair amháin ar an ngnáthbhealach trí ESPHome ar dtús chun é sin a chur leis.",
      uf2Header: "1. Tóg an bogearra frithchuimilte OpenBeken mar UF2",
      uf2Intro: "Roghnaigh sliseog/modúl do ghléis ESPHome. Íoslódálann an breiseán an bogearra frithchuimilte OpenBeken comhoiriúnach ón eisiúint reatha agus pacálann é mar chomhad UF2, a uaslódálann tú ansin de láimh trí leathanach nuashonraithe ESPHome féin.",
      uf2Build: "Tóg UF2",
      uf2Download: "Íoslódáil UF2",
      uf2Building: "Comhad UF2 á thógáil…",
      uf2Done: "Críochnaithe: {filename} (bogearra frithchuimilte {fwName} {fwVersion}).",
      uf2Error: "Earráid: {msg}",
      uf2NoBoard: "Roghnaigh bord ar dtús le do thoil.",
      uf2Instructions: [
      "Mura bhfuil déanta agat fós: cuir \"web_server:\" agus \"ota: platform: web_server\" le YAML ESPHome agus nuashonraigh an gléas uair amháin ar an ngnáthbhealach trí ESPHome ionas go bhfaighidh sé an ghné sin.",
      "Íoslódáil an comhad UF2 thuas.",
      "Sa deais ESPHome, cliceáil \"Install\"/\"Update\" don ghléas agus uaslódáil an .uf2 a íoslódáladh mar chomhad áitiúil (nó oscail http://<device-ip>/update go díreach i do bhrabhsálaí).",
      "Fan go n-atosóidh an gléas - reáchtálann sé bogearra frithchuimilte OpenBeken anois agus ba cheart go mbeadh sé infhionnta trí scanadh líonra an bhreiseáin seo.",
    ],
      boardGroupGeneric: "Ginearálta (molta)",
      boardGroupSpecific: "Modúl sonrach",
      loadBoardsError: "Níorbh fhéidir liosta na mbord a lódáil: {msg}",
      yamlHeader: "2. Léigh YAML ESPHome",
      yamlIntro: "Uaslódáil an cumraíocht YAML a bhfuil an gléas seo ag rith faoi ESPHome faoi láthair. Braitheann an leathanach athsholáis, cnaipí agus soilse/aschuir bunaithe ar GPIO agus aistríonn sé iad go dtí na horduithe OpenBeken comhoiriúnacha.",
      yamlAnalyze: "Anailísigh",
      yamlAnalyzing: "Á anailísiú…",
      yamlError: "Earráid: {msg}",
      yamlNoFile: "Roghnaigh comhad YAML ar dtús le do thoil.",
      yamlNoPinsFound: "Níor aimsíodh aon bhioráin.",
      colPin: "Biorán",
      colRole: "Ról",
      colChannel: "Cainéal",
      colSource: "Foinse",
      yamlWarningsTitle: "Nár aistríodh go huathoibríoch:",
      yamlCommandsLabel: "Orduithe ginte (cuir in eagar más gá roimh a seoladh):",
      copyToClipboard: "Cóipeáil chuig an ngearrthaisce",
      copyDone: "Cóipeáilte!",
      copyFailed: "Theip ar an gcóipeáil - roghnaigh agus cóipeáil de láimh le do thoil.",
      applyHeader: "3. Seol an chumraíocht chuig an ngléas atá díreach splanctha",
      applyIntro: "Nuair atá OpenBeken ag rith ar an ngléas agus é inrochtana ar an líonra, is féidir leat na horduithe a ginte thuas (nó a cuireadh in eagar de láimh) a sheoladh díreach chuig a sheoladh IP.",
      applyIpPlaceholder: "Seoladh IP (m.sh. 192.168.1.50)",
      applyPasswordPlaceholder: "Pasfhocal riarthóra (má tá ceann socraithe)",
      applySend: "Seol",
      applySending: "Orduithe á seoladh…",
      applyIpMissing: "Cuir seoladh IP isteach le do thoil.",
      applyNoCommands: "Níl aon orduithe le seoladh.",
      applyError: "Earráid: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Theip ({error}): {command}",
    },
    it: {
      migrateTitle: "Migrazione ESPHome ↔ OpenBeken",
      backToDevices: "Torna all'elenco dei dispositivi",
      themeToggle: "Attiva/disattiva modalità chiara/scura",
      migrateWarning: "Funzione sperimentale. Scegli con attenzione il chip/la scheda: una scelta sbagliata può rendere il dispositivo inutilizzabile. Tieni pronto un percorso di ripristino UART per ogni evenienza. Questa pagina non invia mai il firmware a un dispositivo autonomamente: qui scarichi il file UF2 e lo carichi manualmente tramite la funzione OTA di ESPHome; questo richiede che \"ota: platform: web_server\" (e \"web_server:\") sia già configurato nello YAML del dispositivo - se non lo è, aggiorna prima il dispositivo una volta normalmente tramite ESPHome per aggiungerlo.",
      uf2Header: "1. Crea il firmware OpenBeken come UF2",
      uf2Intro: "Scegli il chip/modulo del tuo dispositivo ESPHome. L'add-on scarica il firmware OpenBeken corrispondente dalla release attuale e lo pacchettizza come file UF2, che dovrai poi caricare manualmente tramite la pagina di aggiornamento di ESPHome.",
      uf2Build: "Crea UF2",
      uf2Download: "Scarica UF2",
      uf2Building: "Creazione del file UF2…",
      uf2Done: "Fatto: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Errore: {msg}",
      uf2NoBoard: "Scegli prima una scheda.",
      uf2Instructions: [
      "Se non l'hai già fatto: aggiungi \"web_server:\" e \"ota: platform: web_server\" allo YAML di ESPHome e aggiorna il dispositivo una volta normalmente tramite ESPHome in modo che ottenga questa funzione.",
      "Scarica il file UF2 qui sopra.",
      "Nella dashboard di ESPHome, fai clic su \"Install\"/\"Update\" per il dispositivo e carica il file .uf2 scaricato come file locale (oppure apri direttamente http://<device-ip>/update nel browser).",
      "Attendi il riavvio del dispositivo: ora esegue il firmware OpenBeken e dovrebbe essere rilevabile tramite la scansione di rete di questo add-on.",
    ],
      boardGroupGeneric: "Generico (consigliato)",
      boardGroupSpecific: "Modulo specifico",
      loadBoardsError: "Impossibile caricare l'elenco delle schede: {msg}",
      yamlHeader: "2. Leggi uno YAML di ESPHome",
      yamlIntro: "Carica la configurazione YAML attualmente in uso su questo dispositivo con ESPHome. La pagina rileva relè, pulsanti e luci/uscite basati su GPIO e li traduce nei comandi OpenBeken corrispondenti.",
      yamlAnalyze: "Analizza",
      yamlAnalyzing: "Analisi in corso…",
      yamlError: "Errore: {msg}",
      yamlNoFile: "Scegli prima un file YAML.",
      yamlNoPinsFound: "Non è stato trovato alcun pin.",
      colPin: "Pin",
      colRole: "Ruolo",
      colChannel: "Canale",
      colSource: "Sorgente",
      yamlWarningsTitle: "Non tradotto automaticamente:",
      yamlCommandsLabel: "Comandi generati (modifica se necessario prima di inviare):",
      copyToClipboard: "Copia negli appunti",
      copyDone: "Copiato!",
      copyFailed: "Copia non riuscita - seleziona e copia manualmente.",
      applyHeader: "3. Invia la configurazione al dispositivo appena flashato",
      applyIntro: "Una volta che il dispositivo esegue OpenBeken ed è raggiungibile in rete, puoi inviare i comandi generati sopra (o modificati manualmente) direttamente al suo indirizzo IP.",
      applyIpPlaceholder: "Indirizzo IP (es. 192.168.1.50)",
      applyPasswordPlaceholder: "Password amministratore (se impostata)",
      applySend: "Invia",
      applySending: "Invio comandi…",
      applyIpMissing: "Inserisci un indirizzo IP.",
      applyNoCommands: "Nessun comando da inviare.",
      applyError: "Errore: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Non riuscito ({error}): {command}",
    },
    lv: {
      migrateTitle: "ESPHome ↔ OpenBeken migrācija",
      backToDevices: "Atpakaļ uz ierīču sarakstu",
      themeToggle: "Pārslēgt gaišo/tumšo režīmu",
      migrateWarning: "Eksperimentāla funkcija. Rūpīgi izvēlieties mikroshēmu/paneli - nepareiza izvēle var padarīt ierīci nelietojamu. Gadījumam, ja kaut kas noiet greizi, turiet gatavu UART atjaunošanas iespēju. Šī lapa pati par sevi nekad nenosūta programmaparatūru ierīcei: jūs šeit lejupielādējat UF2 failu un augšupielādējat to manuāli, izmantojot ESPHome pašas OTA funkciju; tam ierīces YAML jau ir jābūt iestatītam \"ota: platform: web_server\" (un \"web_server:\") - ja tā nav, vispirms vienreiz parastā veidā atjauniniet ierīci caur ESPHome, lai to pievienotu.",
      uf2Header: "1. Izveidot OpenBeken programmaparatūru kā UF2",
      uf2Intro: "Izvēlieties sava ESPHome ierīces mikroshēmu/moduli. Papildinājums lejupielādē atbilstošo OpenBeken programmaparatūru no pašreizējā izlaiduma un iesaiņo to kā UF2 failu, kuru pēc tam manuāli augšupielādējat ESPHome pašas atjaunināšanas lapā.",
      uf2Build: "Izveidot UF2",
      uf2Download: "Lejupielādēt UF2",
      uf2Building: "Izveido UF2 failu…",
      uf2Done: "Gatavs: {filename} (programmaparatūra {fwName} {fwVersion}).",
      uf2Error: "Kļūda: {msg}",
      uf2NoBoard: "Lūdzu, vispirms izvēlieties paneli.",
      uf2Instructions: [
      "Ja vēl neesat to izdarījis: pievienojiet ESPHome YAML failam \"web_server:\" un \"ota: platform: web_server\" un vienreiz parastā veidā atjauniniet ierīci caur ESPHome, lai tā iegūtu šo funkciju.",
      "Lejupielādējiet UF2 failu augstāk.",
      "ESPHome informācijas panelī noklikšķiniet uz \"Install\"/\"Update\" pie attiecīgās ierīces un augšupielādējiet lejupielādēto .uf2 kā vietējo failu (vai pārlūkā tieši atveriet http://<device-ip>/update).",
      "Uzgaidiet, kamēr ierīce restartējas - tagad tajā darbojas OpenBeken programmaparatūra, un tai vajadzētu būt atrodamai, izmantojot šī papildinājuma tīkla skenēšanu.",
    ],
      boardGroupGeneric: "Vispārīgs (ieteicams)",
      boardGroupSpecific: "Konkrēts modulis",
      loadBoardsError: "Neizdevās ielādēt paneļu sarakstu: {msg}",
      yamlHeader: "2. Nolasīt ESPHome YAML failu",
      yamlIntro: "Augšupielādējiet YAML konfigurāciju, ar kuru šī ierīce pašlaik darbojas ESPHome vidē. Lapa nosaka uz GPIO balstītus releju, pogu un gaismu/izeju iestatījumus un pārveido tos atbilstošās OpenBeken komandās.",
      yamlAnalyze: "Analizēt",
      yamlAnalyzing: "Analizē…",
      yamlError: "Kļūda: {msg}",
      yamlNoFile: "Lūdzu, vispirms izvēlieties YAML failu.",
      yamlNoPinsFound: "Neviens izvads netika atrasts.",
      colPin: "Izvads",
      colRole: "Loma",
      colChannel: "Kanāls",
      colSource: "Avots",
      yamlWarningsTitle: "Netika pārveidots automātiski:",
      yamlCommandsLabel: "Izveidotās komandas (ja nepieciešams, rediģējiet pirms sūtīšanas):",
      copyToClipboard: "Kopēt starpliktuvē",
      copyDone: "Nokopēts!",
      copyFailed: "Kopēšana neizdevās - lūdzu, atlasiet un kopējiet manuāli.",
      applyHeader: "3. Nosūtīt konfigurāciju tikko iezibinātajai ierīcei",
      applyIntro: "Tiklīdz ierīcē darbojas OpenBeken un tā ir sasniedzama tīklā, varat nosūtīt augstāk izveidotās (vai pašrocīgi rediģētās) komandas tieši uz tās IP adresi.",
      applyIpPlaceholder: "IP adrese (piem., 192.168.1.50)",
      applyPasswordPlaceholder: "Administratora parole (ja iestatīta)",
      applySend: "Sūtīt",
      applySending: "Sūta komandas…",
      applyIpMissing: "Lūdzu, ievadiet IP adresi.",
      applyNoCommands: "Nav komandu, ko sūtīt.",
      applyError: "Kļūda: {msg}",
      resultOk: "Labi: {command}",
      resultFail: "Neizdevās ({error}): {command}",
    },
    lt: {
      migrateTitle: "ESPHome ↔ OpenBeken migracija",
      backToDevices: "Grįžti į įrenginių sąrašą",
      themeToggle: "Perjungti šviesų / tamsų režimą",
      migrateWarning: "Eksperimentinė funkcija. Atidžiai pasirinkite lustą / plokštę - neteisingas pasirinkimas gali padaryti įrenginį netinkamą naudoti. Pasiruoškite UART atkūrimo galimybę, jei prireiktų. Šis puslapis pats savaime niekada nesiunčia programinės aparatinės įrangos į įrenginį: čia atsisiunčiate UF2 failą ir įkeliate jį rankiniu būdu naudodami ESPHome nuosavą OTA funkciją; tam ESPHome YAML faile jau turi būti nustatyta \"ota: platform: web_server\" (ir \"web_server:\") - jei to nėra, pirmiausia įprastu būdu vieną kartą atnaujinkite įrenginį per ESPHome, kad tai pridėtumėte.",
      uf2Header: "1. Sukurti OpenBeken programinę aparatinę įrangą kaip UF2",
      uf2Intro: "Pasirinkite savo ESPHome įrenginio lustą / modulį. Priedas atsisiunčia atitinkamą OpenBeken programinę aparatinę įrangą iš dabartinės laidos ir supakuoja ją kaip UF2 failą, kurį po to rankiniu būdu įkeliate per ESPHome nuosavą atnaujinimo puslapį.",
      uf2Build: "Sukurti UF2",
      uf2Download: "Atsisiųsti UF2",
      uf2Building: "Kuriamas UF2 failas…",
      uf2Done: "Atlikta: {filename} (programinė aparatinė įranga {fwName} {fwVersion}).",
      uf2Error: "Klaida: {msg}",
      uf2NoBoard: "Pirmiausia pasirinkite plokštę.",
      uf2Instructions: [
      "Jei dar to nepadarėte: pridėkite prie ESPHome YAML failo \"web_server:\" ir \"ota: platform: web_server\" ir vieną kartą įprastu būdu atnaujinkite įrenginį per ESPHome, kad jis gautų šią funkciją.",
      "Atsisiųskite aukščiau esantį UF2 failą.",
      "ESPHome valdymo skydelyje spustelėkite \"Install\"/\"Update\" prie šio įrenginio ir įkelkite atsisiųstą .uf2 failą kaip vietinį failą (arba naršyklėje tiesiogiai atidarykite http://<device-ip>/update).",
      "Palaukite, kol įrenginys pasileis iš naujo - dabar jame veikia OpenBeken programinė aparatinė įranga, ir jis turėtų būti aptinkamas šio priedo tinklo skenavimo metu.",
    ],
      boardGroupGeneric: "Bendra (rekomenduojama)",
      boardGroupSpecific: "Konkretus modulis",
      loadBoardsError: "Nepavyko įkelti plokščių sąrašo: {msg}",
      yamlHeader: "2. Nuskaityti ESPHome YAML failą",
      yamlIntro: "Įkelkite YAML konfigūraciją, pagal kurią šis įrenginys šiuo metu veikia su ESPHome. Puslapis nustato GPIO pagrįstus relės, mygtukų ir šviestuvų / išėjimų nustatymus ir paverčia juos atitinkamomis OpenBeken komandomis.",
      yamlAnalyze: "Analizuoti",
      yamlAnalyzing: "Analizuojama…",
      yamlError: "Klaida: {msg}",
      yamlNoFile: "Pirmiausia pasirinkite YAML failą.",
      yamlNoPinsFound: "Kontaktų nerasta.",
      colPin: "Kontaktas",
      colRole: "Vaidmuo",
      colChannel: "Kanalas",
      colSource: "Šaltinis",
      yamlWarningsTitle: "Automatiškai neišversta:",
      yamlCommandsLabel: "Sugeneruotos komandos (prireikus redaguokite prieš siunčiant):",
      copyToClipboard: "Kopijuoti į iškarpinę",
      copyDone: "Nukopijuota!",
      copyFailed: "Kopijuoti nepavyko - pažymėkite ir nukopijuokite rankiniu būdu.",
      applyHeader: "3. Nusiųsti konfigūraciją ką tik įrašytam įrenginiui",
      applyIntro: "Kai įrenginyje veikia OpenBeken ir jis pasiekiamas tinkle, aukščiau sugeneruotas (arba rankiniu būdu pataisytas) komandas galite siųsti tiesiai jo IP adresu.",
      applyIpPlaceholder: "IP adresas (pvz., 192.168.1.50)",
      applyPasswordPlaceholder: "Administratoriaus slaptažodis (jei nustatytas)",
      applySend: "Siųsti",
      applySending: "Siunčiamos komandos…",
      applyIpMissing: "Įveskite IP adresą.",
      applyNoCommands: "Nėra komandų siuntimui.",
      applyError: "Klaida: {msg}",
      resultOk: "Gerai: {command}",
      resultFail: "Nepavyko ({error}): {command}",
    },
    mt: {
      migrateTitle: "Migrazzjoni ESPHome ↔ OpenBeken",
      backToDevices: "Lura għal-lista tal-apparati",
      themeToggle: "Aqleb bejn il-mod ċar/skur",
      migrateWarning: "Karatteristika sperimentali. Agħżel iċ-chip/board b'attenzjoni - għażla ħażina tista' tagħmel l-apparat inutilizzabbli. Żomm mezz ta' rkupru UART lest għal kull evenjenza. Din il-paġna qatt ma tibgħat firmware lil apparat weħidha: hawn tniżżel l-UF2 u ttella'h manwalment permezz tal-funzjoni OTA stess ta' ESPHome; dan jeħtieġ li \"ota: platform: web_server\" (u \"web_server:\") ikunu diġà ssettjati fil-YAML tal-apparat - jekk mhux hekk, l-ewwel aġġorna l-apparat darba b'mod normali permezz ta' ESPHome biex iżżid dan.",
      uf2Header: "1. Ibni l-firmware OpenBeken bħala UF2",
      uf2Intro: "Agħżel iċ-chip/modulu tal-apparat ESPHome tiegħek. L-add-on iniżżel il-firmware OpenBeken korrispondenti mir-release attwali u jippakkjah bħala fajl UF2, li mbagħad ittella' manwalment permezz tal-paġna ta' aġġornament stess ta' ESPHome.",
      uf2Build: "Ibni UF2",
      uf2Download: "Niżżel UF2",
      uf2Building: "Qed jinbena l-fajl UF2…",
      uf2Done: "Lest: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Żball: {msg}",
      uf2NoBoard: "Jekk jogħġbok agħżel board l-ewwel.",
      uf2Instructions: [
      "Jekk għadek ma għamiltx dan: żid \"web_server:\" u \"ota: platform: web_server\" mal-YAML ta' ESPHome u aġġorna l-apparat darba b'mod normali permezz ta' ESPHome biex jikseb din il-karatteristika.",
      "Niżżel il-fajl UF2 hawn fuq.",
      "Fid-dashboard ta' ESPHome, agħfas \"Install\"/\"Update\" għall-apparat u ttella' l-.uf2 imniżżel bħala fajl lokali (jew iftaħ direttament http://<device-ip>/update fil-browser tiegħek).",
      "Stenna sakemm l-apparat jerġa' jitqabbad - issa jaħdem bil-firmware OpenBeken u għandu jkun jista' jinstab permezz tal-iskennjar tan-network ta' dan l-add-on.",
    ],
      boardGroupGeneric: "Ġeneriku (rakkomandat)",
      boardGroupSpecific: "Modulu speċifiku",
      loadBoardsError: "Ma setgħetx titgħabba l-lista tal-boards: {msg}",
      yamlHeader: "2. Aqra YAML ta' ESPHome",
      yamlIntro: "Ittella' l-konfigurazzjoni YAML li dan l-apparat bħalissa jaħdem biha taħt ESPHome. Il-paġna tikxef relays, buttuni u dwal/outputs ibbażati fuq GPIO u tittraduċihom fil-kmandi OpenBeken korrispondenti.",
      yamlAnalyze: "Analizza",
      yamlAnalyzing: "Qed jiġi analizzat…",
      yamlError: "Żball: {msg}",
      yamlNoFile: "Jekk jogħġbok agħżel fajl YAML l-ewwel.",
      yamlNoPinsFound: "Ma nstab l-ebda pin.",
      colPin: "Pin",
      colRole: "Rwol",
      colChannel: "Kanal",
      colSource: "Sors",
      yamlWarningsTitle: "Mhux tradotti awtomatikament:",
      yamlCommandsLabel: "Kmandi ġġenerati (editja jekk hemm bżonn qabel tibgħathom):",
      copyToClipboard: "Ikkopja fil-clipboard",
      copyDone: "Ikkopjat!",
      copyFailed: "Il-kopjar falla - jekk jogħġbok agħżel u ikkopja manwalment.",
      applyHeader: "3. Ibgħat il-konfigurazzjoni lill-apparat li għadu kif ġie flashjat",
      applyIntro: "Ladarba l-apparat ikun jaħdem b'OpenBeken u jintlaħaq fuq in-network, tista' tibgħat il-kmandi ġġenerati hawn fuq (jew editjati bl-idejn) direttament lill-indirizz IP tiegħu.",
      applyIpPlaceholder: "Indirizz IP (eż. 192.168.1.50)",
      applyPasswordPlaceholder: "Password tal-amministratur (jekk issettjata)",
      applySend: "Ibgħat",
      applySending: "Qed jintbagħtu l-kmandi…",
      applyIpMissing: "Jekk jogħġbok daħħal indirizz IP.",
      applyNoCommands: "L-ebda kmand x'jintbagħat.",
      applyError: "Żball: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Falla ({error}): {command}",
    },
    pl: {
      migrateTitle: "Migracja ESPHome ↔ OpenBeken",
      backToDevices: "Powrót do listy urządzeń",
      themeToggle: "Przełącz tryb jasny/ciemny",
      migrateWarning: "Funkcja eksperymentalna. Wybierz chip/płytkę ostrożnie - zły wybór może sprawić, że urządzenie stanie się bezużyteczne. Miej na wszelki wypadek przygotowaną ścieżkę odzyskiwania przez UART. Ta strona nigdy sama nie wysyła firmware do urządzenia: pobierasz tutaj plik UF2 i przesyłasz go ręcznie za pomocą własnej funkcji OTA ESPHome; wymaga to, aby \"ota: platform: web_server\" (oraz \"web_server:\") było już skonfigurowane w YAML urządzenia - jeśli nie jest, zaktualizuj urządzenie najpierw raz normalnie przez ESPHome, aby to dodać.",
      uf2Header: "1. Zbuduj firmware OpenBeken jako plik UF2",
      uf2Intro: "Wybierz chip/moduł swojego urządzenia ESPHome. Dodatek pobiera odpowiedni firmware OpenBeken z bieżącego wydania i pakuje go jako plik UF2, który następnie przesyłasz ręcznie za pomocą własnej strony aktualizacji ESPHome.",
      uf2Build: "Zbuduj UF2",
      uf2Download: "Pobierz UF2",
      uf2Building: "Tworzenie pliku UF2…",
      uf2Done: "Gotowe: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Błąd: {msg}",
      uf2NoBoard: "Najpierw wybierz płytkę.",
      uf2Instructions: [
      "Jeśli jeszcze tego nie zrobiłeś: dodaj \"web_server:\" oraz \"ota: platform: web_server\" do YAML ESPHome i zaktualizuj urządzenie raz normalnie przez ESPHome, aby otrzymało tę funkcję.",
      "Pobierz plik UF2 powyżej.",
      "W panelu ESPHome kliknij \"Install\"/\"Update\" dla urządzenia i prześlij pobrany plik .uf2 jako plik lokalny (lub otwórz bezpośrednio http://<device-ip>/update w przeglądarce).",
      "Poczekaj, aż urządzenie się zrestartuje - teraz działa na nim firmware OpenBeken i powinno być wykrywalne przez skanowanie sieci w tym dodatku.",
    ],
      boardGroupGeneric: "Ogólny (zalecane)",
      boardGroupSpecific: "Konkretny moduł",
      loadBoardsError: "Nie można załadować listy płytek: {msg}",
      yamlHeader: "2. Wczytaj plik YAML ESPHome",
      yamlIntro: "Prześlij konfigurację YAML, na której obecnie działa to urządzenie pod ESPHome. Strona wykrywa przekaźniki, przyciski oraz światła/wyjścia oparte na GPIO i tłumaczy je na odpowiednie polecenia OpenBeken.",
      yamlAnalyze: "Analizuj",
      yamlAnalyzing: "Analizowanie…",
      yamlError: "Błąd: {msg}",
      yamlNoFile: "Najpierw wybierz plik YAML.",
      yamlNoPinsFound: "Nie znaleziono żadnych pinów.",
      colPin: "Pin",
      colRole: "Rola",
      colChannel: "Kanał",
      colSource: "Źródło",
      yamlWarningsTitle: "Nieprzetłumaczone automatycznie:",
      yamlCommandsLabel: "Wygenerowane polecenia (edytuj w razie potrzeby przed wysłaniem):",
      copyToClipboard: "Kopiuj do schowka",
      copyDone: "Skopiowano!",
      copyFailed: "Kopiowanie nie powiodło się - zaznacz i skopiuj ręcznie.",
      applyHeader: "3. Wyślij konfigurację do świeżo wgranego urządzenia",
      applyIntro: "Gdy urządzenie działa już na OpenBeken i jest dostępne w sieci, możesz wysłać wygenerowane powyżej polecenia (lub edytowane ręcznie) bezpośrednio na jego adres IP.",
      applyIpPlaceholder: "Adres IP (np. 192.168.1.50)",
      applyPasswordPlaceholder: "Hasło administratora (jeśli ustawione)",
      applySend: "Wyślij",
      applySending: "Wysyłanie poleceń…",
      applyIpMissing: "Wprowadź adres IP.",
      applyNoCommands: "Brak poleceń do wysłania.",
      applyError: "Błąd: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Niepowodzenie ({error}): {command}",
    },
    ro: {
      migrateTitle: "Migrare ESPHome ↔ OpenBeken",
      backToDevices: "Înapoi la lista de dispozitive",
      themeToggle: "Comută modul luminos/întunecat",
      migrateWarning: "Funcție experimentală. Alege cu atenție chipul/placa - o alegere greșită poate face dispozitivul inutilizabil. Ține la îndemână o cale de recuperare prin UART, pentru orice eventualitate. Această pagină nu trimite niciodată firmware către un dispozitiv de una singură: aici descarci fișierul UF2 și îl încarci manual prin propria funcție OTA a ESPHome; acest lucru necesită ca \"ota: platform: web_server\" (și \"web_server:\") să fie deja configurate în fișierul YAML al dispozitivului - dacă nu sunt, actualizează mai întâi dispozitivul o dată în mod normal prin ESPHome pentru a adăuga acest lucru.",
      uf2Header: "1. Construiește firmware-ul OpenBeken ca fișier UF2",
      uf2Intro: "Alege chipul/modulul dispozitivului tău ESPHome. Add-on-ul descarcă firmware-ul OpenBeken corespunzător din versiunea curentă și îl ambalează ca fișier UF2, pe care apoi îl încarci manual prin propria pagină de actualizare a ESPHome.",
      uf2Build: "Construiește UF2",
      uf2Download: "Descarcă UF2",
      uf2Building: "Se construiește fișierul UF2…",
      uf2Done: "Gata: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Eroare: {msg}",
      uf2NoBoard: "Alege mai întâi o placă.",
      uf2Instructions: [
      "Dacă nu ai făcut-o deja: adaugă \"web_server:\" și \"ota: platform: web_server\" în YAML-ul ESPHome și actualizează dispozitivul o dată în mod normal prin ESPHome, pentru ca acesta să primească această funcție.",
      "Descarcă fișierul UF2 de mai sus.",
      "În panoul ESPHome, apasă \"Install\"/\"Update\" pentru dispozitiv și încarcă fișierul .uf2 descărcat ca fișier local (sau deschide direct în browser http://<device-ip>/update).",
      "Așteaptă ca dispozitivul să repornească - acum rulează firmware OpenBeken și ar trebui să poată fi găsit prin scanarea de rețea a acestui add-on.",
    ],
      boardGroupGeneric: "Generic (recomandat)",
      boardGroupSpecific: "Modul specific",
      loadBoardsError: "Lista de plăci nu a putut fi încărcată: {msg}",
      yamlHeader: "2. Citește un fișier YAML ESPHome",
      yamlIntro: "Încarcă configurația YAML cu care rulează în prezent acest dispozitiv sub ESPHome. Pagina detectează releele, butoanele și luminile/ieșirile bazate pe GPIO și le traduce în comenzile OpenBeken corespunzătoare.",
      yamlAnalyze: "Analizează",
      yamlAnalyzing: "Se analizează…",
      yamlError: "Eroare: {msg}",
      yamlNoFile: "Alege mai întâi un fișier YAML.",
      yamlNoPinsFound: "Nu a fost găsit niciun pin.",
      colPin: "Pin",
      colRole: "Rol",
      colChannel: "Canal",
      colSource: "Sursă",
      yamlWarningsTitle: "Netraduse automat:",
      yamlCommandsLabel: "Comenzi generate (editează dacă este necesar înainte de trimitere):",
      copyToClipboard: "Copiază în clipboard",
      copyDone: "Copiat!",
      copyFailed: "Copierea a eșuat - selectează și copiază manual.",
      applyHeader: "3. Trimite configurația către dispozitivul proaspăt reprogramat",
      applyIntro: "Odată ce dispozitivul rulează OpenBeken și este accesibil în rețea, poți trimite comenzile generate mai sus (sau editate manual) direct la adresa lui IP.",
      applyIpPlaceholder: "Adresă IP (ex. 192.168.1.50)",
      applyPasswordPlaceholder: "Parolă de administrator (dacă este setată)",
      applySend: "Trimite",
      applySending: "Se trimit comenzile…",
      applyIpMissing: "Introdu o adresă IP.",
      applyNoCommands: "Nicio comandă de trimis.",
      applyError: "Eroare: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Eșuat ({error}): {command}",
    },
    sk: {
      migrateTitle: "Migrácia ESPHome ↔ OpenBeken",
      backToDevices: "Späť na zoznam zariadení",
      themeToggle: "Prepnúť svetlý/tmavý režim",
      migrateWarning: "Experimentálna funkcia. Vyberte čip/dosku starostlivo - nesprávna voľba môže zariadenie znefunkčniť. Pre istotu majte pripravenú možnosť obnovy cez UART. Táto stránka nikdy sama neodosiela firmvér do zariadenia: UF2 tu stiahnete a nahráte ho ručne cez vlastnú OTA funkciu ESPHome; to vyžaduje, aby v YAML zariadenia už bolo nastavené \"ota: platform: web_server\" (a \"web_server:\") - ak nie je, najprv zariadenie raz bežne aktualizujte cez ESPHome, aby túto funkciu získalo.",
      uf2Header: "1. Zostaviť firmvér OpenBeken ako UF2",
      uf2Intro: "Vyberte čip/modul svojho zariadenia ESPHome. Doplnok stiahne zodpovedajúci firmvér OpenBeken z aktuálneho vydania a zabalí ho do súboru UF2, ktorý potom ručne nahráte cez vlastnú aktualizačnú stránku ESPHome.",
      uf2Build: "Zostaviť UF2",
      uf2Download: "Stiahnuť UF2",
      uf2Building: "Zostavuje sa súbor UF2…",
      uf2Done: "Hotovo: {filename} (firmvér {fwName} {fwVersion}).",
      uf2Error: "Chyba: {msg}",
      uf2NoBoard: "Najprv vyberte dosku.",
      uf2Instructions: [
      "Ak ste to ešte neurobili: pridajte \"web_server:\" a \"ota: platform: web_server\" do YAML ESPHome a raz zariadenie bežne aktualizujte cez ESPHome, aby túto funkciu získalo.",
      "Stiahnite súbor UF2 vyššie.",
      "V dashboarde ESPHome kliknite pri zariadení na \"Install\"/\"Update\" a nahrajte stiahnutý súbor .uf2 ako lokálny súbor (alebo otvorte priamo v prehliadači http://<device-ip>/update).",
      "Počkajte, kým sa zariadenie reštartuje - teraz beží na firmvéri OpenBeken a malo by byť zistiteľné sieťovým skenovaním tohto doplnku.",
    ],
      boardGroupGeneric: "Všeobecná (odporúčané)",
      boardGroupSpecific: "Konkrétny modul",
      loadBoardsError: "Zoznam dosiek sa nepodarilo načítať: {msg}",
      yamlHeader: "2. Načítať YAML súbor ESPHome",
      yamlIntro: "Nahrajte YAML konfiguráciu, s ktorou toto zariadenie aktuálne beží pod ESPHome. Stránka rozpozná relé, tlačidlá a svetlá/výstupy založené na GPIO a prevedie ich na zodpovedajúce príkazy OpenBeken.",
      yamlAnalyze: "Analyzovať",
      yamlAnalyzing: "Analyzuje sa…",
      yamlError: "Chyba: {msg}",
      yamlNoFile: "Najprv vyberte súbor YAML.",
      yamlNoPinsFound: "Nenašli sa žiadne piny.",
      colPin: "Pin",
      colRole: "Rola",
      colChannel: "Kanál",
      colSource: "Zdroj",
      yamlWarningsTitle: "Nepreložené automaticky:",
      yamlCommandsLabel: "Vygenerované príkazy (pred odoslaním ich v prípade potreby upravte):",
      copyToClipboard: "Kopírovať do schránky",
      copyDone: "Skopírované!",
      copyFailed: "Kopírovanie zlyhalo - vyberte a skopírujte ručne.",
      applyHeader: "3. Odoslať konfiguráciu na novo nahraté zariadenie",
      applyIntro: "Keď zariadenie beží na OpenBeken a je dostupné v sieti, môžete vyššie vygenerované príkazy (alebo ručne upravené) odoslať priamo na jeho IP adresu.",
      applyIpPlaceholder: "IP adresa (napr. 192.168.1.50)",
      applyPasswordPlaceholder: "Heslo správcu (ak je nastavené)",
      applySend: "Odoslať",
      applySending: "Odosielajú sa príkazy…",
      applyIpMissing: "Zadajte IP adresu.",
      applyNoCommands: "Žiadne príkazy na odoslanie.",
      applyError: "Chyba: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Zlyhalo ({error}): {command}",
    },
    sl: {
      migrateTitle: "Migracija ESPHome ↔ OpenBeken",
      backToDevices: "Nazaj na seznam naprav",
      themeToggle: "Preklop svetlega/temnega načina",
      migrateWarning: "Eksperimentalna funkcija. Skrbno izberite čip/ploščo - napačna izbira lahko napravo naredi neuporabno. Za vsak primer pripravite pot za obnovitev prek UART. Ta stran nikoli sama ne pošlje firmwara na napravo: tukaj prenesete datoteko UF2 in jo ročno naložite prek lastne funkcije OTA v ESPHomeu; za to mora biti v YAML datoteki naprave že nastavljeno \"ota: platform: web_server\" (in \"web_server:\") - če ni, najprej enkrat posodobite napravo na običajen način prek ESPHomea, da to dodate.",
      uf2Header: "1. Ustvarite firmware OpenBeken kot UF2",
      uf2Intro: "Izberite čip/modul svoje naprave ESPHome. Dodatek prenese ustrezen firmware OpenBeken iz trenutne izdaje in ga zapakira kot datoteko UF2, ki jo nato ročno naložite prek lastne strani za posodobitve v ESPHomeu.",
      uf2Build: "Ustvari UF2",
      uf2Download: "Prenesi UF2",
      uf2Building: "Ustvarjanje datoteke UF2…",
      uf2Done: "Končano: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Napaka: {msg}",
      uf2NoBoard: "Najprej izberite ploščo.",
      uf2Instructions: [
      "Če tega še niste storili: v YAML ESPHome dodajte \"web_server:\" in \"ota: platform: web_server\" ter napravo enkrat posodobite na običajen način prek ESPHomea, da pridobi to funkcijo.",
      "Prenesite zgornjo datoteko UF2.",
      "V nadzorni plošči ESPHome kliknite \"Install\"/\"Update\" za napravo in naložite preneseno datoteko .uf2 kot lokalno datoteko (ali neposredno odprite http://<device-ip>/update v brskalniku).",
      "Počakajte, da se naprava znova zažene - zdaj deluje s firmwarom OpenBeken in bi jo moralo biti mogoče zaznati prek iskanja omrežja tega dodatka.",
    ],
      boardGroupGeneric: "Splošno (priporočeno)",
      boardGroupSpecific: "Specifičen modul",
      loadBoardsError: "Seznama plošč ni bilo mogoče naložiti: {msg}",
      yamlHeader: "2. Preberite YAML ESPHome",
      yamlIntro: "Naložite konfiguracijo YAML, s katero ta naprava trenutno deluje pod ESPHome. Stran zazna releje, gumbe ter luči/izhode na osnovi GPIO in jih prevede v ustrezne ukaze OpenBeken.",
      yamlAnalyze: "Analiziraj",
      yamlAnalyzing: "Analiziranje…",
      yamlError: "Napaka: {msg}",
      yamlNoFile: "Najprej izberite datoteko YAML.",
      yamlNoPinsFound: "Ni bilo najdenih pinov.",
      colPin: "Pin",
      colRole: "Vloga",
      colChannel: "Kanal",
      colSource: "Vir",
      yamlWarningsTitle: "Ni samodejno prevedeno:",
      yamlCommandsLabel: "Ustvarjeni ukazi (po potrebi uredite pred pošiljanjem):",
      copyToClipboard: "Kopiraj v odložišče",
      copyDone: "Kopirano!",
      copyFailed: "Kopiranje ni uspelo - besedilo ročno izberite in kopirajte.",
      applyHeader: "3. Pošljite konfiguracijo na pravkar flashano napravo",
      applyIntro: "Ko naprava deluje z OpenBeken in je dosegljiva v omrežju, lahko zgoraj ustvarjene ukaze (ali ročno urejene) pošljete neposredno na njen naslov IP.",
      applyIpPlaceholder: "Naslov IP (npr. 192.168.1.50)",
      applyPasswordPlaceholder: "Skrbniško geslo (če je nastavljeno)",
      applySend: "Pošlji",
      applySending: "Pošiljanje ukazov…",
      applyIpMissing: "Vnesite naslov IP.",
      applyNoCommands: "Ni ukazov za pošiljanje.",
      applyError: "Napaka: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Neuspešno ({error}): {command}",
    },
    sv: {
      migrateTitle: "ESPHome ↔ OpenBeken-migrering",
      backToDevices: "Tillbaka till enhetslistan",
      themeToggle: "Växla ljust/mörkt läge",
      migrateWarning: "Experimentell funktion. Välj chip/kort noggrant - fel val kan göra enheten obrukbar. Ha en UART-återställningsväg redo ifall något går fel. Den här sidan skickar aldrig firmware till en enhet på egen hand: du laddar ner UF2-filen här och laddar upp den manuellt via ESPHomes egen OTA-funktion; det kräver att \"ota: platform: web_server\" (och \"web_server:\") redan är konfigurerat i enhetens YAML - om det inte är det, uppdatera enheten en gång normalt via ESPHome först för att lägga till det.",
      uf2Header: "1. Bygg OpenBeken-firmware som en UF2",
      uf2Intro: "Välj chip/modul för din ESPHome-enhet. Tillägget laddar ner motsvarande OpenBeken-firmware från den aktuella versionen och paketerar den som en UF2-fil, som du sedan laddar upp manuellt via ESPHomes egen uppdateringssida.",
      uf2Build: "Bygg UF2",
      uf2Download: "Ladda ner UF2",
      uf2Building: "Bygger UF2-fil…",
      uf2Done: "Klart: {filename} (firmware {fwName} {fwVersion}).",
      uf2Error: "Fel: {msg}",
      uf2NoBoard: "Välj ett kort först.",
      uf2Instructions: [
      "Om du inte redan har gjort det: lägg till \"web_server:\" och \"ota: platform: web_server\" i ESPHome-YAML:en och uppdatera enheten en gång normalt via ESPHome så att den får den funktionen.",
      "Ladda ner UF2-filen ovan.",
      "Klicka på \"Install\"/\"Update\" för enheten i ESPHome-instrumentpanelen och ladda upp den nedladdade .uf2-filen som en lokal fil (eller öppna http://<device-ip>/update direkt i webbläsaren).",
      "Vänta tills enheten startar om - den kör nu OpenBeken-firmware och bör kunna upptäckas via det här tilläggets nätverksskanning.",
    ],
      boardGroupGeneric: "Generisk (rekommenderas)",
      boardGroupSpecific: "Specifik modul",
      loadBoardsError: "Det gick inte att ladda kortlistan: {msg}",
      yamlHeader: "2. Läs in en ESPHome-YAML",
      yamlIntro: "Ladda upp YAML-konfigurationen som den här enheten för närvarande kör under ESPHome. Sidan upptäcker gpio-baserade reläer, knappar och lampor/utgångar och översätter dem till motsvarande OpenBeken-kommandon.",
      yamlAnalyze: "Analysera",
      yamlAnalyzing: "Analyserar…",
      yamlError: "Fel: {msg}",
      yamlNoFile: "Välj en YAML-fil först.",
      yamlNoPinsFound: "Inga stift hittades.",
      colPin: "Pin",
      colRole: "Roll",
      colChannel: "Kanal",
      colSource: "Källa",
      yamlWarningsTitle: "Inte automatiskt översatt:",
      yamlCommandsLabel: "Genererade kommandon (redigera vid behov innan du skickar):",
      copyToClipboard: "Kopiera till urklipp",
      copyDone: "Kopierat!",
      copyFailed: "Det gick inte att kopiera - markera och kopiera manuellt.",
      applyHeader: "3. Skicka konfiguration till den nyligen flashade enheten",
      applyIntro: "När enheten kör OpenBeken och är nåbar på nätverket kan du skicka kommandona som genererades ovan (eller redigerades för hand) direkt till dess IP-adress.",
      applyIpPlaceholder: "IP-adress (t.ex. 192.168.1.50)",
      applyPasswordPlaceholder: "Administratörslösenord (om inställt)",
      applySend: "Skicka",
      applySending: "Skickar kommandon…",
      applyIpMissing: "Ange en IP-adress.",
      applyNoCommands: "Inga kommandon att skicka.",
      applyError: "Fel: {msg}",
      resultOk: "OK: {command}",
      resultFail: "Misslyckades ({error}): {command}",
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
