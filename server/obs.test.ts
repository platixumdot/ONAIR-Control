import { describe, expect, it } from 'vitest';
import { isAudioInputKind } from './obs';

describe('isAudioInputKind', () => {
  it('recognizes microphone input kinds', () => {
    expect(isAudioInputKind('wasapi_input_capture')).toBe(true);
    expect(isAudioInputKind('coreaudio_input_capture')).toBe(true);
    expect(isAudioInputKind('dshow_input')).toBe(true);
  });

  it('ignores non-audio source kinds', () => {
    expect(isAudioInputKind('ffmpeg_source')).toBe(false);
    expect(isAudioInputKind('browser_source')).toBe(false);
  });
});
