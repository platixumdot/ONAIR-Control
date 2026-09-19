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

Die Steueroberfläche ist unter [http://localhost:5173/info-banner-control.html](http://localhost:5173/info-banner-control.html) erreichbar.

Dort können Überschrift und Zusatztext eingegeben und anschließend über **Banner einblenden** angezeigt werden.

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
