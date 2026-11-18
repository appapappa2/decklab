// The sound bank: every sound is made on the synth (synth.js), nothing is a
// recording. A sound is one or more layers; each layer is a patch (only what
// differs from DEFAULT_PATCH) and a sequence of [note, start s, length s, velocity?].
// `make` runs on every play, so sounds with randomness never repeat exactly.
//
// Two instruments. "Win" and "Lose" are the big ones, on the DL-106: a brass
// lead sliding from note to note onto a pad in a long hall. Everything else is
// ONE short plucked note with a rounded front and no noise in it, on whichever
// instrument suits it (only Countdown and Deal a hand play more than one, and
// those are the same single note repeated):
//   DL-106 (synth.js)  the soft, tonal ones: plain, hollow, muted, round and
//                      glass plucks
//   DL-20  (ms20.js)   the ones with character: zaps and chirps (pitch moving
//                      inside the note), rubbery blips, ring-modulator metal,
//                      drums and buzzes
// A layer made with L() plays on the DL-106, one made with M() on the DL-20.
// Everything sits in A minor / C major, so sounds that overlap agree.
//
// Groups: the effects on the VFX/Animations tab (same names as its buttons), the
// cards on the table, and the app's UI.
import { note, DEFAULT_PATCH } from './synth.js';

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
/** Win and Lose play at twice the speed they were written at: the lead and the pad with everything in time halved (slide, vibrato onset, envelope, echo, hall). */
const BRISK = P(LEAD, { lfo: { rate: 5, delay: 0.25 }, env: { a: 0.015, d: 0.15, s: 0.7, r: 0.25 }, assign: { mode: 'mono', porta: 0.06 }, delay: { mix: 0.2, time: 0.17, fb: 0.35 }, reverb: { mix: 0.22, size: 1.2 } });
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
const BRISK_PAD = P(PAD, { lfo: { rate: 1.4 }, env: { a: 0.25, d: 0.3, s: 0.7, r: 0.7 }, reverb: { mix: 0.4, size: 2.2 } });
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
  vcf: { freq: 620, res: 0.1, env: 0.4, kybd: 0.5 },
  env: { a: 0.01, d: 0.05, s: 0, r: 0.04 },
  chorus: 0,
  assign: { mode: 'poly', porta: 0 },
  reverb: { mix: 0.06, size: 0.6 },
};
/** Hollow: a square wave instead of the saw. */
const HOLLOW = P(PLUCK, { dco: { saw: false, pulse: true, pwm: 0, sub: 0 }, vcf: { freq: 700 } });
/** Muted: darker and half as long, like a damped string. */
const MUTED = P(PLUCK, { vcf: { freq: 500, env: 0.3 }, env: { d: 0.03, r: 0.03 } });
/** Round: mostly sub, for the low ones. */
const ROUND = P(PLUCK, { dco: { sub: 0.8 }, vcf: { freq: 450, env: 0.4 }, env: { d: 0.06, r: 0.045 } });
/** A card being dealt: the round pluck, darker, softer at the front and shorter. */
const DEAL = P(ROUND, { vcf: { freq: 380, env: 0.3 }, env: { a: 0.014, d: 0.04, r: 0.03 } });
/** Picking a card up and putting it down: the smallest pluck there is. Dark, very short, always the same note. */
const CARD = P(PLUCK, { dco: { sub: 0.5 }, vcf: { freq: 400, env: 0.25 }, env: { a: 0.008, d: 0.022, r: 0.02 }, reverb: { mix: 0.03, size: 0.6 } });
/** Glass: saw and pulse through the chorus, a little longer and wetter. For the moments that are good news. */
const GLASS = P(PLUCK, { dco: { saw: true, pulse: true, pwm: 0.3, sub: 0 }, vcf: { freq: 850, res: 0.12, env: 0.45 }, env: { d: 0.07, r: 0.05 }, chorus: 1, reverb: { mix: 0.08, size: 0.6 } });
/** Plucked notes one after another, `gap` seconds apart. */
const seq = (notes, gap, len = 0.03) => notes.map((n, i) => [n, i * gap, len]);

// ----------------------------------------------------------------- DL-20
// One voice, so one note at a time, but each of these has a character the
// DL-106 can't do: pitch that moves inside the note, a filter that rings,
// metal from the ring modulator.
/** A layer on the DL-20 (ms20.js). */
const M = (patch, notes, at = 0) => ({ synth: 'ms20', patch, notes, at });
const mlvl = (patch, level) => P(patch, { vca: { level } });
const SHORT = { eg2: { a: 0.008, d: 0.045, s: 0, r: 0.03 }, reverb: { mix: 0.05 } };
/** Zap: a triangle that starts high and drops onto the note. */
const ZAP = P(SHORT, { vco1: { wave: 'tri' }, fm: { eg2: 9 }, lpf: { freq: 1200 }, eg2: { a: 0.008, d: 0.04, s: 0, r: 0.025 } });
/** Chirp: the other way, rising into the note. A lift, a plop, a question. */
const CHIRP = P(SHORT, { vco1: { wave: 'tri' }, fm: { eg2: -8 }, lpf: { freq: 1100 }, eg2: { a: 0.008, d: 0.04, s: 0, r: 0.025 } });
/** Blip: a square wave, the low-pass snapping shut with its peak up. Rubbery. */
const BLIP = P(SHORT, { vco1: { wave: 'pulse' }, lpf: { freq: 380, peak: 0.3, eg2: 1.7, kbd: 0.5 }, eg2: { a: 0.008, d: 0.04, s: 0, r: 0.03 } });
/** Clink: the ring modulator, high-passed. Metal: coins, sparks. */
const CLINK = P(SHORT, { vco2: { wave: 'ring', pitch: 19 }, mix: { vco1: 0, vco2: 1 }, hpf: { freq: 300 }, lpf: { freq: 1600 }, eg2: { a: 0.006, d: 0.04, s: 0, r: 0.03 } });
/** Thud: a low triangle falling most of an octave. The drum. */
const THUD = P(SHORT, { vco1: { wave: 'tri', range: -1 }, fm: { eg2: 7 }, lpf: { freq: 420 }, eg2: { a: 0.006, d: 0.06, s: 0, r: 0.04 } });
/** Squelch: saw over a square an octave down, the low-pass opening wide and closing. Wet and low. */
const SQUELCH = P(SHORT, { vco2: { wave: 'square', range: -1 }, mix: { vco1: 0.7, vco2: 0.7 }, lpf: { freq: 200, peak: 0.45, eg2: 2.2 }, eg2: { a: 0.008, d: 0.055, s: 0, r: 0.04 } });
/** Buzz: a thin pulse against a saw just out of tune. For "no". */
const BUZZ = P(SHORT, { vco1: { wave: 'pulse', pw: 0.2 }, vco2: { pitch: 0.15 }, mix: { vco1: 0.7, vco2: 0.5 }, lpf: { freq: 420, peak: 0.1 }, eg2: { a: 0.008, d: 0.05, s: 0, r: 0.03 } });

export const GROUPS = [
  { id: 'effects', name: 'Effects', note: 'One for each effect on the VFX/Animations tab' },
  { id: 'cards', name: 'Cards', note: 'On the table' },
  { id: 'moments', name: 'Game moments', note: 'Reactions in one game or another' },
  { id: 'ui', name: 'UI', note: 'Taps, sheets and toggles' },
];

// Browsing the game carousel is the one place a sound changes note: each game
// that lands takes the next of five notes, then they start over. Every other
// sound is the same note every time.
const turns = new Map();
const turn = (id, list) => {
  const i = ((turns.get(id) ?? -1) + 1) % list.length;
  turns.set(id, i);
  return list[i];
};

/** One note: every sound but Win, Lose and the two that count (Countdown, Deal a hand) is exactly this. */
const one = (n, len = 0.02) => [[n, 0, len]];
/** "Go!": the count's blip, an octave up. */
const goLayers = (at) => [M(mlvl(BLIP, 0.26), one('A4', 0.03), at)];

const EFFECTS = [
  { id: 'sparks', group: 'effects', name: 'Sparks', hint: 'One tick of metal', make: () => [M(mlvl(CLINK, 0.28), one('A4'))] },
  { id: 'big-burst', group: 'effects', name: 'Big burst', hint: 'One soft drum', make: () => [M(mlvl(THUD, 0.42), one('A2', 0.04))] },
  { id: 'shake', group: 'effects', name: 'Shake', hint: 'One low squelch', make: () => [M(mlvl(SQUELCH, 0.34), one('A1', 0.03))] },
  {
    id: 'score', group: 'effects', name: 'Score +3', hint: 'One glass pluck',
    make: () => [L(lvl(GLASS, 0.3), one('A3'))],
  },
  { id: 'turn', group: 'effects', name: 'Your turn', hint: 'One hollow pluck', make: () => [L(lvl(HOLLOW, 0.32), one('A4'))] },
  { id: 'confetti', group: 'effects', name: 'Confetti', hint: 'One rubbery blip', make: () => [M(mlvl(BLIP, 0.24), one('D4'))] },
  {
    id: 'countdown', group: 'effects', name: 'Countdown', hint: '3, 2, 1, Go! (one blip each, 800 ms apart)',
    make: () => [M(mlvl(BLIP, 0.26), [['A3', 0, 0.03], ['A3', 0.8, 0.03], ['A3', 1.6, 0.03]]), ...goLayers(2.4)],
  },
  { id: 'count', group: 'effects', name: 'Count', hint: 'One blip of a 3, 2, 1 (Speed, Stress)', make: () => [M(mlvl(BLIP, 0.26), one('A3', 0.03))] },
  { id: 'go', group: 'effects', name: 'Go!', hint: "The count's blip, an octave up", make: () => goLayers(0) },
  {
    id: 'win', group: 'effects', name: 'Win', hint: 'Lose turned around: the lead climbs and lands on a major chord',
    make: () => [
      L(lvl(P(BRISK, { vcf: { freq: 650 } }), 0.17), [['E4', 0, 0.15], ['G4', 0.14, 0.15], ['C5', 0.28, 0.15], ['E5', 0.42, 0.5]]),
      L(lvl(P(BRISK_PAD, { vcf: { freq: 800 } }), 0.11), chord(C_MAJOR, 0.39, 0.55)),
      L(lvl(P(FLOURISH, { env: { d: 0.08, r: 0.08 }, assign: { porta: 0.025 }, delay: { time: 0.085 } }), 0.09), line([['G5', 0.04], ['C6', 0.04], ['E6', 0.04], ['G6', 0.15]], 0.5)),
    ],
  },
  {
    id: 'lose', group: 'effects', name: 'Lose', hint: 'A lead sliding down into a minor chord',
    make: () => [
      L(lvl(BRISK, 0.17), [['A4', 0, 0.18], ['G4', 0.17, 0.18], ['F4', 0.34, 0.18], ['E4', 0.51, 0.45]]),
      L(lvl(BRISK_PAD, 0.1), chord(A_MINOR, 0.475, 0.5)),
    ],
  },
  { id: 'fireworks', group: 'effects', name: 'Fireworks', hint: 'One chirp going up', make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -10 } }), 0.34), one('E4'))] },
  { id: 'coins', group: 'effects', name: 'Coins', hint: 'One clink of metal, higher than a spark', make: () => [M(mlvl(CLINK, 0.28), one('D5'))] },
  { id: 'suits', group: 'effects', name: 'Suit rain', hint: 'One muted drop', make: () => [L(lvl(MUTED, 0.34), one('E4'))] },
  { id: 'flash', group: 'effects', name: 'Flash', hint: 'One zap', make: () => [M(mlvl(ZAP, 0.4), one('A4'))] },
  { id: 'combo', group: 'effects', name: 'Combo', hint: 'One blip', make: () => [M(mlvl(BLIP, 0.24), one('C4'))] },
  { id: 'rank-up', group: 'effects', name: 'Rank up', hint: 'One glass pluck', make: () => [L(lvl(GLASS, 0.3), one('A4'))] },
];

const CARDS = [
  {
    id: 'deal', group: 'cards', name: 'Deal', hint: 'One round, soft pluck',
    make: () => [L(lvl(DEAL, 0.28), one('A3'))],
  },
  {
    id: 'deal-hand', group: 'cards', name: 'Deal a hand', hint: 'Seven deals in a row, stepping down the scale',
    make: () => [L(lvl(DEAL, 0.28), seq(['E4', 'D4', 'C4', 'A3', 'G3', 'E3', 'A3'], 0.09, 0.02))],
  },
  {
    id: 'flip', group: 'cards', name: 'Flip', hint: 'One short hollow pluck',
    make: () => [L(lvl(P(HOLLOW, { env: { d: 0.03, r: 0.03 } }), 0.3), one('A4', 0.015))],
  },
  { id: 'pickup', group: 'cards', name: 'Pick up', hint: 'One tiny dark pluck: the card lifts', make: () => [L(lvl(CARD, 0.2), one('A3', 0.012))] },
  { id: 'play', group: 'cards', name: 'Play', hint: 'The same tiny pluck, a touch fuller: the card lands', make: () => [L(lvl(P(CARD, { env: { d: 0.03 } }), 0.24), one('A3', 0.012))] },
  {
    id: 'peek', group: 'cards', name: 'Peek', hint: 'One very soft note per card',
    make: () => [L(lvl(MUTED, 0.24), one('A3', 0.015))],
  },
  { id: 'shuffle', group: 'cards', name: 'Shuffle', hint: 'One round, soft pluck, low', make: () => [L(lvl(DEAL, 0.32), one('E3'))] },
  { id: 'collect', group: 'cards', name: 'Collect', hint: 'One round pluck', make: () => [L(lvl(ROUND, 0.3), one('C4'))] },
  { id: 'invalid', group: 'cards', name: "Can't play", hint: 'One dull buzz', make: () => [M(mlvl(BUZZ, 0.36), one('E3', 0.03))] },
];

/** Step n of a climb up the A minor pentatonic scale from A2: 13 steps cover a suit, Ace to King. */
const climb = (n) => 45 + 12 * Math.floor(n / 5) + [0, 3, 5, 7, 10][n % 5];

/**
 * Per-game reactions. `make(step)` on Score tick and Foundation takes a step,
 * so a counter or a foundation can climb: sfx('foundation', 4).
 */
const MOMENTS = [
  { id: 'settle', group: 'moments', name: 'Settle', hint: 'The last card of a deal lands; a build stacks: one round low pluck', make: () => [L(lvl(ROUND, 0.3), one('E3'))] },
  { id: 'play-them', group: 'moments', name: 'Opponent plays', hint: 'Play, quieter still', make: () => [L(lvl(P(CARD, { env: { d: 0.03 } }), 0.16), one('A3', 0.012))] },
  { id: 'slide', group: 'moments', name: 'Slide', hint: 'A card pushed onto your own pile, a swap: the same tiny pluck as Play', make: () => [L(lvl(P(CARD, { env: { d: 0.03 } }), 0.22), one('A3', 0.012))] },
  { id: 'flick', group: 'moments', name: 'Flick', hint: 'The same tiny pluck, cut shorter', make: () => [L(lvl(CARD, 0.22), one('A3', 0.01))] },
  { id: 'take-pile', group: 'moments', name: 'Take the pile', hint: 'One drum: you are the one picking up', make: () => [M(mlvl(THUD, 0.4), one('C3', 0.04))] },
  { id: 'tick', group: 'moments', name: 'Score tick', hint: 'One tick of a rolling score; give it a step and it climbs', make: (step = 0) => [L(lvl(MUTED, 0.26), one(57 + (step % 12), 0.012))] },
  { id: 'foundation', group: 'moments', name: 'Foundation', hint: 'One glass pluck; give it a step (the card count) and it climbs', make: (step = 4) => [L(lvl(GLASS, 0.36), one(climb(step % 13)))] },
  { id: 'meld', group: 'moments', name: 'Meld', hint: 'A set, a run or a book snaps together: one glass pluck', make: () => [L(lvl(GLASS, 0.3), one('G4'))] },
  { id: 'knock', group: 'moments', name: 'Knock', hint: 'One knock on wood (Gin; a play-again request)', make: () => [M(mlvl(P(THUD, { vco1: { range: 0 }, fm: { eg2: 5 }, lpf: { freq: 600, peak: 0.3 }, eg2: { d: 0.035, r: 0.03 } }), 0.4), one('E3'))] },
  { id: 'tie', group: 'moments', name: 'Tie', hint: 'Neutral: one hollow note (a tie, the deck ran out, the lake is empty)', make: () => [L(lvl(HOLLOW, 0.3), one('C5'))] },
  { id: 'alert', group: 'moments', name: 'Alert', hint: 'One blip, higher than the count: last card, a jack is up', make: () => [M(mlvl(BLIP, 0.28), one('G4'))] },
  { id: 'pulse', group: 'moments', name: 'Low pulse', hint: 'One soft low drum: someone is down to a few cards', make: () => [M(mlvl(P(THUD, { fm: { eg2: 4 } }), 0.4), one('E2', 0.03))] },
  { id: 'slap', group: 'moments', name: 'Slap', hint: 'A hand on the pile: one drum, higher', make: () => [M(mlvl(THUD, 0.42), one('E3', 0.03))] },
  {
    id: 'stress', group: 'moments', name: 'Stress!', hint: 'A children\'s choir sings "stress!", bouncy, over a soft C major pad',
    make: () => [
      { synth: 'voice', word: 'stress', notes: ['C4', 'E4', 'G4'], level: 0.3, child: true, stretch: 1.6, at: 0 },
      L(lvl(P(BRISK_PAD, { vcf: { freq: 900 } }), 0.05), [['C4', 0, 0.7], ['G4', 0, 0.7]]),
    ],
  },
  { id: 'war', group: 'moments', name: 'War!', hint: 'One drum falling further', make: () => [M(mlvl(P(THUD, { fm: { eg2: 12 } }), 0.5), one('A2', 0.04))] },
  { id: 'sweep', group: 'moments', name: 'Sweep', hint: 'One glass pluck (Casino)', make: () => [L(lvl(GLASS, 0.3), one('D4'))] },
  { id: 'burn', group: 'moments', name: 'Burn', hint: 'The pile goes: one low squelch (Palace)', make: () => [M(mlvl(SQUELCH, 0.34), one('E2', 0.03))] },
  { id: 'reset', group: 'moments', name: 'Reset', hint: 'A 2 resets the pile: one zap falling an octave (Palace)', make: () => [M(mlvl(P(ZAP, { fm: { eg2: 14 } }), 0.4), one('A3'))] },
  { id: 'ask', group: 'moments', name: 'Ask', hint: 'A question: one chirp leaning upward (Go Fish)', make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -4 } }), 0.38), one('G4'))] },
  { id: 'splash', group: 'moments', name: 'Go fish!', hint: 'A plop: one low note rising fast', make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -12 }, lpf: { freq: 700 } }), 0.42), one('A3'))] },
  { id: 'join', group: 'moments', name: 'Friend joined', hint: 'One glass pluck', make: () => [L(lvl(GLASS, 0.3), one('E4'))] },
  { id: 'leave', group: 'moments', name: 'Friend left', hint: 'One hollow pluck, low (also: someone is out)', make: () => [L(lvl(HOLLOW, 0.3), one('C4'))] },
  { id: 'pop', group: 'moments', name: 'Reaction', hint: 'A small pop: one very quick chirp', make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -12 }, eg2: { a: 0.006, d: 0.025, r: 0.02 } }), 0.35), one('E4', 0.015))] },
];

const UI = [
  { id: 'tap', group: 'ui', name: 'Tap', hint: 'One muted pluck', make: () => [L(lvl(MUTED, 0.3), one('A4', 0.015))] },
  { id: 'button', group: 'ui', name: 'Button', hint: 'One pluck', make: () => [L(lvl(PLUCK, 0.32), one('C5'))] },
  { id: 'play-game', group: 'ui', name: 'Play!', hint: 'One glass pluck, the highest', make: () => [L(lvl(GLASS, 0.34), one('C5'))] },
  { id: 'toggle-on', group: 'ui', name: 'Toggle on', hint: 'One blip', make: () => [M(mlvl(BLIP, 0.25), one('E4'))] },
  { id: 'toggle-off', group: 'ui', name: 'Toggle off', hint: 'The same blip, lower', make: () => [M(mlvl(BLIP, 0.25), one('C4'))] },
  { id: 'land', group: 'ui', name: 'Carousel land', hint: 'One round low pluck (five notes, in turn)', make: () => [L(lvl(ROUND, 0.36), one(turn('land', ['A3', 'C4', 'E4', 'D4', 'G3'])))] },
  { id: 'sheet-open', group: 'ui', name: 'Sheet open', hint: 'One soft chirp upward', make: () => [M(mlvl(P(CHIRP, { fm: { eg2: -7 }, lpf: { freq: 1000 } }), 0.4), one('E4'))] },
  { id: 'sheet-close', group: 'ui', name: 'Sheet close', hint: 'The same note, falling instead', make: () => [M(mlvl(P(ZAP, { fm: { eg2: 7 }, lpf: { freq: 1000 } }), 0.4), one('E4'))] },
  { id: 'back', group: 'ui', name: 'Back', hint: 'One hollow pluck', make: () => [L(lvl(HOLLOW, 0.3), one('E4'))] },
  { id: 'toast', group: 'ui', name: 'Toast', hint: 'One glass pluck', make: () => [L(lvl(GLASS, 0.3), one('B4'))] },
  { id: 'error', group: 'ui', name: 'Error', hint: 'One low buzz', make: () => [M(mlvl(BUZZ, 0.36), one('A2', 0.03))] },
  { id: 'select', group: 'ui', name: 'Select', hint: 'The pick-up pluck: one tiny dark note', make: () => [L(lvl(CARD, 0.2), one('A3', 0.012))] },
];

export const SOUNDS = [...EFFECTS, ...CARDS, ...MOMENTS, ...UI];
