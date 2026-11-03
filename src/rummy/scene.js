// Rummy 500, singleplayer (you vs 1–3 CPUs) or pass-and-play multiplayer
// (2–4 people sharing the device). Your hand is the lab's hand (RuleTable +
// Input): tap cards to select them, then Meld / Lay off / Discard (or drag a
// card up to discard). Tap the stock or any card in the discard spread to draw.
//
// The rules object is the source of truth; after every change sync() moves
// each card's sprite to wherever the rules say it is (hand, other seats,
// discard spread, melds), and the springs animate the difference.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { Rummy500, checkMeld, cardPoints } from './rules.js';

const ROW_SCALE = 0.6; // stock and discard spread
const SEAT_SCALE = 0.34; // other players' hands
const CPU_DELAY = 750;
const SUIT_ORDER = { C: 0, D: 1, S: 2, H: 3 };

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

/** RuleTable with a smaller, spread discard pile and a smaller stock. */
class RummyTable extends RuleTable {
  updateTargets(now) {
    super.updateTargets(now);
    this.scene.poseDiscard();
  }

  hitDeck(p) {
    const { deck, cw, ch } = this.m;
    return Math.abs(p.x - deck.x) < cw * ROW_SCALE * 0.55 && Math.abs(p.y - deck.y) < ch * ROW_SCALE * 0.55;
  }
}

export class RummyScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.viewer = null; // seat whose cards are in the hand (null while passing the device)
    this.byId = new Map();
    this.seats = []; // sprites per seat, for every seat that isn't the viewer
    this.meldSprites = new Map(); // meld id -> sprites
    this.queue = [];
    this.handoffFor = -1;

    this.buildDOM();
    this.table = new RummyTable(
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
    top.append(back, h('div', 'game-title', 'Rummy 500'), this.statusEl, newBtn);

    this.labels = [];
    this.discardLabel = h('div', 'rm-row-label', 'Discard pile · tap a card to take it and all above');

    this.actions = h('div', 'rm-actions');
    const act = (label, fn, cls = '') => {
      const b = h('button', `game-btn small ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      this.actions.append(b);
      return b;
    };
    this.meldBtn = act('Meld', () => this.doMeld(), 'accent');
    this.layBtn = act('Lay off', () => this.doLayOff(), 'accent');
    this.discardBtn = act('Discard', () => this.doDiscard());
    this.sortBtn = act('Sort', () => this.sortHand());
    this.hintEl = h('div', 'rm-hint');

    this.toastEl = h('div', 'c8-toast rm-toast');
    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    this.handoffEl = h('div', 'rm-handoff');

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.discardLabel, this.actions, this.hintEl, this.toastEl, top, this.handoffEl, this.overEl,
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
    const top = safe.top + 46 + 4;
    const boxH = ch * SEAT_SCALE + 40;
    const cwR = cw * ROW_SCALE;
    const chR = ch * ROW_SCALE;
    const rowY = top + boxH + 26 + chR / 2;
    const left = safe.left + 12;
    const right = W - safe.right - 12;
    m.deck = { x: left + cwR / 2, y: rowY };
    const x0 = m.deck.x + cwR * 0.8;
    m.pz = { x: (x0 + right) / 2, y: rowY, w: right - x0 + 20, h: chR + 40 };
    this.deckEl.style.left = `${m.deck.x - cw / 2}px`;
    this.deckEl.style.top = `${m.deck.y - ch / 2}px`;
    this.deckEl.style.transform = `scale(${ROW_SCALE})`;
    const selLift = (this.table.s.selectLift ?? 0.25) * ch;
    const actionsY = m.handTop - selLift - 30;
    this.lay = {
      top, boxH, left, right, rowY, x0, cwR, chR, actionsY,
      meldTop: rowY + chR / 2 + 12,
      meldBottom: actionsY - 28,
    };
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    pos(this.discardLabel, x0, rowY - chR / 2 - 16, 'translateY(-50%)');
    pos(this.actions, (left + right) / 2, actionsY, 'translate(-50%, -50%)');
    pos(this.hintEl, (left + right) / 2, actionsY - 26, 'translate(-50%, -50%)');
    pos(this.toastEl, (left + right) / 2, (rowY + actionsY) / 2, 'translate(-50%, -50%)');
  }

  /** Seat boxes along the top for everyone but the player in front of the screen. */
  seatBoxes() {
    const { left, right, top } = this.lay;
    const n = this.rules.n;
    const focus = this.viewer ?? this.rules.turn;
    const others = [];
    for (let k = 1; k < n; k++) others.push((focus + k) % n);
    const w = (right - left) / others.length;
    return new Map(others.map((seat, i) => [seat, { x: left + w * (i + 0.5), y: top, w: w - 8 }]));
  }

  // ------------------------------------------------------------ game setup

  /** Called by the router with 'single' or 'multi' before show(). */
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
    if (had) this.save(); // keep the other mode's game
    this.mode = m;
    this.rules = null;
    this.pendingStart = true; // started in show(), once the layout exists
    if (had) this.wipe();
  }

  start() {
    this.pendingStart = false;
    const saved = this.load();
    if (saved) this.begin(saved.rules, saved.viewer);
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
    let count = Number(localStorage.getItem(`thedeck.rummy.count.${this.mode}`)) || 2;
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'Rummy 500'));
    c.append(h('div', 'game-win-stats', multi ? 'Pass and play on this device' : 'You against the computer'));
    const row = h('div', 'rm-count');
    const label = h('div', 'rm-count-label', multi ? 'Players' : 'Opponents');
    const opts = h('div', 'gs-toggle rm-count-opts');
    const choices = multi ? [2, 3, 4] : [1, 2, 3];
    const paint = () => {
      for (const b of opts.children) b.setAttribute('aria-checked', String(Number(b.dataset.n) === (multi ? count : count - 1)));
    };
    for (const v of choices) {
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
    row.append(label, opts);
    c.append(row);
    c.append(h('div', 'game-win-stats', '13 cards each with 2 players, 7 with 3–4 · first to 500'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => {
      localStorage.setItem(`thedeck.rummy.count.${this.mode}`, String(count));
      this.overEl.classList.remove('show');
      this.begin(new Rummy500({ players: count }), null);
    });
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    actions.append(go, lobby);
    c.append(actions);
    this.overEl.classList.add('show');
  }

  /** Starts showing a game (new or restored). */
  begin(rules, viewer) {
    this.root.classList.remove('fresh');
    this.input.cancel();
    const t = this.table;
    t.clearTable();
    t.discard([...this.seats.flat(), ...[...this.meldSprites.values()].flat()]);
    t.pendingLandings.clear();
    this.byId.clear();
    this.seats = [];
    this.meldSprites.clear();
    this.queue = [];
    this.rules = rules;
    this.overEl.classList.remove('show');
    this.handoffEl.classList.remove('show');
    this.handoffFor = -1;
    this.buildLabels();
    // Singleplayer always shows seat 0; multiplayer waits for the device to be passed.
    this.viewer = this.mode === 'single' ? 0 : (viewer ?? null);
    this.dealing = true;
    this.sync(true);
    this.dealing = false;
    if (rules.phase === 'handOver' || rules.phase === 'gameOver') this.showBoard();
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
      sp.target(sp.x.v, sp.y.v, 0, ROW_SCALE, 1, 0);
      sp.scale.set(ROW_SCALE);
      this.byId.set(card.id, sp);
    }
    return sp;
  }

  /** Puts every sprite where the rules say its card is. */
  sync(deal = false) {
    const r = this.rules;
    const t = this.table;
    const now = performance.now();
    // Viewer's hand
    const want = new Set(this.viewer == null ? [] : r.hands[this.viewer].map((c) => this.sprite(c)));
    for (const sp of [...t.hand]) if (!want.has(sp)) t.removeFromHand(sp);
    if (t.drag && !want.has(t.drag.sprite)) this.input.cancel();
    const inHand = new Set(t.hand);
    let k = 0;
    for (const sp of want) {
      if (inHand.has(sp) || t.drag?.sprite === sp) continue;
      this.leave(sp);
      t.takeSprite(sp, deal ? 200 + k++ * 60 : 0);
    }
    if (deal) this.sortHand(true);
    // Discard spread
    const pile = r.discard.map((c) => this.sprite(c));
    const onPile = new Set(t.played);
    for (const sp of pile) {
      if (onPile.has(sp)) continue;
      this.leave(sp);
      t.placeOnPile(sp);
    }
    t.played = pile;
    for (const sp of [...t.pendingLandings]) if (!pile.includes(sp)) t.pendingLandings.delete(sp);
    // Other seats
    this.seats = r.hands.map((hand, seat) => (seat === this.viewer ? [] : hand.map((c) => this.sprite(c))));
    // Melds
    this.meldSprites = new Map(r.melds.map((m) => [m.id, m.cards.map((x) => this.sprite(x.card))]));
    // Stagger the deal a little for the other seats too.
    if (deal) this.seats.flat().forEach((sp, i) => (sp.waitUntil = now + 150 + i * 40));
    // Highlights
    for (const sp of this.byId.values()) {
      const must = sp.card.id === r.mustUse && t.hand.includes(sp);
      if (sp.must !== must) {
        sp.must = must;
        sp.el.classList.toggle('rm-must', must);
      }
    }
    t.updateDeck();
    this.updateHUD();
  }

  /** Detaches a sprite from the hand or pile (the other places are rebuilt each sync). */
  leave(sp) {
    const t = this.table;
    if (t.hand.includes(sp) || t.drag?.sprite === sp) t.removeFromHand(sp);
    const i = t.played.indexOf(sp);
    if (i >= 0) t.played.splice(i, 1);
    t.pendingLandings.delete(sp);
    sp.setSelected(false);
  }

  sortHand(quiet) {
    const key = (c) => SUIT_ORDER[c.suit.id] * 20 + (c.value === 1 ? 14 : c.value);
    this.table.hand.sort((a, b) => key(a.card) - key(b.card));
    if (!quiet) this.table.haptic(6);
  }

  // ------------------------------------------------------------ RuleTable hooks

  myTurn() {
    const r = this.rules;
    return !!r && this.viewer != null && r.turn === this.viewer && (r.phase === 'draw' || r.phase === 'play') && !this.busy;
  }

  onSelect(sp) {
    sp.setSelected(!sp.selected);
    this.table.haptic(5);
    this.updateHUD();
    return true;
  }

  hidePlayButtons() {
    return true;
  }

  /** Dragging a card up (or flicking it) discards it. */
  onPlay(sp) {
    const r = this.rules;
    let why = null;
    if (!this.myTurn()) why = this.viewer == null ? '' : `It's ${this.names()[r.turn]}'s turn`;
    else if (r.phase === 'draw') why = 'Draw first: tap the stock or a discard';
    else if (!r.canDiscard(this.viewer, sp.card.id)) why = this.whyNoDiscard(sp.card);
    if (why !== null) {
      this.say(why);
      return false;
    }
    this.pendingDiscard = r.discardCard(this.viewer, sp.card.id);
    return true;
  }

  afterPlay() {
    const res = this.pendingDiscard;
    this.pendingDiscard = null;
    this.afterAction(res);
  }

  onDeckTap() {
    if (!this.myTurn()) return;
    const r = this.rules;
    if (r.phase !== 'draw') return this.say('You already drew this turn');
    r.drawStock(this.viewer);
    this.table.haptic(8);
    this.afterAction(null);
  }

  pileIndexAt(p) {
    const n = this.table.played.length;
    const { rowY, chR, cwR } = this.lay;
    if (Math.abs(p.y - rowY) > chR / 2 + 6) return -1;
    for (let i = n - 1; i >= 0; i--) {
      const x = this.discardX(i, n);
      if (p.x >= x - cwR / 2 && p.x <= x + cwR / 2) return i;
    }
    return -1;
  }

  onPileTap(i) {
    if (!this.myTurn()) return;
    const r = this.rules;
    if (r.phase !== 'draw') return this.say('You already drew this turn');
    if (!r.canTake(this.viewer, i)) return this.say("You can only take a buried card if you can meld it right away");
    r.take(this.viewer, i);
    this.table.haptic(10);
    this.afterAction(null);
    if (r.mustUse) this.say('Now meld the card you dug out (it glows)');
  }

  stockCount() {
    return this.rules?.stock.length ?? 0;
  }

  // ---------------------------------------------------------------- actions

  selected() {
    return this.table.hand.filter((sp) => sp.selected).map((sp) => sp.card);
  }

  doMeld() {
    if (!this.myTurn()) return;
    const res = this.rules.meld(this.viewer, this.selected().map((c) => c.id));
    if (!res) return this.say('Pick 3+ of a kind, or 3+ in a row of one suit');
    this.table.haptic([8, 40, 8]);
    this.afterAction(res.out ? { hand: res.out } : null);
  }

  doLayOff() {
    if (!this.myTurn()) return;
    const res = this.rules.layOff(this.viewer, this.selected().map((c) => c.id));
    if (!res) return this.say("Those don't fit on any meld");
    this.table.haptic(10);
    this.afterAction(res.out ? { hand: res.out } : null);
  }

  doDiscard() {
    if (!this.myTurn()) return;
    const sel = this.selected();
    if (sel.length !== 1) return this.say('Select one card to discard');
    if (!this.rules.canDiscard(this.viewer, sel[0].id)) return this.say(this.whyNoDiscard(sel[0]));
    const res = this.rules.discardCard(this.viewer, sel[0].id);
    this.table.haptic(12);
    this.afterAction(res);
  }

  whyNoDiscard(card) {
    const r = this.rules;
    if (r.mustUse) return 'Meld the card you dug out of the pile first';
    if (card.id === r.noDiscard) return "You can't throw back the card you just took";
    return "You can't discard that now";
  }

  /** After any change to the rules: re-place cards, then hand over or end the hand. */
  afterAction(res) {
    for (const sp of this.table.hand) sp.setSelected(false);
    this.sync();
    this.save();
    if (res?.hand) this.enqueue(700, () => this.showBoard());
  }

  // -------------------------------------------------------------------- CPU

  cpuStep() {
    const r = this.rules;
    const p = r.turn;
    if (!this.isCpu(p) || (r.phase !== 'draw' && r.phase !== 'play')) return;
    let res = null;
    if (r.phase === 'draw') {
      const d = r.cpuDraw(p);
      if (d.type === 'take') {
        const n = r.discard.length - d.index;
        r.take(p, d.index);
        this.say(`${this.names()[p]} takes ${n === 1 ? 'the top discard' : `${n} discards`}`);
      } else r.drawStock(p);
    } else {
      const a = r.cpuAction(p);
      if (a) {
        res = a.type === 'meld' ? r.meld(p, a.ids) : r.layOff(p, a.ids);
        res = res?.out ? { hand: res.out } : null;
      } else {
        res = r.discardCard(p, r.cpuDiscard(p));
      }
    }
    this.afterAction(res);
  }

  // ------------------------------------------------------- event playback

  get busy() {
    return this.queue.length > 0;
  }

  enqueue(delay, fn) {
    const last = this.queue.length ? this.queue[this.queue.length - 1].at : performance.now();
    this.queue.push({ at: Math.max(last, performance.now()) + delay, fn });
  }

  /** With nothing playing back: CPU moves, or pass the device in multiplayer. */
  advance() {
    const r = this.rules;
    if (!r || (r.phase !== 'draw' && r.phase !== 'play')) return;
    if (this.isCpu(r.turn)) {
      this.enqueue(CPU_DELAY, () => this.cpuStep());
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
    el.append(h('div', 'rm-handoff-title', `${name}'s turn`), h('div', 'rm-handoff-sub', `Pass the device to ${name}`));
    const b = h('button', 'game-btn accent', `I'm ${name}: show my cards`);
    b.type = 'button';
    b.addEventListener('click', () => {
      el.classList.remove('show');
      this.viewer = seat;
      this.sync();
      this.sortHand(true);
      this.save();
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
    // Dim discards you can't take, while you're choosing what to draw.
    const r = this.rules;
    const choosing = this.myTurn() && r.phase === 'draw';
    this.table.played.forEach((sp, i) => {
      const dim = choosing && !r.canTake(this.viewer, i);
      if (sp.dim !== dim) {
        sp.dim = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    });
    this.table.update(now, dt);
    this.stepSeats(now, dt);
    this.stepMelds(dt);
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
  }

  discardX(i, n) {
    const { x0, right, cwR } = this.lay;
    const sp = n > 1 ? Math.min(cwR * 0.45, (right - x0 - cwR) / (n - 1)) : 0;
    return x0 + cwR / 2 + i * sp;
  }

  /** Called from RummyTable after the lab sets its pile targets. */
  poseDiscard() {
    const t = this.table;
    const n = t.played.length;
    const now = performance.now();
    t.played.forEach((sp, i) => {
      sp.z = 10 + i;
      if (sp.waitUntil > now) return;
      sp.target(this.discardX(i, n), this.lay.rowY, 0, ROW_SCALE, 0, 0);
    });
  }

  stepSeats(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    const boxes = this.seatBoxes();
    const over = this.rules.phase === 'handOver' || this.rules.phase === 'gameOver';
    const cw = m.cw * SEAT_SCALE;
    this.seats.forEach((list, seat) => {
      const box = boxes.get(seat);
      const n = list.length;
      list.forEach((sp, i) => {
        if (now < sp.waitUntil) {
          sp.target(m.deck.x, m.deck.y, 0, ROW_SCALE, 1, 0);
          sp.z = 60;
        } else if (box) {
          const spacing = n > 1 ? Math.min(cw * 0.45, (box.w - cw) / (n - 1)) : 0;
          const x = box.x + (i - (n - 1) / 2) * spacing;
          sp.target(x, box.y + (m.ch * SEAT_SCALE) / 2 + 2, 0, SEAT_SCALE, over ? 0 : 1, 0);
          sp.z = 70 + i;
        } else {
          // The seat in front of the screen while the device is passed: a face-down stack.
          sp.target(m.W / 2 + i * 0.5, m.handBaseY - i * 0.4, 0, 1, 1, 0);
          sp.z = 70 + i;
        }
        sp.step(dt, s.stiffness, s.damping);
        sp.render();
      });
    });
    // Labels under each seat box
    this.labels.forEach((el, seat) => {
      const box = boxes.get(seat);
      el.style.display = box ? '' : 'none';
      if (box) el.style.transform = `translate(${box.x}px, ${box.y + m.ch * SEAT_SCALE + 6}px) translateX(-50%)`;
    });
  }

  /** Melds flow in rows between the discard spread and the action buttons. */
  stepMelds(dt) {
    const m = this.table.m;
    const s = this.table.s;
    const { left, right, meldTop, meldBottom } = this.lay;
    const melds = this.rules.melds;
    const avail = meldBottom - meldTop;
    let layout = null;
    for (let k = 0.66; k >= 0.22; k -= 0.02) {
      const cw = m.cw * k;
      const chh = m.ch * k;
      const sp = cw * 0.34;
      const rows = [[]];
      let x = 0;
      for (const md of melds) {
        const w = cw + (md.cards.length - 1) * sp;
        if (x && x + w > right - left) {
          rows.push([]);
          x = 0;
        }
        rows[rows.length - 1].push({ md, w });
        x += w + 10;
      }
      if (rows.length * (chh + 8) <= avail || k <= 0.23) {
        layout = { k, cw, chh, sp, rows };
        break;
      }
    }
    if (!layout) return;
    const { k, cw, chh, sp, rows } = layout;
    rows.forEach((row, ri) => {
      const total = row.reduce((a, it) => a + it.w, 0) + (row.length - 1) * 10;
      let x = (left + right) / 2 - total / 2;
      const y = meldTop + chh / 2 + ri * (chh + 8);
      for (const { md, w } of row) {
        const sprites = this.meldSprites.get(md.id) ?? [];
        sprites.forEach((spr, i) => {
          spr.target(x + cw / 2 + i * sp, y, 0, k, 0, 0);
          spr.z = 40 + i;
          spr.step(dt, s.stiffness, s.damping);
          spr.render();
        });
        x += w + 10;
      }
    });
  }

  // -------------------------------------------------------------------- HUD

  updateHUD() {
    const r = this.rules;
    if (!r) return;
    const names = this.names();
    const tally = r.handTally();
    this.labels.forEach((el, seat) => {
      el.firstChild.textContent = names[seat];
      const n = r.hands[seat].length;
      el.lastChild.textContent = `${n} ${n === 1 ? 'card' : 'cards'} · ${r.scores[seat]}${tally.table[seat] ? ` +${tally.table[seat]}` : ''}`;
      el.classList.toggle('active', seat === r.turn && (r.phase === 'draw' || r.phase === 'play'));
    });
    const mine = this.myTurn();
    let status = '';
    if (r.phase === 'draw' || r.phase === 'play') {
      if (mine) status = r.phase === 'draw' ? 'Draw a card' : 'Meld, lay off or discard';
      else if (this.viewer == null) status = '';
      else status = `${names[r.turn]}’s turn…`;
    }
    this.statusEl.textContent = status;
    this.statusEl.classList.toggle('mine', mine);

    const sel = this.selected();
    const play = mine && r.phase === 'play';
    this.actions.style.visibility = this.viewer == null ? 'hidden' : '';
    this.meldBtn.disabled = !play || !checkMeld(sel);
    this.layBtn.disabled = !play || !r.layOffTarget(sel);
    this.discardBtn.disabled = !play || sel.length !== 1 || !r.canDiscard(this.viewer, sel[0].id);
    const mineTotal = this.viewer != null ? `You have ${tally.table[this.viewer]} on the table · ${tally.hand[this.viewer]} in hand` : '';
    let hint = mineTotal;
    if (mine && r.mustUse) hint = 'Meld the glowing card before you discard';
    else if (play && sel.length) hint = `${sel.length} selected · ${sel.reduce((a, c) => a + cardPoints(c), 0)} points`;
    this.hintEl.textContent = hint;
  }

  say(msg) {
    if (!msg) return;
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2000);
  }

  showBoard() {
    const r = this.rules;
    const names = this.names();
    const last = r.lastHand;
    const over = r.phase === 'gameOver';
    this.viewer = this.mode === 'single' ? 0 : this.viewer;
    const c = this.overCard;
    c.innerHTML = '';
    let title = `Hand ${r.handNo}`;
    if (over) {
      const w = r.winners;
      title = w.length > 1 ? `${w.map((i) => names[i]).join(' & ')} tie` : w[0] === 0 && this.mode === 'single' ? 'You won!' : `${names[w[0]]} wins`;
    }
    c.append(h('div', 'game-win-title', title));
    if (last?.outBy >= 0) c.append(h('div', 'game-win-stats', `${names[last.outBy]} went out`));
    else c.append(h('div', 'game-win-stats', 'The stock ran out'));
    const table = h('table', 'hx-scores');
    table.innerHTML = '<tr><th></th><th>Table</th><th>Hand</th><th>Total</th></tr>';
    const best = Math.max(...r.scores);
    names.forEach((name, i) => {
      const tr = h('tr', `${i === 0 && this.mode === 'single' ? 'me' : ''}${r.scores[i] === best ? ' low' : ''}`);
      for (const v of [name, `+${last.table[i]}`, `−${last.hand[i]}`, String(r.scores[i])]) tr.append(h('td', '', v));
      table.append(tr);
    });
    c.append(table);
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
      c.append(h('div', 'game-win-stats', `First to ${r.target} wins`));
      btn('Next hand', () => {
        r.nextHand();
        this.begin(r, null);
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
    return `thedeck.rummy.${this.mode}.v1`;
  }

  save() {
    if (!this.rules || !this.mode) return;
    try {
      if (this.rules.phase === 'gameOver') localStorage.removeItem(this.saveKey());
      // Multiplayer resumes with the device "passed", so nobody sees another hand.
      else localStorage.setItem(this.saveKey(), JSON.stringify({ rules: this.rules.serialize() }));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.saveKey()));
      const rules = Rummy500.restore(d?.rules);
      return rules ? { rules, viewer: null } : null;
    } catch {
      return null;
    }
  }
}

