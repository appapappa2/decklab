// Go Fish vs. a CPU. Your hand is the lab's hand (RuleTable + Input): "playing"
// a card (drag it up toward the CPU, flick it, or tap it and press Ask) asks
// for that rank, and the card stays in your hand. Rules run instantly; the
// resulting events are played back on a short timeline so you can follow them.
import { Input } from '../input.js';
import { cardBackHTML } from '../cards.js?v=landing-burst';
import { createDeck } from '../cards.js';
import { SparkleTrail } from '../sparkles.js?v=landing-burst';
import { LandingRipples } from '../ripples.js?v=water-ripple';
import { RuleTable } from '../table.js?v=hearts';
import { GoFish, other } from './rules.js';

const SAVE_KEY = 'thedeck.gofish.v1';
const CPU_SCALE = 0.6;
const BOOK_SCALE = 0.42;
const DEAL_STAGGER = 70;
const PLURAL = {
  A: 'aces', 2: 'twos', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes', 7: 'sevens',
  8: 'eights', 9: 'nines', 10: 'tens', J: 'jacks', Q: 'queens', K: 'kings',
};
const SINGULAR = {
  A: 'an ace', 2: 'a two', 3: 'a three', 4: 'a four', 5: 'a five', 6: 'a six', 7: 'a seven',
  8: 'an eight', 9: 'a nine', 10: 'a ten', J: 'a jack', Q: 'a queen', K: 'a king',
};

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

export class GoFishScene {
  constructor(root, { device, settings, haptic, onExit }) {
    this.root = root;
    this.visible = false;
    this.started = false;
    this.cpu = []; // CPU hand sprites
    this.books = { you: [], cpu: [] }; // [{ rank, sprites }]
    this.byId = new Map(); // card id -> sprite
    this.queue = []; // [{ at, fn }] event playback
    this.overShown = false;
    this.sayTimers = {};

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
      { buttonLabel: 'Ask' },
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
    this.statusEl = h('div', 'game-stats gf-status');
    const newBtn = h('button', 'game-btn small', 'New game');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.newGame());
    top.append(back, h('div', 'game-title', 'Go Fish'), this.statusEl, newBtn);

    this.cpuLabel = h('div', 'gf-label gf-label-cpu');
    this.youLabel = h('div', 'gf-label gf-label-you');
    this.say = { cpu: h('div', 'gf-say gf-say-cpu'), you: h('div', 'gf-say gf-say-you') };
    this.hintEl = h('div', 'gf-hint', 'Drag a card up to ask for its rank');

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
      this.cpuLabel, this.youLabel, this.hintEl, this.say.cpu, this.say.you, top, this.overEl,
    );
  }

  // ----------------------------------------------------------------- layout

  setSize(W, H, safe) {
    this.table.setSize(W, H, safe);
    this.sparkles.resize(W, H);
    this.ripples.resize(W, H);
  }

  /** CPU hand and books on top, deck in the middle, your books above your hand. */
  adjustLayout() {
    const m = this.table.m;
    const { W, safe } = m;
    const barH = 46;
    const cpuH = m.ch * CPU_SCALE;
    const bookH = m.ch * BOOK_SCALE;
    const cpuY = safe.top + barH + cpuH / 2 + 6;
    const cx = W / 2;
    const left = safe.left + 14;
    const right = W - safe.right - 14;
    let cpuBooksY;
    let youBooksY;
    let midY;
    if (m.landscape) {
      // Short screen: books sit beside the CPU's hand and beside the deck.
      cpuBooksY = cpuY;
      midY = (cpuY + cpuH / 2 + m.handTop) / 2;
      youBooksY = midY;
    } else {
      cpuBooksY = cpuY + cpuH / 2 + bookH / 2 + 10;
      youBooksY = m.handTop - bookH / 2 - 16;
      midY = (cpuBooksY + youBooksY) / 2;
    }
    m.deck = { x: cx, y: midY };
    // "Playing" a card means holding it up to the CPU, so its hand is the drop zone.
    m.pz = { x: cx, y: cpuY, w: W * 0.9, h: cpuH + bookH + 30 };
    this.table.els.deck.style.left = `${m.deck.x - m.cw / 2}px`;
    this.table.els.deck.style.top = `${m.deck.y - m.ch / 2}px`;
    const bookW = m.cw * BOOK_SCALE;
    this.lay = {
      cx, cpuY, midY, bookW,
      rows: m.landscape
        ? { cpu: { x0: left, x1: cx - m.cw * 1.7, y: cpuBooksY }, you: { x0: left, x1: cx - m.cw * 0.9, y: youBooksY } }
        : { cpu: { x0: left, x1: right, y: cpuBooksY }, you: { x0: left, x1: right, y: youBooksY } },
    };

    const pos = (el, x, y, anchor) => (el.style.transform = `translate(${x}px, ${y}px) ${anchor}`);
    pos(this.cpuLabel, right, cpuY, 'translate(-100%, -50%)');
    if (m.landscape) {
      pos(this.youLabel, left, youBooksY - bookH / 2 - 20, '');
      pos(this.say.cpu, cx + m.cw * 1.9, cpuY, 'translateY(-50%)');
      pos(this.say.you, cx + m.cw * 0.8, midY - 18, 'translateY(-50%)');
      pos(this.hintEl, cx + m.cw * 0.8, midY + 18, 'translateY(-50%)');
    } else {
      pos(this.youLabel, right, youBooksY - bookH / 2 - 22, 'translateX(-100%)');
      pos(this.say.cpu, cx, cpuBooksY + bookH / 2 + 22, 'translate(-50%, -50%)');
      pos(this.say.you, cx, youBooksY - bookH / 2 - 22, 'translate(-50%, -50%)');
      pos(this.hintEl, cx, midY + m.ch / 2 + 22, 'translate(-50%, -50%)');
    }
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
    const hadCards = this.byId.size > 0;
    t.clearTable();
    t.discard([...this.cpu, ...this.books.you.flatMap((b) => b.sprites), ...this.books.cpu.flatMap((b) => b.sprites)]);
    t.pendingLandings.clear();
    this.cpu = [];
    this.books = { you: [], cpu: [] };
    this.byId.clear();
    this.queue = [];
    this.overShown = false;
    this.overEl.classList.remove('show');

    const first = this.rules ? (this.lastFirst === 'you' ? 'cpu' : 'you') : 'you';
    this.lastFirst = first;
    const rules = (this.rules = new GoFish(undefined, first));
    // Deal what each player held before any opening books/refills (replayed below).
    const dealt = { you: [...rules.hands.you], cpu: [...rules.hands.cpu] };
    for (const e of rules.dealEvents) {
      if (e.type === 'book') dealt[e.p].push(...e.cards);
      if (e.type === 'refill') dealt[e.p] = dealt[e.p].filter((c) => c !== e.card);
    }
    const base = hadCards ? 380 : 150;
    const yours = [...dealt.you].sort((a, b) => a.value - b.value);
    yours.forEach((c, i) => this.register(t.addCard(c, base + i * 2 * DEAL_STAGGER)));
    dealt.cpu.forEach((c, i) => this.addCpuCard(c, base + (i * 2 + 1) * DEAL_STAGGER));
    const dealMs = base + 14 * DEAL_STAGGER + 300;
    this.enqueue(dealMs, () => {});
    this.playEvents([...rules.dealEvents, { type: 'turn', p: rules.turn, again: false }]);
    this.afterChange();
  }

  restoreVisuals(rules) {
    this.rules = rules;
    this.lastFirst = rules.turn;
    const t = this.table;
    [...rules.hands.you].sort((a, b) => a.value - b.value).forEach((c, i) => this.register(t.addCard(c, 150 + i * DEAL_STAGGER)));
    rules.hands.cpu.forEach((c, i) => this.addCpuCard(c, 150 + i * DEAL_STAGGER));
    for (const p of ['you', 'cpu']) {
      for (const rank of rules.books[p]) {
        const sprites = createDeck()
          .filter((c) => c.rank === rank)
          .map((c) => this.register(t.spriteAtDeck(c)));
        this.books[p].push({ rank, sprites });
      }
    }
    this.enqueue(800, () => {});
    this.playEvents([{ type: 'turn', p: rules.turn, again: false }]);
    this.afterChange();
  }

  register(sp) {
    this.byId.set(sp.card.id, sp);
    return sp;
  }

  addCpuCard(card, delay = 0) {
    const sp = this.register(this.table.spriteAtDeck(card));
    sp.waitUntil = delay ? performance.now() + delay : 0;
    this.cpu.push(sp);
    return sp;
  }

  // ------------------------------------------------------------ RuleTable hooks

  /** Playing a card = asking for its rank. The card always stays in the hand. */
  onPlay(sp) {
    sp.setSelected(false);
    const r = this.rules;
    if (r.winner) return false;
    if (this.busy || r.turn !== 'you') {
      this.speak('you', r.turn === 'cpu' ? "Wait, it's the CPU's turn" : 'Hold on…', 1300);
      return false;
    }
    const events = r.ask('you', sp.card.rank);
    if (events) this.playEvents(events);
    return false;
  }

  onDeckTap() {
    const r = this.rules;
    if (!r.winner && r.turn === 'you' && !this.busy) this.speak('you', 'Ask the CPU for a rank first', 1400);
  }

  stockCount() {
    return this.rules?.stock.length ?? 0;
  }

  // ------------------------------------------------------- event playback

  get busy() {
    return this.queue.length > 0;
  }

  enqueue(delay, fn) {
    const last = this.queue.length ? this.queue[this.queue.length - 1].at : performance.now();
    this.queue.push({ at: Math.max(last, performance.now()) + delay, fn });
  }

  playEvents(events) {
    this.statusEl.textContent = '';
    for (const e of events) {
      switch (e.type) {
        case 'ask':
          this.enqueue(0, () => this.speak(e.p, `Got any ${PLURAL[e.rank]}?`));
          this.enqueue(750, () => {});
          break;
        case 'give':
          this.enqueue(0, () => {
            const n = e.cards.length;
            this.speak(e.from, n === 1 ? `Here's ${SINGULAR[e.cards[0].rank]}` : `Here are ${n} ${PLURAL[e.cards[0].rank]}`);
            for (const c of e.cards) this.moveCard(c, e.from, e.to);
            this.table.haptic(12);
          });
          this.enqueue(750, () => {});
          break;
        case 'fish':
          this.enqueue(0, () => this.speak(other(e.p), 'Go fish!'));
          this.enqueue(550, () => {
            if (!e.card) {
              this.speak(e.p, 'The pond is empty');
              return;
            }
            this.fishCard(e.card, e.p);
            if (e.match) this.speak(e.p, e.p === 'you' ? `You fished ${SINGULAR[e.card.rank]}!` : `Fished ${SINGULAR[e.card.rank]}!`);
          });
          this.enqueue(e.match ? 900 : 600, () => {});
          break;
        case 'book':
          this.enqueue(250, () => {
            this.layBook(e.p, e.rank, e.cards);
            this.speak(e.p, `Book of ${PLURAL[e.rank]}!`);
            this.table.haptic([10, 50, 10]);
          });
          this.enqueue(800, () => {});
          break;
        case 'refill':
          this.enqueue(0, () => {
            this.fishCard(e.card, e.p);
            this.speak(e.p, 'Out of cards: draws one');
          });
          this.enqueue(650, () => {});
          break;
        case 'skip':
          this.enqueue(0, () => this.speak(e.p, 'No cards left: skips'));
          this.enqueue(800, () => {});
          break;
        case 'turn':
          if (e.p === 'cpu') {
            this.enqueue(e.again ? 350 : 600, () => {
              if (e.again) this.speak('cpu', 'CPU goes again');
            });
            this.enqueue(e.again ? 650 : 250, () => this.cpuTurn());
          } else if (e.again) {
            this.enqueue(0, () => this.speak('you', 'Go again!', 1100));
          }
          break;
        case 'over':
          this.enqueue(400, () => this.showOver());
          break;
        default:
      }
    }
    this.enqueue(0, () => this.afterChange());
    this.save();
  }

  cpuTurn() {
    const r = this.rules;
    if (r.winner || r.turn !== 'cpu') return;
    const events = r.ask('cpu', r.cpuChoice());
    if (events) this.playEvents(events);
  }

  // --------------------------------------------------------- card movement

  /** Hands a card from one player to the other. */
  moveCard(card, from, to) {
    const sp = this.byId.get(card.id);
    if (!sp) return;
    if (from === 'you') {
      if (this.table.drag?.sprite === sp) this.input.cancel();
      this.table.removeFromHand(sp);
    } else this.cpu = this.cpu.filter((s) => s !== sp);
    if (to === 'you') this.takeIntoHand(sp);
    else {
      sp.waitUntil = 0;
      this.cpu.push(sp);
    }
  }

  fishCard(card, p) {
    if (p === 'you') {
      const sp = this.register(this.table.addCard(card));
      this.groupByRank(sp);
    } else this.addCpuCard(card);
  }

  /** Into your hand, next to cards of the same rank. */
  takeIntoHand(sp) {
    this.table.takeSprite(sp);
    this.groupByRank(sp);
  }

  groupByRank(sp) {
    const hand = this.table.hand;
    const i = hand.indexOf(sp);
    let j = -1;
    for (let k = 0; k < hand.length; k++) if (k !== i && hand[k].card.rank === sp.card.rank) j = k;
    if (j < 0) return;
    hand.splice(i, 1);
    hand.splice(j < i ? j + 1 : j, 0, sp);
  }

  layBook(p, rank, cards) {
    const sprites = cards.map((c) => this.byId.get(c.id)).filter(Boolean);
    for (const sp of sprites) {
      if (p === 'you') {
        if (this.table.drag?.sprite === sp) this.input.cancel();
        this.table.removeFromHand(sp);
      } else this.cpu = this.cpu.filter((s) => s !== sp);
      sp.waitUntil = 0;
    }
    this.books[p].push({ rank, sprites });
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    if (!this.rules || !this.table.m) return;
    while (this.queue.length && now >= this.queue[0].at) this.queue.shift().fn();
    this.table.update(now, dt);
    this.stepCpuHand(now, dt);
    this.stepBooks(dt);
    this.updateLabels();
    this.ripples.update(dt, this.table);
    this.sparkles.update(dt, this.table);
    const showHint = !this.busy && this.rules.turn === 'you' && !this.rules.winner && !this.table.drag;
    if (showHint !== this._hint) {
      this._hint = showHint;
      this.hintEl.classList.toggle('show', showHint);
    }
  }

  stepCpuHand(now, dt) {
    const m = this.table.m;
    const s = this.table.s;
    const n = this.cpu.length;
    const { cpuY, cx } = this.lay;
    const w = m.cw * CPU_SCALE;
    // Capped width leaves room for the CPU's label on the right.
    const avail = Math.min(m.W * 0.5, m.W - m.safe.left - m.safe.right - 40) - w;
    const spacing = n > 1 ? Math.min(w * 0.5, avail / (n - 1)) : 0;
    const mid = (n - 1) / 2;
    const reveal = !!this.rules.winner;
    this.cpu.forEach((sp, i) => {
      if (now < sp.waitUntil) {
        sp.target(m.deck.x, m.deck.y, 0, 1, 1, 0);
        sp.z = 60;
      } else {
        const d = i - mid;
        sp.target(cx + d * spacing, cpuY - Math.min(d * d * 0.6, 6), -d * 2.2, CPU_SCALE, reveal ? 0 : 1, 0);
        sp.z = 70 + i;
      }
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
    });
  }

  stepBooks(dt) {
    const m = this.table.m;
    const s = this.table.s;
    const { bookW, rows } = this.lay;
    for (const p of ['you', 'cpu']) {
      const list = this.books[p];
      const n = list.length;
      const { x0, x1, y } = rows[p];
      const avail = Math.max(0, x1 - x0 - bookW);
      const spacing = n > 1 ? Math.min(bookW * 1.2, avail / (n - 1)) : 0;
      const center = (x0 + x1) / 2;
      list.forEach((book, i) => {
        const x = center + (i - (n - 1) / 2) * spacing;
        book.sprites.forEach((sp, j) => {
          sp.target(x + j * 1.5, y - j * 1.5, (j - 1.5) * 2, BOOK_SCALE, 0, 0);
          sp.z = 30 + i * 4 + j;
          sp.step(dt, s.stiffness, s.damping);
          sp.render();
        });
      });
    }
  }

  // -------------------------------------------------------------------- HUD

  speak(p, text, ms = 1600) {
    const el = this.say[p];
    clearTimeout(this.sayTimers[p]);
    el.textContent = text;
    el.classList.add('show');
    this.sayTimers[p] = setTimeout(() => el.classList.remove('show'), ms);
  }

  afterChange() {
    const r = this.rules;
    this.table.updateDeck();
    this.updateLabels();
    let status = '';
    if (!r.winner) status = r.turn === 'you' && !this.busy ? 'Your turn' : r.turn === 'cpu' ? 'CPU’s turn…' : '';
    this.statusEl.textContent = status;
    this.statusEl.classList.toggle('mine', status === 'Your turn');
  }

  /** Counts follow what's on screen, so they change as cards move. */
  updateLabels() {
    const n = this.cpu.length;
    const books = (k) => `${k} ${k === 1 ? 'book' : 'books'}`;
    const cpu = `CPU\n${n} ${n === 1 ? 'card' : 'cards'}\n${books(this.books.cpu.length)}`;
    const you = `You · ${books(this.books.you.length)}`;
    if (cpu !== this.cpuLabel.textContent) this.cpuLabel.textContent = cpu;
    if (you !== this.youLabel.textContent) this.youLabel.textContent = you;
  }

  showOver() {
    if (this.overShown) return;
    this.overShown = true;
    const r = this.rules;
    const a = r.books.you.length;
    const b = r.books.cpu.length;
    this.overTitle.textContent = r.winner === 'you' ? 'You won!' : 'CPU wins';
    this.overStats.textContent = `${a} ${a === 1 ? 'book' : 'books'} to ${b}`;
    this.afterChange();
    setTimeout(() => this.overEl.classList.add('show'), 700);
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
      return GoFish.restore(JSON.parse(localStorage.getItem(SAVE_KEY)));
    } catch {
      return null;
    }
  }
}
