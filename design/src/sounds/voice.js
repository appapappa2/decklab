// A sung word, made on the spot like every other sound: a few low voices (saws
// a touch out of tune with each other) through a bank of formant filters that
// move from vowel to vowel, with filtered noise for the hiss and click of the
// consonants. Nothing is recorded. Used for the "Stress!" call: a low choir,
// kept quiet, saying the word under the rest of the table.
//
// A word is a list of segments in seconds; voiced segments name formants
// [F1, F2, F3] (Hz) that the filters glide to, unvoiced ones a noise band.
import { audio, output, hall, note, midiHz } from './synth.js';

const WORDS = {
  // s - t - r - eh - ss
  stress: [
    { noise: { freq: 6200, q: 1.4, gain: 0.22 }, t: 0, d: 0.13 }, // s
    { noise: { freq: 3800, q: 0.9, gain: 0.32 }, t: 0.16, d: 0.025 }, // t (the burst after a short gap)
    { formants: [330, 1050, 1450], t: 0.18, d: 0.09 }, // r: low F3 is what makes it an r
    { formants: [560, 1750, 2450], t: 0.27, d: 0.3 }, // eh
    { noise: { freq: 6000, q: 1.4, gain: 0.2 }, t: 0.52, d: 0.34 }, // ss, fading out
  ],
};
// How loud each formant is, lowest first: the higher ones are quieter, as in a voice.
const FORMANT_GAIN = [1, 0.5, 0.28];
const FORMANT_Q = [6, 9, 11];

/**
 * Sings `word` with one voice per note (a chord). Returns the seconds it lasts,
 * hall included. `level` is the whole word's volume.
 * - `child`: children's voices. Smaller throats put every formant (and the
 *   hiss) higher, kids say it quicker, and the pitch scoops up into the vowel
 *   and drops off at the end, sing-song.
 * - `stretch`: how drawn out the word is (1 = as written, 1.5 = half as long again).
 */
export function sing(word, notes = ['A2', 'E3', 'A3'], { at = 0, level = 0.5, hallMix = 0.25, child = false, stretch = 1 } = {}) {
  const base = WORDS[word];
  if (!base) return 0;
  const fScale = child ? 1.3 : 1; // formants
  const nScale = child ? 1.15 : 1; // hiss
  const tScale = (child ? 0.85 : 1) * stretch; // timing
  const segs = base.map((x) => ({
    ...x,
    t: x.t * tScale,
    d: x.d * tScale,
    formants: x.formants?.map((f) => f * fScale),
    noise: x.noise && { ...x.noise, freq: x.noise.freq * nScale },
  }));
  const c = audio();
  const t0 = c.currentTime + 0.01 + at;
  const voiced = segs.filter((s) => s.formants);
  const vStart = t0 + voiced[0].t;
  const vEnd = t0 + voiced.at(-1).t + voiced.at(-1).d;
  const end = t0 + Math.max(...segs.map((s) => s.t + s.d)) + 0.05;

  const out = c.createGain();
  out.gain.value = level;
  out.connect(output());
  let send;
  if (hallMix > 0) {
    send = c.createGain();
    send.gain.value = hallMix;
    out.connect(send).connect(hall(2.2).input);
  }
  const nodes = [];

  // ---- voiced part: the choir through moving formants
  const src = c.createGain();
  src.gain.value = 0;
  // Breathe in and out of the vowel rather than switching on.
  src.gain.setValueAtTime(0, vStart);
  src.gain.linearRampToValueAtTime(1, vStart + 0.04);
  src.gain.setValueAtTime(1, vEnd - 0.08);
  src.gain.linearRampToValueAtTime(0, vEnd + 0.03);
  notes.forEach((n, i) => {
    const hz = midiHz(note(n));
    for (const cents of [-9, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = cents + (Math.random() - 0.5) * 6;
      if (child) {
        // Scoop up a few semitones into the vowel, then fall away at the end.
        const off = o.detune.value;
        o.detune.setValueAtTime(off - 300, vStart);
        o.detune.linearRampToValueAtTime(off, vStart + 0.09);
        o.detune.setValueAtTime(off, vEnd - 0.12);
        o.detune.linearRampToValueAtTime(off - 250, vEnd + 0.03);
      }
      // A slow, slight vibrato, different in every voice.
      const lfo = c.createOscillator();
      lfo.frequency.value = 4.6 + Math.random() * 1.2 + i * 0.2;
      const depth = c.createGain();
      depth.gain.value = child ? 14 : 9;
      lfo.connect(depth).connect(o.detune);
      const g = c.createGain();
      g.gain.value = 0.22 / notes.length;
      o.connect(g).connect(src);
      o.start(vStart - 0.01);
      lfo.start(vStart - 0.01);
      o.stop(vEnd + 0.1);
      lfo.stop(vEnd + 0.1);
      nodes.push(o, lfo, depth, g);
    }
  });
  // A dark low-pass first, then the formants in parallel.
  const dark = c.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = child ? 5200 : 3200;
  src.connect(dark);
  nodes.push(src, dark);
  for (let k = 0; k < 3; k++) {
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = FORMANT_Q[k];
    f.frequency.setValueAtTime(voiced[0].formants[k], vStart);
    for (const s of voiced) f.frequency.linearRampToValueAtTime(s.formants[k], t0 + s.t + Math.min(0.07, s.d));
    const g = c.createGain();
    g.gain.value = FORMANT_GAIN[k] * 3.2; // band-passing takes most of the level away
    dark.connect(f).connect(g).connect(out);
    nodes.push(f, g);
  }

  // ---- consonants: filtered noise
  const len = Math.ceil(c.sampleRate * 0.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  for (const s of segs.filter((x) => x.noise)) {
    const n = c.createBufferSource();
    n.buffer = buf;
    n.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = s.noise.freq;
    f.Q.value = s.noise.q;
    const g = c.createGain();
    const a = t0 + s.t;
    const short = s.d < 0.05;
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(s.noise.gain, a + (short ? 0.004 : 0.03));
    if (short) g.gain.exponentialRampToValueAtTime(0.001, a + s.d);
    else {
      g.gain.setValueAtTime(s.noise.gain, a + s.d * 0.45);
      g.gain.linearRampToValueAtTime(0, a + s.d);
    }
    n.connect(f).connect(g).connect(out);
    n.start(a);
    n.stop(a + s.d + 0.02);
    nodes.push(n, f, g);
  }

  setTimeout(() => {
    for (const x of nodes) x.disconnect();
    out.disconnect();
    send?.disconnect();
  }, (end - c.currentTime) * 1000 + 3000);
  return end - c.currentTime + (hallMix > 0 ? 1.3 : 0);
}
