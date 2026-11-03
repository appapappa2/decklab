// Lobby UI and hash routing.
//   #/              lobby (mode toggle + game list)
//   #/dev           dev menu
//   #/dev/hand-feel hand feel prototype (the lab)
//   #/play/<game>   a game from GAMES that's ready in some mode
import { GAMES, DEV_ITEMS } from './games.js';

const MODE_KEY = 'thedeck.lobby.mode';
const MODES = [
  ['single', 'Singleplayer'],
  ['multi', 'Multiplayer'],
];

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

export function parseRoute(hash = location.hash) {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  if (path === 'dev') return { view: 'dev' };
  const item = DEV_ITEMS.find((d) => d.route.replace(/^#\//, '') === path);
  if (item) return { view: 'lab', id: item.id };
  const game = GAMES.find((g) => g.ready?.length && g.route?.replace(/^#\//, '') === path);
  if (game) return { view: 'game', id: game.id };
  return { view: 'lobby' };
}

export function initLobby(root, { onRoute }) {
  let mode = localStorage.getItem(MODE_KEY) === 'multi' ? 'multi' : 'single';
  let toastTimer = 0;

  // Keep lobby pointer/touch/wheel events away from the game's input handler
  // on #screen (which would start gestures and block scrolling on iOS).
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'wheel', 'contextmenu']) {
    root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }

  const toast = h('div', 'lobby-toast');
  toast.setAttribute('role', 'status');
  root.after(toast); // outside the scroll container so it doesn't scroll away
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  };

  const header = (title, sub, { back, dev } = {}) => {
    const el = h('header', 'lobby-header');
    if (back) {
      const b = h('a', 'lobby-icon-btn', '‹');
      b.href = back;
      b.setAttribute('aria-label', 'Back');
      el.append(b);
    }
    const t = h('div', 'lobby-titles');
    t.append(h('h1', 'lobby-title', title));
    if (sub) t.append(h('div', 'lobby-sub', sub));
    el.append(t);
    if (dev) {
      const d = h('a', 'lobby-dev-btn', 'Dev');
      d.href = '#/dev';
      el.append(d);
    }
    return el;
  };

  function renderLobby() {
    const view = h('section', 'lobby-view');
    view.append(header('The Deck', 'Choose how you want to play', { dev: true }));

    const seg = h('div', 'lobby-seg');
    seg.setAttribute('role', 'tablist');
    for (const [key, label] of MODES) {
      const b = h('button', 'lobby-seg-btn', label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(key === mode));
      b.addEventListener('click', () => {
        if (mode === key) return;
        mode = key;
        localStorage.setItem(MODE_KEY, mode);
        render();
      });
      seg.append(b);
    }
    view.append(seg);

    const games = GAMES.filter((g) => g.modes.includes(mode));
    view.append(h('div', 'lobby-section', `${games.length} ${games.length === 1 ? 'game' : 'games'}`));

    const list = h('ul', 'lobby-list');
    for (const g of games) {
      const li = h('li');
      const ready = !!g.ready?.includes(mode) && !!g.route;
      const b = h('button', `lobby-item${ready ? '' : ' soon'}`);
      b.type = 'button';
      const text = h('div', 'lobby-item-text');
      text.append(h('div', 'lobby-item-name', g.name), h('div', 'lobby-item-blurb', g.blurb));
      const meta = h('div', 'lobby-item-meta');
      const players = g.cpu && mode === 'single' ? 'vs CPU' : `${g.players} ${g.players === '1' ? 'player' : 'players'}`;
      meta.append(h('span', 'lobby-players', players));
      if (!ready) meta.append(h('span', 'lobby-badge', 'Soon'));
      b.append(text, meta);
      b.addEventListener('click', () => {
        if (ready) location.hash = g.route;
        else showToast(`${g.name} is coming soon`);
      });
      li.append(b);
      list.append(li);
    }
    view.append(list);
    return view;
  }

  function renderDev() {
    const view = h('section', 'lobby-view');
    view.append(header('Dev menu', 'Prototypes and test scenes', { back: '#/' }));
    const list = h('ul', 'lobby-list');
    for (const d of DEV_ITEMS) {
      const li = h('li');
      const a = h('a', 'lobby-item');
      a.href = d.route;
      const text = h('div', 'lobby-item-text');
      text.append(h('div', 'lobby-item-name', d.name), h('div', 'lobby-item-blurb', d.blurb));
      a.append(text, h('span', 'lobby-chevron', '›'));
      li.append(a);
      list.append(li);
    }
    view.append(list);
    return view;
  }

  let route = parseRoute();
  function render() {
    root.replaceChildren(route.view === 'dev' ? renderDev() : renderLobby());
    root.scrollTop = 0;
  }

  function apply() {
    route = parseRoute();
    if (route.view === 'lobby' || route.view === 'dev') render();
    onRoute(route);
  }

  window.addEventListener('hashchange', apply);
  apply();
  return {
    get route() {
      return route;
    },
  };
}
