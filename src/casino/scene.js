// Casino: singleplayer against a CPU, or pass-and-play for two. Your hand is
// the lab's hand (RuleTable + Input). Tap a hand card, tap the table cards
// you want, then Capture, Build or Trail. Dragging a card up plays it the
// obvious way: capture the most it can (or what you picked), otherwise trail.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=rummy';
import { Casino, cardsOf, itemId, val } from './rules.js';

const SEAT_SCALE = 0.45;
const TABLE_SCALE = 0.6;
const SMALL = 0.4;
const CPU_DELAY = 950;
const RANK = { 1: 'ace', 11: 'jack', 12: 'queen', 13: 'king' };
const cardName = (c) => `${RANK[c.value] ?? c.value}`;

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

class CasinoTable extends RuleTable {
  hitDeck() {
    return false;
  }
}

export class CasinoScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.mode = null;
    this.rules = null;
    this.viewer = null;
    this.byId = new Map();
    this.place = new Map();
    this.picked = new Set(); // table item ids picked for the next play
    this.itemRects = []; // [{ id, x, y, w, h }]
    this.badges = new Map(); // build id -> element
    this.queue = [];
    this.handoffFor = -1;

    this.buildDOM();
    this.table = new CasinoTable(
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
    this.scoreEl = h('div', 'game-stats cs-score');
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.showSetup());
    top.append(back, h('div', 'game-title', 'Casino'), this.scoreEl, newBtn);

    this.oppLabel = h('div', 'rm-label cs-opp');
    this.youLabel = h('div', 'rm-label cs-you');
    this.stockLabel = h('div', 'rm-row-label cs-stock-label');
    this.badgeLayer = h('div', 'cs-badges');
    this.actions = h('div', 'rm-actions');
    const act = (label, fn, cls = '') => {
      const b = h('button', `game-btn small ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      this.actions.append(b);
      return b;
    };
    this.capBtn = act('Capture', () => this.doCapture(), 'accent');
    this.buildBtn = act('Build', () => this.doBuild(), 'accent');
    this.trailBtn = act('Trail', () => this.doTrail());
    this.hintEl = h('div', 'rm-hint');
    this.toastEl = h('div', 'c8-toast rm-toast cb-toast');
    this.overEl = h('div', 'game-win');
    this.overCard = h('div', 'game-win-card');
    this.overEl.append(this.overCard);
    this.handoffEl = h('div', 'rm-handoff cs-handoff');

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.badgeLayer, this.oppLabel, this.youLabel, this.stockLabel, this.actions, this.hintEl, this.toastEl, top, this.handoffEl, this.overEl,
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
    const oppY = safe.top + 50 + (ch * SEAT_SCALE) / 2 + 4;
    const selLift = (this.table.s.selectLift ?? 0.25) * ch;
    const actionsY = m.handTop - selLift - 30;
    const land = m.landscape;
    const tableTop = oppY + (ch * SEAT_SCALE) / 2 + 22;
    // Portrait: your capture pile sits above the buttons. Landscape: the buttons move to the
    // right and the table uses the space to their left, down to the hand.
    const tableBottom = land ? actionsY + 10 : actionsY - 84;
    const tableRight = land ? right - 230 : right;
    const myPile = land ? { x: left + (cw * SMALL) / 2, y: (tableTop + tableBottom) / 2 } : { x: left + (cw * SMALL) / 2, y: actionsY - 56 };
    m.deck = { x: left + (cw * SMALL) / 2, y: oppY };
    m.pz = { x: cx, y: (tableTop + tableBottom) / 2, w: right - left, h: Math.max(40, tableBottom - tableTop) };
    const tableLeft = land ? left + cw * SMALL + 70 : left;
    this.lay = { left: tableLeft, right: tableRight, cx: (tableLeft + tableRight) / 2, oppY, actionsY, tableTop, tableBottom, myPile, oppPile: { x: right - (cw * SMALL) / 2, y: oppY } };
    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    pos(this.oppLabel, this.lay.oppPile.x - (cw * SMALL) / 2 - 8, oppY, 'translate(-100%, -50%)');
    pos(this.youLabel, myPile.x + (cw * SMALL) / 2 + 8, myPile.y, 'translateY(-50%)');
    pos(this.stockLabel, m.deck.x, oppY + (ch * SMALL) / 2 + 9, 'translate(-50%, -50%)');
    if (land) {
      pos(this.actions, right, (tableTop + tableBottom) / 2 + 14, 'translate(-100%, -50%)');
      pos(this.hintEl, right, (tableTop + tableBottom) / 2 - 16, 'translate(-100%, -50%)');
    } else {
      pos(this.actions, cx, actionsY, 'translate(-50%, -50%)');
      pos(this.hintEl, cx, actionsY - 26, 'translate(-50%, -50%)');
    }
    this.hintEl.classList.toggle('cs-hint-right', land);
    pos(this.toastEl, cx, tableTop + 4, 'translate(-50%, -50%)');
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
    c.append(h('div', 'game-win-title', 'Casino'));
    c.append(h('div', 'game-win-stats', this.mode === 'multi' ? 'Two players, pass and play' : 'You against the computer'));
    c.append(h('div', 'game-win-stats', 'Capture by rank or by sums · build ahead · first to 21'));
    const actions = h('div', 'game-win-actions');
    const go = h('button', 'game-btn accent', 'Deal');
    go.type = 'button';
    go.addEventListener('click', () => this.begin(new Casino({ dealer: Math.random() < 0.5 ? 0 : 1 }), true));
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
    this.picked.clear();
    this.queue = [];
    this.rules = rules;
    this.overEl.classList.remove('show');
    this.handoffEl.classList.remove('show');
    this.handoffFor = -1;
    this.viewer = this.mode === 'single' ? 0 : null;
    this.sync(deal);
    if (rules.phase === 'roundOver' || rules.phase === 'over') this.showBoard();
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

  sync(deal = false) {
    const r = this.rules;
    const t = this.table;
    const m = t.m;
    const { left, right, cx, oppY, tableTop, tableBottom, myPile, oppPile } = this.lay;
    const now = performance.now();
    this.place.clear();
    const set = (card, x, y, scale, flip, rot = 0, z = 50) => {
      this.sprite(card);
      this.place.set(card.id, { x, y, scale, flip, rot, z });
    };
    // Viewer's hand
    const want = this.viewer == null ? [] : r.hands[this.viewer].map((c) => this.sprite(c));
    const wantSet = new Set(want);
    for (const sp of [...t.hand]) if (!wantSet.has(sp)) t.removeFromHand(sp);
    if (t.drag && !wantSet.has(t.drag.sprite)) this.input.cancel();
    const inHand = new Set(t.hand);
    let k = 0;
    for (const sp of want) {
      if (inHand.has(sp) || t.drag?.sprite === sp) continue;
      t.takeSprite(sp, deal ? 250 + k++ * 80 : 0);
    }
    // Opponent's hand (or both, face down, while the device is passed)
    const cwS = m.cw * SEAT_SCALE;
    for (const p of [0, 1]) {
      if (p === this.viewer) continue;
      const atBottom = this.viewer == null && p === this.handoffFor;
      r.hands[p].forEach((c, i, a) => {
        if (atBottom) set(c, cx + i * 0.5, m.handBaseY - i * 0.4, 1, 1, 0, 60 + i);
        else set(c, cx + (i - (a.length - 1) / 2) * cwS * 0.6, oppY, SEAT_SCALE, 1, 0, 60 + i);
      });
    }
    // Stock and capture piles
    r.stock.slice(-6).forEach((c, i) => set(c, m.deck.x - i * 0.3, m.deck.y - i * 0.4, SMALL, 1, 0, 10 + i));
    const me = this.viewer ?? 0;
    [me, 1 - me].forEach((p, side) => {
      const at = side === 0 ? myPile : oppPile;
      r.captured[p].slice(-8).forEach((c, i) => set(c, at.x - i * 0.3, at.y - i * 0.4, SMALL, 1, 0, 20 + i));
    });

    // Table: items in rows; builds fan downward with a badge.
    const width = right - left;
    const n = r.table.length;
    // Shrink the table cards until every item fits the area.
    const tallest = Math.max(1, ...r.table.map((it) => (it.kind === 'build' ? it.cards.length : 1)));
    let ks = TABLE_SCALE;
    let cols;
    let rows;
    for (; ks > 0.3; ks -= 0.02) {
      const w = m.cw * ks;
      cols = Math.max(1, Math.min(n, Math.floor((width + w * 0.18) / (w * 1.18))));
      rows = Math.ceil(n / cols) || 1;
      if (rows * (m.ch * ks * (1 + (tallest - 1) * 0.2) + 18) <= tableBottom - tableTop) break;
    }
    const tw = m.cw * ks;
    const th = m.ch * ks;
    const gapX = tw * 0.18;
    const buildExtra = Math.max(0, ...r.table.map((it) => (it.kind === 'build' ? (it.cards.length - 1) * th * 0.2 : 0)));
    const rowH = Math.min(th + buildExtra + 18, (tableBottom - tableTop - 10) / rows);
    const y0 = (tableTop + tableBottom) / 2 - (rows * rowH) / 2 + th / 2 + 4;
    this.itemRects = [];
    const live = new Set();
    r.table.forEach((it, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const col = i % cols;
      const x = cx + (col - (inRow - 1) / 2) * (tw + gapX);
      const y = y0 + row * rowH;
      const id = itemId(it);
      const picked = this.picked.has(id);
      const lift = picked ? -8 : 0;
      cardsOf(it).forEach((c, j) => set(c, x, y + lift + j * th * 0.2, ks, 0, 0, 120 + i * 10 + j));
      const hgt = th + (cardsOf(it).length - 1) * th * 0.2;
      this.itemRects.push({ id, x, y: y + lift - th / 2 + hgt / 2, w: tw, h: hgt });
      if (it.kind === 'build') {
        live.add(it.id);
        let b = this.badges.get(it.id);
        if (!b) {
          b = h('div', 'cs-badge');
          this.badgeLayer.append(b);
          this.badges.set(it.id, b);
        }
        b.textContent = `${it.value} · ${this.names()[it.owner]}`;
        b.classList.toggle('mine', it.owner === me);
        b.style.transform = `translate(${x}px, ${y + lift - th / 2 - 9}px) translate(-50%, -50%)`;
      }
    });
    for (const [id, b] of this.badges) {
      if (!live.has(id)) {
        b.remove();
        this.badges.delete(id);
      }
    }
    if (deal) {
      let i = 0;
      for (const id of this.place.keys()) {
        const s = this.byId.get(id);
        if (s && !t.hand.includes(s)) s.waitUntil = now + 120 + i++ * 30;
      }
    }
    t.played = [];
    t.pendingLandings.clear();
    this.highlight();
    t.updateDeck();
    this.updateHUD();
  }

  /** Picked table cards glow yellow; what the selected hand card could take glows faintly. */
  highlight() {
    const r = this.rules;
    const sel = this.selectedCard();
    const could = new Set(sel && this.myTurn() ? r.bestCapture(sel).map(itemId) : []);
    for (const it of r.table) {
      const id = itemId(it);
      for (const c of cardsOf(it)) {
        const sp = this.byId.get(c.id);
        if (!sp) continue;
        sp.el.classList.toggle('cs-picked', this.picked.has(id));
        sp.el.classList.toggle('cs-could', !this.picked.has(id) && could.has(id));
      }
    }
  }

  // ------------------------------------------------------------ RuleTable hooks

  myTurn() {
    const r = this.rules;
    return !!r && this.viewer != null && !this.busy && r.phase === 'play' && r.turn === this.viewer;
  }

  selectedCard() {
    return this.table.hand.find((s) => s.selected)?.card ?? null;
  }

  onSelect(sp) {
    const on = !sp.selected;
    for (const o of this.table.hand) o.setSelected(false);
    sp.setSelected(on);
    this.table.haptic(5);
    this.highlight();
    this.updateHUD();
    return true;
  }

  hidePlayButtons() {
    return true;
  }

  pileIndexAt(p) {
    for (let i = this.itemRects.length - 1; i >= 0; i--) {
      const r = this.itemRects[i];
      if (Math.abs(p.x - r.x) <= r.w / 2 + 3 && Math.abs(p.y - r.y) <= r.h / 2 + 3) return i;
    }
    return -1;
  }

  onPileTap(i) {
    const rect = this.itemRects[i];
    if (!rect || !this.myTurn()) return;
    if (this.picked.has(rect.id)) this.picked.delete(rect.id);
    else this.picked.add(rect.id);
    this.table.haptic(4);
    this.sync();
  }

  /** Drag up / flick: capture what's picked (or the most it can), otherwise trail. */
  onPlay(sp) {
    const r = this.rules;
    if (!this.myTurn()) {
      this.say(this.viewer == null ? '' : `Wait, it's ${this.names()[r.turn]}'s turn`);
      return false;
    }
    const card = sp.card;
    const me = this.viewer;
    let res = null;
    const picked = [...this.picked];
    if (picked.length) res = r.capture(me, card.id, picked);
    if (!res) {
      const best = r.bestCapture(card).map(itemId);
      if (best.length && !picked.length) res = r.capture(me, card.id, best);
    }
    if (!res && !picked.length) res = r.trail(me, card.id);
    if (!res) {
      this.say(this.whyNot(card, picked.length ? 'capture' : 'trail'));
      sp.x.vel += 420;
      this.table.haptic([6, 40, 6]);
      return false;
    }
    this.pending = res;
    return true;
  }

  afterPlay() {
    const res = this.pending;
    this.pending = null;
    if (res) this.afterMove(res, this.viewer, res.items ? 'capture' : 'trail');
  }

  stockCount() {
    return this.rules?.stock.length ?? 0;
  }

  whyNot(card, what) {
    const r = this.rules;
    const me = this.viewer;
    if (what === 'trail') {
      if (r.owned(me).length) return `You own a build of ${r.owned(me)[0].value}: capture it or build, you can't trail`;
      return `Save that ${cardName(card)} for your build`;
    }
    if (what === 'build') {
      if (card.value > 10) return "Face cards can't build";
      return 'A build has to add up to 10 or less, and you need another card of that value';
    }
    if (r.breaksOwnBuild(me, card, [...this.picked].map((id) => r.item(id)))) return `Save that ${cardName(card)} for your build`;
    return card.value > 10 ? `A ${cardName(card)} only takes another ${cardName(card)}` : `Those don't add up to ${val(card)}`;
  }

  // ---------------------------------------------------------------- actions

  doCapture() {
    const card = this.selectedCard();
    if (!this.myTurn() || !card) return;
    const ids = this.picked.size ? [...this.picked] : this.rules.bestCapture(card).map(itemId);
    const res = this.rules.capture(this.viewer, card.id, ids);
    if (!res) return this.say(this.whyNot(card, 'capture'));
    this.afterMove(res, this.viewer, 'capture');
  }

  doBuild() {
    const card = this.selectedCard();
    if (!this.myTurn() || !card) return;
    const res = this.rules.build(this.viewer, card.id, [...this.picked]);
    if (!res) return this.say(this.whyNot(card, 'build'));
    this.afterMove(res, this.viewer, 'build');
  }

  doTrail() {
    const card = this.selectedCard();
    if (!this.myTurn() || !card) return;
    const res = this.rules.trail(this.viewer, card.id);
    if (!res) return this.say(this.whyNot(card, 'trail'));
    this.afterMove(res, this.viewer, 'trail');
  }

  afterMove(res, p, type) {
    for (const s of this.table.hand) s.setSelected(false);
    this.picked.clear();
    const names = this.names();
    const you = this.mode === 'single' && p === 0;
    const who = you ? 'You' : names[p];
    let msg = '';
    if (type === 'capture') {
      const n = res.items.flatMap(cardsOf).length;
      msg = `${who} take${you ? '' : 's'} ${n} with the ${cardName(res.card)}${res.sweep ? ' · Sweep!' : ''}`;
      this.table.haptic(res.sweep ? [10, 40, 10, 40, 10] : 10);
    } else if (type === 'build') {
      msg = `${who} build${you ? '' : 's'} ${res.build.value}`;
      this.table.haptic(8);
    } else if (!you) msg = `${who} trails the ${cardName(res.card)}`;
    if (res.dealt) msg = `${msg ? `${msg} · ` : ''}New deal: 4 cards each`;
    if (msg) this.say(msg);
    if (this.mode === 'multi') this.viewer = null;
    this.sync(!!res.dealt);
    this.save();
    if (res.round) this.enqueue(1200, () => this.showBoard());
  }

  // -------------------------------------------------------------------- CPU

  cpuStep() {
    const r = this.rules;
    const p = r.turn;
    if (!this.isCpu(p) || r.phase !== 'play') return;
    const mv = r.cpuMove(p);
    const res = mv.type === 'capture' ? r.capture(p, mv.cardId, mv.itemIds) : mv.type === 'build' ? r.build(p, mv.cardId, mv.itemIds) : r.trail(p, mv.cardId);
    if (res) this.afterMove(res, p, mv.type);
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
    if (!r || r.phase !== 'play' || this.overEl.classList.contains('show')) return;
    if (this.isCpu(r.turn)) {
      this.enqueue(CPU_DELAY, () => this.cpuStep());
      return;
    }
    if (this.mode === 'multi' && this.viewer !== r.turn && this.handoffFor !== r.turn) this.showHandoff(r.turn);
    else if (this.mode === 'multi' && this.viewer == null && this.handoffFor === r.turn && !this.handoffEl.classList.contains('show')) this.showHandoff(r.turn);
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
    const me = this.viewer ?? 0;
    const line = (p) => `<div class="rm-name">${names[p]}${r.turn === p && r.phase === 'play' ? ' ●' : ''}</div><div class="rm-sub">${r.captured[p].length} taken${r.sweeps[p] ? ` · ${r.sweeps[p]} sweep${r.sweeps[p] > 1 ? 's' : ''}` : ''}</div>`;
    this.oppLabel.innerHTML = line(1 - me);
    this.youLabel.innerHTML = line(me);
    this.stockLabel.textContent = r.stock.length ? `${r.stock.length} left` : 'last deal';
    this.scoreEl.textContent = `${this.mode === 'single' ? 'You' : 'P1'} ${r.scores[0]} · ${this.mode === 'single' ? 'CPU' : 'P2'} ${r.scores[1]}`;

    const mine = this.myTurn();
    const card = this.selectedCard();
    const picked = [...this.picked].map((id) => r.item(id)).filter(Boolean);
    this.actions.style.visibility = this.viewer == null ? 'hidden' : '';
    const canCap = mine && card && (picked.length ? r.validCapture(card, picked) : r.bestCapture(card).length > 0);
    this.capBtn.disabled = !canCap;
    const bv = mine && card && picked.length ? r.buildValue(this.viewer, card, picked) : null;
    this.buildBtn.disabled = bv === null;
    this.buildBtn.textContent = bv === null ? 'Build' : `Build ${bv}`;
    this.trailBtn.disabled = !mine || !card || picked.length > 0 || !r.canTrail(this.viewer, card);
    let hint = '';
    if (mine) {
      const own = r.owned(this.viewer)[0];
      if (!card) hint = own ? `You're building ${own.value}: take it when you can` : 'Tap a card in your hand';
      else if (!picked.length) hint = r.bestCapture(card).length ? 'Capture takes the glowing cards, or tap the ones you want' : 'Tap table cards to build, or trail';
      else hint = `${picked.length} picked`;
    } else if (this.viewer != null && r.phase === 'play') hint = `${names[r.turn]}’s turn…`;
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
    const last = r.lastRound;
    const over = r.phase === 'over';
    const c = this.overCard;
    c.innerHTML = '';
    let title = `Round ${r.round}`;
    if (over) title = this.mode === 'single' ? (r.winner === 0 ? 'You won!' : 'CPU wins') : `${names[r.winner]} wins`;
    c.append(h('div', 'game-win-title', title));
    if (last.rest) c.append(h('div', 'game-win-stats', `${names[last.restTo]} took the last ${last.rest} on the table`));
    const table = h('table', 'hx-scores cs-scores');
    table.innerHTML = `<tr><th></th><th>${names[0]}</th><th>${names[1]}</th></tr>`;
    const row = (label, a, b) => {
      const tr = h('tr');
      for (const v of [label, a, b]) tr.append(h('td', '', String(v)));
      table.append(tr);
    };
    const [a, b] = last.rows;
    row(`Cards (${a.cards}–${b.cards})`, a.cardPts, b.cardPts);
    row(`Spades (${a.spades}–${b.spades})`, a.spadePts, b.spadePts);
    row('Big casino 10♦', a.bigCasino, b.bigCasino);
    row('Little casino 2♠', a.littleCasino, b.littleCasino);
    row('Aces', a.aces, b.aces);
    row('Sweeps', a.sweeps, b.sweeps);
    const tot = h('tr', 'low');
    for (const v of ['Round', a.total, b.total]) tot.append(h('td', '', String(v)));
    table.append(tot);
    const sum = h('tr', 'me');
    for (const v of ['Total', r.scores[0], r.scores[1]]) sum.append(h('td', '', String(v)));
    table.append(sum);
    c.append(table);
    const actions = h('div', 'game-win-actions');
    const btn = (label, fn, cls) => {
      const bb = h('button', `game-btn ${cls}`, label);
      bb.type = 'button';
      bb.addEventListener('click', fn);
      actions.append(bb);
    };
    if (over) {
      btn('Play again', () => this.showSetup(), 'accent');
      btn('Lobby', () => this.onExit(), '');
    } else {
      c.append(h('div', 'game-win-stats', `First to ${r.target} wins`));
      btn('Next round', () => {
        r.nextRound();
        this.begin(r, true);
      }, 'accent');
    }
    c.append(actions);
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
    return `thedeck.casino.${this.mode}.v1`;
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
      return Casino.restore(JSON.parse(localStorage.getItem(this.saveKey())));
    } catch {
      return null;
    }
  }
}
