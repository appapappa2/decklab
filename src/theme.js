// Backdrop themes and the four-color palette.
//
// Everything on screen is drawn in red, green, blue and yellow on a neutral
// base. The backdrop decides what that base is:
//   paper  warm off-white, ink text
//   color  the selected game's own color, edge to edge
//   ink    near-black, paper text
// The theme lives on <html data-theme>, the current game's color pair on
// #screen (data-c / data-p); style.css derives every other token from those.
export const THEMES = ['paper', 'color', 'ink'];

const KEY = 'thedeck.theme';
const HEX = { red: '#F0442E', yellow: '#FFC42E', green: '#149A6A', blue: '#2B62F0', ink: '#17140F', paper: '#F5EFE3' };
let gameColor = 'green';

export function getTheme() {
  const t = document.documentElement.dataset.theme;
  return THEMES.includes(t) ? t : 'paper';
}

/** Keeps the browser chrome (iOS status bar area, Android toolbar) in step with the backdrop. */
function syncMeta() {
  const t = getTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'color' ? HEX[gameColor] : HEX[t];
}

export function setTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'paper';
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode */
  }
  syncMeta();
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}

export function cycleTheme() {
  setTheme(THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length]);
}

/** The selected (or running) game's color and its partner color. */
export function setScreenColor(color, pop) {
  const screen = document.getElementById('screen');
  if (!screen || !color) return;
  screen.dataset.c = color;
  screen.dataset.p = pop;
  gameColor = color;
  syncMeta();
}

let saved = null;
try {
  saved = localStorage.getItem(KEY);
} catch {
  /* private mode */
}
document.documentElement.dataset.theme = THEMES.includes(saved) ? saved : getTheme();
syncMeta();
