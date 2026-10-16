# ONAIR Control

**ONAir Control** ist eine lokale Live-Production-Control-Software für [OBS Studio](https://obsproject.com/).

Die Anwendung steuert OBS über die native **OBS WebSocket API** und bietet eine zentrale Oberfläche für:

- Szenenwechsel und Program/Preview-Steuerung
- Stream und Aufnahme
- OBS Browser Sources
- Lower Thirds und Countdowns
- Personen- und Overlay-Verwaltung
- Broadcast-Info-Banner
- lokale Einstellungen und Hotkeys

## Start

### Entwicklungsbetrieb

Abhängigkeiten installieren:

```powershell
npm install
```

Entwicklungsserver starten:

```powershell
npm run dev -- --host
```

Anschließend ist die Anwendung unter [http://localhost:5173](http://localhost:5173) erreichbar.

### Produktionsbetrieb

Für einen Produktionsstart ohne Vite Development Server:

```powershell
npm run build
npm start
```

Die Anwendung ist danach unter [http://localhost:3010](http://localhost:3010) erreichbar.

---

## OBS verbinden

ONAir Control benötigt **OBS Studio 28 oder neuer** und eine aktive OBS-WebSocket-Verbindung.

### 1. WebSocket-Server in OBS aktivieren

1. OBS Studio öffnen.
2. **Werkzeuge → WebSocket-Server-Einstellungen** öffnen.
3. **WebSocket-Server aktivieren** auswählen.
4. Die Standardadresse ist:

   ```text
   ws://127.0.0.1:4455
   ```

5. Passwortschutz aktivieren und ein Passwort festlegen.
6. Einstellungen speichern.

### 2. Verbindung in ONAIR Control herstellen

1. Im Control Center **Settings** öffnen.
2. OBS-Server-Adresse und Passwort eintragen.
3. **Mit OBS verbinden** klicken.

Nach erfolgreicher Verbindung werden die vorhandenen OBS-Szenen automatisch im Control Center angezeigt.

Szenenwechsel sowie die Steuerung von Stream und Aufnahme werden anschließend direkt an OBS übertragen.

---

## Android-Handykamera

Das Control Center kann Android-Smartphones im selben lokalen Netzwerk als Live-Kameraquelle verwenden. Das Android-Projekt liegt unter [`android-camera`](./android-camera).

### App bauen und koppeln

1. `android-camera` in Android Studio öffnen und das Projekt synchronisieren.
2. Über **Build → Build APK(s)** oder in PowerShell mit `.\gradlew.bat assembleDebug` (im Ordner `android-camera`) die App bauen und auf dem Android-Smartphone installieren. Die Debug-APK liegt danach unter `android-camera/app/build/outputs/apk/debug/app-debug.apk`.
3. Im Control Center unter **Live Production → Handykameras (Android)** einen Kameranamen eingeben und **Kamera koppeln** wählen.
4. In der Android-App **Mit QR-Code koppeln** antippen und den angezeigten QR-Code scannen.
5. Das Smartphone quer halten und Kamera- sowie Mikrofonzugriff erlauben. Die App ist auf Querformat eingestellt und überträgt Bild und Ton, sobald eine OBS-Quelle für diese Kamera geöffnet wird.
6. Im Control Center eine Szene auswählen und **OBS-Quelle hinzufügen** anklicken. Die Browser-Quelle zeigt **KEIN SIGNAL**, solange keine Verbindung bzw. kein Kamerabild anliegt.

Die Verbindung nutzt WebRTC direkt zwischen Android-App und OBS-Browser-Quelle; ein TURN-Server oder Internetzugang ist im gleichen LAN nicht nötig. Der Android-Build benötigt Android SDK 34 und unterstützt Geräte ab Android 8 (API 26). Die App läuft im Querformat, fordert 1080p/60 fps mit einer maximalen Video-Bitrate von 12 Mbit/s an und überträgt außerdem das Smartphone-Mikrofon. Ob ein Gerät 1080p/60 fps erreicht, hängt von den Kameraformaten, dem Hardware-Encoder und dem WLAN ab; bei Engpässen kann die tatsächliche Bildrate oder Qualität geringer sein.

Beim Anlegen einer Browser- oder Handykamera-Quelle wird standardmäßig die aktuelle Live-Szene (im Studio-Modus die Vorschau-Szene) als Ziel ausgewählt. Die Zielszene lässt sich vor dem Anlegen weiterhin im Feld **Szene, in die eingefügt wird** kontrollieren und ändern.

Für den OBS-Ton wird die Audioausgabe der Browser-Quelle in OBS umgeleitet. Kontrolliere nach dem Anlegen der Quelle den OBS-Audiomixer und stelle sicher, dass diese Quelle nicht stummgeschaltet ist.

Öffne das Control Center auf dem Produktionsrechner über dessen LAN-IP-Adresse oder Hostnamen (nicht `localhost`), damit der QR-Code für das Smartphone erreichbar ist. Kontrolliere vor dem Koppeln das Feld **Server-IP oder Hostname für das Smartphone**: Steht dort `localhost`, trage stattdessen die LAN-IP des Rechners ein und erzeuge bzw. erneuere den QR-Code. Die App zeigt bei Verbindungsproblemen jetzt Serveradresse und Netzwerkhinweis an. Der QR-Code enthält ein geheimes Kopplungstoken. Er darf nur auf dem eigenen lokalen Netzwerk verwendet und nicht weitergegeben werden. Mit **QR-Code erneuern** wird ein neuer Code erzeugt; der vorherige Code wird dadurch ungültig. Kamera-App und Produktionsrechner müssen sich im selben Netzwerk befinden. Bei Windows muss der Zugriff auf den ONAIR-Control-Port (standardmäßig TCP 3010) im lokalen Netzwerk erlaubt sein.

---

## AirPlay-Bildschirmspiegelung

ONAir Control kann unter Windows als AirPlay-Empfänger für die Bildschirmspiegelung von iPhone, iPad und Mac gestartet werden. Der Empfänger läuft als native Hintergrundkomponente; für OBS wird kein Plugin benötigt.

### Einmaliger Build

Der native Empfänger wird lokal gebaut und gebündelt. Dafür werden Windows, Git und MSYS2 benötigt. MSYS2 kann zum Beispiel über `winget install MSYS2.MSYS2` installiert werden. Danach im Projektverzeichnis ausführen:

```powershell
npm run airplay:build
```

Das Skript installiert die erforderlichen MSYS2-Build-Abhängigkeiten und erzeugt die Laufzeitdateien unter `native/airplay/runtime`. Für den Build werden die passenden GStreamer-Quellen aus dem offiziellen GStreamer-Repository geladen; eine Internetverbindung ist erforderlich. Danach ONAIR Control wie gewohnt starten.

### Verbinden und in OBS einfügen

1. Im Control Center **Live Production → AirPlay Screen Mirroring** öffnen und **AirPlay-Empfänger starten** klicken.
2. iPhone oder iPad: Kontrollzentrum öffnen und **Bildschirmsynchronisierung** wählen. Mac: in der Menüleiste **Bildschirmsynchronisierung** öffnen. **ONAir AirPlay** auswählen.
3. In ONAIR Control warten, bis **Bildschirm wird gespiegelt** angezeigt wird. Dann eine OBS-Zielszene auswählen und **Abgerundete AirPlay-Quelle hinzufügen** anklicken.

ONAir Control startet UxPlay mit sichtbarem Fenster und verwendet für den aktuellen Diagnoseversuch den GTX-1650-D3D11-H.264-Decoder (`d3d11h264dec`), `d3d11download` und `d3d11videosink`; OBS-WGC (`method=2`) zeigte damit beim echten Gerätetest das iPad-Bild. Der Softwaredecoder (`avdec_h264`) und auch `glimagesink` stürzten beim Wechsel des Streams von 1554×1080 auf 1920×1080 mit `0xC0000005` ab. Der aktuelle Diagnose-Build schaltet Audio mit `-as 0` ab, um die H.264-Decodierung weiter abzugrenzen. Das ist keine bestätigte Stabilitätskorrektur; während dieses Tests ist kein AirPlay-Ton zu erwarten. Beim Hinzufügen der OBS-Quelle wird jetzt ausdrücklich das Direct3D11-Fenster gewählt und ein OpenGL-Fenster nicht mehr als Ersatz akzeptiert. Die AirPlay-/GStreamer-Zeitstempelsynchronisierung wird mit UxPlays `-vsync no` abgeschaltet. Eine bloße AirPlay-Steuerverbindung oder ein GStreamer-Zustand `PLAYING` gilt nicht als laufendes Bild: ONAIR meldet den Videostream erst, wenn dekodierte Frames den H.264/H.265-Videosink erreichen, und setzt den Status nach 3,5 Sekunden ohne neue Frames zurück. Pausen und Videofehler beenden den Status ebenfalls.

Nach dem Update ONAIR neu starten und den Empfänger erneut starten. Beim Hinzufügen aktiviert ONAIR die Fensteraufnahme, wartet bis zu zehn Sekunden auf das UxPlay-Videofenster, wählt es aus, fügt es der gewählten Szene hinzu und aktiviert den Alpha-Maskenfilter mit abgerundeten Ecken. Unter Windows 10 (1903+) und Windows 11 wird OBS explizit auf die Windows Graphics Capture-Methode (WGC, `method=2`) gesetzt, statt die automatische Erkennung zu verwenden. OBS 32 und neuer verwendet dabei die UUIDs der Hauptcanvas, Szenen und Quellelemente. Beim Trennen des Geräts bleibt der Empfänger aktiv und kann erneut verbunden werden. UxPlay-/GStreamer-Ausgaben, Frame-Marker und Exitcodes werden mit Zeitstempel in `data/airplay.log` geschrieben. Ein erneuter Streamstart nach Pause oder Verbindungsabbruch sowie die sichtbare OBS-Ausgabe müssen mit dem iPad und der lokalen OBS-Instanz geprüft werden; der Frame-Marker bestätigt Frames am GStreamer-Videosink, nicht deren tatsächliche Sichtbarkeit im OBS-Canvas.

Apple-Gerät und Produktionsrechner müssen sich im selben lokalen Netzwerk befinden. Erlaube ONAIR Control beziehungsweise dem AirPlay-Empfänger in der Windows-Firewall den Zugriff auf private Netzwerke und stelle sicher, dass Bonjour/mDNS im Netzwerk nicht blockiert wird. AirPlay sollte nicht ungeschützt über das Internet erreichbar gemacht werden. Die integrierte Empfangskomponente ist derzeit nur für Windows vorgesehen.

Beim letzten echten iPad-Test blieb der D3D11-Ausgabepfad mit Audio deaktiviert stabil, bis das iPad bei Videostart von 1554×1080 auf 1920×1080 wechselte; laut lokalem Log folgte der Absturz 226 ms später. Das Formular meldete zugleich einen längeren stabilen Zeitraum, daher ist die genaue Beobachtung beim nächsten Test wichtig. Der `avdec_h264`-Softwaredecoder sowie `glimagesink` zeigten denselben Fehler beim Auflösungswechsel. ONAIR setzte den Videostatus bei Pause zurück. OBS wählte bei einem Lauf ein altes OpenGL-Fenster statt des Direct3D11-Fensters; die Auswahl ist jetzt auf das aktuelle `GSTD3D11`-Fenster eingeschränkt. Im Log gab es NTP-Timeouts; sie sind keine bestätigte Ursache. Das Windows-Anwendungsprotokoll enthielt keinen passenden Fehlerbericht für den aktuellen Runtime-Absturz; ältere UxPlay-Fehlerberichte bezogen sich auf einen separaten temporären Build. Der nächste Test verwendet den D3D11-Hardwaredecoder; Dauerbetrieb, Auflösungswechsel, OBS-Ausgabe und Wiederverbindung bleiben zu bestätigen.

### Lizenzen

Der Empfänger verwendet UxPlay (GPLv3), GStreamer (LGPL) und weitere Bibliotheken mit eigenen Lizenzbedingungen. Die Lizenztexte für UxPlay und dessen eingebettete Komponenten liegen unter `native/airplay/licenses` beziehungsweise `native/airplay/source`; der Build bündelt außerdem die MSYS2-Lizenzhinweise unter `native/airplay/runtime/licenses/msys2`. Der zugehörige Quellcode befindet sich unter `native/airplay/source`. Beim Weitergeben eines Builds müssen die jeweiligen Lizenzbedingungen und Pflichten zur Bereitstellung des Quellcodes beachtet werden.

---

## Browser-Source-Overlays

ONAIR Control kann Overlay-Quellen automatisch in OBS-Szenen anlegen.

Öffne dazu im Control Center den Bereich **OBS Browser Sources**, wähle eine Zielszene und klicke auf:

- **+ Lower Third**
- **+ Countdown**

Die entsprechende Browser Source wird automatisch mit einer Auflösung von **1920 × 1080 Pixeln** in der ausgewählten OBS-Szene angelegt.

### Lower Third

Personen können im Bereich **People** angelegt und anschließend über **Einblenden** als Lower Third angezeigt werden.

### Countdown

Der Countdown kann über **5 Minuten starten** aktiviert werden.

### Overlay-Renderer direkt aufrufen

Die Renderer sind auch unabhängig vom Control Center verfügbar:

- Lower Third: [http://localhost:5173/overlay/lower-third](http://localhost:5173/overlay/lower-third)
- Countdown: [http://localhost:5173/overlay/countdown](http://localhost:5173/overlay/countdown)

> **Hinweis:** Wird ONAIR Control von einem zweiten Rechner im LAN verwendet, muss `localhost` durch die LAN-IP-Adresse des Rechners ersetzt werden, auf dem ONAIR Control läuft.

Für einen Zugriff außerhalb des lokalen Netzwerks sollten vor dem API-Server geeignete **Authentifizierungs- und TLS-Mechanismen** eingerichtet werden.

---

## Info-Banner

Für Lauftexte, Hinweise und Programminformationen steht ein separates, animiertes Broadcast-Banner zur Verfügung.

### Banner in OBS einrichten

1. In OBS eine neue **Browser Source** hinzufügen.

2. Als URL eintragen:

   ```text
   http://localhost:5173/overlay-info-banner.html
   ```

3. Die Größe auf **1920 × 1080** setzen.

4. Die Browser Source oberhalb der übrigen Szenenelemente anordnen.

### Banner steuern

Das Info-Banner kann direkt im **normalen Control Panel** bearbeitet und gesteuert werden. Eine separate Steuerseite ist dafür nicht erforderlich.

Dort können unter anderem:

* Überschrift
* Zusatztext
* Anzeigezustand

angepasst werden.

Über **Banner einblenden** wird das Banner direkt in der OBS Browser Source angezeigt.

Das Banner blendet animiert ein und aus. Der übrige OBS-Canvas bleibt dabei vollständig transparent.

---

## Daten und Persistenz

ONAir Control verwendet keine Beispieldaten.

Lokale Konfigurationen werden in

```text
data/state.json
```

gespeichert. Dazu gehören unter anderem:

- Personen
- Brand Kit
- Hotkeys
- OBS-Verbindungsdaten

Die verfügbaren OBS-Szenen werden **nicht lokal gespeichert**, sondern ausschließlich aus der aktuell verbundenen OBS-Instanz übernommen.

### Verhalten bei Verbindungsabbruch

Wird die Verbindung zu OBS unterbrochen, zeigt das Dashboard den entsprechenden Verbindungsfehler an.

ONAir Control versucht anschließend automatisch, die Verbindung **alle fünf Sekunden** wiederherzustellen.

---

## Voraussetzungen

- **Node.js** mit npm
- **OBS Studio 28 oder neuer**
- aktivierter OBS-WebSocket-Server
- Netzwerkzugriff auf den ONAIR-Control-Server, wenn OBS oder Browser Sources auf einem anderen Rechner betrieben werden
