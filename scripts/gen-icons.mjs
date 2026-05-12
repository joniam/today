// One-off generator for placeholder PWA icons. Solid color, no deps.
// Run: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

// Warm red, matches the heat-map top color in the design spec.
const COLOR = { r: 192, g: 57, b: 43, a: 255 };

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function solidPng(width, height, { r, g, b, a }) {
  const rowBytes = 1 + width * 4;
  const scanline = Buffer.alloc(rowBytes);
  scanline[0] = 0;
  for (let x = 0; x < width; x++) {
    scanline[1 + x * 4 + 0] = r;
    scanline[1 + x * 4 + 1] = g;
    scanline[1 + x * 4 + 2] = b;
    scanline[1 + x * 4 + 3] = a;
  }
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) scanline.copy(raw, y * rowBytes);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  const out = resolve(publicDir, name);
  writeFileSync(out, solidPng(size, size, COLOR));
  console.log('wrote', out);
}
