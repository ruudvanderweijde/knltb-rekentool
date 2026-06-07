'use strict';

// Generate placeholder extension icons (16/48/128) with no image-library
// dependency — a tiny hand-rolled PNG encoder. Design: KNLTB-blue rounded
// square with an orange ball. Replace with real artwork before store release.
//   node scripts/make-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.resolve(__dirname, '..', 'extension', 'icons');
const BLUE = [0x00, 0x30, 0x87];
const ORANGE = [0xF4, 0x79, 0x20];
const WHITE = [0xff, 0xff, 0xff];

// CRC32 (PNG chunk checksums).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, pixels /* RGBA Uint8Array, size*size*4 */) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  // scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.subarray(y * size * 4, (y + 1) * size * 4)
      .forEach((v, i) => { raw[y * (size * 4 + 1) + 1 + i] = v; });
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  const r = size * 0.30;            // ball radius
  const cx = size * 0.5, cy = size * 0.5;
  const corner = size * 0.18;       // rounded-square corner radius
  const set = (x, y, [cr, cg, cb], a = 255) => {
    const o = (y * size + x) * 4;
    px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = a;
  };
  const inRoundedRect = (x, y) => {
    const dx = Math.max(corner - x, x - (size - 1 - corner), 0);
    const dy = Math.max(corner - y, y - (size - 1 - corner), 0);
    return dx * dx + dy * dy <= corner * corner;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRoundedRect(x, y)) { set(x, y, BLUE, 0); continue; } // transparent outside
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) {
        // ball, with a thin white seam arc for a padel/tennis feel
        const seam = Math.abs(d - r * 0.72) < size * 0.018;
        set(x, y, seam ? WHITE : ORANGE);
      } else {
        set(x, y, BLUE);
      }
    }
  }
  return px;
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(OUT, `icon${size}.png`), encodePng(size, render(size)));
}
console.log('Wrote extension/icons/icon{16,48,128}.png');
