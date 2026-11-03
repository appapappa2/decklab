// Crazy Eights vs. a CPU. Your hand is the lab's hand (Game + Input), so it
// plays with exactly the feel tuned in the Hand feel prototype: scrub to peek,
// drag up or flick to play, tap + Play, reorder, scroll. The RuleTable hooks
// add the rules: illegal plays snap back, the deck draws only when you must,
// and the CPU's cards land on the same pile.
import { Input } from '../input.js';
import { cardBackHTML, suitHTML, SUITS } from '../cards.js?v=landing-burst';
import { RuleTable } from '../table.js?v=hearts';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { CrazyEights } from './rules.js';

const SAVE_KEY = 'thedeck.eights.v1';
const CPU_THINK_MS = 800; // pause before the CPU acts
const CPU_DRAW_MS = 420; // between CPU draws
const CPU_SCALE = 0.6; // CPU hand card size
const DEAL_STAGGER = 70;
const SUIT_NAME = Object.fromEntries(SUITS.map((s) => [s.id, s.name]));
const RANK_NAME = { A: 'ace', J: 'jack', Q: 'queen', K: 'king' };
const rankName = (card) => RANK_NAME[card.rank] ?? card.rank;

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

export class EightsScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.visible = false;
    this.cpu = []; // CPU hand sprites
    this.cpuAt = 0; // when the CPU acts next
    this.flashTimer = 0;
    this.overShown = false;
    this.started = false;

    this.buildDOM(onExit);
    this.table = new RuleTable(
      {
        screen: root,
        layer: this.cardsEl,
        ui: this.uiEl,
        deck: this.deckEl,
        deckCount: this.deckCountEl,
        edgeL: this.edgeL,
        edgeR: this.edgeR,
      },
      settings,
      haptic,
      this,
    );
    this.input = new Input(root, this.table, device, settings);
    this.sparkles = new SparkleTrail(this.sparklesEl);
    this.ripples = new LandingRipples(this.ripplesEl);

    // Keep the lab's Input on #screen from also seeing these events.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'touchstart']) {
      root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
    window.addEventListener('pagehide', () => this.save());
  }

  // -------------------------------------------------------------------- DOM

  buildDOM(onExit) {
    const r = this.root;
    r.innerHTML = '';
    this.deckEl = h('div', 'deck-pile');
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
    back.addEventListener('click', onExit);
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.newGame());
    this.statusEl = h('div', 'game-stats c8-status');
    top.append(back, h('div', 'game-title', 'Crazy Eights'), this.statusEl, newBtn);

    this.cpuCountEl = h('div', 'c8-cpu-count');
    this.suitEl = h('div', 'c8-suit');
    this.toastEl = h('div', 'c8-toast');

    this.pickerEl = h('div', 'c8-picker');
    const pickCard = h('div', 'c8-picker-card');
    pickCard.append(h('div', 'c8-picker-title', 'Choose a suit'));
    const row = h('div', 'c8-picker-row');
    for (const s of SUITS) {
      const b = h('button', `c8-suit-btn${s.red ? ' red' : ''}`, suitHTML(s.id));
      b.type = 'button';
      b.setAttribute('aria-label', s.name);
      b.addEventListener('click', () => this.pickSuit(s.id));
      row.append(b);
    }
    pickCard.append(row);
    this.pickerEl.append(pickCard);

    this.overEl = h('div', 'game-win');
    const card = h('div', 'game-win-card');
    this.overTitle = h('div', 'game-win-title');
    this.overStats = h('div', 'game-win-stats');
    const actions = h('div', 'game-win-actions');
    const again = h('button', 'game-btn accent', 'Play again');
    again.type = 'button';
    again.addEventListener('click', () => this.newGame());
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', onExit);
    actions.append(again, lobby);
    card.append(this.overTitle, this.overStats, actions);
    this.overEl.append(card);

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      this.cpuCountEl, this.suitEl, this.toastEl, top, this.pickerEl, this.overEl,
    );
  }

  // ----------------------------------------------------------------- layout

  setSize(W, H, safe) {
    this.W = W;
    this.H = H;
    this.safe = safe;
    this.table.setSize(W, H, safe);
    this.sparkles.resize(W, H);
    this.ripples.resize(W, H);
  }

  /** Moves the lab layout's deck and pile to the middle and makes room for the CPU's hand on top. */
  adjustLayout() {
    const m = this.table.m;
    const { W, safe } = m;
    const barH = 46;
    const cpuH = m.ch * CPU_SCALE;
    const cpuY = safe.top + barH + cpuH / 2 + 6;
    const midY = (cpuY + cpuH / 2 + m.handTop) / 2 + m.ch * 0.02;
    const cx = W / 2;
    m.deck = { x: cx - m.cw * 0.8, y: midY };
    m.pz = { x: cx + m.cw * 0.8, y: midY, w: m.cw * 1.9, h: m.ch * 1.35 };
    this.table.els.deck.style.left = `${m.deck.x - m.cw / 2}px`;
    this.table.els.deck.style.top = `${m.deck.y - m.ch / 2}px`;
    this.lay = { cpuY, midY, cx, cpuW: m.cw * CPU_SCALE };

    this.cpuCountEl.style.transform = `translate(${W - safe.right - 12}px, ${cpuY + cpuH / 2 + 4}px) translateX(-100%)`;
    this.suitEl.style.transform = `translate(${m.pz.x + m.cw * 0.5 + 8}px, ${midY - m.ch / 2}px)`;
    // Toasts go in the open space: between the CPU's hand and the pile, or left of the deck in landscape.
    this.toastEl.style.transform = m.landscape
      ? `translate(${m.deck.x - m.cw * 0.75}px, ${midY}px) translate(-100%, -50%)`
      : `translate(${cx}px, ${(cpuY + cpuH / 2 + midY - m.ch * 0.7) / 2}px) translate(-50%, -50%)`;
  }

  // ------------------------------------------------------------ game setup

  start() {
    const saved = this.load();
    if (saved) this.restoreVisuals(saved);
    else this.newGame();
  }

  newGame() {
    this.input.cancel();
    const t = this.table;
    const now = performance.now();
    // Everything on the table flies back to the deck.
    const hadCards = t.hand.length + t.played.length + this.cpu.length > 0;
    for (const sp of [...t.hand, ...this.cpu]) sp.el.classList.remove('c8-dim');
    t.clearTable();
    t.discard(this.cpu);
    t.pendingLandings.clear();
    this.cpu = [];
    this.overShown = false;
    this.overEl.classList.remove('show');
    this.pickerEl.classList.remove('show');

    // Alternate who starts.
    const first = this.rules ? (this.lastFirst === 'you' ? 'cpu' : 'you') : 'you';
    this.lastFirst = first;
    this.rules = new CrazyEights(undefined, first);
    const base = hadCards ? 380 : 150;
    for (let i = 0; i < 7; i++) {
      t.addCard(this.rules.hands.you[i], base + i * 2 * DEAL_STAGGER);
      this.addCpuSprite(this.rules.hands.cpu[i], base + (i * 2 + 1) * DEAL_STAGGER);
    }
    const starter = this.spriteAtDeck(this.rules.top);
    t.placeOnPile(starter);
    starter.waitUntil = now + base + 14 * DEAL_STAGGER + 150;
    this.cpuAt = now + base + 14 * DEAL_STAGGER + 700;
    this.afterChange();
  }

  restoreVisuals(rules) {
    this.rules = rules;
    this.lastFirst = rules.turn;
    const t = this.table;
    for (const c of rules.discard) {
      const sp = this.spriteAtDeck(c);
      t.placeOnPile(sp);
    }
    t.pendingLandings.clear(); // no landing bursts for the restored pile
    rules.hands.you.forEach((c, i) => t.addCard(c, 150 + i * DEAL_STAGGER));
    rules.hands.cpu.forEach((c, i) => this.addCpuSprite(c, 150 + i * DEAL_STAGGER));
    this.cpuAt = performance.now() + 900;
    if (rules.choosing && rules.turn === 'you') this.pickerEl.classList.add('show');
    this.afterChange();
  }

  spriteAtDeck(card) {
    return this.table.spriteAtDeck(card);
  }

  addCpuSprite(card, delay = 0) {
    const sp = this.spriteAtDeck(card);
    sp.waitUntil = performance.now() + delay;
    this.cpu.push(sp);
    return sp;
  }

  // ---------------------------------------------------------- player turn

  canPlayerPlay(sp) {
    const r = this.rules;
    return !!r && r.turn === 'you' && !r.choosing && !r.winner && r.canPlay(sp.card);
  }

  // RuleTable hooks
  onPlay(sp) {
    if (this.canPlayerPlay(sp) && this.rules.play('you', sp.card.id)) return true;
    this.reject(sp);
    return false;
  }

  onDeckTap() {
    this.playerDraw();
  }

  stockCount() {
    return this.rules?.stock.length ?? 0;
  }

  afterPlay() {
    const r = this.rules;
    if (r.choosing) this.pickerEl.classList.add('show');
    else this.cpuAt = performance.now() + CPU_THINK_MS;
    this.afterChange();
  }

  pickSuit(suit) {
    if (!this.rules.chooseSuit('you', suit)) return;
    this.pickerEl.classList.remove('show');
    this.table.haptic(10);
    this.cpuAt = performance.now() + CPU_THINK_MS;
    this.afterChange();
  }

  /** Feedback for a card that can't be played right now. */
  reject(sp) {
    const r = this.rules;
    let msg;
    if (r.winner) msg = 'The game is over';
    else if (r.turn !== 'you') msg = "Wait, it's the CPU's turn";
    else if (r.choosing) msg = 'Choose a suit first';
    else msg = `Play a ${SUIT_NAME[r.activeSuit].slice(0, -1)}${r.suit ? '' : `, a ${rankName(r.top)}`} or an 8`;
    this.toast(msg);
    sp.x.vel += 420; // a little shake
    this.table.haptic([6, 40, 6]);
  }

  playerDraw() {
    const r = this.rules;
    if (r.winner) return;
    if (r.turn !== 'you') return this.toast("It's the CPU's turn");
    if (r.choosing) return this.toast('Choose a suit first');
    if (r.playable('you').length) return this.toast('You have a card you can play');
    const res = r.draw('you');
    if (!res) return;
    if (res.reshuffled) this.reshuffleVisual();
    if (res.card) {
      this.table.addCard(res.card, 0);
      this.table.haptic(8);
    }
    if (res.pass) {
      this.toast('Nothing left to draw. You pass.');
      this.cpuAt = performance.now() + CPU_THINK_MS;
    }
    this.afterChange();
  }

  /** The pile, except its top card, goes back into the deck. */
  reshuffleVisual() {
    const t = this.table;
    const keep = t.played.pop();
    t.discard(t.played);
    t.played = keep ? [keep] : [];
    this.toast('Pile shuffled into the deck');
  }

  // -------------------------------------------------------------- CPU turn

  cpuStep(now) {
    const r = this.rules;
    const mv = r.cpuMove();
    if (mv.type === 'play') {
      r.play('cpu', mv.card.id, mv.suit);
      const i = this.cpu.findIndex((sp) => sp.card.id === mv.card.id);
      const [sp] = this.cpu.splice(i, 1);
      sp.waitUntil = 0;
      this.table.placeOnPile(sp);
      if (mv.suit && !r.winner) this.toast(`CPU picks ${SUIT_NAME[mv.suit]}`);
    } else {
      const res = r.draw('cpu');
      if (res?.reshuffled) this.reshuffleVisual();
      if (res?.card) this.addCpuSprite(res.card, 0);
      if (res?.pass) this.toast('CPU passes');
      this.cpuAt = now + CPU_DRAW_MS;
    }
    this.afterChange();
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    const r = this.rules;
    if (!r || !this.table.m) return;
    if (r.turn === 'cpu' && !r.winner && now >= this.cpuAt) this.cpuStep(now);

    // Dim cards you can't play on your turn.
    const myTurn = r.turn === 'you' && !r.choosing && !r.winner;
    for (const sp of this.table.hand) {
      const dim = myTurn && !r.canPlay(sp.card);
      if (sp.dim !== dim) {
        sp.dim = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    }

    this.table.update(now, dt);
    this.updateCpuHand(now, dt);
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
  }

  updateCpuHand(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    const n = this.cpu.length;
    const { cpuY, cx, cpuW } = this.lay;
    const avail = m.W - m.safe.left - m.safe.right - 40 - cpuW;
    const spacing = n > 1 ? Math.min(cpuW * 0.5, avail / (n - 1)) : 0;
    const mid = (n - 1) / 2;
    const reveal = !!this.rules.winner;
    this.cpu.forEach((sp, i) => {
      if (now < sp.waitUntil) {
        sp.target(m.deck.x, m.deck.y, 0, 1, 1, 0);
        sp.z = 60;
      } else {
        const d = i - mid;
        // A gentle upside-down fan: the opponent holds their cards facing you.
        sp.target(cx + d * spacing, cpuY - Math.min(d * d * 0.6, 6), -d * 2.2, CPU_SCALE, reveal ? 0 : 1, 0);
        sp.z = 70 + i;
      }
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
    });
  }

  // -------------------------------------------------------------------- HUD

  afterChange() {
    const r = this.rules;
    this.table.updateDeck();
    this.save();
    const n = r.hands.cpu.length;
    this.cpuCountEl.textContent = `CPU · ${n} ${n === 1 ? 'card' : 'cards'}`;

    let status = '';
    if (r.winner) status = '';
    else if (r.turn === 'cpu') status = 'CPU’s turn…';
    else if (r.choosing) status = 'Choose a suit';
    else if (r.playable('you').length) status = 'Your turn';
    else status = 'Draw a card';
    this.statusEl.textContent = status;
    this.statusEl.classList.toggle('mine', r.turn === 'you' && !r.winner);
    this.root.classList.toggle('must-draw', r.turn === 'you' && !r.winner && !r.choosing && !r.playable('you').length);

    // After an 8, show the named suit next to the pile.
    if (r.suit) {
      this.suitEl.innerHTML = suitHTML(r.suit);
      this.suitEl.className = `c8-suit show${SUITS.find((s) => s.id === r.suit).red ? ' red' : ''}`;
    } else {
      this.suitEl.className = 'c8-suit';
    }

    if (r.winner && !this.overShown) {
      this.overShown = true;
      this.pickerEl.classList.remove('show');
      this.overTitle.textContent = r.winner === 'you' ? 'You won!' : r.winner === 'cpu' ? 'CPU wins' : "It's a tie";
      const left = r.winner === 'you' ? `CPU had ${n} ${n === 1 ? 'card' : 'cards'} left` : `You had ${r.hands.you.length} left`;
      this.overStats.textContent = r.passes >= 2 ? `Blocked: no one could play. ${left}.` : left;
      setTimeout(() => this.overEl.classList.add('show'), 1100);
    }
  }

  toast(msg) {
    clearTimeout(this.flashTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.flashTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }

  // ------------------------------------------------------------ visibility

  show() {
    this.visible = true;
    this.root.classList.add('active');
    this.table.relayout();
    if (!this.started) {
      this.started = true;
      this.start();
    }
  }

  hide() {
    this.input.cancel();
    this.visible = false;
    this.root.classList.remove('active');
    this.save();
  }

  cancel() {
    this.input.cancel();
  }

  // ----------------------------------------------------------- persistence

  save() {
    if (!this.rules) return;
    try {
      if (this.rules.winner) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(this.rules.serialize()));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      return CrazyEights.restore(JSON.parse(localStorage.getItem(SAVE_KEY)));
    } catch {
      return null;
    }
  }
}
