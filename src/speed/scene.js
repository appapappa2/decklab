// Speed (Stress) against a CPU, in real time. Your hand is the lab's hand
// (RuleTable + Input): tap a card to play it wherever it fits, or drag it onto
// the center pile you want. The CPU plays on its own clock (Easy / Normal /
// Hard); when nobody can play, the side piles flip after a short pause.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { Speed, fits } from './rules.js';

const CENTER_SCALE = 0.8;
const SIDE_SCALE = 0.62;
const CPU_SCALE = 0.55;
const STUCK_MS = 1300; // pause before the side piles flip
const LEVELS = {
  easy: { label: 'Easy', ms: 1700 },
  normal: { label: 'Normal', ms: 1050 },
  hard: { label: 'Hard', ms: 650 },
};
const SAVE_LEVEL = 'thedeck.speed.level';
const BEST_KEY = 'thedeck.speed.best';

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};
const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** RuleTable whose pile is the two center piles. */
class CenterTable extends RuleTable {
  updateTargets(now) {
    super.updateTargets(now);
    this.scene.poseCenters(now);
  }

  hitDeck() {
    return false;
  }
}

export class SpeedScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.rules = null;
    this.level = LEVELS[localStorage.getItem(SAVE_LEVEL)] ? localStorage.getItem(SAVE_LEVEL) : 'normal';
    this.byId = new Map();
    this.cpu = [];
    this.sides = [[], []];
    this.pileOf = new Map(); // center sprite -> pile index
    this.phase = 'setup'; // 'setup' -> 'countdown' -> 'play' (<-> 'paused') -> 'over'
    this.resumeElapsed = 0;
    this.goAt = 0;
    this.cpuAt = 0;
    this.stuckAt = 0;
    this.startedAt = 0;
    this.elapsed = 0;

    this.buildDOM();
    this.table = new CenterTable(
      { screen: root, layer: this.cardsEl, ui: this.uiEl, deck: this.deckEl, deckCount: this.deckCountEl, edgeL: this.edgeL, edgeR: this.edgeR },
      settings,
      haptic,
      this,
    );
    this.input = new Input(root, this.table, device, settings);
    this.sparkles = new SparkleTrail(this.sparklesEl);
    this.ripples = new LandingRipples(this.ripplesEl);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'touchstart']) {
      root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
  }

  // -------------------------------------------------------------------- DOM

  buildDOM() {
    const r = this.root;
    r.innerHTML = '';
    // Your draw pile (the lab's deck element) and the CPU's.
    this.deckEl = h('div', 'deck-pile sd-stock');
    this.deckEl.append(h('div', 'deck-stack back-art', cardBackHTML()));
    this.deckCountEl = h('span', 'deck-count');
    this.deckEl.append(this.deckCountEl);
    this.cpuDeckEl = h('div', 'deck-pile sd-stock');
    this.cpuDeckEl.append(h('div', 'deck-stack back-art', cardBackHTML()));
    this.cpuCountEl = h('span', 'deck-count');
    this.cpuDeckEl.append(this.cpuCountEl);
    this.ripplesEl = h('canvas', 'c8-fx');
    this.cardsEl = h('div', 'cards-layer');
    this.edgeL = h('div', 'edge left', '<span class="count"></span>');
    this.edgeR = h('div', 'edge right', '<span class="count"></span>');
    this.sparklesEl = h('canvas', 'c8-fx c8-sparkles');
    this.uiEl = h('div', 'ui-layer');

    const top = h('div', 'game-bar game-top');
    const back = h('button', 'game-icon', '‹');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back to lobby');
    back.addEventListener('click', () => this.onExit());
    this.clockEl = h('div', 'game-stats sd-clock');
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.showSetup());
    top.append(back, h('div', 'game-title', 'Speed'), this.clockEl, newBtn);

    this.cpuLabel = h('div', 'rm-label sd-label');
    this.youLabel = h('div', 'rm-label sd-label');
    this.bannerEl = h('div', 'sd-banner');
    this.statusEl = h('div', 'rm-hint sd-status');
    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);

    r.append(
      this.deckEl, this.cpuDeckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.cpuLabel, this.youLabel, this.statusEl, this.bannerEl, top, this.overEl,
    );
  }

  // ----------------------------------------------------------------- layout

  setSize(W, H, safe) {
    this.table.setSize(W, H, safe);
    this.sparkles.resize(W, H);
    this.ripples.resize(W, H);
  }

  adjustLayout() {
    const m = this.table.m;
    const { W, safe, cw, ch } = m;
    const left = safe.left + 12;
    const right = W - safe.right - 12;
    const cx = (left + right) / 2;
    const cpuH = ch * CPU_SCALE;
    const cpuY = safe.top + 46 + cpuH / 2 + 10;
    const midY = (cpuY + cpuH / 2 + m.handTop) / 2 - ch * 0.05;
    const gap = cw * CENTER_SCALE * 0.62;
    const sideX = Math.min(cx - gap - cw * CENTER_SCALE * 0.5 - cw * SIDE_SCALE * 0.75, cx - cw * 1.25);
    this.lay = {
      cx, cpuY, midY,
      centers: [cx - gap, cx + gap],
      sides: [Math.max(left + (cw * SIDE_SCALE) / 2, sideX), Math.min(right - (cw * SIDE_SCALE) / 2, 2 * cx - sideX)],
      cpuStock: { x: left + (cw * SIDE_SCALE) / 2, y: cpuY },
    };
    const youY = midY + (ch * CENTER_SCALE) / 2 + (ch * SIDE_SCALE) / 2 + 22;
    m.deck = { x: left + (cw * SIDE_SCALE) / 2, y: Math.min(youY, m.handTop - (ch * SIDE_SCALE) / 2 - 10) };
    // Drops anywhere over the middle count as a play.
    m.pz = { x: cx, y: midY, w: right - left, h: ch * 1.6 };
    const place = (el, p) => {
      el.style.left = `${p.x - cw / 2}px`;
      el.style.top = `${p.y - ch / 2}px`;
      el.style.transform = `scale(${SIDE_SCALE})`;
    };
    place(this.deckEl, m.deck);
    place(this.cpuDeckEl, this.lay.cpuStock);
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    pos(this.cpuLabel, right, cpuY, 'translate(-100%, -50%)');
    pos(this.youLabel, m.deck.x + (cw * SIDE_SCALE) / 2 + 10, m.deck.y, 'translateY(-50%)');
    pos(this.statusEl, cx, midY + (ch * CENTER_SCALE) / 2 + 16, 'translate(-50%, -50%)');
    pos(this.bannerEl, cx, midY, 'translate(-50%, -50%)');
  }

  // ------------------------------------------------------------ game setup

  setMode() {}

  showSetup() {
    this.phase = 'setup';
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'Speed'));
    c.append(h('div', 'game-win-stats', 'Race the CPU: play one up or one down, as fast as you can'));
    const row = h('div', 'rm-count');
    const opts = h('div', 'gs-toggle rm-count-opts sd-levels');
    const paint = () => {
      for (const b of opts.children) b.setAttribute('aria-checked', String(b.dataset.level === this.level));
    };
    for (const [key, l] of Object.entries(LEVELS)) {
      const b = h('button', 'gs-toggle-btn', l.label);
      b.type = 'button';
      b.dataset.level = key;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => {
        this.level = key;
        localStorage.setItem(SAVE_LEVEL, key);
        paint();
      });
      opts.append(b);
    }
    paint();
    row.append(h('div', 'rm-count-label', 'CPU'), opts);
    c.append(row);
    c.append(h('div', 'game-win-stats', 'Tap a card to play it · drag to choose a pile'));
    const best = Number(localStorage.getItem(`${BEST_KEY}.${this.level}`));
    if (best) c.append(h('div', 'game-win-stats', `Best win on ${LEVELS[this.level].label}: ${fmt(best)}`));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Start');
    go.type = 'button';
    go.addEventListener('click', () => this.begin());
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    actions.append(go, lobby);
    c.append(actions);
    this.overEl.classList.add('show');
    this.updateHUD();
  }

  begin() {
    this.input.cancel();
    const t = this.table;
    t.clearTable();
    t.discard([...this.cpu, ...this.sides.flat()]);
    t.pendingLandings.clear();
    this.byId.clear();
    this.cpu = [];
    this.sides = [[], []];
    this.pileOf.clear();
    this.rules = new Speed();
    this.overEl.classList.remove('show');
    this.phase = 'countdown';
    this.elapsed = 0;
    this.resumeElapsed = 0;
    this._count = 0;
    this.stuckAt = 0;
    this.sync(true);
    // 3, 2, 1, Go once the cards have been dealt.
    this.goAt = performance.now() + 1200 + 2400;
    this.updateHUD();
  }

  // ----------------------------------------------------------------- sprites

  sprite(card, from) {
    let sp = this.byId.get(card.id);
    if (!sp) {
      sp = this.table.spriteAtDeck(card);
      if (from) sp.place(from.x, from.y, 0, SIDE_SCALE, 1);
      this.byId.set(card.id, sp);
    }
    return sp;
  }

  sync(deal = false) {
    const r = this.rules;
    const t = this.table;
    const m = this.table.m;
    const now = performance.now();
    const mid = { x: this.lay.cx, y: this.lay.midY };
    // Your hand
    const want = r.hands[0].map((c) => this.sprite(c, deal ? mid : m.deck));
    const wantSet = new Set(want);
    for (const sp of [...t.hand]) if (!wantSet.has(sp)) t.removeFromHand(sp);
    if (t.drag && !wantSet.has(t.drag.sprite)) this.input.cancel();
    const inHand = new Set(t.hand);
    let k = 0;
    for (const sp of want) {
      if (inHand.has(sp) || t.drag?.sprite === sp) continue;
      this.detach(sp);
      t.takeSprite(sp, deal ? 300 + k++ * 90 : 0);
    }
    // Center piles
    const pile = [];
    r.centers.forEach((cards, i) => {
      cards.forEach((c, depth) => {
        const sp = this.sprite(c, mid);
        this.pileOf.set(sp, { i, depth });
        pile.push(sp);
      });
    });
    const onPile = new Set(t.played);
    for (const sp of pile) {
      if (onPile.has(sp)) continue;
      this.detach(sp);
      sp.pileRot = (Math.random() - 0.5) * 16;
      t.placeOnPile(sp);
      if (deal) t.pendingLandings.delete(sp);
    }
    t.played = pile;
    // CPU hand and side piles
    this.cpu = r.hands[1].map((c) => this.sprite(c, deal ? mid : this.lay.cpuStock));
    this.sides = r.sides.map((cards) => cards.map((c) => this.sprite(c, mid)));
    if (deal) {
      this.cpu.forEach((sp, i) => (sp.waitUntil = now + 340 + i * 90));
      this.sides.flat().forEach((sp, i) => (sp.waitUntil = now + 200 + i * 25));
    }
    t.updateDeck();
    this.updateHUD();
  }

  detach(sp) {
    const t = this.table;
    if (t.hand.includes(sp) || t.drag?.sprite === sp) t.removeFromHand(sp);
    const i = t.played.indexOf(sp);
    if (i >= 0) t.played.splice(i, 1);
    t.pendingLandings.delete(sp);
    sp.setSelected(false);
  }

  /** Center cards: stacked with a little scatter; face down until Go. */
  poseCenters(now) {
    const live = this.phase === 'play' || this.phase === 'over';
    this.table.played.forEach((sp) => {
      const at = this.pileOf.get(sp);
      if (!at) return;
      const n = this.rules.centers[at.i].length;
      sp.z = 10 + at.depth;
      if (sp.waitUntil > now) return;
      const lift = Math.min(n - 1 - at.depth, 4);
      sp.target(this.lay.centers[at.i] - lift * 0.4, this.lay.midY - lift * 0.6, sp.pileRot ?? 0, CENTER_SCALE, live ? 0 : 1, 0);
    });
  }

  // ------------------------------------------------------------ RuleTable hooks

  /** Tap = play the card wherever it fits. */
  onSelect(sp) {
    this.table.playFromHand(sp);
    return true;
  }

  hidePlayButtons() {
    return true;
  }

  /** From a drag past the line, a flick, or a tap. */
  onPlay(sp) {
    if (this.phase !== 'play') return false;
    const r = this.rules;
    const targets = r.targets(sp.card);
    if (!targets.length) {
      sp.x.vel += 420;
      this.table.haptic([6, 40, 6]);
      this.flash('bad');
      return false;
    }
    // A drag aims at the pile it was dropped on; otherwise take any that fits.
    const d = this.table.releasing;
    let pile = targets[0];
    if (d) {
      const x = d.fx + d.ox;
      const near = Math.abs(x - this.lay.centers[0]) < Math.abs(x - this.lay.centers[1]) ? 0 : 1;
      if (targets.includes(near)) pile = near;
    } else if (targets.length === 2) {
      // Prefer the pile that keeps another of your cards playable.
      const rest = r.hands[0].filter((c) => c !== sp.card);
      pile = targets.find((i) => rest.some((c) => fits(c, sp.card) || fits(c, r.top(1 - i)))) ?? targets[0];
    }
    this.pending = r.play(0, sp.card.id, pile);
    return !!this.pending;
  }

  afterPlay() {
    const res = this.pending;
    this.pending = null;
    this.afterMove(res, 0);
  }

  stockCount() {
    return this.rules?.stocks[0].length ?? 0;
  }

  afterMove(res, p) {
    this.sync();
    if (!res) return;
    // Give the CPU a moment to react to the new top card.
    const base = LEVELS[this.level].ms;
    if (p === 0) this.cpuAt = Math.max(this.cpuAt, performance.now() + base * 0.35);
    else this.table.haptic(4);
    if (res.won) this.finish();
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    if (!this.rules || !this.table.m) return;
    const r = this.rules;
    if (this.phase === 'countdown') {
      const left = this.goAt - now;
      if (left <= 0) {
        this.phase = 'play';
        this.startedAt = now - this.resumeElapsed; // continues the clock after a pause
        this.resumeElapsed = 0;
        this.cpuAt = now + this.cpuDelay() * 1.2;
        this.banner('Go!', 'go', 600);
        this.table.haptic(20);
      } else if (left < 2400) {
        const n = Math.ceil(left / 800);
        if (n !== this._count) {
          this._count = n;
          this.banner(String(n), 'count', 700);
        }
      }
    }
    if (this.phase === 'play') {
      this.elapsed = now - this.startedAt;
      if (r.stuck) {
        if (!this.stuckAt) {
          this.stuckAt = now + STUCK_MS;
          this.banner(r.sides[0].length || r.sides[1].length ? 'No moves: flipping' : 'No moves: reshuffling', 'info', STUCK_MS);
        } else if (now >= this.stuckAt) {
          this.stuckAt = 0;
          const res = r.flip();
          this.sync();
          this.table.haptic(12);
          this.cpuAt = now + this.cpuDelay();
          if (res?.ended) this.finish();
        }
      } else {
        this.stuckAt = 0;
        if (now >= this.cpuAt) {
          const mv = r.cpuMove(1);
          if (mv) this.afterMove(r.play(1, mv.id, mv.pile), 1);
          this.cpuAt = now + (mv ? this.cpuDelay() : 250);
        }
      }
    }
    // Light up the cards you can play right now.
    const live = this.phase === 'play';
    for (const sp of this.table.hand) {
      const dim = live && !r.targets(sp.card).length;
      if (sp.dim !== dim) {
        sp.dim = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    }
    this.table.update(now, dt);
    this.stepOthers(now, dt);
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
    this.updateClock();
  }

  cpuDelay() {
    return LEVELS[this.level].ms * (0.75 + Math.random() * 0.55);
  }

  stepOthers(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    const { cx, cpuY, midY, sides } = this.lay;
    const cw = m.cw * CPU_SCALE;
    const n = this.cpu.length;
    this.cpu.forEach((sp, i) => {
      if (now < sp.waitUntil) sp.target(cx, midY, 0, SIDE_SCALE, 1, 0);
      else sp.target(cx + (i - (n - 1) / 2) * cw * 0.55, cpuY - Math.min((i - (n - 1) / 2) ** 2, 4), -(i - (n - 1) / 2) * 3, CPU_SCALE, this.phase === 'over' ? 0 : 1, 0);
      sp.z = 70 + i;
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
    });
    this.sides.forEach((list, k) => {
      list.forEach((sp, i) => {
        if (now < sp.waitUntil) sp.target(cx, midY, 0, SIDE_SCALE, 1, 0);
        else sp.target(sides[k] - Math.min(i, 5) * 0.4, midY - Math.min(i, 5) * 0.6, 0, SIDE_SCALE, 1, 0);
        sp.z = 5 + i;
        sp.step(dt, s.stiffness, s.damping);
        sp.render();
      });
    });
  }

  // -------------------------------------------------------------------- HUD

  banner(text, kind, ms) {
    clearTimeout(this.bannerTimer);
    this.bannerEl.textContent = text;
    this.bannerEl.className = `sd-banner show ${kind}`;
    this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  flash(kind) {
    this.root.classList.remove('sd-bad');
    void this.root.offsetWidth;
    if (kind === 'bad') this.root.classList.add('sd-bad');
  }

  updateClock() {
    const t = this.phase === 'setup' ? '' : `${LEVELS[this.level].label} · ${fmt(this.elapsed)}`;
    if (t !== this._clock) {
      this._clock = t;
      this.clockEl.textContent = t;
    }
  }

  updateHUD() {
    const r = this.rules;
    if (!r) {
      this.cpuLabel.textContent = '';
      this.youLabel.textContent = '';
      return;
    }
    this.cpuLabel.innerHTML = `<div class="rm-name">CPU</div><div class="rm-sub">${r.cardsLeft(1)} left</div>`;
    this.youLabel.innerHTML = `<div class="rm-name">You</div><div class="rm-sub">${r.cardsLeft(0)} left</div>`;
    this.cpuCountEl.textContent = r.stocks[1].length ? `${r.stocks[1].length}` : '';
    this.cpuDeckEl.classList.toggle('empty', !r.stocks[1].length);
    const sides = r.sides[0].length + r.sides[1].length;
    this.statusEl.textContent = this.phase === 'play' ? `One up or one down · ${sides} in the side piles` : '';
  }

  finish() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.input.cancel();
    const r = this.rules;
    const won = r.winner === 0;
    const time = this.elapsed;
    const key = `${BEST_KEY}.${this.level}`;
    const best = Number(localStorage.getItem(key)) || 0;
    const record = won && (!best || time < best);
    if (record) localStorage.setItem(key, String(Math.round(time)));
    this.table.haptic(won ? [10, 40, 10, 40, 10] : 20);
    this.sync();
    setTimeout(() => {
      const c = this.overCard;
      c.innerHTML = '';
      c.append(h('div', 'game-win-title', won ? 'You won!' : 'CPU wins'));
      const lines = [`${fmt(time)} on ${LEVELS[this.level].label}`];
      if (!won) lines.push(`You had ${r.cardsLeft(0)} cards left`);
      if (record) lines.push('New best time!');
      c.append(h('div', 'game-win-stats', lines.join(' · ')));
      const row = h('div', 'game-win-actions');
      const again = h('button', 'game-btn accent', 'Play again');
      again.type = 'button';
      again.addEventListener('click', () => this.begin());
      const change = h('button', 'game-btn', 'Change level');
      change.type = 'button';
      change.addEventListener('click', () => this.showSetup());
      row.append(again, change);
      c.append(row);
      this.overEl.classList.add('show');
    }, 900);
  }

  // ------------------------------------------------------------ visibility

  show() {
    this.root.classList.add('active');
    this.table.relayout();
    if (this.phase === 'setup') this.showSetup();
    // Coming back to a paused game counts down again so nobody gets a head start.
    else if (this.phase === 'paused') {
      this.phase = 'countdown';
      this._count = 0;
      this.goAt = performance.now() + 2400;
    }
  }

  hide() {
    this.input.cancel();
    this.root.classList.remove('active');
    if (this.phase === 'play' || this.phase === 'countdown') {
      this.resumeElapsed = this.elapsed;
      this.phase = 'paused';
    }
  }

  cancel() {
    this.input.cancel();
  }

  postpone(ms) {
    const now = performance.now();
    for (const sp of this.byId.values()) if (sp.waitUntil > now) sp.waitUntil += ms;
    if (this.phase === 'countdown') this.goAt += ms;
  }
}
