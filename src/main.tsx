import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MantineProvider,
  AppShell,
  Group,
  Stack,
  Text,
  Title,
  Button,
  Paper,
  Badge,
  SimpleGrid,
  TextInput,
  PasswordInput,
  ColorInput,
  Select,
  Divider,
  ActionIcon,
  ThemeIcon,
  Modal,
} from '@mantine/core';
import {
  IconBroadcast,
  IconUsers,
  IconSettings,
  IconRefresh,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconLayoutGrid,
  IconDeviceMobile,
  IconQrcode,
} from '@tabler/icons-react';
import QRCode from 'qrcode';
import '@mantine/core/styles.css';
import './styles.css';
import { getSceneBadgeState } from './sceneState';

type Person = { id: string; name: string; role: string; company?: string; color: string; initials: string };
type InputSource = { name: string; kind: string; muted: boolean };
type PhoneCamera = { id: string; name: string; connected: boolean };
type State = {
  obs: { url: string; password: string };
  branding: { primary: string; show: string };
  people: Person[];
  lowerThird: Person | null;
  lowerThirdVisible: boolean;
  countdown: { endsAt: number | null; visible: boolean; title: string };
};
type Runtime = {
  connected: boolean;
  scenes: { name: string }[];
  musicInputs: string[];
  inputSources: InputSource[];
  program: string | null;
  preview: string | null;
  streaming: boolean;
  recording: boolean;
  streamTimecode: string;
  studioMode: boolean;
  lastError: string | null;
};
type Feed = { state: State; runtime: Runtime; s: State; phoneCameras: PhoneCamera[] };
type Banner = { visible: boolean; headline: string; detail: string };

const api = async (action: string, payload: object = {}) => {
  const r = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });

  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
};

const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

function useFeed() {
  const [d, setD] = useState<Feed | null>(null);

  useEffect(() => {
    const normalize = (x: Omit<Feed, 's'>) => setD({ ...x, s: x.state });

    fetch('/api/state')
      .then((r) => r.json())
      .then(normalize);

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    socket.onmessage = (event) => normalize(JSON.parse(event.data));
    return () => {
      socket.close();
    };
  }, []);

  return d;
}

function RollingTime({ value }: { value: string }) {
  const old = useRef(value);
  const [previous, setPrevious] = useState(value);

  useEffect(() => {
    setPrevious(old.current);
    old.current = value;
  }, [value]);

  return (
    <span className="rolling-time">
      {value.split('').map((digit, index) =>
        digit === ':' ? (
          <em key={index}>:</em>
        ) : (
          <span className="digit-slot" key={index}>
            {previous[index] === digit ? (
              <b>{digit}</b>
            ) : (
              <>
                <i>{previous[index]}</i>
                <b>{digit}</b>
              </>
            )}
          </span>
        )
      )}
    </span>
  );
}

function Overlay() {
  const d = useFeed();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    document.documentElement.classList.add('overlay-document');
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => {
      document.documentElement.classList.remove('overlay-document');
      clearInterval(i);
    };
  }, []);

  if (!d) return null;

  const s = d.state;

  if (location.pathname.endsWith('countdown')) {
    const secs = Math.max(0, Math.ceil(((s.countdown.endsAt || Date.now()) - now) / 1000));

    return (
      <div className={'starting-soon ' + (!s.countdown.visible ? 'hidden' : '')}>
        <div className="starting-glow" />
        <div className="starting-content">
          <span className="starting-kicker">{s.branding.show || 'LIVE PRODUCTION'}</span>
          <h1>
            STARTING
            <br />
            <i>SOON</i>
          </h1>
          <div className="starting-rule" />
          <p>{s.countdown.title}</p>
          <RollingTime value={fmt(secs)} />
        </div>
      </div>
    );
  }

  const p = s.lowerThird;
  return (
    <div className={'overlay-canvas ' + (!s.lowerThirdVisible ? 'hidden' : '')}>
      {p && (
        <div className="lower-third broadcast">
          <span style={{ background: p.color }}>{p.initials}</span>
          <div>
            <b>{p.name}</b>
            <small>{p.role}</small>
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneCameraSource({ cameraId }: { cameraId: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [hasSignal, setHasSignal] = useState(false);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let peer: RTCPeerConnection | null = null;
    let reconnectTimer: number | undefined;
    let pendingCandidates: RTCIceCandidateInit[] = [];

    const closePeer = () => {
      peer?.close();
      peer = null;
      pendingCandidates = [];
      if (video.current) video.current.srcObject = null;
      setHasSignal(false);
    };

    const connect = async () => {
      try {
        const configResponse = await fetch(`/api/config?scheme=${encodeURIComponent(location.protocol)}`);
        if (!configResponse.ok) throw new Error('Signalisierungsserver nicht erreichbar.');
        const { signalingUrl } = await configResponse.json() as { signalingUrl: string };
        if (stopped) return;

        const currentSocket = new WebSocket(`${signalingUrl}?role=viewer&session=${encodeURIComponent(cameraId)}`);
        socket = currentSocket;
        currentSocket.onopen = () => currentSocket.send(JSON.stringify({ type: 'viewer-ready' }));
        currentSocket.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          if (message.type === 'peer-disconnected') {
            closePeer();
            return;
          }
          if (message.type === 'offer') {
            peer?.close();
            peer = null;
            if (video.current) video.current.srcObject = null;
            setHasSignal(false);
            const connection = new RTCPeerConnection({ iceServers: [] });
            peer = connection;
            connection.ontrack = (trackEvent) => {
              const stream = trackEvent.streams[0] || new MediaStream([trackEvent.track]);
              if (video.current) video.current.srcObject = stream;
              setHasSignal(true);
            };
            connection.onicecandidate = (candidateEvent) => {
              if (candidateEvent.candidate && currentSocket.readyState === WebSocket.OPEN) {
                currentSocket.send(JSON.stringify({ type: 'candidate', candidate: candidateEvent.candidate }));
              }
            };
            connection.onconnectionstatechange = () => {
              if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected' || connection.connectionState === 'closed') {
                setHasSignal(false);
              }
            };
            await connection.setRemoteDescription(message.description);
            for (const candidate of pendingCandidates) await connection.addIceCandidate(candidate);
            pendingCandidates = [];
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            currentSocket.send(JSON.stringify({ type: 'answer', description: connection.localDescription }));
          } else if (message.type === 'candidate' && message.candidate) {
            if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate);
            else pendingCandidates.push(message.candidate);
          }
        };
        currentSocket.onclose = () => {
          if (socket === currentSocket) socket = null;
          closePeer();
          if (!stopped) reconnectTimer = window.setTimeout(connect, 2000);
        };
        currentSocket.onerror = () => currentSocket.close();
      } catch {
        if (!stopped) reconnectTimer = window.setTimeout(connect, 2000);
      }
    };

    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
      closePeer();
    };
  }, [cameraId]);

  return (
    <div className="phone-camera-source">
      <video ref={video} autoPlay playsInline />
      {!hasSignal && <div className="phone-camera-no-signal"><span>KEIN SIGNAL</span></div>}
    </div>
  );
}

function App() {
  const d = useFeed();
  const [page, setPage] = useState<'live' | 'people' | 'settings'>('live');

  if (!d) return <div className="app-loading">Lade Control Center...</div>;

  return (
    <MantineProvider forceColorScheme="dark" theme={{ primaryColor: 'blue', fontFamily: 'Manrope, sans-serif' }}>
      <AppShell header={{ height: 66 }} navbar={{ width: 214, breakpoint: 'sm' }} padding="lg">
        <AppShell.Header className="app-header">
          <Group h="100%" px="xl" justify="space-between">
            <Group>
              <ThemeIcon color="blue">
                <IconBroadcast size={18} />
              </ThemeIcon>
              <Text fw={800}>ONAIR CONTROL</Text>
            </Group>
            <Badge color={d.runtime.connected ? 'teal' : 'red'}>
              {d.runtime.connected ? '● OBS CONNECTED' : '● OBS OFFLINE'}
            </Badge>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="sm" className="app-nav">
          <Stack>
            <Button variant={page === 'live' ? 'light' : 'subtle'} leftSection={<IconLayoutGrid size={16} />} onClick={() => setPage('live')}>
              Live Production
            </Button>
            <Button variant={page === 'people' ? 'light' : 'subtle'} leftSection={<IconUsers size={16} />} onClick={() => setPage('people')}>
              People
            </Button>
            <Button variant={page === 'settings' ? 'light' : 'subtle'} leftSection={<IconSettings size={16} />} onClick={() => setPage('settings')}>
              Settings
            </Button>
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          {page === 'live' ? <Live d={d} /> : page === 'people' ? <People s={d.state} /> : <Settings s={d.state} />}
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

function Live({ d }: { d: Feed }) {
  const { state: s, runtime: r } = d;
  const [targetScene, setTargetScene] = useState('');
  const [sourceKind, setSourceKind] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [addingSource, setAddingSource] = useState(false);

  useEffect(() => {
    if (!targetScene && r.scenes[0]) setTargetScene(r.scenes[0].name);
    else if (targetScene && !r.scenes.some((item) => item.name === targetScene)) setTargetScene(r.scenes[0]?.name || '');
  }, [r.scenes, targetScene]);

  const act = (a: string, p?: object) => api(a, p);
  const setProgramScene = (sceneName: string) => act('program', { scene: sceneName });
  const setPreviewScene = (sceneName: string) => act('preview', { scene: sceneName });
  const takeScene = () => act('take');
  const addBrowserSource = async () => {
    if (!targetScene || !sourceKind) {
      setSourceError('Bitte zuerst eine Zielszene und eine Quelle auswählen.');
      return;
    }
    setAddingSource(true);
    setSourceError('');
    try {
      await api('addBrowserSource', { scene: targetScene, kind: sourceKind });
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'Browser-Quelle konnte nicht hinzugefügt werden.');
    } finally {
      setAddingSource(false);
    }
  };

  return (
    <Stack className="dashboard" gap="lg">
      <Group justify="space-between">
        <div>
          <Text size="xs" c="dimmed">LIVE PRODUCTION</Text>
          <Title order={2}>Control Room</Title>
        </div>
        <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={() => act('refresh')}>
          Synchronisieren
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {[
          ['PROGRAM', r.program || '--'],
          ['PREVIEW', r.preview || 'DIRECT'],
          ['STREAM', r.streaming ? `LIVE · ${r.streamTimecode}` : 'OFFLINE'],
          ['RECORDING', r.recording ? 'ACTIVE' : 'OFF'],
        ].map((x) => (
          <Paper key={x[0]} p="md" withBorder className="metric">
            <Text size="xs" c="dimmed">{x[0]}</Text>
            <Text fw={700} c="blue">{x[1]}</Text>
          </Paper>
        ))}
      </SimpleGrid>

      <Group>
        <Button
          color={r.streaming ? 'red' : 'teal'}
          disabled={!r.connected}
          leftSection={r.streaming ? <IconPlayerStop size={16} /> : <IconPlayerPlay size={16} />}
          onClick={() => act('stream')}
        >
          {r.streaming ? 'Stream stoppen' : 'Stream starten'}
        </Button>

        <Button variant="default" disabled={!r.connected} onClick={() => act('record')}>
          {r.recording ? 'Aufnahme stoppen' : 'Aufnahme starten'}
        </Button>

        {r.studioMode && (
          <Button variant="filled" color="blue" disabled={!r.connected || !r.preview} onClick={takeScene}>
            Take
          </Button>
        )}
      </Group>

      <Paper p="lg" withBorder>
        <Text fw={700} mb="md">OBS Szenen</Text>
        <div className="obs-scenes">
          {r.scenes.map((x) => {
            const state = getSceneBadgeState(x.name, r.program, r.preview);
            return (
              <div key={x.name} className={'obs-scene ' + state}>
                <button
                  type="button"
                  className="obs-scene-main"
                  onClick={() => (r.studioMode ? setPreviewScene(x.name) : setProgramScene(x.name))}
                >
                  <IconBroadcast size={18} />
                  <b>{x.name}</b>
                  <small>{state === 'program' ? 'PROGRAM' : state === 'preview' ? 'VORSCHAU' : 'SCENE'}</small>
                </button>
                <button type="button" onClick={() => setProgramScene(x.name)}>
                  Live
                </button>
              </div>
            );
          })}
        </div>
      </Paper>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <LiveTools s={s} r={r} />
        <Paper p="lg" withBorder>
          <Text fw={700}>OBS Browser Sources</Text>
          <Select
            mt="sm"
            label="Zielszene"
            data={r.scenes.map((item) => item.name)}
            value={targetScene || null}
            onChange={(value) => setTargetScene(value || '')}
            placeholder="OBS-Szene auswählen"
          />
          <Select
            mt="sm"
            label="Quelle"
            data={[
              { value: 'countdown', label: 'Starting Soon' },
              { value: 'info-banner', label: 'Info Banner' },
              { value: 'lower-third', label: 'Lower Third' },
            ]}
            value={sourceKind}
            onChange={setSourceKind}
            placeholder="Browser-Quelle auswählen"
          />
          <Button mt="sm" fullWidth loading={addingSource} disabled={!targetScene || !sourceKind || !r.connected} onClick={addBrowserSource}>
            Browser-Source anlegen
          </Button>
          {sourceError && <Text c="red" size="sm" mt="xs">{sourceError}</Text>}
        </Paper>
      </SimpleGrid>
      <PhoneCamerasPanel cameras={d.phoneCameras} scene={targetScene} connected={r.connected} />
    </Stack>
  );
}

function PhoneCamerasPanel({ cameras, scene, connected }: { cameras: PhoneCamera[]; scene: string; connected: boolean }) {
  const [name, setName] = useState('');
  const [serverHost, setServerHost] = useState(location.hostname);
  const [pairing, setPairing] = useState<{ camera: Pick<PhoneCamera, 'id' | 'name'>; qr: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addingCameraId, setAddingCameraId] = useState<string | null>(null);

  const showPairing = async (path: string, method: 'POST', payload: object): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, host: serverHost.trim(), scheme: location.protocol }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'QR-Code konnte nicht erstellt werden.');
      const qr = await QRCode.toDataURL(result.pairingUrl, { width: 300, margin: 2 });
      setPairing({ camera: result.camera, qr });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR-Code konnte nicht erstellt werden.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createCamera = async () => {
    if (!name.trim()) {
      setError('Bitte einen Namen für die Handykamera eingeben.');
      return;
    }
    if (await showPairing('/api/phone-cameras', 'POST', { name: name.trim() })) setName('');
  };

  const addCameraSource = async (camera: PhoneCamera) => {
    setAddingCameraId(camera.id);
    setError('');
    try {
      await api('addPhoneCameraSource', { cameraId: camera.id, scene, baseUrl: location.origin });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Handykamera-Quelle konnte nicht hinzugefügt werden.');
    } finally {
      setAddingCameraId(null);
    }
  };

  return (
    <>
      <Paper p="lg" withBorder>
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <IconDeviceMobile size={19} />
            <Text fw={700}>Handykameras (Android)</Text>
          </Group>
          <Badge color="gray" variant="light">Gleiches WLAN/LAN erforderlich</Badge>
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          Kamera per QR-Code mit der Android-App koppeln und als OBS-Quelle verwenden.
        </Text>
        <TextInput
          label="Server-IP oder Hostname für das Smartphone"
          placeholder="z. B. 192.168.1.25"
          value={serverHost}
          onChange={(event) => setServerHost(event.currentTarget.value)}
          mb="sm"
        />
        {(serverHost === 'localhost' || serverHost === '127.0.0.1') && (
          <Text c="yellow" size="sm" mb="sm">
            „{serverHost}“ funktioniert auf dem Handy nicht: Trage hier die LAN-IP des Rechners ein, auf dem ONAIR Control läuft.
          </Text>
        )}
        <Group align="end">
          <TextInput
            label="Kameraname"
            placeholder="z. B. Smartphone Bühne"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button leftSection={<IconQrcode size={16} />} loading={busy} onClick={createCamera}>
            Kamera koppeln
          </Button>
        </Group>
        {error && <Text c="red" size="sm" mt="xs">{error}</Text>}
        {cameras.length > 0 && (
          <Stack gap="xs" mt="md">
            {cameras.map((camera) => (
              <Group key={camera.id} justify="space-between" p="xs" className="phone-camera-row">
                <Group gap="xs">
                  <Text size="sm" fw={600}>{camera.name}</Text>
                  <Badge color={camera.connected ? 'teal' : 'gray'}>{camera.connected ? 'Verbunden' : 'Offline'}</Badge>
                </Group>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconQrcode size={14} />}
                    loading={busy}
                    onClick={() => showPairing(`/api/phone-cameras/${encodeURIComponent(camera.id)}/pairing`, 'POST', {})}
                  >
                    QR-Code erneuern
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    disabled={!scene || !connected}
                    loading={addingCameraId === camera.id}
                    onClick={() => addCameraSource(camera)}
                  >
                    OBS-Quelle hinzufügen
                  </Button>
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>

      <Modal opened={Boolean(pairing)} onClose={() => setPairing(null)} title={`„${pairing?.camera.name || ''}“ koppeln`} centered>
        {pairing && (
          <Stack align="center">
            <img src={pairing.qr} alt={`QR-Code zum Koppeln von ${pairing.camera.name}`} width={300} height={300} />
            <Text ta="center" size="sm">QR-Code in der ONAIR-Camera-App scannen. Smartphone und Produktionsrechner müssen im selben Netzwerk sein.</Text>
            <Text ta="center" size="xs" c="dimmed">Ein neuer QR-Code ersetzt den bisherigen Kopplungscode.</Text>
          </Stack>
        )}
      </Modal>
    </>
  );
}

function LiveTools({ s, r }: { s: State; r: Runtime }) {
  const [b, setB] = useState<Banner>({ visible: false, headline: '', detail: '' });
  const [music, setMusic] = useState('');
  const [inputName, setInputName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(s.lowerThirdVisible ? s.lowerThird?.id || null : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/banner')
      .then((x) => x.json())
      .then(setB);

    setMusic(r.musicInputs[0] || '');
    setInputName(r.inputSources[0]?.name || '');
    setActiveId(s.lowerThirdVisible ? s.lowerThird?.id || null : null);
  }, [r.musicInputs, r.inputSources, s.lowerThirdVisible, s.lowerThird?.id]);

  const lowerThird = async (id: string) => {
    setBusy(true);
    try {
      if (activeId === id) {
        await api('hideLowerThird');
        setActiveId(null);
      } else {
        await api('lowerThird', { personId: id });
        setActiveId(id);
      }
    } finally {
      setBusy(false);
    }
  };

  const hide = async () => {
    setBusy(true);
    try {
      await api('hideLowerThird');
      setActiveId(null);
    } finally {
      setBusy(false);
    }
  };

  const setBannerVisibility = async (visible: boolean) => {
    const payload = { ...b, visible };
    setB(payload);
    await fetch('/api/banner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  };

  const saveBanner = async (visible = b.visible) => {
    const payload = { ...b, visible };
    setB(payload);
    await fetch('/api/banner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  };

  const selectedInput = r.inputSources.find((x) => x.name === inputName) ?? null;

  return (
    <Paper p="lg" withBorder>
      <Text fw={700}>Live Graphics</Text>
      <Text size="xs" c="dimmed">Schnellsteuerung fuer die laufende Produktion</Text>
      <Divider my="md" />

      <Group justify="space-between">
        <Text fw={700} size="sm">Personen einblenden</Text>
        <Button size="compact-xs" variant="default" disabled={!activeId || busy} onClick={hide}>
          Alle ausblenden
        </Button>
      </Group>

      {s.people.map((p) => (
        <Group key={p.id} justify="space-between" className="quick-person">
          <Group gap="xs">
            <ThemeIcon size={25} radius="xl" style={{ background: p.color }}>
              {p.initials}
            </ThemeIcon>
            <div>
              <Text size="xs" fw={700}>{p.name}</Text>
              <Text size="xs" c="dimmed">{p.role}</Text>
            </div>
          </Group>

          <Button size="compact-xs" color={activeId === p.id ? 'red' : 'blue'} loading={busy} onClick={() => lowerThird(p.id)}>
            {activeId === p.id ? 'Ausblenden' : 'Einblenden'}
          </Button>
        </Group>
      ))}

      <Divider my="md" />
      <Text fw={700} size="sm">Starting Soon</Text>
      <Group grow mt="xs">
        <Button size="xs" onClick={() => api('countdown', { seconds: 300, visible: true })}>
          5 Min. starten
        </Button>
        <Button size="xs" variant="default" onClick={() => api('countdown', { visible: false })}>
          Ausblenden
        </Button>
      </Group>

      <Divider my="md" />
      <Text fw={700} size="sm">Info Banner</Text>
      <TextInput
        mt="xs"
        label="Überschrift"
        value={b.headline}
        onChange={(e) => setB((prev) => ({ ...prev, headline: e.target.value }))}
        placeholder="Zum Beispiel: Kurze technische Pause"
      />
      <TextInput
        mt="xs"
        label="Text"
        value={b.detail}
        onChange={(e) => setB((prev) => ({ ...prev, detail: e.target.value }))}
        placeholder="Wir sind gleich zurück."
      />
      <Group grow mt="xs">
        <Button size="xs" onClick={() => saveBanner(true)}>
          Einblenden
        </Button>
        <Button size="xs" variant="default" onClick={() => saveBanner(false)}>
          Ausblenden
        </Button>
      </Group>
      <Button size="xs" variant="subtle" fullWidth mt="xs" onClick={() => saveBanner(b.visible)}>
        Text speichern
      </Button>

      {r.musicInputs.length > 0 && (
        <>
          <Divider my="md" />
          <Text fw={700} size="sm">Musik</Text>
          <Select data={r.musicInputs} value={music} onChange={(v) => setMusic(v || '')} placeholder="Musikquelle" />
          <Group grow mt="xs">
            <Button size="xs" onClick={() => api('music', { input: music, mediaAction: 'PLAY_PAUSE' })}>
              Play/Pause
            </Button>
            <Button size="xs" variant="default" onClick={() => api('music', { input: music, mediaAction: 'STOP' })}>
              Stop
            </Button>
          </Group>
        </>
      )}

      {r.inputSources.length > 0 && (
        <>
          <Divider my="md" />
          <Group justify="space-between" align="center">
            <Text fw={700} size="sm">Mikrofone</Text>
            <Badge color={selectedInput?.muted ? 'gray' : 'teal'} variant={selectedInput?.muted ? 'light' : 'filled'}>
              {selectedInput ? (selectedInput.muted ? 'Stumm' : 'Aktiv') : 'Ausgewählt'}
            </Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
            {r.inputSources.map((src) => {
              const isSelected = inputName === src.name;
              const isMuted = src.muted;

              return (
                <Paper
                  key={src.name}
                  p="xs"
                  withBorder
                  radius="sm"
                  style={{
                    borderColor: isSelected ? '#4dabf7' : undefined,
                    background: isMuted ? '#1f252d' : '#17212e',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Text size="xs" c={isSelected ? 'blue' : 'dimmed'} fw={700} lineClamp={1}>
                        {src.name}
                      </Text>
                      <Badge size="xs" color={isMuted ? 'gray' : 'teal'} variant={isMuted ? 'light' : 'filled'}>
                        {isMuted ? 'Aus' : 'Ein'}
                      </Badge>
                    </Stack>

                    <Button
                      size="compact-xs"
                      color={isMuted ? 'teal' : 'red'}
                      variant={isSelected ? 'filled' : 'light'}
                      onClick={() => {
                        setInputName(src.name);
                        api('inputMute', { input: src.name, muted: !src.muted });
                      }}
                    >
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Button>
                  </Group>
                </Paper>
              );
            })}
          </SimpleGrid>
        </>
      )}
    </Paper>
  );
}

function People({ s }: { s: State }) {
  const [f, setF] = useState({ name: '', role: '', company: '', color: '#1677ff' });

  return (
    <Stack className="dashboard">
      <Title order={2}>People</Title>
      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        <Paper
          p="lg"
          withBorder
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            api('addPerson', f);
            setF({ name: '', role: '', company: '', color: '#1677ff' });
          }}
        >
          <Stack>
            <TextInput label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <TextInput label="Rolle" required value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
            <TextInput label="Unternehmen" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            <ColorInput label="Akzentfarbe" value={f.color} onChange={(x) => setF({ ...f, color: x })} />
            <Button type="submit">Person speichern</Button>
          </Stack>
        </Paper>

        <Stack className="people-list">
          {s.people.map((p) => (
            <Paper p="md" withBorder key={p.id}>
              <Group>
                <ThemeIcon radius="xl" style={{ background: p.color }}>
                  {p.initials}
                </ThemeIcon>
                <div style={{ flex: 1 }}>
                  <Text fw={700}>{p.name}</Text>
                  <Text size="xs" c="dimmed">{p.role}</Text>
                </div>
                <ActionIcon color="red" onClick={() => api('deletePerson', { id: p.id })}>
                  <IconTrash size={15} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}

function Settings({ s }: { s: State }) {
  const [o, setO] = useState(s.obs);

  return (
    <Stack className="dashboard">
      <Title order={2}>Settings</Title>
      <Paper
        p="lg"
        withBorder
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          api('connect', o);
        }}
      >
        <Stack>
          <TextInput label="OBS-Adresse" value={o.url} onChange={(e) => setO({ ...o, url: e.target.value })} />
          <PasswordInput label="Passwort" value={o.password} onChange={(e) => setO({ ...o, password: e.target.value })} />
          <Button type="submit">Mit OBS verbinden</Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

const phoneCameraMatch = location.pathname.match(/^\/phone-camera\/([^/]+)$/);
createRoot(document.getElementById('root')!).render(
  phoneCameraMatch ? <PhoneCameraSource cameraId={decodeURIComponent(phoneCameraMatch[1])} /> :
    location.pathname.startsWith('/overlay/') ? <Overlay /> : <App />
);
