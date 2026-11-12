#!/usr/bin/env node
// Renders the PWA PNG icons (same design as public/icons/icon.svg) with no dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#0d1117');
const TRACK = hex('#30363d');
const KNOBS = [[38, 20, hex('#4493f8')], [24, 32, hex('#3fb950')], [42, 44, hex('#d29922')]];

function shade(x, y, { maskable }) {
  // x, y in the 64-unit design space. Maskable icons are full-bleed with content scaled into the safe zone.
  let px = x, py = y;
  if (maskable) { px = 32 + (x - 32) / 0.8; py = 32 + (y - 32) / 0.8; }
  const inRounded = (() => {
    if (maskable) return true;
    const r = 14, cx = Math.min(Math.max(x, r), 64 - r), cy = Math.min(Math.max(y, r), 64 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  })();
  if (!inRounded) return null;
  for (const [kx, ky, c] of KNOBS) if ((px - kx) ** 2 + (py - ky) ** 2 <= 36) return c;
  for (const ly of [20, 32, 44]) {
    const cx = Math.min(Math.max(px, 16), 48);
    if ((px - cx) ** 2 + (py - ly) ** 2 <= 6.25) return TRACK;
  }
  return BG;
}

function png(size, opts) {
  const ss = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = shade(((x + (sx + 0.5) / ss) / size) * 64, ((y + (sy + 0.5) / ss) / size) * 64, opts);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
      }
      const n = ss * ss, o = y * (size * 4 + 1) + 1 + x * 4, cov = a / 255;
      raw[o] = cov ? Math.round(r / cov) : 0; raw[o + 1] = cov ? Math.round(g / cov) : 0; raw[o + 2] = cov ? Math.round(b / cov) : 0; raw[o + 3] = Math.round(a / n);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

const out = new URL('../public/icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192, { maskable: false }));
writeFileSync(new URL('icon-512.png', out), png(512, { maskable: false }));
writeFileSync(new URL('icon-maskable-512.png', out), png(512, { maskable: true }));
writeFileSync(new URL('../favicon.ico', out), png(32, { maskable: false })); // PNG-in-.ico is accepted by browsers
console.log('icons written');
