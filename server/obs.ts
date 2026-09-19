import OBSWebSocket from 'obs-websocket-js'; import type { RuntimeState } from './types.js';
export class ObsControl {
  private obs = new OBSWebSocket(); private retry?: NodeJS.Timeout; private url = ''; private password = '';
  runtime: RuntimeState = { connected: false, scenes: [], musicInputs: [], program: null, preview: null, streaming: false, recording: false, streamTimecode: '00:00:00', studioMode: false, lastError: null };
  constructor(private changed: () => void) {}
  async configure(url: string, password: string) { this.url = url; this.password = password; clearTimeout(this.retry); try { await this.obs.disconnect(); } catch {} await this.connect(); }
  async connect() { if (!this.url) return; try { await this.obs.connect(this.url, this.password); this.runtime.connected = true; this.runtime.lastError = null; this.obs.on('ConnectionClosed', () => this.scheduleReconnect()); this.obs.on('CurrentProgramSceneChanged', (e: { sceneName: string }) => { this.runtime.program = e.sceneName; this.changed(); }); this.obs.on('CurrentPreviewSceneChanged', (e: { sceneName: string }) => { this.runtime.preview = e.sceneName; this.changed(); }); this.obs.on('StreamStateChanged', (e: { outputActive: boolean }) => { this.runtime.streaming = e.outputActive; this.changed(); }); this.obs.on('RecordStateChanged', (e: { outputActive: boolean }) => { this.runtime.recording = e.outputActive; this.changed(); }); await this.refresh(); this.changed(); } catch (error) { this.runtime.lastError = error instanceof Error ? error.message : 'OBS connection failed'; this.scheduleReconnect(); } }
  private scheduleReconnect() { this.runtime.connected = false; this.changed(); clearTimeout(this.retry); this.retry = setTimeout(() => this.connect(), 5000); }
  async refresh() { if (!this.runtime.connected) return; const [scenes, program, stream, record, studio, inputs] = await Promise.all([this.obs.call('GetSceneList'), this.obs.call('GetCurrentProgramScene'), this.obs.call('GetStreamStatus'), this.obs.call('GetRecordStatus'), this.obs.call('GetStudioModeEnabled'), this.obs.call('GetInputList')]); const sceneData = scenes as unknown as { scenes: { sceneName: string; sceneIndex: number }[] }; const inputData = inputs as unknown as { inputs: { inputName: string; inputKind: string }[] }; this.runtime.scenes = sceneData.scenes.map(s => ({ name: s.sceneName, index: s.sceneIndex })); this.runtime.musicInputs = inputData.inputs.filter(i => ['ffmpeg_source', 'vlc_source', 'media_source'].includes(i.inputKind)).map(i => i.inputName); this.runtime.program = program.currentProgramSceneName as string; this.runtime.streaming = stream.outputActive as boolean; this.runtime.streamTimecode = stream.outputTimecode as string; this.runtime.recording = record.outputActive as boolean; this.runtime.studioMode = studio.studioModeEnabled as boolean; try { this.runtime.preview = (await this.obs.call('GetCurrentPreviewScene')).currentPreviewSceneName as string; } catch { this.runtime.preview = null; } }
  private ensure() { if (!this.runtime.connected) throw new Error('OBS ist nicht verbunden. Prüfe Adresse, Passwort und die OBS-WebSocket-Einstellungen.'); }
  async setProgram(sceneName: string) { this.ensure(); await this.obs.call('SetCurrentProgramScene', { sceneName }); }
  async setPreview(sceneName: string) { this.ensure(); await this.obs.call('SetCurrentPreviewScene', { sceneName }); }
  async take() { this.ensure(); if (this.runtime.studioMode) await this.obs.call('TriggerStudioModeTransition'); else if (this.runtime.preview) await this.setProgram(this.runtime.preview); }
  async toggleStream() { this.ensure(); await this.obs.call(this.runtime.streaming ? 'StopStream' : 'StartStream'); }
  async toggleRecord() { this.ensure(); await this.obs.call(this.runtime.recording ? 'StopRecord' : 'StartRecord'); }
  async createScene(name: string) { this.ensure(); await this.obs.call('CreateScene', { sceneName: name }); await this.refresh(); }
  async addBrowserSource(sceneName: string, inputName: string, url: string, width: number, height: number) {
    this.ensure(); const inputSettings = { url, width, height, shutdown: false, reroute_audio: false };
    try { await this.obs.call('CreateInput', { sceneName, inputName, inputKind: 'browser_source', inputSettings, sceneItemEnabled: true }); }
    catch (error) {
      const message = error instanceof Error ? error.message : ''; if (!message.includes('already exists')) throw error;
      await this.obs.call('SetInputSettings', { inputName, inputSettings, overlay: false });
      try { await this.obs.call('GetSceneItemId', { sceneName, sourceName: inputName }); }
      catch { await this.obs.call('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: true }); }
    }
  }
  async music(inputName: string, action: 'PLAY_PAUSE' | 'RESTART' | 'STOP') { this.ensure(); await this.obs.call('TriggerMediaInputAction', { inputName, mediaAction: `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_${action}` }); }
}
