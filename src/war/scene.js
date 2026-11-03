// War vs. a CPU opponent. Tap (or Space) to flip; the CPU flips right after
// you. Auto-play runs rounds by itself. Same scene interface as Solitaire:
// setSize, show, hide, update, cancel.
import { CardSprite } from '../cards.js?v=landing-burst';
import { War, PLAYERS } from './rules.js';

const SAVE_KEY = 'thedeck.war.v1';
const K = 300;
const ZETA = 0.84;
const CPU_DELAY = 170; // the CPU flips a beat after you
const SHOW_MS = 950; // how long a decided battle stays on the table (manual)
const AUTO_SHOW_MS = 620;
const AUTO_GAP_MS = 230; // pause between auto rounds
const WAR_PAUSE_MS = 750; // auto: pause on "WAR!" before placing
const FLY_MS = 450;

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

// Stable per-card jitter so table cards look tossed, not stamped.
const jitter = (id, salt) => {
  let x = salt * 977;
  for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) % 10007;
  return (x / 10007) * 2 - 1;
};

export class WarScene {
  constructor(root, { onExit }) {
    this.root = root;
    this.visible = false;
    this.W = 393;
    this.H = 852;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this.m = null;
    this.auto = false;
    this.collectAt = 0; // when the decided table gets collected
    this.autoAt = 0; // next auto action
    this.lockUntil = 0; // debounce taps
    this.overShown = false;

    this.buildDOM(onExit);
    const saved = this.load();
    this.game = saved ?? new War();
    this.sprites = new Map();
    for (const p of PLAYERS) for (const c of this.game.decks[p]) this.addSprite(c);
    this.placed = false;
    this.dealOnShow = !saved;
    this.bindInput();
    this.updateHUD();
  }

  // -------------------------------------------------------------------- DOM

  buildDOM(onExit) {
    const r = this.root;
    r.innerHTML = '';
    this.cardsEl = h('div', 'war-cards');

    const top = h('div', 'game-bar game-top');
    const back = h('button', 'game-icon', '‹');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back to lobby');
    back.addEventListener('click', onExit);
    this.statsEl = h('div', 'game-stats');
    top.append(back, h('div', 'game-title', 'War'), this.statsEl);

    const bottom = h('div', 'game-bar game-bottom');
    const btn = (label, fn, cls = '') => {
      const b = h('button', `game-btn ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      bottom.append(b);
      return b;
    };
    btn('New game', () => this.newGame());
    this.autoBtn = btn('Auto-play', () => this.toggleAuto());

    this.labels = {};
    for (const p of PLAYERS) {
      const el = h('div', `war-label war-label-${p}`);
      el.append(h('span', 'war-name', p === 'you' ? 'You' : 'CPU'), h('span', 'war-count'));
      this.labels[p] = el;
    }
    this.bannerEl = h('div', 'war-banner');
    this.hintEl = h('div', 'war-hint', 'Tap to flip');

    this.overEl = h('div', 'game-win');
    const card = h('div', 'game-win-card');
    this.overTitle = h('div', 'game-win-title');
    this.overStats = h('div', 'game-win-stats');
    const row = h('div', 'game-win-actions');
    const again = h('button', 'game-btn accent', 'Play again');
    again.type = 'button';
    again.addEventListener('click', () => this.newGame());
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', onExit);
    row.append(again, lobby);
    card.append(this.overTitle, this.overStats, row);
    this.overEl.append(card);

    r.append(this.cardsEl, this.labels.cpu, this.labels.you, this.bannerEl, this.hintEl, top, bottom, this.overEl);
  }

  addSprite(card) {
    const sp = new CardSprite(card, this.cardsEl);
    sp.where = null;
    sp.owner = null;
    sp.flyUntil = 0;
    sp.waitUntil = 0;
    sp.setLightSpace(this.W, this.H);
    this.sprites.set(card.id, sp);
    return sp;
  }

  /** Sprites follow the game's card objects (they're replaced on deal/restore). */
  syncCards() {
    for (const p of PLAYERS) for (const c of [...this.game.decks[p], ...this.game.table[p]]) this.sprites.get(c.id).card = c;
  }

  // ----------------------------------------------------------------- layout

  setSize(W, H, safe) {
    this.W = W;
    this.H = H;
    this.safe = safe;
    for (const sp of this.sprites.values()) sp.setLightSpace(W, H);
    this.relayout();
  }

  relayout() {
    const { W, H, safe } = this;
    const landscape = W > H;
    const barH = 46;
    const playTop = safe.top + barH + 8;
    const playBottom = H - safe.bottom - barH - 14;
    const left = safe.left + 10;
    const right = W - safe.right - 10;
    const playH = playBottom - playTop;
    const cx = (left + right) / 2;
    const cy = (playTop + playBottom) / 2;
    let ch;
    let pts;
    if (landscape) {
      // CPU on the left, you on the right; war cards fan downward.
      ch = Math.min(playH * 0.56, (right - left) / 6.2 * 1.4);
      const cw = ch / 1.4;
      pts = {
        cpu: { deck: { x: left + cw * 0.8, y: cy }, play: { x: cx - cw * 0.85, y: cy - ch * 0.1 }, fan: { x: 0, y: ch * 0.075 } },
        you: { deck: { x: right - cw * 0.8, y: cy }, play: { x: cx + cw * 0.85, y: cy - ch * 0.1 }, fan: { x: 0, y: ch * 0.075 } },
      };
    } else {
      // CPU on top, you at the bottom; war cards fan to the right.
      ch = Math.min(playH / 4.5, (right - left) * 0.27 * 1.4);
      const cw = ch / 1.4;
      pts = {
        cpu: { deck: { x: cx, y: playTop + ch / 2 + 4 }, play: { x: cx, y: cy - ch * 0.62 }, fan: { x: cw * 0.15, y: 0 } },
        you: { deck: { x: cx, y: playBottom - ch / 2 - 4 }, play: { x: cx, y: cy + ch * 0.62 }, fan: { x: cw * 0.15, y: 0 } },
      };
    }
    const cw = ch / 1.4;
    this.m = { cw, ch, cx, cy, pts, landscape };

    const s = this.root.style;
    s.setProperty('--cw', `${cw}px`);
    s.setProperty('--ch', `${ch}px`);
    s.setProperty('--card-radius', `${cw * 0.12}px`);
    for (const p of PLAYERS) {
      const d = pts[p].deck;
      const el = this.labels[p];
      // Label sits beside the deck (portrait) or under it (landscape).
      if (landscape) el.style.transform = `translate(${d.x}px, ${d.y + ch / 2 + 12}px) translateX(-50%)`;
      else el.style.transform = `translate(${d.x + cw / 2 + 14}px, ${d.y}px) translateY(-50%)`;
    }
    const you = pts.you.deck;
    this.hintEl.style.transform = landscape
      ? `translate(${you.x}px, ${you.y - ch / 2 - 30}px) translateX(-50%)`
      : `translate(${you.x - cw / 2 - 14}px, ${you.y}px) translate(-100%, -50%)`;
    this.bannerEl.style.transform = `translate(${cx}px, ${landscape ? cy + ch * 0.62 : cy}px) translate(-50%, -50%)`;
  }

  /** Rest pose for every card: id -> { x, y, rot, flip, z, where, owner }. */
  computeTargets() {
    const { pts } = this.m;
    const out = new Map();
    for (const p of PLAYERS) {
      const deck = this.game.decks[p];
      const { x, y } = pts[p].deck;
      const n = deck.length;
      deck.forEach((c, i) => {
        // Index 0 is the top card; a few layers of thickness show the deck's size.
        const layer = Math.min(n - 1 - i, 10) * (n > 1 ? 1 : 0);
        out.set(c.id, { x: x - layer * 0.35, y: y - layer * 0.5, rot: 0, flip: 1, z: 100 + (n - i), where: `${p}-deck`, owner: p });
      });
      const t = this.game.table[p];
      const play = pts[p].play;
      const fan = pts[p].fan;
      const mid = (t.length - 1) / 2; // pile stays centered on its spot as a war grows
      t.forEach((c, i) => {
        out.set(c.id, {
          x: play.x + fan.x * (i - mid) + jitter(c.id, 1) * 3,
          y: play.y + fan.y * (i - mid) + jitter(c.id, 2) * 3,
          rot: jitter(c.id, 3) * (c.up ? 3 : 6),
          flip: c.up ? 0 : 1,
          z: 400 + i,
          where: `${p}-table`,
          owner: p,
        });
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    if (!this.m) return;
    const g = this.game;

    if (this.collectAt && now >= this.collectAt) this.collect(now);
    if (this.auto && !g.winner && !this.collectAt && now >= this.autoAt) this.play(now);

    const targets = this.computeTargets();
    for (const [id, sp] of this.sprites) {
      const t = targets.get(id);
      if (!t) continue;
      if (sp.where !== t.where) {
        if (sp.where !== null) sp.flyUntil = now + FLY_MS;
        sp.where = t.where;
      }
      if (sp.owner !== t.owner) {
        sp.owner = t.owner;
        sp.el.classList.toggle('cpu-back', t.owner === 'cpu');
      }
      if (now < sp.waitUntil) {
        // Dealing: wait in the middle. Flipping CPU cards: wait on the deck.
        const hold = sp.holdAt ?? { x: this.m.cx, y: this.m.cy };
        sp.target(hold.x, hold.y, 0, 1, 1, 0);
        sp.z = hold.z ?? 50;
      } else {
        sp.holdAt = null;
        const flying = now < sp.flyUntil;
        sp.target(t.x, t.y, t.rot, 1, t.flip, flying ? 0.7 : t.where.endsWith('table') ? 0.25 : 0);
        sp.z = t.z + (flying ? 2000 : 0);
      }
      sp.step(dt, K, ZETA);
      sp.render();
    }
  }

  // ---------------------------------------------------------------- actions

  /** Both players put cards down. */
  play(now = performance.now()) {
    const g = this.game;
    if (g.winner || this.collectAt) return;
    // Remember where the CPU's deck is so its cards wait there for their beat.
    const cpuDeck = this.m.pts.cpu.deck;
    const before = new Set(g.table.cpu.map((c) => c.id));
    const r = g.play();
    if (!r) return;
    let k = 0;
    for (const c of g.table.cpu) {
      if (before.has(c.id)) continue;
      const sp = this.sprites.get(c.id);
      sp.holdAt = { x: cpuDeck.x, y: cpuDeck.y, z: 200 };
      sp.waitUntil = now + CPU_DELAY + k++ * 40;
    }
    this.syncCards();
    this.lockUntil = now + 220;

    const show = this.auto ? AUTO_SHOW_MS : SHOW_MS;
    if (r.type === 'war') {
      this.banner('WAR!', 'war', now + CPU_DELAY + 120);
      this.autoAt = now + WAR_PAUSE_MS;
    } else if (r.type === 'battle') {
      this.banner(r.winner === 'you' ? 'You take it' : 'CPU takes it', r.winner, now + CPU_DELAY + 160);
      this.collectAt = now + show;
    } else {
      this.banner(r.winner === 'you' ? 'CPU is out of cards' : "You're out of cards", r.winner, now + CPU_DELAY);
      this.collectAt = now + show + 300;
    }
    this.updateHUD();
  }

  collect(now = performance.now()) {
    this.collectAt = 0;
    this.game.collect();
    this.syncCards();
    this.banner('', null, now);
    this.autoAt = now + AUTO_GAP_MS;
    this.save();
    this.updateHUD();
    if (this.game.winner && !this.overShown) {
      this.overShown = true;
      this.auto = false;
      const won = this.game.winner === 'you';
      this.overTitle.textContent = won ? 'You won!' : 'CPU wins';
      this.overStats.textContent = `${this.game.rounds} rounds · ${this.game.wars} ${this.game.wars === 1 ? 'war' : 'wars'}`;
      setTimeout(() => this.overEl.classList.add('show'), 650);
      this.updateHUD();
    }
  }

  /** Player tap: finish the shown round right away, then flip the next one. */
  tap() {
    const now = performance.now();
    if (this.game.winner || now < this.lockUntil) return;
    if (this.auto) {
      this.toggleAuto();
      return;
    }
    if (this.collectAt) this.collect(now);
    if (!this.game.winner) this.play(now);
  }

  banner(text, kind, at) {
    clearTimeout(this.bannerTimer);
    const apply = () => {
      this.bannerEl.textContent = text;
      this.bannerEl.className = `war-banner${text ? ' show' : ''}${kind ? ` ${kind}` : ''}`;
    };
    const delay = at - performance.now();
    if (delay > 0) this.bannerTimer = setTimeout(apply, delay);
    else apply();
  }

  toggleAuto() {
    if (this.game.winner) return;
    this.auto = !this.auto;
    this.autoAt = performance.now() + 150;
    this.updateHUD();
  }

  newGame() {
    this.collectAt = 0;
    this.auto = false;
    this.overShown = false;
    this.overEl.classList.remove('show');
    this.banner('', null, 0);
    this.game = new War();
    this.syncCards();
    this.dealAnimation(320);
    this.save();
    this.updateHUD();
  }

  /** Cards gather in the middle, then go out alternately to each player. */
  dealAnimation(gather) {
    const now = performance.now();
    const order = [];
    for (let i = 0; i < 26; i++) for (const p of PLAYERS) order.push(this.game.decks[p][25 - i]);
    order.forEach((c, i) => {
      const sp = this.sprites.get(c.id);
      sp.holdAt = null;
      sp.waitUntil = now + gather + i * 22;
    });
    this.lockUntil = now + gather + 52 * 22;
  }

  updateHUD() {
    const g = this.game;
    for (const p of PLAYERS) {
      const n = g.decks[p].length;
      this.labels[p].lastChild.textContent = `${n} ${n === 1 ? 'card' : 'cards'}`;
    }
    this.statsEl.textContent = g.rounds ? `Round ${g.rounds}${g.wars ? ` · ${g.wars} ${g.wars === 1 ? 'war' : 'wars'}` : ''}` : '';
    this.autoBtn.textContent = this.auto ? 'Stop' : 'Auto-play';
    this.autoBtn.classList.toggle('accent', this.auto);
    this.autoBtn.disabled = !!g.winner;
    this.hintEl.classList.toggle('show', !this.auto && !g.winner);
    this.hintEl.textContent = g.atWar ? 'Tap to go to war' : 'Tap to flip';
  }

  // ------------------------------------------------------------------ input

  bindInput() {
    const r = this.root;
    const stop = (e) => e.stopPropagation(); // keep the lab's Input on #screen out of this
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
      if (!this.visible || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (e.target instanceof Element && e.target.closest('button')) return;
        e.preventDefault();
        this.tap();
      }
    });
    window.addEventListener('pagehide', () => this.save());
  }

  /** Pushes back everything time-based by `ms` (the lobby's zoom-in), so the game starts when it lands. */
  postpone(ms) {
    const now = performance.now();
    for (const sp of this.sprites.values()) if (sp.waitUntil > now) sp.waitUntil += ms;
    this.lockUntil = Math.max(this.lockUntil, now) + ms;
    if (this.autoAt) this.autoAt = Math.max(this.autoAt, now) + ms;
    if (this.collectAt) this.collectAt = Math.max(this.collectAt, now) + ms;
  }

  cancel() {}

  // ------------------------------------------------------------ visibility

  show() {
    this.visible = true;
    this.root.classList.add('active');
    this.relayout();
    if (this.placed) return;
    this.placed = true;
    const targets = this.computeTargets();
    for (const [id, sp] of this.sprites) {
      const t = targets.get(id);
      sp.where = t.where;
      if (this.dealOnShow) sp.place(this.m.cx, this.m.cy, 0, 1, 1);
      else sp.place(t.x, t.y, t.rot, 1, t.flip);
    }
    if (this.dealOnShow) this.dealAnimation(120);
    if (this.game.winner) {
      this.overShown = false;
      this.collect();
    }
  }

  hide() {
    this.visible = false;
    this.auto = false;
    this.root.classList.remove('active');
    // Leaving mid-round finishes it, so the saved state is always between rounds.
    if (this.collectAt) this.collect();
    this.save();
    this.updateHUD();
  }

  // ----------------------------------------------------------- persistence

  save() {
    try {
      const data = this.game.serialize();
      if (data) localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      return War.restore(JSON.parse(localStorage.getItem(SAVE_KEY)));
    } catch {
      return null;
    }
  }
}
