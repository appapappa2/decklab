// Hearts: you against three CPUs (West, North, East). Your hand is the lab's
// hand (RuleTable + Input): while passing, tap cards to pick 3; while playing,
// drag up, flick or tap + Play to put a card in the trick. Illegal cards are
// dimmed and snap back with the reason.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=hearts';
import { Hearts, isQS, power } from './rules.js';

const SAVE_KEY = 'thedeck.hearts.v1';
const NAMES = ['You', 'West', 'North', 'East'];
const CPU_SCALE = 0.5;
const CPU_DELAY = 650; // between CPU plays
const COLLECT_DELAY = 1000; // a full trick stays on the table this long
const DEAL_STAGGER = 28;
const SUIT_ORDER = { C: 0, D: 1, S: 2, H: 3 }; // alternating colors
// Where each seat's card lands in the trick (in card widths/heights from the
// center). Landscape is short, so the trick spreads wider and flatter.
const trickPos = (seat, landscape) => {
  const x = landscape ? 1.15 : 0.85;
  const y = landscape ? 0.28 : 0.48;
  return [{ x: 0, y }, { x: -x, y: 0 }, { x: 0, y: -y }, { x, y: 0 }][seat];
};
const SUIT_WORD = { C: 'club', D: 'diamond', S: 'spade', H: 'heart' };
const DIR_ARROW = { left: '←', right: '→', across: '↑' };

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

export class HeartsScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.visible = false;
    this.started = false;
    this.seats = [null, [], [], []]; // CPU hand sprites per seat (index 0 = your hand, in the table)
    this.byId = new Map();
    this.collecting = []; // trick cards flying to the winner
    this.queue = [];
    this.pendingRes = null;
    this.overShown = false;

    this.buildDOM();
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

    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'touchstart']) {
      root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
    window.addEventListener('pagehide', () => this.save());
  }

  // -------------------------------------------------------------------- DOM

  buildDOM() {
    const r = this.root;
    r.innerHTML = '';
    // Hearts has no draw pile; the deck element only marks where cards are dealt from.
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
    newBtn.addEventListener('click', () => this.newGame());
    top.append(back, h('div', 'game-title', 'Hearts'), this.statusEl, newBtn);

    this.labels = NAMES.map((name, i) => {
      const el = h('div', `hx-label hx-label-${i}`);
      el.append(h('div', 'hx-name', name), h('div', 'hx-pts'));
      return el;
    });

    this.passBtn = h('button', 'game-btn accent hx-pass');
    this.passBtn.type = 'button';
    this.passBtn.addEventListener('click', () => this.doPass());
    this.toastEl = h('div', 'c8-toast hx-toast');

    this.boardEl = h('div', 'game-win hx-board');
    this.boardCard = h('div', 'game-win-card');
    this.boardEl.append(this.boardCard);

    r.append(
      this.deckEl, this.ripplesEl, this.cardsEl, this.edgeL, this.edgeR, this.sparklesEl, this.uiEl,
      ...this.labels, this.passBtn, this.toastEl, top, this.boardEl,
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
    const { W, H, safe } = m;
    const barH = 46;
    const cpuH = m.ch * CPU_SCALE;
    const cpuW = m.cw * CPU_SCALE;
    const northY = safe.top + barH + cpuH / 2 + 6;
    const midY = (northY + cpuH / 2 + m.handTop) / 2;
    const cx = W / 2;
    const westX = safe.left + cpuH * 0.32;
    const eastX = W - safe.right - cpuH * 0.32;
    m.deck = { x: cx, y: midY };
    // Drop zone for your card: the middle of the table.
    m.pz = { x: cx, y: midY, w: W * 0.8, h: m.ch * 2.2 };
    this.table.els.deck.style.left = `${m.deck.x - m.cw / 2}px`;
    this.table.els.deck.style.top = `${m.deck.y - m.ch / 2}px`;
    const sideSpan = Math.min(m.ch * 1.5, (m.handTop - northY) * 0.55);
    this.lay = { cx, midY, northY, westX, eastX, cpuW, cpuH, sideSpan };
    this.seatPos = [
      { x: cx, y: H - safe.bottom + m.ch * 0.2 },
      { x: westX - cpuH, y: midY },
      { x: cx, y: northY - cpuH },
      { x: eastX + cpuH, y: midY },
    ];

    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    const left = safe.left + 10;
    const right = W - safe.right - 10;
    if (m.landscape) pos(this.labels[0], left, northY, 'translateY(-50%)');
    else pos(this.labels[0], left, m.handTop - 34, 'translateY(-100%)');
    pos(this.labels[1], left, midY + sideSpan / 2 + cpuW / 2 + 10, '');
    pos(this.labels[2], cx + Math.min(W * 0.25, 13 * cpuW * 0.35) + cpuW / 2 + 12, northY, 'translateY(-50%)');
    pos(this.labels[3], right, midY + sideSpan / 2 + cpuW / 2 + 10, 'translateX(-100%)');
    pos(this.passBtn, cx, midY, 'translate(-50%, -50%)');
    pos(this.toastEl, cx, m.landscape ? midY : midY + m.ch * 0.98 + 14, 'translate(-50%, -50%)');
  }

  // ------------------------------------------------------------ game setup

  start() {
    const saved = this.load();
    if (saved) this.restoreVisuals(saved);
    else this.newGame();
  }

  newGame() {
    this.rules = new Hearts();
    this.heartsShown = false;
    this.overShown = false;
    this.dealVisuals();
  }

  /** Clears the table and deals the rules' current hands. */
  dealVisuals(fromRestore = false) {
    this.input.cancel();
    const t = this.table;
    const hadCards = this.byId.size > 0;
    t.clearTable();
    t.discard([...this.seats[1], ...this.seats[2], ...this.seats[3], ...this.collecting]);
    t.pendingLandings.clear();
    this.seats = [null, [], [], []];
    this.collecting = [];
    this.byId.clear();
    this.queue = [];
    this.boardEl.classList.remove('show');

    const r = this.rules;
    const base = hadCards ? 420 : 150;
    const now = performance.now();
    for (let i = 0; i < 13; i++) {
      for (let s = 0; s < 4; s++) {
        const card = r.hands[s][i];
        if (!card) continue;
        const delay = fromRestore ? 120 + i * 20 : base + (i * 4 + s) * DEAL_STAGGER;
        if (s === 0) this.register(t.addCard(card, delay));
        else {
          const sp = this.register(t.spriteAtDeck(card));
          sp.waitUntil = now + delay;
          this.seats[s].push(sp);
        }
      }
    }
    this.sortHand();
    // Cards already in the trick (restored mid-trick).
    for (const { seat, card } of r.trick) this.putInTrick(this.register(t.spriteAtDeck(card)), seat);
    this.enqueue(fromRestore ? 600 : base + 52 * DEAL_STAGGER + 300, () => {});
    this.afterChange();
  }

  restoreVisuals(rules) {
    this.rules = rules;
    this.heartsShown = rules.heartsBroken;
    this.dealVisuals(true);
    if (rules.phase === 'handOver' || rules.phase === 'gameOver') this.enqueue(0, () => this.showBoard());
  }

  register(sp) {
    this.byId.set(sp.card.id, sp);
    return sp;
  }

  sortHand() {
    const key = (c) => SUIT_ORDER[c.suit.id] * 20 + power(c);
    this.table.hand.sort((a, b) => key(a.card) - key(b.card));
  }

  // ------------------------------------------------------------ RuleTable hooks

  onSelect(sp) {
    const r = this.rules;
    if (r.phase !== 'pass') return false;
    const picked = this.table.hand.filter((s) => s.selected);
    if (!sp.selected && picked.length >= 3) {
      this.toast('You pass exactly 3 cards');
      return true;
    }
    sp.setSelected(!sp.selected);
    this.table.haptic(6);
    this.afterChange();
    return true;
  }

  hidePlayButtons() {
    return this.rules?.phase !== 'play';
  }

  onPlay(sp) {
    const r = this.rules;
    if (r.phase === 'pass') {
      this.toast('Tap 3 cards to pass first');
      return false;
    }
    if (r.phase !== 'play' || this.busy) return false;
    if (r.turn !== 0) {
      this.toast(`Wait, it's ${NAMES[r.turn]}'s turn`);
      return false;
    }
    if (!r.canPlay(0, sp.card)) {
      this.reject(sp);
      return false;
    }
    this.pendingRes = r.play(0, sp.card.id);
    sp.setSelected(false);
    return true;
  }

  afterPlay(sp) {
    this.setTrickPose(sp, 0);
    const res = this.pendingRes;
    this.pendingRes = null;
    if (res) this.handleResult(res, 0);
  }

  stockCount() {
    return 0;
  }

  /** Explains why a card can't be played. */
  reject(sp) {
    const r = this.rules;
    const legal = r.legal(0);
    let msg;
    if (!r.trick.length && r.trickNo === 0) msg = 'The 2♣ leads the first trick';
    else if (r.trick.length && legal[0]?.suit.id === r.trick[0].card.suit.id && legal.every((c) => c.suit.id === legal[0].suit.id)) {
      msg = `Follow suit: play a ${SUIT_WORD[r.trick[0].card.suit.id]}`;
    } else if (!r.trick.length && sp.card.suit.id === 'H') msg = "Hearts aren't broken yet";
    else if (r.trickNo === 0) msg = 'No points on the first trick';
    else msg = "You can't play that now";
    this.toast(msg);
    sp.x.vel += 420;
    this.table.haptic([6, 40, 6]);
  }

  // ---------------------------------------------------------------- passing

  doPass() {
    const r = this.rules;
    if (r.phase !== 'pass' || this.busy) return;
    const picked = this.table.hand.filter((s) => s.selected);
    if (picked.length !== 3) return;
    r.setPass(0, picked.map((s) => s.card.id));
    for (let s = 1; s < 4; s++) r.setPass(s, r.cpuPass(s));
    const moves = r.applyPass();
    this.input.cancel();
    for (const mv of moves) {
      for (const c of mv.cards) {
        const sp = this.byId.get(c.id);
        if (mv.from === 0) this.table.removeFromHand(sp);
        else this.seats[mv.from] = this.seats[mv.from].filter((x) => x !== sp);
        if (mv.to === 0) {
          this.table.takeSprite(sp, 450);
          sp.el.classList.add('hx-new');
          setTimeout(() => sp.el.classList.remove('hx-new'), 2600);
        } else {
          sp.waitUntil = 0;
          this.seats[mv.to].push(sp);
        }
      }
    }
    this.table.haptic(12);
    this.toast(`Passed to ${NAMES[r.passTarget(0)]}`);
    this.enqueue(700, () => this.sortHand());
    this.enqueue(400, () => {});
    this.afterChange();
    this.save();
  }

  // ---------------------------------------------------------------- playing

  cpuTurn() {
    const r = this.rules;
    const seat = r.turn;
    if (r.phase !== 'play' || seat === 0) return;
    const card = r.cpuPlay(seat);
    const res = r.play(seat, card.id);
    const sp = this.byId.get(card.id);
    this.seats[seat] = this.seats[seat].filter((x) => x !== sp);
    sp.waitUntil = 0;
    this.table.placeOnPile(sp);
    this.setTrickPose(sp, seat);
    this.handleResult(res, seat);
  }

  putInTrick(sp, seat) {
    this.table.placeOnPile(sp);
    this.setTrickPose(sp, seat);
  }

  setTrickPose(sp, seat) {
    const p = trickPos(seat, this.table.m.landscape);
    sp.pile = { x: p.x + (Math.random() - 0.5) * 0.08, y: p.y + (Math.random() - 0.5) * 0.06, rot: (Math.random() - 0.5) * 14 };
  }

  handleResult(res, seat) {
    if (isQS(res.card)) this.toast(`${seat === 0 ? 'You play' : `${NAMES[seat]} plays`} the queen of spades!`);
    else if (res.card.suit.id === 'H' && !this.heartsShown) {
      this.heartsShown = true;
      this.toast('Hearts are broken');
    }
    if (res.trick) {
      const { winner, points } = res.trick;
      this.enqueue(COLLECT_DELAY, () => {
        this.collect(winner);
        if (points) this.toast(`${winner === 0 ? 'You take' : `${NAMES[winner]} takes`} ${points} ${points === 1 ? 'point' : 'points'}`);
        if (winner === 0 && points) this.table.haptic([10, 50, 10]);
      });
      this.enqueue(450, () => {});
    }
    if (res.hand) this.enqueue(300, () => this.showBoard());
    this.afterChange();
    this.save();
  }

  /** The trick's cards fly to the winner and disappear. */
  collect(winner) {
    const t = this.table;
    const now = performance.now();
    const pos = this.seatPos[winner];
    for (const sp of t.played.splice(0)) {
      t.pendingLandings.delete(sp);
      sp.collectTo = pos;
      sp.removeAt = now + 650;
      this.collecting.push(sp);
    }
    this.afterChange();
  }

  // ------------------------------------------------------- event playback

  get busy() {
    return this.queue.length > 0;
  }

  enqueue(delay, fn) {
    const last = this.queue.length ? this.queue[this.queue.length - 1].at : performance.now();
    this.queue.push({ at: Math.max(last, performance.now()) + delay, fn });
  }

  /** With nothing playing back, start whatever comes next. */
  advance() {
    const r = this.rules;
    if (r.phase === 'play' && r.turn !== 0) this.enqueue(CPU_DELAY, () => this.cpuTurn());
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    if (!this.rules || !this.table.m) return;
    while (this.queue.length && now >= this.queue[0].at) {
      this.queue.shift().fn();
      if (!this.queue.length) this.afterChange();
    }
    if (!this.queue.length) this.advance();

    const r = this.rules;
    const myTurn = r.phase === 'play' && r.turn === 0 && !this.busy;
    const legal = myTurn ? new Set(r.legal(0)) : null;
    for (const sp of this.table.hand) {
      const dim = !!legal && !legal.has(sp.card);
      if (sp.dim !== dim) {
        sp.dim = dim;
        sp.el.classList.toggle('c8-dim', dim);
      }
    }

    this.table.update(now, dt);
    this.stepSeats(now, dt);
    this.stepCollecting(now, dt);
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
  }

  stepSeats(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    const { cx, midY, northY, westX, eastX, cpuW, sideSpan } = this.lay;
    for (let seat = 1; seat < 4; seat++) {
      const list = this.seats[seat];
      const n = list.length;
      const mid = (n - 1) / 2;
      const reveal = this.rules.phase === 'gameOver';
      let spacing;
      if (seat === 2) spacing = n > 1 ? Math.min(cpuW * 0.35, (Math.min(m.W * 0.5, m.W - 60) - cpuW) / (n - 1)) : 0;
      else spacing = n > 1 ? Math.min(cpuW * 0.3, (sideSpan - cpuW) / (n - 1)) : 0;
      list.forEach((sp, i) => {
        if (now < sp.waitUntil) {
          sp.target(m.deck.x, m.deck.y, 0, 1, 1, 0);
          sp.z = 60;
        } else {
          const d = i - mid;
          if (seat === 2) sp.target(cx + d * spacing, northY - Math.min(d * d * 0.5, 5), -d * 2, CPU_SCALE, reveal ? 0 : 1, 0);
          else if (seat === 1) sp.target(westX + Math.min(d * d * 0.5, 5), midY + d * spacing, 90 + d * 2, CPU_SCALE, reveal ? 0 : 1, 0);
          else sp.target(eastX - Math.min(d * d * 0.5, 5), midY + d * spacing, -90 - d * 2, CPU_SCALE, reveal ? 0 : 1, 0);
          sp.z = 70 + i;
        }
        sp.step(dt, s.stiffness, s.damping);
        sp.render();
      });
    }
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

  afterChange() {
    const r = this.rules;
    if (!r) return;
    const pts = r.handPoints();
    this.labels.forEach((el, i) => {
      const hand = r.phase === 'play' || r.phase === 'pass' ? pts[i] : 0;
      el.lastChild.textContent = `${r.scores[i]}${hand ? ` +${hand}` : ''}`;
      el.classList.toggle('active', r.phase === 'play' && r.turn === i);
    });

    let status = '';
    const passing = r.phase === 'pass';
    if (passing) status = `Pass 3 ${r.passDir} ${DIR_ARROW[r.passDir]}`;
    else if (r.phase === 'play') status = r.turn === 0 ? (this.busy ? '' : 'Your turn') : `${NAMES[r.turn]}’s turn…`;
    this.statusEl.textContent = status;
    this.statusEl.classList.toggle('mine', status === 'Your turn' || passing);

    const picked = this.table.hand.filter((s) => s.selected).length;
    this.passBtn.classList.toggle('show', passing);
    if (passing) {
      this.passBtn.disabled = picked !== 3 || this.busy;
      this.passBtn.textContent = picked === 3 ? `Pass to ${NAMES[r.passTarget(0)]}` : `Pick 3 to pass · ${picked}/3`;
    }
  }

  toast(msg) {
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1900);
  }

  /** Scoreboard after a hand, or the final result. */
  showBoard() {
    const r = this.rules;
    const last = r.lastHand;
    const over = r.phase === 'gameOver';
    const c = this.boardCard;
    c.innerHTML = '';
    let title = `Hand ${r.handNo}`;
    if (over) title = r.winners.includes(0) ? (r.winners.length > 1 ? 'You tied for the win!' : 'You won!') : `${r.winners.map((w) => NAMES[w]).join(' & ')} ${r.winners.length > 1 ? 'win' : 'wins'}`;
    c.append(h('div', 'game-win-title', title));
    if (last?.moon != null) c.append(h('div', 'game-win-stats', `${last.moon === 0 ? 'You' : NAMES[last.moon]} shot the moon!`));
    const table = h('table', 'hx-scores');
    table.innerHTML = '<tr><th></th><th>Hand</th><th>Total</th></tr>';
    const low = Math.min(...r.scores);
    NAMES.forEach((name, i) => {
      const tr = h('tr', `${i === 0 ? 'me' : ''}${r.scores[i] === low ? ' low' : ''}`);
      tr.append(h('td', '', name), h('td', '', last ? `+${last.points[i]}` : ''), h('td', '', String(r.scores[i])));
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
      btn('Play again', () => this.newGame(), 'accent');
      btn('Lobby', () => this.onExit(), '');
    } else {
      c.append(h('div', 'game-win-stats', `First to ${r.target} loses · lowest score wins`));
      btn('Next hand', () => this.nextHand(), 'accent');
    }
    c.append(row);
    this.boardEl.classList.add('show');
    this.afterChange();
  }

  nextHand() {
    if (!this.rules.nextHand()) return;
    this.heartsShown = false;
    this.dealVisuals();
    this.save();
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

  /** Pushes back everything time-based by `ms` (the lobby's zoom-in), so the game starts when it lands. */
  postpone(ms) {
    const now = performance.now();
    const t = this.table;
    for (const sp of [...t.hand, ...t.played, ...this.seats.slice(1).flat()]) if (sp.waitUntil > now) sp.waitUntil += ms;
    // Hold the event queue too; an empty queue gets a pause so a CPU turn can't start early.
    if (this.queue.length) for (const q of this.queue) q.at = Math.max(q.at, now) + ms;
    else this.queue.push({ at: now + ms, fn: () => {} });
  }

  cancel() {
    this.input.cancel();
  }

  // ----------------------------------------------------------- persistence

  save() {
    if (!this.rules) return;
    try {
      if (this.rules.phase === 'gameOver') localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(this.rules.serialize()));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      return Hearts.restore(JSON.parse(localStorage.getItem(SAVE_KEY)));
    } catch {
      return null;
    }
  }
}

