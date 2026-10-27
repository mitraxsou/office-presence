// Writes src/app/favicon.ico: the dot-in-ring mark rasterized at 16, 32, and 48 px.
// Run: node scripts/gen-favicon.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORANGE = [0x08, 0x51, 0xfd]; // BGR
const DARK = [0x1a, 0x1a, 0x1a];

function bmp(size) {
  const s = size / 64;
  const cx = 30 * s, cy = 34 * s, ringR = 17 * s, ringW = 2.6 * s, dotR = 7 * s, corner = 14 * s;
  const px = Buffer.alloc(size * size * 4);
  const sample = (x, y) => {
    const inCorner = (ax, ay) => Math.hypot(x - ax, y - ay) > corner;
    if ((x < corner && y < corner && inCorner(corner, corner)) ||
        (x > size - corner && y < corner && inCorner(size - corner, corner)) ||
        (x < corner && y > size - corner && inCorner(corner, size - corner)) ||
        (x > size - corner && y > size - corner && inCorner(size - corner, size - corner))) return null;
    const d = Math.hypot(x - cx, y - cy);
    if (d <= dotR || Math.abs(d - ringR) <= ringW) return ORANGE;
    const da = Math.hypot(x - 22 * s, y - 34 * s);
    const angle = Math.atan2(y - 34 * s, x - 22 * s);
    if (Math.abs(da - 32 * s) <= 2.3 * s && angle > -1.35 && angle < -0.55) return ORANGE;
    return DARK;
  };
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let b = 0, g = 0, r = 0, a = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const c = sample(col + ox, row + oy);
        if (c) { b += c[0]; g += c[1]; r += c[2]; a += 255; }
      }
      const y = size - 1 - row;
      const o = (y * size + col) * 4;
      const n = a / 255 || 1;
      px[o] = b / n; px[o + 1] = g / n; px[o + 2] = r / n; px[o + 3] = a / 4;
    }
  }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(px.length, 20);
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  return Buffer.concat([header, px, mask]);
}

const sizes = [16, 32, 48];
const images = sizes.map(bmp);
const dir = Buffer.alloc(6 + sizes.length * 16);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((size, i) => {
  const e = 6 + i * 16;
  dir.writeUInt8(size, e);
  dir.writeUInt8(size, e + 1);
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(images[i].length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "favicon.ico");
writeFileSync(out, Buffer.concat([dir, ...images]));
console.log(`wrote ${out}`);
