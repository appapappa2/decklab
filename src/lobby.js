// Lobby UI and hash routing.
//   #/              lobby (game carousel; per-game single/multi toggle; backdrop switch)
//   #/dev           dev menu
//   #/dev/hand-feel hand feel prototype (the lab)
//   #/play/<game>   a game from GAMES that's ready in some mode
import { GAMES, DEV_ITEMS } from './games.js?v=fourcolor';
import { coverHTML } from './covers.js?v=fourcolor';
import { SUIT_ART } from './cards.js?v=fourcolor';
import { Spring } from './spring.js';
import { THEMES, getTheme, setTheme, cycleTheme, setScreenColor } from './theme.js';
import { createProfile } from './profile.js?v=fourcolor';
import { sfx, soundOn, setSoundOn } from './sfx.js';

const INDEX_KEY = 'thedeck.lobby.game';
const modeKey = (id) => `thedeck.lobby.mode.${id}`;

/**
 * The lobby backdrop: one big wheel of suits. Rings of spade, heart, club,
 * diamond (in that order, over and over) around a common center, every suit
 * standing on its ring like a seat on a Ferris wheel. CSS turns it slowly;
 * the carousel nudges it a notch per game (layoutItems).
 */
const WHEEL = 1360; // px, wider than any phone's diagonal
function wheelSVG() {
  const order = ['S', 'H', 'C', 'D'];
  const c = WHEEL / 2;
  const size = 30;
  let out = '';
  for (let k = 0, r = 132; r < c - size; k++, r += 78) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 80 / 4) * 4); // a multiple of four, so the cycle closes
    for (let i = 0; i < n; i++) {
      const a = (360 * (i + (k % 2) / 2)) / n;
      const id = order[(i + k) % 4];
      out += `<path class="w-${id}" transform="rotate(${a.toFixed(2)} ${c} ${c}) translate(${c - size / 2} ${c - r - size / 2}) scale(${size / 100})" d="${SUIT_ART[id].shape}"/>`;
    }
  }
  return `<svg viewBox="0 0 ${WHEEL} ${WHEEL}" width="${WHEEL}" height="${WHEEL}" aria-hidden="true" focusable="false">${out}</svg>`;
}
// Eight teeth and a round hole, generated rather than traced, filled even-odd so the hole stays open.
const GEAR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" d="M10.02 4.87L10.49 1.91L13.51 1.91L13.98 4.87L15.64 5.56L18.07 3.80L20.20 5.93L18.44 8.36L19.13 10.02L22.09 10.49L22.09 13.51L19.13 13.98L18.44 15.64L20.20 18.07L18.07 20.20L15.64 18.44L13.98 19.13L13.51 22.09L10.49 22.09L10.02 19.13L8.36 18.44L5.93 20.20L3.80 18.07L5.56 15.64L4.87 13.98L1.91 13.51L1.91 10.49L4.87 10.02L5.56 8.36L3.80 5.93L5.93 3.80L8.36 5.56ZM12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8Z"/></svg>';
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
  // A game route, optionally followed by /multi.
  const multi = path.endsWith('/multi');
  const base = multi ? path.slice(0, -'/multi'.length) : path;
  const game = GAMES.find((g) => g.ready?.length && g.route?.replace(/^#\//, '') === base);
  if (game && (!multi || game.ready.includes('multi'))) return { view: 'game', id: game.id, mode: multi ? 'multi' : 'single' };
  return { view: 'lobby' };
}

export function initLobby(root, { onRoute, haptic = () => {}, settings = null, saveSettings = () => {} }) {
  let pendingZoom = null; // screen rect of the cover a game was opened from
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

  // Backdrop switch (paper / ink). It sits in the bar under the device
  // frame, next to Rotate, so the phone screen itself stays clean.
  const bar = document.getElementById('device-bar');
  if (bar && !bar.querySelector('.theme-switch')) {
    const themes = h('div', 'theme-switch');
    themes.setAttribute('role', 'radiogroup');
    themes.setAttribute('aria-label', 'Backdrop');
    for (const t of THEMES) {
      const b = h('button', `theme-swatch theme-swatch-${t}`);
      b.type = 'button';
      b.dataset.theme = t;
      b.title = `${t[0].toUpperCase()}${t.slice(1)} backdrop (T)`;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `${t[0].toUpperCase()}${t.slice(1)} backdrop`);
      b.setAttribute('aria-checked', String(getTheme() === t));
      b.addEventListener('click', () => setTheme(t));
      themes.append(b);
    }
    bar.querySelector('#rotate')?.after(themes);
    if (!themes.isConnected) bar.prepend(themes);
  }

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

  // ---------------------------------------------------------- game carousel
  //
  // A coverflow: the selected cover sits in the middle, its neighbors tilt
  // away in 3D. `pos` is a spring over the (fractional) index, so swipes,
  // the wheel, arrow keys and taps all just move its target.

  const carousel = {
    pos: new Spring(0, 0.001),
    items: [],
    games: [],
    index: -1,
    drag: null,
    raf: 0,
    last: 0,
    wheelAcc: 0,
    wheelAt: 0,
  };
  // Each game remembers whether you last picked single or multiplayer for it.
  const modeOf = (g) => {
    const saved = localStorage.getItem(modeKey(g.id));
    return g.modes.includes(saved) ? saved : g.modes.includes('single') ? 'single' : g.modes[0];
  };
  const isReady = (g) => !!g.ready?.includes(modeOf(g)) && !!g.route;
  const playersText = (g) =>
    g.cpu && modeOf(g) === 'single'
      ? (typeof g.cpu === 'string' ? g.cpu : 'vs CPU')
      : (modeOf(g) === 'multi' && g.multiNote) || `${g.players} ${g.players === '1' ? 'player' : 'players'}`;

  function renderLobby() {
    const view = h('section', 'lobby-view gs');
    const c = carousel;

    // The game's name, centered in the space above the card.
    const top = h('div', 'gs-top');
    const title = h('h1', 'gs-title');
    top.append(title);

    const backdrop = h('div', 'gs-backdrop');
    const wheel = h('div', 'gs-wheel');
    wheel.innerHTML = wheelSVG();
    backdrop.append(wheel);
    const stage = h('div', 'gs-stage');
    c.games = GAMES;
    c.items = c.games.map((g, i) => {
      const el = h('button', `gs-item${isReady(g) ? '' : ' soon'}`);
      el.type = 'button';
      el.setAttribute('aria-label', g.name);
      el.innerHTML = coverHTML(g, i);
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (c.drag?.moved) return;
        if (i === c.index) openGame();
        else goTo(i);
      });
      stage.append(el);
      return el;
    });

    // Players and tagline under the card, then one big Play bar at the bottom
    // with the Single / Multi switch built into it.
    const info = h('div', 'gs-info');
    const sub = h('div', 'gs-sub');
    const meta = h('div', 'gs-meta');
    const actions = h('div', 'gs-playbar');
    // Single / Multi, only for games that have both.
    const toggle = h('div', 'gs-toggle');
    toggle.setAttribute('role', 'radiogroup');
    toggle.setAttribute('aria-label', 'Players');
    for (const [key, label] of [['single', 'Single'], ['multi', 'Multi']]) {
      const b = h('button', 'gs-toggle-btn', label);
      b.type = 'button';
      b.dataset.mode = key;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => setMode(key));
      toggle.append(b);
    }
    const play = h('button', 'gs-play', 'Play');
    play.type = 'button';
    play.addEventListener('click', () => {
      if (!c.drag?.moved) openGame();
    });
    actions.append(play, toggle);
    info.append(sub, meta, actions);
    c.ui = { view, top, info, wheel, stage, title, sub, meta, toggle, play, playbar: actions };

    const dots = h('div', 'gs-dots');
    c.games.forEach((_, i) => {
      const d = h('button', 'gs-dot');
      d.type = 'button';
      d.setAttribute('aria-label', `Game ${i + 1}`);
      d.addEventListener('click', () => goTo(i));
      dots.append(d);
    });
    c.ui.dots = dots;

    // Top left: your avatar with its rank badge; it opens your profile (profile.js).
    // Top right: a round settings button, and the sheet it opens.
    const profile = createProfile({ total: c.games.length, haptic });
    c.ui.profile = profile;
    const you = profile.button;
    const gear = h('button', 'gs-gear');
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Settings');
    gear.innerHTML = GEAR;
    gear.addEventListener('click', () => {
      haptic(8);
      toggleSettings(true);
    });
    const sheet = renderSettings();
    c.ui.sheet = sheet;

    // Between the blocks sit flexible gaps (the dot strip is one of them), so
    // the air above the name, around the card and under it stays in proportion.
    view.append(backdrop, top, dots, stage, h('div', 'gs-gap'), info, you, gear, sheet, profile.sheet);

    // Start on the game picked last time.
    const savedId = localStorage.getItem(INDEX_KEY);
    const start = Math.max(0, c.games.findIndex((g) => g.id === savedId));
    c.pos.set(start);
    c.index = -1;
    c.ready = false;
    bindStage(view, stage);
    return view;
  }

  /** The settings sheet: backdrop, haptics, and the way into the dev menu. */
  function renderSettings() {
    const wrap = h('div', 'gs-sheet-wrap');
    const card = h('div', 'gs-sheet');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Settings');
    card.append(h('div', 'gs-sheet-title', 'Settings'));
    const row = (label, options, current, pick) => {
      const r = h('div', 'gs-sheet-row');
      const opts = h('div', 'gs-toggle gs-opts');
      opts.style.setProperty('--n', String(options.length));
      opts.setAttribute('role', 'radiogroup');
      opts.setAttribute('aria-label', label);
      for (const [value, text] of options) {
        const b = h('button', 'gs-toggle-btn', text);
        b.type = 'button';
        b.dataset.value = value;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(value === current()));
        b.addEventListener('click', () => {
          pick(value);
          haptic(8);
          for (const o of opts.children) o.setAttribute('aria-checked', String(o.dataset.value === current()));
        });
        opts.append(b);
      }
      r.append(h('div', 'gs-sheet-label', label), opts);
      return r;
    };
    const themeRow = row('Backdrop', THEMES.map((t) => [t, `${t[0].toUpperCase()}${t.slice(1)}`]), getTheme, setTheme);
    themeRow.classList.add('gs-theme-row');
    card.append(themeRow);
    card.append(
      Object.assign(row('Sound', [['on', 'On'], ['off', 'Off']], () => (soundOn() ? 'on' : 'off'), (v) => setSoundOn(v === 'on')), { className: 'gs-sheet-row gs-sound-row' }),
    );
    if (settings) {
      card.append(
        row('Haptics', [['on', 'On'], ['off', 'Off']], () => (settings.haptics ? 'on' : 'off'), (v) => {
          settings.haptics = v === 'on';
          saveSettings();
        }),
      );
    }
    const actions = h('div', 'gs-sheet-actions');
    const dev = h('a', 'game-btn', 'Dev menu');
    dev.href = '#/dev';
    const done = h('button', 'game-btn accent', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => toggleSettings(false));
    actions.append(dev, done);
    card.append(actions);
    wrap.append(card);
    // A tap outside the card closes it.
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) toggleSettings(false);
    });
    return wrap;
  }

  function toggleSettings(open) {
    const sheet = carousel.ui?.sheet;
    if (sheet && sheet.classList.contains('show') !== !!open) sfx(open ? 'sheet-open' : 'sheet-close');
    sheet?.classList.toggle('show', open);
  }
  const settingsOpen = () => !!carousel.ui?.sheet?.classList.contains('show') || !!carousel.ui?.profile?.isOpen();

  function goTo(i) {
    const c = carousel;
    const n = c.games.length;
    if (!n) return;
    c.pos.t = Math.max(0, Math.min(n - 1, Math.round(i)));
    startLoop();
  }

  /** One game left or right of where the carousel is heading (so quick presses add up). */
  function step(d) {
    sfx('swipe');
    goTo(Math.round(carousel.pos.t) + d);
  }

  function openGame() {
    const g = carousel.games[carousel.index];
    if (!g) return;
    if (isReady(g)) {
      sfx('play-game');
      haptic(12);
      // Tell the router where the cover is, so the game can zoom out of it.
      const cover = carousel.items[carousel.index]?.querySelector('.cv');
      pendingZoom = cover ? cover.getBoundingClientRect() : null;
      location.hash = modeOf(g) === 'multi' ? `${g.route}/multi` : g.route;
    } else {
      sfx('error');
      haptic([10, 40, 10]);
      nudge(carousel.ui.playbar);
      showToast(`${g.name} ${modeOf(g) === 'multi' ? 'multiplayer ' : ''}is coming soon`);
    }
  }

  /** A short "no" shake. */
  function nudge(el) {
    if (!el) return;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
  }

  function select(i) {
    const c = carousel;
    if (i === c.index) return;
    c.index = i;
    const g = c.games[i];
    if (!g) return;
    localStorage.setItem(INDEX_KEY, g.id);
    const { title, sub, meta, dots } = c.ui;
    setScreenColor(g.color, g.pop);
    if (c.ready) {
      haptic(6); // a detent for every game that passes the middle
      sfx('land');
    }
    c.ready = true;
    title.textContent = g.name;
    title.style.setProperty('--len', String(Math.max(9, g.name.length)));
    meta.textContent = g.tag ?? g.blurb;
    updateMode(g);
    for (const el of [title, sub, meta]) {
      el.classList.remove('swap');
      void el.offsetWidth;
      el.classList.add('swap');
    }
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    c.items.forEach((el, k) => {
      el.setAttribute('aria-current', String(k === i));
      el.classList.toggle('on', k === i); // the cover's cards hop when it lands in the middle
    });
  }

  /** Switches the selected game between single and multiplayer. */
  function setMode(key) {
    const g = carousel.games[carousel.index];
    if (!g || !g.modes.includes(key) || modeOf(g) === key) return;
    localStorage.setItem(modeKey(g.id), key);
    sfx(key === 'multi' ? 'toggle-on' : 'toggle-off');
    haptic(8);
    updateMode(g);
    const { sub } = carousel.ui;
    sub.classList.remove('swap');
    void sub.offsetWidth;
    sub.classList.add('swap');
  }

  /** Text, toggle and SOON state for the selected game's current mode. */
  function updateMode(g) {
    const c = carousel;
    const { sub, toggle, play, playbar } = c.ui;
    const ready = isReady(g);
    const mode = modeOf(g);
    const el = c.items[c.games.indexOf(g)];
    el?.classList.toggle('soon', !ready);
    el?.setAttribute('aria-label', ready ? `Play ${g.name}` : `${g.name}, coming soon`);
    sub.textContent = ready ? playersText(g) : `${playersText(g)} · coming soon`;
    play.textContent = ready ? 'Play' : 'Soon';
    playbar.classList.toggle('soon', !ready);
    play.setAttribute('aria-label', ready ? `Play ${g.name}` : `${g.name}, coming soon`);
    const both = g.modes.length > 1;
    toggle.hidden = !both;
    toggle.dataset.mode = mode;
    for (const b of toggle.children) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  }

  function bindStage(area, stage) {
    const c = carousel;
    const spacing = () => stage.clientWidth * 0.62;
    area.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest('.gs-toggle, .gs-dots, .gs-gear, .gs-you, .gs-sheet-wrap')) return;
      c.drag = { id: e.pointerId, x: e.clientX, start: c.pos.v, moved: false, samples: [[performance.now(), e.clientX]] };
    });
    area.addEventListener('pointermove', (e) => {
      const d = c.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 6) {
        d.moved = true;
        try {
          area.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic */
        }
      }
      if (!d.moved) return;
      const n = c.games.length;
      let p = d.start - dx / (spacing() * scaleOf(stage));
      if (p < 0) p *= 0.35; // rubber band past the ends
      if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.35;
      c.pos.set(p);
      d.samples.push([performance.now(), e.clientX]);
      if (d.samples.length > 6) d.samples.shift();
      startLoop();
    });
    const end = (e) => {
      const d = c.drag;
      if (!d || e.pointerId !== d.id) return;
      if (d.moved) {
        const [t0, x0] = d.samples[0];
        const [t1, x1] = d.samples[d.samples.length - 1];
        const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0; // px/ms
        const flick = Math.abs(v) > 0.4 ? -Math.sign(v) * 0.6 : 0;
        goTo(c.pos.v + flick);
        // Swallow the click that follows a drag.
        setTimeout(() => (c.drag = null), 0);
      } else c.drag = null;
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
    area.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const now = performance.now();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (now - c.wheelAt > 250) c.wheelAcc = 0;
        c.wheelAt = now;
        c.wheelAcc += delta;
        if (Math.abs(c.wheelAcc) > 40) {
          goTo(Math.round(c.pos.t) + Math.sign(c.wheelAcc));
          c.wheelAcc = -Math.sign(c.wheelAcc) * 400; // one step per gesture burst
        }
      },
      { passive: false },
    );
  }

  /** The desktop frame scales the screen; pointer deltas need un-scaling. */
  function scaleOf(el) {
    return el.getBoundingClientRect().width / el.offsetWidth || 1;
  }

  function layoutItems() {
    const c = carousel;
    const stage = c.ui?.stage;
    if (!stage || !stage.isConnected) return;
    const W = stage.clientWidth;
    // Covers are playing-card shaped (5:7); `size` is the width. The stage is
    // exactly as tall as the card (1.4 covers), so the card is sized from what
    // the name and the Play bar leave over, keeping at least 24px per gap.
    const { view, top, info } = c.ui;
    const cs = getComputedStyle(view);
    const free = view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - top.offsetHeight - info.offsetHeight - 84;
    const size = Math.max(90, Math.min(W * 0.64, free / 1.4, 250));
    stage.style.setProperty('--cover', `${size}px`);
    // The wheel is centered on the card and turns a notch for every game scrolled past.
    c.ui.wheel.style.top = `${stage.offsetTop + (size * 1.4) / 2}px`;
    c.ui.wheel.style.rotate = `${(-c.pos.v * 11.25).toFixed(2)}deg`;
    const p = c.pos.v;
    c.items.forEach((el, i) => {
      const d = i - p;
      const a = Math.abs(d);
      const sgn = Math.sign(d);
      // Neighbors sit mostly off to the side; further ones bunch up behind them.
      const x = sgn * (a <= 1 ? a * size * 0.86 : size * 0.86 + (a - 1) * size * 0.32);
      // Like a record crate: outer edges swing toward you, with a little roll.
      const ry = Math.max(-1, Math.min(1, d)) * 34;
      const rz = Math.max(-1, Math.min(1, d)) * 7;
      const sc = 1 - Math.min(a, 2) * 0.17;
      const y = Math.min(a, 1.5) * size * 0.04;
      el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${(-a * 120).toFixed(0)}px) rotateY(${ry.toFixed(2)}deg) rotate(${rz.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      el.style.zIndex = String(100 - Math.round(a * 10));
      el.style.opacity = String(Math.max(0, Math.min(1, 2.6 - a)));
      el.tabIndex = a < 0.5 ? 0 : -1;
    });
    // The dot strip under the name is only there while the carousel is moving.
    c.ui.view.classList.toggle('scrolling', !!c.drag?.moved || Math.abs(c.pos.t - p) > 0.04);
    select(Math.max(0, Math.min(c.games.length - 1, Math.round(p))));
  }

  function startLoop() {
    const c = carousel;
    if (c.raf) return;
    c.last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - c.last) / 1000);
      c.last = now;
      const moving = c.drag?.moved ? true : c.pos.step(dt, 170, 0.86);
      layoutItems();
      if (moving || c.drag?.moved) c.raf = requestAnimationFrame(tick);
      else c.raf = 0;
    };
    c.raf = requestAnimationFrame(tick);
  }

  // Arrow keys and Enter, while the carousel is showing.
  window.addEventListener('keydown', (e) => {
    if (route.view !== 'lobby' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (settingsOpen()) {
      if (e.key === 'Escape') {
        toggleSettings(false);
        carousel.ui?.profile?.open(false);
      }
      return;
    }
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Enter' && !(e.target instanceof Element && e.target.closest('button, a'))) openGame();
    else if (e.key.toLowerCase() === 't') cycleTheme();
    else return;
    e.preventDefault();
  });
  // The sound switch follows the devboard's.
  window.addEventListener('soundchange', () => {
    for (const b of root.querySelectorAll('.gs-sound-row .gs-toggle-btn')) b.setAttribute('aria-checked', String(b.dataset.value === (soundOn() ? 'on' : 'off')));
  });
  // The backdrop switch follows the theme, wherever it was changed from.
  window.addEventListener('themechange', () => {
    for (const b of document.querySelectorAll('.theme-swatch')) b.setAttribute('aria-checked', String(b.dataset.theme === getTheme()));
    for (const b of root.querySelectorAll('.gs-theme-row .gs-toggle-btn')) b.setAttribute('aria-checked', String(b.dataset.value === getTheme()));
  });
  // The stage size depends on the screen; re-lay out when it changes.
  new ResizeObserver(() => {
    if (route.view === 'lobby') layoutItems();
  }).observe(root);

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
    const lobby = route.view !== 'dev';
    root.classList.toggle('carousel', lobby);
    root.replaceChildren(lobby ? renderLobby() : renderDev());
    root.scrollTop = 0;
    if (lobby) requestAnimationFrame(layoutItems);
  }

  function apply() {
    route = parseRoute();
    if (route.view === 'lobby' || route.view === 'dev') render();
    const zoom = route.view === 'game' ? pendingZoom : null;
    pendingZoom = null;
    onRoute(route, { zoomFrom: zoom });
  }

  window.addEventListener('hashchange', apply);
  apply();
  /**
   * Screen rect of a game's card, with that game brought to the center at
   * once (for zooming back out of a game). Null if it isn't in this list.
   */
  function coverRect(id) {
    const c = carousel;
    const i = c.games.findIndex((g) => g.id === id);
    if (i < 0 || route.view !== 'lobby') return null;
    c.pos.set(i);
    layoutItems();
    return c.items[i].querySelector('.cv').getBoundingClientRect();
  }

  return {
    get route() {
      return route;
    },
    coverRect,
  };
}
