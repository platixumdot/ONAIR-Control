import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const width = 1920;
const height = 1080;
const radius = 56;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);

for (let value = 0; value < crcTable.length; value += 1) {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  crcTable[value] = crc >>> 0;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return result;
}

function createRoundedMask() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    for (let x = 0; x < width; x += 1) {
      const dx = Math.abs(x + 0.5 - width / 2) - (width / 2 - radius);
      const dy = Math.abs(y + 0.5 - height / 2) - (height / 2 - radius);
      const distance = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
      const alpha = Math.max(0, Math.min(255, Math.round((0.5 - distance) * 255)));
      const pixel = row + 1 + x * 4;
      pixels[pixel] = 255;
      pixels[pixel + 1] = 255;
      pixels[pixel + 2] = 255;
      pixels[pixel + 3] = alpha;
    }
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function ensureAirPlayMask(directory: string) {
  const maskPath = path.join(directory, 'airplay-rounded-mask.png');
  if (!fs.existsSync(maskPath)) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(maskPath, createRoundedMask());
  }
  return maskPath;
}
