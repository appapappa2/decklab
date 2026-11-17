// A small monophonic analog-style synth in Web Audio, laid out like the
// classic one-oscillator monosynths of the early 80s:
//
//   VCO     one oscillator: sawtooth and a pulse with pulse-width modulation
//           (manual, LFO or envelope), plus a sub oscillator (square one or
//           two octaves down, or a narrow pulse two down) and white noise
//   MIXER   a level for each of those four sources
//   VCF     a 24 dB/oct resonant low-pass (two biquads in series) with
//           envelope, LFO and keyboard follow
//   VCA     opened by the envelope, or by the gate (organ-style on/off)
//   ENV     ADSR
//   LFO     triangle, square, random (sample & hold) or noise, to pitch,
//           pulse width and cutoff
//   GLIDE   portamento between legato notes
//   BEND    a pitch sweep at the start of each note (cents, decaying to 0).
//           Not on the old hardware, but sound effects live on it.
//
// A Voice is one mono instrument. `play(patch, notes)` makes a throwaway voice
// for a sequence of notes (so sounds can overlap); the keyboard on the panel
// keeps one live voice. Envelopes use setTargetAtTime throughout, so a new
// segment always starts from wherever the last one got to (no clicks, and no
// need to know the current value).

export const DEFAULT_PATCH = {
  vco: { range: 0, mod: 0, pw: 0, pwm: 'man' }, // range: octave shift; mod: LFO to pitch (0..1); pw: 0 (50%) .. 1 (narrow); pwm: man | lfo | env
  mix: { saw: 0.8, pulse: 0, sub: 0, subType: 'oct1', noise: 0 }, // subType: oct1 | oct2 | pulse2
  vcf: { freq: 2400, res: 0.2, env: 0.4, mod: 0, kybd: 0.5 }, // freq Hz; env/mod 0..1; kybd 0..1
  vca: 'env', // env | gate
  env: { a: 0.005, d: 0.3, s: 0.6, r: 0.25 },
  lfo: { rate: 5, wave: 'tri' }, // tri | square | random | noise
  glide: 0,
  bend: { amt: 0, time: 0.2 }, // cents at note start, gliding back to 0 over `time` s
  vol: 0.7,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C4' / 'F#5' / 'Bb3' / 60 -> midi number. */
export function note(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  return NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

/** Deep-merge a partial patch over the defaults. */
export function makePatch(over = {}, base = DEFAULT_PATCH) {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k];
    const o = over[k];
    out[k] = b && typeof b === 'object' ? { ...b, ...(o || {}) } : o ?? b;
  }
  return out;
}

// ------------------------------------------------------------------ engine

let ctx = null;
let master = null;
let analyser = null;
const shared = {};

/** The audio graph is made on first use (browsers only allow it after a gesture). */
export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(comp).connect(analyser).connect(ctx.destination);
    // White noise, two seconds, looped.
    const len = ctx.sampleRate * 2;
    shared.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = shared.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Sample & hold: 64 random steps, one per LFO cycle when played at `rate`.
    const steps = 64;
    const per = 256;
    shared.random = ctx.createBuffer(1, steps * per, ctx.sampleRate);
    const r = shared.random.getChannelData(0);
    for (let s = 0; s < steps; s++) {
      const v = Math.random() * 2 - 1;
      for (let i = 0; i < per; i++) r[s * per + i] = v;
    }
    shared.randomPer = per;
    // Pulse from saw: a hard step at 0. The pulse width is a DC offset added before it.
    shared.step = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) shared.step[i] = i < 1024 ? -1 : 1;
    // Narrow pulse for the sub oscillator (25%).
    const N = 64;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    shared.pulse25 = ctx.createPeriodicWave(re, im);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const getAnalyser = () => (audio(), analyser);
export function setMasterVolume(v) {
  audio();
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}

const tc = (s) => Math.max(0.001, s / 4); // time constant: ~98% of the way in `s` seconds

export class Voice {
  constructor(patch, { live = false } = {}) {
    const c = audio();
    this.c = c;
    this.p = makePatch(patch);
    this.live = live;
    this.held = []; // live mode: keys down, last on top
    this.gateOn = false;
    this.lastMidi = null;
    const p = this.p;
    const src = (offset = 0) => {
      const s = c.createConstantSource();
      s.offset.value = offset;
      s.start();
      return s;
    };
    const gain = (v = 0) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };

    // Control signals
    this.freq = src(220); // the played pitch, Hz (glide happens here)
    this.bend = src(0); // cents
    this.env = src(0); // ADSR 0..1
    this.amp = src(0); // what opens the VCA: the env, or the gate

    // LFO (one source per wave so the wave can change live)
    this.lfoOut = gain(1);
    this.makeLfo();

    // VCO
    this.saw = c.createOscillator();
    this.saw.type = 'sawtooth';
    this.saw.frequency.value = 0;
    this.sub = c.createOscillator();
    this.sub.frequency.value = 0;
    this.subRatio = gain(0.5);
    this.freq.connect(this.saw.frequency);
    this.freq.connect(this.subRatio).connect(this.sub.frequency);
    this.lfoPitch = gain(0);
    this.lfoOut.connect(this.lfoPitch);
    for (const o of [this.saw, this.sub]) {
      this.bend.connect(o.detune);
      this.lfoPitch.connect(o.detune);
    }
    // Pulse: saw + offset -> hard step. The offset is the pulse width.
    this.pwSum = gain(1);
    this.pwBase = src(0);
    this.pwLfo = gain(0);
    this.pwEnv = gain(0);
    this.saw.connect(this.pwSum);
    this.pwBase.connect(this.pwSum);
    this.lfoOut.connect(this.pwLfo).connect(this.pwSum);
    this.env.connect(this.pwEnv).connect(this.pwSum);
    this.shaper = c.createWaveShaper();
    this.shaper.curve = shared.step;
    this.pwSum.connect(this.shaper);
    // Noise
    this.noise = c.createBufferSource();
    this.noise.buffer = shared.noise;
    this.noise.loop = true;
    this.noise.loopStart = Math.random();

    // Mixer
    this.mSaw = gain();
    this.mPulse = gain();
    this.mSub = gain();
    this.mNoise = gain();
    this.mix = gain(0.5);
    this.saw.connect(this.mSaw).connect(this.mix);
    this.shaper.connect(this.mPulse).connect(this.mix);
    this.sub.connect(this.mSub).connect(this.mix);
    this.noise.connect(this.mNoise).connect(this.mix);

    // VCF: two low-passes in series; envelope and LFO move both through detune (cents).
    this.f1 = c.createBiquadFilter();
    this.f2 = c.createBiquadFilter();
    this.fEnv = gain(0);
    this.fLfo = gain(0);
    this.env.connect(this.fEnv);
    this.lfoOut.connect(this.fLfo);
    for (const f of [this.f1, this.f2]) {
      f.type = 'lowpass';
      this.fEnv.connect(f.detune);
      this.fLfo.connect(f.detune);
    }
    // VCA
    this.vca = gain(0);
    this.amp.connect(this.vca.gain);
    this.out = gain(p.vol);
    this.mix.connect(this.f1).connect(this.f2).connect(this.vca).connect(this.out).connect(master);

    for (const o of [this.saw, this.sub, this.noise]) o.start();
    this.apply(p);
  }

  makeLfo() {
    const c = this.c;
    const { wave, rate } = this.p.lfo;
    try {
      this.lfo?.stop();
    } catch {}
    this.lfo?.disconnect();
    if (wave === 'tri' || wave === 'square') {
      const o = c.createOscillator();
      o.type = wave === 'tri' ? 'triangle' : 'square';
      o.frequency.value = rate;
      this.lfo = o;
    } else {
      const b = c.createBufferSource();
      b.buffer = wave === 'random' ? shared.random : shared.noise;
      b.loop = true;
      // random: one step per cycle; noise: slowed white noise, rate sets how fast it wanders
      b.playbackRate.value = wave === 'random' ? (rate * shared.randomPer) / c.sampleRate : clamp(rate / 40, 0.01, 1);
      this.lfo = b;
    }
    this.lfo.connect(this.lfoOut);
    this.lfo.start();
    this.lfoWave = wave;
  }

  /** Applies a (whole) patch to the running voice; the panel calls this on every change. */
  apply(patch) {
    const p = (this.p = makePatch(patch));
    const t = this.c.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, t, 0.01);
    if (p.lfo.wave !== this.lfoWave) this.makeLfo();
    else if (this.lfo.frequency) set(this.lfo.frequency, p.lfo.rate);
    else this.lfo.playbackRate.value = p.lfo.wave === 'random' ? (p.lfo.rate * shared.randomPer) / this.c.sampleRate : clamp(p.lfo.rate / 40, 0.01, 1);
    set(this.lfoPitch.gain, p.vco.mod ** 2 * 1200); // up to an octave of vibrato
    // Sub oscillator
    const sub = p.mix.subType;
    this.subRatio.gain.value = sub === 'oct1' ? 0.5 : 0.25;
    if (sub === 'pulse2') this.sub.setPeriodicWave(shared.pulse25);
    else this.sub.type = 'square';
    // Pulse width: 0 -> 50%, 1 -> ~5%
    const pw = -clamp(p.vco.pw, 0, 1) * 0.9;
    // man: fixed width; lfo: swings between 50% and the set width; env: 50% at rest, the set width at the peak
    set(this.pwBase.offset, p.vco.pwm === 'man' ? pw : p.vco.pwm === 'lfo' ? pw / 2 : 0);
    set(this.pwLfo.gain, p.vco.pwm === 'lfo' ? -pw / 2 : 0);
    set(this.pwEnv.gain, p.vco.pwm === 'env' ? pw : 0);
    // Mixer (the pulse and the sub are louder by nature; even them out)
    set(this.mSaw.gain, p.mix.saw);
    set(this.mPulse.gain, p.mix.pulse * 0.7);
    set(this.mSub.gain, p.mix.sub * 0.8);
    set(this.mNoise.gain, p.mix.noise * 0.9);
    // Filter
    set(this.fEnv.gain, p.vcf.env * 6000);
    set(this.fLfo.gain, p.vcf.mod ** 2 * 3600);
    const q = 0.5 + p.vcf.res ** 1.5 * 22;
    set(this.f1.Q, 0.6 + p.vcf.res * 2);
    set(this.f2.Q, q);
    this.setCutoff(this.lastMidi ?? 60, t, 0.01);
    set(this.out.gain, p.vol);
  }

  setCutoff(midi, t, time) {
    const { freq, kybd } = this.p.vcf;
    const hz = clamp(freq * 2 ** (((midi - 60) / 12) * kybd), 20, 20000);
    for (const f of [this.f1, this.f2]) f.frequency.setTargetAtTime(hz, t, time);
  }

  /** Starts a note at time t. legato = a key was still down: glide, and don't restart the envelope. */
  noteOn(midi, t = this.c.currentTime, { legato = false, vel = 1 } = {}) {
    const p = this.p;
    const hz = midiHz(midi + p.vco.range * 12);
    const glide = legato && p.glide > 0 ? tc(p.glide * 2) : 0;
    this.freq.offset.cancelScheduledValues(t);
    if (glide) this.freq.offset.setTargetAtTime(hz, t, glide);
    else this.freq.offset.setValueAtTime(hz, t);
    this.setCutoff(midi, t, glide || 0.002);
    if (p.bend.amt && !legato) {
      this.bend.offset.cancelScheduledValues(t);
      this.bend.offset.setValueAtTime(p.bend.amt, t);
      this.bend.offset.setTargetAtTime(0, t, tc(p.bend.time));
    }
    const { a, d, s } = p.env;
    const env = this.env.offset;
    const amp = this.amp.offset;
    env.cancelScheduledValues(t);
    amp.cancelScheduledValues(t);
    if (!legato) {
      env.setTargetAtTime(vel, t, tc(a));
      env.setTargetAtTime(s * vel, t + a, tc(d));
    } else {
      env.setTargetAtTime(s * vel, t, tc(d));
    }
    if (p.vca === 'gate') amp.setTargetAtTime(vel, t, 0.002);
    else {
      if (!legato) {
        amp.setTargetAtTime(vel, t, tc(a));
        amp.setTargetAtTime(s * vel, t + a, tc(d));
      } else amp.setTargetAtTime(s * vel, t, tc(d));
    }
    this.lastMidi = midi;
  }

  noteOff(t = this.c.currentTime) {
    const r = this.p.env.r;
    for (const prm of [this.env.offset, this.amp.offset]) {
      prm.cancelScheduledValues(t);
      prm.setTargetAtTime(0, t, prm === this.amp.offset && this.p.vca === 'gate' ? 0.004 : tc(r));
    }
  }

  // Live keyboard: last-note priority, legato while keys overlap.
  keyDown(midi) {
    if (this.held.includes(midi)) return;
    const legato = this.held.length > 0;
    this.held.push(midi);
    this.noteOn(midi, this.c.currentTime, { legato });
  }

  keyUp(midi) {
    const i = this.held.indexOf(midi);
    if (i < 0) return;
    this.held.splice(i, 1);
    if (!this.held.length) this.noteOff();
    else if (i === this.held.length) this.noteOn(this.held[this.held.length - 1], this.c.currentTime, { legato: true });
  }

  allOff() {
    this.held = [];
    this.noteOff();
  }

  /** Stops everything at time t and frees the graph. */
  dispose(t = this.c.currentTime) {
    for (const o of [this.saw, this.sub, this.noise, this.lfo, this.freq, this.bend, this.env, this.amp, this.pwBase]) {
      try {
        o.stop(t);
      } catch {}
    }
    const stopAt = Math.max(0, t - this.c.currentTime) * 1000 + 100;
    setTimeout(() => this.out.disconnect(), stopAt);
  }
}

/**
 * Plays a sequence on a fresh voice: notes are [note, start s, length s, velocity?].
 * Overlapping notes are legato (they glide when the patch has glide).
 * Returns the time (s) it will take, release included.
 */
export function play(patch, notes, { at = 0 } = {}) {
  const v = new Voice(patch);
  const t0 = v.c.currentTime + 0.01 + at;
  const list = notes.map(([n, t, d, vel = 1]) => ({ m: note(n), t: t0 + t, end: t0 + t + d, vel })).sort((a, b) => a.t - b.t);
  let prevEnd = -1;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    const next = list[i + 1];
    v.noteOn(n.m, n.t, { legato: n.t < prevEnd, vel: n.vel });
    // A note's release is scheduled only if the next one doesn't start first.
    if (!next || next.t >= n.end) v.noteOff(n.end);
    prevEnd = Math.max(prevEnd, n.end);
  }
  const end = prevEnd + v.p.env.r * 1.3 + 0.05;
  v.dispose(end);
  return end - v.c.currentTime;
}

/** A sound: one or more layers, each its own voice (library.js makes them fresh on every play). */
export function playSound(sound) {
  let longest = 0;
  const layers = sound.make ? sound.make() : sound.layers;
  for (const layer of layers) longest = Math.max(longest, play(layer.patch, layer.notes, { at: layer.at || 0 }));
  return longest;
}
