import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ensureAirPlayMask } from './airplayMask.js';

describe('ensureAirPlayMask', () => {
  it('writes a transparent-corner 1920x1080 PNG mask for OBS', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onair-airplay-mask-'));
    try {
      const maskPath = ensureAirPlayMask(directory);
      const png = fs.readFileSync(maskPath);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(1920);
      expect(png.readUInt32BE(20)).toBe(1080);

      let offset = 8;
      const compressed: Buffer[] = [];
      while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.toString('ascii', offset + 4, offset + 8);
        if (type === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
      }

      const pixels = inflateSync(Buffer.concat(compressed));
      const stride = 1920 * 4 + 1;
      expect(pixels[4]).toBe(0);
      expect(pixels[540 * stride + 1 + 960 * 4 + 3]).toBe(255);
      expect(ensureAirPlayMask(directory)).toBe(maskPath);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
