// The DL-20's sound engine: runs in the audio thread (an AudioWorklet), one
// sample at a time, because its filters can't be built from Web Audio's own
// nodes. ms20.js explains the instrument; this file is the signal path.
//
// The filters are Korg35 models: a Sallen-Key pair solved without a delay in
// the feedback loop (Zavalishin's topology-preserving transform, in the form
// Will Pirkle published in app note AN-5), with a tanh in the loop standing in
// for the circuit's clipping diodes. Turned up, "peak" sings and then
// self-oscillates, and driving it harder makes it scream rather than get louder.
// Everything runs at twice the sample rate and is averaged down.

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Smooths the step in a saw or pulse so it doesn't alias (polyBLEP). */
function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** The two Korg35 filters. Each call filters one sample; `K` is the peak, 0.01..2.2 (it self-oscillates from 2). */
export class Korg35 {
  constructor(rate) {
    this.rate = rate;
    this.a = this.b = this.c = 0;
  }

  lowpass(x, fc, K) {
    const g = Math.tan((Math.PI * Math.min(fc, this.rate * 0.45)) / this.rate);
    const G = g / (1 + g);
    let v = (x - this.a) * G;
    const y1 = v + this.a;
    this.a = y1 + v;
    const s = ((K - K * G) / (1 + g)) * this.b - this.c / (1 + g);
    const u = Math.tanh((y1 + s) / (1 - K * G + K * G * G));
    v = (u - this.b) * G;
    const lp = v + this.b;
    this.b = lp + v;
    const y = K * lp;
    v = (y - this.c) * G; // the high-pass in the feedback path only keeps its state
    this.c = v + v + this.c;
    return lp;
  }

  highpass(x, fc, K) {
    const g = Math.tan((Math.PI * Math.min(fc, this.rate * 0.45)) / this.rate);
    const G = g / (1 + g);
    let v = (x - this.a) * G;
    const y1 = x - (v + this.a);
    this.a = v + v + this.a;
    const s = (-G / (1 + g)) * this.b + this.c / (1 + g);
    const u = (y1 + s) / (1 - K * G + K * G * G);
    const y = Math.tanh(K * u);
    v = (y - this.b) * G;
    const hp = y - (v + this.b);
    this.b = v + v + this.b;
    v = (hp - this.c) * G;
    this.c = v + v + this.c;
    return y / K;
  }
}

/** One monophonic DL-20: two VCOs, the two filters, two envelopes, the modulation generator. */
export class Voice {
  constructor(rate, patch) {
    this.rate = rate * 2;
    this.hp = new Korg35(this.rate);
    this.lp = new Korg35(this.rate);
    this.ph1 = 0;
    this.ph2 = 0.37;
    this.mg = 0;
    this.pitch = null; // current pitch (midi, glides)
    this.target = 60;
    this.vel = 1;
    this.gate = false;
    this.t = 0; // samples since the last trigger
    this.offAt = Infinity; // when the hold runs out after the key is let go
    this.e1 = 0;
    this.e2 = 0;
    this.e2Stage = 0; // 0 idle, 1 attack, 2 decay / sustain, 3 release
    this.seed = 22222;
    this.set(patch);
  }

  set(p) {
    this.p = p;
    const r = this.rate;
    const k = (s) => 1 - Math.exp(-1 / (Math.max(0.0005, s / 4) * r)); // per-sample step for "about s seconds"
    this.glide = p.porta > 0 ? k(p.porta) : 1;
    this.a1 = 1 / (Math.max(0.0005, p.eg1.a) * r);
    this.r1 = k(p.eg1.r);
    this.a2 = 1 / (Math.max(0.0005, p.eg2.a) * r);
    this.d2 = k(p.eg2.d);
    this.r2 = k(p.eg2.r);
  }

  on(m, vel = 1, legato = false) {
    this.target = m;
    if (this.pitch == null) this.pitch = m;
    this.vel = vel;
    this.gate = true;
    this.offAt = Infinity;
    if (!legato || this.e2Stage === 0 || this.e2Stage === 3) {
      this.t = 0;
      this.e2Stage = 1;
    }
  }

  off() {
    this.gate = false;
    this.offAt = this.t + this.p.eg2.hold * this.rate;
  }

  get done() {
    return !this.gate && this.e2Stage === 0;
  }

  noise() {
    this.seed = (this.seed * 1664525 + 1013904223) | 0;
    return this.seed / 2147483648;
  }

  /** One sample at twice the sample rate. */
  step() {
    const p = this.p;
    const r = this.rate;
    this.t++;

    // Envelopes. EG1: delay, attack, release. EG2: hold, attack, decay, sustain, release.
    if (this.gate) this.e1 += this.t > p.eg1.delay * r ? Math.min(this.a1, 1 - this.e1) : 0;
    else this.e1 -= this.e1 * this.r1;
    if (this.e2Stage === 1) {
      this.e2 += this.a2;
      if (this.e2 >= 1) {
        this.e2 = 1;
        this.e2Stage = 2;
      }
    } else if (this.e2Stage === 2) {
      this.e2 += (p.eg2.s - this.e2) * this.d2;
    }
    if (!this.gate && this.e2Stage && this.e2Stage !== 3 && this.t >= this.offAt) this.e2Stage = 3;
    if (this.e2Stage === 3) {
      this.e2 -= this.e2 * this.r2;
      if (this.e2 < 0.0002) {
        this.e2 = 0;
        this.e2Stage = 0;
      }
    }

    // Modulation generator: triangle, falling saw or square, -1..1.
    this.mg += p.mg.rate / r;
    if (this.mg >= 1) this.mg -= 1;
    const mg = p.mg.wave === 'saw' ? 1 - 2 * this.mg : p.mg.wave === 'square' ? (this.mg < 0.5 ? 1 : -1) : 1 - 4 * Math.abs(this.mg - 0.5);

    // Pitch.
    this.pitch += (this.target - this.pitch) * this.glide;
    const fm = p.fm.mg * mg + p.fm.eg1 * this.e1 + p.fm.eg2 * this.e2;
    const d1 = Math.min(0.45, hz(this.pitch + 12 * p.vco1.range + fm) / r);
    const d2 = Math.min(0.45, hz(this.pitch + 12 * p.vco2.range + p.vco2.pitch + fm) / r);
    this.ph1 += d1;
    if (this.ph1 >= 1) this.ph1 -= 1;
    this.ph2 += d2;
    if (this.ph2 >= 1) this.ph2 -= 1;

    // VCO 1: triangle, saw, pulse (with a width) or noise.
    const sq1 = this.ph1 < 0.5 ? 1 : -1;
    let o1;
    if (p.vco1.wave === 'tri') o1 = 1 - 4 * Math.abs(this.ph1 - 0.5);
    else if (p.vco1.wave === 'noise') o1 = this.noise();
    else if (p.vco1.wave === 'pulse') {
      const w = Math.min(0.95, Math.max(0.05, p.vco1.pw));
      let t2 = this.ph1 + 1 - w;
      if (t2 >= 1) t2 -= 1;
      o1 = (this.ph1 < w ? 1 : -1) + blep(this.ph1, d1) - blep(t2, d1);
    } else o1 = 2 * this.ph1 - 1 - blep(this.ph1, d1);

    // VCO 2: saw, square, narrow pulse, or the ring modulator (VCO 1 against VCO 2).
    let o2;
    if (p.vco2.wave === 'saw') o2 = 2 * this.ph2 - 1 - blep(this.ph2, d2);
    else if (p.vco2.wave === 'ring') o2 = sq1 * (this.ph2 < 0.5 ? 1 : -1);
    else {
      const w = p.vco2.wave === 'pulse' ? 0.15 : 0.5;
      let t2 = this.ph2 + 1 - w;
      if (t2 >= 1) t2 -= 1;
      o2 = (this.ph2 < w ? 1 : -1) + blep(this.ph2, d2) - blep(t2, d2);
    }

    let x = 0.5 * (p.mix.vco1 * o1 + p.mix.vco2 * o2 + p.mix.noise * this.noise());

    // High-pass into low-pass, each moved by EG2, the MG and the keyboard (in octaves).
    const key = (this.pitch - 60) / 12;
    const fh = p.hpf.freq * 2 ** (p.hpf.eg2 * this.e2 + p.hpf.mg * mg + p.hpf.kbd * key);
    const fl = p.lpf.freq * 2 ** (p.lpf.eg2 * this.e2 + p.lpf.mg * mg + p.lpf.kbd * key);
    x = this.hp.highpass(x, Math.max(8, fh), 0.01 + 2.15 * p.hpf.peak);
    x = this.lp.lowpass(x, Math.max(20, fl), 0.01 + 2.15 * p.lpf.peak);

    return x * this.e2 * this.vel * p.vca.level;
  }

  /** One output sample. */
  tick() {
    return 0.5 * (this.step() + this.step());
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor(
    'ms20',
    class extends AudioWorkletProcessor {
      constructor() {
        super();
        this.voices = []; // { v, events: [[frame, 'on'|'off', midi, vel, legato]], send }
        this.live = null;
        this.port.onmessage = ({ data }) => {
          if (data.type === 'play') {
            const events = [];
            let prevEnd = -1;
            data.notes.forEach((n, i) => {
              const next = data.notes[i + 1];
              events.push([Math.round(n.t * sampleRate), 'on', n.m, n.vel, n.t < prevEnd]);
              // Released only if the next note doesn't start first: overlapping notes play legato.
              if (!next || next.t >= n.end) events.push([Math.round(n.end * sampleRate), 'off']);
              prevEnd = Math.max(prevEnd, n.end);
            });
            this.voices.push({ v: new Voice(sampleRate, data.patch), events, send: data.patch.reverb.mix });
            if (this.voices.length > 16) this.voices.shift();
          } else if (data.type === 'live') {
            if (!this.live) this.live = { v: new Voice(sampleRate, data.patch), events: [], send: 0, keep: true };
            this.live.v.set(data.patch);
            this.live.send = data.patch.reverb.mix;
          } else if (data.type === 'on') this.live?.v.on(data.m, 1, data.legato);
          else if (data.type === 'off') this.live?.v.off();
        };
      }

      process(_, outputs) {
        const [l, r] = outputs[0];
        const wet = outputs[1][0];
        const all = this.live ? [...this.voices, this.live] : this.voices;
        for (const s of all) {
          for (let i = 0; i < l.length; i++) {
            const f = currentFrame + i;
            while (s.events.length && s.events[0][0] <= f) {
              const [, kind, m, vel, legato] = s.events.shift();
              if (kind === 'on') s.v.on(m, vel, legato);
              else s.v.off();
            }
            if (s.v.pitch == null || s.v.done) continue;
            const y = s.v.tick();
            l[i] += y;
            if (r) r[i] += y;
            wet[i] += y * s.send;
          }
        }
        this.voices = this.voices.filter((s) => s.events.length || !s.v.done);
        return true;
      }
    },
  );
}
