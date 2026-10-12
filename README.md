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

## Browser-Source-Overlays

ONAir Control kann Overlay-Quellen automatisch in OBS-Szenen anlegen.

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
