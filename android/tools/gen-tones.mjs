// Generates short synthesized notification tones into app/src/main/res/raw.
// Run: node android/tools/gen-tones.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "src", "main", "res", "raw");
mkdirSync(OUT, { recursive: true });

function note(freqStart, freqEnd, seconds, gain = 0.35) {
  const n = Math.floor(RATE * seconds);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = freqStart + (freqEnd - freqStart) * t;
    phase += (2 * Math.PI * f) / RATE;
    const attack = Math.min(1, i / (RATE * 0.008));
    const env = attack * Math.exp(-4.5 * t);
    out[i] = gain * env * (Math.sin(phase) + 0.25 * Math.sin(2 * phase));
  }
  return out;
}

function silence(seconds) {
  return new Float32Array(Math.floor(RATE * seconds));
}

function concat(...parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const tones = {
  tone_chime: concat(note(880, 880, 0.18), note(1318, 1318, 0.32)),
  tone_pulse: concat(note(660, 660, 0.09), silence(0.05), note(660, 660, 0.09), silence(0.05), note(990, 990, 0.16)),
  tone_soft: note(523, 587, 0.45, 0.28),
  launch_pulse: concat(note(440, 880, 0.28, 0.3), note(1046, 1046, 0.3, 0.25)),
};

for (const [name, samples] of Object.entries(tones)) {
  writeFileSync(join(OUT, `${name}.wav`), wav(samples));
  console.log(`wrote ${name}.wav (${(samples.length / RATE).toFixed(2)}s)`);
}
