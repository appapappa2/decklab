// Hearts for four players: you (south) and three CPUs. Pure state, no DOM,
// so it can be tested in Node.
//
// Seats in play order (clockwise): you, west, north, east. 13 cards each.
// Before each hand everyone passes 3 cards: left, right, across, then a hold
// hand, repeating. The 2 of clubs leads the first trick. Follow suit if you
// can; the highest card of the led suit takes the trick (aces high). No
// hearts or queen of spades on the first trick unless you have nothing else,
// and hearts can't be led until one has been played (unless that's all you
// have). Each heart is 1 point and the queen of spades 13. Taking all 26
// ("shooting the moon") gives everyone else 26 instead. When someone reaches
// the target (100), the lowest score wins.
import { createDeck, shuffle } from '../cards.js';

export const SEATS = ['you', 'west', 'north', 'east'];
export const PASS_DIRS = ['left', 'right', 'across', 'hold'];
const PASS_OFFSET = { left: 1, right: 3, across: 2 };
export const power = (c) => (c.value === 1 ? 14 : c.value);
export const isQS = (c) => c.suit.id === 'S' && c.value === 12;
export const cardPoints = (c) => (c.suit.id === 'H' ? 1 : isQS(c) ? 13 : 0);
const has2C = (hand) => hand.some((c) => c.suit.id === 'C' && c.value === 2);

export class Hearts {
  constructor({ target = 100 } = {}) {
    this.target = target;
    this.scores = [0, 0, 0, 0];
    this.handNo = 0;
    this.winners = null; // seat indexes with the lowest score at game end
    this.history = []; // per hand: points per seat
    this.startHand();
  }

  /** Deals a new hand. `deck` is optional, for tests. */
  startHand(deck = shuffle(createDeck())) {
    this.hands = [[], [], [], []];
    deck.forEach((c, i) => this.hands[i % 4].push(c));
    this.passDir = PASS_DIRS[this.handNo % 4];
    this.passes = [null, null, null, null];
    this.taken = [[], [], [], []]; // cards won in tricks
    this.trick = []; // [{ seat, card }]
    this.heartsBroken = false;
    this.trickNo = 0;
    this.lastHand = null;
    if (this.passDir === 'hold') this.beginPlay();
    else this.phase = 'pass';
  }

  beginPlay() {
    this.phase = 'play';
    this.leader = this.hands.findIndex(has2C);
    this.turn = this.leader;
  }

  passTarget(seat) {
    return (seat + PASS_OFFSET[this.passDir]) % 4;
  }

  /** Points each seat has taken so far this hand. */
  handPoints() {
    return this.taken.map((cards) => cards.reduce((n, c) => n + cardPoints(c), 0));
  }

  // ---------------------------------------------------------------- passing

  /** Sets a seat's 3 cards to pass. When all four are set, the pass happens. */
  setPass(seat, ids) {
    if (this.phase !== 'pass' || ids.length !== 3 || new Set(ids).size !== 3) return false;
    const hand = this.hands[seat];
    if (!ids.every((id) => hand.some((c) => c.id === id))) return false;
    this.passes[seat] = ids;
    return true;
  }

  get passReady() {
    return this.phase === 'pass' && this.passes.every(Boolean);
  }

  /** Swaps the passed cards. Returns [{ from, to, cards }]. */
  applyPass() {
    if (!this.passReady) return null;
    const moves = this.passes.map((ids, from) => ({
      from,
      to: this.passTarget(from),
      cards: ids.map((id) => this.hands[from].find((c) => c.id === id)),
    }));
    for (const m of moves) this.hands[m.from] = this.hands[m.from].filter((c) => !m.cards.includes(c));
    for (const m of moves) this.hands[m.to].push(...m.cards);
    this.passes = [null, null, null, null];
    this.beginPlay();
    return moves;
  }

  // ---------------------------------------------------------------- playing

  /** Cards `seat` may play right now. */
  legal(seat) {
    if (this.phase !== 'play' || this.turn !== seat) return [];
    const hand = this.hands[seat];
    const first = this.trickNo === 0;
    if (!this.trick.length) {
      if (first) return hand.filter((c) => c.suit.id === 'C' && c.value === 2);
      if (!this.heartsBroken) {
        const other = hand.filter((c) => c.suit.id !== 'H');
        if (other.length) return other;
      }
      return hand;
    }
    const lead = this.trick[0].card.suit.id;
    const follow = hand.filter((c) => c.suit.id === lead);
    if (follow.length) return follow;
    if (first) {
      const clean = hand.filter((c) => !cardPoints(c));
      if (clean.length) return clean;
    }
    return hand;
  }

  canPlay(seat, card) {
    return this.legal(seat).includes(card);
  }

  /**
   * Plays a card. Returns { card, trick?, hand?, game? } where
   *   trick: { winner, cards: [{ seat, card }], points }   when the trick completes
   *   hand:  { points: [4], moon: seat|null, scores: [4] } when the hand ends
   *   game:  { winners: [seat] }                           when the game ends
   * or null if the play isn't legal.
   */
  play(seat, cardId) {
    const card = this.hands[seat].find((c) => c.id === cardId);
    if (!card || !this.canPlay(seat, card)) return null;
    this.hands[seat] = this.hands[seat].filter((c) => c !== card);
    this.trick.push({ seat, card });
    if (card.suit.id === 'H') this.heartsBroken = true;
    const out = { card };
    if (this.trick.length < 4) {
      this.turn = (seat + 1) % 4;
      return out;
    }
    // Trick complete.
    const lead = this.trick[0].card.suit.id;
    let best = this.trick[0];
    for (const t of this.trick) if (t.card.suit.id === lead && power(t.card) > power(best.card)) best = t;
    const cards = this.trick;
    this.taken[best.seat].push(...cards.map((t) => t.card));
    out.trick = { winner: best.seat, cards, points: cards.reduce((n, t) => n + cardPoints(t.card), 0) };
    this.trick = [];
    this.trickNo++;
    this.leader = this.turn = best.seat;
    if (this.trickNo === 13) {
      out.hand = this.endHand();
      if (this.winners) out.game = { winners: this.winners };
    }
    return out;
  }

  endHand() {
    const pts = this.handPoints();
    const moon = pts.indexOf(26);
    const add = moon >= 0 ? pts.map((_, i) => (i === moon ? 0 : 26)) : pts;
    this.scores = this.scores.map((s, i) => s + add[i]);
    this.history.push(add);
    this.handNo++;
    this.phase = 'handOver';
    this.lastHand = { points: add, moon: moon >= 0 ? moon : null, scores: [...this.scores] };
    if (Math.max(...this.scores) >= this.target) {
      const low = Math.min(...this.scores);
      this.winners = this.scores.map((s, i) => (s === low ? i : -1)).filter((i) => i >= 0);
      this.phase = 'gameOver';
    }
    return this.lastHand;
  }

  nextHand() {
    if (this.phase !== 'handOver') return false;
    this.startHand();
    return true;
  }

  // -------------------------------------------------------------------- CPU

  /** 3 cards a CPU passes: dangerous spades, high hearts, and cards that void a short suit. */
  cpuPass(seat) {
    const hand = this.hands[seat];
    const count = (s) => hand.filter((c) => c.suit.id === s).length;
    const spades = count('S');
    const danger = (c) => {
      const s = c.suit.id;
      const v = power(c);
      if (isQS(c)) return spades >= 5 ? 20 : 100; // with many spades the queen is safer to keep
      if (s === 'S' && v > 12) return spades >= 5 ? 10 : 80;
      if (s === 'H') return 20 + v * 3;
      if (s === 'C' && v === 2) return -10;
      return v * 2 + (count(s) <= 2 ? 15 : 0);
    };
    return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3).map((c) => c.id);
  }

  /** The card a CPU plays: duck under the winning card when it can, dump points when void. */
  cpuPlay(seat) {
    const opts = this.legal(seat);
    if (!opts.length) return null;
    const low = (cs) => cs.reduce((a, b) => (power(b) < power(a) ? b : a));
    const high = (cs) => cs.reduce((a, b) => (power(b) > power(a) ? b : a));
    if (!this.trick.length) {
      // Lead low, avoid hearts, and avoid leading spades while holding the queen.
      const hand = this.hands[seat];
      const holdsQS = hand.some(isQS);
      let pool = opts.filter((c) => c.suit.id !== 'H' && !(holdsQS && c.suit.id === 'S'));
      if (!pool.length) pool = opts.filter((c) => !isQS(c));
      if (!pool.length) pool = opts;
      return low(pool);
    }
    const lead = this.trick[0].card.suit.id;
    const following = opts[0].suit.id === lead && opts.every((c) => c.suit.id === lead);
    if (following) {
      const top = Math.max(...this.trick.filter((t) => t.card.suit.id === lead).map((t) => power(t.card)));
      const under = opts.filter((c) => power(c) < top);
      if (under.length) return high(under); // stay under, shed the highest safe card
      const pts = this.trick.reduce((n, t) => n + cardPoints(t.card), 0);
      const last = this.trick.length === 3;
      const safe = opts.filter((c) => !isQS(c));
      if (last && !pts) return high(safe.length ? safe : opts); // winning a clean trick: use a high card
      return low(opts);
    }
    // Void in the led suit: dump the queen, then high hearts, then the highest card.
    const qs = opts.find(isQS);
    if (qs) return qs;
    const hearts = opts.filter((c) => c.suit.id === 'H');
    if (hearts.length) return high(hearts);
    return high(opts);
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return {
      v: 1,
      target: this.target,
      scores: this.scores,
      handNo: this.handNo,
      history: this.history,
      hands: this.hands.map(ids),
      taken: this.taken.map(ids),
      trick: this.trick.map((t) => [t.seat, t.card.id]),
      passDir: this.passDir,
      phase: this.phase,
      turn: this.turn,
      leader: this.leader,
      heartsBroken: this.heartsBroken,
      trickNo: this.trickNo,
      lastHand: this.lastHand,
      winners: this.winners,
    };
  }

  static restore(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.hands) || d.hands.length !== 4) return null;
    const byId = new Map(createDeck().map((c) => [c.id, c]));
    const seen = new Set();
    const card = (id) => {
      const c = byId.get(id);
      if (!c || seen.has(id)) throw new Error('bad save');
      seen.add(id);
      return c;
    };
    const g = new Hearts({ target: Number(d.target) || 100 });
    g.scores = d.scores.map(Number);
    g.handNo = Number(d.handNo) || 0;
    g.history = Array.isArray(d.history) ? d.history : [];
    g.hands = d.hands.map((a) => a.map(card));
    g.taken = d.taken.map((a) => a.map(card));
    g.trick = d.trick.map(([seat, id]) => ({ seat, card: card(id) }));
    const inPlay = d.phase === 'pass' || d.phase === 'play';
    if (inPlay && seen.size !== 52) return null;
    g.passDir = PASS_DIRS.includes(d.passDir) ? d.passDir : 'hold';
    g.passes = [null, null, null, null];
    g.phase = ['pass', 'play', 'handOver', 'gameOver'].includes(d.phase) ? d.phase : 'play';
    g.turn = Number(d.turn) || 0;
    g.leader = Number(d.leader) || 0;
    g.heartsBroken = !!d.heartsBroken;
    g.trickNo = Number(d.trickNo) || 0;
    g.lastHand = d.lastHand ?? null;
    g.winners = Array.isArray(d.winners) ? d.winners : null;
    return g;
  }
}
