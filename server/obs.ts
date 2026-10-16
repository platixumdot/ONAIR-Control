import OBSWebSocket from 'obs-websocket-js'; import type { RuntimeState } from './types.js';

export function isAudioInputKind(kind: string) {
  const normalized = kind.toLowerCase();
  const audioKinds = [
    'wasapi_input_capture',
    'wasapi_process_input_capture',
    'coreaudio_input_capture',
    'dshow_input',
    'v4l2_input',
    'linux_audio_input',
    'pulse_input',
    'alsa_input',
    'avfoundation_input',
    'decklink_input',
    'pipewire_input',
    'obs_audio_input'
  ];
  return audioKinds.includes(normalized);
}

export class ObsControl {
  private obs = new OBSWebSocket(); private retry?: NodeJS.Timeout; private url = ''; private password = '';
  runtime: RuntimeState = { connected: false, scenes: [], musicInputs: [], inputSources: [], program: null, preview: null, streaming: false, recording: false, streamTimecode: '00:00:00', studioMode: false, lastError: null };
  constructor(private changed: () => void) {}
  async configure(url: string, password: string) { this.url = url; this.password = password; clearTimeout(this.retry); try { await this.obs.disconnect(); } catch {} await this.connect(); }
  async connect() { if (!this.url) return; try { await this.obs.connect(this.url, this.password); this.runtime.connected = true; this.runtime.lastError = null; this.obs.on('ConnectionClosed', () => this.scheduleReconnect()); this.obs.on('CurrentProgramSceneChanged', (e: { sceneName: string }) => { this.runtime.program = e.sceneName; this.changed(); }); this.obs.on('CurrentPreviewSceneChanged', (e: { sceneName: string }) => { this.runtime.preview = e.sceneName; this.changed(); }); this.obs.on('StreamStateChanged', (e: { outputActive: boolean }) => { this.runtime.streaming = e.outputActive; this.changed(); }); this.obs.on('RecordStateChanged', (e: { outputActive: boolean }) => { this.runtime.recording = e.outputActive; this.changed(); }); this.obs.on('InputMuteStateChanged', (e: { inputName: string; inputMuted: boolean }) => { const source = this.runtime.inputSources.find(i => i.name === e.inputName); if (!source) return; source.muted = Boolean(e.inputMuted); this.changed(); }); await this.refresh(); this.changed(); } catch (error) { this.runtime.lastError = error instanceof Error ? error.message : 'OBS connection failed'; this.scheduleReconnect(); } }
  private scheduleReconnect() { this.runtime.connected = false; this.changed(); clearTimeout(this.retry); this.retry = setTimeout(() => this.connect(), 5000); }
  async refresh() { if (!this.runtime.connected) return; const [scenes, program, stream, record, studio, inputs] = await Promise.all([this.obs.call('GetSceneList'), this.obs.call('GetCurrentProgramScene'), this.obs.call('GetStreamStatus'), this.obs.call('GetRecordStatus'), this.obs.call('GetStudioModeEnabled'), this.obs.call('GetInputList')]); const sceneData = scenes as unknown as { scenes: { sceneName: string; sceneIndex: number }[] }; const inputData = inputs as unknown as { inputs: { inputName: string; inputKind: string }[] }; this.runtime.scenes = sceneData.scenes.map(s => ({ name: s.sceneName, index: s.sceneIndex })); this.runtime.musicInputs = inputData.inputs.filter(i => ['ffmpeg_source', 'vlc_source', 'media_source'].includes(i.inputKind)).map(i => i.inputName); this.runtime.inputSources = await Promise.all(inputData.inputs.filter(i => isAudioInputKind(i.inputKind)).map(async i => {
      try {
        const mute = await this.obs.call('GetInputMute', { inputName: i.inputName }) as { inputMuted: boolean };
        return { name: i.inputName, kind: i.inputKind, muted: Boolean(mute.inputMuted) };
      } catch {
        return { name: i.inputName, kind: i.inputKind, muted: false };
      }
    })); this.runtime.program = program.currentProgramSceneName as string; this.runtime.streaming = stream.outputActive as boolean; this.runtime.streamTimecode = stream.outputTimecode as string; this.runtime.recording = record.outputActive as boolean; this.runtime.studioMode = studio.studioModeEnabled as boolean; try { this.runtime.preview = (await this.obs.call('GetCurrentPreviewScene')).currentPreviewSceneName as string; } catch { this.runtime.preview = null; } }
  private ensure() { if (!this.runtime.connected) throw new Error('OBS ist nicht verbunden. Prüfe Adresse, Passwort und die OBS-WebSocket-Einstellungen.'); }
  async setProgram(sceneName: string) { this.ensure(); await this.obs.call('SetCurrentProgramScene', { sceneName }); }
  async setPreview(sceneName: string) { this.ensure(); await this.obs.call('SetCurrentPreviewScene', { sceneName }); }
  async take() { this.ensure(); if (this.runtime.studioMode) await this.obs.call('TriggerStudioModeTransition'); else if (this.runtime.preview) await this.setProgram(this.runtime.preview); }
  async toggleStream() { this.ensure(); await this.obs.call(this.runtime.streaming ? 'StopStream' : 'StartStream'); }
  async toggleRecord() { this.ensure(); await this.obs.call(this.runtime.recording ? 'StopRecord' : 'StartRecord'); }
  async setInputMute(inputName: string, muted: boolean) { this.ensure(); await this.obs.call('SetInputMute', { inputName, inputMuted: muted }); await this.refresh(); }
  async toggleInputMute(inputName: string) { this.ensure(); const source = this.runtime.inputSources.find(i => i.name === inputName); if (!source) return; await this.setInputMute(inputName, !source.muted); }
  async createScene(name: string) { this.ensure(); await this.obs.call('CreateScene', { sceneName: name }); await this.refresh(); }
  async addBrowserSource(sceneName: string, inputName: string, url: string, width: number, height: number, rerouteAudio = false) {
    this.ensure();
    const inputSettings = { url, width, height, shutdown: false, reroute_audio: rerouteAudio };
    const inputs = await this.obs.call('GetInputList') as { inputs: { inputName: string; inputKind: string }[] };
    const existingInput = inputs.inputs.find((input) => input.inputName === inputName);

    if (existingInput && existingInput.inputKind !== 'browser_source') {
      throw new Error(`OBS-Quelle „${inputName}“ existiert bereits, ist aber keine Browser-Quelle.`);
    }

    if (existingInput) {
      await this.obs.call('SetInputSettings', { inputName, inputSettings, overlay: false });
    } else {
      await this.obs.call('CreateInput', {
        sceneName,
        inputName,
        inputKind: 'browser_source',
        inputSettings,
        sceneItemEnabled: true,
      });
      return;
    }

    const scene = await this.obs.call('GetSceneItemList', { sceneName }) as {
      sceneItems: { sourceName: string; sceneItemId: number }[];
    };
    const sceneItem = scene.sceneItems.find((item) => item.sourceName === inputName);
    if (sceneItem) {
      await this.obs.call('SetSceneItemEnabled', {
        sceneName,
        sceneItemId: sceneItem.sceneItemId,
        sceneItemEnabled: true,
      });
    } else {
      await this.obs.call('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: true });
    }
  }
  async addAirPlaySource(sceneName: string, inputName: string, maskPath: string) {
    this.ensure();
    const version = await this.obs.call('GetVersion') as { obsVersion: string };
    const versionMatch = version.obsVersion.match(/^(\d+)/);
    if (!versionMatch) throw new Error(`Unbekannte OBS-Version: ${version.obsVersion}`);
    let canvasUuid: string | undefined;
    if (Number(versionMatch[1]) >= 32) {
      const canvasList = await this.obs.call('GetCanvasList') as {
        canvases: { canvasUuid: string; canvasFlags: { MAIN?: boolean } }[];
      };
      canvasUuid = canvasList.canvases.find((canvas) => canvas.canvasFlags.MAIN)?.canvasUuid;
      if (!canvasUuid) throw new Error('Die OBS-Hauptcanvas konnte nicht gefunden werden.');
    }

    const inputs = await this.obs.call('GetInputList') as {
      inputs: { inputName: string; inputKind: string; inputUuid?: string }[];
    };
    const existing = inputs.inputs.find((input) => input.inputName === inputName);
    if (existing && existing.inputKind !== 'window_capture') {
      throw new Error(`OBS-Quelle „${inputName}“ existiert bereits, ist aber keine Fensteraufnahme.`);
    }

    const created = !existing;
    let inputUuid = existing?.inputUuid;
    let sceneItemId: number | undefined;
    if (created) {
      const result = await this.obs.call('CreateInput', {
        ...(canvasUuid ? { canvasUuid } : {}),
        sceneName,
        inputName,
        inputKind: 'window_capture',
        inputSettings: { capture_cursor: false, client_area: true, method: 2, window: '' },
        sceneItemEnabled: true,
      }) as { inputUuid: string; sceneItemId: number };
      inputUuid = result.inputUuid;
      sceneItemId = result.sceneItemId;
    }

    try {
      let window: { itemName?: unknown; itemValue?: unknown } | undefined;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const propertyList = await this.obs.call('GetInputPropertiesListPropertyItems', {
          ...(inputUuid ? { inputUuid } : { inputName }),
          propertyName: 'window',
        }) as { propertyItems: { itemName?: unknown; itemValue?: unknown }[] };
        window = propertyList.propertyItems.find((item) => {
          const label = [item.itemName, item.itemValue]
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
            .toLowerCase();
          return label.includes('uxplay.exe')
            && (label.includes('gstd3d11') || label.includes('direct3d11 renderer'));
        });
        if (window || attempt === 19) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (typeof window?.itemValue !== 'string') {
        throw new Error(
          'OBS findet das Direct3D11-UxPlay-Videofenster nicht. „AirPlay-Gerät verbunden“ bestätigt nur die Verbindung, nicht den laufenden Bildschirmstream. Starte die Bildschirmsynchronisierung auf dem Apple-Gerät und versuche es erneut, sobald das Bild ausgegeben wird. OBS und ONAIR sollten mit denselben Administratorrechten laufen.',
        );
      }

      await this.obs.call('SetInputSettings', {
        ...(inputUuid ? { inputUuid } : { inputName }),
        inputSettings: {
          capture_cursor: false,
          client_area: true,
          method: 2,
          window: window.itemValue,
        },
        overlay: true,
      });

      if (!created) {
        const scene = await this.obs.call('GetSceneItemList', {
          ...(canvasUuid ? { canvasUuid } : {}),
          sceneName,
        }) as {
          sceneItems: { sourceName: string; sourceUuid?: string; sceneItemId: number }[];
        };
        const sceneItem = scene.sceneItems.find((item) =>
          inputUuid ? item.sourceUuid === inputUuid : item.sourceName === inputName,
        );
        if (sceneItem) {
          sceneItemId = sceneItem.sceneItemId;
        } else {
          const createdSceneItem = await this.obs.call('CreateSceneItem', {
            ...(canvasUuid ? { canvasUuid } : {}),
            sceneName,
            ...(inputUuid ? { sourceUuid: inputUuid } : { sourceName: inputName }),
            sceneItemEnabled: true,
          }) as { sceneItemId: number };
          sceneItemId = createdSceneItem.sceneItemId;
        }
      }
      if (sceneItemId === undefined) throw new Error(`OBS hat keine Szenenquelle für „${inputName}“ erstellt.`);
      await this.obs.call('SetSceneItemEnabled', {
        ...(canvasUuid ? { canvasUuid } : {}),
        sceneName,
        sceneItemId,
        sceneItemEnabled: true,
      });

      const filterName = 'ONAIR Rounded Corners';
      const filters = await this.obs.call('GetSourceFilterList', {
        ...(canvasUuid ? { canvasUuid } : {}),
        ...(inputUuid ? { sourceUuid: inputUuid } : { sourceName: inputName }),
      }) as {
        filters: { filterName: string; filterKind: string }[];
      };
      const existingFilter = filters.filters.find((filter) => filter.filterName === filterName);
      if (existingFilter && existingFilter.filterKind !== 'mask_filter') {
        throw new Error(`Der OBS-Filter „${filterName}“ existiert bereits mit einem anderen Typ.`);
      }
      const defaults = await this.obs.call('GetSourceFilterDefaultSettings', {
        filterKind: 'mask_filter',
      }) as { defaultFilterSettings: Record<string, unknown> };
      const defaultOpacity = defaults.defaultFilterSettings.opacity;
      const filterSettings = {
        ...defaults.defaultFilterSettings,
        type: 'mask_alpha_filter.effect',
        image_path: maskPath,
        opacity: typeof defaultOpacity === 'number' && defaultOpacity > 1 ? 100 : 1,
        stretch: true,
      };

      if (existingFilter) {
        await this.obs.call('SetSourceFilterSettings', {
          ...(canvasUuid ? { canvasUuid } : {}),
          ...(inputUuid ? { sourceUuid: inputUuid } : { sourceName: inputName }),
          filterName,
          filterSettings,
          overlay: true,
        });
      } else {
        await this.obs.call('CreateSourceFilter', {
          ...(canvasUuid ? { canvasUuid } : {}),
          ...(inputUuid ? { sourceUuid: inputUuid } : { sourceName: inputName }),
          filterName,
          filterKind: 'mask_filter',
          filterSettings,
        });
      }
    } catch (error) {
      if (created) await this.obs.call('RemoveInput', { inputName });
      throw error;
    }
  }
  async music(inputName: string, action: 'PLAY_PAUSE' | 'RESTART' | 'STOP') { this.ensure(); await this.obs.call('TriggerMediaInputAction', { inputName, mediaAction: `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_${action}` }); }
}
