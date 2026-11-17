// The DL-20: a monophonic, two-oscillator, two-filter synth laid out like the
// Korg MS-20 (1978). It sits next to the DL-106 (synth.js): that one plays
// chords and soft things, this one is one voice with teeth.
//
// Which model it follows. Of the open-source MS-20 recreations, the most
// careful one is the AT20V (github.com/palmereta/audio_tools, AGPL-3): both
// Korg35 filters solved implicitly per sample, with the hardware's slopes
// (12 dB/oct low-pass, 6 dB/oct high-pass) and calibrated against the service
// manual and factory settings charts. Its code is AGPL C++, so none of it is
// used here; this is an independent implementation of the same signal path,
// with the filters built from the published Korg35 analyses (ms20-worklet.js):
//
//   VCO 1    triangle, saw, pulse (with a width) or noise; 32' to 4'
//   VCO 2    saw, square, narrow pulse or the ring modulator; 16' to 2',
//            and a pitch knob (semitones against VCO 1)
//   MIXER    a level for each, and noise (on the hardware: patched in)
//   HPF      6 dB/oct high-pass with a peak
//   LPF      12 dB/oct low-pass with a peak; both self-oscillate at full peak
//            and distort when driven
//   EG 1     delay, attack, release: wired to pitch
//   EG 2     hold, attack, decay, sustain, release: opens the amplifier, and
//            moves either filter
//   MG       modulation generator (triangle, saw, square) to pitch or filters
//   Patches  the amounts in `fm`, `hpf` and `lpf` are the patch panel's
//            default wiring plus the cables people reach for first: EG 2 to
//            pitch, keyboard to cutoff
//
// One voice, last note wins, overlapping notes play legato (no new attack) and
// glide with portamento. Reverb is a send into the shared hall.
import { audio, note, makePatch, output, hall } from './synth.js';

export const MS20_DEFAULT = {
  vco1: { wave: 'saw', range: 0, pw: 0.5 },
  vco2: { wave: 'saw', range: 0, pitch: 0 },
  mix: { vco1: 1, vco2: 0, noise: 0 },
  porta: 0,
  mg: { rate: 5, wave: 'tri' },
  fm: { mg: 0, eg1: 0, eg2: 0 }, // semitones
  hpf: { freq: 40, peak: 0, eg2: 0, mg: 0, kbd: 0 }, // eg2, mg, kbd: octaves
  lpf: { freq: 2000, peak: 0, eg2: 0, mg: 0, kbd: 0 },
  eg1: { delay: 0, a: 0.005, r: 0.1 },
  eg2: { hold: 0, a: 0.003, d: 0.1, s: 0.6, r: 0.1 },
  vca: { level: 0.7 },
  reverb: { mix: 0 },
};
export const makeMs20Patch = (over) => makePatch(over, MS20_DEFAULT);

let node = null;
let ready = null;
/** The engine is one worklet for every DL-20 sound; it loads once, on first use. */
export function ms20Engine() {
  const c = audio();
  ready ||= c.audioWorklet.addModule(new URL('./ms20-worklet.js', import.meta.url)).then(() => {
    node = new AudioWorkletNode(c, 'ms20', { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 1] });
    node.connect(output(), 0);
    node.connect(hall(1.2).input, 1);
    return node;
  });
  return ready;
}

/**
 * Plays a line: notes are [note, start s, length s, velocity?].
 * Returns the time (s) it will take, release included.
 */
export function playMs20(patch, notes, { at = 0 } = {}) {
  const c = audio();
  const p = makeMs20Patch(patch);
  const t0 = c.currentTime + 0.01 + at;
  const list = notes.map(([n, t, d, vel = 1]) => ({ m: note(n), t, end: t + d, vel })).sort((a, b) => a.t - b.t);
  const send = (n) => {
    const start = Math.max(t0, c.currentTime + 0.005); // late only the first time, while the engine loads
    n.port.postMessage({ type: 'play', patch: p, notes: list.map((x) => ({ ...x, t: start + x.t, end: start + x.end })) });
  };
  if (node) send(node);
  else ms20Engine().then(send, (err) => console.warn('DL-20', err));
  const last = list.reduce((m, n) => Math.max(m, n.end), 0);
  return at + last + p.eg2.hold + p.eg2.r * 1.3 + 0.06 + (p.reverb.mix > 0 ? 0.7 : 0);
}

/** The DL-20 under the panel's keyboard. */
export class Ms20 {
  constructor(patch) {
    this.held = [];
    this.apply(patch);
  }

  post(msg) {
    if (node) node.port.postMessage(msg);
    else ms20Engine().then((n) => n.port.postMessage(msg), () => {});
  }

  apply(patch) {
    this.post({ type: 'live', patch: makeMs20Patch(patch) });
  }

  keyDown(m) {
    const legato = this.held.length > 0;
    this.held = this.held.filter((x) => x !== m);
    this.held.push(m);
    this.post({ type: 'on', m, legato });
  }

  keyUp(m) {
    const top = this.held[this.held.length - 1] === m;
    this.held = this.held.filter((x) => x !== m);
    if (!top) return;
    if (this.held.length) this.post({ type: 'on', m: this.held[this.held.length - 1], legato: true });
    else this.post({ type: 'off' });
  }

  allOff() {
    this.held = [];
    this.post({ type: 'off' });
  }
}
