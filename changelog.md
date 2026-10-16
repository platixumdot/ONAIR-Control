# ONAir Control – Changelog

## v0.7.0-alpha

**AirPlay-Bildschirmspiegelung und OBS-Fenstererkennung**

- iPhone, iPad und Mac können ihren Bildschirm per AirPlay an den integrierten Windows-Empfänger spiegeln.
- Der Empfänger lässt sich im Control Center starten und stoppen; Verbindungsstatus und Gerätename werden angezeigt.
- Mit einem Klick wird das Empfängerfenster als OBS-Fensteraufnahme zur ausgewählten Szene hinzugefügt und mit einem Alpha-Maskenfilter für abgerundete Ecken versehen.
- Die OBS-Fensteraufnahme wird vor der Fenstererkennung aktiviert, damit OBS das AirPlay-Fenster auflisten kann.
- OBS wartet bis zu zehn Sekunden auf das UxPlay-Videofenster; die Fehlermeldung unterscheidet nun eine AirPlay-Steuerverbindung vom tatsächlich gestarteten Bildschirmstream.
- UxPlay testet `d3d11h264dec` (GTX 1650), `d3d11download` und `d3d11videosink`; die Audioausgabe ist mit `-as 0` für diesen Diagnoseversuch vorübergehend deaktiviert.
- Für reproduzierbar getrennte Zeitstempel- und Sink-Synchronisierung verwendet UxPlay `-vsync no`; die bisherige Sink-Option `sync=false` wurde intern von UxPlay mit `sync=true` überschrieben.
- `-avdec` bleibt als Softwaredecoder aktiv (CPU); das Empfängerfenster wird nicht mehr mit verstecktem Windows-Startstatus erzeugt, damit OBS es aufnehmen kann.
- Der Runtime-Build erkennt zusätzlich `d3d11h264dec` über DXVA und die GTX 1650. Der Hardwaredecoder bleibt bis zum direkten iPad-Test bewusst unselektiert, da ein früherer D3D11-Lauf mit `0xC0000005` endete.
- Der Videostreamstatus setzt echte, am GStreamer-Videosink eintreffende Frames voraus, fällt bei Pausen/Fehlern sofort und nach 3,5 Sekunden ohne Frames zurück und behauptet bei bloßem `PLAYING` keinen Stream.
- Der Frame-Diagnosemarker wird nur auf H.264/H.265-Renderern erfasst und über den GStreamer-Bus im Hauptthread protokolliert; JPEG-Cover-Art zählt nicht als Bildschirmvideo.
- OBS-Fensteraufnahmen verwenden explizit Windows Graphics Capture (`method=2`); der Nutzer bestätigte bei einem echten iPad-Test ein sichtbares Bild in OBS mit D3D11. Das OpenGL-Fenster war in OBS nicht auswählbar.
- Bei mehreren UxPlay-Fenstern wählt ONAIR jetzt ausschließlich den Direct3D11-Renderer (`GSTD3D11`) aus; ein veraltetes OpenGL-Fenster kann die AirPlay-Quelle nicht mehr ersetzen.
- UxPlay-/GStreamer-Ausgaben, Frame-Marker und Exitcodes werden mit Zeitstempel in `data/airplay.log` protokolliert. OBS-Quelle und abgerundeter Maskenfilter werden beim Hinzufügen erstellt/aktualisiert und aktiviert.
- OBS-32-Canvas- und Szenenquellen werden beim Hinzufügen über ihre UUIDs angesprochen; neue Szenenelemente verwenden direkt die von OBS zurückgegebene ID.
- Der native UxPlay/GStreamer-Empfänger kann mit `npm run airplay:build` lokal gebaut werden. Hinweise zu Netzwerk, Build und Lizenzen stehen in der README.

### Verifiziert

- `npm run build` erfolgreich
- `npm test`: 22 Tests erfolgreich
- Native UxPlay-Rendereränderung kompiliert; Windows-Runtime mit 325 Dateien neu gebündelt
- `gst-inspect-1.0` bestätigt `d3d11videosink`, `avdec_h264` und `d3d11h264dec` (NVIDIA GeForce GTX 1650)
- UxPlay-Start mit den neuen Flags blieb im Runtime-Smoke-Test fünf Sekunden aktiv; ohne Apple-Gerät konnte dabei kein Video-Stream erzeugt werden.
- Echte iPad-Tests mit D3D11 und OpenGL lieferten jeweils H.264-Frames; beide stürzten beim Wechsel von 1554×1080 auf 1920×1080 mit `0xC0000005` ab. Das D3D11-Diagnosebuild mit Audio aus zeigte den Absturz laut Log 226 ms nach dem Auflösungswechsel. Ein passender Windows-Fehlerbericht für den Runtime-Build war nicht vorhanden.
- OBS-WGC (`method=2`) beseitigte das zuvor beobachtete Schwarzbild mit D3D11. ONAIR setzte den Streamstatus bei Pause korrekt zurück. Der D3D11-Hardwaredecoder-Vergleich und dauerhafte Wiedergabe, Wiederverbindung sowie OBS-Program-Ausgabe sind noch zu bestätigen. In der getesteten OBS-Sitzung war „Cam 05“ nur Vorschau, während „Cam 04“ Program war.

**Version:** `v0.7.0-alpha`  
**Release-Typ:** Alpha Release
> **Alpha-Hinweis:**  
> v0.7.0-alpha befindet sich in aktiver Entwicklung und ist noch nicht final. Die aktualisierte AirPlay-Ausgabe benötigt vor einer Stabilitätsaussage noch den dokumentierten iPad-/OBS-Gerätetest.