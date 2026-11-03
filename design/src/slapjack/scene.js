// Slapjack: singleplayer against 1–3 CPUs (Easy / Normal / Hard reactions),
// or two people on one device facing each other. Tap your own pile to flip;
// tap anywhere else (in your half, with two players) to slap. Keys: Space
// slaps and Enter flips; with two players F/D flip/slap for the bottom player
// and J/K for the top one.
import { CardSprite } from '../cards.js?v=landing-burst';
import { Slapjack } from './rules.js';

const DECK_SCALE = 0.6;
const PILE_SCALE = 0.95;
const K = 340;
const ZETA = 0.8;
const CPU_FLIP_MS = 650;
const LEVELS = {
  easy: { label: 'Easy', react: 950, mistake: 0.06 },
  normal: { label: 'Normal', react: 620, mistake: 0.03 },
  hard: { label: 'Hard', react: 400, mistake: 0.01 },
};
const LEVEL_KEY = 'thedeck.slapjack.level';

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};
const jitter = (id, salt) => {
  let x = salt * 977;
  for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) % 10007;
  return (x / 10007) * 2 - 1;
};

export class SlapjackScene {
  constructor(root, { haptic, onExit }) {
    this.root = root;
    this.haptic = haptic;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.sprites = new Map();
    this.level = LEVELS[localStorage.getItem(LEVEL_KEY)] ? localStorage.getItem(LEVEL_KEY) : 'normal';
    this.cpuSlaps = []; // [{ p, at, mistake }]
    this.nextFlipAt = 0;
    this.lockUntil = 0;
    this.buildDOM();
    this.bindInput();
  }

  // -------------------------------------------------------------------- DOM

  buildDOM() {
    const r = this.root;
    r.innerHTML = '';
    this.cardsEl = h('div', 'war-cards');
    const top = h('div', 'game-bar game-top');
    const back = h('button', 'game-icon', '‹');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back to lobby');
    back.addEventListener('click', () => this.onExit());
    this.statsEl = h('div', 'game-stats bg-stats');
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.showSetup());
    top.append(back, h('div', 'game-title', 'Slapjack'), this.statsEl, newBtn);
    this.labels = [];
    this.slapEl = h('div', 'sj-slap');
    this.bannerEl = h('div', 'war-banner sj-banner');
    this.hintEls = [h('div', 'war-hint sj-hint'), h('div', 'war-hint sj-hint top')];
    this.divider = h('div', 'sj-divider');
    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    r.append(this.divider, this.cardsEl, this.slapEl, this.bannerEl, ...this.hintEls, top, this.overEl);
  }

  bindInput() {
    const r = this.root;
    const stop = (e) => e.stopPropagation();
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'wheel']) r.addEventListener(type, stop, { passive: true });
    r.addEventListener('pointerdown', (e) => {
      stop(e);
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest('button, .game-win')) return;
      e.preventDefault();
      this.tap(this.local(e));
    });
    r.addEventListener(
      'touchstart',
      (e) => {
        stop(e);
        if (!(e.target instanceof Element && e.target.closest('button'))) e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (!this.root.classList.contains('active') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.target instanceof Element && e.target.closest('button')) return;
      const k = e.key.toLowerCase();
      const multi = this.mode === 'multi';
      const map = multi ? { f: ['flip', 0], d: ['slap', 0], j: ['flip', 1], k: ['slap', 1] } : { enter: ['flip', 0], f: ['flip', 0], ' ': ['slap', 0] };
      const a = map[k];
      if (!a) return;
      e.preventDefault();
      if (a[0] === 'flip') this.humanFlip(a[1]);
      else this.humanSlap(a[1]);
    });
    window.addEventListener('pagehide', () => this.save());
  }

  local(e) {
    const rect = this.root.getBoundingClientRect();
    const s = rect.width / this.root.offsetWidth || 1;
    return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s };
  }

  // ----------------------------------------------------------------- layout

  setSize(W, H, safe) {
    this.W = W;
    this.H = H;
    this.safe = safe;
    this.relayout();
  }

  relayout() {
    if (!this.W) return;
    const { W, H, safe } = this;
    const top = safe.top + 50;
    const bottom = H - safe.bottom - 12;
    const left = safe.left + 12;
    const right = W - safe.right - 12;
    const ch = Math.min((bottom - top) / 3.6, (right - left) * 0.3 * 1.4);
    const cw = ch / 1.4;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const dh = ch * DECK_SCALE;
    const dw = cw * DECK_SCALE;
    this.spots = [
      { x: cx, y: bottom - dh / 2 - 34 },
      { x: left + dw / 2 + 6, y: cy },
      { x: cx, y: top + dh / 2 + (this.mode === 'multi' ? 30 : 6) },
      { x: right - dw / 2 - 6, y: cy },
    ];
    this.m = { cw, ch, cx, cy, dw, dh };
    const s = this.root.style;
    s.setProperty('--cw', `${cw}px`);
    s.setProperty('--ch', `${ch}px`);
    s.setProperty('--card-radius', `${cw * 0.12}px`);
    for (const sp of this.sprites.values()) sp.setLightSpace(W, H);
    this.bannerEl.style.transform = `translate(${cx}px, ${cy + ch * PILE_SCALE * 0.5 + 28}px) translate(-50%, -50%)`;
    this.divider.style.top = `${cy}px`;
    this.placeLabels();
  }

  rel(seat) {
    const n = this.rules.n;
    if (n === 2) return seat === 0 ? 0 : 2;
    if (n === 3) return [0, 1, 3][seat];
    return seat;
  }

  placeLabels() {
    if (!this.rules || !this.spots) return;
    const { dw, dh } = this.m;
    this.labels.forEach((el, seat) => {
      const r = this.rel(seat);
      const p = this.spots[r];
      let t;
      if (r === 0 || r === 2) t = `translate(${p.x + dw / 2 + 12}px, ${p.y}px) translateY(-50%)`;
      else if (r === 1) t = `translate(${p.x - dw / 2}px, ${p.y + dh / 2 + 8}px)`;
      else t = `translate(${p.x + dw / 2}px, ${p.y + dh / 2 + 8}px) translateX(-100%)`;
      if (this.mode === 'multi' && r === 2) t += ' rotate(180deg)';
      el.style.transform = t;
      el.classList.toggle('right', r === 3);
    });
    const [b, t] = this.hintEls;
    const p0 = this.spots[0];
    const p2 = this.spots[2];
    b.style.transform = `translate(${p0.x - dw / 2 - 12}px, ${p0.y}px) translate(-100%, -50%)`;
    t.style.transform = `translate(${p2.x - dw / 2 - 12}px, ${p2.y}px) translate(-100%, -50%) rotate(180deg)`;
  }

  // ------------------------------------------------------------ game setup

  wipe() {
    for (const sp of this.sprites.values()) sp.destroy();
    this.sprites.clear();
    this.root.classList.add('fresh');
  }

  setMode(mode) {
    const m = mode === 'multi' ? 'multi' : 'single';
    if (this.mode === m && this.rules) return;
    const had = !!this.rules;
    if (had) this.save();
    this.mode = m;
    this.rules = null;
    this.pendingStart = true;
    this.root.classList.toggle('sj-multi', m === 'multi');
    if (had) this.wipe();
  }

  start() {
    this.pendingStart = false;
    const saved = this.load();
    if (saved && saved.winner === null) this.begin(saved, false);
    else this.showSetup();
  }

  names() {
    return this.mode === 'multi' ? ['Player 1', 'Player 2'] : ['You', 'CPU 1', 'CPU 2', 'CPU 3'].slice(0, this.rules.n);
  }

  isCpu(p) {
    return this.mode === 'single' && p !== 0;
  }

  showSetup() {
    const multi = this.mode === 'multi';
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'Slapjack'));
    c.append(h('div', 'game-win-stats', multi ? 'Two players facing each other · each taps their own half' : 'Slap the jacks before the CPUs do'));
    let count = Number(localStorage.getItem('thedeck.slapjack.count')) || 2;
    if (!multi) {
      const row = h('div', 'rm-count');
      const opts = h('div', 'gs-toggle rm-count-opts');
      const paint = () => {
        for (const b of opts.children) b.setAttribute('aria-checked', String(Number(b.dataset.n) === count - 1));
      };
      for (const v of [1, 2, 3]) {
        const b = h('button', 'gs-toggle-btn', String(v));
        b.type = 'button';
        b.dataset.n = v;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => {
          count = v + 1;
          paint();
        });
        opts.append(b);
      }
      paint();
      row.append(h('div', 'rm-count-label', 'Opponents'), opts);
      c.append(row);
      const row2 = h('div', 'rm-count');
      const lv = h('div', 'gs-toggle rm-count-opts sd-levels');
      const paint2 = () => {
        for (const b of lv.children) b.setAttribute('aria-checked', String(b.dataset.level === this.level));
      };
      for (const [key, l] of Object.entries(LEVELS)) {
        const b = h('button', 'gs-toggle-btn', l.label);
        b.type = 'button';
        b.dataset.level = key;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => {
          this.level = key;
          localStorage.setItem(LEVEL_KEY, key);
          paint2();
        });
        lv.append(b);
      }
      paint2();
      row2.append(h('div', 'rm-count-label', 'CPU'), lv);
      c.append(row2);
    }
    c.append(h('div', 'game-win-stats', multi ? 'Bottom: tap your pile to flip, anywhere else in your half to slap · keys F/D and J/K' : 'Tap your pile to flip · tap anywhere else to slap · Enter / Space'));
    c.append(h('div', 'game-win-stats', 'Wrong slap? You burn a card under the pile'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => {
      if (!multi) localStorage.setItem('thedeck.slapjack.count', String(count));
      this.begin(new Slapjack({ players: multi ? 2 : count }), true);
    });
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    actions.append(go, lobby);
    c.append(actions);
    this.overEl.classList.add('show');
  }

  begin(rules, deal) {
    this.root.classList.remove('fresh');
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    for (const sp of this.sprites.values()) sp.destroy();
    this.sprites.clear();
    this.rules = rules;
    this.cpuSlaps = [];
    this.overShown = false;
    this.overEl.classList.remove('show');
    this.banner('');
    for (const el of this.labels) el.remove();
    this.labels = this.names().map(() => {
      const el = h('div', 'rm-label bg-label');
      el.append(h('div', 'rm-name'), h('div', 'rm-sub'));
      this.root.insertBefore(el, this.bannerEl);
      return el;
    });
    this.relayout();
    const now = performance.now();
    let i = 0;
    for (const card of [...rules.decks.flat(), ...rules.pile]) {
      const sp = new CardSprite(card, this.cardsEl);
      sp.setLightSpace(this.W, this.H);
      sp.place(this.m.cx, this.m.cy, 0, DECK_SCALE, 1);
      sp.waitUntil = deal ? now + 200 + i++ * 12 : 0;
      this.sprites.set(card.id, sp);
    }
    this.lockUntil = now + (deal ? 200 + 52 * 12 : 300);
    this.nextFlipAt = this.lockUntil + CPU_FLIP_MS;
    if (rules.jackUp) this.scheduleCpuSlaps(this.lockUntil, true);
    this.updateHUD();
    this.save();
  }

  // ---------------------------------------------------------------- actions

  /** A tap at point p: flip if it's on the tapper's own pile, otherwise slap. */
  tap(pt) {
    const r = this.rules;
    if (!r || r.winner !== null || this.overEl.classList.contains('show')) return;
    const who = this.mode === 'multi' ? (pt.y > this.m.cy ? 0 : 1) : 0;
    const spot = this.spots[this.rel(who)];
    const onDeck = Math.abs(pt.x - spot.x) < this.m.dw / 2 + 14 && Math.abs(pt.y - spot.y) < this.m.dh / 2 + 14;
    if (onDeck) this.humanFlip(who);
    else this.humanSlap(who);
  }

  humanFlip(p) {
    if (performance.now() < this.lockUntil || this.isCpu(p)) return;
    this.flip(p);
  }

  humanSlap(p) {
    this.slap(p);
  }

  flip(p) {
    const r = this.rules;
    const res = r.flip(p);
    if (!res) return false;
    const now = performance.now();
    this.cpuSlaps = [];
    this.nextFlipAt = now + CPU_FLIP_MS;
    this.haptic(res.jack ? 12 : 4);
    this.scheduleCpuSlaps(now, res.jack, res.card);
    this.updateHUD();
    if (r.winner !== null) this.showOver();
    return true;
  }

  /** CPUs react: every CPU still in races to slap a jack; now and then one slaps a picture card by mistake. */
  scheduleCpuSlaps(now, jack, card) {
    if (this.mode !== 'single') return;
    const lv = LEVELS[this.level];
    for (let q = 1; q < this.rules.n; q++) {
      if (!this.rules.inGame(q)) continue;
      if (jack) this.cpuSlaps.push({ p: q, at: now + lv.react * (0.75 + Math.random() * 0.6) });
      else if (card && card.value >= 12 && Math.random() < lv.mistake) this.cpuSlaps.push({ p: q, at: now + lv.react * (0.8 + Math.random() * 0.4) });
    }
  }

  slap(p) {
    const r = this.rules;
    const res = r.slap(p);
    if (!res) return;
    const names = this.names();
    const you = this.mode === 'single' && p === 0;
    const who = you ? 'You' : names[p];
    this.showHand(p, res.ok);
    if (res.ok) {
      this.cpuSlaps = [];
      this.banner(`${who} slap${you ? '' : 's'} the jack! +${res.cards.length}`, you || this.mode === 'multi' ? 'you' : 'cpu', 1300);
      this.haptic(you ? [10, 40, 10] : 20);
      for (const q of res.knocked) this.flash(`${q === 0 && this.mode === 'single' ? 'You are' : `${names[q]} is`} out`);
      this.lockUntil = performance.now() + 500;
      this.nextFlipAt = performance.now() + 900;
    } else {
      this.banner(res.out ? `${who} slapped with no cards: out!` : `${who} slapped ${article(cardWord(r.top))}: burn a card`, 'bad', 1300);
      this.root.classList.remove('sj-bad');
      void this.root.offsetWidth;
      this.root.classList.add('sj-bad');
      this.haptic([30, 30, 30]);
    }
    this.updateHUD();
    this.save();
    if (r.winner !== null) this.showOver();
  }

  flash(msg) {
    setTimeout(() => this.banner(msg, 'bad', 1200), 1300);
  }

  /** A hand lands on the pile from the slapper's side. */
  showHand(p, ok) {
    const spot = this.spots[this.rel(p)];
    const { cx, cy } = this.m;
    // Fingers point from the slapper's side toward the pile (up for the bottom seat).
    const angle = Math.atan2(spot.y - cy, spot.x - cx) * (180 / Math.PI) - 90;
    const el = this.slapEl;
    el.textContent = '✋';
    el.className = `sj-slap show${ok ? ' ok' : ' bad'}`;
    el.style.transform = `translate(${cx + (spot.x - cx) * 0.12}px, ${cy + (spot.y - cy) * 0.12}px) translate(-50%, -50%) rotate(${angle}deg)`;
    clearTimeout(this.slapTimer);
    this.slapTimer = setTimeout(() => el.classList.remove('show'), 450);
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    const r = this.rules;
    if (!r || !this.m) return;
    if (r.winner === null && !this.overEl.classList.contains('show')) {
      // CPU slaps that are due
      if (this.cpuSlaps.length) {
        this.cpuSlaps.sort((a, b) => a.at - b.at);
        while (this.cpuSlaps.length && now >= this.cpuSlaps[0].at) {
          const s = this.cpuSlaps.shift();
          if (r.pile.length) this.slap(s.p);
        }
      }
      // CPU flips
      if (this.isCpu(r.turn) && !r.jackUp && now >= this.nextFlipAt && now >= this.lockUntil) this.flip(r.turn);
    }
    this.pose(now, dt);
  }

  pose(now, dt) {
    const r = this.rules;
    const { cx, cy, cw, ch } = this.m;
    r.decks.forEach((deck, seat) => {
      const spot = this.spots[this.rel(seat)];
      const n = deck.length;
      deck.forEach((card, i) => {
        const sp = this.sprites.get(card.id);
        const layer = Math.min(n - 1 - i, 8);
        if (now < sp.waitUntil) sp.target(cx, cy, 0, DECK_SCALE, 1, 0);
        else sp.target(spot.x - layer * 0.35, spot.y - layer * 0.5, this.mode === 'multi' && this.rel(seat) === 2 ? 180 : 0, DECK_SCALE, 1, 0);
        sp.z = 100 + (n - i) + seat * 60;
      });
    });
    const pn = r.pile.length;
    r.pile.forEach((card, i) => {
      const sp = this.sprites.get(card.id);
      const topCard = i === pn - 1;
      const jack = topCard && card.value === 11;
      sp.target(cx + jitter(card.id, 1) * cw * 0.1, cy + jitter(card.id, 2) * ch * 0.06, jitter(card.id, 3) * 14, PILE_SCALE * (jack ? 1.08 : 1), 0, topCard ? 0.4 : 0);
      sp.z = 500 + i;
      if (sp.jackGlow !== jack) {
        sp.jackGlow = jack;
        sp.el.classList.toggle('sj-jack', jack);
      }
    });
    for (const sp of this.sprites.values()) {
      sp.step(dt, K, ZETA);
      sp.render();
    }
  }

  // -------------------------------------------------------------------- HUD

  banner(text, kind = '', ms = 0) {
    clearTimeout(this.bannerTimer);
    this.bannerEl.textContent = text;
    this.bannerEl.className = `war-banner sj-banner${text ? ' show' : ''}${kind ? ` ${kind}` : ''}`;
    if (ms) this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  updateHUD() {
    const r = this.rules;
    if (!r) return;
    const names = this.names();
    this.labels.forEach((el, seat) => {
      el.firstChild.textContent = names[seat];
      const n = r.decks[seat].length;
      el.lastChild.textContent = !r.inGame(seat) ? 'out' : n ? `${n} cards` : 'no cards · last chance';
      el.classList.toggle('active', r.winner === null && seat === r.turn && !r.jackUp);
      el.classList.toggle('busted', !r.inGame(seat));
    });
    this.statsEl.textContent = this.mode === 'single' ? `${LEVELS[this.level].label} · ${r.pile.length} in pile` : `${r.pile.length} in pile`;
    const [bottom, top] = this.hintEls;
    const humanTurn = (p) => r.winner === null && !this.isCpu(p) && r.turn === p && !r.jackUp && r.decks[p].length > 0;
    const hintFor = (p) => (r.jackUp ? 'SLAP!' : humanTurn(p) ? 'Tap your pile to flip' : '');
    bottom.textContent = hintFor(0);
    bottom.classList.toggle('show', !!bottom.textContent);
    bottom.classList.toggle('slap', r.jackUp);
    const p2 = this.mode === 'multi' ? 1 : -1;
    top.textContent = p2 >= 0 ? hintFor(1) : '';
    top.classList.toggle('show', !!top.textContent);
    top.classList.toggle('slap', r.jackUp);
  }

  showOver() {
    if (this.overShown) return;
    this.overShown = true;
    const r = this.rules;
    const names = this.names();
    const you = this.mode === 'single' && r.winner === 0;
    this.save();
    setTimeout(() => {
      const c = this.overCard;
      c.innerHTML = '';
      c.append(h('div', 'game-win-title', you ? 'You won!' : `${names[r.winner]} wins`));
      c.append(h('div', 'game-win-stats', `${r.flips} flips${this.mode === 'single' ? ` · ${LEVELS[this.level].label} CPUs` : ''}`));
      const row = h('div', 'game-win-actions');
      const again = h('button', 'game-btn accent', 'Play again');
      again.type = 'button';
      again.addEventListener('click', () => this.showSetup());
      const lobby = h('button', 'game-btn', 'Lobby');
      lobby.type = 'button';
      lobby.addEventListener('click', () => this.onExit());
      row.append(again, lobby);
      c.append(row);
      this.overEl.classList.add('show');
    }, 900);
  }

  // ------------------------------------------------------------ visibility

  show() {
    this.root.classList.add('active');
    this.relayout();
    if (!this.mode) this.setMode('single');
    if (this.pendingStart) this.start();
  }

  hide() {
    this.root.classList.remove('active');
    this.cpuSlaps = [];
    this.save();
  }

  cancel() {}

  postpone(ms) {
    const now = performance.now();
    for (const sp of this.sprites.values()) if (sp.waitUntil > now) sp.waitUntil += ms;
    this.lockUntil = Math.max(this.lockUntil, now) + ms;
    this.nextFlipAt = Math.max(this.nextFlipAt, now) + ms;
    for (const s of this.cpuSlaps) s.at += ms;
  }

  // ----------------------------------------------------------- persistence

  saveKey() {
    return `thedeck.slapjack.${this.mode}.v1`;
  }

  save() {
    if (!this.rules || !this.mode) return;
    try {
      if (this.rules.winner !== null) localStorage.removeItem(this.saveKey());
      else localStorage.setItem(this.saveKey(), JSON.stringify(this.rules.serialize()));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      return Slapjack.restore(JSON.parse(localStorage.getItem(this.saveKey())));
    } catch {
      return null;
    }
  }
}

const article = (w) => `${/^[aeio8]/.test(w) ? 'an' : 'a'} ${w}`;

function cardWord(c) {
  if (!c) return 'card';
  return { 1: 'ace', 11: 'jack', 12: 'queen', 13: 'king' }[c.value] ?? String(c.value);
}
