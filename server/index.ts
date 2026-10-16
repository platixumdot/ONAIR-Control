import 'dotenv/config'; import express from 'express'; import cors from 'cors'; import { randomBytes, timingSafeEqual } from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { WebSocketServer, WebSocket } from 'ws';
import type { RequestHandler } from 'express';
import { loadState, saveState } from './store.js'; import { ObsControl } from './obs.js'; import { AirPlayReceiver } from './airplay.js'; import { ensureAirPlayMask } from './airplayMask.js'; import type { AppState, PhoneCamera } from './types.js';
let state: AppState = loadState(); const app = express(); app.use(cors()); app.use(express.json()); const port = Number(process.env.PORT || 3010); const clients = new Set<WebSocket>(); const publishers = new Map<string, WebSocket>(); const viewers = new Map<string, Set<WebSocket>>();
function snapshot() { const { phoneCameras: _privateCameras, ...publicState } = state; return { state: publicState, runtime: obs.runtime, airplay: airplay.status, phoneCameras: state.phoneCameras.map(({ id, name }) => ({ id, name, connected: publishers.get(id)?.readyState === WebSocket.OPEN })) }; } function broadcast() { const message = JSON.stringify({ type: 'state', ...snapshot() }); clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(message)); }
const airplay = new AirPlayReceiver(broadcast); const obs = new ObsControl(broadcast); obs.configure(state.obs.url, state.obs.password); function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase()).join(''); }
const requireSameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).hostname !== req.hostname) return res.status(403).json({ error: 'Kamera-Kopplung ist nur aus dem Control Center erlaubt.' });
    } catch {
      return res.status(403).json({ error: 'Ungültiger Anfrage-Ursprung.' });
    }
  }
  next();
};
app.get('/api/config', (req, res) => { const socketScheme = req.query.scheme === 'https:' ? 'wss' : 'ws'; res.json({ signalingUrl: `${socketScheme}://${req.hostname}:${port}/ws` }); });
app.get('/api/state', (_, res) => res.json(snapshot()));
app.get('/api/banner', (_, res) => res.json((state as AppState & { infoBanner?: { visible: boolean; headline: string; detail: string } }).infoBanner || { visible: false, headline: '', detail: '' }));
app.post('/api/banner', (req, res) => { const payload = req.body || {}; (state as AppState & { infoBanner?: { visible: boolean; headline: string; detail: string } }).infoBanner = { visible: Boolean(payload.visible), headline: String(payload.headline || ''), detail: String(payload.detail || '') }; saveState(state); broadcast(); res.json({ ok: true }); });
app.post('/api/phone-cameras', requireSameOrigin, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const host = String(req.body?.host || req.hostname);
  if (!name || name.length > 60) return res.status(400).json({ error: 'Bitte einen Namen mit maximal 60 Zeichen eingeben.' });
  if (!/^[a-zA-Z0-9.:[\]-]+$/.test(host)) return res.status(400).json({ error: 'Ungültiger Servername für die QR-Kopplung.' });
  const camera: PhoneCamera = { id: crypto.randomUUID(), name, token: randomBytes(32).toString('hex') };
  state.phoneCameras.push(camera); saveState(state); broadcast();
  const socketScheme = req.body?.scheme === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({ server: `${socketScheme}://${host}:${port}/ws`, session: camera.id, token: camera.token });
  res.status(201).json({ camera: { id: camera.id, name: camera.name }, pairingUrl: `onaircam://pair?${params.toString()}` });
});
app.post('/api/phone-cameras/:id/pairing', requireSameOrigin, (req, res) => {
  const camera = state.phoneCameras.find((item) => item.id === req.params.id);
  if (!camera) return res.status(404).json({ error: 'Kamera nicht gefunden.' });
  const host = String(req.body?.host || req.hostname);
  if (!/^[a-zA-Z0-9.:[\]-]+$/.test(host)) return res.status(400).json({ error: 'Ungültiger Servername für die QR-Kopplung.' });
  publishers.get(camera.id)?.close(1008, 'Kopplungscode erneuert');
  camera.token = randomBytes(32).toString('hex'); saveState(state);
  const socketScheme = req.body?.scheme === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({ server: `${socketScheme}://${host}:${port}/ws`, session: camera.id, token: camera.token });
  res.json({ camera: { id: camera.id, name: camera.name }, pairingUrl: `onaircam://pair?${params.toString()}` });
});
app.delete('/api/phone-cameras/:id', requireSameOrigin, (req, res) => {
  const camera = state.phoneCameras.find((item) => item.id === req.params.id);
  if (!camera) return res.status(404).json({ error: 'Kamera nicht gefunden.' });
  publishers.get(camera.id)?.close(1008, 'Kamera entfernt');
  viewers.get(camera.id)?.forEach((viewer) => viewer.close(1008, 'Kamera entfernt'));
  publishers.delete(camera.id); viewers.delete(camera.id);
  state.phoneCameras = state.phoneCameras.filter((item) => item.id !== camera.id); saveState(state); broadcast();
  res.json({ ok: true });
});
app.post('/api/action', async (req, res) => { const { action, payload = {} } = req.body; try {
  if (action === 'connect') { state.obs = { url: String(payload.url), password: String(payload.password || '') }; saveState(state); await obs.configure(state.obs.url, state.obs.password); }
  else if (action === 'refresh') await obs.refresh(); else if (action === 'program') await obs.setProgram(String(payload.scene)); else if (action === 'preview') await obs.setPreview(String(payload.scene)); else if (action === 'take') await obs.take(); else if (action === 'stream') await obs.toggleStream(); else if (action === 'record') await obs.toggleRecord(); else if (action === 'createScene') await obs.createScene(String(payload.name));
  else if (action === 'inputMute') await obs.setInputMute(String(payload.input), Boolean(payload.muted)); else if (action === 'toggleInputMute') await obs.toggleInputMute(String(payload.input));
  else if (action === 'saveBranding') { state.branding = { ...state.branding, ...payload }; saveState(state); } else if (action === 'saveHotkeys') { state.hotkeys = payload.hotkeys; saveState(state); }
  else if (action === 'addPerson') { const name = String(payload.name || '').trim(); const role = String(payload.role || '').trim(); if (!name || !role) throw new Error('Name und Rolle sind erforderlich.'); state.people.push({ id: crypto.randomUUID(), name, role, company: String(payload.company || ''), color: String(payload.color || '#8059ff'), initials: initials(name) }); saveState(state); }
  else if (action === 'deletePerson') { state.people = state.people.filter(p => p.id !== payload.id); if (state.lowerThird?.id === payload.id) { state.lowerThird = null; state.lowerThirdVisible = false; } saveState(state); }
  else if (action === 'lowerThird') { const person = state.people.find(p => p.id === payload.personId); if (!person) throw new Error('Person nicht gefunden.'); state.lowerThird = person; state.lowerThirdVisible = true; saveState(state); }
  else if (action === 'hideLowerThird') { state.lowerThirdVisible = false; saveState(state); }
  else if (action === 'countdown') { state.countdown = { ...state.countdown, visible: Boolean(payload.visible), endsAt: payload.seconds ? Date.now() + Number(payload.seconds) * 1000 : state.countdown.endsAt, title: String(payload.title || state.countdown.title) }; saveState(state); }
  else if (action === 'addBrowserSource') { const base = String(payload.baseUrl || 'http://localhost:5173'); const kind = String(payload.kind); const name = kind === 'countdown' ? 'ONAIR Starting Soon' : kind === 'info-banner' ? 'ONAIR Info Banner' : 'ONAIR Lower Third'; const url = kind === 'info-banner' ? `${base}/overlay-info-banner.html` : `${base}/overlay/${kind}`; await obs.addBrowserSource(String(payload.scene), name, url, 1920, 1080); }
  else if (action === 'addPhoneCameraSource') { const camera = state.phoneCameras.find((item) => item.id === String(payload.cameraId)); if (!camera) throw new Error('Handykamera nicht gefunden.'); const base = new URL(String(payload.baseUrl)); if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Ungültige Adresse für die Browser-Source.'); await obs.addBrowserSource(String(payload.scene), `ONAIR Handykamera - ${camera.name}`, `${base.origin}/phone-camera/${camera.id}`, 1920, 1080, true); }
  else if (action === 'startAirPlay') airplay.start();
  else if (action === 'stopAirPlay') await airplay.stop();
  else if (action === 'addAirPlaySource') {
    if (!airplay.status.running || !airplay.status.connected) throw new Error('Verbinde zuerst ein Apple-Gerät mit „ONAir AirPlay“.');
    if (!airplay.status.videoStreaming) throw new Error('Starte zuerst die Bildschirmsynchronisierung und warte, bis das iPad-Bild gespiegelt wird.');
    await obs.addAirPlaySource(String(payload.scene), 'ONAIR AirPlay', ensureAirPlayMask(path.join(root, 'data')));
  }
  else if (action === 'music') await obs.music(String(payload.input), payload.mediaAction);
  else throw new Error('Unbekannte Aktion.'); broadcast(); res.json({ ok: true, ...snapshot() });
} catch (e) { const message = e instanceof Error ? e.message : 'Action failed'; obs.runtime.lastError = message; broadcast(); res.status(400).json({ error: message }); } });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); app.use(express.static(path.join(root, 'public'))); app.use(express.static(path.join(root, 'dist'))); app.get('/{*splat}', (_, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
const server = app.listen(port, () => console.log(`[OnAir] Control layer listening on :${port}`)); server.on('close', () => { void airplay.stop().catch(error => console.error('[OnAir] Failed to stop AirPlay receiver:', error)); }); const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, request) => {
  const params = new URL(request.url || '/', 'http://localhost').searchParams;
  const role = params.get('role');
  if (role !== 'publisher' && role !== 'viewer') {
    clients.add(ws); ws.send(JSON.stringify({ type: 'state', ...snapshot() }));
    ws.on('close', () => clients.delete(ws));
    return;
  }

  const cameraId = params.get('session') || '';
  const camera = state.phoneCameras.find((item) => item.id === cameraId);
  const suppliedToken = params.get('token') || '';
  const tokenMatches = camera && /^[a-f0-9]{64}$/.test(suppliedToken) && suppliedToken.length === camera.token.length &&
    timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(camera.token));
  if (!camera || (role === 'publisher' && !tokenMatches)) {
    ws.close(1008, 'Ungültige Kamerakopplung');
    return;
  }

  if (role === 'publisher') {
    const previous = publishers.get(cameraId);
    if (previous && previous !== ws) previous.close(4001, 'Neue Kameraverbindung');
    publishers.set(cameraId, ws);
    broadcast();
  } else {
    const cameraViewers = viewers.get(cameraId) || new Set<WebSocket>();
    cameraViewers.add(ws); viewers.set(cameraId, cameraViewers);
  }

  ws.on('message', (data) => {
    let message: { type?: string };
    try { message = JSON.parse(data.toString()); } catch { ws.close(1003, 'Ungültige Nachricht'); return; }
    if (message.type === 'publisher-ready' && role === 'publisher') {
      if (viewers.get(cameraId)?.size) ws.send(JSON.stringify({ type: 'viewer-ready' }));
      return;
    }
    if (message.type === 'viewer-ready' && role === 'viewer') {
      const publisher = publishers.get(cameraId);
      if (publisher?.readyState === WebSocket.OPEN) publisher.send(JSON.stringify(message));
      return;
    }
    const relay = JSON.stringify(message);
    if (role === 'publisher') {
      viewers.get(cameraId)?.forEach((viewer) => viewer.readyState === WebSocket.OPEN && viewer.send(relay));
    } else {
      const publisher = publishers.get(cameraId);
      if (publisher?.readyState === WebSocket.OPEN) publisher.send(relay);
    }
  });

  ws.on('close', () => {
    if (role === 'publisher') {
      if (publishers.get(cameraId) === ws) {
        publishers.delete(cameraId);
        viewers.get(cameraId)?.forEach((viewer) => viewer.readyState === WebSocket.OPEN && viewer.send(JSON.stringify({ type: 'peer-disconnected' })));
        broadcast();
      }
    } else {
      const cameraViewers = viewers.get(cameraId);
      cameraViewers?.delete(ws);
      if (cameraViewers?.size === 0) {
        viewers.delete(cameraId);
        const publisher = publishers.get(cameraId);
        if (publisher?.readyState === WebSocket.OPEN) publisher.send(JSON.stringify({ type: 'peer-disconnected' }));
      }
    }
  });
});
