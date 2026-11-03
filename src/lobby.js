// Lobby UI and hash routing.
//   #/              lobby (game carousel; per-game single/multi toggle)
//   #/dev           dev menu
//   #/dev/hand-feel hand feel prototype (the lab)
//   #/play/<game>   a game from GAMES that's ready in some mode
import { GAMES, DEV_ITEMS } from './games.js?v=speed';
import { coverHTML } from './covers.js?v=speed';
import { Spring } from './spring.js';

const INDEX_KEY = 'thedeck.lobby.game';
const modeKey = (id) => `thedeck.lobby.mode.${id}`;
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

export function initLobby(root, { onRoute }) {
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

    const head = h('header', 'gs-head');
    const logo = h('div', 'gs-logo');
    logo.innerHTML = '<span>the</span><span>deck</span>';
    head.append(logo);

    const discs = h('div', 'gs-discs');
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

    // Title, players and tagline under the card. Tapping the card plays it.
    const info = h('div', 'gs-info');
    const title = h('div', 'gs-title');
    const sub = h('div', 'gs-sub');
    const meta = h('div', 'gs-meta');
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
    info.append(title, sub, toggle, meta);
    c.ui = { view, discs, stage, title, sub, meta, toggle };

    const dots = h('div', 'gs-dots');
    c.games.forEach((_, i) => {
      const d = h('button', 'gs-dot');
      d.type = 'button';
      d.setAttribute('aria-label', `Game ${i + 1}`);
      d.addEventListener('click', () => goTo(i));
      dots.append(d);
    });
    c.ui.dots = dots;

    const dev = h('a', 'gs-dev', 'dev');
    dev.href = '#/dev';

    stage.append(info);
    view.append(discs, head, stage, dots, dev);

    // Start on the game picked last time.
    const savedId = localStorage.getItem(INDEX_KEY);
    const start = Math.max(0, c.games.findIndex((g) => g.id === savedId));
    c.pos.set(start);
    c.index = -1;
    c.discReady = false;
    bindStage(stage);
    return view;
  }

  function goTo(i) {
    const c = carousel;
    const n = c.games.length;
    if (!n) return;
    c.pos.t = Math.max(0, Math.min(n - 1, Math.round(i)));
    startLoop();
  }

  /** One game left or right of where the carousel is heading (so quick presses add up). */
  function step(d) {
    goTo(Math.round(carousel.pos.t) + d);
  }

  function openGame() {
    const g = carousel.games[carousel.index];
    if (!g) return;
    if (isReady(g)) {
      // Tell the router where the cover is, so the game can zoom out of it.
      const cover = carousel.items[carousel.index]?.querySelector('.cv');
      pendingZoom = cover ? cover.getBoundingClientRect() : null;
      location.hash = modeOf(g) === 'multi' ? `${g.route}/multi` : g.route;
    } else showToast(`${g.name} ${modeOf(g) === 'multi' ? 'multiplayer ' : ''}is coming soon`);
  }

  function select(i) {
    const c = carousel;
    if (i === c.index) return;
    c.index = i;
    const g = c.games[i];
    if (!g) return;
    localStorage.setItem(INDEX_KEY, g.id);
    const { view, title, sub, meta, dots } = c.ui;
    const [cover, bg, edge] = g.colors ?? ['#444', '#666', '#333'];
    view.style.setProperty('--gs-cover', cover);
    view.style.setProperty('--gs-edge', edge);
    pushDisc(bg, edge, c.discReady);
    c.discReady = true;
    title.textContent = `${String(i + 1).padStart(2, '0')}.${g.name}`;
    meta.textContent = g.tag ?? g.blurb;
    updateMode(g);
    for (const el of [title, sub, meta]) {
      el.classList.remove('swap');
      void el.offsetWidth;
      el.classList.add('swap');
    }
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    c.items.forEach((el, k) => el.setAttribute('aria-current', String(k === i)));
  }

  /** Switches the selected game between single and multiplayer. */
  function setMode(key) {
    const g = carousel.games[carousel.index];
    if (!g || !g.modes.includes(key) || modeOf(g) === key) return;
    localStorage.setItem(modeKey(g.id), key);
    updateMode(g);
    const { sub } = carousel.ui;
    sub.classList.remove('swap');
    void sub.offsetWidth;
    sub.classList.add('swap');
  }

  /** Text, toggle and SOON state for the selected game's current mode. */
  function updateMode(g) {
    const c = carousel;
    const { sub, toggle } = c.ui;
    const ready = isReady(g);
    const mode = modeOf(g);
    const el = c.items[c.games.indexOf(g)];
    el?.classList.toggle('soon', !ready);
    el?.setAttribute('aria-label', ready ? `Play ${g.name}` : `${g.name}, coming soon`);
    sub.textContent = ready ? playersText(g) : `${playersText(g)} · coming soon`;
    const both = g.modes.length > 1;
    toggle.hidden = !both;
    toggle.dataset.mode = mode;
    for (const b of toggle.children) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  }

  /**
   * The background disc for the selected game grows from radius 0 while the
   * previous one fades out.
   */
  function pushDisc(bg, edge, animate) {
    const box = carousel.ui.discs;
    const d = h('div', 'gs-disc');
    d.style.setProperty('--gs-bg', bg);
    d.style.setProperty('--gs-edge', edge);
    const old = [...box.children];
    box.append(d);
    if (!animate) {
      for (const o of old) o.remove();
      return;
    }
    // The previous disc fades away while the new one grows from the center.
    for (const o of old) {
      if (o.dataset.leaving) continue;
      o.dataset.leaving = '1';
      o.animate([{ opacity: getComputedStyle(o).opacity }, { opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' })
        .finished.then(() => o.remove(), () => o.remove());
    }
    d.animate(
      [{ transform: 'translate(-50%, -50%) scale(0)' }, { transform: 'translate(-50%, -50%) scale(1)' }],
      { duration: 750, easing: 'cubic-bezier(.22, .8, .25, 1)' },
    );
  }

  function bindStage(stage) {
    const c = carousel;
    const spacing = () => stage.clientWidth * 0.62;
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest('.gs-toggle')) return;
      c.drag = { id: e.pointerId, x: e.clientX, start: c.pos.v, moved: false, samples: [[performance.now(), e.clientX]] };
    });
    stage.addEventListener('pointermove', (e) => {
      const d = c.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 6) {
        d.moved = true;
        try {
          stage.setPointerCapture(e.pointerId);
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
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener(
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
    const H = stage.clientHeight;
    // Covers are playing-card shaped (5:7); `size` is the width.
    const size = Math.min(W * 0.64, (H * (W > H ? 0.56 : 0.66)) / 1.4, 250);
    stage.style.setProperty('--cover', `${size}px`);
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
      el.style.filter = a > 0.5 ? `saturate(${(1 - Math.min(a - 0.5, 1) * 0.3).toFixed(2)})` : '';
      el.tabIndex = a < 0.5 ? 0 : -1;
    });
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
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Enter' && !(e.target instanceof Element && e.target.closest('button, a'))) openGame();
    else return;
    e.preventDefault();
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
