import { describe, expect, it, vi } from 'vitest';
import { AirPlayFrameWatchdog, describeAirPlayProcessExit, parseAirPlayLogLine } from './airplay.js';

describe('parseAirPlayLogLine', () => {
  it('reports the connected Apple device name', () => {
    expect(parseAirPlayLogLine('connection request from Neel (iPad14,3) with deviceID = ABC')).toEqual({
      connected: true,
      videoStreaming: false,
      deviceName: 'Neel',
    });
  });

  it('requires decoded video frames before reporting an active stream', () => {
    expect(parseAirPlayLogLine('Open connections: 1')).toEqual({ connected: true });
    expect(parseAirPlayLogLine('Begin streaming to GStreamer video pipeline')).toEqual({ videoStreaming: false });
    expect(parseAirPlayLogLine('begin video stream wxh = 1554x1080; source 1554x1080')).toEqual({ videoStreaming: false });
    expect(parseAirPlayLogLine('video renderer resumed: state PLAYING')).toEqual({ videoStreaming: false });
    expect(parseAirPlayLogLine('ONAir video frame reached GStreamer sink')).toEqual({
      videoFrame: true,
      videoStreaming: true,
      error: null,
    });
    expect(parseAirPlayLogLine('video renderer pause: NO PREROLL')).toEqual({ videoStreaming: false });
    expect(parseAirPlayLogLine('video renderer pause: success')).toEqual({ videoStreaming: false });
    expect(parseAirPlayLogLine('video_renderer_stop')).toEqual({ videoStreaming: false });
  });

  it('clears streaming status and exposes GStreamer video errors', () => {
    expect(parseAirPlayLogLine('GStreamer error (video): d3d11videosink Device removed')).toEqual({
      videoStreaming: false,
      error: 'GStreamer-Videofehler: GStreamer error (video): d3d11videosink Device removed',
    });
  });

  it('reports a disconnected device as ready for a later reconnection', () => {
    expect(parseAirPlayLogLine('Open connections: 0')).toMatchObject({
      connected: false,
      videoStreaming: false,
      deviceName: null,
    });
    expect(parseAirPlayLogLine('connection request from Neel (iPad14,3) with deviceID = DEF')).toEqual({
      connected: true,
      videoStreaming: false,
      deviceName: 'Neel',
    });
  });

  it('reports native crash exit codes, including Windows access violations', () => {
    expect(describeAirPlayProcessExit(3221225477, null)).toContain('0xC0000005');
    expect(describeAirPlayProcessExit(0, null)).toBeNull();
    expect(describeAirPlayProcessExit(null, 'SIGTERM')).toContain('SIGTERM');
  });

  it('expires only after video frames stop arriving and can be cancelled on pause', () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    const watchdog = new AirPlayFrameWatchdog(expired);

    try {
      watchdog.markFrame();
      vi.advanceTimersByTime(3000);
      watchdog.markFrame();
      vi.advanceTimersByTime(3499);
      expect(expired).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(expired).toHaveBeenCalledOnce();

      watchdog.markFrame();
      watchdog.clear();
      vi.advanceTimersByTime(3500);
      expect(expired).toHaveBeenCalledOnce();
    } finally {
      watchdog.clear();
      vi.useRealTimers();
    }
  });

  it('clears device and video state after the AirPlay client disconnects', () => {
    expect(parseAirPlayLogLine('Open connections: 0')).toEqual({
      connected: false,
      videoStreaming: false,
      deviceName: null,
    });
    expect(parseAirPlayLogLine('***ERROR lost connection with client (network problem?)')).toEqual({
      connected: false,
      videoStreaming: false,
      deviceName: null,
    });
    expect(parseAirPlayLogLine('This packet indicates video stream is stopping')).toEqual({
      videoStreaming: false,
    });
  });

  it('ignores unrelated receiver output', () => {
    expect(parseAirPlayLogLine('Initialized server socket(s)')).toBeNull();
  });
});
