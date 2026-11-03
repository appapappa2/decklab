// Gin Rummy: singleplayer against a CPU, or pass-and-play for two. Your hand is
// the lab's hand (RuleTable + Input) and arranges itself into melds (meld
// cards get a green edge) with the deadwood count shown. Draw by tapping the
// stock or the discard pile; discard by dragging a card up or selecting it and
// pressing Discard; Knock (or Gin) discards the selected card and ends the hand.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { GinRummy, arrange, KNOCK_MAX } from './rules.js';

const PILE_SCALE = 0.72;
const SEAT_SCALE = 0.45;
const SHOW_SCALE = 0.5;
const CPU_DELAY = 850;
const RANK = { 1: 'ace', 11: 'jack', 12: 'queen', 13: 'king' };
const cardName = (c) => RANK[c.value] ?? String(c.value);

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

/** RuleTable whose pile is the discard pile, a neat stack beside the stock. */
class GinTable extends RuleTable {
  updateTargets(now) {
    super.updateTargets(now);
    const at = this.scene.discardAt;
    this.played.forEach((sp, i) => {
      sp.z = 10 + i;
      if (sp.waitUntil > now) return;
      sp.target(at.x, at.y, sp.pileRot ?? 0, PILE_SCALE, 0, 0);
    });
  }

  hitDeck(p) {
    const { deck, cw, ch } = this.m;
    return Math.abs(p.x - deck.x) < (cw * PILE_SCALE) / 2 + 6 && Math.abs(p.y - deck.y) < (ch * PILE_SCALE) / 2 + 6;
  }
}

export class GinScene {
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

    this.buildDOM();
    this.table = new GinTable(
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
    this.scoreEl = h('div', 'game-stats gn-score');
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.showSetup());
    top.append(back, h('div', 'game-title', 'Gin Rummy'), this.scoreEl, newBtn);

    this.oppLabel = h('div', 'rm-label gn-opp');
    this.discardLabel = h('div', 'rm-row-label gn-discard-label', 'Discard');
    this.dwEl = h('div', 'gn-dw');
    this.actions = h('div', 'rm-actions gn-actions');
    const act = (label, fn, cls = '') => {
      const b = h('button', `game-btn small ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      this.actions.append(b);
      return b;
    };
    this.passBtn = act('Pass', () => this.doPass());
    this.discardBtn = act('Discard', () => this.doDiscard(false));
    this.knockBtn = act('Knock', () => this.doDiscard(true), 'accent');
    this.hintEl = h('div', 'rm-hint');
    this.toastEl = h('div', 'c8-toast rm-toast cb-toast');
    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    this.handoffEl = h('div', 'rm-handoff gn-handoff');

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.oppLabel, this.discardLabel, this.dwEl, this.actions, this.hintEl, this.toastEl, top, this.handoffEl, this.overEl,
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
    const oppY = safe.top + 50 + (ch * SEAT_SCALE) / 2 + 6;
    const selLift = (this.table.s.selectLift ?? 0.25) * ch;
    const actionsY = m.handTop - selLift - 30;
    const midY = (oppY + (ch * SEAT_SCALE) / 2 + actionsY - 30) / 2;
    const gap = cw * PILE_SCALE * 0.75;
    m.deck = { x: cx - gap, y: midY };
    this.discardAt = { x: cx + gap, y: midY };
    // Discard by dragging up into the middle of the table.
    m.pz = { x: cx, y: midY, w: right - left, h: ch * 1.4 };
    this.deckEl.style.left = `${m.deck.x - cw / 2}px`;
    this.deckEl.style.top = `${m.deck.y - ch / 2}px`;
    this.deckEl.style.transform = `scale(${PILE_SCALE})`;
    this.lay = { left, right, cx, oppY, midY, actionsY };
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    pos(this.oppLabel, right, oppY, 'translate(-100%, -50%)');
    pos(this.discardLabel, this.discardAt.x, midY + (ch * PILE_SCALE) / 2 + 12, 'translate(-50%, -50%)');
    pos(this.dwEl, left, actionsY, 'translateY(-50%)');
    pos(this.actions, right, actionsY, 'translate(-100%, -50%)');
    if (m.landscape) {
      // Short screen: text goes to the sides of the piles.
      pos(this.hintEl, right, actionsY - 30, 'translate(-100%, -50%)');
      pos(this.toastEl, left, midY, 'translateY(-50%)');
    } else {
      pos(this.hintEl, cx, actionsY - 28, 'translate(-50%, -50%)');
      pos(this.toastEl, cx, midY - (ch * PILE_SCALE) / 2 - 22, 'translate(-50%, -50%)');
    }
    if (this.rules) this.sync();
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
    if (saved && saved.phase !== 'over') this.begin(saved, false);
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
    c.append(h('div', 'game-win-title', 'Gin Rummy'));
    c.append(h('div', 'game-win-stats', this.mode === 'multi' ? 'Two players, pass and play' : 'You against the computer'));
    c.append(h('div', 'game-win-stats', 'Meld sets and runs · knock with 10 or less · first to 100'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => this.begin(new GinRummy({ dealer: Math.random() < 0.5 ? 0 : 1 }), true));
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', () => this.onExit());
    actions.append(go, lobby);
    c.append(actions);
    this.overEl.classList.add('show');
  }

  begin(rules, deal) {
    this.root.classList.remove('fresh');
    this.input.cancel();
    const t = this.table;
    t.clearTable();
    t.discard([...this.byId.values()].filter((sp) => !t.leaving.includes(sp)));
    t.pendingLandings.clear();
    this.byId.clear();
    this.place.clear();
    this.queue = [];
    // A save from right after a hand ended has no breakdown to show: deal the next one.
    if (rules.phase === 'handOver' && !rules.lastHand) rules.nextHand();
    this.rules = rules;
    this.overEl.classList.remove('show');
    this.handoffEl.classList.remove('show');
    this.handoffFor = -1;
    this.viewer = this.mode === 'single' ? 0 : null;
    this.sync(deal);
    if (rules.phase === 'handOver') this.showBoard();
    this.save();
  }

  // ----------------------------------------------------------------- sprites

  sprite(card) {
    let sp = this.byId.get(card.id);
    if (!sp) {
      sp = this.table.spriteAtDeck(card);
      sp.scale.set(PILE_SCALE);
      this.byId.set(card.id, sp);
    }
    return sp;
  }

  sync(deal = false) {
    const r = this.rules;
    const t = this.table;
    const m = t.m;
    const now = performance.now();
    const { cx, oppY } = this.lay;
    this.place.clear();
    const set = (card, x, y, scale, flip, z = 50) => {
      this.sprite(card);
      this.place.set(card.id, { x, y, scale, flip, z });
    };
    const over = r.phase === 'handOver' || r.phase === 'over';
    // Viewer's hand
    const want = this.viewer == null ? [] : r.hands[this.viewer].map((c) => this.sprite(c));
    const wantSet = new Set(want);
    for (const sp of [...t.hand]) if (!wantSet.has(sp)) t.removeFromHand(sp);
    if (t.drag && !wantSet.has(t.drag.sprite)) this.input.cancel();
    const inHand = new Set(t.hand);
    let k = 0;
    for (const sp of want) {
      if (inHand.has(sp) || t.drag?.sprite === sp) continue;
      t.played = t.played.filter((x) => x !== sp);
      t.takeSprite(sp, deal ? 250 + k++ * 55 : 0);
    }
    this.groupHand();
    // Opponent: face down at the top; after the hand, face up in melds then deadwood.
    for (const p of [0, 1]) {
      if (p === this.viewer) continue;
      const atBottom = this.viewer == null && p === this.handoffFor;
      let cards = r.hands[p];
      if (over) {
        const a = arrange(cards);
        cards = [...a.melds.flat(), ...a.deadwood];
      }
      const scale = over ? SHOW_SCALE : SEAT_SCALE;
      const cwS = m.cw * scale;
      const n = cards.length;
      const spacing = Math.min(cwS * (over ? 0.62 : 0.4), (this.lay.right - this.lay.left - 70 - cwS) / Math.max(1, n - 1));
      cards.forEach((c, i) => {
        if (atBottom) set(c, cx + i * 0.5, m.handBaseY - i * 0.4, 1, 1, 60 + i);
        else set(c, cx - 30 + (i - (n - 1) / 2) * spacing, oppY + (over ? 6 : 0), scale, over ? 0 : 1, 60 + i);
      });
    }
    // Stock
    r.stock.slice(-6).forEach((c, i) => set(c, m.deck.x - i * 0.3, m.deck.y - i * 0.4, PILE_SCALE, 1, 5 + i));
    // Discard pile (the lab's pile)
    const pile = r.discard.map((c) => this.sprite(c));
    const onPile = new Set(t.played);
    for (const sp of pile) {
      if (onPile.has(sp)) continue;
      if (t.hand.includes(sp)) t.removeFromHand(sp);
      sp.setSelected(false);
      sp.pileRot = (Math.random() - 0.5) * 10;
      t.placeOnPile(sp);
      if (deal) t.pendingLandings.delete(sp);
    }
    t.played = pile;
    for (const sp of [...t.pendingLandings]) if (!pile.includes(sp)) t.pendingLandings.delete(sp);
    if (deal) {
      let i = 0;
      for (const id of this.place.keys()) {
        const s = this.byId.get(id);
        if (s && !t.hand.includes(s)) s.waitUntil = now + 200 + i++ * 25;
      }
    }
    t.updateDeck();
    this.updateHUD();
  }

  /** Arranges the hand: each meld together (green edge), then deadwood low to high. */
  groupHand() {
    const t = this.table;
    if (t.drag || !t.hand.length) return;
    const a = arrange(t.hand.map((sp) => sp.card));
    const order = [...a.melds.flat(), ...[...a.deadwood].sort((x, y) => x.value - y.value || x.suit.order - y.suit.order)];
    const pos = new Map(order.map((c, i) => [c.id, i]));
    t.hand.sort((x, y) => pos.get(x.card.id) - pos.get(y.card.id));
    const melded = new Set(a.melds.flat().map((c) => c.id));
    for (const sp of t.hand) sp.el.classList.toggle('gn-meld', melded.has(sp.card.id));
    this.handInfo = a;
  }

  // ------------------------------------------------------------ RuleTable hooks

  myTurn() {
    const r = this.rules;
    return !!r && this.viewer != null && !this.busy && r.turn === this.viewer && ['offer', 'draw', 'discard'].includes(r.phase);
  }

  onSelect(sp) {
    const on = !sp.selected;
    for (const o of this.table.hand) o.setSelected(false);
    sp.setSelected(on);
    this.table.haptic(5);
    this.updateHUD();
    return true;
  }

  hidePlayButtons() {
    return true;
  }

  /** Dragging a card up discards it. */
  onPlay(sp) {
    const r = this.rules;
    let why = null;
    if (!this.myTurn()) why = this.viewer == null ? '' : `Wait, it's ${this.names()[r.turn]}'s turn`;
    else if (r.phase !== 'discard') why = r.phase === 'offer' ? 'Take the upcard or pass' : 'Draw first: tap the stock or the discard pile';
    else if (!r.canDiscard(this.viewer, sp.card.id)) why = "You can't throw back the card you just took";
    if (why !== null) {
      if (why) {
        this.say(why);
        sp.x.vel += 420;
        this.table.haptic([6, 40, 6]);
      }
      return false;
    }
    this.pending = r.discardCard(this.viewer, sp.card.id, false);
    return true;
  }

  afterPlay() {
    const res = this.pending;
    this.pending = null;
    if (res) this.afterMove(res, this.viewer);
  }

  onDeckTap() {
    if (!this.myTurn()) return;
    const r = this.rules;
    if (r.phase === 'offer') return this.say('First turn: take the upcard or pass');
    if (r.phase !== 'draw') return this.say('You already drew: now discard');
    r.draw(this.viewer, 'stock');
    this.table.haptic(8);
    this.afterDraw(this.viewer, 'stock');
  }

  pileIndexAt(p) {
    const at = this.discardAt;
    const m = this.table.m;
    if (!this.rules.discard.length) return -1;
    return Math.abs(p.x - at.x) < (m.cw * PILE_SCALE) / 2 + 6 && Math.abs(p.y - at.y) < (m.ch * PILE_SCALE) / 2 + 6 ? this.rules.discard.length - 1 : -1;
  }

  onPileTap() {
    if (!this.myTurn()) return;
    const r = this.rules;
    if (r.phase === 'discard') return this.say('You already drew: now discard');
    r.draw(this.viewer, 'discard');
    this.table.haptic(10);
    this.afterDraw(this.viewer, 'discard');
  }

  stockCount() {
    return this.rules?.stock.length ?? 0;
  }

  // ---------------------------------------------------------------- actions

  doPass() {
    if (!this.myTurn() || this.rules.phase !== 'offer') return;
    this.rules.passOffer(this.viewer);
    this.say(this.mode === 'single' ? 'You pass' : `${this.names()[this.viewer]} passes`);
    this.afterChange();
  }

  doDiscard(knock) {
    if (!this.myTurn()) return;
    const sp = this.table.hand.find((s) => s.selected);
    if (!sp) return;
    const r = this.rules;
    const res = r.discardCard(this.viewer, sp.card.id, knock);
    if (!res) return this.say(knock ? `You need ${KNOCK_MAX} or less deadwood to knock` : "You can't throw back the card you just took");
    this.table.haptic(knock ? [10, 40, 10] : 10);
    this.afterMove(res, this.viewer);
  }

  afterDraw(p, from) {
    const r = this.rules;
    const you = this.mode === 'single' && p === 0;
    if (from === 'discard' && !you) this.say(`${this.names()[p]} takes the ${cardName(r.hands[p][r.hands[p].length - 1])}`);
    this.afterChange();
  }

  afterMove(res, p) {
    const names = this.names();
    const you = this.mode === 'single' && p === 0;
    if (!you && !res.hand) this.say(`${names[p]} discards the ${cardName(res.card)}`);
    if (res.hand) {
      const hk = res.hand;
      if (hk.kind === 'draw') this.say('Only two cards left: the hand is a draw');
      else this.say(hk.kind === 'gin' ? `${you ? 'You go' : `${names[p]} goes`} gin!` : `${you ? 'You knock' : `${names[p]} knocks`} with ${hk.knock.points}`);
      if (this.mode === 'multi') this.viewer = 0;
      this.afterChange();
      this.enqueue(1500, () => this.showBoard());
      return;
    }
    if (this.mode === 'multi') this.viewer = null;
    this.afterChange();
  }

  afterChange() {
    for (const sp of this.table.hand) sp.setSelected(false);
    this.sync();
    this.save();
  }

  // -------------------------------------------------------------------- CPU

  cpuStep() {
    const r = this.rules;
    const p = r.turn;
    if (!this.isCpu(p)) return;
    if (r.phase === 'offer') {
      if (r.cpuWantsTop(p)) {
        r.draw(p, 'discard');
        this.afterDraw(p, 'discard');
      } else {
        r.passOffer(p);
        this.say(`${this.names()[p]} passes`);
        this.afterChange();
      }
    } else if (r.phase === 'draw') {
      const from = r.cpuWantsTop(p) ? 'discard' : 'stock';
      r.draw(p, from);
      this.afterDraw(p, from);
    } else if (r.phase === 'discard') {
      const d = r.cpuDiscard(p);
      this.afterMove(r.discardCard(p, d.id, d.knock), p);
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
    if (!r || !['offer', 'draw', 'discard'].includes(r.phase) || this.overEl.classList.contains('show')) return;
    if (this.isCpu(r.turn)) {
      this.enqueue(r.phase === 'discard' ? CPU_DELAY * 0.7 : CPU_DELAY, () => this.cpuStep());
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
      if (!sp || this.table.hand.includes(sp) || this.table.drag?.sprite === sp || this.table.played.includes(sp)) continue;
      if (now < sp.waitUntil) sp.target(m.deck.x, m.deck.y, 0, PILE_SCALE, 1, 0);
      else sp.target(p.x, p.y, 0, p.scale, p.flip, 0);
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
    const me = this.viewer;
    const opp = me == null ? null : 1 - me;
    this.scoreEl.textContent = `${this.mode === 'single' ? 'You' : 'P1'} ${r.scores[0]} · ${this.mode === 'single' ? 'CPU' : 'P2'} ${r.scores[1]}`;
    this.oppLabel.innerHTML = opp == null ? '' : `<div class="rm-name">${names[opp]}${r.dealer === opp ? ' · dealer' : ''}</div><div class="rm-sub">${r.turn === opp && ['offer', 'draw', 'discard'].includes(r.phase) ? 'playing…' : `${r.hands[opp].length} cards`}</div>`;
    this.discardLabel.textContent = r.phase === 'offer' ? 'Upcard' : 'Discard';
    const mine = this.myTurn();
    const sel = this.table.hand.find((s) => s.selected);
    const info = this.handInfo;
    // Deadwood: what you'd have after discarding the selected card, or your current count.
    let dwText = '';
    if (me != null && info && r.phase !== 'handOver' && r.phase !== 'over') {
      if (mine && r.phase === 'discard' && sel) dwText = `Deadwood ${r.deadwoodAfter(me, sel.card.id)} after discard`;
      else if (mine && r.phase === 'discard') dwText = `Best discard leaves ${r.bestDiscard(r.hands[me], r.taken).dw}`;
      else dwText = `Deadwood ${info.points}`;
    }
    this.dwEl.textContent = dwText;
    this.actions.style.visibility = me == null || !['offer', 'draw', 'discard'].includes(r.phase) ? 'hidden' : '';
    this.passBtn.hidden = r.phase !== 'offer';
    this.discardBtn.hidden = r.phase === 'offer';
    this.knockBtn.hidden = r.phase === 'offer';
    const canDisc = mine && r.phase === 'discard' && sel && r.canDiscard(me, sel.card.id);
    this.passBtn.disabled = !mine;
    this.discardBtn.disabled = !canDisc;
    const after = canDisc ? r.deadwoodAfter(me, sel.card.id) : null;
    this.knockBtn.disabled = !canDisc || after > KNOCK_MAX;
    this.knockBtn.textContent = after === 0 ? 'Gin!' : 'Knock';
    let hint = '';
    if (mine) {
      if (r.phase === 'offer') hint = 'First turn: tap the upcard to take it, or pass';
      else if (r.phase === 'draw') hint = 'Tap the stock or the discard pile';
      else if (!sel) hint = 'Drag a card up to discard, or tap one';
    } else if (me != null && ['offer', 'draw', 'discard'].includes(r.phase)) hint = `${names[r.turn]}’s turn…`;
    this.hintEl.textContent = hint;
    this.deckEl.classList.toggle('gn-glow', mine && r.phase === 'draw');
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
    const last = r.lastHand;
    const names = this.names();
    const c = this.overCard;
    c.innerHTML = '';
    const nm = (p) => (this.mode === 'single' && p === 0 ? 'You' : names[p]);
    const list = (cards) => cards.map((x) => `${x.value === 1 ? 'A' : x.value > 10 ? 'JQK'[x.value - 11] : x.value}${{ S: '♠', H: '♥', C: '♣', D: '♦' }[x.suit.id]}`).join(' ');
    if (r.phase === 'over') {
      const you = this.mode === 'single' && r.winner === 0;
      c.append(h('div', 'game-win-title', you ? 'You won the game!' : `${names[r.winner]} wins the game`));
      c.append(h('div', 'game-win-stats', `${r.final.totals[0]} – ${r.final.totals[1]} with bonuses${r.final.shutout ? ' · shutout, doubled!' : ''}`));
    } else c.append(h('div', 'game-win-title', last.kind === 'draw' ? 'Draw' : { gin: 'Gin!', knock: 'Knock', undercut: 'Undercut!' }[last.kind]));
    if (last.kind !== 'draw') {
      const k = last.knocker;
      const d = 1 - k;
      const lines = [
        last.kind === 'gin'
          ? `${nm(k)} ${this.mode === 'single' && k === 0 ? 'go' : 'goes'} gin: no deadwood`
          : `${nm(k)} ${this.mode === 'single' && k === 0 ? 'knock' : 'knocks'} with ${last.knock.points}${last.knock.deadwood.length ? ` (${list(last.knock.deadwood)})` : ''}`,
        last.defend.layoffs.length ? `${nm(d)} ${this.mode === 'single' && d === 0 ? 'lay' : 'lays'} off ${list(last.defend.layoffs)}` : '',
        `${nm(d)} ${this.mode === 'single' && d === 0 ? 'have' : 'has'} ${last.defend.points} deadwood${last.defend.deadwood.length ? ` (${list(last.defend.deadwood)})` : ''}`,
        `${nm(last.winner)} ${this.mode === 'single' && last.winner === 0 ? 'score' : 'scores'} ${last.points}${last.kind === 'gin' ? ' (25 for gin)' : last.kind === 'undercut' ? ' (25 for the undercut)' : ''}`,
      ].filter(Boolean);
      for (const l of lines) c.append(h('div', 'game-win-stats gn-line', l));
    } else c.append(h('div', 'game-win-stats', 'The stock ran down to two cards. No score.'));
    const table = h('table', 'hx-scores');
    table.innerHTML = '<tr><th></th><th>Hands</th><th>Score</th></tr>';
    [0, 1].forEach((p) => {
      const tr = h('tr', `${p === 0 && this.mode === 'single' ? 'me' : ''}${r.scores[p] === Math.max(...r.scores) ? ' low' : ''}`);
      for (const v of [names[p], String(r.handsWon[p]), String(r.scores[p])]) tr.append(h('td', '', v));
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
    if (r.phase === 'over') {
      btn('Play again', () => this.showSetup(), 'accent');
      btn('Lobby', () => this.onExit(), '');
    } else {
      c.append(h('div', 'game-win-stats', `First to ${r.target}`));
      btn('Next hand', () => {
        r.nextHand();
        this.begin(r, true);
      }, 'accent');
    }
    c.append(row);
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
    return `thedeck.gin.${this.mode}.v1`;
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
      return GinRummy.restore(JSON.parse(localStorage.getItem(this.saveKey())));
    } catch {
      return null;
    }
  }
}

