// Beggar-my-neighbour: singleplayer against 1–3 CPUs, or 2–4 people sharing
// the device (nothing is hidden, so players just take turns tapping). Tap
// anywhere or press Space to flip when it's your turn; Auto-play flips for
// everyone. Every card is one spring-driven sprite that moves between the
// players' piles and the center pile.
import { CardSprite } from '../cards.js?v=landing-burst';
import { Beggar, penalty } from './rules.js';

const DECK_SCALE = 0.55;
const PILE_SCALE = 0.85;
const K = 320;
const ZETA = 0.82;
const CPU_MS = 650; // CPU flip
const PAY_MS = 420; // flips while paying go quicker
const AUTO_MS = 260; // auto-play
const COLLECT_MS = 1000; // a won pile stays on show this long
const OWE = { 4: 'an ace', 3: 'a king', 2: 'a queen', 1: 'a jack' };

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

export class BeggarScene {
  constructor(root, { haptic, onExit }) {
    this.root = root;
    this.haptic = haptic;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.sprites = new Map();
    this.auto = false;
    this.nextAt = 0; // next automatic flip (CPU, auto-play)
    this.collectAt = 0;
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
    top.append(back, h('div', 'game-title', 'Beggar'), this.statsEl, newBtn);

    const bottom = h('div', 'game-bar game-bottom');
    this.autoBtn = h('button', 'game-btn', 'Auto-play');
    this.autoBtn.type = 'button';
    this.autoBtn.addEventListener('click', () => this.toggleAuto());
    bottom.append(this.autoBtn);

    this.labels = [];
    this.bannerEl = h('div', 'war-banner bg-banner');
    this.hintEl = h('div', 'war-hint bg-hint');
    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    r.append(this.cardsEl, this.bannerEl, this.hintEl, top, bottom, this.overEl);
  }

  bindInput() {
    const r = this.root;
    const stop = (e) => e.stopPropagation();
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'wheel']) r.addEventListener(type, stop, { passive: true });
    r.addEventListener('pointerdown', (e) => {
      stop(e);
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest('button')) return;
      e.preventDefault();
      this.tap();
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
      if (!this.root.classList.contains('active') || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === ' ' || e.key === 'Enter') && !(e.target instanceof Element && e.target.closest('button'))) {
        e.preventDefault();
        this.tap();
      }
    });
    window.addEventListener('pagehide', () => this.save());
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
    const landscape = W > H;
    const top = safe.top + 50;
    const bottom = H - safe.bottom - 64;
    const left = safe.left + 12;
    const right = W - safe.right - 12;
    const ch = Math.min((bottom - top) / (landscape ? 2.4 : 4.4), (right - left) * 0.27 * 1.4);
    const cw = ch / 1.4;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const dh = ch * DECK_SCALE;
    const dw = cw * DECK_SCALE;
    // Screen spots by relative position: 0 bottom, 1 left, 2 top, 3 right.
    this.spots = [
      { x: cx, y: bottom - dh / 2 - 26 },
      { x: left + dw / 2 + 4, y: cy },
      { x: cx, y: top + dh / 2 + 4 },
      { x: right - dw / 2 - 4, y: cy },
    ];
    this.m = { cw, ch, cx, cy, landscape };
    const s = this.root.style;
    s.setProperty('--cw', `${cw}px`);
    s.setProperty('--ch', `${ch}px`);
    s.setProperty('--card-radius', `${cw * 0.12}px`);
    for (const sp of this.sprites.values()) sp.setLightSpace(W, H);
    this.bannerEl.style.transform = `translate(${cx}px, ${cy + ch * PILE_SCALE * 0.5 + 30}px) translate(-50%, -50%)`;
    this.placeLabels();
  }

  /** Relative screen position of each seat (2 players face each other). */
  rel(seat) {
    const n = this.rules.n;
    if (n === 2) return seat === 0 ? 0 : 2;
    if (n === 3) return [0, 1, 3][seat];
    return seat;
  }

  placeLabels() {
    if (!this.rules || !this.spots) return;
    const dh = this.m.ch * DECK_SCALE;
    const dw = this.m.cw * DECK_SCALE;
    this.labels.forEach((el, seat) => {
      const r = this.rel(seat);
      const p = this.spots[r];
      let t;
      if (r === 0) t = `translate(${p.x + dw / 2 + 12}px, ${p.y}px) translateY(-50%)`;
      else if (r === 2) t = `translate(${p.x + dw / 2 + 12}px, ${p.y}px) translateY(-50%)`;
      else if (r === 1) t = `translate(${p.x - dw / 2}px, ${p.y + dh / 2 + 8}px)`;
      else t = `translate(${p.x + dw / 2}px, ${p.y + dh / 2 + 8}px) translateX(-100%)`;
      // Around one device, the player across the table reads their label upside down.
      if (this.mode === 'multi' && r === 2) t += ' rotate(180deg)';
      el.style.transform = t;
      el.classList.toggle('right', r === 3);
    });
  }

  // ------------------------------------------------------------ game setup

  setMode(mode) {
    const m = mode === 'multi' ? 'multi' : 'single';
    if (this.mode === m && this.rules) return;
    if (this.rules) this.save();
    this.mode = m;
    this.rules = null;
    this.pendingStart = true;
  }

  start() {
    this.pendingStart = false;
    const saved = this.load();
    if (saved) this.begin(saved, false);
    else this.showSetup();
  }

  names() {
    const n = this.rules.n;
    return this.mode === 'multi' ? Array.from({ length: n }, (_, i) => `Player ${i + 1}`) : ['You', 'CPU 1', 'CPU 2', 'CPU 3'].slice(0, n);
  }

  isCpu(seat) {
    return this.mode === 'single' && seat !== 0;
  }

  showSetup() {
    const multi = this.mode === 'multi';
    let count = Number(localStorage.getItem(`thedeck.beggar.count.${this.mode}`)) || 2;
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'Beggar-my-neighbour'));
    c.append(h('div', 'game-win-stats', multi ? 'Everyone around one device · tap on your turn' : 'You against the computer'));
    const row = h('div', 'rm-count');
    const opts = h('div', 'gs-toggle rm-count-opts');
    const paint = () => {
      for (const b of opts.children) b.setAttribute('aria-checked', String(Number(b.dataset.n) === (multi ? count : count - 1)));
    };
    for (const v of multi ? [2, 3, 4] : [1, 2, 3]) {
      const b = h('button', 'gs-toggle-btn', String(v));
      b.type = 'button';
      b.dataset.n = v;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => {
        count = multi ? v : v + 1;
        paint();
      });
      opts.append(b);
    }
    paint();
    row.append(h('div', 'rm-count-label', multi ? 'Players' : 'Opponents'), opts);
    c.append(row);
    c.append(h('div', 'game-win-stats', 'An ace costs the next player 4 cards, a king 3, a queen 2, a jack 1'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => {
      localStorage.setItem(`thedeck.beggar.count.${this.mode}`, String(count));
      this.begin(new Beggar({ players: count }), true);
    });
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    actions.append(go, lobby);
    c.append(actions);
    this.overEl.classList.add('show');
  }

  begin(rules, deal) {
    for (const sp of this.sprites.values()) sp.destroy();
    this.sprites.clear();
    this.rules = rules;
    this.auto = false;
    this.collectAt = 0;
    this.overShown = false;
    this.overEl.classList.remove('show');
    // The Deal button keeps focus otherwise, and Space on a focused button is ignored.
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
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
    for (const deck of rules.decks) {
      for (const card of deck) {
        const sp = new CardSprite(card, this.cardsEl);
        sp.setLightSpace(this.W, this.H);
        sp.place(this.m.cx, this.m.cy, 0, DECK_SCALE, 1);
        sp.waitUntil = deal ? now + 200 + i++ * 14 : 0;
        this.sprites.set(card.id, sp);
      }
    }
    for (const card of rules.pile) {
      const sp = new CardSprite(card, this.cardsEl);
      sp.setLightSpace(this.W, this.H);
      sp.place(this.m.cx, this.m.cy, 0, PILE_SCALE, 0);
      this.sprites.set(card.id, sp);
    }
    this.lockUntil = deal ? now + 200 + 52 * 14 : now + 300;
    this.nextAt = this.lockUntil + CPU_MS;
    if (rules.collector !== null) this.collectAt = now + COLLECT_MS;
    this.updateHUD();
    this.save();
  }

  // ---------------------------------------------------------------- actions

  /** A tap or Space: flip for the player on turn, if that's a person. */
  tap() {
    const r = this.rules;
    const now = performance.now();
    if (!r || r.winner !== null || this.overEl.classList.contains('show') || now < this.lockUntil) return;
    if (this.auto) return this.toggleAuto();
    if (r.collector !== null) {
      this.collectNow();
      return;
    }
    if (this.isCpu(r.turn)) return;
    this.flip();
  }

  flip() {
    const r = this.rules;
    const res = r.flip();
    if (!res) return;
    const now = performance.now();
    this.lockUntil = now + 120;
    const names = this.names();
    if (res.court) {
      const next = r.collector === null ? names[r.turn] : null;
      this.banner(next ? `${next} pays ${res.court} for ${OWE[res.court]}` : '', 'court', 0);
      this.haptic(10);
    }
    if (res.collect !== undefined && res.collect !== null) {
      const n = r.pile.length;
      this.banner(`${names[res.collect]} ${this.mode === 'single' && res.collect === 0 ? 'take' : 'takes'} the pile · ${n} cards`, res.collect === 0 || this.mode === 'multi' ? 'you' : 'cpu', 0);
      this.collectAt = now + (this.auto ? COLLECT_MS * 0.6 : COLLECT_MS);
    }
    this.nextAt = now + this.delay();
    this.updateHUD();
  }

  collectNow() {
    const res = this.rules.collect();
    this.collectAt = 0;
    if (!res) return;
    this.banner('');
    this.haptic(this.mode === 'single' && res.seat === 0 ? [10, 40, 10] : 6);
    this.nextAt = performance.now() + this.delay() + 200;
    this.updateHUD();
    this.save();
    if (this.rules.winner !== null) this.showOver();
  }

  delay() {
    if (this.auto) return AUTO_MS;
    return this.rules.debt > 0 ? PAY_MS : CPU_MS;
  }

  toggleAuto() {
    if (!this.rules || this.rules.winner !== null) return;
    this.auto = !this.auto;
    this.nextAt = performance.now() + 150;
    this.updateHUD();
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    const r = this.rules;
    if (!r || !this.m) return;
    if (r.winner === null && !this.overEl.classList.contains('show')) {
      if (this.collectAt && now >= this.collectAt) this.collectNow();
      else if (!this.collectAt && r.collector === null && now >= this.nextAt && now >= this.lockUntil && (this.auto || this.isCpu(r.turn))) {
        this.flip();
      }
    }
    this.pose(now, dt);
  }

  /** Every sprite's target comes straight from the rules: in a player's pile or on the center pile. */
  pose(now, dt) {
    const r = this.rules;
    const { cx, cy, cw, ch } = this.m;
    const seen = new Set();
    r.decks.forEach((deck, seat) => {
      const spot = this.spots[this.rel(seat)];
      const n = deck.length;
      deck.forEach((card, i) => {
        const sp = this.sprites.get(card.id);
        seen.add(sp);
        const layer = Math.min(n - 1 - i, 8);
        if (now < sp.waitUntil) sp.target(cx, cy, 0, DECK_SCALE, 1, 0);
        else sp.target(spot.x - layer * 0.35, spot.y - layer * 0.5, 0, DECK_SCALE, 1, 0);
        sp.z = 100 + (n - i) + seat * 60;
      });
    });
    const pn = r.pile.length;
    r.pile.forEach((card, i) => {
      const sp = this.sprites.get(card.id);
      seen.add(sp);
      const court = penalty(card) > 0;
      sp.target(cx + jitter(card.id, 1) * cw * 0.12, cy + jitter(card.id, 2) * ch * 0.08, jitter(card.id, 3) * 12, PILE_SCALE * (court ? 1.04 : 1), 0, i === pn - 1 ? 0.35 : 0);
      sp.z = 500 + i;
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
    this.bannerEl.className = `war-banner bg-banner${text ? ' show' : ''}${kind ? ` ${kind}` : ''}`;
    if (ms) this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  updateHUD() {
    const r = this.rules;
    if (!r) return;
    const names = this.names();
    this.labels.forEach((el, seat) => {
      el.firstChild.textContent = names[seat];
      const n = r.decks[seat].length;
      let sub = n ? `${n} ${n === 1 ? 'card' : 'cards'}` : 'out';
      if (seat === r.turn && r.debt > 0 && r.collector === null) sub += ` · owes ${r.debt}`;
      el.lastChild.textContent = sub;
      el.classList.toggle('active', r.winner === null && r.collector === null && seat === r.turn);
    });
    this.statsEl.textContent = r.flips ? `${r.flips} flips` : '';
    this.autoBtn.textContent = this.auto ? 'Stop' : 'Auto-play';
    this.autoBtn.classList.toggle('accent', this.auto);
    this.autoBtn.disabled = r.winner !== null;
    const human = !this.isCpu(r.turn) && r.collector === null && r.winner === null && !this.auto;
    let hint = '';
    if (human) hint = this.mode === 'multi' ? `${names[r.turn]}: tap to flip` : r.debt ? `Tap to pay (${r.debt} left)` : 'Tap to flip';
    this.hintEl.textContent = hint;
    this.hintEl.classList.toggle('show', !!hint);
    // In multiplayer the hint sits by whoever is on turn.
    if (this.spots) {
      const spot = this.spots[this.rel(r.turn)];
      const dh = this.m.ch * DECK_SCALE;
      const rr = this.rel(r.turn);
      this.hintEl.style.transform =
        rr === 0 ? `translate(${spot.x - (this.m.cw * DECK_SCALE) / 2 - 12}px, ${spot.y}px) translate(-100%, -50%)`
        : rr === 2 ? `translate(${spot.x}px, ${spot.y + dh / 2 + 18}px) translate(-50%, -50%)${this.mode === 'multi' ? ' rotate(180deg)' : ''}`
        : `translate(${spot.x}px, ${spot.y - dh / 2 - 16}px) translate(${rr === 1 ? '0' : '-100%'}, -50%)`;
    }
  }

  showOver() {
    if (this.overShown) return;
    this.overShown = true;
    this.auto = false;
    const r = this.rules;
    const names = this.names();
    const you = this.mode === 'single' && r.winner === 0;
    setTimeout(() => {
      const c = this.overCard;
      c.innerHTML = '';
      c.append(h('div', 'game-win-title', you ? 'You won!' : `${names[r.winner]} wins`));
      c.append(h('div', 'game-win-stats', `${r.flips} flips · ${r.tricks} piles taken`));
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
    }, 700);
    this.updateHUD();
  }

  // ------------------------------------------------------------ visibility

  show() {
    this.root.classList.add('active');
    this.relayout();
    if (!this.mode) this.setMode('single');
    if (this.pendingStart) this.start();
  }

  hide() {
    this.auto = false;
    this.root.classList.remove('active');
    this.save();
    if (this.rules) this.updateHUD();
  }

  cancel() {}

  postpone(ms) {
    const now = performance.now();
    for (const sp of this.sprites.values()) if (sp.waitUntil > now) sp.waitUntil += ms;
    this.lockUntil = Math.max(this.lockUntil, now) + ms;
    this.nextAt = Math.max(this.nextAt, now) + ms;
    if (this.collectAt) this.collectAt += ms;
  }

  // ----------------------------------------------------------- persistence

  saveKey() {
    return `thedeck.beggar.${this.mode}.v1`;
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
      return Beggar.restore(JSON.parse(localStorage.getItem(this.saveKey())));
    } catch {
      return null;
    }
  }
}
