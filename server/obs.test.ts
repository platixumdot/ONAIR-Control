import { describe, expect, it, vi } from 'vitest';
import { isAudioInputKind } from './obs';
import { ObsControl } from './obs';

describe('isAudioInputKind', () => {
  it('recognizes microphone input kinds', () => {
    expect(isAudioInputKind('wasapi_input_capture')).toBe(true);
    expect(isAudioInputKind('coreaudio_input_capture')).toBe(true);
    expect(isAudioInputKind('dshow_input')).toBe(true);
  });

  describe('ObsControl.addBrowserSource', () => {
    it('attaches and enables an existing global browser source in the selected scene', async () => {
      const control = new ObsControl(() => {});
      control.runtime.connected = true;
      const call = vi.fn(async (request: string, _params?: unknown): Promise<unknown> => {
        if (request === 'GetInputList') {
          return { inputs: [{ inputName: 'ONAIR Phone Camera', inputKind: 'browser_source' }] };
        }
        if (request === 'GetSceneItemList') return { sceneItems: [] };
        return {};
      });
      Object.defineProperty(control, 'obs', { value: { call } });

      await control.addBrowserSource('Live', 'ONAIR Phone Camera', 'http://localhost/phone-camera/id', 1920, 1080, true);

      expect(call.mock.calls.map(([request]) => request)).toEqual([
        'GetInputList',
        'SetInputSettings',
        'GetSceneItemList',
        'CreateSceneItem',
      ]);
      expect(call.mock.calls[1][1]).toMatchObject({
        inputName: 'ONAIR Phone Camera',
        inputSettings: { url: 'http://localhost/phone-camera/id', reroute_audio: true },
      });
      expect(call.mock.calls[3][1]).toMatchObject({
        sceneName: 'Live',
        sourceName: 'ONAIR Phone Camera',
        sceneItemEnabled: true,
      });
    });

    it('rejects a global source with the same name if it is not a browser source', async () => {
      const control = new ObsControl(() => {});
      control.runtime.connected = true;
      const call = vi.fn(async (_request: string, _params?: unknown): Promise<unknown> => ({
        inputs: [{ inputName: 'ONAIR Phone Camera', inputKind: 'image_source' }],
      }));
      Object.defineProperty(control, 'obs', { value: { call } });

      await expect(
        control.addBrowserSource('Live', 'ONAIR Phone Camera', 'http://localhost/phone-camera/id', 1920, 1080),
      ).rejects.toThrow('ist aber keine Browser-Quelle');
      expect(call).toHaveBeenCalledTimes(1);
    });
  });

  describe('ObsControl.addAirPlaySource', () => {
    it('adds a UxPlay window capture with a rounded-corner mask filter', async () => {
      const control = new ObsControl(() => {});
      control.runtime.connected = true;
      let captureEnabled = false;
      const call = vi.fn(async (request: string, params?: unknown): Promise<unknown> => {
        if (request === 'GetVersion') return { obsVersion: '32.2.1' };
        if (request === 'GetCanvasList') {
          return { canvases: [{ canvasUuid: 'main-canvas-uuid', canvasFlags: { MAIN: true } }] };
        }
        if (request === 'GetInputList') return { inputs: [] };
        if (request === 'CreateInput') {
          captureEnabled = true;
          return { inputUuid: 'airplay-input-uuid', sceneItemId: 42 };
        }
        if (
          request === 'GetInputPropertiesListPropertyItems' &&
          typeof params === 'object' &&
          params !== null &&
          'inputUuid' in params
        ) {
          return {
            propertyItems: captureEnabled
              ? [
                  { itemName: 'OpenGL renderer', itemValue: 'OpenGL renderer:GstGLWindow:uxplay.exe' },
                  { itemName: 'Direct3D11 renderer', itemValue: 'Direct3D11 renderer:GSTD3D11:uxplay.exe' },
                ]
              : [],
          };
        }
        if (request === 'GetSourceFilterList') return { filters: [] };
        if (request === 'GetSourceFilterDefaultSettings') return { defaultFilterSettings: { opacity: 1 } };
        return {};
      });
      Object.defineProperty(control, 'obs', { value: { call } });

      await control.addAirPlaySource('Live', 'ONAIR AirPlay', 'C:\\onair\\mask.png');

      expect(call.mock.calls.map(([request]) => request)).toEqual([
        'GetVersion',
        'GetCanvasList',
        'GetInputList',
        'CreateInput',
        'GetInputPropertiesListPropertyItems',
        'SetInputSettings',
        'SetSceneItemEnabled',
        'GetSourceFilterList',
        'GetSourceFilterDefaultSettings',
        'CreateSourceFilter',
      ]);
      expect(call.mock.calls[3][1]).toMatchObject({
        canvasUuid: 'main-canvas-uuid',
        sceneName: 'Live',
        inputName: 'ONAIR AirPlay',
        inputKind: 'window_capture',
        sceneItemEnabled: true,
      });
      expect(call.mock.calls[4][1]).toMatchObject({
        inputUuid: 'airplay-input-uuid',
        propertyName: 'window',
      });
      expect(call.mock.calls[5][1]).toMatchObject({
        inputUuid: 'airplay-input-uuid',
        inputSettings: { method: 2, window: 'Direct3D11 renderer:GSTD3D11:uxplay.exe' },
      });
      expect(call.mock.calls[6][1]).toMatchObject({
        canvasUuid: 'main-canvas-uuid',
        sceneName: 'Live',
        sceneItemId: 42,
        sceneItemEnabled: true,
      });
      expect(call.mock.calls[7][1]).toMatchObject({
        canvasUuid: 'main-canvas-uuid',
        sourceUuid: 'airplay-input-uuid',
      });
      expect(call.mock.calls[9][1]).toMatchObject({
        filterKind: 'mask_filter',
        canvasUuid: 'main-canvas-uuid',
        sourceUuid: 'airplay-input-uuid',
        filterSettings: {
          type: 'mask_alpha_filter.effect',
          image_path: 'C:\\onair\\mask.png',
          opacity: 1,
          stretch: true,
        },
      });
    });

    it('rejects an existing source with a different kind', async () => {
      const control = new ObsControl(() => {});
      control.runtime.connected = true;
      const call = vi.fn(async (request: string): Promise<unknown> => {
        if (request === 'GetVersion') return { obsVersion: '32.2.1' };
        if (request === 'GetCanvasList') {
          return { canvases: [{ canvasUuid: 'main-canvas-uuid', canvasFlags: { MAIN: true } }] };
        }
        return { inputs: [{ inputName: 'ONAIR AirPlay', inputKind: 'browser_source' }] };
      });
      Object.defineProperty(control, 'obs', { value: { call } });

      await expect(control.addAirPlaySource('Live', 'ONAIR AirPlay', 'C:\\onair\\mask.png'))
        .rejects.toThrow('ist aber keine Fensteraufnahme');
      expect(call).toHaveBeenCalledTimes(3);
    });

    it('adds an existing source to the selected scene by source and canvas UUID', async () => {
      const control = new ObsControl(() => {});
      control.runtime.connected = true;
      const call = vi.fn(async (request: string): Promise<unknown> => {
        if (request === 'GetVersion') return { obsVersion: '32.2.1' };
        if (request === 'GetCanvasList') {
          return { canvases: [{ canvasUuid: 'main-canvas-uuid', canvasFlags: { MAIN: true } }] };
        }
        if (request === 'GetInputList') {
          return { inputs: [{ inputName: 'ONAIR AirPlay', inputKind: 'window_capture', inputUuid: 'airplay-input-uuid' }] };
        }
        if (request === 'GetInputPropertiesListPropertyItems') {
          return {
            propertyItems: [{ itemName: 'Direct3D11 renderer', itemValue: 'Direct3D11 renderer:GSTD3D11:uxplay.exe' }],
          };
        }
        if (request === 'GetSceneItemList') return { sceneItems: [] };
        if (request === 'CreateSceneItem') return { sceneItemId: 77 };
        if (request === 'GetSourceFilterList') return { filters: [] };
        if (request === 'GetSourceFilterDefaultSettings') return { defaultFilterSettings: { opacity: 1 } };
        return {};
      });
      Object.defineProperty(control, 'obs', { value: { call } });

      await control.addAirPlaySource('Live', 'ONAIR AirPlay', 'C:\\onair\\mask.png');

      expect(call).toHaveBeenCalledWith('GetSceneItemList', {
        canvasUuid: 'main-canvas-uuid',
        sceneName: 'Live',
      });
      expect(call).toHaveBeenCalledWith('CreateSceneItem', {
        canvasUuid: 'main-canvas-uuid',
        sceneName: 'Live',
        sourceUuid: 'airplay-input-uuid',
        sceneItemEnabled: true,
      });
      expect(call).toHaveBeenCalledWith('GetSourceFilterList', {
        canvasUuid: 'main-canvas-uuid',
        sourceUuid: 'airplay-input-uuid',
      });
      expect(call).toHaveBeenCalledWith('SetSceneItemEnabled', {
        canvasUuid: 'main-canvas-uuid',
        sceneName: 'Live',
        sceneItemId: 77,
        sceneItemEnabled: true,
      });
    });

    it('rebinds and re-enables an existing window source after UxPlay reconnects', async () => {
      const control = new ObsControl(() => {});
      control.runtime.connected = true;
      const call = vi.fn(async (request: string): Promise<unknown> => {
        if (request === 'GetVersion') return { obsVersion: '32.2.1' };
        if (request === 'GetCanvasList') {
          return { canvases: [{ canvasUuid: 'main-canvas-uuid', canvasFlags: { MAIN: true } }] };
        }
        if (request === 'GetInputList') {
          return { inputs: [{ inputName: 'ONAIR AirPlay', inputKind: 'window_capture', inputUuid: 'airplay-input-uuid' }] };
        }
        if (request === 'GetInputPropertiesListPropertyItems') {
          return {
            propertyItems: [{
              itemName: 'Direct3D11 renderer',
              itemValue: 'Direct3D11 renderer:new-window:GSTD3D11:uxplay.exe',
            }],
          };
        }
        if (request === 'GetSceneItemList') {
          return { sceneItems: [{ sourceName: 'ONAIR AirPlay', sourceUuid: 'airplay-input-uuid', sceneItemId: 77 }] };
        }
        if (request === 'GetSourceFilterList') {
          return { filters: [{ filterName: 'ONAIR Rounded Corners', filterKind: 'mask_filter' }] };
        }
        if (request === 'GetSourceFilterDefaultSettings') return { defaultFilterSettings: { opacity: 1 } };
        return {};
      });
      Object.defineProperty(control, 'obs', { value: { call } });

      await control.addAirPlaySource('Live', 'ONAIR AirPlay', 'C:\\onair\\mask.png');

      expect(call).toHaveBeenCalledWith('SetInputSettings', expect.objectContaining({
        inputUuid: 'airplay-input-uuid',
        inputSettings: expect.objectContaining({
          method: 2,
          window: 'Direct3D11 renderer:new-window:GSTD3D11:uxplay.exe',
        }),
      }));
      expect(call).toHaveBeenCalledWith('SetSceneItemEnabled', {
        canvasUuid: 'main-canvas-uuid',
        sceneName: 'Live',
        sceneItemId: 77,
        sceneItemEnabled: true,
      });
      expect(call).toHaveBeenCalledWith('SetSourceFilterSettings', expect.objectContaining({
        canvasUuid: 'main-canvas-uuid',
        sourceUuid: 'airplay-input-uuid',
        filterName: 'ONAIR Rounded Corners',
      }));
    });

    it('waits for the UxPlay video window to appear before configuring the capture', async () => {
      const control = new ObsControl(() => {});
      control.runtime.connected = true;
      vi.useFakeTimers();
      let windowChecks = 0;
      const call = vi.fn(async (request: string): Promise<unknown> => {
        if (request === 'GetVersion') return { obsVersion: '32.2.1' };
        if (request === 'GetCanvasList') {
          return { canvases: [{ canvasUuid: 'main-canvas-uuid', canvasFlags: { MAIN: true } }] };
        }
        if (request === 'GetInputList') return { inputs: [] };
        if (request === 'GetInputPropertiesListPropertyItems') {
          windowChecks += 1;
          return {
            propertyItems: windowChecks < 3
              ? []
              : [{
                  itemName: 'Direct3D11 renderer',
                  itemValue: 'Direct3D11 renderer:GSTD3D11:uxplay.exe',
                }],
          };
        }
        if (request === 'CreateInput') return { inputUuid: 'airplay-input-uuid', sceneItemId: 42 };
        if (request === 'GetSourceFilterList') return { filters: [] };
        if (request === 'GetSourceFilterDefaultSettings') return { defaultFilterSettings: { opacity: 1 } };
        return {};
      });
      Object.defineProperty(control, 'obs', { value: { call } });

      try {
        const addingSource = control.addAirPlaySource('Live', 'ONAIR AirPlay', 'C:\\onair\\mask.png');
        await vi.advanceTimersByTimeAsync(1000);
        await addingSource;

        expect(windowChecks).toBe(3);
        expect(call).toHaveBeenCalledWith('SetInputSettings', expect.objectContaining({
          inputUuid: 'airplay-input-uuid',
          inputSettings: expect.objectContaining({
            window: 'Direct3D11 renderer:GSTD3D11:uxplay.exe',
          }),
        }));
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects an OpenGL window and removes the capture when Direct3D11 is unavailable', async () => {
      const control = new ObsControl(() => {});
      control.runtime.connected = true;
      vi.useFakeTimers();
      const call = vi.fn(async (request: string): Promise<unknown> => {
        if (request === 'GetVersion') return { obsVersion: '32.2.1' };
        if (request === 'GetCanvasList') {
          return { canvases: [{ canvasUuid: 'main-canvas-uuid', canvasFlags: { MAIN: true } }] };
        }
        if (request === 'GetInputList') return { inputs: [] };
        if (request === 'CreateInput') return { inputUuid: 'airplay-input-uuid', sceneItemId: 42 };
        if (request === 'GetInputPropertiesListPropertyItems') {
          return {
            propertyItems: [{
              itemName: 'OpenGL renderer',
              itemValue: 'OpenGL renderer:GstGLWindow:uxplay.exe',
            }],
          };
        }
        return {};
      });
      Object.defineProperty(control, 'obs', { value: { call } });

      try {
        const addingSource = control.addAirPlaySource('Live', 'ONAIR AirPlay', 'C:\\onair\\mask.png');
        const result = addingSource.then(
          () => null,
          (error: unknown) => error,
        );
        await vi.runAllTimersAsync();
        await expect(result).resolves.toMatchObject({
          message: expect.stringContaining('OBS findet das Direct3D11-UxPlay-Videofenster nicht'),
        });
        expect(call.mock.calls.map(([request]) => request)).toEqual([
          'GetVersion',
          'GetCanvasList',
          'GetInputList',
          'CreateInput',
          ...Array(20).fill('GetInputPropertiesListPropertyItems'),
          'RemoveInput',
        ]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('ignores non-audio source kinds', () => {
    expect(isAudioInputKind('ffmpeg_source')).toBe(false);
    expect(isAudioInputKind('browser_source')).toBe(false);
  });
});
