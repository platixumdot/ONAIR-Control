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
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import './styles.css';
import { getSceneBadgeState } from './sceneState';

type Person = { id: string; name: string; role: string; company?: string; color: string; initials: string };
type InputSource = { name: string; kind: string; muted: boolean };
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
type Feed = { state: State; runtime: Runtime; s: State };
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

    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:3010/ws`;
    const w = new WebSocket(wsUrl);
    w.onmessage = (event) => normalize(JSON.parse(event.data));
    return () => w.close();
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
  const [scene, setScene] = useState('');

  useEffect(() => {
    if (!scene && r.scenes[0]) setScene(r.scenes[0].name);
  }, [r.scenes, scene]);

  const act = (a: string, p?: object) => api(a, p);
  const setProgramScene = (sceneName: string) => act('program', { scene: sceneName });
  const setPreviewScene = (sceneName: string) => act('preview', { scene: sceneName });
  const takeScene = () => act('take');

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
            data={['countdown', 'info-banner', 'lower-third']}
            value={scene}
            onChange={(v) => setScene(v || '')}
            placeholder="Quelle auswählen"
          />
          <Button mt="sm" fullWidth onClick={() => api('addBrowserSource', { scene, kind: 'countdown' })}>
            Browser-Source anlegen
          </Button>
          <Button mt="xs" variant="default" fullWidth onClick={() => api('addBrowserSource', { scene, kind: 'info-banner' })}>
            Info Banner hinzufügen
          </Button>
          <Button mt="xs" variant="default" fullWidth onClick={() => api('addBrowserSource', { scene, kind: 'lower-third' })}>
            Lower Third hinzufügen
          </Button>
        </Paper>
      </SimpleGrid>
    </Stack>
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
      <Group grow mt="xs">
        <Button size="xs" onClick={() => setBannerVisibility(true)}>
          Einblenden
        </Button>
        <Button size="xs" variant="default" onClick={() => setBannerVisibility(false)}>
          Ausblenden
        </Button>
      </Group>

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
          <Text fw={700} size="sm">Eingabe Quellen</Text>
          <Select
            data={r.inputSources.map((src) => ({ value: src.name, label: src.name }))}
            value={inputName}
            onChange={(v) => setInputName(v || '')}
            placeholder="Mikrofon wählen"
          />
          <Group grow mt="xs">
            <Button
              size="xs"
              color={selectedInput?.muted ? 'teal' : 'red'}
              disabled={!selectedInput}
              onClick={() => selectedInput && api('inputMute', { input: selectedInput.name, muted: !selectedInput.muted })}
            >
              {selectedInput?.muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={!selectedInput}
              onClick={() => selectedInput && api('inputMute', { input: selectedInput.name, muted: true })}
            >
              Stumm
            </Button>
          </Group>
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

createRoot(document.getElementById('root')!).render(location.pathname.startsWith('/overlay/') ? <Overlay /> : <App />);
