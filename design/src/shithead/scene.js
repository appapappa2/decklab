// Shithead, singleplayer (you vs 1–3 CPUs) or pass-and-play (2–4 people on one
// device). Your hand is the lab's hand (RuleTable + Input); your six table
// cards sit in three stacks above it. Before play, tap a hand card and then a
// face-up card to swap them, then Ready. In play: select cards of one rank and
// press Play (or drag one up), tap face-up table cards to play them, tap a
// face-down card to flip it blind, or Pick up when you can't play.
//
// The rules object is the source of truth; sync() moves every sprite to where
// the rules say its card is, and the springs animate the difference.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { Shithead, power } from './rules.js';

const PILE_SCALE = 0.72;
const DECK_SCALE = 0.6;
const SEAT_SCALE = 0.3; // other players' hands and table cards
const MINE_SCALE = 0.5; // your table cards
const CPU_DELAY = 800;
const RANK = { 1: 'ace', 11: 'jack', 12: 'queen', 13: 'king' };
const rankName = (c) => RANK[c.value] ?? String(c.value);
const plural = (c, n) => (n === 1 ? `a ${rankName(c)}` : `${n} ${rankName(c)}${c.value === 6 ? 'es' : 's'}`);

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

/** RuleTable with a smaller pile and stock. */
class PileTable extends RuleTable {
  updateTargets(now) {
    super.updateTargets(now);
    const m = this.m;
    this.played.forEach((sp, i) => {
      sp.z = 10 + i;
      if (sp.waitUntil > now) return;
      const o = sp.pile;
      sp.target(m.pz.x + o.x * m.cw * PILE_SCALE, m.pz.y + o.y * m.ch * PILE_SCALE, o.rot, PILE_SCALE, 0, 0);
    });
  }

  hitDeck() {
    return false; // the deck is just for show; drawing back up is automatic
  }
}

export class ShitheadScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.viewer = null;
    this.byId = new Map();
    this.seats = []; // hand sprites per seat (not the viewer)
    this.tableSprites = []; // per seat: { up: [sp|null x3], down: [sp|null x3] }
    this.burning = [];
    this.queue = [];
    this.handoffFor = -1;

    this.buildDOM();
    this.table = new PileTable(
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
    this.deckEl = h('div', 'deck-pile rm-stock');
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
    top.append(back, h('div', 'game-title', 'Shithead'), this.statusEl, newBtn);

    this.labels = [];
    this.pileInfo = h('div', 'rm-row-label sh-pile-info');
    this.actions = h('div', 'rm-actions');
    const act = (label, fn, cls = '') => {
      const b = h('button', `game-btn small ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      this.actions.append(b);
      return b;
    };
    this.readyBtn = act('Ready', () => this.doReady(), 'accent');
    this.playBtn = act('Play', () => this.doPlay(), 'accent');
    this.pickBtn = act('Pick up', () => this.doPickUp());
    this.sortBtn = act('Sort', () => this.sortHand());
    this.hintEl = h('div', 'rm-hint');
    this.toastEl = h('div', 'c8-toast rm-toast');
    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    this.handoffEl = h('div', 'rm-handoff sh-handoff');

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.pileInfo, this.actions, this.hintEl, this.toastEl, top, this.handoffEl, this.overEl,
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
    const top = safe.top + 50;
    const seatH = ch * SEAT_SCALE;
    const boxH = seatH * 2 + 40;
    const left = safe.left + 12;
    const right = W - safe.right - 12;
    const cx = (left + right) / 2;
    const selLift = (this.table.s.selectLift ?? 0.25) * ch;
    const actionsY = m.handTop - selLift - 30;
    const mineH = ch * MINE_SCALE;
    const mineY = actionsY - 40 - mineH / 2;
    const midY = (top + boxH + mineY - mineH / 2) / 2;
    m.deck = { x: cx - cw * 0.85, y: midY };
    m.pz = { x: cx + cw * 0.2, y: midY, w: W * 0.8, h: ch * 1.4 };
    this.deckEl.style.left = `${m.deck.x - cw / 2}px`;
    this.deckEl.style.top = `${m.deck.y - ch / 2}px`;
    this.deckEl.style.transform = `scale(${DECK_SCALE})`;
    this.lay = { top, boxH, seatH, left, right, cx, actionsY, mineY, mineH, midY };
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    pos(this.pileInfo, m.pz.x, midY + (ch * PILE_SCALE) / 2 + 16, 'translate(-50%, -50%)');
    pos(this.actions, cx, actionsY, 'translate(-50%, -50%)');
    pos(this.hintEl, cx, mineY - mineH / 2 - 14, 'translate(-50%, -50%)');
    pos(this.toastEl, cx, top + boxH + 6, 'translate(-50%, -50%)');
  }

  /** Who is in front of the screen: the viewer, or whoever's up next while the device is passed. */
  focus() {
    return this.viewer ?? this.actor();
  }

  /** The seat that has to act now. */
  actor() {
    const r = this.rules;
    if (r.phase === 'swap') {
      const p = r.ready.findIndex((x) => !x);
      return p < 0 ? 0 : p;
    }
    return r.turn;
  }

  seatBoxes() {
    const { left, right, top } = this.lay;
    const n = this.rules.n;
    const f = this.focus();
    const others = [];
    for (let k = 1; k < n; k++) others.push((f + k) % n);
    const w = (right - left) / others.length;
    return new Map(others.map((seat, i) => [seat, { x: left + w * (i + 0.5), y: top, w: w - 8 }]));
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
    if (saved) this.begin(saved);
    else this.showSetup();
  }

  names() {
    return this.mode === 'multi'
      ? Array.from({ length: this.rules.n }, (_, i) => `Player ${i + 1}`)
      : ['You', 'CPU 1', 'CPU 2', 'CPU 3'].slice(0, this.rules.n);
  }

  isCpu(seat) {
    return this.mode === 'single' && seat !== 0;
  }

  showSetup() {
    const multi = this.mode === 'multi';
    let count = Number(localStorage.getItem(`thedeck.shithead.count.${this.mode}`)) || (multi ? 2 : 3);
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'Shithead'));
    c.append(h('div', 'game-win-stats', multi ? 'Pass and play on this device' : 'You against the computer'));
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
    c.append(h('div', 'game-win-stats', '2 resets · 10 burns · four of a kind burns · last one holding cards loses'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => {
      localStorage.setItem(`thedeck.shithead.count.${this.mode}`, String(count));
      const rules = new Shithead({ players: count });
      for (let p = 0; p < rules.n; p++) if (this.mode === 'single' && p !== 0) rules.cpuSwap(p);
      this.begin(rules);
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
    this.input.cancel();
    const t = this.table;
    t.clearTable();
    t.discard([...this.seats.flat(), ...this.tableSprites.flatMap((x) => [...x.up, ...x.down]).filter(Boolean), ...this.burning]);
    t.pendingLandings.clear();
    this.byId.clear();
    this.seats = [];
    this.tableSprites = [];
    this.burning = [];
    this.queue = [];
    this.rules = rules;
    this.overEl.classList.remove('show');
    this.handoffEl.classList.remove('show');
    this.handoffFor = -1;
    this.buildLabels();
    this.viewer = this.mode === 'single' ? 0 : null;
    this.sync(true);
    if (rules.phase === 'over') this.showBoard();
    this.save();
  }

  buildLabels() {
    for (const el of this.labels) el.remove();
    this.labels = this.names().map(() => {
      const el = h('div', 'rm-label');
      el.append(h('div', 'rm-name'), h('div', 'rm-sub'));
      this.root.insertBefore(el, this.actions);
      return el;
    });
  }

  // ----------------------------------------------------------------- sprites

  sprite(card) {
    let sp = this.byId.get(card.id);
    if (!sp) {
      sp = this.table.spriteAtDeck(card);
      sp.scale.set(DECK_SCALE);
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
      t.takeSprite(sp, deal ? 250 + k++ * 60 : 0);
    }
    if (deal) this.sortHand(true);
    // Pile
    const pile = r.pile.map((c) => this.sprite(c));
    const onPile = new Set(t.played);
    for (const sp of pile) {
      used.add(sp);
      if (onPile.has(sp)) continue;
      this.detach(sp);
      t.placeOnPile(sp);
    }
    t.played = pile;
    // Other hands and everyone's table cards
    this.seats = r.hands.map((hand, seat) => (seat === this.viewer ? [] : hand.map((c) => this.sprite(c))));
    this.tableSprites = r.up.map((up, seat) => ({
      up: up.map((c) => (c ? this.sprite(c) : null)),
      down: r.down[seat].map((c) => (c ? this.sprite(c) : null)),
    }));
    for (const sp of this.seats.flat()) used.add(sp);
    for (const ts of this.tableSprites) for (const sp of [...ts.up, ...ts.down]) if (sp) used.add(sp);
    // Anything left over was burned: it flies off and disappears.
    for (const [id, sp] of this.byId) {
      if (used.has(sp)) continue;
      this.detach(sp);
      sp.removeAt = now + 650;
      this.burning.push(sp);
      this.byId.delete(id);
    }
    for (const sp of [...t.pendingLandings]) if (!pile.includes(sp)) t.pendingLandings.delete(sp);
    if (deal) {
      let i = 0;
      for (const ts of this.tableSprites) for (const sp of [...ts.down, ...ts.up]) if (sp) sp.waitUntil = now + 100 + i++ * 30;
      for (const sp of this.seats.flat()) sp.waitUntil = now + 100 + i++ * 30;
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

  sortHand(quiet) {
    // Low to high, with 2s and 10s (the specials) at the end.
    const key = (c) => (c.value === 2 || c.value === 10 ? 100 + c.value : power(c)) * 4 + c.suit.order;
    this.table.hand.sort((a, b) => key(a.card) - key(b.card));
    if (!quiet) this.table.haptic(6);
  }

  // ------------------------------------------------------------ RuleTable hooks

  myTurn() {
    const r = this.rules;
    return !!r && this.viewer != null && !this.busy && r.phase !== 'over' && this.actor() === this.viewer;
  }

  selected() {
    return this.table.hand.filter((sp) => sp.selected);
  }

  onSelect(sp) {
    const on = !sp.selected;
    // Swapping picks one card; playing picks cards of one rank.
    for (const o of this.table.hand) {
      if (o === sp) continue;
      if (this.rules.phase === 'swap' || o.card.value !== sp.card.value) o.setSelected(false);
    }
    sp.setSelected(on);
    this.table.haptic(5);
    this.updateHUD();
    return true;
  }

  hidePlayButtons() {
    return true;
  }

  /** Dragging a card up plays it, with any other selected cards of the same rank. */
  onPlay(sp) {
    const r = this.rules;
    let why = null;
    if (!this.myTurn()) why = this.viewer == null ? '' : `It's ${this.names()[this.actor()]}'s turn`;
    else if (r.phase === 'swap') why = 'Swap cards, then press Ready';
    if (why === null) {
      const ids = [sp.card.id, ...this.selected().filter((o) => o !== sp && o.card.value === sp.card.value).map((o) => o.card.id)];
      const res = r.play(this.viewer, ids);
      if (res) {
        this.pending = res;
        return true;
      }
      why = this.whyNot(sp.card);
    }
    this.say(why);
    if (why) sp.x.vel += 420;
    return false;
  }

  afterPlay() {
    const res = this.pending;
    this.pending = null;
    this.afterAction(res, this.viewer);
  }

  whyNot(card) {
    const t = this.rules.top;
    if (!t) return "You can't play that now";
    return `${rankName(card)} won't go: play a ${rankName(t)} or higher, a 2 or a 10`;
  }

  /** Taps on your own table cards (slot 0–2). */
  pileIndexAt(p) {
    const { cx, mineY, mineH } = this.lay;
    const w = this.table.m.cw * MINE_SCALE;
    if (Math.abs(p.y - mineY) > mineH / 2 + 8) return -1;
    for (let i = 0; i < 3; i++) if (Math.abs(p.x - (cx + (i - 1) * w * 1.35)) <= w / 2 + 4) return i;
    return -1;
  }

  onPileTap(slot) {
    if (!this.myTurn()) return;
    const r = this.rules;
    const me = this.viewer;
    if (r.phase === 'swap') {
      const sel = this.selected()[0];
      if (!sel) return this.say('Tap a card in your hand first, then a face-up card');
      if (!r.up[me][slot]) return;
      r.swap(me, sel.card.id, r.up[me][slot].id);
      this.table.haptic(8);
      this.sync();
      this.save();
      return;
    }
    const src = r.source(me);
    if (src === 'hand') return this.say('Play the cards in your hand first');
    if (src === 'up') {
      const card = r.up[me][slot];
      if (!card) return;
      if (!r.canPlayCard(card)) return this.say(r.canPickUp(me) ? 'Nothing fits: pick up the pile' : this.whyNot(card));
      const ids = r.up[me].filter((c) => c && c.value === card.value).map((c) => c.id);
      this.afterAction(r.play(me, ids), me);
      return;
    }
    if (src === 'down' && r.down[me][slot]) this.afterAction(r.playDown(me, slot), me);
  }

  stockCount() {
    return this.rules?.stock.length ?? 0;
  }

  // ---------------------------------------------------------------- actions

  doReady() {
    if (!this.myTurn() || this.rules.phase !== 'swap') return;
    for (const sp of this.table.hand) sp.setSelected(false);
    this.rules.setReady(this.viewer);
    this.table.haptic(10);
    this.afterAction(null, this.viewer);
  }

  doPlay() {
    if (!this.myTurn()) return;
    const sel = this.selected();
    if (!sel.length) return this.say('Select cards of one rank');
    const res = this.rules.play(this.viewer, sel.map((sp) => sp.card.id));
    if (!res) return this.say(this.whyNot(sel[0].card));
    this.table.haptic(12);
    this.afterAction(res, this.viewer);
  }

  doPickUp() {
    if (!this.myTurn()) return;
    const res = this.rules.pickUp(this.viewer);
    if (!res) return this.say('You have a card you can play');
    this.table.haptic([8, 40, 8]);
    this.afterAction(res, this.viewer);
  }

  /** Re-places the cards and narrates what just happened. */
  afterAction(res, seat) {
    for (const sp of this.table.hand) sp.setSelected(false);
    this.sync();
    this.save();
    if (!res) return;
    const who = this.names()[seat];
    const you = this.mode === 'single' && seat === 0;
    const s = you ? '' : 's';
    let msg = '';
    if (res.pickedUp) msg = `${who} flip${s} a ${rankName(res.blind)}: no good, pick${s} up the pile`;
    else if (!('burn' in res)) msg = `${who} pick${s} up ${res.cards.length}`;
    else if (res.burn) msg = `Burned! ${who} play${s} again`;
    else if (res.blind) msg = `${who} flip${s} a ${rankName(res.blind)}`;
    if (res.out) msg = `${who} ${you ? 'are' : 'is'} out!`;
    if (msg) this.say(msg);
    if (res.burn) this.table.haptic([10, 40, 10, 40, 10]);
    if (res.over) this.enqueue(1200, () => this.showBoard());
  }

  // -------------------------------------------------------------------- CPU

  cpuStep() {
    const r = this.rules;
    const p = r.turn;
    if (r.phase !== 'play' || !this.isCpu(p)) return;
    const mv = r.cpuMove(p);
    let res;
    if (mv.type === 'play') {
      res = r.play(p, mv.ids);
      if (res && !res.burn) this.say(`${this.names()[p]} plays ${plural(res.cards[0], res.cards.length)}`);
    } else if (mv.type === 'pickup') res = r.pickUp(p);
    else res = r.playDown(p, mv.slot);
    this.afterAction(res, p);
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
    if (!r || r.phase === 'over') return;
    const a = this.actor();
    if (this.isCpu(a)) {
      if (r.phase === 'play') this.enqueue(CPU_DELAY, () => this.cpuStep());
      return;
    }
    if (this.mode === 'multi' && this.viewer !== a && this.handoffFor !== a) this.showHandoff(a);
  }

  showHandoff(seat) {
    this.handoffFor = seat;
    this.viewer = null;
    this.sync();
    const el = this.handoffEl;
    el.innerHTML = '';
    const name = this.names()[seat];
    const what = this.rules.phase === 'swap' ? 'swap your cards' : 'your turn';
    el.append(h('div', 'rm-handoff-title', `${name}: ${what}`), h('div', 'rm-handoff-sub', `Pass the device to ${name}`));
    const b = h('button', 'game-btn accent', `I'm ${name}: show my cards`);
    b.type = 'button';
    b.addEventListener('click', () => {
      el.classList.remove('show');
      this.viewer = seat;
      this.sync();
      this.sortHand(true);
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
    // Dim hand cards you can't play on your turn.
    const r = this.rules;
    const mine = this.myTurn() && r.phase === 'play';
    for (const sp of this.table.hand) {
      const dim = mine && !r.canPlayCard(sp.card);
      if (sp.dim !== dim) {
        sp.dim = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    }
    this.table.update(now, dt);
    this.stepSeats(now, dt);
    this.stepBurning(now, dt);
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
  }

  stepSeats(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    const boxes = this.seatBoxes();
    const over = this.rules.phase === 'over';
    const cwS = m.cw * SEAT_SCALE;
    const step = (sp, x, y, rot, scale, flip, z) => {
      if (now < sp.waitUntil) {
        sp.target(m.deck.x, m.deck.y, 0, DECK_SCALE, 1, 0);
        sp.z = 60;
      } else {
        sp.target(x, y, rot, scale, flip, 0);
        sp.z = z;
      }
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
    };
    for (let seat = 0; seat < this.rules.n; seat++) {
      const box = boxes.get(seat);
      const hand = this.seats[seat] ?? [];
      const ts = this.tableSprites[seat];
      if (box) {
        const n = hand.length;
        const spacing = n > 1 ? Math.min(cwS * 0.4, (box.w - cwS) / (n - 1)) : 0;
        hand.forEach((sp, i) => step(sp, box.x + (i - (n - 1) / 2) * spacing, box.y + this.lay.seatH / 2, 0, SEAT_SCALE, over ? 0 : 1, 70 + i));
        const ty = box.y + this.lay.seatH * 1.5 + 6;
        for (let i = 0; i < 3; i++) {
          const x = box.x + (i - 1) * cwS * 1.2;
          if (ts.down[i]) step(ts.down[i], x, ty - 2, 0, SEAT_SCALE, 1, 40);
          if (ts.up[i]) step(ts.up[i], x, ty + 3, 0, SEAT_SCALE, 0, 41);
        }
      } else {
        // The seat in front of the screen: table cards above the hand.
        const w = m.cw * MINE_SCALE;
        for (let i = 0; i < 3; i++) {
          const x = this.lay.cx + (i - 1) * w * 1.35;
          if (ts.down[i]) step(ts.down[i], x, this.lay.mineY - 4, 0, MINE_SCALE, 1, 40);
          if (ts.up[i]) step(ts.up[i], x, this.lay.mineY + 6, (i - 1) * 3, MINE_SCALE, 0, 41);
        }
        // While the device is passed, their hand waits face down where the hand goes.
        hand.forEach((sp, i) => step(sp, m.W / 2 + i * 0.5, m.handBaseY - i * 0.4, 0, 1, 1, 70 + i));
      }
    }
    this.labels.forEach((el, seat) => {
      const box = boxes.get(seat);
      el.style.display = box ? '' : 'none';
      if (box) el.style.transform = `translate(${box.x}px, ${box.y + this.lay.seatH * 2 + 14}px) translateX(-50%)`;
    });
  }

  stepBurning(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    this.burning = this.burning.filter((sp) => {
      if (now >= sp.removeAt) {
        sp.destroy();
        return false;
      }
      sp.target(m.W + m.cw, m.pz.y - m.ch * 0.5, 40, 0.5, 0, 0.6);
      sp.z = 900;
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
      return true;
    });
  }

  // -------------------------------------------------------------------- HUD

  updateHUD() {
    const r = this.rules;
    if (!r) return;
    const names = this.names();
    this.labels.forEach((el, seat) => {
      el.firstChild.textContent = names[seat];
      const out = r.finished.indexOf(seat);
      el.lastChild.textContent = out >= 0 ? `out · #${out + 1}` : `${r.cardsLeft(seat)} cards`;
      el.classList.toggle('active', r.phase !== 'over' && seat === this.actor());
    });
    const mine = this.myTurn();
    const me = this.viewer;
    let status = '';
    if (r.phase === 'swap') status = mine ? 'Swap, then Ready' : this.viewer == null ? '' : 'Waiting…';
    else if (r.phase === 'play') {
      if (me != null && r.finished.includes(me)) status = 'You are out';
      else if (mine) status = 'Your turn';
      else if (me != null) status = `${names[r.turn]}’s turn…`;
    }
    this.statusEl.textContent = status;
    this.statusEl.classList.toggle('mine', mine);

    const t = r.top;
    this.pileInfo.textContent = t
      ? `${t.value === 2 ? 'Reset: anything goes' : `${rankName(t)} or higher`} · ${r.pile.length} in pile`
      : r.burned ? `Burned ${r.burned} · empty pile` : 'Empty pile: anything goes';

    const sel = this.selected();
    const swap = r.phase === 'swap';
    const src = me != null ? r.source(me) : null;
    this.actions.style.visibility = me == null ? 'hidden' : '';
    this.readyBtn.hidden = !swap;
    this.playBtn.hidden = swap;
    this.pickBtn.hidden = swap;
    this.readyBtn.disabled = !mine;
    this.playBtn.disabled = !mine || !sel.length || !r.canPlayCard(sel[0].card);
    this.pickBtn.disabled = !mine || !r.canPickUp(me);
    let hint = '';
    if (me != null) {
      if (swap) hint = 'Tap a hand card, then a face-up card to swap';
      else if (mine && src === 'up') hint = 'Your hand is empty: tap a face-up card';
      else if (mine && src === 'down') hint = 'Last cards: tap a face-down card to flip it';
      else if (mine && r.canPickUp(me)) hint = 'Nothing fits: pick up the pile';
    }
    this.hintEl.textContent = hint;
  }

  say(msg) {
    if (!msg) return;
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }

  showBoard() {
    const r = this.rules;
    const names = this.names();
    if (this.mode === 'single') this.viewer = 0;
    const c = this.overCard;
    c.innerHTML = '';
    const loser = names[r.loser];
    const you = this.mode === 'single' && r.loser === 0;
    c.append(h('div', 'game-win-title', you ? "You're the Shithead!" : `${loser} is the Shithead`));
    if (this.mode === 'single') c.append(h('div', 'game-win-stats', r.finished[0] === 0 ? 'You went out first!' : you ? 'Better luck next time' : `You finished #${r.finished.indexOf(0) + 1}`));
    const table = h('table', 'hx-scores');
    table.innerHTML = '<tr><th>#</th><th></th><th></th></tr>';
    [...r.finished, r.loser].forEach((seat, i) => {
      const tr = h('tr', `${seat === 0 && this.mode === 'single' ? 'me' : ''}${i === 0 ? ' low' : ''}`);
      for (const v of [String(i + 1), names[seat], seat === r.loser ? 'Shithead' : i === 0 ? 'Winner' : 'Out']) tr.append(h('td', '', v));
      table.append(tr);
    });
    c.append(table);
    const row = h('div', 'game-win-actions');
    const again = h('button', 'game-btn accent', 'Play again');
    again.type = 'button';
    again.addEventListener('click', () => this.showSetup());
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    row.append(again, lobby);
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
    return `thedeck.shithead.${this.mode}.v1`;
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
      return Shithead.restore(JSON.parse(localStorage.getItem(this.saveKey())));
    } catch {
      return null;
    }
  }
}
