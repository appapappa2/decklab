// The sound bank: every sound is made on the synth (synth.js), nothing is a
// recording. A sound is one or more layers; each layer is a patch (only what
// differs from DEFAULT_PATCH) and a sequence of [note, start s, length s, velocity?].
// `make` runs on every play, so sounds with randomness never repeat exactly.
//
// Groups: the effects on the Animations tab (same names as its buttons), the
// cards on the table, and the app's UI.

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const L = (patch, notes, at = 0) => ({ patch, notes, at });

// Reusable patches
const BLIP = { mix: { saw: 0, pulse: 1 }, vco: { pw: 0.5 }, vcf: { freq: 5200, res: 0.15, env: 0.2, kybd: 0.6 }, env: { a: 0.001, d: 0.09, s: 0, r: 0.05 } };
const CHIME = { mix: { saw: 0.35, pulse: 0.6 }, vco: { pw: 0.2, mod: 0.12 }, vcf: { freq: 900, res: 0.25, env: 0.5, kybd: 0.8 }, env: { a: 0.002, d: 0.5, s: 0, r: 0.35 }, lfo: { rate: 6 } };
const BRASS = { mix: { saw: 1, sub: 0.35, subType: 'oct1' }, vcf: { freq: 700, res: 0.3, env: 0.65, kybd: 0.5 }, env: { a: 0.02, d: 0.25, s: 0.55, r: 0.2 }, vco: { mod: 0.08 }, lfo: { rate: 5.5 } };
const HISS = { mix: { saw: 0, noise: 1 }, vcf: { freq: 2500, res: 0.1, env: 0.5, kybd: 0 } };
const THUMP = { mix: { saw: 0, sub: 1, subType: 'oct1' }, vcf: { freq: 260, res: 0.1, env: 0.4, kybd: 0.3 }, env: { a: 0.001, d: 0.12, s: 0, r: 0.06 }, bend: { amt: 1200, time: 0.08 } };
const PENTA = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7'];

export const GROUPS = [
  { id: 'effects', name: 'Effects', note: 'One for each button on the Animations tab' },
  { id: 'cards', name: 'Cards', note: 'On the table' },
  { id: 'ui', name: 'UI', note: 'Taps, swipes, sheets and toggles' },
];

export const SOUNDS = [
  // ------------------------------------------------------------ effects
  {
    id: 'sparks', group: 'effects', name: 'Sparks', hint: 'Bright ascending sparkle',
    make: () => [
      L(BLIP, ['E6', 'B6', 'G#6', 'E7', 'B7'].map((n, i) => [n, i * 0.035, 0.03, 1 - i * 0.12])),
      L({ ...HISS, vcf: { freq: 6000, res: 0.3, env: 0.3, kybd: 0 }, env: { a: 0.001, d: 0.12, s: 0, r: 0.08 }, vol: 0.35 }, [['C5', 0, 0.05]]),
    ],
  },
  {
    id: 'big-burst', group: 'effects', name: 'Big burst', hint: 'Boom with a falling zap',
    make: () => [
      L({ ...HISS, vcf: { freq: 300, res: 0.25, env: 0.85, kybd: 0 }, env: { a: 0.002, d: 0.55, s: 0, r: 0.4 }, vol: 0.9 }, [['C4', 0, 0.3]]),
      L({ mix: { saw: 1, sub: 0.8, subType: 'oct2' }, vcf: { freq: 400, res: 0.35, env: 0.7 }, env: { a: 0.001, d: 0.4, s: 0, r: 0.2 }, bend: { amt: 2400, time: 0.35 } }, [['C2', 0, 0.25]]),
      L(BLIP, ['G6', 'D7', 'B6', 'G7'].map((n, i) => [n, 0.06 + i * 0.04, 0.03, 0.6])),
    ],
  },
  {
    id: 'shake', group: 'effects', name: 'Shake', hint: 'Low rattling rumble',
    make: () => [
      L({ mix: { saw: 0.5, sub: 1, subType: 'oct2', noise: 0.3 }, vco: { mod: 0.35 }, lfo: { rate: 22, wave: 'random' }, vcf: { freq: 320, res: 0.3, env: 0.3, mod: 0.4, kybd: 0 }, env: { a: 0.005, d: 0.45, s: 0, r: 0.15 } }, [['A1', 0, 0.35]]),
    ],
  },
  {
    id: 'score', group: 'effects', name: 'Score +3', hint: 'Two-note pickup',
    make: () => [L({ ...BLIP, vco: { pw: 0.6 }, env: { a: 0.001, d: 0.18, s: 0.3, r: 0.12 } }, [['B5', 0, 0.06], ['E6', 0.065, 0.16]])],
  },
  {
    id: 'turn', group: 'effects', name: 'Your turn', hint: 'Soft rising chime',
    make: () => [L(CHIME, [['G5', 0, 0.12, 0.7], ['C6', 0.11, 0.35]])],
  },
  {
    id: 'confetti', group: 'effects', name: 'Confetti', hint: 'A flurry of tiny blips',
    make: () => [
      L({ ...BLIP, vco: { pw: 0.4, pwm: 'lfo' }, lfo: { rate: 9 }, env: { a: 0.001, d: 0.06, s: 0, r: 0.04 } },
        Array.from({ length: 22 }, (_, i) => [pick(PENTA), i * 0.04 + rand(0, 0.02), 0.025, rand(0.35, 0.9)])),
      L({ ...BLIP, vcf: { freq: 3000, res: 0.2, env: 0.3, kybd: 0.6 }, vol: 0.5 },
        Array.from({ length: 10 }, (_, i) => [pick(PENTA), 0.02 + i * 0.085, 0.03, 0.6])),
    ],
  },
  {
    id: 'curtain', group: 'effects', name: 'Card curtain', hint: 'Whoosh up, whoosh down',
    make: () => [
      L({ ...HISS, vcf: { freq: 180, res: 0.45, env: 0.8, kybd: 0 }, env: { a: 0.45, d: 0.5, s: 0, r: 0.3 }, vol: 0.8 }, [['C4', 0, 0.5]]),
      L({ mix: { saw: 0.6, pulse: 0.4 }, vco: { pw: 0.3 }, vcf: { freq: 500, res: 0.2, env: 0.5 }, env: { a: 0.4, d: 0.4, s: 0, r: 0.3 }, glide: 0.45, vol: 0.25 }, [['C4', 0, 0.45], ['C5', 0.02, 0.5], ['G3', 0.55, 0.4]]),
    ],
  },
  {
    id: 'countdown', group: 'effects', name: 'Countdown', hint: '3, 2, 1, Go! (800 ms apart)',
    make: () => [
      L({ ...BLIP, vco: { pw: 0 }, vcf: { freq: 2600, res: 0.2, env: 0.3, kybd: 0.5 }, env: { a: 0.002, d: 0.2, s: 0.4, r: 0.1 } }, [['A5', 0, 0.14], ['A5', 0.8, 0.14], ['A5', 1.6, 0.14]]),
      L({ ...BRASS, mix: { saw: 1, pulse: 0.5, sub: 0.4 }, vcf: { freq: 1500, res: 0.3, env: 0.5 } }, [['A6', 2.4, 0.4]]),
      L(BLIP, [['E7', 2.4, 0.05], ['A7', 2.45, 0.08]]),
    ],
  },
  {
    id: 'win', group: 'effects', name: 'Win', hint: 'Fanfare, then fireworks',
    make: () => [
      L(BRASS, [['C5', 0, 0.1], ['E5', 0.1, 0.1], ['G5', 0.2, 0.1], ['C6', 0.3, 0.55]]),
      L({ ...BRASS, vcf: { freq: 500, res: 0.25, env: 0.6 }, vol: 0.45 }, [['G4', 0.3, 0.55]]),
      L({ ...CHIME, vol: 0.5 }, [['E6', 0.32, 0.3], ['G6', 0.4, 0.3], ['C7', 0.48, 0.5]]),
      ...fireworksLayers(3, 0.75),
    ],
  },
  {
    id: 'lose', group: 'effects', name: 'Lose', hint: 'Sad trombone slide',
    make: () => [
      L({ ...BRASS, glide: 0.08, vcf: { freq: 450, res: 0.35, env: 0.55, mod: 0.15 }, lfo: { rate: 5 }, env: { a: 0.03, d: 0.3, s: 0.7, r: 0.35 } },
        [['G4', 0, 0.32], ['F#4', 0.34, 0.32], ['F4', 0.68, 0.32]]),
      L({ ...BRASS, vco: { mod: 0.3 }, lfo: { rate: 5.5 }, vcf: { freq: 380, res: 0.35, env: 0.5, mod: 0.35 }, env: { a: 0.03, d: 0.4, s: 0.6, r: 0.5 } }, [['E4', 1.02, 0.9]]),
    ],
  },
  {
    id: 'fireworks', group: 'effects', name: 'Fireworks', hint: 'Whistles and crackling pops',
    make: () => fireworksLayers(5, 0),
  },
  {
    id: 'coins', group: 'effects', name: 'Coins', hint: 'A fountain of pickups',
    make: () => Array.from({ length: 7 }, (_, i) => {
      const base = pick([['B5', 'E6'], ['A5', 'D6'], ['C6', 'F6'], ['B5', 'E6']]);
      return L({ ...BLIP, vco: { pw: 0.55 }, env: { a: 0.001, d: 0.15, s: 0.2, r: 0.1 }, vol: 0.55 }, [[base[0], 0, 0.05], [base[1], 0.055, 0.12]], i * 0.09 + rand(0, 0.03));
    }),
  },
  {
    id: 'suits', group: 'effects', name: 'Suit rain', hint: 'Falling raindrop plinks',
    make: () => [
      L({ ...CHIME, vcf: { freq: 1800, res: 0.45, env: 0.4, kybd: 0.8 }, env: { a: 0.001, d: 0.18, s: 0, r: 0.12 }, bend: { amt: 500, time: 0.05 } },
        Array.from({ length: 18 }, (_, i) => [pick(PENTA.slice(0, 6)), i * 0.075 + rand(0, 0.04), 0.04, rand(0.4, 0.9)]).map(([n, t, d, v], i) => [n, t, d, v * (1 - i / 30)])),
    ],
  },
  {
    id: 'flash', group: 'effects', name: 'Flash', hint: 'Bright zap',
    make: () => [
      L({ mix: { saw: 1, pulse: 0.6, noise: 0.3 }, vco: { pw: 0.7 }, vcf: { freq: 1200, res: 0.5, env: 0.8 }, env: { a: 0.001, d: 0.25, s: 0, r: 0.12 }, bend: { amt: 3600, time: 0.22 } }, [['C5', 0, 0.12]]),
      L({ ...HISS, vcf: { freq: 5000, res: 0.2, env: 0.4, kybd: 0 }, env: { a: 0.001, d: 0.3, s: 0, r: 0.2 }, vol: 0.5 }, [['C5', 0, 0.15]]),
    ],
  },
  {
    id: 'combo', group: 'effects', name: 'Combo', hint: 'Resonant bwip, a step higher each time',
    make: () => {
      comboStep = (comboStep + 1) % 6;
      const root = 72 + [0, 2, 4, 7, 9, 12][comboStep];
      return [
        L({ mix: { saw: 1, sub: 0.4 }, vcf: { freq: 350, res: 0.75, env: 0.7, kybd: 0.4 }, env: { a: 0.001, d: 0.16, s: 0, r: 0.1 } }, [[root, 0, 0.06], [root + 7, 0.07, 0.1]]),
        L({ ...THUMP, vol: 0.7 }, [[root - 36, 0, 0.08]]),
      ];
    },
  },
  {
    id: 'rank-up', group: 'effects', name: 'Rank up', hint: 'Level up: run and trill',
    make: () => [
      L({ ...BLIP, vco: { pw: 0.3, pwm: 'lfo' }, lfo: { rate: 7 }, env: { a: 0.001, d: 0.1, s: 0.4, r: 0.1 } },
        ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'].map((n, i) => [n, i * 0.05, 0.045])),
      L({ ...BLIP, vco: { pw: 0.3 }, env: { a: 0.001, d: 0.1, s: 0.6, r: 0.25 } }, Array.from({ length: 8 }, (_, i) => [i % 2 ? 'E6' : 'G6', 0.42 + i * 0.045, 0.04])),
      L({ ...BRASS, vol: 0.5 }, [['C6', 0.42, 0.45]]),
    ],
  },

  // ------------------------------------------------------------ cards
  {
    id: 'deal', group: 'cards', name: 'Deal', hint: 'One card flicked onto the table',
    make: () => [
      L({ ...HISS, vcf: { freq: rand(2600, 3400), res: 0.2, env: 0.3, kybd: 0 }, env: { a: 0.001, d: 0.05, s: 0, r: 0.03 }, vol: 0.6 }, [['C5', 0, 0.03]]),
      L({ ...THUMP, vol: 0.35 }, [['C3', 0.015, 0.04]]),
    ],
  },
  {
    id: 'deal-hand', group: 'cards', name: 'Deal a hand', hint: 'Seven cards in a row',
    make: () => Array.from({ length: 7 }, (_, i) => L({ ...HISS, vcf: { freq: rand(2400, 3600), res: 0.2, env: 0.3, kybd: 0 }, env: { a: 0.001, d: 0.05, s: 0, r: 0.03 }, vol: 0.55 }, [['C5', 0, 0.03]], i * 0.09)),
  },
  {
    id: 'flip', group: 'cards', name: 'Flip', hint: 'Turned face up',
    make: () => [L({ ...HISS, vcf: { freq: 3800, res: 0.3, env: 0.2, kybd: 0 }, env: { a: 0.001, d: 0.03, s: 0, r: 0.02 }, vol: 0.55 }, [['C5', 0, 0.015], ['C5', 0.05, 0.02, 0.8]])],
  },
  {
    id: 'pickup', group: 'cards', name: 'Pick up', hint: 'A card lifted from the hand',
    make: () => [
      L({ ...HISS, vcf: { freq: 900, res: 0.35, env: 0.6, kybd: 0 }, env: { a: 0.06, d: 0.06, s: 0, r: 0.04 }, vol: 0.45 }, [['C5', 0, 0.07]]),
      L({ ...BLIP, vcf: { freq: 1800, res: 0.2, env: 0.2 }, vol: 0.25 }, [['G5', 0.05, 0.02]]),
    ],
  },
  {
    id: 'play', group: 'cards', name: 'Play', hint: 'Slapped onto the pile',
    make: () => [
      L({ ...HISS, vcf: { freq: 1600, res: 0.2, env: 0.5, kybd: 0 }, env: { a: 0.001, d: 0.09, s: 0, r: 0.05 }, vol: 0.8 }, [['C5', 0, 0.04]]),
      L(THUMP, [['C2', 0, 0.06]]),
    ],
  },
  {
    id: 'peek', group: 'cards', name: 'Peek', hint: 'Sliding across the hand',
    make: () => [L({ ...BLIP, vcf: { freq: 3000, res: 0.1, env: 0.1 }, env: { a: 0.001, d: 0.02, s: 0, r: 0.015 }, vol: 0.3 }, [[pick(['C7', 'D7', 'E7']), 0, 0.01]])],
  },
  {
    id: 'shuffle', group: 'cards', name: 'Shuffle', hint: 'A riffle',
    make: () => [
      L({ ...HISS, vcf: { freq: 2800, res: 0.25, env: 0.25, kybd: 0 }, env: { a: 0.001, d: 0.025, s: 0, r: 0.015 }, vol: 0.5 },
        Array.from({ length: 22 }, (_, i) => ['C5', i * 0.024 + rand(0, 0.008), 0.01, rand(0.5, 1)])),
      L({ ...THUMP, vol: 0.4 }, [['C2', 0.56, 0.06]]),
    ],
  },
  {
    id: 'collect', group: 'cards', name: 'Collect', hint: 'Cards swept into a pile',
    make: () => [
      L({ ...HISS, vcf: { freq: 700, res: 0.3, env: 0.6, kybd: 0 }, env: { a: 0.12, d: 0.12, s: 0, r: 0.08 }, vol: 0.5 }, [['C5', 0, 0.14]]),
      ...[0.1, 0.15, 0.2].map((t) => L({ ...HISS, vcf: { freq: 3000, res: 0.2, env: 0.2, kybd: 0 }, env: { a: 0.001, d: 0.03, s: 0, r: 0.02 }, vol: 0.4 }, [['C5', 0, 0.015]], t)),
      L({ ...THUMP, vol: 0.5 }, [['D2', 0.24, 0.06]]),
    ],
  },
  {
    id: 'invalid', group: 'cards', name: "Can't play", hint: 'The card goes back',
    make: () => [L({ mix: { saw: 0, pulse: 1, sub: 0.5 }, vco: { pw: 0.6 }, vcf: { freq: 700, res: 0.3, env: 0.3, kybd: 0.3 }, env: { a: 0.002, d: 0.1, s: 0.5, r: 0.05 }, vca: 'gate', vol: 0.35 }, [['E3', 0, 0.07], ['C3', 0.1, 0.12]])],
  },

  // ------------------------------------------------------------ UI
  {
    id: 'tap', group: 'ui', name: 'Tap', hint: 'Any small tap',
    make: () => [L({ ...BLIP, vco: { pw: 0.8 }, vcf: { freq: 2600, res: 0.1, env: 0.2 }, env: { a: 0.001, d: 0.02, s: 0, r: 0.015 }, vol: 0.5 }, [['G6', 0, 0.01]])],
  },
  {
    id: 'button', group: 'ui', name: 'Button', hint: 'A button sinking in',
    make: () => [
      L({ mix: { saw: 0.5, sub: 0.8 }, vcf: { freq: 500, res: 0.4, env: 0.5 }, env: { a: 0.001, d: 0.07, s: 0, r: 0.04 }, bend: { amt: 300, time: 0.05 }, vol: 0.6 }, [['C5', 0, 0.04]]),
    ],
  },
  {
    id: 'play-game', group: 'ui', name: 'Play!', hint: 'The Play bar: into a game',
    make: () => [
      L({ ...BRASS, vcf: { freq: 600, res: 0.45, env: 0.7 }, glide: 0.06, env: { a: 0.005, d: 0.2, s: 0.5, r: 0.2 } }, [['G4', 0, 0.08], ['C5', 0.07, 0.08], ['G5', 0.14, 0.25]]),
      L({ ...HISS, vcf: { freq: 400, res: 0.3, env: 0.7, kybd: 0 }, env: { a: 0.15, d: 0.2, s: 0, r: 0.15 }, vol: 0.5 }, [['C5', 0, 0.2]]),
    ],
  },
  {
    id: 'toggle-on', group: 'ui', name: 'Toggle on', hint: 'Single → Multi, a switch on',
    make: () => [L({ ...BLIP, vcf: { freq: 3000, res: 0.2, env: 0.3 }, env: { a: 0.001, d: 0.05, s: 0, r: 0.03 }, vol: 0.5 }, [['E6', 0, 0.03], ['A6', 0.05, 0.04]])],
  },
  {
    id: 'toggle-off', group: 'ui', name: 'Toggle off', hint: 'A switch off',
    make: () => [L({ ...BLIP, vcf: { freq: 2400, res: 0.2, env: 0.3 }, env: { a: 0.001, d: 0.05, s: 0, r: 0.03 }, vol: 0.5 }, [['A6', 0, 0.03], ['E6', 0.05, 0.04]])],
  },
  {
    id: 'swipe', group: 'ui', name: 'Swipe', hint: 'The lobby carousel moving',
    make: () => [L({ ...HISS, vcf: { freq: 400, res: 0.5, env: 0.65, kybd: 0 }, env: { a: 0.07, d: 0.16, s: 0, r: 0.1 }, vol: 0.45 }, [['C5', 0, 0.09]])],
  },
  {
    id: 'land', group: 'ui', name: 'Carousel land', hint: 'A game settles in the middle',
    make: () => [
      L({ ...CHIME, vcf: { freq: 1400, res: 0.3, env: 0.3 }, env: { a: 0.001, d: 0.12, s: 0, r: 0.1 }, vol: 0.4 }, [['C6', 0, 0.04]]),
      L({ ...THUMP, vol: 0.3 }, [['C3', 0, 0.04]]),
    ],
  },
  {
    id: 'sheet-open', group: 'ui', name: 'Sheet open', hint: 'Settings / menu slides up',
    make: () => [L({ mix: { saw: 0.4, pulse: 0.5 }, vco: { pw: 0.3 }, vcf: { freq: 900, res: 0.35, env: 0.4 }, env: { a: 0.01, d: 0.15, s: 0, r: 0.08 }, glide: 0.1, vol: 0.4 }, [['C5', 0, 0.06], ['G5', 0.03, 0.08]])],
  },
  {
    id: 'sheet-close', group: 'ui', name: 'Sheet close', hint: 'Slides back down',
    make: () => [L({ mix: { saw: 0.4, pulse: 0.5 }, vco: { pw: 0.3 }, vcf: { freq: 800, res: 0.35, env: 0.4 }, env: { a: 0.01, d: 0.15, s: 0, r: 0.08 }, glide: 0.1, vol: 0.4 }, [['G5', 0, 0.06], ['C5', 0.03, 0.08]])],
  },
  {
    id: 'back', group: 'ui', name: 'Back', hint: 'Leaving a screen',
    make: () => [L({ ...BLIP, vco: { pw: 0.3 }, vcf: { freq: 2000, res: 0.2, env: 0.3 }, env: { a: 0.001, d: 0.06, s: 0, r: 0.04 }, vol: 0.45 }, [['G5', 0, 0.035], ['D5', 0.05, 0.05]])],
  },
  {
    id: 'toast', group: 'ui', name: 'Toast', hint: 'A message pops in',
    make: () => [L({ ...CHIME, vol: 0.55 }, [['E6', 0, 0.06, 0.8], ['B6', 0.07, 0.25]])],
  },
  {
    id: 'error', group: 'ui', name: 'Error', hint: 'Not allowed / locked mode',
    make: () => [L({ mix: { saw: 0.3, pulse: 1, sub: 0.6, subType: 'oct1' }, vco: { pw: 0.75 }, vcf: { freq: 900, res: 0.3, env: 0.2 }, vca: 'gate', env: { a: 0.001, d: 0.1, s: 0.7, r: 0.03 }, vol: 0.35 }, [['A2', 0, 0.09], ['A2', 0.13, 0.12]])],
  },
  {
    id: 'select', group: 'ui', name: 'Select', hint: 'A card ring snaps on',
    make: () => [L({ ...BLIP, vco: { pw: 0.6 }, vcf: { freq: 3400, res: 0.35, env: 0.3 }, env: { a: 0.001, d: 0.04, s: 0, r: 0.03 }, bend: { amt: -400, time: 0.03 }, vol: 0.45 }, [['D6', 0, 0.025]])],
  },
];

let comboStep = -1;

/** A few rockets: a rising whistle, then a noise pop with a crackle. */
function fireworksLayers(count, at) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = at + i * 0.17 + rand(0, 0.09);
    const top = pick(['C6', 'D6', 'E6', 'G6']);
    out.push(L({ mix: { saw: 0, pulse: 1 }, vco: { pw: 0.1 }, vcf: { freq: 2400, res: 0.1, env: 0.2 }, env: { a: 0.03, d: 0.4, s: 0.3, r: 0.05 }, bend: { amt: -2400, time: 0.3 }, vol: 0.18 }, [[top, 0, 0.3]], t));
    out.push(L({ ...HISS, vcf: { freq: 500, res: 0.2, env: 0.8, mod: 0.5, kybd: 0 }, lfo: { rate: 30, wave: 'random' }, env: { a: 0.001, d: 0.6, s: 0, r: 0.4 }, vol: 0.55 }, [['C4', 0, 0.12]], t + 0.32));
  }
  return out;
}
