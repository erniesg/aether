// Regenerate the 6 reference fixture PNGs.
//
// Usage:
//   node tests/fixtures/refs/generate.mjs
//
// Deterministic: identical bytes on every run. Checked in, so CI does not
// need to execute this — the script exists so a future contributor can
// extend the palette without reaching for Pillow / ImageMagick.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const PALETTE = [
  { name: 'red-sunset.png', rgb: [220, 80, 40] },
  { name: 'orange-dusk.png', rgb: [230, 130, 50] },
  { name: 'green-moss.png', rgb: [60, 140, 80] },
  { name: 'teal-leaf.png', rgb: [40, 150, 120] },
  { name: 'blue-ocean.png', rgb: [40, 90, 180] },
  { name: 'indigo-sky.png', rgb: [60, 70, 160] },
];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n >>> 0, 0);
  return buf;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = u32(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([u32(data.length), typeBuf, data, crc]);
}

function buildPng([r, g, b]) {
  const SIZE = 8;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.concat([
    u32(SIZE),
    u32(SIZE),
    Buffer.from([0x08, 0x02, 0x00, 0x00, 0x00]),
  ]);

  const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (1 + SIZE * 3)] = 0;
    for (let x = 0; x < SIZE; x++) {
      const off = y * (1 + SIZE * 3) + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }

  const zlibHeader = Buffer.from([0x78, 0x01]);
  const blockHeader = Buffer.alloc(5);
  blockHeader[0] = 1;
  blockHeader.writeUInt16LE(raw.length, 1);
  blockHeader.writeUInt16LE(~raw.length & 0xffff, 3);
  const zlibStream = Buffer.concat([zlibHeader, blockHeader, raw, u32(adler32(raw))]);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStream),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const { name, rgb } of PALETTE) {
  writeFileSync(join(HERE, name), buildPng(rgb));
}
