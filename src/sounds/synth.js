// The DL-106: a six-voice analog-style polysynth in Web Audio, laid out like
// the Roland Juno-106 (1984).
//
// Which model it follows. The most faithful open-source Juno-106 emulation is
// the Ultramaster KR-106 (kayrock.org/kr106, GPL-3): per-voice DCO, IR3109
// filter and MN3009 chorus models calibrated from hardware measurements,
// firmware analysis and the factory schematics. It is a C++ plug-in under the
// GPL, so its code is not used here; this is an independent implementation of
// the same architecture on Web Audio's own nodes, with the 106's signal flow,
// control set and ranges:
//
//   LFO      one triangle LFO for all voices, with a delay (it fades in after
//            the first key of a phrase)
//   DCO      sawtooth and pulse (each a switch, like the hardware), pulse
//            width set by hand or swept by the LFO, a square sub oscillator
//            one octave down and white noise (each a level), 16' / 8' / 4'
//   HPF      four positions: 0 bass boost, 1 flat, 2 and 3 cut the lows
//   VCF      24 dB/oct resonant low-pass per voice: frequency, resonance,
//            envelope amount with a polarity switch, LFO amount, keyboard follow
//   VCA      opened by the envelope or by the gate (organ on/off), and a level
//   ENV      one ADSR per voice, shared by filter and amplifier
//   CHORUS   off, I or II: two short delay lines swept in opposite directions,
//            one to each side (the 106's wide stereo)
//   ASSIGN   poly (six voices, each with a little analog drift), mono
//            (last-note priority, legato) or unison (all voices on one note,
//            detuned), and portamento
//
// Three things the hardware does not have, kept apart on the panel as extras
// because sound effects live on them:
//   SWEEP    a pitch sweep at the start of each note (cents, decaying to 0)
//   DELAY    a ping-pong echo with a darkening feedback path
//   REVERB   a generated hall (a few sizes), shared by every sound
//
// A Synth is one instrument with one patch. `play(patch, notes)` makes a
// throwaway one for a sequence (so sounds can overlap); the keyboard on the
// panel keeps a live one. Envelopes use setTargetAtTime throughout, so a new
// segment always starts from wherever the last one got to (no clicks).

export const VOICES = 6;

export const DEFAULT_PATCH = {
  lfo: { rate: 5, delay: 0 }, // Hz; seconds before it has faded in
  dco: { range: 0, lfo: 0, pwm: 0, pwmMode: 'man', pulse: false, saw: true, sub: 0, noise: 0 }, // range: octave shift; lfo: vibrato 0..1; pwm: width (man) or depth (lfo), 0 = square
  hpf: 1, // 0 bass boost | 1 flat | 2 | 3
  vcf: { freq: 2400, res: 0.2, env: 0.4, pol: 1, lfo: 0, kybd: 0.5 }, // freq Hz; pol 1 | -1
  vca: { mode: 'env', level: 0.7 }, // env | gate
  env: { a: 0.005, d: 0.3, s: 0.6, r: 0.25 },
  chorus: 0, // 0 off | 1 | 2
  assign: { mode: 'poly', porta: 0 }, // poly | mono | unison; portamento seconds
  sweep: { amt: 0, time: 0.2 }, // cents at note start, gliding back to 0 over `time` s
  delay: { mix: 0, time: 0.28, fb: 0.35 },
  reverb: { mix: 0, size: 1.6 }, // size: decay in seconds
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
import { playMs20 } from './ms20.js';
import { sing } from './voice.js';

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
let shared = {};
let halls = new Map(); // decay seconds -> the input of a shared reverb

/** The audio graph is made on first use (browsers only allow it after a gesture). */
export function audio() {
  if (!ctx) ({ ctx, master, analyser, shared, halls } = engineOn(new (window.AudioContext || window.webkitAudioContext)()));
  if (ctx.state === 'suspended' && !(ctx instanceof OfflineAudioContext)) ctx.resume();
  return ctx;
}

/** The master bus (compressor, analyser) and the shared buffers, built on context `ctx`. */
export function engineOn(ctx) {
  const shared = {};
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  // Chords and layered sounds add up: this holds the peaks down.
  comp.threshold.value = -16;
  comp.knee.value = 8;
  comp.ratio.value = 12;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  master.connect(comp).connect(analyser).connect(ctx.destination);
  // White noise, two seconds, looped.
  const len = ctx.sampleRate * 2;
  shared.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = shared.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // Pulse from saw: a hard step at 0. The pulse width is a DC offset added before it.
  shared.step = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) shared.step[i] = i < 1024 ? -1 : 1;
  return { ctx, master, analyser, shared, halls: new Map() };
}

/**
 * Makes `next` (from engineOn) the engine every instrument plays on, and returns
 * the one it replaces. Only for rendering offline (export.js): swap in, start
 * the sound, swap straight back, all without awaiting in between.
 */
export function swapEngine(next) {
  const prev = { ctx, master, analyser, shared, halls };
  ({ ctx, master, analyser, shared, halls } = next);
  return prev;
}
export const getAnalyser = () => (audio(), analyser);
/** Where every instrument ends up: the master bus (the DL-20 in ms20.js plugs in here too). */
export const output = () => (audio(), master);
export function setMasterVolume(v) {
  audio();
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}

const HALL_SIZES = [0.6, 1.2, 2.2, 3.6, 5.5];
/** A shared hall of roughly `size` seconds: decaying stereo noise that gets darker as it fades. */
export function hall(size) {
  const c = audio();
  const secs = HALL_SIZES.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best));
  if (!halls.has(secs)) {
    const len = Math.round(c.sampleRate * secs);
    const pre = Math.round(c.sampleRate * 0.012);
    const buf = c.createBuffer(2, len + pre, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const a = 1 - 0.8 * t; // the low-pass closes as the tail goes on
        y += a * (Math.random() * 2 - 1 - y);
        d[pre + i] = y * Math.exp(-6.2 * t);
      }
    }
    const conv = c.createConvolver();
    conv.buffer = buf;
    const input = c.createGain();
    const out = c.createGain();
    out.gain.value = 0.55;
    input.connect(conv).connect(out).connect(master);
    halls.set(secs, input);
  }
  return { input: halls.get(secs), secs };
}

const tc = (s) => Math.max(0.001, s / 4); // time constant: ~98% of the way in `s` seconds

// The chorus, from measurements of the hardware: both lines sweep 1.66..5.35 ms
// in opposite directions; I is the slow one, II the faster.
const CHORUS = { base: 0.0035, depth: 0.00185, rates: [0, 0.513, 0.863] };
const HPF = [
  { type: 'lowshelf', freq: 90, gain: 8 },
  { type: 'highpass', freq: 12, gain: 0 },
  { type: 'highpass', freq: 236, gain: 0 },
  { type: 'highpass', freq: 754, gain: 0 },
];

/** One voice: DCO, mixer, VCF, VCA and its envelope. */
class Voice {
  constructor(inst, cents) {
    const c = inst.c;
    this.inst = inst;
    this.c = c;
    this.cents = cents; // this voice's own tuning: analog drift, or its place in a unison stack
    this.midi = null; // what it is playing
    this.down = false; // a key is holding it
    this.since = 0; // when it last started or was released (for stealing)
    this.busyUntil = -1; // one-shots: when its note ends
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
    this.freq = src(220); // the played pitch, Hz (portamento happens here)
    this.sweep = src(0); // cents
    this.env = src(0); // ADSR 0..1
    this.amp = src(0); // what opens the VCA: the env, or the gate

    // DCO
    this.saw = c.createOscillator();
    this.saw.type = 'sawtooth';
    this.saw.frequency.value = 0;
    this.sub = c.createOscillator();
    this.sub.type = 'square';
    this.sub.frequency.value = 0;
    const half = gain(0.5);
    this.freq.connect(this.saw.frequency);
    this.freq.connect(half).connect(this.sub.frequency);
    for (const o of [this.saw, this.sub]) {
      o.detune.value = cents;
      this.sweep.connect(o.detune);
      inst.lfoPitch.connect(o.detune);
    }
    // Pulse: saw + offset -> hard step. The offset is the pulse width.
    this.pwSum = gain(1);
    this.pwBase = src(0);
    this.pwLfo = gain(0);
    this.saw.connect(this.pwSum);
    this.pwBase.connect(this.pwSum);
    inst.lfoOut.connect(this.pwLfo).connect(this.pwSum);
    this.shaper = c.createWaveShaper();
    this.shaper.curve = shared.step;
    this.pwSum.connect(this.shaper);

    // Mixer
    this.mSaw = gain();
    this.mPulse = gain();
    this.mSub = gain();
    this.mNoise = gain();
    this.mix = gain(0.5);
    this.saw.connect(this.mSaw).connect(this.mix);
    this.shaper.connect(this.mPulse).connect(this.mix);
    this.sub.connect(this.mSub).connect(this.mix);
    inst.noise.connect(this.mNoise).connect(this.mix);

    // VCF: two low-passes in series; envelope and LFO move both through detune (cents).
    this.f1 = c.createBiquadFilter();
    this.f2 = c.createBiquadFilter();
    this.fEnv = gain(0);
    this.fLfo = gain(0);
    this.env.connect(this.fEnv);
    inst.lfoOut.connect(this.fLfo);
    for (const f of [this.f1, this.f2]) {
      f.type = 'lowpass';
      this.fEnv.connect(f.detune);
      this.fLfo.connect(f.detune);
    }
    // VCA
    this.vca = gain(0);
    this.amp.connect(this.vca.gain);
    this.mix.connect(this.f1).connect(this.f2).connect(this.vca).connect(inst.sum);

    this.saw.start();
    this.sub.start();
    this.apply();
  }

  apply() {
    const p = this.inst.p;
    const t = this.c.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, t, 0.01);
    // Pulse width: 0 -> 50%, 1 -> ~5%. By hand it is fixed; from the LFO it swings between 50% and that.
    const pw = -clamp(p.dco.pwm, 0, 1) * 0.9;
    set(this.pwBase.offset, p.dco.pwmMode === 'man' ? pw : pw / 2);
    set(this.pwLfo.gain, p.dco.pwmMode === 'lfo' ? -pw / 2 : 0);
    // Both waves on sum, a little lower each (the pulse and the sub are louder by nature).
    const both = p.dco.saw && p.dco.pulse ? 0.8 : 1;
    set(this.mSaw.gain, p.dco.saw ? 0.8 * both : 0);
    set(this.mPulse.gain, p.dco.pulse ? 0.6 * both : 0);
    set(this.mSub.gain, p.dco.sub * 0.8);
    set(this.mNoise.gain, p.dco.noise * 0.9);
    // Filter
    set(this.fEnv.gain, p.vcf.env * p.vcf.pol * 7200);
    set(this.fLfo.gain, p.vcf.lfo ** 2 * 3600);
    set(this.f1.Q, 0.6 + p.vcf.res * 2);
    set(this.f2.Q, 0.5 + p.vcf.res ** 1.5 * 26);
    this.setCutoff(this.midi ?? 60, t, 0.01);
  }

  setCutoff(midi, t, time) {
    const { freq, kybd } = this.inst.p.vcf;
    const hz = clamp(freq * 2 ** (((midi - 60) / 12) * kybd), 20, 20000);
    for (const f of [this.f1, this.f2]) f.frequency.setTargetAtTime(hz, t, time);
  }

  /** Starts a note at time t. legato = a key was still down: glide, and don't restart the envelope. */
  noteOn(midi, t, { legato = false, vel = 1 } = {}) {
    const p = this.inst.p;
    const hz = midiHz(midi + p.dco.range * 12);
    // Portamento glides from wherever this voice was; without it a legato note just jumps.
    const glide = p.assign.porta > 0 && this.midi != null ? tc(p.assign.porta) : 0;
    this.freq.offset.cancelScheduledValues(t);
    if (glide) this.freq.offset.setTargetAtTime(hz, t, glide);
    else this.freq.offset.setValueAtTime(hz, t);
    this.setCutoff(midi, t, glide || 0.002);
    if (p.sweep.amt && !legato) {
      this.sweep.offset.cancelScheduledValues(t);
      this.sweep.offset.setValueAtTime(p.sweep.amt, t);
      this.sweep.offset.setTargetAtTime(0, t, tc(p.sweep.time));
    }
    const { a, d, s } = p.env;
    const env = this.env.offset;
    const amp = this.amp.offset;
    env.cancelScheduledValues(t);
    amp.cancelScheduledValues(t);
    if (!legato) {
      env.setTargetAtTime(vel, t, tc(a));
      env.setTargetAtTime(s * vel, t + a, tc(d));
    } else env.setTargetAtTime(s * vel, t, tc(d));
    if (p.vca.mode === 'gate') amp.setTargetAtTime(vel, t, 0.002);
    else if (!legato) {
      amp.setTargetAtTime(vel, t, tc(a));
      amp.setTargetAtTime(s * vel, t + a, tc(d));
    } else amp.setTargetAtTime(s * vel, t, tc(d));
    this.midi = midi;
  }

  noteOff(t) {
    const p = this.inst.p;
    this.env.offset.cancelScheduledValues(t);
    this.env.offset.setTargetAtTime(0, t, tc(p.env.r));
    this.amp.offset.cancelScheduledValues(t);
    this.amp.offset.setTargetAtTime(0, t, p.vca.mode === 'gate' ? 0.004 : tc(p.env.r));
  }

  dispose(t) {
    for (const o of [this.saw, this.sub, this.freq, this.sweep, this.env, this.amp, this.pwBase]) {
      try {
        o.stop(t);
      } catch {}
    }
  }
}

export class Synth {
  constructor(patch, { live = false } = {}) {
    const c = audio();
    this.c = c;
    this.p = makePatch(patch);
    this.live = live;
    this.voices = [];
    this.held = []; // live, mono/unison: keys down, last on top
    this.keys = new Map(); // live, poly: midi -> voice
    const p = this.p;
    const gain = (v = 0) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };

    // LFO: one triangle for every voice, faded in by `depth` after its delay.
    this.lfo = c.createOscillator();
    this.lfo.type = 'triangle';
    this.lfoOut = gain(1); // the "depth" the delay fades in
    this.lfo.connect(this.lfoOut);
    this.lfoPitch = gain(0);
    this.lfoOut.connect(this.lfoPitch);
    this.lfo.start();
    // One noise source, like the hardware.
    this.noise = c.createBufferSource();
    this.noise.buffer = shared.noise;
    this.noise.loop = true;
    this.noise.loopStart = Math.random();
    this.noise.start();

    // Voices -> HPF -> chorus (stereo) -> level
    this.sum = gain(1);
    this.hpf = c.createBiquadFilter();
    this.out = gain(p.vca.level);
    const merge = c.createChannelMerger(2);
    this.sum.connect(this.hpf);
    this.dry = gain(1);
    this.hpf.connect(this.dry);
    this.dry.connect(merge, 0, 0);
    this.dry.connect(merge, 0, 1);
    // A live synth can switch the chorus on later; a one-shot only builds it if its patch uses it.
    if (live || p.chorus) {
      this.chLfo = c.createOscillator();
      this.chLfo.type = 'triangle';
      this.chWet = gain(0);
      const tone = c.createBiquadFilter(); // the delay lines are not hi-fi
      tone.type = 'lowpass';
      tone.frequency.value = 9000;
      this.hpf.connect(tone).connect(this.chWet);
      [1, -1].forEach((dir, side) => {
        const line = c.createDelay(0.02);
        line.delayTime.value = CHORUS.base;
        const depth = gain(CHORUS.depth * dir);
        this.chLfo.connect(depth).connect(line.delayTime);
        this.chWet.connect(line).connect(merge, 0, side);
      });
      this.chLfo.start();
    }
    merge.connect(this.out);
    this.out.connect(master);

    // Delay: ping-pong, the feedback path loses its top on every repeat.
    if (live || p.delay.mix > 0) {
      this.dIn = gain(0); // the send
      this.dL = c.createDelay(2);
      this.dR = c.createDelay(2);
      this.dFb1 = gain(0);
      this.dFb2 = gain(0);
      const dark = c.createBiquadFilter();
      dark.type = 'lowpass';
      dark.frequency.value = 3600;
      const dMerge = c.createChannelMerger(2);
      this.out.connect(this.dIn).connect(this.dL);
      this.dL.connect(dark).connect(this.dFb1).connect(this.dR);
      this.dR.connect(this.dFb2).connect(this.dL);
      this.dL.connect(dMerge, 0, 0);
      this.dR.connect(dMerge, 0, 1);
      this.dOut = gain(1);
      dMerge.connect(this.dOut).connect(master);
    }
    // Reverb: a send into a shared hall. The echoes go in too.
    if (live || p.reverb.mix > 0) {
      this.rSend = gain(0);
      this.out.connect(this.rSend);
      this.dOut?.connect(this.rSend);
      this.connectHall();
    }
    this.apply(p);
  }

  connectHall() {
    const h = hall(this.p.reverb.size);
    if (this.hallSecs === h.secs) return;
    if (this.hallSecs != null) this.rSend.disconnect();
    this.rSend.connect(h.input);
    this.hallSecs = h.secs;
  }

  /** How many voices this patch plays at once, and each one's tuning in cents. */
  tuning(i) {
    if (this.p.assign.mode === 'unison') return [0, -11, 11, -5, 5, -16][i]; // the stack, spread around the note
    return this.p.assign.mode === 'mono' ? 0 : (Math.random() - 0.5) * 6; // six oscillators never quite agree
  }

  voice(i) {
    while (this.voices.length <= i) this.voices.push(new Voice(this, this.tuning(this.voices.length)));
    return this.voices[i];
  }

  /** Applies a (whole) patch to the running synth; the panel calls this on every change. */
  apply(patch) {
    const old = this.p;
    const p = (this.p = makePatch(patch));
    const t = this.c.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, t, 0.01);
    // A different assign mode re-tunes the voices: start them over.
    if (old.assign.mode !== p.assign.mode && this.voices.length) {
      this.allOff();
      for (const v of this.voices) v.dispose(t + 0.05);
      this.voices = [];
    }
    set(this.lfo.frequency, p.lfo.rate);
    set(this.lfoPitch.gain, p.dco.lfo ** 2 * 1200); // up to an octave of vibrato
    const hp = HPF[clamp(Math.round(p.hpf), 0, 3)];
    this.hpf.type = hp.type;
    this.hpf.frequency.value = hp.freq;
    this.hpf.gain.value = hp.gain;
    this.hpf.Q.value = 0.5;
    if (this.chLfo) {
      const on = p.chorus > 0;
      if (on) this.chLfo.frequency.value = CHORUS.rates[p.chorus];
      set(this.chWet.gain, on ? 0.75 : 0);
      set(this.dry.gain, on ? 0.75 : 1);
    }
    if (this.dIn) {
      set(this.dIn.gain, p.delay.mix);
      const time = clamp(p.delay.time, 0.02, 1.5);
      set(this.dL.delayTime, time);
      set(this.dR.delayTime, time);
      const fb = clamp(p.delay.fb, 0, 0.9);
      set(this.dFb1.gain, fb);
      set(this.dFb2.gain, fb);
    }
    if (this.rSend) {
      set(this.rSend.gain, p.reverb.mix);
      this.connectHall();
    }
    set(this.out.gain, p.vca.level);
    // Several voices at once are louder than one: chords and the unison stack are turned down to match.
    set(this.sum.gain, p.assign.mode === 'poly' ? 0.6 : p.assign.mode === 'unison' ? 0.5 : 1);
    for (const v of this.voices) v.apply();
  }

  /** The LFO fades in after its delay, from the first key of a phrase. */
  startLfo(t) {
    const g = this.lfoOut.gain;
    const d = this.p.lfo.delay;
    g.cancelScheduledValues(t);
    if (d <= 0.01) return g.setValueAtTime(1, t);
    g.setValueAtTime(0, t);
    g.setTargetAtTime(1, t + d * 0.4, d * 0.25);
  }

  /** Voices that sound one note together: all of them in unison, one otherwise. */
  stack() {
    return this.p.assign.mode === 'unison' ? Array.from({ length: this.live ? VOICES : 3 }, (_, i) => this.voice(i)) : [this.voice(0)];
  }

  // ----------------------------------------------------- live keyboard

  keyDown(midi) {
    const t = this.c.currentTime;
    const first = !this.held.length && !this.keys.size;
    if (first) this.startLfo(t);
    if (this.p.assign.mode === 'poly') {
      if (this.keys.has(midi)) return;
      // A new voice while there are fewer than six (so releases ring out), then the
      // one released longest ago, and with all six held, the oldest note is stolen.
      const byAge = (a, b) => a.since - b.since;
      const v = this.voices.length < VOICES ? this.voice(this.voices.length) : this.voices.filter((x) => !x.down).sort(byAge)[0] ?? [...this.voices].sort(byAge)[0];
      for (const [m, held] of this.keys) if (held === v) this.keys.delete(m);
      v.down = true;
      v.since = t;
      this.keys.set(midi, v);
      v.noteOn(midi, t);
      return;
    }
    // Mono and unison: last-note priority, legato while keys overlap.
    if (this.held.includes(midi)) return;
    const legato = this.held.length > 0;
    this.held.push(midi);
    for (const v of this.stack()) v.noteOn(midi, t, { legato });
  }

  keyUp(midi) {
    const t = this.c.currentTime;
    if (this.p.assign.mode === 'poly') {
      const v = this.keys.get(midi);
      if (!v) return;
      this.keys.delete(midi);
      v.down = false;
      v.since = t;
      v.noteOff(t);
      return;
    }
    const i = this.held.indexOf(midi);
    if (i < 0) return;
    this.held.splice(i, 1);
    if (!this.held.length) for (const v of this.stack()) v.noteOff(t);
    else if (i === this.held.length) for (const v of this.stack()) v.noteOn(this.held[this.held.length - 1], t, { legato: true });
  }

  allOff() {
    const t = this.c.currentTime;
    this.held = [];
    this.keys.clear();
    for (const v of this.voices) {
      v.down = false;
      v.noteOff(t);
    }
  }

  // ------------------------------------------------------- sequences

  /**
   * Schedules a sequence: notes are [{ m, t, end, vel }], sorted by start.
   * Poly gives every note a voice, six at most; mono and unison play the line
   * legato where notes overlap.
   */
  schedule(list) {
    if (!list.length) return;
    this.startLfo(list[0].t);
    if (this.p.assign.mode === 'poly') {
      for (const n of list) {
        // A new voice while there are fewer than six, then whichever finished first.
        const v = this.voices.length < VOICES ? this.voice(this.voices.length) : [...this.voices].sort((a, b) => a.busyUntil - b.busyUntil)[0];
        v.noteOn(n.m, n.t, { vel: n.vel });
        v.noteOff(n.end);
        v.busyUntil = n.end;
      }
      return;
    }
    const stack = this.stack();
    let prevEnd = -1;
    list.forEach((n, i) => {
      const next = list[i + 1];
      for (const v of stack) {
        v.noteOn(n.m, n.t, { legato: n.t < prevEnd, vel: n.vel });
        // A note's release is scheduled only if the next one doesn't start first.
        if (!next || next.t >= n.end) v.noteOff(n.end);
      }
      prevEnd = Math.max(prevEnd, n.end);
    });
  }

  /** How long the echoes take to die away, in seconds. */
  tail() {
    const { mix, time, fb } = this.p.delay;
    if (!this.dIn || mix <= 0) return 0;
    return Math.min(6, time * (1 + (fb > 0.01 ? Math.log(0.02) / Math.log(clamp(fb, 0.01, 0.9)) : 0)));
  }

  /** Stops everything at time t and frees the graph. */
  dispose(t = this.c.currentTime) {
    for (const v of this.voices) v.dispose(t);
    for (const o of [this.lfo, this.noise, this.chLfo]) {
      try {
        o?.stop(t);
      } catch {}
    }
    setTimeout(() => {
      this.out.disconnect();
      this.dOut?.disconnect();
      this.rSend?.disconnect();
    }, Math.max(0, t - this.c.currentTime) * 1000 + 100);
  }
}

/**
 * Plays a sequence on a fresh synth: notes are [note, start s, length s, velocity?].
 * Returns the time (s) it will take, release and echoes included.
 */
export function play(patch, notes, { at = 0 } = {}) {
  const s = new Synth(patch);
  const t0 = s.c.currentTime + 0.01 + at;
  const list = notes.map(([n, t, d, vel = 1]) => ({ m: note(n), t: t0 + t, end: t0 + t + d, vel })).sort((a, b) => a.t - b.t);
  s.schedule(list);
  const last = list.reduce((m, n) => Math.max(m, n.end), t0);
  const end = last + s.p.env.r * 1.3 + s.tail() + 0.05;
  s.dispose(end);
  // The hall rings on after the synth is gone; count it in what the caller hears.
  return end - s.c.currentTime + (s.p.reverb.mix > 0 ? s.hallSecs * 0.6 : 0);
}

/** A sound: one or more layers, each its own synth, on the DL-106 or the DL-20 (or a sung word, voice.js) (library.js makes them fresh on every play). */
export function playSound(sound) {
  let longest = 0;
  const layers = sound.make ? sound.make() : sound.layers;
  for (const layer of layers) {
    if (layer.synth === 'voice') {
      // A sung word (voice.js): `word` over the chord in `notes`.
      longest = Math.max(longest, sing(layer.word, layer.notes, { at: layer.at || 0, level: layer.level, child: layer.child, stretch: layer.stretch }));
      continue;
    }
    const run = layer.synth === 'ms20' ? playMs20 : play; // which instrument the layer is written for
    longest = Math.max(longest, run(layer.patch, layer.notes, { at: layer.at || 0 }));
  }
  return longest;
}
