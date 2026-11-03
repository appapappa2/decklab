// Euchre: South and North against West and East. Singleplayer is you (South)
// with a CPU partner against two CPUs; pass-and-play seats 2–4 people and
// fills the other seats with CPUs. Your hand is the lab's hand (RuleTable +
// Input): call trump on the bidding panel (order up / name a suit, alone or
// not), the dealer discards by dragging a card up, then drag up, flick or
// tap + Play to put a card in the trick. Seats are drawn relative to whoever
// holds the device; a lone maker's partner sits out with their cards dimmed.
import { Input } from '../input.js';
import { cardBackHTML, suitHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { Euchre, teamOf, partnerOf, suitOf, strength, SUIT_IDS } from './rules.js';

const SIDE_SCALE = 0.5;
const TRICK_SCALE = 0.78;
const CPU_DELAY = 650;
const COLLECT_DELAY = 1000;
const SEAT_NAMES = ['South', 'West', 'North', 'East'];
const SUIT_WORD = { C: 'club', D: 'diamond', S: 'spade', H: 'heart' };
const SUIT_NAME = { C: 'clubs', D: 'diamonds', S: 'spades', H: 'hearts' };
const SUIT_RED = { H: true, D: true };
const KITTY_SCALE = 0.62;

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

/** RuleTable whose pile is the trick: each card lands in front of its player. */
class TrickTable extends RuleTable {
  updateTargets(now) {
    super.updateTargets(now);
    const m = this.m;
    this.played.forEach((sp, i) => {
      sp.z = 10 + i;
      if (sp.waitUntil > now) return;
      const p = this.scene.trickPose(sp);
      sp.target(m.pz.x + p.x, m.pz.y + p.y, p.rot, TRICK_SCALE, 0, 0);
    });
  }

  hitDeck() {
    return false;
  }
}

export class EuchreScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.viewer = null;
    this.humans = 1;
    this.byId = new Map();
    this.seats = [[], [], [], []];
    this.trickSeat = new Map(); // card id -> seat, for cards on the table
    this.shownTrick = null; // a finished trick, kept on the table for a moment
    this.collecting = [];
    this.queue = [];
    this.handoffFor = -1;

    this.buildDOM();
    this.table = new TrickTable(
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
    this.scoreEl = h('div', 'game-stats sp-score');
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.showSetup());
    this.trumpEl = h('div', 'eu-trump');
    top.append(back, h('div', 'game-title', 'Euchre'), this.trumpEl, this.scoreEl, newBtn);

    this.labels = [0, 1, 2, 3].map(() => {
      const el = h('div', 'rm-label sp-label');
      el.append(h('div', 'rm-name'), h('div', 'rm-sub'));
      return el;
    });
    this.statusEl = h('div', 'rm-hint sp-status');
    this.toastEl = h('div', 'c8-toast rm-toast');

    // Bidding panel: round one (order up / pass) and round two (name a suit / pass).
    this.bidEl = h('div', 'sp-bid eu-bid');
    this.bidTitle = h('div', 'sp-bid-title');
    this.bidInfo = h('div', 'sp-bid-info');
    this.bidRow = h('div', 'eu-bid-row');
    this.aloneBtn = h('button', 'eu-alone', 'Go alone');
    this.aloneBtn.type = 'button';
    this.aloneBtn.setAttribute('aria-pressed', 'false');
    this.aloneBtn.addEventListener('click', () => {
      this.alone = !this.alone;
      this.aloneBtn.setAttribute('aria-pressed', String(this.alone));
    });
    this.bidEl.append(this.bidTitle, this.bidInfo, this.bidRow, this.aloneBtn);

    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    this.handoffEl = h('div', 'rm-handoff sp-handoff');

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      ...this.labels, this.statusEl, this.toastEl, top, this.bidEl, this.handoffEl, this.overEl,
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
    const sideH = ch * SIDE_SCALE;
    const northY = safe.top + 46 + sideH / 2 + 8;
    const midY = (northY + sideH / 2 + m.handTop) / 2;
    const cx = W / 2;
    m.deck = { x: cx, y: midY };
    m.pz = { x: cx, y: midY, w: W * 0.8, h: ch * 2.4 };
    const westX = safe.left + sideH * 0.32;
    const eastX = W - safe.right - sideH * 0.32;
    const sideSpan = Math.min(ch * 1.6, (m.handTop - northY) * 0.55);
    this.lay = { cx, midY, northY, westX, eastX, sideH, sideSpan, landscape: m.landscape };
    // Where collected tricks fly, by relative position (0 bottom, 1 left, 2 top, 3 right).
    this.relPos = [
      { x: cx, y: m.H - safe.bottom + ch * 0.2 },
      { x: westX - sideH, y: midY },
      { x: cx, y: northY - sideH },
      { x: eastX + sideH, y: midY },
    ];
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    this.labelPos = [
      [safe.left + 10, m.handTop - 34, 'translateY(-100%)'],
      [safe.left + 10, midY + sideSpan / 2 + (cw * SIDE_SCALE) / 2 + 10, ''],
      [W - safe.right - 10, northY, 'translate(-100%, -50%)'],
      [W - safe.right - 10, midY + sideSpan / 2 + (cw * SIDE_SCALE) / 2 + 10, 'translateX(-100%)'],
    ];
    if (m.landscape) this.labelPos[0] = [safe.left + 10, northY, 'translateY(-50%)'];
    pos(this.statusEl, cx, midY + ch * 0.95 + 14, 'translate(-50%, -50%)');
    pos(this.toastEl, cx, midY - ch * 0.95 - 10, 'translate(-50%, -50%)');
    pos(this.bidEl, cx, midY + ch * 0.62, 'translate(-50%, 0)');
    this.kittyAt = { x: cx, y: midY - ch * 0.35 };
    this.placeLabels();
  }

  /** Position on screen (0 bottom, 1 left, 2 top, 3 right) of a seat. */
  rel(seat) {
    return (seat - this.focus() + 4) % 4;
  }

  focus() {
    return this.viewer ?? (this.isHuman(this.rules?.turn) ? this.rules.turn : this.firstHuman());
  }

  trickPose(sp) {
    const seat = this.trickSeat.get(sp.card.id) ?? 0;
    const r = this.rel(seat);
    const m = this.table.m;
    const x = (this.lay.landscape ? 1.15 : 0.85) * m.cw;
    const y = (this.lay.landscape ? 0.28 : 0.48) * m.ch;
    const p = [{ x: 0, y }, { x: -x, y: 0 }, { x: 0, y: -y }, { x, y: 0 }][r];
    return { ...p, rot: sp.pileRot ?? 0 };
  }

  placeLabels() {
    if (!this.rules || !this.labelPos) return;
    this.labels.forEach((el, seat) => {
      const [x, y, anchor] = this.labelPos[this.rel(seat)];
      el.style.transform = `translate(${x}px, ${y}px) ${anchor}`;
      el.classList.toggle('right', this.rel(seat) === 3 || this.rel(seat) === 2);
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
    if (saved) {
      this.humans = saved.humans;
      this.begin(saved.rules);
    } else this.showSetup();
  }

  isHuman(seat) {
    return seat != null && seat < this.humans;
  }

  firstHuman() {
    return 0;
  }

  names() {
    if (this.mode === 'single') return ['You', 'West', 'Partner', 'East'];
    let cpu = 0;
    return SEAT_NAMES.map((_, s) => (this.isHuman(s) ? `Player ${s + 1}` : `CPU ${++cpu}`));
  }

  teamNames() {
    if (this.mode === 'single') return ['You & Partner', 'West & East'];
    const n = this.names();
    return [`${n[0]} & ${n[2]}`, `${n[1]} & ${n[3]}`];
  }

  showSetup() {
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'Euchre'));
    if (this.mode === 'multi') {
      let count = Number(localStorage.getItem('thedeck.euchre.humans')) || 2;
      c.append(h('div', 'game-win-stats', 'Pass and play · empty seats are CPUs'));
      const row = h('div', 'rm-count');
      const opts = h('div', 'gs-toggle rm-count-opts');
      const paint = () => {
        for (const b of opts.children) b.setAttribute('aria-checked', String(Number(b.dataset.n) === count));
      };
      for (const v of [2, 3, 4]) {
        const b = h('button', 'gs-toggle-btn', String(v));
        b.type = 'button';
        b.dataset.n = v;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => {
          count = v;
          paint();
        });
        opts.append(b);
      }
      paint();
      row.append(h('div', 'rm-count-label', 'Players'), opts);
      c.append(row);
      c.append(h('div', 'game-win-stats', 'Players 1 & 3 are partners, 2 & 4 are partners'));
      this.setupCount = () => count;
    } else {
      c.append(h('div', 'game-win-stats', 'You and your partner (North) against West and East'));
      this.setupCount = () => 1;
    }
    c.append(h('div', 'game-win-stats', 'Call trump, take 3 of 5 tricks · bowers are high · first team to 10'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => {
      this.humans = this.setupCount();
      if (this.mode === 'multi') localStorage.setItem('thedeck.euchre.humans', String(this.humans));
      this.begin(new Euchre({ dealer: Math.floor(Math.random() * 4) }));
    });
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    actions.append(go, lobby);
    c.append(actions);
    this.overEl.classList.add('show');
  }

  begin(rules, deal = true) {
    this.input.cancel();
    const t = this.table;
    t.clearTable();
    t.discard([...this.seats.flat(), ...this.collecting]);
    t.pendingLandings.clear();
    this.byId.clear();
    this.seats = [[], [], [], []];
    this.trickSeat.clear();
    this.collecting = [];
    this.shownTrick = null;
    this.queue = [];
    this.rules = rules;
    this.alone = false;
    this.aloneBtn.setAttribute('aria-pressed', 'false');
    this.overEl.classList.remove('show');
    this.handoffEl.classList.remove('show');
    this.handoffFor = -1;
    this.viewer = this.mode === 'single' ? 0 : null;
    this.sync(deal);
    if (rules.phase === 'handOver' || rules.phase === 'over') this.showBoard();
    this.save();
  }

  // ----------------------------------------------------------------- sprites

  sprite(card) {
    let sp = this.byId.get(card.id);
    if (!sp) {
      sp = this.table.spriteAtDeck(card);
      this.byId.set(card.id, sp);
    }
    return sp;
  }

  sync(deal = false) {
    const r = this.rules;
    const t = this.table;
    const now = performance.now();
    const used = new Set();
    // Viewer's hand
    const want = this.viewer == null ? [] : r.hands[this.viewer].map((c) => this.sprite(c));
    const wantSet = new Set(want);
    for (const sp of [...t.hand]) if (!wantSet.has(sp)) t.removeFromHand(sp);
    if (t.drag && !wantSet.has(t.drag.sprite)) this.input.cancel();
    const inHand = new Set(t.hand);
    let k = 0;
    for (const sp of want) {
      used.add(sp);
      if (inHand.has(sp) || t.drag?.sprite === sp) continue;
      this.detach(sp);
      t.takeSprite(sp, deal ? 200 + k++ * 45 : 0);
    }
    this.sortHand();
    // The trick on the table
    const trick = this.shownTrick ?? r.trick;
    const pile = trick.map((x) => {
      const sp = this.sprite(x.card);
      this.trickSeat.set(x.card.id, x.seat);
      return sp;
    });
    const onPile = new Set(t.played);
    for (const sp of pile) {
      used.add(sp);
      if (onPile.has(sp)) continue;
      this.detach(sp);
      sp.pileRot = (Math.random() - 0.5) * 14;
      t.placeOnPile(sp);
    }
    t.played = pile;
    // Other hands
    this.seats = r.hands.map((hand, seat) => (seat === this.viewer ? [] : hand.map((c) => this.sprite(c))));
    for (const sp of this.seats.flat()) used.add(sp);
    // The kitty stays in the middle while trump is called (upcard face up in round one).
    this.kitty = r.phase === 'bid1' || r.phase === 'bid2' || r.phase === 'discard' ? r.kitty.map((c) => this.sprite(c)) : [];
    for (const sp of this.kitty) used.add(sp);
    // Finished tricks fly to whoever won them.
    for (const [id, sp] of this.byId) {
      if (used.has(sp)) continue;
      this.detach(sp);
      sp.collectTo = this.relPos[this.rel(this.collectTo ?? 0)];
      sp.removeAt = now + 650;
      this.collecting.push(sp);
      this.byId.delete(id);
      this.trickSeat.delete(id);
    }
    if (deal) [...this.seats.flat(), ...this.kitty].forEach((sp, i) => (sp.waitUntil = now + 150 + i * 30));
    this.placeLabels();
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

  sortHand() {
    const r = this.rules;
    const t = r.trump;
    // Alternate colors; trump (with the left bower) last, strongest on the right.
    const order = t ? [...SUIT_IDS.filter((s) => s !== t && !SUIT_RED[s] === !SUIT_RED[t]), ...SUIT_IDS.filter((s) => s !== t && !SUIT_RED[s] !== !SUIT_RED[t])] : ['C', 'D', 'S', 'H'];
    const rank = (c) => {
      const s = suitOf(c, t);
      if (s === t) return 1000 + strength(c, t);
      const alt = [order[0], order[2], order[1], order[3]].filter(Boolean);
      return alt.indexOf(s) * 20 + (c.value === 1 ? 14 : c.value);
    };
    if (!this.table.drag) this.table.hand.sort((a, b) => rank(a.card) - rank(b.card));
  }

  // ------------------------------------------------------------ RuleTable hooks

  myTurn() {
    const r = this.rules;
    return !!r && this.viewer != null && !this.busy && r.turn === this.viewer && ['bid1', 'bid2', 'discard', 'play'].includes(r.phase);
  }

  onPlay(sp) {
    const r = this.rules;
    let why = null;
    if (!this.myTurn()) why = this.viewer == null ? '' : `Wait, it's ${this.names()[r.turn]}'s turn`;
    else if (r.phase === 'bid1' || r.phase === 'bid2') why = 'Call trump or pass first';
    else if (r.phase === 'discard') {
      r.discard(this.viewer, sp.card.id);
      this.say(`You discard. ${SUIT_NAME[r.trump][0].toUpperCase()}${SUIT_NAME[r.trump].slice(1)} are trump`);
      sp.setSelected(false);
      this.pending = { discarded: true };
      return true;
    } else if (!r.canPlay(this.viewer, sp.card)) why = this.whyNot(sp.card);
    if (why !== null) {
      if (why) {
        this.say(why);
        sp.x.vel += 420;
        this.table.haptic([6, 40, 6]);
      }
      return false;
    }
    this.pending = r.play(this.viewer, sp.card.id);
    sp.setSelected(false);
    return true;
  }

  afterPlay() {
    const res = this.pending;
    this.pending = null;
    if (res?.discarded) {
      // A discard goes face down into the kitty, not onto the trick.
      this.sync();
      this.save();
    } else if (res) this.handleResult(res, this.viewer);
  }

  whyNot(card) {
    const r = this.rules;
    if (r.trick.length) {
      const led = suitOf(r.trick[0].card, r.trump);
      return led === r.trump ? `Follow trump (${SUIT_NAME[r.trump]}; the left bower counts)` : `Follow suit: play a ${SUIT_WORD[led]}`;
    }
    void card;
    return "You can't play that now";
  }

  stockCount() {
    return 0;
  }

  // ---------------------------------------------------------------- actions

  /** A bid from the panel: 'order', 'pass', or a suit id (round two). */
  doBid(choice) {
    if (!this.myTurn()) return;
    const r = this.rules;
    const p = this.viewer;
    let ok;
    if (choice === 'pass') ok = r.pass(p);
    else if (choice === 'order') ok = r.orderUp(p, this.alone);
    else ok = r.name(p, choice, this.alone);
    if (!ok) return;
    this.table.haptic(10);
    this.announce(p, choice);
    this.alone = false;
    this.aloneBtn.setAttribute('aria-pressed', 'false');
    this.sync();
    this.save();
  }

  announce(p, choice) {
    const r = this.rules;
    const you = this.mode === 'single' && p === 0;
    const who = you ? 'You' : this.names()[p];
    if (choice === 'pass') return this.say(`${who} pass${you ? '' : 'es'}`);
    const alone = r.alone ? ', going alone' : '';
    if (choice === 'order') {
      const dealerYou = this.mode === 'single' && r.dealer === 0;
      if (p === r.dealer) this.say(`${who} pick${you ? '' : 's'} it up${alone}`);
      else this.say(`${who} order${you ? '' : 's'} ${dealerYou ? 'you' : this.names()[r.dealer]} up${alone} · ${SUIT_NAME[r.trump]}`);
    } else this.say(`${who} call${you ? '' : 's'} ${SUIT_NAME[r.trump]}${alone}`);
  }

  handleResult(res, seat) {
    if (res.trick) {
      // Leave the full trick on the table for a moment, then collect it.
      this.shownTrick = res.trick.cards;
      this.sync();
      const w = res.trick.winner;
      this.enqueue(COLLECT_DELAY, () => {
        this.shownTrick = null;
        this.collectTo = w;
        this.sync();
        if (this.viewer != null && teamOf(w) === teamOf(this.viewer)) this.table.haptic(8);
      });
      this.enqueue(450, () => {});
      if (res.hand) this.enqueue(300, () => this.showBoard());
    } else this.sync();
    this.save();
  }

  // -------------------------------------------------------------------- CPU

  cpuStep() {
    const r = this.rules;
    const p = r.turn;
    if (this.isHuman(p)) return;
    if (r.phase === 'bid1' || r.phase === 'bid2') {
      const b = r.cpuBid(p);
      if (b.type === 'order') r.orderUp(p, b.alone);
      else if (b.type === 'name') r.name(p, b.suit, b.alone);
      else r.pass(p);
      this.announce(p, b.type === 'name' ? b.suit : b.type);
      this.sync();
      this.save();
    } else if (r.phase === 'discard') {
      r.discard(p, r.cpuDiscard(p));
      this.sync();
      this.save();
    } else if (r.phase === 'play') {
      const card = r.cpuPlay(p);
      this.handleResult(r.play(p, card.id), p);
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

  advance() {
    const r = this.rules;
    if (!r || !['bid1', 'bid2', 'discard', 'play'].includes(r.phase)) return;
    if (!this.isHuman(r.turn)) {
      this.enqueue(r.phase === 'play' ? CPU_DELAY : 700, () => this.cpuStep());
      return;
    }
    if (this.mode === 'multi' && this.viewer !== r.turn && this.handoffFor !== r.turn) this.showHandoff(r.turn);
  }

  showHandoff(seat) {
    this.handoffFor = seat;
    this.viewer = null;
    this.sync();
    const el = this.handoffEl;
    el.innerHTML = '';
    const name = this.names()[seat];
    el.append(
      h('div', 'rm-handoff-title', `${name}: ${{ bid1: 'call trump?', bid2: 'name trump?', discard: 'pick up and discard' }[this.rules.phase] ?? 'your turn'}`),
      h('div', 'rm-handoff-sub', `Pass the device to ${name}`),
    );
    const b = h('button', 'game-btn accent', `I'm ${name}: show my cards`);
    b.type = 'button';
    b.addEventListener('click', () => {
      el.classList.remove('show');
      this.viewer = seat;
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
    if (!this.queue.length && !this.overEl.classList.contains('show')) this.advance();
    const r = this.rules;
    const mine = this.myTurn() && r.phase === 'play';
    const legal = mine ? new Set(r.legal(this.viewer)) : null;
    for (const sp of this.table.hand) {
      const dim = !!legal && !legal.has(sp.card);
      if (sp.dim !== dim) {
        sp.dim = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    }
    const bidding = this.myTurn() && (r.phase === 'bid1' || r.phase === 'bid2');
    const key = bidding ? `${r.phase}:${r.turn}` : '';
    if (key !== this._bidShown) {
      this._bidShown = key;
      this.bidEl.classList.toggle('show', bidding);
      if (bidding) this.fillBidInfo();
    }
    const label = r.phase === 'discard' ? 'Discard' : 'Play';
    if (this.table.buttonLabel !== label) this.table.buttonLabel = label;
    this.table.update(now, dt);
    this.stepSeats(now, dt);
    this.stepKitty(now, dt);
    this.stepCollecting(now, dt);
    for (const list of this.seats) for (const sp of list) {
      const out = this.rules.out !== null && this.rules.hands[this.rules.out].includes(sp.card);
      if (sp.sitOut !== out) {
        sp.sitOut = out;
        sp.el.classList.toggle('eu-out', out);
      }
    }
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
  }

  stepSeats(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    const { cx, midY, northY, westX, eastX, sideSpan } = this.lay;
    const cwS = m.cw * SIDE_SCALE;
    const reveal = this.rules.phase === 'handOver' || this.rules.phase === 'gameOver';
    this.seats.forEach((list, seat) => {
      const r = this.rel(seat);
      const n = list.length;
      const mid = (n - 1) / 2;
      const spacing = r === 2 ? (n > 1 ? Math.min(cwS * 0.35, (Math.min(m.W * 0.5, m.W - 60) - cwS) / (n - 1)) : 0) : n > 1 ? Math.min(cwS * 0.3, (sideSpan - cwS) / (n - 1)) : 0;
      list.forEach((sp, i) => {
        if (now < sp.waitUntil) {
          sp.target(m.deck.x, m.deck.y, 0, 1, 1, 0);
          sp.z = 60;
        } else {
          const d = i - mid;
          const bow = Math.min(d * d * 0.5, 5);
          if (r === 2) sp.target(cx + d * spacing, northY - bow, -d * 2, SIDE_SCALE, reveal ? 0 : 1, 0);
          else if (r === 1) sp.target(westX + bow, midY + d * spacing, 90 + d * 2, SIDE_SCALE, reveal ? 0 : 1, 0);
          else if (r === 3) sp.target(eastX - bow, midY + d * spacing, -90 - d * 2, SIDE_SCALE, reveal ? 0 : 1, 0);
          else sp.target(m.W / 2 + i * 0.5, m.handBaseY - i * 0.4, 0, 1, 1, 0); // passed device: face down where the hand goes
          sp.z = 70 + i;
        }
        sp.step(dt, s.stiffness, s.damping);
        sp.render();
      });
    });
  }

  stepKitty(now, dt) {
    const s = this.table.s;
    const m = this.table.m;
    const r = this.rules;
    const at = this.kittyAt;
    (this.kitty ?? []).forEach((sp, i, a) => {
      const up = r.phase === 'bid1' && i === a.length - 1;
      if (now < sp.waitUntil) sp.target(m.deck.x, m.deck.y, 0, 1, 1, 0);
      else sp.target(at.x + (up ? 4 : -i * 0.6), at.y - (up ? 4 : i * 0.8), up ? 3 : 0, KITTY_SCALE, up ? 0 : 1, up ? 0.3 : 0);
      sp.z = 30 + i;
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
    });
  }

  stepCollecting(now, dt) {
    const s = this.table.s;
    this.collecting = this.collecting.filter((sp) => {
      if (now >= sp.removeAt) {
        sp.destroy();
        return false;
      }
      sp.target(sp.collectTo.x, sp.collectTo.y, 0, 0.5, 1, 0.4);
      sp.z = 900;
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
      return true;
    });
  }

  // -------------------------------------------------------------------- HUD

  fillBidInfo() {
    const r = this.rules;
    const p = this.viewer;
    const dealer = r.dealer === p ? 'You deal' : `${this.names()[r.dealer]} deals${partnerOf(p) === r.dealer && this.mode === 'multi' ? ' (your partner)' : ''}`;
    this.bidRow.innerHTML = '';
    const btn = (html, choice, cls = '') => {
      const b = h('button', `sp-bid-btn ${cls}`, html);
      b.type = 'button';
      b.addEventListener('click', () => this.doBid(choice));
      this.bidRow.append(b);
      return b;
    };
    if (r.phase === 'bid1') {
      const s = r.upcard.suit.id;
      this.bidTitle.innerHTML = `Order up <span class="eu-suit${SUIT_RED[s] ? ' red' : ''}">${suitHTML(s)}</span> ${SUIT_NAME[s]}?`;
      this.bidInfo.textContent = `${dealer} · ${p === r.dealer ? 'you pick up the upcard' : 'the dealer picks up the upcard'}`;
      btn(p === r.dealer ? 'Pick it up' : 'Order up', 'order', 'nil');
      btn('Pass', 'pass');
    } else {
      this.bidTitle.textContent = 'Name trump';
      this.bidInfo.textContent = `${dealer} · ${SUIT_NAME[r.upcard.suit.id]} were turned down${p === r.dealer ? ' · stick the dealer: you must call' : ''}`;
      for (const s of SUIT_IDS) {
        if (s === r.upcard.suit.id) continue;
        btn(`<span class="eu-suit${SUIT_RED[s] ? ' red' : ''}">${suitHTML(s)}</span>`, s, 'eu-suit-btn').setAttribute('aria-label', SUIT_NAME[s]);
      }
      const pass = btn('Pass', 'pass');
      pass.disabled = p === r.dealer;
    }
  }

  updateHUD() {
    const r = this.rules;
    if (!r) return;
    const names = this.names();
    this.labels.forEach((el, seat) => {
      el.firstChild.textContent = names[seat];
      const mate = this.mode === 'multi' && this.viewer != null && seat !== this.viewer && teamOf(seat) === teamOf(this.viewer);
      const bits = [];
      if (seat === r.dealer) bits.push('dealer');
      if (seat === r.maker) bits.push(r.alone ? 'alone' : 'maker');
      if (seat === r.out) bits.push('sits out');
      if (r.phase === 'play' || r.phase === 'handOver') bits.push(`${r.tricks[seat]} trick${r.tricks[seat] === 1 ? '' : 's'}`);
      const info = bits.join(' · ');
      el.lastChild.textContent = mate ? `partner${info ? ` · ${info}` : ''}` : info;
      el.classList.toggle('active', seat === r.turn && ['bid1', 'bid2', 'discard', 'play'].includes(r.phase));
      el.classList.toggle('mate', this.viewer != null && seat !== this.viewer && teamOf(seat) === teamOf(this.viewer));
    });
    const tn = this.mode === 'single' ? ['Us', 'Them'] : ['N/S', 'E/W'];
    this.scoreEl.textContent = `${tn[0]} ${r.scores[0]} · ${tn[1]} ${r.scores[1]}`;
    let status = '';
    if (r.trump) {
      this.trumpEl.innerHTML = `<span class="eu-suit${SUIT_RED[r.trump] ? ' red' : ''}">${suitHTML(r.trump)}</span>`;
      this.trumpEl.title = `${SUIT_NAME[r.trump]} are trump`;
    } else this.trumpEl.innerHTML = '';
    if (this.viewer != null) {
      if (r.phase === 'play') {
        const t = teamOf(this.viewer);
        const makers = teamOf(r.maker) === t;
        status = makers ? `Team ${r.teamTricks(t)} of 3 to make it` : `Team ${r.teamTricks(t)} · 3 euchres them`;
        if (this.myTurn()) status = `Your turn · ${status}`;
      } else if (r.phase === 'discard' && this.myTurn()) status = 'Drag a card up to discard it';
      else if (r.phase === 'bid1' || r.phase === 'bid2') status = this.myTurn() ? '' : `${this.names()[r.turn]} is deciding…`;
    }
    this.statusEl.textContent = status;
  }

  say(msg) {
    if (!msg) return;
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1700);
  }

  showBoard() {
    const r = this.rules;
    const last = r.lastHand;
    const over = r.phase === 'over';
    const teams = this.mode === 'single' ? ['Us', 'Them'] : this.teamNames();
    if (this.mode === 'single') this.viewer = 0;
    const c = this.overCard;
    c.innerHTML = '';
    const names = this.names();
    const maker = this.mode === 'single' && last.maker === 0 ? 'You' : names[last.maker];
    let title = `Hand ${r.handNo}`;
    if (over) title = this.mode === 'single' ? (r.winner === 0 ? 'You won!' : 'They won') : `${this.teamNames()[r.winner]} win`;
    c.append(h('div', 'game-win-title', title));
    const what = {
      euchre: `${maker} called ${SUIT_NAME[last.trump]} and got euchred: ${teams[last.team]} +2`,
      made: `${maker} called ${SUIT_NAME[last.trump]}${last.alone ? ' alone' : ''} and took ${last.made}: ${teams[last.team]} +1`,
      march: `${maker} called ${SUIT_NAME[last.trump]}: all five tricks! ${teams[last.team]} +2`,
      'alone-march': `${maker} went alone and took all five! ${teams[last.team]} +4`,
    }[last.kind];
    c.append(h('div', 'game-win-stats', what));
    const table = h('table', 'hx-scores');
    table.innerHTML = '<tr><th></th><th>Hand</th><th>Total</th></tr>';
    [0, 1].forEach((t) => {
      const tr = h('tr', `${t === 0 && this.mode === 'single' ? 'me' : ''}${r.scores[t] === Math.max(...r.scores) ? ' low' : ''}`);
      for (const v of [teams[t], last.team === t ? `+${last.points}` : '', String(r.scores[t])]) tr.append(h('td', '', v));
      table.append(tr);
    });
    c.append(table);
    c.append(h('div', 'game-win-stats', `First team to ${r.target}`));
    const row = h('div', 'game-win-actions');
    const btn = (label, fn, cls) => {
      const b = h('button', `game-btn ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      row.append(b);
    };
    if (over) {
      btn('Play again', () => this.showSetup(), 'accent');
      btn('Lobby', () => this.onExit(), '');
    } else {
      btn('Next hand', () => {
        r.nextHand();
        this.begin(r);
      }, 'accent');
    }
    c.append(row);
    this.sync();
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
    return `thedeck.euchre.${this.mode}.v1`;
  }

  save() {
    if (!this.rules || !this.mode) return;
    try {
      if (this.rules.phase === 'over') localStorage.removeItem(this.saveKey());
      else localStorage.setItem(this.saveKey(), JSON.stringify({ humans: this.humans, rules: this.rules.serialize() }));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.saveKey()));
      const rules = Euchre.restore(d?.rules);
      return rules ? { rules, humans: d.humans ?? 1 } : null;
    } catch {
      return null;
    }
  }
}
