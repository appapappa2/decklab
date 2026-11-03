// President: singleplayer against 2–5 CPUs, or pass-and-play for 3–6. Your
// hand is the lab's hand (RuleTable + Input), sorted low to high. Tap cards of
// one rank to select them and press Play (or drag one up to play it with the
// other selected cards of its rank), or Pass. The other players sit along the
// top with their card counts and titles; the pile shows the latest play on
// top of the ones it beat. Before each later hand the card swap is shown, and
// the President (and Vice President) pick cards to give back.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { President, power, title } from './rules.js';

const SEAT_SCALE = 0.34;
const PILE_SCALE = 0.68;
const CPU_DELAY = 750;
const RANK = { 1: 'ace', 11: 'jack', 12: 'queen', 13: 'king' };
const plural = (c, n) => {
  const r = RANK[c.value] ?? String(c.value);
  if (n === 1) return `a${c.value === 1 || c.value === 8 ? 'n' : ''} ${r}`;
  return `${['', '', 'two', 'three', 'four'][n]} ${r}${c.value === 6 ? 'es' : 's'}`;
};
const short = (c) => `${c.value === 1 ? 'A' : c.value > 10 ? 'JQK'[c.value - 11] : c.value}${{ S: '♠', H: '♥', C: '♣', D: '♦' }[c.suit.id]}`;

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

/** RuleTable whose pile shows the current round of plays, newest on top. */
class PileTable extends RuleTable {
  updateTargets(now) {
    super.updateTargets(now);
    this.scene.posePile(now);
  }

  hitDeck() {
    return false;
  }
}

export class PresidentScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.viewer = null;
    this.byId = new Map();
    this.seats = [];
    this.clearing = [];
    this.queue = [];
    this.handoffFor = -1;
    this.labels = [];

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
    top.append(back, h('div', 'game-title', 'President'), this.statusEl, newBtn);

    this.pileInfo = h('div', 'rm-row-label pr-pile-info');
    this.youLabel = h('div', 'pr-you');
    this.actions = h('div', 'rm-actions');
    const act = (label, fn, cls = '') => {
      const b = h('button', `game-btn small ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      this.actions.append(b);
      return b;
    };
    this.passBtn = act('Pass', () => this.doPass());
    this.playBtn = act('Play', () => this.doPlay(), 'accent');
    this.giveBtn = act('Give', () => this.doGive(), 'accent');
    this.hintEl = h('div', 'rm-hint');
    this.toastEl = h('div', 'c8-toast rm-toast cb-toast');
    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    this.handoffEl = h('div', 'rm-handoff pr-handoff');

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.pileInfo, this.youLabel, this.actions, this.hintEl, this.toastEl, top, this.handoffEl, this.overEl,
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
    const { W, safe, ch } = m;
    const left = safe.left + 10;
    const right = W - safe.right - 10;
    const cx = (left + right) / 2;
    const top = safe.top + 50;
    const seatH = ch * SEAT_SCALE;
    const selLift = (this.table.s.selectLift ?? 0.25) * ch;
    const actionsY = m.handTop - selLift - 30;
    const midY = (top + seatH + 34 + actionsY - 30) / 2;
    m.deck = { x: cx, y: midY };
    m.pz = { x: cx, y: midY, w: right - left, h: ch * 1.5 };
    this.lay = { left, right, cx, top, seatH, midY, actionsY };
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    pos(this.pileInfo, cx, midY + (ch * PILE_SCALE) / 2 + 18, 'translate(-50%, -50%)');
    pos(this.youLabel, left, actionsY, 'translateY(-50%)');
    pos(this.actions, right, actionsY, 'translate(-100%, -50%)');
    pos(this.hintEl, cx, actionsY - 28, 'translate(-50%, -50%)');
    if (m.landscape) pos(this.toastEl, left, midY - 34, 'translateY(-50%)');
    else pos(this.toastEl, cx, midY - (ch * PILE_SCALE) / 2 - 22, 'translate(-50%, -50%)');
    this.toastEl.classList.toggle('pk-toast-side', m.landscape);
    if (this.rules) this.sync();
  }

  /** Seat boxes along the top for everyone but the player in front of the screen. */
  seatBoxes() {
    const { left, right, top } = this.lay;
    const n = this.rules.n;
    const f = this.viewer ?? (this.handoffFor >= 0 ? this.handoffFor : 0);
    const others = [];
    for (let k = 1; k < n; k++) others.push((f + k) % n);
    const w = (right - left) / others.length;
    return new Map(others.map((seat, i) => [seat, { x: left + w * (i + 0.5), y: top, w: w - 6 }]));
  }

  // ------------------------------------------------------------ game setup

  wipe() {
    this.input?.cancel();
    const t = this.table;
    const sprites = [...this.byId.values(), ...t.hand, ...t.played, ...t.leaving, ...this.clearing, ...(t.drag ? [t.drag.sprite] : [])];
    for (const sp of new Set(sprites)) sp.destroy();
    this.byId.clear();
    t.hand = [];
    t.played = [];
    t.leaving = [];
    t.drag = null;
    t.pendingLandings.clear();
    this.clearing = [];
    this.queue = [];
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
    const n = this.rules.n;
    return this.mode === 'multi' ? Array.from({ length: n }, (_, i) => `Player ${i + 1}`) : ['You', 'CPU 1', 'CPU 2', 'CPU 3', 'CPU 4', 'CPU 5'].slice(0, n);
  }

  isCpu(p) {
    return this.mode === 'single' && p !== 0;
  }

  showSetup() {
    const multi = this.mode === 'multi';
    let count = Number(localStorage.getItem(`thedeck.president.count.${this.mode}`)) || 4;
    const c = this.overCard;
    c.innerHTML = '';
    c.append(h('div', 'game-win-title', 'President'));
    c.append(h('div', 'game-win-stats', multi ? 'Pass and play on this device' : 'You against the computer'));
    const row = h('div', 'rm-count');
    const opts = h('div', 'gs-toggle rm-count-opts pk-count');
    const paint = () => {
      for (const b of opts.children) b.setAttribute('aria-checked', String(Number(b.dataset.n) === (multi ? count : count - 1)));
    };
    for (const v of multi ? [3, 4, 5, 6] : [2, 3, 4, 5]) {
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
    opts.style.gridTemplateColumns = 'repeat(4, 1fr)';
    paint();
    row.append(h('div', 'rm-count-label', multi ? 'Players' : 'Opponents'), opts);
    c.append(row);
    c.append(h('div', 'game-win-stats', '3 is low, 2 is high · beat the pile or pass · first out is President'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => {
      localStorage.setItem(`thedeck.president.count.${this.mode}`, String(count));
      this.begin(new President({ players: count }), true);
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
    this.input.cancel();
    const t = this.table;
    t.clearTable();
    t.discard([...this.byId.values(), ...this.clearing].filter((sp) => !t.leaving.includes(sp)));
    t.pendingLandings.clear();
    this.byId.clear();
    this.clearing = [];
    this.queue = [];
    this.shownPile = null;
    this.lastPileShown = [];
    if (rules.phase === 'handOver' && !rules.lastHand) rules.nextHand();
    this.rules = rules;
    this.overEl.classList.remove('show');
    this.handoffEl.classList.remove('show');
    this.handoffFor = -1;
    for (const el of this.labels) el.remove();
    this.labels = this.names().map(() => {
      const el = h('div', 'rm-label pr-label');
      el.append(h('div', 'rm-name'), h('div', 'rm-sub'));
      this.root.insertBefore(el, this.actions);
      return el;
    });
    this.viewer = this.mode === 'single' ? 0 : null;
    this.sync(deal);
    if (rules.phase === 'handOver') this.showBoard();
    else if (rules.phase === 'exchange' && deal) {
      this.announceSwap();
      this.enqueue(2600, () => {}); // time to read who swapped what before anyone gives back
    }
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
      t.played = t.played.filter((x) => x !== sp);
      sp.setSelected(false);
      t.takeSprite(sp, deal ? 250 + k++ * 25 : 0);
    }
    this.sortHand();
    // Pile: every play this round, newest on top.
    const pile = [];
    // While a cleared pile lingers, show it instead of the (already empty) rules pile.
    const src = this.shownPile ?? r.pile;
    if (!this.shownPile) this.lastPileShown = [...r.pile];
    this.pileCount = src.length;
    src.forEach((play, i) => play.cards.forEach((c, j) => {
      const sp = this.sprite(c);
      sp.pilePos = { play: i, j, n: play.cards.length };
      pile.push(sp);
    }));
    const onPile = new Set(t.played);
    for (const sp of pile) {
      used.add(sp);
      if (onPile.has(sp)) continue;
      if (t.hand.includes(sp)) t.removeFromHand(sp);
      sp.setSelected(false);
      sp.pileRot = (Math.random() - 0.5) * 12;
      t.placeOnPile(sp);
    }
    t.played = pile;
    // Other hands
    this.seats = r.hands.map((hand, seat) => (seat === this.viewer ? [] : hand.map((c) => this.sprite(c))));
    for (const sp of this.seats.flat()) used.add(sp);
    // A cleared pile slides off the table.
    for (const [id, sp] of this.byId) {
      if (used.has(sp)) continue;
      t.played = t.played.filter((x) => x !== sp);
      t.pendingLandings.delete(sp);
      sp.removeAt = now + 600;
      this.clearing.push(sp);
      this.byId.delete(id);
    }
    if (deal) this.seats.flat().forEach((sp, i) => (sp.waitUntil = now + 150 + i * 8));
    this.updateHUD();
  }

  sortHand() {
    const key = (c) => power(c) * 4 + c.suit.order;
    if (!this.table.drag) this.table.hand.sort((a, b) => key(a.card) - key(b.card));
  }

  /** Pile pose: older plays sink and shift left, the latest is on top in the middle. */
  posePile(now) {
    const t = this.table;
    const m = t.m;
    const plays = this.pileCount ?? 0;
    const cw = m.cw * PILE_SCALE;
    for (const sp of t.played) {
      const pp = sp.pilePos;
      if (!pp) continue;
      const age = plays - 1 - pp.play;
      sp.z = 10 + pp.play * 4 + pp.j;
      if (sp.waitUntil > now) continue;
      const x = m.pz.x + (pp.j - (pp.n - 1) / 2) * cw * 0.42 - Math.min(age, 4) * cw * 0.16;
      const y = m.pz.y - Math.min(age, 4) * 4;
      sp.target(x, y, sp.pileRot ?? 0, PILE_SCALE * (age ? 0.92 : 1), 0, 0);
    }
  }

  // ------------------------------------------------------------ RuleTable hooks

  myTurn() {
    const r = this.rules;
    return !!r && this.viewer != null && !this.busy && r.turn === this.viewer && (r.phase === 'play' || r.phase === 'exchange');
  }

  selected() {
    return this.table.hand.filter((s) => s.selected);
  }

  /** Taps select cards of one rank while playing; any cards while giving back. */
  onSelect(sp) {
    const r = this.rules;
    const on = !sp.selected;
    if (r.phase === 'exchange') {
      const k = r.owed.get(this.viewer)?.k ?? 0;
      const picked = this.selected();
      if (on && picked.length >= k) picked[0].setSelected(false);
    } else if (on) {
      for (const o of this.table.hand) if (o.card.value !== sp.card.value) o.setSelected(false);
      // Tapping a card when following picks as many of that rank as the pile needs.
      const need = r.top?.cards.length;
      if (need && !sp.selected) {
        const same = this.table.hand.filter((o) => o.card.value === sp.card.value && o !== sp);
        for (const o of same.slice(0, need - 1)) o.setSelected(true);
      }
    }
    sp.setSelected(on);
    this.table.haptic(5);
    this.updateHUD();
    return true;
  }

  hidePlayButtons() {
    return true;
  }

  /** Dragging a card up plays it with the other selected cards of its rank. */
  onPlay(sp) {
    const r = this.rules;
    let why = null;
    if (!this.myTurn()) why = this.viewer == null ? '' : `Wait, it's ${this.names()[r.turn]}'s turn`;
    else if (r.phase === 'exchange') why = 'Pick the cards to give back first';
    if (why === null) {
      const group = [sp, ...this.selected().filter((o) => o !== sp && o.card.value === sp.card.value)];
      const need = r.top?.cards.length;
      // Not enough selected for the pile? Use the other cards of that rank.
      if (need && group.length < need) {
        for (const o of this.table.hand) if (group.length < need && o !== sp && o.card.value === sp.card.value && !group.includes(o)) group.push(o);
      }
      const res = r.play(this.viewer, group.map((g) => g.card.id));
      if (res) {
        this.pending = res;
        return true;
      }
      why = this.whyNot(group.map((g) => g.card));
    }
    if (why) {
      this.say(why);
      sp.x.vel += 420;
      this.table.haptic([6, 40, 6]);
    }
    return false;
  }

  afterPlay() {
    const res = this.pending;
    this.pending = null;
    if (res) this.handle(res, this.viewer);
  }

  whyNot(cards) {
    const t = this.rules.top;
    if (!cards.length) return 'Select cards of one rank';
    if (!cards.every((c) => c.value === cards[0].value)) return 'Cards must be the same rank';
    if (!t) return '';
    if (cards.length !== t.cards.length) return `Play ${['', 'one card', 'a pair', 'three of a kind', 'four of a kind'][t.cards.length]}`;
    return `Beat ${plural(t.cards[0], t.cards.length)}: go higher or pass`;
  }

  stockCount() {
    return 0;
  }

  // ---------------------------------------------------------------- actions

  doPlay() {
    if (!this.myTurn() || this.rules.phase !== 'play') return;
    const sel = this.selected();
    const res = this.rules.play(this.viewer, sel.map((s) => s.card.id));
    if (!res) return this.say(this.whyNot(sel.map((s) => s.card)));
    this.table.haptic(10);
    this.handle(res, this.viewer);
  }

  doPass() {
    if (!this.myTurn()) return;
    const res = this.rules.pass(this.viewer);
    if (res) this.handle(res, this.viewer);
  }

  doGive() {
    if (!this.myTurn() || this.rules.phase !== 'exchange') return;
    const ids = this.selected().map((s) => s.card.id);
    const res = this.rules.giveBack(this.viewer, ids);
    if (!res) return;
    this.table.haptic(10);
    this.say(`You give ${res.cards.map(short).join(' ')} to ${this.names()[res.to]}`);
    if (this.mode === 'multi') this.viewer = null;
    this.sync();
    this.save();
  }

  handle(res, p) {
    const names = this.names();
    const you = this.mode === 'single' && p === 0;
    const who = you ? 'You' : names[p];
    if (res.pass) this.say(`${who} pass${you ? '' : 'es'}`);
    else {
      let msg = `${who} play${you ? '' : 's'} ${plural(res.cards[0], res.cards.length)}`;
      if (res.out) msg += ` and ${you ? 'are' : 'is'} out: ${title(res.position, this.rules.n)}!`;
      this.say(msg);
    }
    if (res.clear !== undefined) {
      // Leave the finished pile on the table a moment, then clear it.
      const before = this.lastPileShown ?? [];
      this.shownPile = res.pass ? before : [...before, { p, cards: res.cards }];
      const lead = this.rules.turn;
      this.enqueue(900, () => {
        this.shownPile = null;
        if (!this.rules.lastHand || this.rules.phase === 'play') this.say(`Pile cleared · ${this.mode === 'single' && lead === 0 ? 'you lead' : `${names[lead]} leads`}`);
        this.sync();
      });
    }
    if (this.mode === 'multi') this.viewer = null;
    this.sync();
    this.save();
    if (res.hand) this.enqueue(1300, () => this.showBoard());
  }

  announceSwap() {
    const r = this.rules;
    const names = this.names();
    const lines = r.exchanges.map((x) => {
      const mine = this.mode === 'single' && (x.from === 0 || x.to === 0);
      const text = `${names[x.from]} (${r.roleOf(x.from)}) → ${names[x.to]}${mine ? `: ${x.cards.map(short).join(' ')}` : ''}`;
      return text;
    });
    this.say(`Card swap · ${lines.join(' · ')}`, 3000);
  }

  // -------------------------------------------------------------------- CPU

  cpuStep() {
    const r = this.rules;
    const p = r.turn;
    if (!this.isCpu(p)) return;
    if (r.phase === 'exchange') {
      const res = r.giveBack(p, r.cpuGive(p));
      if (res) {
        const toYou = this.mode === 'single' && res.to === 0;
        this.say(`${this.names()[p]} gives ${toYou ? `you ${res.cards.map(short).join(' ')}` : `${res.cards.length} back`}`);
        this.sync();
        this.save();
      }
      return;
    }
    if (r.phase !== 'play') return;
    const mv = r.cpuMove(p);
    const res = mv.type === 'play' ? r.play(p, mv.ids) : r.pass(p);
    if (res) this.handle(res, p);
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
    if (!r || (r.phase !== 'play' && r.phase !== 'exchange') || this.overEl.classList.contains('show')) return;
    if (this.isCpu(r.turn)) {
      // Once you're out, the rest of the hand plays out quickly.
      const fast = this.mode === 'single' && !r.active(0) && r.phase === 'play';
      this.enqueue(fast ? 280 : CPU_DELAY, () => this.cpuStep());
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
    const what = this.rules.phase === 'exchange' ? `give back ${this.rules.owed.get(p)?.k} card${this.rules.owed.get(p)?.k > 1 ? 's' : ''}` : 'your turn';
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
    // Dim cards that can't beat the pile on your turn.
    const r = this.rules;
    const mine = this.myTurn() && r.phase === 'play' && r.top;
    const ok = mine ? new Set(r.options(this.viewer).map((o) => o[0].value)) : null;
    for (const sp of this.table.hand) {
      const dim = !!ok && !ok.has(sp.card.value);
      if (sp.dim !== dim) {
        sp.dim = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    }
    this.table.update(now, dt);
    this.stepSeats(now, dt);
    this.stepClearing(now, dt);
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
  }

  stepSeats(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    const boxes = this.seatBoxes();
    const cwS = m.cw * SEAT_SCALE;
    const over = this.rules.phase === 'handOver' || this.rules.phase === 'over';
    this.seats.forEach((list, seat) => {
      const box = boxes.get(seat);
      const n = list.length;
      list.forEach((sp, i) => {
        if (now < sp.waitUntil) sp.target(m.deck.x, m.deck.y, 0, SEAT_SCALE, 1, 0);
        else if (box) {
          const spacing = n > 1 ? Math.min(cwS * 0.3, (box.w - cwS) / (n - 1)) : 0;
          sp.target(box.x + (i - (n - 1) / 2) * spacing, box.y + this.lay.seatH / 2, 0, SEAT_SCALE, over ? 0 : 1, 0);
        } else sp.target(m.W / 2 + i * 0.4, m.handBaseY - i * 0.3, 0, 1, 1, 0);
        sp.z = 70 + i;
        sp.step(dt, s.stiffness, s.damping);
        sp.render();
      });
    });
    this.labels.forEach((el, seat) => {
      const box = boxes.get(seat);
      el.style.display = box ? '' : 'none';
      if (box) el.style.transform = `translate(${box.x}px, ${box.y + this.lay.seatH + 4}px) translateX(-50%)`;
    });
  }

  stepClearing(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    this.clearing = this.clearing.filter((sp) => {
      if (now >= sp.removeAt) {
        sp.destroy();
        return false;
      }
      sp.target(-m.cw, m.pz.y, -30, PILE_SCALE * 0.8, 1, 0.3);
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
      const pos = r.finished.indexOf(seat);
      const role = r.roleOf(seat);
      let sub = pos >= 0 ? `out · ${title(pos, r.n)}` : `${r.hands[seat].length} cards`;
      if (pos < 0 && r.passed.has(seat) && r.phase === 'play') sub += ' · passed';
      if (pos < 0 && role && r.phase !== 'handOver') sub = `${role} · ${sub}`;
      el.lastChild.textContent = sub;
      el.classList.toggle('active', seat === r.turn && (r.phase === 'play' || r.phase === 'exchange'));
    });
    const me = this.viewer;
    const myRole = me != null ? r.roleOf(me) : null;
    const myPos = me != null ? r.finished.indexOf(me) : -1;
    this.youLabel.textContent = me == null ? '' : `${names[me]}${myRole ? ` · ${myRole}` : ''} · ${r.scores[me]} pts${myPos >= 0 ? ` · out (${title(myPos, r.n)})` : ''}`;
    const t = r.top;
    this.pileInfo.textContent = r.phase !== 'play' ? '' : t ? `Beat ${plural(t.cards[0], t.cards.length)} · ${names[t.p]}` : `${names[r.turn]} lead${this.mode === 'single' && r.turn === 0 ? '' : 's'}: play anything`;
    const mine = this.myTurn();
    let status = '';
    if (r.phase === 'exchange') status = mine ? 'Give back cards' : 'Card swap…';
    else if (r.phase === 'play') status = mine ? 'Your turn' : me == null ? '' : `${names[r.turn]}’s turn…`;
    this.statusEl.textContent = status;
    this.statusEl.classList.toggle('mine', mine);

    const sel = this.selected();
    const exch = r.phase === 'exchange';
    this.actions.style.visibility = me == null || !(r.phase === 'play' || exch) ? 'hidden' : '';
    this.giveBtn.hidden = !exch;
    this.passBtn.hidden = exch;
    this.playBtn.hidden = exch;
    const k = r.owed.get(me)?.k ?? 0;
    this.giveBtn.disabled = !mine || sel.length !== k;
    this.giveBtn.textContent = `Give ${sel.length}/${k}`;
    this.passBtn.disabled = !mine || !r.canPass(me);
    this.playBtn.disabled = !mine || !r.canPlay(me, sel.map((s) => s.card));
    this.playBtn.textContent = sel.length > 1 ? `Play ${sel.length}` : 'Play';
    let hint = '';
    if (mine && exch) hint = `You're ${myRole}: pick ${k} card${k > 1 ? 's' : ''} to give to ${names[r.owed.get(me).to]}`;
    else if (mine && !t) hint = 'Lead with one to four cards of a rank';
    else if (mine && !r.options(me).length) hint = "Nothing beats it: pass";
    this.hintEl.textContent = hint;
  }

  say(msg, ms = 1800) {
    if (!msg) return;
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  showBoard() {
    const r = this.rules;
    const last = r.lastHand;
    const names = this.names();
    if (this.mode === 'single') this.viewer = 0;
    const c = this.overCard;
    c.innerHTML = '';
    const over = r.phase === 'over';
    let head = `Hand ${r.handNo}`;
    if (over) head = this.mode === 'single' && r.winner === 0 ? 'You won!' : `${names[r.winner]} wins`;
    c.append(h('div', 'game-win-title', head));
    const table = h('table', 'hx-scores');
    table.innerHTML = '<tr><th></th><th></th><th>Pts</th><th>Total</th></tr>';
    last.order.forEach((p, i) => {
      const tr = h('tr', `${p === 0 && this.mode === 'single' ? 'me' : ''}${i === 0 ? ' low' : ''}`);
      for (const v of [names[p], title(i, r.n), last.points[i] ? `+${last.points[i]}` : '', String(r.scores[p])]) tr.append(h('td', '', v));
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
      c.append(h('div', 'game-win-stats', `Next hand: the Scum gives the President their best cards · first to ${r.target}`));
      btn('Next hand', () => {
        r.nextHand();
        this.begin(r, true);
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
    return `thedeck.president.${this.mode}.v1`;
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
      return President.restore(JSON.parse(localStorage.getItem(this.saveKey())));
    } catch {
      return null;
    }
  }
}
