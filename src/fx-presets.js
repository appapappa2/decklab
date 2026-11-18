// The VFX/animation presets, as data.
//
// An effect is a named list of layers. A layer is one building block (MODULES
// below) with its settings and a delay, so effects are combined by stacking
// layers: "Win" is a flash, a sticker, confetti and, a beat later, fireworks.
//
// DEFAULTS is what ships. The board next to the phone (fxboard.js) edits a copy
// and saves it to src/fx-presets.json, which is loaded on top of these at
// startup; an effect missing from that file falls back to its default here.

const range = (key, label, min, max, step, def) => ({ key, label, type: 'range', min, max, step, def });
const bool = (key, label, def) => ({ key, label, type: 'bool', def });
const text = (key, label, def) => ({ key, label, type: 'text', def });
const choice = (key, label, options, def) => ({ key, label, type: 'choice', options, def });

const COLOR_NAMES = ['ink', 'white', 'red', 'yellow', 'green', 'blue'];
const AT = [range('x', 'Across', 0, 1, 0.01, 0.5), range('y', 'Down', 0, 1, 0.01, 0.44)];

/** The building blocks: what a layer can be, and the settings each one has. */
export const MODULES = {
  burst: { label: 'Sparks', params: [range('count', 'Sparks', 4, 40, 1, 16), range('speed', 'Speed', 100, 700, 10, 320), bool('big', 'Big ring', false), ...AT] },
  rings: { label: 'Rings', params: [range('count', 'Rings', 1, 6, 1, 3), ...AT] },
  shake: { label: 'Shake', params: [range('px', 'Strength', 1, 18, 1, 6)] },
  flash: { label: 'Flash', params: [choice('color', 'Color', COLOR_NAMES, 'white'), range('peak', 'Strength', 0.05, 1, 0.05, 0.7), range('ms', 'Fade (ms)', 100, 2000, 20, 420), range('hold', 'Hold (ms)', 0, 2500, 50, 0)] },
  glow: { label: 'Glow from below', params: [] },
  stamp: {
    label: 'Sticker',
    params: [text('text', 'Text', 'Nice!'), choice('color', 'Color', COLOR_NAMES, 'ink'), bool('round', 'Circle', false), range('tilt', 'Tilt', -20, 20, 1, -4), range('ms', 'Stays (ms)', 300, 3000, 20, 1100), range('y', 'Down', 0, 1, 0.01, 0.44)],
  },
  confetti: { label: 'Confetti', params: [range('amount', 'Amount', 0.2, 2, 0.1, 1)] },
  fireworks: { label: 'Fireworks', params: [range('count', 'Rockets', 1, 12, 1, 6)] },
  coins: { label: 'Coins', params: [range('count', 'Coins', 5, 90, 1, 34)] },
  suits: { label: 'Suit rain', params: [range('count', 'Suits', 5, 90, 1, 40)] },
  ash: { label: 'Falling scraps', params: [range('count', 'Scraps', 5, 80, 1, 26)] },
  score: { label: 'Score pop', params: [range('n', 'Points', 1, 100, 1, 3)] },
  curtain: { label: 'Card curtain', params: [] },
};

/** A new layer of a type, with that type's default settings. */
export const makeLayer = (type, over = {}) => ({
  type,
  delay: 0,
  ...Object.fromEntries(MODULES[type].params.map((p) => [p.key, p.def])),
  ...over,
});

const L = makeLayer;

/** group: 'game' = the games trigger it themselves; 'moment' = bigger moments nothing triggers yet; 'reaction' = for one game or another, not wired in yet. */
export const DEFAULTS = [
  { id: 'sparks', name: 'Sparks', group: 'game', layers: [L('burst')] },
  { id: 'big-burst', name: 'Big burst', group: 'game', layers: [L('burst', { count: 22, speed: 420, big: true }), L('shake', { px: 7 })] },
  { id: 'shake', name: 'Shake', group: 'game', layers: [L('shake')] },
  { id: 'score', name: 'Score +3', group: 'game', layers: [L('score')] },
  { id: 'turn', name: 'Your turn', group: 'game', layers: [L('glow')] },
  { id: 'confetti', name: 'Confetti', group: 'game', layers: [L('confetti')] },
  { id: 'curtain', name: 'Card curtain', group: 'game', sound: false, layers: [L('curtain')] },
  {
    id: 'countdown',
    name: 'Countdown',
    group: 'game',
    layers: [
      L('stamp', { text: '3', color: 'red', round: true, tilt: 0, ms: 760 }),
      L('stamp', { text: '2', color: 'yellow', round: true, tilt: 0, ms: 760, delay: 800 }),
      L('stamp', { text: '1', color: 'green', round: true, tilt: 0, ms: 760, delay: 1600 }),
      L('stamp', { text: 'Go!', color: 'blue', round: true, tilt: 0, ms: 700, delay: 2400 }),
    ],
  },
  {
    id: 'win',
    name: 'Win',
    group: 'moment',
    layers: [L('flash', { color: 'yellow', peak: 0.45 }), L('stamp', { text: 'You win!', color: 'yellow', ms: 1700 }), L('confetti'), L('fireworks', { count: 5, delay: 260 })],
  },
  {
    id: 'lose',
    name: 'Lose',
    group: 'moment',
    layers: [L('flash', { color: 'ink', peak: 0.5, ms: 700, hold: 900 }), L('shake', { px: 7 }), L('stamp', { text: 'You lose', tilt: 3, ms: 1700 }), L('ash')],
  },
  { id: 'fireworks', name: 'Fireworks', group: 'moment', layers: [L('fireworks')] },
  { id: 'coins', name: 'Coins', group: 'moment', layers: [L('coins')] },
  { id: 'suits', name: 'Suit rain', group: 'moment', layers: [L('suits')] },
  { id: 'flash', name: 'Flash', group: 'moment', layers: [L('flash')] },
  { id: 'combo', name: 'Combo', group: 'moment', layers: [L('stamp', { text: 'x3', color: 'blue', round: true, tilt: -10, ms: 800 }), L('burst', { count: 21, speed: 390, big: true })] },
  {
    id: 'rank-up',
    name: 'Rank up',
    group: 'moment',
    layers: [
      L('rings'),
      L('stamp', { text: '2', round: true, tilt: 0, ms: 1500 }),
      L('stamp', { text: 'Rank up', color: 'yellow', ms: 1380, y: 0.6, delay: 120 }),
      L('burst', { count: 26, speed: 460, big: true, delay: 200 }),
    ],
  },
  // Reactions in one game or another. `sound` names the sound to play when it
  // isn't the one with the effect's own id (false: silent).
  { id: 'stress', name: 'Stress!', group: 'reaction', sound: 'big-burst', layers: [L('flash', { color: 'red', peak: 0.4, ms: 320 }), L('shake', { px: 9 }), L('stamp', { text: 'Stress!', color: 'red', ms: 900 })] },
  { id: 'war', name: 'War!', group: 'reaction', layers: [L('flash', { peak: 0.5, ms: 300 }), L('shake', { px: 8 }), L('stamp', { text: 'War!', color: 'red', tilt: -6, ms: 900 })] },
  { id: 'slap', name: 'Slap', group: 'reaction', layers: [L('flash', { color: 'yellow', peak: 0.45, ms: 260 }), L('burst', { count: 18, speed: 420, big: true })] },
  { id: 'sweep', name: 'Sweep', group: 'reaction', layers: [L('flash', { color: 'blue', peak: 0.3, ms: 360 }), L('stamp', { text: 'Sweep!', color: 'blue', ms: 900 })] },
  { id: 'burn', name: 'Burn', group: 'reaction', layers: [L('flash', { color: 'yellow', peak: 0.5, ms: 500 }), L('burst', { count: 24, speed: 420, big: true }), L('ash', { count: 18, delay: 80 })] },
  { id: 'go-fish', name: 'Go fish!', group: 'reaction', sound: 'splash', layers: [L('rings'), L('stamp', { text: 'Go fish!', color: 'blue', tilt: -6, ms: 1000 })] },
  { id: 'meld', name: 'Meld', group: 'reaction', layers: [L('burst', { count: 8, speed: 200 })] },
  { id: 'knock', name: 'Knock', group: 'reaction', layers: [L('shake', { px: 3 }), L('stamp', { text: 'Knock', tilt: 0, ms: 800 })] },
  { id: 'gin', name: 'Gin!', group: 'reaction', sound: 'rank-up', layers: [L('flash', { color: 'green', peak: 0.3 }), L('stamp', { text: 'Gin!', color: 'green', ms: 1200 }), L('confetti', { amount: 0.5 })] },
  { id: 'undercut', name: 'Undercut', group: 'reaction', sound: 'error', layers: [L('shake', { px: 5 }), L('stamp', { text: 'Undercut', color: 'red', tilt: 4, ms: 1100 })] },
  { id: 'last-card', name: 'Last card', group: 'reaction', sound: 'alert', layers: [L('rings', { count: 1 }), L('stamp', { text: 'Last card', color: 'yellow', ms: 900 })] },
  { id: 'suit-change', name: 'Suit change', group: 'reaction', sound: 'toast', layers: [L('rings', { count: 2 }), L('stamp', { text: '♠', round: true, tilt: 0, ms: 800 })] },
  { id: 'tie', name: 'Tie', group: 'reaction', layers: [L('stamp', { text: 'Tie', tilt: 0, ms: 1300 })] },
  { id: 'low-cards', name: 'Low on cards', group: 'reaction', sound: 'pulse', layers: [L('flash', { color: 'red', peak: 0.15, ms: 400 }), L('flash', { color: 'red', peak: 0.15, ms: 400, delay: 180 })] },
  { id: 'hint', name: 'Idle hint', group: 'reaction', sound: false, layers: [L('rings', { count: 1 })] },
];

const clone = (v) => JSON.parse(JSON.stringify(v));

export const PRESETS_FILE = 'src/fx-presets.json';
export const PRESETS_LOCAL_KEY = 'thedeck.fx-presets';

/**
 * The effects to use: the saved file over the defaults. Effects the board could
 * not write to the file (no dev server to take them) are kept in this browser,
 * and those win; `local` says whether that happened.
 */
export async function loadPresets() {
  let saved = null;
  let local = false;
  try {
    const res = await fetch(PRESETS_FILE, { cache: 'no-store' });
    if (res.ok) saved = await res.json();
  } catch {
    // No file: the defaults it is.
  }
  try {
    const kept = JSON.parse(localStorage.getItem(PRESETS_LOCAL_KEY) ?? 'null');
    if (kept) {
      saved = kept;
      local = true;
    }
  } catch {
    // Unreadable: ignore it.
  }
  return { presets: mergePresets(saved), local };
}

/** Makes whatever was saved safe to run: known layer types only, every setting present. */
function cleanLayers(layers) {
  if (!Array.isArray(layers)) return [];
  return layers
    .filter((l) => l && MODULES[l.type])
    .map((l) => ({ ...makeLayer(l.type), ...Object.fromEntries(Object.entries(l).filter(([k]) => k === 'delay' || MODULES[l.type].params.some((p) => p.key === k))) }));
}

/** The saved effects (if any) over the defaults: saved ones win, missing defaults are added back. */
export function mergePresets(saved) {
  const out = [];
  const seen = new Set();
  for (const p of Array.isArray(saved) ? saved : []) {
    if (!p || typeof p.id !== 'string' || seen.has(p.id)) continue;
    seen.add(p.id);
    const def = DEFAULTS.find((d) => d.id === p.id);
    out.push({ id: p.id, name: String(p.name ?? def?.name ?? 'Effect'), group: def?.group ?? 'custom', ...(def?.sound !== undefined && { sound: def.sound }), layers: cleanLayers(p.layers) });
  }
  for (const d of DEFAULTS) if (!seen.has(d.id)) out.push(clone(d));
  // Keep the shipped order: game effects, moments, reactions, then your own.
  const rank = { game: 0, moment: 1, reaction: 2, custom: 3 };
  return out.sort((a, b) => rank[a.group] - rank[b.group] || DEFAULTS.findIndex((d) => d.id === a.id) - DEFAULTS.findIndex((d) => d.id === b.id));
}
