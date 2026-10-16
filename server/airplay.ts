import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AirPlayStatus = {
  available: boolean;
  running: boolean;
  connected: boolean;
  videoStreaming: boolean;
  deviceName: string | null;
  error: string | null;
};

type AirPlayLogUpdate = Partial<Pick<AirPlayStatus, 'connected' | 'videoStreaming' | 'deviceName' | 'error'>> & {
  videoFrame?: boolean;
};

export function describeAirPlayProcessExit(code: number | null, signal: NodeJS.Signals | null): string | null {
  if (code === 0 && !signal) return null;
  const exitCode = code === null ? null : code >>> 0;
  const exitDetails = signal || (exitCode === null
    ? 'unbekannter Exitcode'
    : `Exitcode ${code} (0x${exitCode.toString(16).toUpperCase()})`);
  return exitCode === 0xC0000005
    ? `AirPlay-Empfänger ist wegen eines Speicherzugriffsfehlers abgestürzt (${exitDetails}). Details: data/airplay.log.`
    : `AirPlay-Empfänger wurde unerwartet beendet (${exitDetails}). Details: data/airplay.log.`;
}

export class AirPlayFrameWatchdog {
  private timeout: NodeJS.Timeout | null = null;

  constructor(private readonly expired: () => void, private readonly timeoutMs = 3500) {}

  markFrame() {
    this.clear();
    this.timeout = setTimeout(() => {
      this.timeout = null;
      this.expired();
    }, this.timeoutMs);
  }

  clear() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }
}

export function parseAirPlayLogLine(line: string): AirPlayLogUpdate | null {
  const request = line.match(/connection request from (.+?) \(/i);
  const registered = line.match(/registered new client: (.+?) DeviceID/i);
  if (request || registered) {
    return {
      connected: true,
      videoStreaming: false,
      deviceName: (request?.[1] || registered?.[1] || '').trim() || null,
    };
  }

  const openConnections = line.match(/Open connections: (\d+)/i);
  if (openConnections) {
    const connected = Number(openConnections[1]) > 0;
    return { connected, ...(!connected ? { videoStreaming: false, deviceName: null } : {}) };
  }

  if (/lost connection with client/i.test(line)) {
    return { connected: false, videoStreaming: false, deviceName: null };
  }

  if (/ONAir video frame reached GStreamer sink/i.test(line)) {
    return { videoFrame: true, videoStreaming: true, error: null };
  }

  if (/GStreamer error \(video\):/i.test(line)) {
    return { videoStreaming: false, error: `GStreamer-Videofehler: ${line.trim().slice(-300)}` };
  }

  if (/Begin streaming to GStreamer video pipeline|begin video stream wxh =|video renderer resumed:/i.test(line)) {
    return { videoStreaming: false };
  }

  if (/This packet indicates video stream is stopping|video renderer pause:|video_renderer_stop|video_reset: type/i.test(line)) {
    return { videoStreaming: false };
  }

  return null;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class AirPlayReceiver {
  private child: ChildProcessWithoutNullStreams | null = null;
  private running = false;
  private connected = false;
  private videoStreaming = false;
  private deviceName: string | null = null;
  private error: string | null = null;
  private diagnosticLogError: string | null = null;
  private stopping = false;
  private readonly videoFrameWatchdog = new AirPlayFrameWatchdog(() => {
    if (!this.videoStreaming) return;
    this.videoStreaming = false;
    this.recordDiagnostic('Video frame timeout: no frames reached GStreamer sink for 3500 ms');
    this.changed();
  });

  constructor(
    private readonly changed: () => void,
    private readonly executablePath = path.join(projectRoot, 'native', 'airplay', 'runtime', 'bin', 'uxplay.exe'),
    private readonly diagnosticLogPath = path.join(projectRoot, 'data', 'airplay.log'),
  ) {}

  get status(): AirPlayStatus {
    return {
      available: fs.existsSync(this.executablePath),
      running: this.running,
      connected: this.connected,
      videoStreaming: this.videoStreaming,
      deviceName: this.deviceName,
      error: this.diagnosticLogError ?? this.error,
    };
  }

  start() {
    if (process.platform !== 'win32') {
      throw new Error('Der integrierte AirPlay-Empfänger ist derzeit nur für Windows verfügbar.');
    }
    if (this.running) return this.status;
    if (!fs.existsSync(this.executablePath)) {
      const message = 'AirPlay-Komponente fehlt. Bitte zuerst „npm run airplay:build“ ausführen.';
      this.error = message;
      this.changed();
      throw new Error(message);
    }

    const runtimeRoot = path.dirname(this.executablePath);
    const pluginDirectory = path.resolve(runtimeRoot, '..', 'lib', 'gstreamer-1.0');
    const scannerPath = path.resolve(runtimeRoot, '..', 'libexec', 'gstreamer-1.0', 'gst-plugin-scanner.exe');
    const registryPath = path.join(projectRoot, 'data', 'airplay-gstreamer-registry.bin');
    const env = {
      ...process.env,
      PATH: `${runtimeRoot}${path.delimiter}${process.env.PATH || ''}`,
      GST_PLUGIN_PATH_1_0: pluginDirectory,
      GST_PLUGIN_SYSTEM_PATH_1_0: pluginDirectory,
      GST_PLUGIN_SCANNER_1_0: scannerPath,
      GST_REGISTRY_1_0: registryPath,
    };

    this.error = null;
    this.diagnosticLogError = null;
    this.diagnosticLogFailed = false;
    this.connected = false;
    this.videoStreaming = false;
    this.deviceName = null;
    this.stopping = false;
    this.clearVideoFrameTimeout();
    this.recordDiagnostic(`Starting UxPlay: ${this.executablePath} (-vd d3d11h264dec -vc d3d11download -vsync no -vs d3d11videosink -as 0)`);
    try {
      const child = spawn(
        this.executablePath,
        [
          '-n', 'ONAir AirPlay', '-nh', '-nc',
          '-vd', 'd3d11h264dec', '-vc', 'd3d11download',
          '-vsync', 'no', '-vs', 'd3d11videosink', '-as', '0', '-d', '1',
        ],
        { cwd: runtimeRoot, env, stdio: 'pipe', windowsHide: false },
      );
      this.child = child;
      this.running = true;
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      this.readOutput(child.stdout);
      this.readOutput(child.stderr);
      child.on('error', (error) => {
        this.error = `AirPlay-Empfänger konnte nicht gestartet werden: ${error.message}`;
        this.running = false;
        this.connected = false;
        this.videoStreaming = false;
        this.deviceName = null;
        this.child = null;
        this.stopping = true;
        this.recordDiagnostic(this.error);
        this.changed();
      });
      child.on('close', (code, signal) => {
        const exitError = describeAirPlayProcessExit(code, signal);
        if (!this.stopping && exitError) {
          this.error = exitError;
          console.error(`[OnAir] AirPlay receiver stopped unexpectedly: ${this.error}`);
          this.recordDiagnostic(this.error);
        }
        this.running = false;
        this.connected = false;
        this.videoStreaming = false;
        this.deviceName = null;
        this.child = null;
        this.stopping = false;
        this.clearVideoFrameTimeout();
        this.changed();
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'AirPlay-Empfänger konnte nicht gestartet werden.';
      this.running = false;
      this.recordDiagnostic(this.error);
      this.changed();
      throw new Error(this.error);
    }

    this.changed();
    return this.status;
  }

  async stop() {
    const child = this.child;
    if (!child || !this.running) return this.status;

    this.stopping = true;
    this.error = null;
    if (child.exitCode !== null || child.signalCode !== null) {
      this.running = false;
      this.connected = false;
      this.videoStreaming = false;
      this.deviceName = null;
      this.child = null;
      this.stopping = false;
      this.changed();
      return this.status;
    }

    const stopped = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('AirPlay-Empfänger reagiert nicht auf das Beenden.'));
      }, 5000);
      child.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    child.kill();

    await stopped;
    return this.status;
  }

  private readOutput(stream: NodeJS.ReadableStream) {
    let pending = '';
    stream.on('data', (chunk: string | Buffer) => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      lines.forEach((line) => this.processLine(line));
    });
    stream.on('end', () => {
      if (pending) this.processLine(pending);
    });
  }

  private processLine(line: string) {
    if (line.trim()) console.log(`[AirPlay] ${line}`);
    if (line.trim()) this.recordDiagnostic(line);
    const update = parseAirPlayLogLine(line);
    if (!update) return;
    if (update.connected !== undefined) this.connected = update.connected;
    if (update.videoFrame) this.markVideoFrame();
    else if (update.videoStreaming !== undefined) {
      this.videoStreaming = update.videoStreaming;
      if (!update.videoStreaming) this.clearVideoFrameTimeout();
    }
    if (update.deviceName !== undefined) this.deviceName = update.deviceName;
    if (update.error !== undefined) this.error = update.error;
    this.changed();
  }

  private diagnosticLogFailed = false;

  private markVideoFrame() {
    this.videoStreaming = true;
    this.videoFrameWatchdog.markFrame();
  }

  private clearVideoFrameTimeout() {
    this.videoFrameWatchdog.clear();
  }

  private recordDiagnostic(message: string) {
    if (this.diagnosticLogFailed) return;
    try {
      fs.appendFileSync(this.diagnosticLogPath, `${new Date().toISOString()} ${message}\r\n`, 'utf8');
    } catch (error) {
      this.diagnosticLogFailed = true;
      this.diagnosticLogError = `AirPlay-Diagnoselog kann nicht geschrieben werden: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[OnAir] ${this.diagnosticLogError}`);
      this.changed();
    }
  }
}
