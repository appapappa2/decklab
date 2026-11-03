// Cribbage: singleplayer against a CPU, or pass-and-play for two. Your hand is
// the lab's hand (RuleTable + Input): tap 2 cards and press "To crib", then
// peg by dragging a card up or tapping it and pressing Play. A peg board along
// the top shows both scores with front and back pegs. The show counts each
// hand step by step with the breakdown.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { Cribbage, TARGET } from './rules.js';

const SEAT_SCALE = 0.45;
const ROW_SCALE = 0.62; // pegging row and show
const SMALL = 0.42; // crib, stock, used cards
const CPU_DELAY = 900;

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

/** "Fifteen 2 · pair 2" style text for pegging points. */
function pegText(items) {
  return items
    .map((x) => {
      if (x.kind === 'fifteen') return 'fifteen';
      if (x.kind === 'thirtyone') return '31';
      if (x.kind === 'pair') return ['', '', 'a pair', 'pair royal', 'double pair royal'][x.count];
      return `run of ${x.len}`;
    })
    .join(' + ');
}

/** Breakdown of a counted hand: "Fifteen ×2: 4 · Run of 3: 3". */
function showText(items) {
  if (!items.length) return 'Nineteen: no points';
  return items
    .map((x) => {
      if (x.kind === 'fifteen') return `Fifteen${x.count > 1 ? ` ×${x.count}` : ''}: ${x.points}`;
      if (x.kind === 'pair') return `${x.count > 1 ? `${x.count} pairs` : 'Pair'}: ${x.points}`;
      if (x.kind === 'run') return `${x.count > 1 ? `${x.count} runs` : 'Run'} of ${x.len}: ${x.points}`;
      if (x.kind === 'flush') return `Flush of ${x.len}: ${x.points}`;
      return 'Nobs: 1';
    })
    .join(' · ');
}

/** RuleTable that hands played cards straight back to the scene. */
class CribTable extends RuleTable {
  hitDeck() {
    return false;
  }
}

export class CribbageScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.viewer = null;
    this.byId = new Map();
    this.place = new Map(); // card id -> pose for every card not in the lab hand
    this.queue = [];
    this.handoffFor = -1;

    this.buildDOM();
    this.table = new CribTable(
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
    window.addEventListener('pagehide', () => this.save());
  }

  // -------------------------------------------------------------------- DOM

  buildDOM() {
    const r = this.root;
    r.innerHTML = '';
    this.deckEl = h('div', 'deck-pile hx-deck');
    this.deckEl.append(h('div', 'deck-stack back-art', cardBackHTML()));
    this.deckCountEl = h('span', 'deck-count');
    this.deckEl.append(this.deckCountEl);
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
    this.statusEl = h('div', 'game-stats hx-status');
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.showSetup());
    top.append(back, h('div', 'game-title', 'Cribbage'), this.statusEl, newBtn);

    // Peg board: one lane per player, 121 holes in groups of five.
    this.board = h('div', 'cb-board');
    this.lanes = [0, 1].map(() => {
      const lane = h('div', 'cb-lane');
      const name = h('div', 'cb-name');
      const track = h('div', 'cb-track');
      const backPeg = h('div', 'cb-peg back');
      const frontPeg = h('div', 'cb-peg front');
      track.append(backPeg, frontPeg);
      const score = h('div', 'cb-score');
      lane.append(name, track, score);
      this.board.append(lane);
      return { lane, name, track, backPeg, frontPeg, score };
    });

    this.countEl = h('div', 'cb-count');
    this.cribLabel = h('div', 'rm-row-label cb-crib-label');
    this.starterLabel = h('div', 'rm-row-label cb-starter-label', 'Starter');
    this.oppLabel = h('div', 'rm-label cb-opp');
    this.actions = h('div', 'rm-actions');
    this.cribBtn = h('button', 'game-btn small accent', 'To crib');
    this.cribBtn.type = 'button';
    this.cribBtn.addEventListener('click', () => this.doDiscard());
    this.actions.append(this.cribBtn);
    this.hintEl = h('div', 'rm-hint');
    this.toastEl = h('div', 'c8-toast rm-toast cb-toast');

    this.showEl = h('div', 'cb-show');
    this.showTitle = h('div', 'cb-show-title');
    this.showBody = h('div', 'cb-show-body');
    this.showBtn = h('button', 'game-btn accent', 'Next');
    this.showBtn.type = 'button';
    this.showBtn.addEventListener('click', () => this.showNext());
    this.showEl.append(this.showTitle, this.showBody, this.showBtn);

    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    this.handoffEl = h('div', 'rm-handoff cb-handoff');

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.board, this.countEl, this.cribLabel, this.starterLabel, this.oppLabel, this.actions, this.hintEl,
      this.toastEl, this.showEl, top, this.handoffEl, this.overEl,
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
    const boardTop = safe.top + 50;
    const boardH = 46;
    const oppY = boardTop + boardH + 10 + (ch * SEAT_SCALE) / 2;
    const selLift = (this.table.s.selectLift ?? 0.25) * ch;
    const actionsY = m.handTop - selLift - 30;
    const rowY = (oppY + (ch * SEAT_SCALE) / 2 + actionsY - 24) / 2 + 8;
    m.deck = { x: left + (cw * SMALL) / 2 + 4, y: rowY - ch * ROW_SCALE * 0.75 };
    m.pz = { x: cx, y: rowY, w: right - left, h: ch * 1.6 };
    this.lay = { left, right, cx, boardTop, boardH, oppY, rowY, actionsY };
    this.board.style.transform = `translate(${left}px, ${boardTop}px)`;
    this.board.style.width = `${right - left}px`;
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    pos(this.countEl, cx, rowY - (ch * ROW_SCALE) / 2 - 18, 'translate(-50%, -50%)');
    pos(this.starterLabel, m.deck.x, m.deck.y + (ch * SMALL) / 2 + 10, 'translate(-50%, -50%)');
    pos(this.cribLabel, right - (cw * SMALL) / 2 - 4, m.deck.y + (ch * SMALL) / 2 + 10, 'translate(-50%, -50%)');
    // Landscape is short: the label sits beside the opponent's hand instead of above the crib.
    if (m.landscape) pos(this.oppLabel, cx + cw * SEAT_SCALE * 1.4 + 10, oppY, 'translateY(-50%)');
    else pos(this.oppLabel, right, oppY, 'translate(-100%, -50%)');
    pos(this.actions, cx, actionsY, 'translate(-50%, -50%)');
    pos(this.hintEl, cx, actionsY - 26, 'translate(-50%, -50%)');
    pos(this.toastEl, cx, rowY + (ch * ROW_SCALE) / 2 + 20, 'translate(-50%, -50%)');
    pos(this.showEl, cx, rowY + (ch * ROW_SCALE) / 2 + 14, 'translateX(-50%)');
    if (this.rules) this.sync();
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
    return this.mode === 'multi' ? ['Player 1', 'Player 2'] : ['You', 'CPU'];
  }

  isCpu(p) {
    return this.mode === 'single' && p === 1;
  }

  showSetup() {
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'Cribbage'));
    c.append(h('div', 'game-win-stats', this.mode === 'multi' ? 'Two players, pass and play' : 'You against the computer'));
    c.append(h('div', 'game-win-stats', 'Fifteens, pairs and runs · first to 121'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => this.begin(new Cribbage({ dealer: Math.random() < 0.5 ? 0 : 1 }), true));
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    actions.append(go, lobby);
    c.append(actions);
    this.overEl.classList.add('show');
  }

  begin(rules, deal) {
    this.input.cancel();
    const t = this.table;
    t.clearTable();
    t.discard([...this.byId.values()].filter((sp) => !t.leaving.includes(sp)));
    t.pendingLandings.clear();
    this.byId.clear();
    this.place.clear();
    this.queue = [];
    this.rules = rules;
    this.overEl.classList.remove('show');
    this.handoffEl.classList.remove('show');
    this.showEl.classList.remove('show');
    this.handoffFor = -1;
    this.viewer = this.mode === 'single' ? 0 : null;
    this.sync(deal);
    if (rules.phase === 'show' || rules.phase === 'handOver') this.openShow();
    if (rules.phase === 'over') this.showOver();
    this.save();
  }

  // ----------------------------------------------------------------- sprites

  sprite(card) {
    let sp = this.byId.get(card.id);
    if (!sp) {
      sp = this.table.spriteAtDeck(card);
      sp.scale.set(SMALL);
      this.byId.set(card.id, sp);
    }
    return sp;
  }

  /** Cards the viewer holds right now (in the lab hand). */
  heldBy(p) {
    const r = this.rules;
    if (r.phase === 'discard') return r.hands[p];
    if (r.phase === 'peg') return r.left[p];
    return [];
  }

  sync(deal = false) {
    const r = this.rules;
    const t = this.table;
    const m = t.m;
    const { cx, oppY, rowY, right } = this.lay;
    const now = performance.now();
    this.place.clear();
    const set = (card, x, y, scale, flip, rot = 0, z = 50) => {
      this.sprite(card);
      this.place.set(card.id, { x, y, scale, flip, rot, z });
    };

    // Viewer's hand
    const want = this.viewer == null ? [] : this.heldBy(this.viewer).map((c) => this.sprite(c));
    const wantSet = new Set(want);
    for (const sp of [...t.hand]) if (!wantSet.has(sp)) t.removeFromHand(sp);
    if (t.drag && !wantSet.has(t.drag.sprite)) this.input.cancel();
    const inHand = new Set(t.hand);
    let k = 0;
    for (const sp of want) {
      if (inHand.has(sp) || t.drag?.sprite === sp) continue;
      t.played = t.played.filter((x) => x !== sp);
      t.takeSprite(sp, deal ? 250 + k++ * 70 : 0);
    }
    const sortKey = (c) => c.value * 4 + c.suit.order;
    if (!t.drag) t.hand.sort((a, b) => sortKey(a.card) - sortKey(b.card));

    // Everyone else's cards
    const other = this.viewer == null ? null : 1 - this.viewer;
    const top = this.viewer == null ? null : other;
    const cwS = m.cw * SEAT_SCALE;
    for (const p of [0, 1]) {
      if (p === this.viewer) continue;
      const held = this.heldBy(p);
      const n = held.length;
      // The top seat is the opponent; while the device is passed both hands wait face down.
      held.forEach((c, i) => {
        if (p === top || this.viewer == null) {
          const y = this.viewer == null && p === this.handoffFor ? m.handBaseY - i * 0.4 : oppY;
          const x = this.viewer == null && p === this.handoffFor ? cx + i * 0.5 : cx + (i - (n - 1) / 2) * cwS * 0.55;
          set(c, x, y, this.viewer == null && p === this.handoffFor ? 1 : SEAT_SCALE, 1, 0, 60 + i);
        }
      });
    }
    // Stock with the starter on top (left), crib (right)
    const deckP = m.deck;
    r.stock.slice(-6).forEach((c, i) => set(c, deckP.x - i * 0.3, deckP.y - i * 0.4, SMALL, 1, 0, 10 + i));
    if (r.starter) set(r.starter, deckP.x + 3, deckP.y - 5, SMALL * 1.12, 0, -4, 30);
    const cribX = right - (m.cw * SMALL) / 2 - 4;
    const usedX = this.lay.left + (m.cw * SMALL) / 2 + 4;
    const rowCw = m.cw * ROW_SCALE;
    const inShow = r.phase === 'show' || r.phase === 'handOver' || (r.phase === 'over' && !!this.shown);
    r.crib.forEach((c, i) => set(c, cribX - i * 0.4, deckP.y - i * 0.6, SMALL, 1, 0, 10 + i));

    if (!inShow) {
      // Earlier counts as a used pile, the current count face up in a row.
      r.done.forEach((x, i) => set(x.card, usedX + i * 0.3, rowY + m.ch * 0.25 - i * 0.4, SMALL, 1, 0, 100 + i));
      const plays = this.linger ?? r.plays;
      const gap = Math.min(rowCw * 0.42, (right - this.lay.left - rowCw * 2) / Math.max(1, plays.length - 1));
      const x0 = cx - ((plays.length - 1) * gap) / 2;
      const mineSeat = this.viewer ?? 0;
      plays.forEach((x, i) => set(x.card, x0 + i * gap, rowY + (x.p === mineSeat ? 6 : -6), ROW_SCALE, 0, i % 2 ? 3 : -3, 200 + i));
    } else {
      // The show: kept hands wait in small face-up stacks; the one being counted is in the row.
      const mineSeat = this.viewer ?? 0;
      for (const p of [0, 1]) {
        (r.kept[p] ?? []).forEach((c, i) => set(c, usedX + i * 0.4, p === mineSeat ? rowY + m.ch * 0.3 : oppY, SMALL, 0, 0, 80 + i));
      }
      if (this.shown) {
        const sx = cx - rowCw * 2.2;
        this.shown.cards.forEach((c, i) => set(c, sx + i * rowCw * 0.78, rowY - 6, ROW_SCALE, 0, 0, 300 + i));
        if (r.starter) set(r.starter, sx + 4 * rowCw * 0.78 + rowCw * 0.45, rowY - 6, ROW_SCALE, 0, 6, 310);
      }
    }
    if (deal) {
      let i = 0;
      for (const id of this.place.keys()) {
        const s = this.byId.get(id);
        if (s && !t.hand.includes(s)) s.waitUntil = now + 150 + i++ * 40;
      }
    }
    // Sprites that aren't anywhere anymore (old hands) go away.
    for (const [id, s] of this.byId) {
      if (this.place.has(id) || t.hand.includes(s) || t.drag?.sprite === s) continue;
      s.removeAt = now + 600;
      t.leaving.push(s);
      this.byId.delete(id);
    }
    t.played = [];
    t.pendingLandings.clear();
    this.updateHUD();
  }

  // ------------------------------------------------------------ RuleTable hooks

  myTurn() {
    const r = this.rules;
    if (!r || this.viewer == null || this.busy) return false;
    if (r.phase === 'discard') return !r.kept[this.viewer];
    return r.phase === 'peg' && r.turn === this.viewer;
  }

  /** In the discard phase taps pick two cards; while pegging the usual select + Play. */
  onSelect(sp) {
    if (this.rules.phase !== 'discard') return false;
    const picked = this.table.hand.filter((s) => s.selected);
    if (!sp.selected && picked.length >= 2) picked[0].setSelected(false);
    sp.setSelected(!sp.selected);
    this.table.haptic(5);
    this.updateHUD();
    return true;
  }

  hidePlayButtons() {
    return this.rules?.phase !== 'peg';
  }

  onPlay(sp) {
    const r = this.rules;
    let why = null;
    if (r.phase === 'discard') why = 'Pick two cards for the crib first';
    else if (!this.myTurn()) why = this.viewer == null ? '' : `Wait, it's ${this.names()[r.turn]}'s turn`;
    else if (!r.canPlay(this.viewer, sp.card)) why = `That would go past 31 (count is ${r.count})`;
    if (why !== null) {
      if (why) {
        this.say(why);
        sp.x.vel += 420;
        this.table.haptic([6, 40, 6]);
      }
      return false;
    }
    this.beforePlays = [...r.plays];
    this.pending = r.play(this.viewer, sp.card.id);
    sp.setSelected(false);
    return true;
  }

  afterPlay() {
    const res = this.pending;
    this.pending = null;
    if (res) this.afterPeg(res, this.viewer);
  }

  stockCount() {
    return 0;
  }

  // ---------------------------------------------------------------- actions

  doDiscard() {
    if (!this.myTurn() || this.rules.phase !== 'discard') return;
    const ids = this.table.hand.filter((s) => s.selected).map((s) => s.card.id);
    if (ids.length !== 2) return this.say('Pick exactly two cards');
    this.afterDiscard(this.rules.discard(this.viewer, ids));
  }

  afterDiscard(res) {
    if (!res) return;
    this.table.haptic(10);
    if (this.mode === 'multi') this.viewer = null; // next player discards in private
    this.sync();
    this.save();
    if (res.starter) {
      this.enqueue(500, () => {
        if (res.heels) this.say(`Jack cut: ${this.names()[this.rules.dealer]} pegs 2 for his heels`);
        this.sync();
      });
      this.enqueue(700, () => {});
    }
    if (this.rules.phase === 'over') this.enqueue(600, () => this.showOver());
  }

  afterPeg(res, p) {
    const r = this.rules;
    const names = this.names();
    const you = this.mode === 'single' && p === 0;
    const bits = [];
    if (res.points) bits.push(`${pegText(res.items)} for ${res.points}`);
    for (const e of res.events) {
      if (e.type === 'go') bits.push(`${names[e.p]}: “Go”`);
      if (e.type === 'last') bits.push(`${this.mode === 'single' && e.p === 0 ? 'You get' : `${names[e.p]} gets`} 1 for the last card`);
    }
    if (bits.length) this.say(`${res.points ? (you ? 'You: ' : `${names[p]}: `) : ''}${bits.join(' · ')}`);
    if (res.points) this.table.haptic([8, 40, 8]);
    // A finished count (31 or go) stays on the table for a moment before it's cleared.
    if (res.events.some((e) => e.type === 'reset') || r.phase === 'show') {
      this.linger = [...(this.beforePlays ?? []), { p, card: res.card }];
      this.enqueue(1000, () => {
        this.linger = null;
        this.sync();
      });
    }
    this.sync();
    this.save();
    if (r.phase === 'show') this.enqueue(900, () => this.openShow());
    if (r.phase === 'over') this.enqueue(900, () => this.showOver());
  }

  // ---------------------------------------------------------------- the show

  openShow() {
    if (this.mode === 'multi') this.viewer = 0; // nothing is hidden anymore
    this.handoffEl.classList.remove('show');
    this.showEl.classList.add('show');
    if (this.rules.phase === 'handOver' && this.rules.lastShow) this.renderShow(this.rules.lastShow);
    else if (this.rules.phase === 'handOver') {
      this.shown = null;
      this.showTitle.textContent = 'Hand over';
      this.showBody.textContent = '';
      this.showBtn.textContent = 'Next hand';
      this.sync();
    } else {
      this.shown = null;
      this.showTitle.textContent = 'The show';
      this.showBody.textContent = `${this.names()[1 - this.rules.dealer]} counts first`;
      this.showBtn.textContent = 'Count';
      this.sync();
    }
  }

  showNext() {
    const r = this.rules;
    if (r.phase === 'handOver') {
      r.nextHand();
      this.shown = null;
      this.showEl.classList.remove('show');
      this.begin(r, true);
      return;
    }
    const step = r.showNext();
    if (!step) return;
    this.renderShow(step);
    this.table.haptic(step.total ? [8, 40, 8] : 4);
    this.save();
    if (r.phase === 'over') this.enqueue(1400, () => this.showOver());
  }

  renderShow(step) {
    const r = this.rules;
    this.shown = step;
    const name = this.names()[step.p];
    const you = this.mode === 'single' && step.p === 0;
    this.showTitle.textContent = `${step.crib ? `${you ? 'Your' : `${name}’s`} crib` : you ? 'Your hand' : `${name}’s hand`}: ${step.total}`;
    this.showBody.textContent = showText(step.items);
    this.showBtn.textContent = r.phase === 'handOver' ? 'Next hand' : r.phase === 'over' ? '…' : 'Next';
    this.showBtn.disabled = r.phase === 'over';
    this.sync();
  }

  // -------------------------------------------------------------------- CPU

  cpuStep() {
    const r = this.rules;
    if (r.phase === 'discard') {
      for (const p of [0, 1]) {
        if (this.isCpu(p) && !r.kept[p]) {
          this.afterDiscard(r.discard(p, r.cpuDiscard(p)));
          return;
        }
      }
    } else if (r.phase === 'peg' && this.isCpu(r.turn)) {
      const seat = r.turn; // read before playing: the play moves the turn on
      const c = r.cpuPlay(seat);
      this.beforePlays = [...r.plays];
      if (c) this.afterPeg(r.play(seat, c.id), seat);
    }
  }

  // ------------------------------------------------------- event playback

  get busy() {
    return this.queue.length > 0;
  }

  enqueue(delay, fn) {
    const last = this.queue.length ? this.queue[this.queue.length - 1].at : performance.now();
    this.queue.push({ at: Math.max(last, performance.now()) + delay, fn });
  }

  /** Who has to act now: { p } or null. */
  actor() {
    const r = this.rules;
    if (r.phase === 'discard') {
      const order = [1 - r.dealer, r.dealer];
      const p = order.find((q) => !r.kept[q]);
      return p ?? null;
    }
    if (r.phase === 'peg') return r.turn;
    return null;
  }

  advance() {
    const r = this.rules;
    if (!r || this.overEl.classList.contains('show')) return;
    if (r.phase === 'discard' && this.mode === 'single' && !r.kept[1]) {
      this.enqueue(400, () => this.cpuStep());
      return;
    }
    const a = this.actor();
    if (a == null) return;
    if (this.isCpu(a)) {
      this.enqueue(CPU_DELAY, () => this.cpuStep());
      return;
    }
    if (this.mode === 'multi' && this.viewer !== a && this.handoffFor !== a) this.showHandoff(a);
  }

  showHandoff(p) {
    this.handoffFor = p;
    this.viewer = null;
    this.sync();
    const el = this.handoffEl;
    el.innerHTML = '';
    const name = this.names()[p];
    const what = this.rules.phase === 'discard' ? 'choose your crib cards' : 'your turn to peg';
    el.append(h('div', 'rm-handoff-title', `${name}: ${what}`), h('div', 'rm-handoff-sub', `Pass the device to ${name}`));
    const b = h('button', 'game-btn accent', `I'm ${name}: show my cards`);
    b.type = 'button';
    b.addEventListener('click', () => {
      el.classList.remove('show');
      this.viewer = p;
      this.sync();
    });
    el.append(b);
    el.classList.add('show');
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    if (!this.rules || !this.table.m) return;
    while (this.queue.length && now >= this.queue[0].at) {
      this.queue.shift().fn();
      if (!this.queue.length) this.updateHUD();
    }
    if (!this.queue.length) this.advance();
    const r = this.rules;
    const mine = this.myTurn() && r.phase === 'peg';
    for (const sp of this.table.hand) {
      const dim = mine && !r.canPlay(this.viewer, sp.card);
      if (sp.dim !== dim) {
        sp.dim = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    }
    this.table.update(now, dt);
    this.stepPlaced(now, dt);
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
  }

  stepPlaced(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    for (const [id, p] of this.place) {
      const sp = this.byId.get(id);
      if (!sp || this.table.hand.includes(sp) || this.table.drag?.sprite === sp) continue;
      if (now < sp.waitUntil) sp.target(m.deck.x, m.deck.y, 0, SMALL, 1, 0);
      else sp.target(p.x, p.y, p.rot, p.scale, p.flip, 0);
      sp.z = p.z;
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
    }
  }

  // -------------------------------------------------------------------- HUD

  updateHUD() {
    const r = this.rules;
    if (!r) return;
    const names = this.names();
    // Board: the viewer's lane on the bottom.
    const order = this.viewer === 1 ? [0, 1] : [1, 0];
    order.forEach((p, i) => {
      const lane = this.lanes[i];
      lane.name.textContent = `${names[p]}${p === r.dealer ? ' · dealer' : ''}`;
      lane.score.textContent = String(r.scores[p]);
      lane.frontPeg.style.left = `${(r.scores[p] / TARGET) * 100}%`;
      lane.backPeg.style.left = `${(r.back[p] / TARGET) * 100}%`;
      lane.lane.classList.toggle('mine', p === (this.viewer ?? -1));
      lane.lane.classList.toggle('p2', p === 1);
    });
    const opp = this.viewer == null ? null : 1 - this.viewer;
    this.oppLabel.innerHTML = opp == null ? '' : `<div class="rm-name">${names[opp]}</div><div class="rm-sub">${this.heldBy(opp).length} cards</div>`;
    this.cribLabel.textContent = r.crib.length ? `Crib · ${names[r.dealer]}` : '';
    this.starterLabel.style.visibility = r.starter && r.phase === 'peg' ? '' : 'hidden';
    this.countEl.textContent = r.phase === 'peg' ? `Count ${r.count}` : '';

    const mine = this.myTurn();
    let status = '';
    if (r.phase === 'discard') status = mine ? 'Choose 2 for the crib' : this.viewer == null ? '' : 'Waiting…';
    else if (r.phase === 'peg') status = mine ? 'Your turn' : this.viewer == null ? '' : `${names[r.turn]}’s turn…`;
    else if (r.phase === 'show' || r.phase === 'handOver') status = 'The show';
    this.statusEl.textContent = status;
    this.statusEl.classList.toggle('mine', mine);

    const discard = r.phase === 'discard' && this.viewer != null;
    const picked = this.table.hand.filter((s) => s.selected).length;
    this.actions.style.display = discard ? '' : 'none';
    this.cribBtn.disabled = !mine || picked !== 2;
    this.cribBtn.textContent = `To ${this.viewer === r.dealer ? 'your' : `${names[r.dealer]}’s`} crib · ${picked}/2`;
    let hint = '';
    if (discard && mine) hint = this.viewer === r.dealer ? 'Your crib: keep your best four' : `${names[r.dealer]}'s crib: don't give away points`;
    else if (r.phase === 'peg' && mine) hint = 'Drag a card up, or tap it and press Play';
    this.hintEl.textContent = hint;
  }

  say(msg) {
    if (!msg) return;
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }

  showOver() {
    const r = this.rules;
    const names = this.names();
    this.showEl.classList.remove('show');
    const c = this.overCard;
    c.innerHTML = '';
    const you = this.mode === 'single' && r.winner === 0;
    c.append(h('div', 'game-win-title', you ? 'You won!' : `${names[r.winner]} wins`));
    const loser = 1 - r.winner;
    const skunk = r.scores[loser] < 61 ? ' · double skunk!' : r.scores[loser] < 91 ? ' · skunk!' : '';
    c.append(h('div', 'game-win-stats', `${r.scores[0]} – ${r.scores[1]}${skunk}`));
    const row = h('div', 'game-win-actions');
    const again = h('button', 'game-btn accent', 'Play again');
    again.type = 'button';
    again.addEventListener('click', () => this.showSetup());
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    row.append(again, lobby);
    c.append(row);
    this.updateHUD();
    this.overEl.classList.add('show');
  }

  // ------------------------------------------------------------ visibility

  show() {
    this.root.classList.add('active');
    this.table.relayout();
    if (!this.mode) this.setMode('single');
    if (this.pendingStart) this.start();
  }

  hide() {
    this.input.cancel();
    this.root.classList.remove('active');
    this.save();
  }

  cancel() {
    this.input.cancel();
  }

  postpone(ms) {
    const now = performance.now();
    for (const sp of this.byId.values()) if (sp.waitUntil > now) sp.waitUntil += ms;
    if (this.queue.length) for (const q of this.queue) q.at = Math.max(q.at, now) + ms;
    else this.queue.push({ at: now + ms, fn: () => {} });
  }

  // ----------------------------------------------------------- persistence

  saveKey() {
    return `thedeck.cribbage.${this.mode}.v1`;
  }

  save() {
    if (!this.rules || !this.mode) return;
    try {
      if (this.rules.phase === 'over') localStorage.removeItem(this.saveKey());
      else localStorage.setItem(this.saveKey(), JSON.stringify(this.rules.serialize()));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      return Cribbage.restore(JSON.parse(localStorage.getItem(this.saveKey())));
    } catch {
      return null;
    }
  }
}

