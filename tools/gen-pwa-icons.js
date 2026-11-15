/**
 * Процедурная генерация PWA-иконок (192x192, 512x512)
 * Без внешних зависимостей — тот же GLYPH-М, что и в favicon/gen-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'client', 'public');
const PNG_SIZES = [192, 512];

/* ---------- PNG helpers ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePng(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- drawing (same as gen-icon.js) ---------- */
const distToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const inRounded = (x, y) => {
  const R = 24;
  const cx = Math.min(Math.max(x, R), 100 - R);
  const cy = Math.min(Math.max(y, R), 100 - R);
  return Math.hypot(x - cx, y - cy) <= R;
};

const GLYPH = [
  [25, 75, 25, 25],
  [25, 25, 50, 55],
  [50, 55, 75, 25],
  [75, 25, 75, 75],
];

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 3;
  const stroke = 8;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cover = 0;
      let glyph = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((px + (sx + 0.5) / ss) / size) * 100;
          const y = ((py + (sy + 0.5) / ss) / size) * 100;
          if (!inRounded(x, y)) continue;
          cover += 1;
          const near = GLYPH.some(([ax, ay, bx, by]) =>
            distToSegment(x, y, ax, ay, bx, by) <= stroke / 2
          );
          if (near) glyph += 1;
        }
      }
      const a = cover / (ss * ss);
      if (!a) continue;
      const g = glyph / cover;
      const t = py / size;
      const r = Math.round(79 + (30 - 79) * t);
      const gg = Math.round(163 + (111 - 163) * t);
      const b = Math.round(255 + (217 - 255) * t);
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r + (255 - r) * g);
      rgba[i + 1] = Math.round(gg + (255 - gg) * g);
      rgba[i + 2] = Math.round(b + (255 - b) * g);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return rgba;
}

/* ---------- main ---------- */
fs.mkdirSync(OUT, { recursive: true });

for (const size of PNG_SIZES) {
  const rgba = drawIcon(size);
  const png = encodePng(size, rgba);
  const name = size === 512 ? 'icon-512.png' : `icon-${size}.png`;
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`  ${size}x${size} — ${png.length} bytes`);
}

console.log('PWA icons written to: ' + OUT);
