// Reduced motion, with a devboard override.
//
// Every animation that respects the system's "Reduce motion" setting asks
// `reducedMotion.matches` instead of the media query directly. It behaves like
// a MediaQueryList (matches + 'change' events), but the devboard can turn the
// override on ("Full motion"), so animations can be looked at without
// changing the system settings.
//
// The choice lives in localStorage ('thedeck.motion': 'full' or 'system').
// When nothing is saved, the devboard on desktop (and its embedded table)
// plays everything; a real phone follows the system.
// style.css skips its reduced-motion rules under <html data-motion="full">.
import { detectMode, EMBED } from './device.js';

const KEY = 'thedeck.motion';
const query = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
const realPhone = detectMode() === 'phone' && !EMBED;
const listeners = new Set();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'full' || v === 'system') return v === 'full';
  } catch {}
  return !realPhone;
}

let full = read();
const apply = () => {
  document.documentElement.dataset.motion = full ? 'full' : 'system';
};
apply();

export const reducedMotion = {
  get matches() {
    return !full && !!query?.matches;
  },
  addEventListener(type, fn) {
    if (type === 'change') listeners.add(fn);
  },
  removeEventListener(type, fn) {
    listeners.delete(fn);
  },
};

const notify = () => {
  const event = { matches: reducedMotion.matches };
  for (const fn of listeners) fn(event);
};
query?.addEventListener?.('change', notify);

/** Is the override on (animations play whatever the system says)? */
export const fullMotion = () => full;

export function setFullMotion(on) {
  full = !!on;
  try {
    localStorage.setItem(KEY, full ? 'full' : 'system');
  } catch {}
  apply();
  notify();
}

// The devboard's embedded table (another document) follows the switch.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  full = read();
  apply();
  notify();
});
