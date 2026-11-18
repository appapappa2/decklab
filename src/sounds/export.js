// Exports the whole sound bank as a zip of WAV files (the "Export all" button
// on the Sounds tab). Every sound is rendered offline, faster than real time, on
// a fresh OfflineAudioContext with the same master bus and halls as the game:
// the instruments are pointed at it for the moment the sound is started
// (swapEngine / swapMs20), then pointed straight back.
//
// Files are 44.1 kHz, 16-bit stereo, at the level they play in the game, with
// the silence after the tail trimmed. The zip is written here too (stored, not
// compressed: WAV barely compresses, and it keeps this small).
import { engineOn, swapEngine, output, hall, playSound } from './synth.js';
import { ms20NodeOn, swapMs20 } from './ms20.js';
import { SOUNDS, GROUPS } from './library.js';

const RATE = 44100;
const MAX_SECS = 10; // the longest anything may ring (Win and Lose with their hall are ~4 s)

/** Renders one sound; resolves to an AudioBuffer trimmed to where it falls silent. */
export async function renderSound(sound) {
  const off = new OfflineAudioContext(2, RATE * MAX_SECS, RATE);
  const engine = engineOn(off);
  const dl20 = await ms20NodeOn(off);

  const prev = swapEngine(engine);
  const prevDl20 = swapMs20(dl20);
  try {
    dl20.connect(output(), 0);
    dl20.connect(hall(1.2).input, 1);
    playSound(sound);
  } finally {
    swapEngine(prev);
    swapMs20(prevDl20);
  }

  // The DL-20 gets its notes as a message to the worklet: hold the render at
  // the first block until that message has surely arrived.
  off.suspend(128 / RATE).then(() => setTimeout(() => off.resume(), 40));
  const buf = await off.startRendering();
  return trim(buf);
}

/** Cuts the silence at the end (below -80 dB), keeping 50 ms after the last sound. */
function trim(buf) {
  const chans = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  let last = 0;
  for (const d of chans) {
    for (let i = d.length - 1; i > last; i--) {
      if (Math.abs(d[i]) > 1e-4) {
        last = i;
        break;
      }
    }
  }
  const len = Math.min(buf.length, last + Math.round(RATE * 0.05));
  return chans.map((d) => d.subarray(0, Math.max(1, len)));
}

/** 16-bit PCM WAV from channel arrays. */
function wav(chans) {
  const n = chans[0].length;
  const ch = chans.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, ch, true);
  out.setUint32(24, RATE, true);
  out.setUint32(28, RATE * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}

// ------------------------------------------------------------------ zip

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip (stored entries) from [{ name, data: Uint8Array }]. */
function zip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = (sig, extra) => {
      const v = new DataView(new ArrayBuffer(extra));
      v.setUint32(0, sig, true);
      return v;
    };
    const local = head(0x04034b50, 30);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);

    const cd = head(0x02014b50, 46);
    cd.setUint16(4, 20, true); // made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/**
 * Renders every sound in the bank and downloads them as thedeck-sounds.zip,
 * one folder per group. `progress(done, total, sound)` is called as it goes.
 */
export async function exportAll(progress = () => {}) {
  const files = [];
  const list = SOUNDS.filter((s) => GROUPS.some((g) => g.id === s.group));
  for (const [i, s] of list.entries()) {
    progress(i, list.length, s);
    const n = String(list.filter((x) => x.group === s.group).indexOf(s) + 1).padStart(2, '0');
    files.push({ name: `thedeck-sounds/${s.group}/${n}-${s.id}.wav`, data: wav(await renderSound(s)) });
  }
  progress(list.length, list.length, null);
  const url = URL.createObjectURL(zip(files));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'thedeck-sounds.zip';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return files.length;
}
