// Sound effects for the game: one call, `sfx(id)`, plays a sound from the bank
// (sounds/library.js, all made on the synth in sounds/synth.js).
//
// - Sound can be switched off (the devboard bar, and Settings in the lobby);
//   the choice lives in localStorage ('thedeck.sound').
// - The same sound asked for again within a few ms is dropped, so a deal of 52
//   cards or a burst of flips doesn't turn into a wall of noise.
// - Nothing plays before the first tap or key press: browsers keep audio
//   locked until then.
// - The devboard's embedded table (an iframe) hands its sounds to the page
//   around it, which has the user's gestures and the one audio context.
// installUiSounds() adds taps and buttons for everything on the phone screen.
import { SOUNDS } from './sounds/library.js';
import { playSound } from './sounds/synth.js';

const KEY = 'thedeck.sound';
const BY_ID = new Map(SOUNDS.map((s) => [s.id, s]));
// Minimum ms between two plays of the same sound.
const GAP = { peek: 45, deal: 45, play: 60, flip: 50, land: 70, select: 60, tap: 40, score: 90, tick: 35, foundation: 40, 'play-them': 60 };
const last = new Map();
const embedded = window.parent !== window && new URLSearchParams(location.search).has('embed');

let on = true;
try {
  on = localStorage.getItem(KEY) !== 'off';
} catch {}

export const soundOn = () => on;

export function setSoundOn(v) {
  on = !!v;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
  window.dispatchEvent(new CustomEvent('soundchange', { detail: on }));
}

// Other documents (the embedded table, a second window) follow the switch.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) on = e.newValue !== 'off';
});

/** `arg` goes to the sound's make(): the step for 'tick' and 'foundation'. */
export function sfx(id, arg) {
  if (embedded) {
    if (!window.lab?.sfxLive) return; // quiet while the table deals and settles (main.js)
    try {
      window.parent.lab?.sfx?.(id, arg);
    } catch {}
    return;
  }
  if (!on) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // audio is still locked
  const sound = BY_ID.get(id);
  if (!sound) return;
  const now = performance.now();
  if (now - (last.get(id) ?? -1e9) < (GAP[id] ?? 30)) return;
  last.set(id, now);
  try {
    playSound(arg === undefined ? sound : { ...sound, make: () => sound.make(arg) });
  } catch (err) {
    console.warn('sfx', id, err);
  }
}

/**
 * Taps and buttons anywhere on the phone screen. The first matching rule wins;
 * places with a sound of their own (the Play bar, the carousel, the game menu,
 * Single / Multi) are skipped here and play it where they happen.
 */
const RULES = [
  ['.gs-play, .gs-playbar, .gs-toggle:not(.gs-opts) .gs-toggle-btn, .gm-more, .gm-scrim, .lobby-item, .gs-sheet-actions .accent', null],
  ['.gs-opts .gs-toggle-btn', 'toggle-on'],
  ['.gs-gear, .gs-you', 'sheet-open'],
  ['.gm-exit, .lobby-icon-btn, #lab-back, [aria-label="Back"]', 'back'],
  ['.game-btn', 'button'],
  ['button, a, [role="button"]', 'tap'],
];

export function installUiSounds(screen) {
  screen.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted || !(e.target instanceof Element)) return; // only real taps make a sound, not clicks made in code
      for (const [sel, id] of RULES) {
        const hit = e.target.closest(sel);
        if (!hit || !screen.contains(hit)) continue;
        if (id) sfx(id);
        return;
      }
    },
    true,
  );
}
