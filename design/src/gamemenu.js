// The "…" menu in the top right corner of every game. Each scene still builds
// its own option buttons (New game, Auto-play, Draw 1/3…); this moves them out
// of the bars into one menu, together with the way back to the lobby.

import { sfx } from './sfx.js';

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
};

// Bottom-bar buttons that are moves, not options: they stay on the table.
const STAYS = (b) => b.classList.contains('accent') || /^undo$/i.test(b.textContent.trim());

const DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="19" cy="12" r="2.1"/></svg>';

export function installGameMenu(scene) {
  const top = scene.querySelector('.game-top');
  if (!top || top.querySelector('.gm-more')) return;

  const back = top.querySelector('.game-icon');
  const items = [...top.querySelectorAll('.game-btn')];
  const bottom = scene.querySelector('.game-bottom');
  if (bottom) {
    items.push(...[...bottom.querySelectorAll('.game-btn')].filter((b) => !STAYS(b)));
  }

  const more = el('button', 'game-icon gm-more', DOTS);
  more.type = 'button';
  more.setAttribute('aria-label', 'Game menu');
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');

  const scrim = el('button', 'gm-scrim');
  scrim.type = 'button';
  scrim.tabIndex = -1;
  scrim.setAttribute('aria-label', 'Close menu');

  const panel = el('div', 'gm-panel');
  panel.setAttribute('role', 'menu');
  const exit = el('button', 'game-btn gm-exit', 'Exit');
  exit.type = 'button';
  exit.addEventListener('click', () => back?.click());
  panel.append(...items, exit);
  for (const b of panel.children) b.setAttribute('role', 'menuitem');

  const set = (open) => {
    if (scene.classList.contains('gm-open') !== open) sfx(open ? 'sheet-open' : 'sheet-close');
    scene.classList.toggle('gm-open', open);
    more.setAttribute('aria-expanded', String(open));
  };
  more.addEventListener('click', () => set(!scene.classList.contains('gm-open')));
  scrim.addEventListener('click', () => set(false));
  panel.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) set(false);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && scene.classList.contains('gm-open')) set(false);
  });
  // Leaving the game (or anything else hiding the scene) closes the menu.
  addEventListener('hashchange', () => set(false));

  if (back) back.hidden = true;
  if (bottom && !bottom.querySelector('.game-btn')) bottom.hidden = true;
  top.append(more);
  scene.append(scrim, panel);
}
