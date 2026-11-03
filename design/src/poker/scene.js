// Texas Hold'em: singleplayer against 1–5 CPUs, or pass-and-play for 2–6.
// Seats sit around an oval table relative to whoever holds the device; your
// two hole cards are the lab's hand (peek at them with the usual feel). Act
// with Fold / Check or Call / Raise, sizing raises with the slider or the
// quick buttons. At a showdown every contender's cards are shown and the
// winning five are highlighted.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { Holdem, START_STACK, bestHand } from './rules.js';

const SEAT_SCALE = 0.42;
const BOARD_SCALE = 0.6;
const CPU_DELAY = 900;
const STREET_NAME = { flop: 'The flop', turn: 'The turn', river: 'The river' };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

class PokerTable extends RuleTable {
  hitDeck() {
    return false;
  }
}

export class PokerScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.viewer = null;
    this.byId = new Map();
    this.place = new Map();
    this.queue = [];
    this.handoffFor = -1;
    this.seatEls = [];

    this.buildDOM();
    this.table = new PokerTable(
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
    this.feltEl = h('div', 'pk-felt');
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
    this.blindsEl = h('div', 'game-stats pk-blinds');
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.showSetup());
    top.append(back, h('div', 'game-title', 'Hold’em'), this.blindsEl, newBtn);

    this.seatLayer = h('div', 'pk-seats');
    this.potEl = h('div', 'pk-pot');
    this.handEl = h('div', 'pk-myhand');
    this.toastEl = h('div', 'c8-toast rm-toast pk-toast');

    // Action bar: the row of decisions and the raise sizer. Stops pointer and
    // touch events so the slider works (the hand's input would block it).
    this.actions = h('div', 'pk-actions');
    for (const type of ['pointerdown', 'touchstart']) this.actions.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    const row = h('div', 'pk-row');
    const btn = (label, fn, cls = '') => {
      const b = h('button', `game-btn ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    };
    this.foldBtn = btn('Fold', () => this.doAct({ type: 'fold' }), 'pk-fold');
    this.callBtn = btn('Check', () => this.doCall(), 'pk-call');
    this.raiseBtn = btn('Raise', () => this.doRaise(), 'accent');
    row.append(this.foldBtn, this.callBtn, this.raiseBtn);
    this.sizer = h('div', 'pk-sizer');
    this.slider = h('input', 'pk-slider');
    this.slider.type = 'range';
    this.slider.addEventListener('input', () => this.updateRaise());
    const quick = h('div', 'pk-quick');
    for (const [label, f] of [['Min', 'min'], ['½ pot', 0.5], ['Pot', 1], ['All-in', 'max']]) {
      const q = btn(label, () => this.quickSize(f), 'small');
      quick.append(q);
    }
    this.sizer.append(quick, this.slider);
    this.nextBtn = btn('Next hand', () => this.nextHand(), 'accent pk-next');
    this.actions.append(this.sizer, row, this.nextBtn);

    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    this.handoffEl = h('div', 'rm-handoff pk-handoff');

    r.append(
      this.feltEl, this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.seatLayer, this.potEl, this.handEl, this.toastEl, top, this.actions, this.handoffEl, this.overEl,
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
    const land = m.landscape;
    // The top seat's cards sit above its label, so leave room for them under the bar.
    const top = safe.top + 50 + ch * SEAT_SCALE * 0.9;
    const actionsH = 104;
    const actionsY = m.handTop - (this.table.s.selectLift ?? 0.25) * ch - 8;
    // Landscape: the action bar moves to the right and the table takes the rest.
    const bottom = land ? m.handTop + ch * 0.05 : actionsY - actionsH;
    const left = safe.left + 8;
    const right = land ? W - safe.right - 250 : W - safe.right - 8;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2 + 6;
    const rx = (right - left) / 2 - (cw * SEAT_SCALE) / 2 - 8;
    const ry = (bottom - top) / 2 - 8;
    m.deck = { x: cx, y: top + 6 };
    m.pz = { x: cx, y: cy, w: 1, h: 1 }; // nothing is played onto the table
    this.lay = { cx, cy, rx, ry, top, bottom, actionsY };
    this.feltEl.style.cssText = `left:${cx - rx - 4}px;top:${cy - ry * 0.82}px;width:${(rx + 4) * 2}px;height:${ry * 1.64}px`;
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    if (land) {
      // A flat table: the pot goes under the board and messages in the free corner by your cards.
      pos(this.potEl, cx, cy + (ch * BOARD_SCALE) / 2 + 14, 'translate(-50%, -50%)');
      pos(this.toastEl, safe.left + 12, m.H - safe.bottom - 30, 'translateY(-50%)');
    } else {
      pos(this.potEl, cx, cy - (ch * BOARD_SCALE) / 2 - 16, 'translate(-50%, -50%)');
      pos(this.toastEl, cx, cy + (ch * BOARD_SCALE) / 2 + 18, 'translate(-50%, -50%)');
    }
    this.toastEl.classList.toggle('pk-toast-side', land);
    if (land) pos(this.actions, W - safe.right - 8, (safe.top + 50 + m.handTop) / 2, 'translate(-100%, -50%)');
    else pos(this.actions, cx, actionsY, 'translate(-50%, -100%)');
    this.actions.classList.toggle('side', land);
    pos(this.handEl, cx, m.H - safe.bottom - 6, 'translate(-50%, -100%)');
    if (this.rules) this.sync();
  }

  /** Screen position of a seat: you at the bottom, the others clockwise around the oval. */
  seatPos(seat) {
    const { cx, cy, rx, ry } = this.lay;
    const n = this.rules.n;
    const rel = (seat - this.focus() + n) % n;
    if (rel === 0) return { x: cx, y: cy + ry - 4, rel };
    if (this.table.m.landscape) {
      // A wide, short screen: the others spread along the top arc, left to right.
      const a = Math.PI * (1 + (rel - 0.5) / (n - 1));
      return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * (cy - this.lay.top), rel };
    }
    const a = Math.PI / 2 + (rel * 2 * Math.PI) / n;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry * 0.92, rel };
  }

  focus() {
    return this.viewer ?? (this.handoffFor >= 0 ? this.handoffFor : 0);
  }

  // ------------------------------------------------------------ game setup

  /** Switching modes: remove the other mode's cards (that game is saved) and hide the table until the next deal. */
  wipe() {
    this.input?.cancel();
    const t = this.table;
    const sprites = [...(this.byId?.values() ?? []), ...(this.sprites?.values() ?? [])];
    if (t) sprites.push(...t.hand, ...t.played, ...t.leaving, ...(t.drag ? [t.drag.sprite] : []));
    for (const sp of new Set(sprites)) sp.destroy();
    this.byId?.clear();
    this.sprites?.clear();
    if (t) {
      t.hand = [];
      t.played = [];
      t.leaving = [];
      t.drag = null;
      t.pendingLandings.clear();
    }
    this.queue = [];
    if (this.badges) {
      for (const b of this.badges.values()) b.remove();
      this.badges.clear();
    }
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
    if (had) this.wipe();
  }

  start() {
    this.pendingStart = false;
    const saved = this.load();
    if (saved && saved.phase !== 'over') this.begin(saved);
    else this.showSetup();
  }

  names() {
    const n = this.rules.n;
    return this.mode === 'multi' ? Array.from({ length: n }, (_, i) => `Player ${i + 1}`) : ['You', 'CPU 1', 'CPU 2', 'CPU 3', 'CPU 4', 'CPU 5'].slice(0, n);
  }

  isCpu(p) {
    return this.mode === 'single' && p !== 0;
  }

  showSetup() {
    const multi = this.mode === 'multi';
    let count = Number(localStorage.getItem(`thedeck.poker.count.${this.mode}`)) || (multi ? 2 : 4);
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'Texas Hold’em'));
    c.append(h('div', 'game-win-stats', multi ? 'Pass and play · no-limit' : 'You against the computer · no-limit'));
    const row = h('div', 'rm-count');
    const opts = h('div', 'gs-toggle rm-count-opts pk-count');
    const paint = () => {
      for (const b of opts.children) b.setAttribute('aria-checked', String(Number(b.dataset.n) === (multi ? count : count - 1)));
    };
    for (const v of multi ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]) {
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
    c.append(h('div', 'game-win-stats', `${fmt(START_STACK)} chips each · blinds 10/20, rising every 8 hands`));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => {
      localStorage.setItem(`thedeck.poker.count.${this.mode}`, String(count));
      this.begin(new Holdem({ players: count, dealer: Math.floor(Math.random() * count) }));
    });
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    actions.append(go, lobby);
    c.append(actions);
    this.overEl.classList.add('show');
  }

  begin(rules) {
    this.root.classList.remove('fresh');
    this.rules = rules;
    this.overEl.classList.remove('show');
    for (const el of this.seatEls) el.root.remove();
    this.seatEls = Array.from({ length: rules.n }, () => {
      const root = h('div', 'pk-seat');
      const name = h('div', 'pk-name');
      const stack = h('div', 'pk-stack');
      const status = h('div', 'pk-status');
      root.append(name, stack, status);
      const bet = h('div', 'pk-bet');
      const button = h('div', 'pk-button', 'D');
      this.seatLayer.append(root, bet, button);
      return { root, name, stack, status, bet, button };
    });
    this.deal();
  }

  /** Starts the next hand. */
  deal() {
    const r = this.rules;
    this.input.cancel();
    const t = this.table;
    t.clearTable();
    t.discard([...this.byId.values()].filter((sp) => !t.leaving.includes(sp)));
    t.pendingLandings.clear();
    this.byId.clear();
    this.queue = [];
    this.actionsShown = null;
    this.status = Array(r.n).fill('');
    this.handoffFor = -1;
    this.handoffEl.classList.remove('show');
    r.endHand();
    const info = r.startHand();
    if (!info) return this.showOver();
    this.viewer = this.mode === 'single' ? 0 : null;
    this.status[info.sb] = `SB ${info.blinds[0]}`;
    this.status[info.bb] = `BB ${info.blinds[1]}`;
    this.sync(true);
    this.enqueue(700, () => {});
    // All-ins from the blinds can finish the hand straight away.
    if (r.phase !== 'betting') this.enqueue(400, () => this.afterHand(r.result));
    this.save();
  }

  // ----------------------------------------------------------------- sprites

  sprite(card) {
    let sp = this.byId.get(card.id);
    if (!sp) {
      sp = this.table.spriteAtDeck(card);
      sp.scale.set(SEAT_SCALE);
      this.byId.set(card.id, sp);
    }
    return sp;
  }

  sync(deal = false) {
    const r = this.rules;
    const t = this.table;
    const m = t.m;
    const now = performance.now();
    this.place.clear();
    const set = (card, x, y, scale, flip, rot = 0, z = 50) => {
      this.sprite(card);
      this.place.set(card.id, { x, y, scale, flip, rot, z });
    };
    const showdown = r.phase !== 'betting' && r.result?.showdown;
    // finish() clears who is in the hand; the showdown result says who showed cards.
    const reveal = new Set(showdown ? Object.keys(r.result.hands).map(Number) : []);
    // The viewer's hole cards are the lab's hand (unless they've folded).
    const mine = this.viewer != null && r.hole[this.viewer].length && !r.folded[this.viewer] && !showdown ? r.hole[this.viewer].map((c) => this.sprite(c)) : [];
    const mineSet = new Set(mine);
    for (const sp of [...t.hand]) if (!mineSet.has(sp)) t.removeFromHand(sp);
    const inHand = new Set(t.hand);
    let k = 0;
    for (const sp of mine) {
      if (inHand.has(sp) || t.drag?.sprite === sp) continue;
      t.takeSprite(sp, deal ? 300 + k++ * 180 : 0);
    }
    // Everyone else's hole cards at their seats.
    const cwS = m.cw * SEAT_SCALE;
    for (let p = 0; p < r.n; p++) {
      const pos = this.seatPos(p);
      r.hole[p].forEach((c, i) => {
        if (mineSet.has(this.byId.get(c.id))) return;
        const up = reveal.has(p);
        const big = pos.rel === 0;
        const scale = big && up ? 0.62 : SEAT_SCALE;
        const y = big ? pos.y - m.ch * (up ? 0.5 : 0.4) : pos.y - m.ch * SEAT_SCALE * 0.55;
        set(c, pos.x + (i - 0.5) * cwS * (up ? 1.05 : 0.55), y, scale, up ? 0 : 1, (i - 0.5) * (up ? 4 : 8), 60 + i);
      });
    }
    // Board
    const bw = m.cw * BOARD_SCALE;
    r.board.forEach((c, i) => set(c, this.lay.cx + (i - 2) * bw * 1.08, this.lay.cy, BOARD_SCALE, 0, 0, 100 + i));
    // Highlight the winning five at a showdown.
    const win = new Set();
    if (showdown) {
      for (const pot of r.result.pots) for (const q of pot.winners) for (const c of r.result.hands[q].cards) win.add(c.id);
    }
    for (const sp of this.byId.values()) {
      const w = win.has(sp.card.id);
      if (sp.win !== w) {
        sp.win = w;
        sp.el.classList.toggle('pk-win', w);
      }
      const dim = showdown && !w && !mineSet.has(sp);
      if (sp.dimmed !== dim) {
        sp.dimmed = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    }
    if (deal) {
      let i = 0;
      for (let round = 0; round < 2; round++) for (let p = 0; p < r.n; p++) {
        const c = r.hole[p][round];
        const sp = c && this.byId.get(c.id);
        if (sp && !t.hand.includes(sp)) sp.waitUntil = now + 200 + (round * r.n + i++) * 70;
      }
    }
    // Board cards dealt this street come in one by one.
    const fresh = r.board.filter((c) => !this.dealtBoard?.has(c.id));
    fresh.forEach((c, i) => (this.byId.get(c.id).waitUntil = now + 250 + i * 160));
    this.dealtBoard = new Set(r.board.map((c) => c.id));
    t.played = [];
    t.pendingLandings.clear();
    this.updateHUD();
  }

  // ------------------------------------------------------------ RuleTable hooks

  /** The hole cards are only for looking at: taps peek, nothing is played. */
  onSelect() {
    return true;
  }

  hidePlayButtons() {
    return true;
  }

  onPlay() {
    return false;
  }

  stockCount() {
    return 0;
  }

  // ---------------------------------------------------------------- actions

  myTurn() {
    const r = this.rules;
    return !!r && this.viewer != null && !this.busy && r.phase === 'betting' && r.turn === this.viewer;
  }

  doCall() {
    const o = this.rules.options(this.viewer);
    this.doAct({ type: o.canCheck ? 'check' : 'call' });
  }

  doRaise() {
    this.doAct({ type: 'raise', to: Number(this.slider.value) });
  }

  quickSize(f) {
    const r = this.rules;
    const o = r.options(this.viewer);
    let to;
    if (f === 'min') to = o.minTo;
    else if (f === 'max') to = o.maxTo;
    else to = r.currentBet + o.toCall + Math.round(f * (r.pot() + o.toCall));
    this.slider.value = String(Math.max(o.minTo, Math.min(o.maxTo, to)));
    this.updateRaise();
  }

  updateRaise() {
    const r = this.rules;
    if (!r || this.viewer == null || r.phase !== 'betting') return;
    const o = r.options(this.viewer);
    const to = Number(this.slider.value);
    const allIn = to >= o.maxTo;
    this.raiseBtn.textContent = allIn ? `All-in ${fmt(o.maxTo)}` : `${r.currentBet ? 'Raise to' : 'Bet'} ${fmt(to)}`;
  }

  doAct(a) {
    if (!this.myTurn()) return;
    const ev = this.rules.act(this.viewer, a);
    if (!ev) return;
    this.table.haptic(a.type === 'raise' ? [8, 30, 8] : 8);
    this.handle(ev);
  }

  /** Plays back events from the rules: toasts, board deals, the end of the hand. */
  handle(ev) {
    const r = this.rules;
    const names = this.names();
    for (const e of ev) {
      if (e.type === 'action') {
        this.status[e.p] = e.allIn ? 'All-in' : { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise' }[e.action];
        this.say(this.actionText(e, names));
      } else if (e.type === 'street') {
        this.enqueue(450, () => {
          for (let q = 0; q < r.n; q++) if (this.status[q] !== 'Fold' && this.status[q] !== 'All-in') this.status[q] = '';
          this.say(STREET_NAME[e.street]);
          this.sync();
        });
        this.enqueue(e.cards.length * 160 + 500, () => {});
      } else if (e.type === 'win') {
        this.enqueue(500, () => this.afterHand(e));
      }
    }
    if (this.mode === 'multi') this.viewer = null;
    this.sync();
    this.save();
  }

  /** "CPU 2 raises to 120", "You check", "CPU 1 goes all-in for 840". */
  actionText(e, names) {
    const r = this.rules;
    const you = this.mode === 'single' && e.p === 0;
    const who = you ? 'You' : names[e.p];
    const s = you ? '' : 's';
    if (e.allIn && e.action !== 'fold') return `${who} go${you ? '' : 'es'} all-in for ${fmt(e.amount)}`;
    if (e.action === 'fold') return `${who} fold${s}`;
    if (e.action === 'check') return `${who} check${s}`;
    if (e.action === 'call') return `${who} call${s} ${fmt(e.amount)}`;
    // An opening bet after the flop is a bet, anything else a raise.
    const opening = r.street !== 'preflop' && r.bet.every((b, q) => q === e.p || b === 0);
    return opening ? `${who} bet${s} ${fmt(e.amount)}` : `${who} raise${s} to ${fmt(e.amount)}`;
  }

  afterHand(res) {
    const r = this.rules;
    const names = this.names();
    if (this.mode === 'multi') this.viewer = null;
    this.handoffEl.classList.remove('show');
    this.sync();
    const winners = res.won.map((w, q) => [w, q]).filter(([w]) => w > 0);
    const bits = winners.map(([w, q]) => {
      const you = this.mode === 'single' && q === 0;
      const how = res.showdown ? ` with ${res.hands[q].name.toLowerCase()}` : '';
      return `${you ? 'You win' : `${names[q]} wins`} ${fmt(w)}${how}`;
    });
    this.say(bits.join(' · '), 4000);
    for (const [, q] of winners) this.status[q] = res.showdown ? res.hands[q].name : 'Wins';
    if (this.mode === 'single' && winners.some(([, q]) => q === 0)) this.table.haptic([10, 40, 10, 40, 10]);
    this.handDone = true;
    this.updateHUD();
    this.save();
    if (r.phase === 'over' || (this.mode === 'single' && r.stacks[0] === 0)) this.enqueue(1800, () => this.showOver());
  }

  nextHand() {
    if (!this.handDone) return;
    this.handDone = false;
    this.deal();
  }

  // -------------------------------------------------------------------- CPU

  cpuStep() {
    const r = this.rules;
    const p = r.turn;
    if (r.phase !== 'betting' || !this.isCpu(p)) return;
    const ev = r.act(p, r.cpuAct(p, ((p * 37) % 7) / 100 - 0.03));
    if (ev) this.handle(ev);
  }

  // ------------------------------------------------------- event playback

  get busy() {
    return this.queue.length > 0;
  }

  enqueue(delay, fn) {
    const last = this.queue.length ? this.queue[this.queue.length - 1].at : performance.now();
    this.queue.push({ at: Math.max(last, performance.now()) + delay, fn });
  }

  advance() {
    const r = this.rules;
    if (!r || r.phase !== 'betting' || this.overEl.classList.contains('show')) return;
    if (this.isCpu(r.turn)) {
      // You folded: the CPUs play the rest of the hand out quickly.
      const fast = this.mode === 'single' && r.folded[0];
      this.enqueue(fast ? 350 : CPU_DELAY, () => this.cpuStep());
      return;
    }
    if (this.mode === 'multi' && this.viewer !== r.turn && !this.handoffEl.classList.contains('show')) this.showHandoff(r.turn);
  }

  showHandoff(p) {
    this.handoffFor = p;
    this.viewer = null;
    this.sync();
    const el = this.handoffEl;
    el.innerHTML = '';
    const name = this.names()[p];
    el.append(h('div', 'rm-handoff-title', `${name}: your turn`), h('div', 'rm-handoff-sub', `Pass the device to ${name}`));
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
    const mine = this.myTurn();
    if (mine !== this.actionsShown) {
      this.actionsShown = mine;
      this.updateHUD();
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
      if (now < sp.waitUntil) sp.target(m.deck.x, m.deck.y, 0, SEAT_SCALE, 1, 0);
      else sp.target(p.x, p.y, p.rot, p.scale, p.flip, 0);
      sp.z = p.z;
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
    }
  }

  // -------------------------------------------------------------------- HUD

  updateHUD() {
    const r = this.rules;
    if (!r || !this.lay) return;
    const names = this.names();
    const m = this.table.m;
    const [sb, bb] = r.blinds;
    this.blindsEl.textContent = `Blinds ${sb}/${bb} · hand ${r.handNo}`;
    this.potEl.textContent = r.phase === 'betting' || r.result ? `Pot ${fmt(r.phase === 'betting' ? r.pot() : r.result.pots.reduce((a, p) => a + p.amount, 0))}` : '';
    const { cx, cy } = this.lay;
    this.seatEls.forEach((el, p) => {
      const pos = this.seatPos(p);
      const out = !r.stacks[p] && !r.total?.[p] && !(r.phase === 'betting' && r.inHand[p]);
      el.name.textContent = names[p];
      el.stack.textContent = out ? 'out' : fmt(r.stacks[p]);
      el.status.textContent = this.status?.[p] ?? '';
      el.root.classList.toggle('turn', r.phase === 'betting' && r.turn === p);
      el.root.classList.toggle('folded', !!r.folded?.[p] && r.phase === 'betting');
      el.root.classList.toggle('busted', out);
      const below = pos.rel === 0 ? -m.ch * 0.0 : m.ch * SEAT_SCALE * 0.1;
      const y = pos.rel === 0 ? pos.y + 6 : pos.y + below;
      el.root.style.transform = `translate(${pos.x}px, ${y}px) translate(-50%, ${pos.rel === 0 ? '-50%' : '0'})`;
      el.root.classList.toggle('me', pos.rel === 0);
      // Bet chips sit between the seat and the middle.
      const bet = r.phase === 'betting' ? r.bet[p] : 0;
      el.bet.textContent = bet ? fmt(bet) : '';
      el.bet.classList.toggle('show', !!bet);
      const k = pos.rel === 0 ? 0.42 : 0.4;
      el.bet.style.transform = `translate(${pos.x + (cx - pos.x) * k}px, ${pos.y + (cy - pos.y) * k}px) translate(-50%, -50%)`;
      el.button.classList.toggle('show', p === r.dealer && r.handNo > 0);
      const bx = pos.x + (cx - pos.x) * 0.22 + (pos.rel === 0 ? m.cw * 0.6 : 14);
      el.button.style.transform = `translate(${bx}px, ${pos.y + (cy - pos.y) * 0.22}px) translate(-50%, -50%)`;
    });
    // Your best hand so far, under your cards.
    const me = this.viewer;
    this.handEl.textContent = me != null && r.hole[me]?.length && r.board.length >= 3 && !r.folded[me] ? this.bestName(me) : '';

    // Action bar
    const mine = this.myTurn();
    this.actions.classList.toggle('show', mine || !!this.handDone);
    this.nextBtn.hidden = !this.handDone || r.phase === 'over';
    for (const el of [this.foldBtn, this.callBtn, this.raiseBtn, this.sizer]) el.hidden = !mine;
    if (mine) {
      const o = r.options(me);
      this.foldBtn.hidden = o.canCheck;
      this.callBtn.textContent = o.canCheck ? 'Check' : o.toCall >= r.stacks[me] ? `All-in ${fmt(o.toCall)}` : `Call ${fmt(o.toCall)}`;
      this.raiseBtn.hidden = !o.canRaise;
      this.sizer.hidden = !o.canRaise || o.minTo >= o.maxTo;
      this.slider.min = String(o.minTo);
      this.slider.max = String(o.maxTo);
      this.slider.step = String(Math.max(1, r.blinds[0]));
      if (!(Number(this.slider.value) >= o.minTo && Number(this.slider.value) <= o.maxTo) || this._sizedFor !== `${r.handNo}:${r.street}:${r.currentBet}`) {
        this._sizedFor = `${r.handNo}:${r.street}:${r.currentBet}`;
        this.slider.value = String(o.minTo);
      }
      this.updateRaise();
    }
  }

  /** Your best hand so far ("Two pair"), recomputed when the board changes. */
  bestName(p) {
    const r = this.rules;
    const key = `${p}:${r.board.length}:${r.handNo}`;
    if (this._bestKey !== key) {
      this._bestKey = key;
      this._best = bestHand([...r.hole[p], ...r.board]).name;
    }
    return this._best;
  }

  say(msg, ms = 1800) {
    if (!msg) return;
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  showOver() {
    const r = this.rules;
    const names = this.names();
    const c = this.overCard;
    c.innerHTML = '';
    const youOut = this.mode === 'single' && r.stacks[0] === 0;
    let title;
    if (r.phase === 'over') title = this.mode === 'single' && r.winner === 0 ? 'You won the table!' : `${names[r.winner]} wins the table`;
    else title = 'You’re out of chips';
    c.append(h('div', 'game-win-title', title));
    const left = r.stacks.filter((s) => s > 0).length;
    c.append(h('div', 'game-win-stats', youOut && r.phase !== 'over' ? `${left} players left · ${r.handNo} hands` : `${r.handNo} hands`));
    const row = h('div', 'game-win-actions');
    const again = h('button', 'game-btn accent', 'Play again');
    again.type = 'button';
    again.addEventListener('click', () => this.showSetup());
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    row.append(again, lobby);
    c.append(row);
    this.handDone = false;
    this.updateHUD();
    this.overEl.classList.add('show');
    try {
      localStorage.removeItem(this.saveKey());
    } catch {
      /* blocked */
    }
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
    return `thedeck.poker.${this.mode}.v1`;
  }

  save() {
    if (!this.rules || !this.mode) return;
    try {
      localStorage.setItem(this.saveKey(), JSON.stringify(this.rules.serialize()));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      return Holdem.restore(JSON.parse(localStorage.getItem(this.saveKey())));
    } catch {
      return null;
    }
  }
}
