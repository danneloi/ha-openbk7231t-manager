# OpenBK7231T Manager – Dokumentation

> Eine kompakte Versionsübersicht gibt es auch in [CHANGELOG.md](CHANGELOG.md).

## Änderungen in 1.3.3

- **Release-Notes per Klick**: Ein Klick auf die Release-Anzeige oben
  ("Release: x.y.z") öffnet jetzt ein Popup mit den vollständigen
  Release-Notes des neuesten OpenBK7231T_App-Releases (Highlights,
  Veröffentlichungsdatum) sowie einem Link zum Release auf GitHub.
- **GitHub-Symbol in der Kopfzeile**: Oben links neben der Sprachauswahl
  öffnet ein neues GitHub-Symbol direkt das offizielle
  [OpenBK7231T_App](https://github.com/openshwprojects/OpenBK7231T_App)-Repository
  in einem neuen Tab.

## Änderungen in 1.3.2

- **Warnung "This is a development server" behoben**: Beim Start meldete
  das Add-on bisher im Log die Flask-Warnung "WARNING: This is a
  development server. Do not use it in a production deployment. Use a
  production WSGI server instead." Das lag daran, dass die Weboberfläche
  intern über Flasks eingebauten Entwicklungsserver lief - der ist für
  den Dauerbetrieb nicht gedacht (nicht auf Stabilität/Nebenläufigkeit
  unter Last ausgelegt), auch wenn er im Alltag meist trotzdem
  funktioniert hat. Das Add-on nutzt jetzt stattdessen
  [waitress](https://github.com/Pylons/waitress), einen für den
  Dauerbetrieb gedachten WSGI-Server. Für dich ändert sich dadurch nichts
  an der Bedienung - nur die Warnung verschwindet.

## Änderungen in 1.3.1

- **Benachrichtigungen jetzt vollständig übersetzt**: Beim Umschalten der
  Sprache blieb der Bereich "Benachrichtigungen" (Feldbezeichnungen,
  Hinweistexte, Platzhaltertexte) bisher auf Deutsch. Jetzt wird er
  konsistent in die gewählte Sprache übersetzt.
- **Beispielname im Kanal-Formular anonymisiert**: Das Feld "Name" zeigte
  als Beispiel "z. B. Handy Daniel" – jetzt ein neutrales Beispiel ("z. B.
  Handy Alex").
- **Repository jetzt GitHub-fertig**: `repository.yaml`, ein Root-`README.md`,
  `CHANGELOG.md`, ein Add-on-Icon/-Logo sowie ein paar Vorschau-Screenshots
  wurden hinzugefügt, damit sich dieses Add-on direkt als eigenes
  GitHub-Repository bei Home Assistant einbinden lässt.

## Änderungen in 1.3.0

- **Mehrsprachige Oberfläche**: Oben rechts gibt es jetzt eine
  Sprachauswahl. Neben Deutsch stehen Englisch, Englisch (US), Französisch,
  Spanisch und Portugiesisch zur Verfügung. Die Wahl wird im Browser
  gespeichert. Alle Sensor-Bezeichnungen (z. B. "Apparent Power", "Energy
  Last Hour") werden dabei konsistent in die gewählte Sprache übersetzt,
  statt wie bisher teils Englisch/teils Deutsch gemischt anzuzeigen.
- **"Alle aktualisieren"-Banner verschwindet jetzt zuverlässig**: Der blaue
  Hinweisbalken samt "Alle aktualisieren"-Button wurde zwar schon bisher
  ausgeblendet, sobald kein Update mehr ansteht - ein CSS-Konflikt sorgte
  aber dafür, dass er trotzdem sichtbar blieb. Behoben.
- **Gerätename umbenennen jetzt im Popup**: Der Name in der Geräteliste ist
  jetzt ein normaler, fester Text; ein Klick darauf (wie auf den Rest der
  Zeile) öffnet die Sensordetailansicht, und dort lässt sich der Name
  bearbeiten. Die Sensordaten bleiben dabei weiterhin sichtbar.
- **Sensordaten übersichtlicher gruppiert**: Die Detailansicht ist jetzt in
  Kategorien unterteilt (WLAN-Verbindung, Verbrauch, Diagnose, Umgebung).
  Jeder Sensor lässt sich außerdem einzeln umbenennen (Klick auf die
  Bezeichnung).
- **Sensorwerte auf 2 Nachkommastellen gerundet**: Werte wie
  "2172.286133" werden jetzt als "2172.29" angezeigt, ohne die Genauigkeit
  in der Anzeige unnötig aufzublähen.
- **RSSI farbig markiert**: Der RSSI-Wert (WLAN-Empfangsqualität in %) ist
  jetzt grün (≥70 %, guter Empfang), orange (40–69 %, mittlerer Empfang)
  oder rot (<40 %, schlechter Empfang) eingefärbt.
- **Aktionen-Spalte aufgeräumt**: Der Text-Button "Aktualisieren" wurde
  durch ein grünes Sync-Symbol ersetzt, "Entfernen" durch ein graues
  Mülleimer-Symbol. Neu dazugekommen ist ein Symbol, das das Gerät direkt
  in einem neuen Browser-Tab öffnet.
- **Einstellungen kompakter**: Die erklärende Textzeile darüber wurde
  entfernt, die Werte (Scan-Subnetz, Abfrageintervall,
  Release-Prüfintervall, Benachrichtigungen, Firmware-Server-Port) stehen
  jetzt platzsparend nebeneinander statt untereinander.

## Änderungen in 1.2.0

- **Firmware-Updates werden jetzt direkt hochgeladen, statt eine URL zu
  verschicken**: Bisher hat das Add-on dem Gerät per `ota_http`-Befehl nur
  eine URL mitgeteilt, von der es die Firmware-Datei selbst herunterladen
  sollte. Bei der Fehlersuche für ein Gerät mit RTL87X0C-Chip hat sich
  per Netzwerk-Mitschnitt (tcpdump) gezeigt, dass die URL-Verarbeitung
  dieses Befehls auf mindestens dieser Chip-Familie einen echten
  Firmware-Bug hat: Aus einer korrekten IP wie `192.168.42.50` wurde
  intern fälschlich `192.168.42.42` (die dritte Zifferngruppe wurde in
  die letzte hineinkopiert, die eigentliche letzte Zifferngruppe ging
  dabei verloren) – das Gerät hat also nie beim richtigen Absender
  angefragt, ganz unabhängig davon, ob unser Add-on oder sonst irgendetwas
  im Netzwerk lief.
  Das Add-on nutzt jetzt standardmäßig denselben Weg wie die
  "Web Application"-Drag-&-Drop-Funktion der Firmware selbst und das
  offizielle BK7231GUIFlashTool: Es lädt die Firmware-Datei direkt per
  `POST /api/ota` auf das Gerät hoch (keine URL, die das Gerät selbst
  auflösen müsste) und löst danach einen Neustart aus (`POST
  /api/reboot`). Nur falls dieser direkte Upload von einem Gerät
  abgelehnt wird, fällt das Add-on automatisch auf den bisherigen
  `ota_http`-Mechanismus zurück (inklusive des `/cm`-Fallbacks aus 1.1.1).
  Das macht Netzwerk-Updates insgesamt zuverlässiger und unabhängig von
  Eigenheiten einzelner Firmware-Chipfamilien bei der URL-Verarbeitung.

## Änderungen in 1.1.4

- **Firmware-URL wird jetzt beim Start eines Updates ins Log geschrieben**:
  Damit sich ein Fall wie "Gerät nimmt den Update-Befehl an, lädt die Datei
  aber nie herunter" gezielt nachstellen lässt, protokolliert das Add-on
  jetzt beim Auslösen jedes Updates die genaue URL, die es dem Gerät zum
  Herunterladen mitgibt (z. B. `http://192.168.1.10:8098/firmware/1.18.310/
  OpenRTL87X0C_1.18.310_ota.img`). Diese URL kannst du dann von einem
  anderen Gerät im selben Netzwerk (PC, Handy) aus direkt im Browser oder
  mit `curl` aufrufen, um zu prüfen, ob sie von dort erreichbar ist – wenn
  nicht, liegt das Problem am Netzwerk/an der Portfreigabe zwischen dem
  Home-Assistant-Host und dem Gerät, nicht am Add-on selbst oder am Gerät.

## Änderungen in 1.1.3

- **Bessere Diagnose bei "Zeitüberschreitung"**: Die genaue Fehlermeldung aus
  1.1.2 (siehe unten) war bisher nur als Tooltip beim Draufhalten mit der
  Maus sichtbar – auf Tablet/Handy (Touchscreen) funktioniert das nicht.
  Ein Tippen/Klicken auf den Status "Zeitüberschreitung" oder
  "Fehlgeschlagen" zeigt die Meldung jetzt zusätzlich als Popup an.
- Außerdem schreibt das Add-on den genauen Grund für jede
  "Zeitüberschreitung" jetzt auch klar ins eigene Log (z. B. "device never
  fetched the firmware image from our server" oder "timed out after the
  full 240s watch window"), inklusive Zeitpunkt und Geräte-IP – so lässt
  sich das Problem auch direkt aus den Add-on-Logs heraus eingrenzen, ohne
  die Oberfläche öffnen zu müssen. Zusätzlich protokolliert das Add-on jetzt
  jeden Zugriff eines Geräts auf seinen eigenen Firmware-Server (Port aus
  der Konfiguration, Standard 8098) explizit mit Gerät-IP und Dateiname.

## Änderungen in 1.1.2

- **Firmware-Update endet mit "Zeitüberschreitung", obwohl der Update-Befehl
  angenommen wurde**: Bei manchen Geräten hat der in 1.1.1 eingebaute
  automatische Wechsel auf den `/cm`-Endpunkt zwar eine erfolgreiche Antwort
  (HTTP 200) vom Gerät bekommen, aber das eigentliche Firmware-Update hat nie
  wirklich begonnen – das Gerät hat den Befehl also nur scheinbar
  angenommen. Das liegt daran, dass dieser Endpunkt der Firmware grundsätzlich
  immer mit "OK" antwortet, unabhängig davon, ob der Befehl dahinter
  tatsächlich ausgeführt wurde; eine HTTP-200-Antwort war also nie eine
  echte Erfolgsgarantie.
  Das Add-on prüft jetzt zusätzlich direkt an der Quelle: Es merkt sich, ob
  das Gerät sich innerhalb der ersten 45 Sekunden nach dem Update-Befehl
  überhaupt beim eigenen Firmware-Server des Add-ons meldet, um die
  Firmware-Datei herunterzuladen. Passiert das nicht, wird sofort (statt
  erst nach den vollen 4 Minuten) mit einer klaren, konkreten
  Fehlermeldung abgebrochen: "Gerät hat nie versucht, die Firmware-Datei
  vom Add-on herunterzuladen. Der Update-Befehl wurde vermutlich vom Gerät
  nicht wirklich ausgeführt, auch wenn die Anfrage mit HTTP 200 beantwortet
  wurde – oder das Gerät kann den Firmware-Server des Add-ons im Netzwerk
  nicht erreichen." Diese Meldung erscheint jetzt auch als Tooltip auf dem
  "Zeitüberschreitung"-Status in der Geräteliste (vorher nur beim Status
  "Fehlgeschlagen"). Hat das Gerät die Datei dagegen heruntergeladen, sich
  danach aber nicht mit der neuen Version zurückgemeldet, bleibt es bei der
  vollen Wartezeit von 4 Minuten, jetzt aber ebenfalls mit einer passenderen
  Fehlermeldung.
  Falls diese neue Meldung bei dir auftritt, deutet das darauf hin, dass das
  Gerät den `ota_http`-Befehl aus einem anderen Grund ablehnt oder ignoriert
  (z. B. falsches Firmware-Image für den genauen Chip-Untertyp, oder das
  Gerät kann den Firmware-Server des Add-ons – Host-Netzwerk, Port aus der
  Konfiguration, Standard 8098 – nicht erreichen); das ist dann kein reines
  Timing-Problem mehr, sondern etwas, das sich gezielt eingrenzen lässt.

## Änderungen in 1.1.1

- **Fehlerbehebung "Sensordaten konnten nicht geladen werden: HTTP 400"**:
  Manche Geräte haben die Statusabfrage für die Sensor-Detailansicht mit
  einem Fehler abgelehnt, obwohl sie laut ihrer eigenen Diagnoseanzeige in
  Home Assistant ganz normal Sensordaten liefern. Grund: Das Add-on hat die
  Statusabfrage über den internen `/api/cmnd`-Befehlskanal der Firmware
  geschickt – und manche Firmware-Versionen antworten darüber mit einem
  HTTP-Fehler, obwohl der Befehl selbst harmlos ist. Das Add-on nutzt jetzt
  stattdessen den dafür vorgesehenen Tasmota-kompatiblen `/cm`-Endpunkt der
  Firmware, der zuverlässig antwortet. Dabei wurde außerdem ein zweiter,
  stiller Fehler behoben: Bei manchen Geräten kam zwar eine Antwort ohne
  Fehler zurück, aber das Add-on hat die Sensordaten an der falschen Stelle
  in der Antwort gesucht und deshalb fälschlich "Dieses Gerät meldet keine
  Sensordaten" angezeigt, obwohl z. B. eine Temperatur vorhanden war.
- **Fehlerbehebung "Gerät hat den Update-Befehl abgelehnt: HTTP 400"**: Aus
  demselben Grund konnte bei manchen Geräten auch das Auslösen eines
  Firmware-Updates fehlschlagen. Das Add-on versucht ein Update jetzt zuerst
  auf dem normalen Weg und – nur falls das Gerät dabei mit diesem Fehler
  antwortet – automatisch erneut über den `/cm`-Endpunkt, bevor es
  aufgibt.

## Änderungen in 1.1.0

- **Dark Mode**: Die Oberfläche folgt jetzt automatisch deiner
  Systemeinstellung (hell/dunkel). Über den Knopf 🌙/☀️ oben rechts kannst
  du das auch manuell umschalten; die Wahl wird in deinem Browser gespeichert.
- **Geräte-Detailansicht**: Ein Klick auf eine Gerätezeile (außerhalb des
  Namensfelds und der Aktions-Buttons) öffnet ein Fenster mit den
  Live-Sensordaten des Geräts: RSSI, WLAN-Signal, SSID, Uptime, freier
  Speicher sowie – sofern das Gerät die passende Hardware verbaut hat –
  Power, Apparent Power, Reactive Power, Power Factor, Voltage, Current,
  Frequency, Energy Total, Energy Last Hour, Energy Yesterday und
  Temperature/Humidity. Fehlt die entsprechende Hardware (z. B. kein
  Energiemessungs-Chip oder kein Temperaturfühler), werden nur die
  tatsächlich vorhandenen Werte angezeigt. Die Ansicht aktualisiert sich
  automatisch alle 8 Sekunden, solange sie geöffnet ist.
- **Benachrichtigungskanäle**: Im Bereich "Benachrichtigungen" kannst du
  jetzt beliebig viele Kanäle einrichten, ausgewählt über die
  Original-Symbole von Home Assistant, Telegram und WhatsApp:
  - **Home Assistant**: du gibst nur den Namen eines vorhandenen
    `notify.*`-Ziels an (z. B. deine Handy-App) – dafür muss nichts
    zusätzlich eingerichtet werden.
  - **Telegram**: du brauchst einen Bot-Token und eine Chat-ID (siehe
    Anleitung weiter unten).
  - **WhatsApp**: über den kostenlosen Dienst CallMeBot – du brauchst eine
    Telefonnummer und einen persönlichen API-Key (siehe Anleitung weiter
    unten).
  Jeder Kanal hat einen frei editierbaren Nachrichtentext (Platzhalter
  `{version}` und `{devices}`), lässt sich einzeln aktivieren/deaktivieren
  und per "Testnachricht senden" sofort ausprobieren. Ist kein Kanal
  eingerichtet, verhält sich das Add-on wie bisher und erstellt eine normale
  Home-Assistant-Benachrichtigung.
- **Fehlerbehebung "Aktualisieren tut nichts"**: Der Button
  "Firmware-Update" war bisher deaktiviert, solange das Add-on keine neuere
  Version kannte – dadurch reagierte er in manchen Fällen scheinbar gar
  nicht auf Klicks. Der Button ist jetzt immer klickbar (außer während ein
  Update bereits läuft oder der Chipsatz grundsätzlich kein Netzwerk-Update
  unterstützt) und überträgt auf Wunsch auch dann die aktuell bekannte
  Firmware erneut, wenn keine neuere Version gemeldet wird. Außerdem meldet
  "Alle aktualisieren" jetzt konkret zurück, wie viele Geräte aktualisiert
  bzw. übersprungen wurden (und warum). Die Chipsatz-Erkennung wurde zudem
  robuster gegen Groß-/Kleinschreibung und Leerzeichen gemacht – jedes
  Gerät bekommt weiterhin genau die zu seinem Chipsatz passende
  OTA-Datei (z. B. `OpenBK7231T_….rbl` für einen BK7231T, aber
  `OpenBK7231N_….rbl` für einen BK7231N).

### Telegram einrichten

1. Öffne in Telegram einen Chat mit **@BotFather**, sende `/newbot` und
   folge den Anweisungen (Name und Benutzername für deinen Bot vergeben).
2. BotFather antwortet mit deinem **Bot-Token** (sieht aus wie
   `123456789:AAExampleToken`). Dieses Token trägst du im Add-on ein.
3. Schreibe deinem neuen Bot eine beliebige Nachricht (z. B. "Hallo"),
   damit er weiß, mit wem er reden soll.
4. Öffne im Browser
   `https://api.telegram.org/bot<DEIN-TOKEN>/getUpdates` (dein Token
   anstelle von `<DEIN-TOKEN>` einsetzen). In der Antwort findest du
   `"chat":{"id": 123456789, ...}` – diese Zahl ist deine **Chat-ID**.
5. Bot-Token und Chat-ID im Add-on beim Kanaltyp "Telegram" eintragen.

### WhatsApp einrichten (über CallMeBot)

Es gibt keinen offiziellen kostenlosen WhatsApp-Versand ohne ein
Meta-Business-Konto einzurichten; [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/)
ist der gängige kostenlose Weg dafür und braucht nur zwei Schritte:

1. Speichere die Nummer **+34 644 84 71 04** in deinen Handy-Kontakten.
2. Schicke dieser Nummer per WhatsApp genau diese Nachricht:
   `I allow callmebot to send me messages`
3. Du bekommst kurz darauf eine WhatsApp-Nachricht mit deinem persönlichen
   **API-Key** zurück.
4. Deine Telefonnummer (mit Ländervorwahl, z. B. `491511234567`) und den
   API-Key im Add-on beim Kanaltyp "WhatsApp" eintragen.

CallMeBot ist ein kostenloser Drittanbieter-Dienst, keine offizielle
WhatsApp-/Meta-Funktion – für den gelegentlichen Update-Hinweis reicht das
aber gut aus.

## Änderungen in 1.0.1

- Der Web-UI-Port wird jetzt nicht mehr fest auf 8099 gelegt, sondern vom
  Supervisor automatisch frei vergeben (`ingress_port: 0`). Vorher konnte
  es wegen `host_network: true` zu "Address in use"/Absturzschleifen
  kommen, wenn Port 8099 auf dem Host bereits belegt war.
- Veraltete Architekturen (`armv7`, `armhf`, `i386`) wurden aus der Liste
  entfernt (Home Assistant hat 32-Bit-Systeme als veraltet markiert), das
  entfernt auch die zugehörige Warnung im Supervisor-Log.

**Wenn du bereits Version 1.0.0 installiert hattest:** Ersetze den kompletten
Ordner `openbk7231t_manager` unter `/addons/local/` durch die neue Version,
gehe dann zu **Einstellungen → Add-ons → OpenBK7231T Manager** und klicke
auf **Update** (bzw. über die drei Punkte auf **Neu bauen**, falls kein
Update-Button erscheint), und starte es danach neu.

## Was macht dieses Add-on?

Es verwaltet deine [OpenBK7231T_App](https://github.com/openshwprojects/OpenBK7231T_App)
(OpenBeken)-Geräte, ohne dass dafür eine Home-Assistant-Integration oder
MQTT nötig ist. Es spricht direkt die eingebaute HTTP-API der Firmware an:

- `GET /api/info` – liest Chipsatz, MAC-Adresse und Firmware-Version aus.
- `POST /api/cmnd` mit `ota_http <URL>` – weist das Gerät an, eine
  Firmware-Datei von einer HTTP-URL herunterzuladen, zu flashen und
  danach automatisch neu zu starten.

Das Add-on selbst lädt bei Bedarf die passende Firmware-Datei aus dem
[GitHub-Release](https://github.com/openshwprojects/OpenBK7231T_App/releases)
herunter, hält sie lokal bereit und schickt jedem Gerät genau die Datei,
die zu dessen Chipsatz passt (z. B. `OpenBK7231T_1.18.400.rbl` für einen
BK7231T, `OpenBK7231N_1.18.400.rbl` für einen BK7231N usw.).

**Wichtig:** Nicht jeder von OpenBK7231T_App unterstützte Chipsatz kann
per Netzwerk aktualisiert werden. Für einige ältere/kleinere Chips (z. B.
**BK7231M**) veröffentlicht das Projekt kein OTA-Image – solche Geräte
markiert das Add-on in der Liste als "nur UART/SPI-Flash möglich" und du
müsstest sie z. B. mit deinem BK7231GUIFlashTool per Kabel neu flashen.

## Voraussetzungen

- Deine OpenBK7231T-Geräte müssen per HTTP (Port 80, kein HTTPS) im
  gleichen Netzwerk wie Home Assistant erreichbar sein – das ist bei
  dieser Firmware der Normalfall.
- Falls du auf einem Gerät ein Admin-Passwort gesetzt hast, trage es beim
  Hinzufügen des Geräts mit ein (Benutzername ist bei OpenBK7231T_App
  immer fest `admin`).
- Das Add-on läuft mit `host_network: true`, damit es Geräte im LAN
  scannen und ihnen Firmware-Dateien direkt anbieten kann.

## Installation (als lokales Add-on)

Da dieses Add-on individuell für dich erstellt wurde, ist es kein
Eintrag im offiziellen Add-on-Store, sondern ein sogenanntes **lokales
Add-on**:

1. Entpacke das mitgelieferte ZIP. Du erhältst einen Ordner
   `openbk7231t_manager/`.
2. Kopiere diesen kompletten Ordner nach
   `/addons/local/openbk7231t_manager/` auf deinem Home-Assistant-System
   (z. B. über die Samba-Freigabe "addons", über das Add-on
   "SSH & Terminal", oder über "Studio Code Server"/"File editor"). Falls
   der Ordner `addons/local` noch nicht existiert, leg ihn einfach an.
3. Gehe in Home Assistant zu **Einstellungen → Add-ons → Add-on Store**,
   klicke oben rechts auf die drei Punkte und wähle **"Repositories
   aktualisieren"** (bzw. lade die Seite neu). Das Add-on erscheint jetzt
   unter **"Lokale Add-ons"**.
4. Öffne es, klicke auf **Installieren** und danach auf **Start**.
5. Aktiviere optional **"In Sidebar anzeigen"**, dann findest du es
   direkt im Menü.

## Bedienung

- **Gerät hinzufügen**: IP-Adresse eingeben (und Passwort, falls
  gesetzt). Das Add-on prüft sofort, ob dort ein OpenBK7231T-Gerät
  antwortet.
- **Netzwerk scannen**: durchsucht das Subnetz des Add-ons (automatisch
  erkannt, oder fest über die Einstellung `scan_subnet` vorgegeben) sowie
  per SSDP alle antwortenden Geräte. Gefundene Geräte kannst du mit einem
  Klick übernehmen.
- **Firmware-Update**: sobald ein neueres Release erkannt wurde, erscheint
  bei betroffenen Geräten ein Button "Firmware-Update". Das Gerät lädt die
  Datei vom Add-on herunter, flasht sie und startet neu; der Status
  aktualisiert sich automatisch.
- **Alle aktualisieren**: aktualisiert nacheinander alle Geräte, für die
  ein Update verfügbar ist (mit kurzer Pause zwischen den Geräten, um dein
  WLAN nicht zu überlasten).
- **Benachrichtigungen**: ist in der Konfiguration `notify_on_update`
  aktiviert (Standard), erstellt das Add-on automatisch eine
  Home-Assistant-Benachrichtigung, sobald ein neues Release erscheint,
  das mindestens eines deiner Geräte betrifft.

## Konfiguration

| Option | Bedeutung | Standard |
| --- | --- | --- |
| `scan_subnet` | Festes Subnetz für den Scan (z. B. `192.168.1.0/24`). Leer = automatisch erkennen. | leer |
| `poll_interval_minutes` | Wie oft bekannte Geräte auf Status/Version abgefragt werden. | 15 |
| `release_check_interval_hours` | Wie oft auf GitHub nach neuen Releases geprüft wird. | 6 |
| `notify_on_update` | Home-Assistant-Benachrichtigung bei neuem Release senden. | an |
| `firmware_server_port` | Port, über den Geräte die Firmware-Datei vom Add-on abrufen. | 8098 |
| `log_level` | Ausführlichkeit der Logs. | info |

## Wie wurde das getestet?

Da mir keine echten Geräte zur Verfügung standen, wurde die HTTP-API
direkt aus dem Quellcode von OpenBK7231T_App nachgebildet
(`src/httpserver/rest_interface.c`, `src/driver/drv_ssdp.c`,
`src/cmnds/cmd_main.c`) und gegen simulierte Geräte getestet, die exakt
dieselben Endpunkte (`/api/info`, `/api/cmnd`) und dasselbe Verhalten wie
die echte Firmware nachbilden. Im gebauten Docker-Image wurde damit der
komplette Ablauf durchgespielt: Gerät hinzufügen (inkl. falschem/richtigem
Passwort), Release-Prüfung, Erkennung "Update verfügbar", Firmware-Download
und -Cache, Auslösen des OTA-Updates samt Auslieferung der Firmware-Datei,
Status-Tracking bis "erfolgreich", Sammel-Update mehrerer Geräte,
Ablehnung bei nicht unterstütztem Chipsatz (BK7231M), Persistenz über
einen Neustart des Add-ons hinweg, sowie der Benachrichtigungsaufruf an
die Home-Assistant-Core-API.

Was sich damit **nicht** prüfen lässt, ist das Verhalten deiner konkreten
Geräte im echten Netzwerk (WLAN-Stabilität während des Flashens,
Firewall/VLAN-Besonderheiten). Aktualisiere daher beim ersten Einsatz am
besten zunächst ein unkritisches Gerät.
