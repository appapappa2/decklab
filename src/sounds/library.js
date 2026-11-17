// The sound bank: every sound is made on the synth (synth.js), nothing is a
// recording. A sound is one or more layers; each layer is a patch (only what
// differs from DEFAULT_PATCH) and a sequence of [note, start s, length s, velocity?].
// `make` runs on every play, so sounds with randomness never repeat exactly.
//
// Two instruments. "Win" and "Lose" are the big ones, on the DL-106: a brass
// lead sliding from note to note onto a pad in a long hall. Everything else is
// short and plucked, and uses whichever instrument suits it:
//   DL-106 (synth.js)  anything with two notes at once, and the soft, tonal
//                      ones: plain, hollow, muted, round and glass plucks
//   DL-20  (ms20.js)   one voice with character: zaps and chirps (pitch moving
//                      inside the note), rubbery blips, ring-modulator metal,
//                      drums, buzzes, and noise with a pitch for paper, air and water
// A layer made with L() plays on the DL-106, one made with M() on the DL-20.
// Everything sits in A minor / C major, so sounds that overlap agree.
//
// Groups: the effects on the VFX/Animations tab (same names as its buttons), the
// cards on the table, and the app's UI.
import { note, DEFAULT_PATCH } from './synth.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (a, b) => a + Math.random() * (b - a);
// How bright the whole bank is: every layer's filter frequency is multiplied by
// this as the layer is made, so the patches below keep their relative settings.
// 1 is as written; 0.8 closes every filter by 20%.
const TONE = 0.8;
const L = (patch, notes, at = 0) => ({ patch: { ...patch, vcf: { ...patch.vcf, freq: (patch.vcf?.freq ?? DEFAULT_PATCH.vcf.freq) * TONE } }, notes, at });
/** A patch with some settings changed: sections merge, so `{ dco: { sub: 1 } }` keeps the rest of the DCO. */
const P = (base, over = {}) => {
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = base[k] && typeof base[k] === 'object' ? { ...base[k], ...over[k] } : over[k];
  return out;
};
const lvl = (patch, level) => P(patch, { vca: { level } });

// Reusable patches
/** The lead from "Lose": saw over a sub, chorus I, sliding between notes, late vibrato, an echo and a hall. */
const LEAD = {
  dco: { saw: true, sub: 0.35, lfo: 0.22 },
  lfo: { rate: 5, delay: 0.5 },
  vcf: { freq: 450, res: 0.35, env: 0.55, kybd: 0.5 },
  env: { a: 0.03, d: 0.3, s: 0.7, r: 0.5 },
  chorus: 1,
  assign: { mode: 'mono', porta: 0.12 },
  delay: { mix: 0.2, time: 0.34, fb: 0.35 },
  reverb: { mix: 0.22, size: 2.2 },
};
/** The run on top of "Win": the lead, quick and bright, with a long echo. Only Win is this loud. */
const FLOURISH = P(LEAD, {
  dco: { lfo: 0 },
  vcf: { freq: 1800, env: 0.6 },
  env: { a: 0.006, d: 0.16, s: 0.45, r: 0.16 },
  assign: { porta: 0.05 },
  delay: { mix: 0.3, time: 0.17, fb: 0.45 },
});
/** The pad that opens under a phrase: slow pulse-width chords, wide and far away. */
const PAD = {
  dco: { saw: true, pulse: true, pwm: 0.6, pwmMode: 'lfo', sub: 0.2 },
  lfo: { rate: 0.7 },
  vcf: { freq: 500, res: 0.15, env: 0.35, kybd: 0.4 },
  env: { a: 0.5, d: 0.6, s: 0.7, r: 1.4 },
  chorus: 1,
  reverb: { mix: 0.4, size: 3.6 },
};
const PENTA = ['A3', 'C4', 'D4', 'E4', 'G4', 'A4'];
// Chords the phrases land on.
const A_MINOR = ['A3', 'C4', 'E4'];
const C_MAJOR = ['C4', 'E4', 'G4', 'D5'];
const chord = (notes, at, len) => notes.map((n) => [n, at, len]);
/** A line for the lead: [note, length] pairs played end to end, each overlapping the next a little so it slides. */
const line = (steps, at = 0) => {
  let t = at;
  return steps.map(([n, len, vel = 1]) => {
    const out = [n, t, len + 0.03, vel];
    t += len;
    return out;
  });
};

// ---------------------------------------------------------------- DL-106
/**
 * The plucks on the DL-106, for anything with more than one note at a time or
 * that should sit back: no sustain, no slide, no echo, a very small room.
 */
const PLUCK = {
  dco: { saw: true, sub: 0.2 },
  vcf: { freq: 750, res: 0.15, env: 0.5, kybd: 0.5 },
  env: { a: 0.004, d: 0.07, s: 0, r: 0.05 },
  chorus: 0,
  assign: { mode: 'poly', porta: 0 },
  reverb: { mix: 0.06, size: 0.6 },
};
/** Hollow: a square wave instead of the saw. */
const HOLLOW = P(PLUCK, { dco: { saw: false, pulse: true, pwm: 0, sub: 0 }, vcf: { freq: 850 } });
/** Muted: darker and half as long, like a damped string. */
const MUTED = P(PLUCK, { vcf: { freq: 550, env: 0.35 }, env: { d: 0.035, r: 0.03 } });
/** Round: mostly sub, for the low ones. */
const ROUND = P(PLUCK, { dco: { sub: 0.8 }, vcf: { freq: 450, env: 0.4 }, env: { d: 0.09, r: 0.06 } });
/** Glass: saw and pulse through the chorus, a little longer and wetter. For the moments that are good news. */
const GLASS = P(PLUCK, { dco: { saw: true, pulse: true, pwm: 0.3, sub: 0 }, vcf: { freq: 1100, res: 0.25, env: 0.6 }, env: { d: 0.11, r: 0.09 }, chorus: 1, reverb: { mix: 0.14, size: 1.2 } });
/** Plucked notes one after another, `gap` seconds apart. */
const seq = (notes, gap, len = 0.03) => notes.map((n, i) => [n, i * gap, len]);

// ----------------------------------------------------------------- DL-20
// One voice, so one note at a time, but each of these has a character the
// DL-106 can't do: pitch that moves inside the note, a filter that rings,
// metal from the ring modulator, noise with a pitch.
/** A layer on the DL-20 (ms20.js). */
const M = (patch, notes, at = 0) => ({ synth: 'ms20', patch, notes, at });
const mlvl = (patch, level) => P(patch, { vca: { level } });
const SHORT = { eg2: { a: 0.002, d: 0.06, s: 0, r: 0.04 }, reverb: { mix: 0.05 } };
/** Zap: a triangle that starts high and drops onto the note. */
const ZAP = P(SHORT, { vco1: { wave: 'tri' }, fm: { eg2: 14 }, lpf: { freq: 2200 }, eg2: { a: 0.001, d: 0.045, s: 0, r: 0.03 } });
/** Chirp: the other way, rising into the note. A lift, a drop of water, a question. */
const CHIRP = P(SHORT, { vco1: { wave: 'tri' }, fm: { eg2: -10 }, lpf: { freq: 1800 }, eg2: { a: 0.004, d: 0.05, s: 0, r: 0.03 } });
/** Blip: a square wave, the low-pass snapping shut with its peak up. Rubbery. */
const BLIP = P(SHORT, { vco1: { wave: 'pulse' }, lpf: { freq: 420, peak: 0.55, eg2: 2.6, kbd: 0.5 }, eg2: { a: 0.002, d: 0.055, s: 0, r: 0.04 } });
/** Clink: the ring modulator, high-passed. Metal: coins, sparks. */
const CLINK = P(SHORT, { vco2: { wave: 'ring', pitch: 19 }, mix: { vco1: 0, vco2: 1 }, hpf: { freq: 500 }, lpf: { freq: 3200 }, eg2: { a: 0.001, d: 0.04, s: 0, r: 0.03 } });
/** Thud: a low triangle falling most of an octave. The drum. */
const THUD = P(SHORT, { vco1: { wave: 'tri', range: -1 }, fm: { eg2: 10 }, lpf: { freq: 500 }, eg2: { a: 0.002, d: 0.09, s: 0, r: 0.05 } });
/** Squelch: saw over a square an octave down, the low-pass opening wide and closing. Wet and low. */
const SQUELCH = P(SHORT, { vco2: { wave: 'square', range: -1 }, mix: { vco1: 0.7, vco2: 0.7 }, lpf: { freq: 200, peak: 0.7, eg2: 3.2 }, eg2: { a: 0.002, d: 0.08, s: 0, r: 0.05 } });
/** Buzz: a thin pulse against a saw just out of tune. For "no". */
const BUZZ = P(SHORT, { vco1: { wave: 'pulse', pw: 0.12 }, vco2: { pitch: 0.15 }, mix: { vco1: 0.7, vco2: 0.5 }, lpf: { freq: 600, peak: 0.2 }, eg2: { a: 0.003, d: 0.07, s: 0, r: 0.04 } });
/** Air: noise through the high-pass with its peak up, following the keyboard, so the note sets how bright the paper is. */
const AIR = P(SHORT, { vco1: { wave: 'noise' }, hpf: { freq: 1100, peak: 0.45, kbd: 1 }, lpf: { freq: 5000 }, eg2: { a: 0.003, d: 0.03, s: 0, r: 0.02 } });
/** Water: noise through the ringing low-pass as it closes. */
const WATER = P(SHORT, { vco1: { wave: 'noise' }, lpf: { freq: 300, peak: 0.8, eg2: 2.5 }, eg2: { a: 0.003, d: 0.09, s: 0, r: 0.06 } });

export const GROUPS = [
  { id: 'effects', name: 'Effects', note: 'One for each effect on the VFX/Animations tab' },
  { id: 'cards', name: 'Cards', note: 'On the table' },
  { id: 'moments', name: 'Game moments', note: 'Reactions in one game or another' },
  { id: 'ui', name: 'UI', note: 'Taps, swipes, sheets and toggles' },
];

let comboStep = -1;

// Sounds that come many times in a row (browsing the games, dealing, tapping,
// playing cards) take turns through five variants and then start over, so a run
// of them never sounds like one sample on repeat. Same sound, a different note.
const turns = new Map();
const turn = (id, list) => {
  const i = ((turns.get(id) ?? -1) + 1) % list.length;
  turns.set(id, i);
  return list[i];
};

/** "Go!": the count's blip an octave up, glass on top. */
const goLayers = (at) => [M(mlvl(BLIP, 0.3), [['A4', 0, 0.04]], at), L(lvl(GLASS, 0.3), [['A4', 0, 0.05], ['E4', 0, 0.05]], at)];

const EFFECTS = [
  {
    id: 'sparks', group: 'effects', name: 'Sparks', hint: 'Two metal ticks, the second higher',
    make: () => [M(mlvl(CLINK, 0.28), seq(['E4', 'A4'], 0.045, 0.02))],
  },
  {
    id: 'big-burst', group: 'effects', name: 'Big burst', hint: 'A drum, a puff of air and a low pluck',
    make: () => [M(mlvl(THUD, 0.5), [['A2', 0, 0.06]]), M(mlvl(AIR, 0.4), [['C4', 0, 0.04]]), L(lvl(ROUND, 0.3), [['A3', 0, 0.04]])],
  },
  {
    id: 'shake', group: 'effects', name: 'Shake', hint: 'Two low squelches',
    make: () => [M(mlvl(SQUELCH, 0.32), seq(['A1', 'A1'], 0.09, 0.04))],
  },
  {
    id: 'score', group: 'effects', name: 'Score +3', hint: 'Two glass plucks, up a fifth (five variants, in turn)',
    make: () => [L(lvl(GLASS, 0.34), seq(turn('score', [['A3', 'E4'], ['C4', 'G4'], ['D4', 'A4'], ['E4', 'B4'], ['G4', 'D5']]), 0.06))],
  },
  {
    id: 'turn', group: 'effects', name: 'Your turn', hint: 'Two hollow plucks, up a fourth',
    make: () => [L(lvl(HOLLOW, 0.34), seq(['E4', 'A4'], 0.09))],
  },
  {
    id: 'confetti', group: 'effects', name: 'Confetti', hint: 'Four rubbery blips around the scale',
    make: () => [M(mlvl(BLIP, 0.28), seq(Array.from({ length: 4 }, () => pick(PENTA)), 0.055, 0.025))],
  },
  {
    id: 'curtain', group: 'effects', name: 'Card curtain', hint: 'Paper falling: four ticks of air, each darker, over hollow plucks',
    make: () => [M(mlvl(AIR, 0.4), seq(['C5', 'G4', 'D4', 'A3'], 0.07, 0.02)), L(lvl(HOLLOW, 0.24), seq(['A4', 'G4', 'E4', 'D4'], 0.07))],
  },
  {
    id: 'countdown', group: 'effects', name: 'Countdown', hint: '3, 2, 1, Go! (800 ms apart)',
    make: () => [M(mlvl(BLIP, 0.3), [['A3', 0, 0.04], ['A3', 0.8, 0.04], ['A3', 1.6, 0.04]]), ...goLayers(2.4)],
  },
  {
    id: 'count', group: 'effects', name: 'Count', hint: 'One blip of a 3, 2, 1 (Speed, Stress)',
    make: () => [M(mlvl(BLIP, 0.3), [['A3', 0, 0.04]])],
  },
  {
    id: 'go', group: 'effects', name: 'Go!', hint: "The count's blip an octave up, glass on top",
    make: () => goLayers(0),
  },
  {
    id: 'win', group: 'effects', name: 'Win', hint: 'Lose turned around: the lead climbs and lands on a major chord',
    make: () => [
      L(P(LEAD, { vcf: { freq: 650 } }), [['E4', 0, 0.3], ['G4', 0.28, 0.3], ['C5', 0.56, 0.3], ['E5', 0.84, 1]]),
      L(lvl(P(PAD, { vcf: { freq: 800 } }), 0.42), chord(C_MAJOR, 0.78, 1.1)),
      L(lvl(FLOURISH, 0.35), line([['G5', 0.08], ['C6', 0.08], ['E6', 0.08], ['G6', 0.3]], 1.0)),
    ],
  },
  {
    id: 'lose', group: 'effects', name: 'Lose', hint: 'A lead sliding down into a minor chord',
    make: () => [
      L(LEAD, [['A4', 0, 0.36], ['G4', 0.34, 0.36], ['F4', 0.68, 0.36], ['E4', 1.02, 0.9]]),
      L(lvl(PAD, 0.4), chord(A_MINOR, 0.95, 1)),
    ],
  },
  {
    id: 'fireworks', group: 'effects', name: 'Fireworks', hint: 'Three chirps going up, each popping into air',
    make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -14 } }), 0.5), seq(['A3', 'C4', 'E4'], 0.16)), M(mlvl(AIR, 0.35), seq(['E4', 'G4', 'B4'], 0.16, 0.03).map(([n, t, l]) => [n, t + 0.06, l]))],
  },
  {
    id: 'coins', group: 'effects', name: 'Coins', hint: 'Three clinks of metal, the last one higher',
    make: () => [M(mlvl(CLINK, 0.28), seq(['A4', 'A4', 'D5'], 0.07, 0.02))],
  },
  {
    id: 'suits', group: 'effects', name: 'Suit rain', hint: 'Four muted drops down the scale',
    make: () => [L(lvl(MUTED, 0.36), seq(['A4', 'G4', 'E4', 'D4'], 0.08))],
  },
  {
    id: 'flash', group: 'effects', name: 'Flash', hint: 'One high zap',
    make: () => [M(mlvl(ZAP, 0.5), [['A4', 0, 0.02]])],
  },
  {
    id: 'combo', group: 'effects', name: 'Combo', hint: 'A blip with the fifth plucked under it, a step higher each time',
    make: () => {
      comboStep = (comboStep + 1) % 6;
      const root = 57 + [0, 3, 5, 7, 10, 12][comboStep];
      return [M(mlvl(BLIP, 0.28), [[root, 0, 0.03]]), L(lvl(PLUCK, 0.26), [[root - 5, 0, 0.03]])];
    },
  },
  {
    id: 'rank-up', group: 'effects', name: 'Rank up', hint: 'Four glass plucks up the chord, a clink on the last',
    make: () => [L(lvl(GLASS, 0.34), seq(['A3', 'C4', 'E4', 'A4'], 0.055)), M(mlvl(CLINK, 0.3), [['A4', 0.165, 0.02]])],
  },
];

const CARDS = [
  {
    id: 'deal', group: 'cards', name: 'Deal', hint: 'A tick of paper and a muted pluck (five variants, in turn)',
    make: () => {
      const [air, note] = turn('deal', [['A4', 'A4'], ['C5', 'G4'], ['G4', 'C5'], ['B4', 'E4'], ['D5', 'D5']]);
      return [M(mlvl(AIR, 0.4), [[air, 0, 0.02]]), L(lvl(MUTED, 0.28), [[note, 0, 0.02]])];
    },
  },
  {
    id: 'deal-hand', group: 'cards', name: 'Deal a hand', hint: 'Seven cards in a row, stepping down the scale',
    make: () => [M(mlvl(AIR, 0.4), seq(['C5', 'B4', 'C5', 'A4', 'B4', 'C5', 'A4'], 0.09, 0.02)), L(lvl(MUTED, 0.28), seq(['E4', 'D4', 'C4', 'A3', 'G3', 'E3', 'A3'], 0.09, 0.02))],
  },
  {
    id: 'flip', group: 'cards', name: 'Flip', hint: 'Paper turning: two ticks of air, bright then dark (five variants, in turn)',
    make: () => [M(mlvl(AIR, 0.45), seq(turn('flip', [['E4', 'A3'], ['G4', 'C4'], ['D4', 'G3'], ['A4', 'D4'], ['C4', 'F3']]), 0.035, 0.02))],
  },
  {
    id: 'pickup', group: 'cards', name: 'Pick up', hint: 'A small chirp upward: the card lifts (five variants, in turn)',
    make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -5 } }), 0.4), [[turn('pickup', ['G4', 'A4', 'E4', 'C5', 'D4']), 0, 0.03]])],
  },
  {
    id: 'play', group: 'cards', name: 'Play', hint: 'A pluck landing on a soft drum (five variants, in turn)',
    make: () => {
      const [note, drum] = turn('play', [['A4', 'A2'], ['G4', 'A2'], ['C5', 'C3'], ['E4', 'G2'], ['D4', 'A2']]);
      return [L(lvl(PLUCK, 0.3), [[note, 0, 0.03]]), M(mlvl(THUD, 0.5), [[drum, 0, 0.05]])];
    },
  },
  {
    id: 'peek', group: 'cards', name: 'Peek', hint: 'One very soft note per card (five variants, in turn)',
    make: () => [L(lvl(MUTED, 0.24), [[turn('peek', ['A3', 'C4', 'E4', 'D4', 'G3']), 0, 0.015]])],
  },
  {
    id: 'shuffle', group: 'cards', name: 'Shuffle', hint: 'A riffle: ten ticks of paper, no two the same',
    make: () => [M(mlvl(P(AIR, { eg2: { d: 0.018, r: 0.012 } }), 0.4), Array.from({ length: 10 }, (_, i) => [60 + Math.floor(rand(0, 14)), i * 0.024 + rand(0, 0.006), 0.012, rand(0.5, 1)]))],
  },
  {
    id: 'collect', group: 'cards', name: 'Collect', hint: 'Three muted plucks stepping down, paper under them',
    make: () => [L(lvl(MUTED, 0.34), seq(['E4', 'C4', 'A3'], 0.05, 0.02)), M(mlvl(AIR, 0.3), seq(['C5', 'A4', 'F4'], 0.05, 0.02))],
  },
  {
    id: 'invalid', group: 'cards', name: "Can't play", hint: 'One dull buzz',
    make: () => [M(mlvl(BUZZ, 0.4), [['E3', 0, 0.05]])],
  },
];

let foundationStep = -1;
/** Step n of a climb up the A minor pentatonic scale from A2: 13 steps cover a suit, Ace to King. */
const climb = (n) => 45 + 12 * Math.floor(n / 5) + [0, 3, 5, 7, 10][n % 5];

/**
 * Per-game reactions. `make(step)` on Score tick and Foundation takes a step,
 * so a counter or a foundation can climb: sfx('foundation', 4).
 */
const MOMENTS = [
  {
    id: 'settle', group: 'moments', name: 'Settle', hint: 'The last card of a deal lands; a build stacks: one round low pluck',
    make: () => [L(lvl(ROUND, 0.3), [['E3', 0, 0.03]])],
  },
  {
    id: 'play-them', group: 'moments', name: 'Opponent plays', hint: 'Play, quieter and without the drum (five variants, in turn)',
    make: () => [L(lvl(MUTED, 0.28), [[turn('play-them', ['A4', 'G4', 'C5', 'E4', 'D4']), 0, 0.02]])],
  },
  {
    id: 'slide', group: 'moments', name: 'Slide', hint: 'A card pushed onto your own pile, a swap: a dark breath of paper (five variants, in turn)',
    make: () => [M(mlvl(P(AIR, { eg2: { a: 0.01, d: 0.05, r: 0.03 } }), 0.4), [[turn('slide', ['E4', 'G4', 'D4', 'A4', 'C4']), 0, 0.03]])],
  },
  {
    id: 'flick', group: 'moments', name: 'Flick', hint: 'Bright air and a tiny zap: faster than a slide (five variants, in turn)',
    make: () => {
      const [air, zap] = turn('flick', [['A4', 'E4'], ['C5', 'G4'], ['G4', 'D4'], ['B4', 'A4'], ['E4', 'C4']]);
      return [M(mlvl(AIR, 0.4), [[air, 0, 0.02]]), M(mlvl(ZAP, 0.3), [[zap, 0, 0.015]])];
    },
  },
  {
    id: 'take-pile', group: 'moments', name: 'Take the pile', hint: 'Three round plucks down onto a drum: you are the one picking up',
    make: () => [L(lvl(ROUND, 0.34), seq(['E4', 'C4', 'A3'], 0.05, 0.02)), M(mlvl(THUD, 0.55), [['A2', 0.1, 0.06]])],
  },
  {
    id: 'tick', group: 'moments', name: 'Score tick', hint: 'One tick of a rolling score; give it a step and it climbs',
    make: (step = 0) => [L(lvl(MUTED, 0.26), [[57 + (step % 12), 0, 0.012]])],
  },
  {
    id: 'foundation', group: 'moments', name: 'Foundation', hint: 'A glass pluck, a step higher for each card on the foundation',
    make: (step) => {
      foundationStep = step ?? (foundationStep + 1) % 13;
      return [L(lvl(GLASS, 0.3), [[climb(foundationStep % 13), 0, 0.03]])];
    },
  },
  {
    id: 'meld', group: 'moments', name: 'Meld', hint: 'A set, a run or a book snaps together: three glass notes strummed',
    make: () => [L(lvl(GLASS, 0.28), [['A3', 0, 0.03], ['C#4', 0.014, 0.03], ['E4', 0.028, 0.03]])],
  },
  {
    id: 'knock', group: 'moments', name: 'Knock', hint: 'Two knocks on wood (Gin; a play-again request)',
    make: () => [M(mlvl(P(THUD, { vco1: { range: 0 }, fm: { eg2: 5 }, lpf: { freq: 700, peak: 0.5 }, eg2: { d: 0.035, r: 0.03 } }), 0.4), seq(['E3', 'E3'], 0.11, 0.03))],
  },
  {
    id: 'tie', group: 'moments', name: 'Tie', hint: 'Neutral: the same hollow note twice (a tie, the deck ran out, the lake is empty)',
    make: () => [L(lvl(HOLLOW, 0.3), seq(['C5', 'C5'], 0.12))],
  },
  {
    id: 'alert', group: 'moments', name: 'Alert', hint: 'Two quick high blips: last card, a jack is up',
    make: () => [M(mlvl(BLIP, 0.3), seq(['E4', 'E4'], 0.08))],
  },
  {
    id: 'pulse', group: 'moments', name: 'Low pulse', hint: 'Two soft low drums, like a heart: someone is down to a few cards',
    make: () => [M(mlvl(P(THUD, { fm: { eg2: 4 } }), 0.5), [['E2', 0, 0.04], ['E2', 0.18, 0.04, 0.7]])],
  },
  {
    id: 'slap', group: 'moments', name: 'Slap', hint: 'A hand on the pile: a drum and a smack of air',
    make: () => [M(mlvl(THUD, 0.45), [['E3', 0, 0.05]]), M(mlvl(AIR, 0.4), [['G4', 0, 0.02]])],
  },
  {
    id: 'war', group: 'moments', name: 'War!', hint: 'Two drums, the second lower, a squelch under them',
    make: () => [M(mlvl(THUD, 0.7), [['A2', 0, 0.06], ['E2', 0.09, 0.08]]), M(mlvl(SQUELCH, 0.4), [['A1', 0, 0.05]])],
  },
  {
    id: 'sweep', group: 'moments', name: 'Sweep', hint: 'Air across the table, getting brighter, then two glass plucks up (Casino)',
    make: () => [M(mlvl(P(AIR, { hpf: { eg2: -2 }, eg2: { a: 0.02, d: 0.09, r: 0.04 } }), 0.4), [['C5', 0, 0.05]]), L(lvl(GLASS, 0.3), seq(['E4', 'A4'], 0.05), 0.06)],
  },
  {
    id: 'burn', group: 'moments', name: 'Burn', hint: 'The pile goes: water-dark noise closing over two low squelches (Palace)',
    make: () => [M(mlvl(P(WATER, { lpf: { freq: 500, peak: 0.5, eg2: 3 }, eg2: { d: 0.14, r: 0.08 } }), 0.35), [['C4', 0, 0.08]]), M(mlvl(SQUELCH, 0.4), seq(['A2', 'E2'], 0.07))],
  },
  {
    id: 'reset', group: 'moments', name: 'Reset', hint: 'A 2 resets the pile: one zap falling two octaves (Palace)',
    make: () => [M(mlvl(P(ZAP, { fm: { eg2: 24 }, eg2: { d: 0.06 } }), 0.45), [['A3', 0, 0.03]])],
  },
  {
    id: 'ask', group: 'moments', name: 'Ask', hint: 'A question: two chirps, the second higher, left hanging (Go Fish)',
    make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -4 } }), 0.4), seq(['E4', 'G4'], 0.08))],
  },
  {
    id: 'splash', group: 'moments', name: 'Go fish!', hint: 'A splash: water, a low plop and two drops',
    make: () => [M(mlvl(WATER, 0.4), [['C4', 0, 0.05]]), M(mlvl(SQUELCH, 0.4), [['A2', 0, 0.04]]), M(mlvl(P(CHIRP, { fm: { eg2: -7 }, eg2: { d: 0.03, r: 0.02 } }), 0.3), [['E4', 0.1, 0.015], ['A4', 0.16, 0.015]])],
  },
  {
    id: 'join', group: 'moments', name: 'Friend joined', hint: 'Two glass plucks up a third',
    make: () => [L(lvl(GLASS, 0.3), seq(['C4', 'E4'], 0.08))],
  },
  {
    id: 'leave', group: 'moments', name: 'Friend left', hint: 'Two hollow plucks down a third (also: someone is out)',
    make: () => [L(lvl(HOLLOW, 0.3), seq(['E4', 'C4'], 0.1))],
  },
  {
    id: 'pop', group: 'moments', name: 'Reaction', hint: 'A small pop: a very quick chirp',
    make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -12 }, eg2: { a: 0.002, d: 0.025, r: 0.02 } }), 0.35), [['E4', 0, 0.015]])],
  },
];

const UI = [
  {
    id: 'tap', group: 'ui', name: 'Tap', hint: 'One muted pluck (five variants, in turn)',
    make: () => [L(lvl(MUTED, 0.3), [[turn('tap', ['A4', 'C5', 'G4', 'D5', 'E4']), 0, 0.015]])],
  },
  {
    id: 'button', group: 'ui', name: 'Button', hint: 'One pluck (five variants, in turn)',
    make: () => [L(lvl(PLUCK, 0.32), [[turn('button', ['C5', 'A4', 'D5', 'G4', 'E4']), 0, 0.03]])],
  },
  {
    id: 'play-game', group: 'ui', name: 'Play!', hint: 'Three glass plucks: up a fifth, up an octave',
    make: () => [L(lvl(GLASS, 0.36), seq(['A3', 'E4', 'A4'], 0.05))],
  },
  {
    id: 'toggle-on', group: 'ui', name: 'Toggle on', hint: 'Two blips, up',
    make: () => [M(mlvl(BLIP, 0.25), seq(['E4', 'A4'], 0.045, 0.02))],
  },
  {
    id: 'toggle-off', group: 'ui', name: 'Toggle off', hint: 'The same two, back down',
    make: () => [M(mlvl(BLIP, 0.25), seq(['A4', 'E4'], 0.045, 0.02))],
  },
  {
    id: 'swipe', group: 'ui', name: 'Swipe', hint: 'A soft breath of air (five variants, in turn)',
    make: () => [M(mlvl(P(AIR, { hpf: { peak: 0.2 }, eg2: { a: 0.015, d: 0.06, r: 0.04 } }), 0.35), [[turn('swipe', ['A3', 'C4', 'G3', 'D4', 'E3']), 0, 0.04]])],
  },
  {
    id: 'land', group: 'ui', name: 'Carousel land', hint: 'One round low pluck (five variants, in turn)',
    make: () => [L(lvl(ROUND, 0.36), [[turn('land', ['A3', 'C4', 'E4', 'D4', 'G3']), 0, 0.03]])],
  },
  {
    id: 'sheet-open', group: 'ui', name: 'Sheet open', hint: 'A soft chirp upward',
    make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -7 }, lpf: { freq: 1200 } }), 0.4), [['E4', 0, 0.03]])],
  },
  {
    id: 'sheet-close', group: 'ui', name: 'Sheet close', hint: 'The same note, falling instead',
    make: () => [M(mlvl(P(ZAP, { fm: { eg2: 7 }, lpf: { freq: 1200 }, eg2: { a: 0.004, d: 0.05 } }), 0.4), [['E4', 0, 0.03]])],
  },
  {
    id: 'back', group: 'ui', name: 'Back', hint: 'One hollow pluck, low',
    make: () => [L(lvl(HOLLOW, 0.3), [['E4', 0, 0.03]])],
  },
  {
    id: 'toast', group: 'ui', name: 'Toast', hint: 'A glass note and its fifth, a moment apart',
    make: () => [L(lvl(GLASS, 0.3), seq(['E4', 'B4'], 0.05))],
  },
  {
    id: 'error', group: 'ui', name: 'Error', hint: 'The same low buzz, twice',
    make: () => [M(mlvl(BUZZ, 0.4), seq(['A2', 'A2'], 0.1, 0.04))],
  },
  {
    id: 'select', group: 'ui', name: 'Select', hint: 'One muted pluck, darker than a tap (five variants, in turn)',
    make: () => [L(lvl(MUTED, 0.3), [[turn('select', ['E4', 'G4', 'D4', 'A4', 'C4']), 0, 0.015]])],
  },
];

export const SOUNDS = [...EFFECTS, ...CARDS, ...MOMENTS, ...UI];
