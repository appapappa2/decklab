// President (also called Scum) for 3–6 players. Pure state, no DOM, so it can
// be tested in Node.
//
// The whole deck is dealt. Ranks run 3 (low) … K, A, 2 (high). The leader
// plays one to four cards of one rank; the others, in turn, play the same
// number of cards of a higher rank or pass (a player who passed may play
// again later in the same round of play). When everyone else has passed since
// the last play, that player clears the pile and leads (if they went out, the
// next player with cards leads). Players finish in order and get titles:
// President, Vice President, Citizens, Vice Scum, Scum. Points: President 2,
// Vice President 1; first to TARGET wins.
// From the second hand on, the Scum gives their best cards to the President
// (2, or 1 with three players) and the President gives back cards of their
// choice; the Vice Scum and Vice President swap one card the same way. The
// Scum leads. In the first hand the holder of the 3♣ leads.
import { createDeck, shuffle } from '../cards.js';

export const TARGET = 10;
export const power = (c) => (c.value === 1 ? 14 : c.value === 2 ? 15 : c.value);

/** Title for finishing position `i` (0-based) out of `n`. */
export function title(i, n) {
  if (i === 0) return 'President';
  if (i === n - 1) return 'Scum';
  if (n >= 4 && i === 1) return 'Vice President';
  if (n >= 4 && i === n - 2) return 'Vice Scum';
  return 'Citizen';
}

const best = (hand, k) => [...hand].sort((a, b) => power(b) - power(a) || b.suit.order - a.suit.order).slice(0, k);

export class President {
  constructor({ players = 4, target = TARGET } = {}) {
    this.n = Math.max(3, Math.min(6, players));
    this.target = target;
    this.scores = Array(this.n).fill(0);
    this.order = null; // finishing order of the last hand
    this.handNo = 0;
    this.winner = null;
    this.startHand();
  }

  startHand(deck = shuffle(createDeck())) {
    this.hands = Array.from({ length: this.n }, () => []);
    const first = this.order ? this.order[this.n - 1] : 0;
    deck.forEach((c, i) => this.hands[(first + i) % this.n].push(c));
    this.pile = []; // plays this round: [{ p, cards }]
    this.passed = new Set();
    this.lastPlayer = null;
    this.finished = [];
    this.exchanges = [];
    this.lastHand = null;
    if (this.order) {
      // Low titles hand their best cards up; high titles owe cards back.
      const big = this.n === 3 ? 1 : 2;
      const pairs = [[this.order[0], this.order[this.n - 1], big]];
      if (this.n >= 4) pairs.push([this.order[1], this.order[this.n - 2], 1]);
      this.owed = new Map();
      for (const [hi, lo, k] of pairs) {
        const cards = best(this.hands[lo], k);
        this.hands[lo] = this.hands[lo].filter((c) => !cards.includes(c));
        this.hands[hi].push(...cards);
        this.exchanges.push({ from: lo, to: hi, cards });
        this.owed.set(hi, { to: lo, k });
      }
      this.phase = 'exchange';
      this.turn = this.order[0];
    } else {
      this.owed = new Map();
      this.phase = 'play';
      this.turn = this.hands.findIndex((h) => h.some((c) => c.id === '3C'));
    }
  }

  // --------------------------------------------------------------- exchange

  /** A high title gives cards back. */
  giveBack(p, ids) {
    const o = this.owed.get(p);
    if (this.phase !== 'exchange' || !o || ids.length !== o.k || new Set(ids).size !== ids.length) return null;
    const cards = ids.map((id) => this.hands[p].find((c) => c.id === id));
    if (cards.some((c) => !c)) return null;
    this.hands[p] = this.hands[p].filter((c) => !cards.includes(c));
    this.hands[o.to].push(...cards);
    this.exchanges.push({ from: p, to: o.to, cards });
    this.owed.delete(p);
    if (!this.owed.size) {
      this.phase = 'play';
      this.turn = this.order[this.n - 1]; // the Scum leads
    } else this.turn = [...this.owed.keys()][0];
    return { cards, to: o.to };
  }

  // ---------------------------------------------------------------- playing

  get top() {
    return this.pile[this.pile.length - 1] ?? null;
  }

  active(p) {
    return this.hands[p].length > 0;
  }

  /** Can p play these cards now? */
  canPlay(p, cards) {
    if (this.phase !== 'play' || this.turn !== p || !cards.length || cards.length > 4) return false;
    if (!cards.every((c) => c.value === cards[0].value && this.hands[p].includes(c))) return false;
    const t = this.top;
    if (!t) return true;
    return cards.length === t.cards.length && power(cards[0]) > power(t.cards[0]);
  }

  canPass(p) {
    return this.phase === 'play' && this.turn === p && !!this.top;
  }

  /** Groups p could play now: [[card]] (each a full option). */
  options(p) {
    const byRank = new Map();
    for (const c of this.hands[p]) byRank.set(c.value, [...(byRank.get(c.value) ?? []), c]);
    const t = this.top;
    const out = [];
    for (const cards of byRank.values()) {
      if (!t) {
        for (let k = 1; k <= cards.length; k++) out.push(cards.slice(0, k));
      } else if (cards.length >= t.cards.length && power(cards[0]) > power(t.cards[0])) out.push(cards.slice(0, t.cards.length));
    }
    return out;
  }

  /** Plays cards: { cards, out, clear?, hand? } or null. */
  play(p, ids) {
    const cards = ids.map((id) => this.hands[p].find((c) => c.id === id));
    if (cards.some((c) => !c) || !this.canPlay(p, cards)) return null;
    this.hands[p] = this.hands[p].filter((c) => !cards.includes(c));
    this.pile.push({ p, cards });
    this.lastPlayer = p;
    this.passed = new Set();
    const res = { cards, out: false };
    if (!this.hands[p].length) {
      this.finished.push(p);
      res.out = true;
      res.position = this.finished.length - 1;
    }
    if (this.endIfDone(res)) return res;
    this.advance(p, res);
    return res;
  }

  pass(p) {
    if (!this.canPass(p)) return null;
    this.passed.add(p);
    const res = { pass: true };
    this.advance(p, res);
    return res;
  }

  nextActive(from) {
    for (let k = 1; k <= this.n; k++) {
      const q = (from + k) % this.n;
      if (this.active(q)) return q;
    }
    return null;
  }

  /** Next turn, or clears the pile when everyone else has passed. */
  advance(p, res) {
    const others = [...Array(this.n).keys()].filter((q) => this.active(q) && q !== this.lastPlayer);
    if (others.every((q) => this.passed.has(q))) {
      // The pile is cleared; the last player leads (or the next one if they're out).
      res.clear = this.lastPlayer;
      this.pile = [];
      this.passed = new Set();
      this.turn = this.active(this.lastPlayer) ? this.lastPlayer : this.nextActive(this.lastPlayer);
      return;
    }
    this.turn = this.nextActive(p);
  }

  endIfDone(res) {
    const left = [...Array(this.n).keys()].filter((q) => this.active(q));
    if (left.length > 1) return false;
    if (left.length === 1) this.finished.push(left[0]);
    this.order = [...this.finished];
    const pts = this.order.map((_, i) => (i === 0 ? 2 : i === 1 && this.n >= 4 ? 1 : 0));
    this.order.forEach((p, i) => (this.scores[p] += pts[i]));
    this.handNo++;
    this.lastHand = { order: [...this.order], points: pts, scores: [...this.scores] };
    res.hand = this.lastHand;
    this.phase = 'handOver';
    const top = Math.max(...this.scores);
    if (top >= this.target && this.scores.filter((s) => s === top).length === 1) {
      this.winner = this.scores.indexOf(top);
      this.phase = 'over';
    }
    return true;
  }

  nextHand() {
    if (this.phase !== 'handOver') return false;
    this.startHand();
    return true;
  }

  roleOf(p) {
    if (!this.order) return null;
    return title(this.order.indexOf(p), this.n);
  }

  // -------------------------------------------------------------------- CPU

  /** Cards to give back: the lowest ones. */
  cpuGive(p) {
    const k = this.owed.get(p)?.k ?? 0;
    return [...this.hands[p]].sort((a, b) => power(a) - power(b)).slice(0, k).map((c) => c.id);
  }

  /** { type: 'play', ids } or { type: 'pass' }. */
  cpuMove(p) {
    const hand = this.hands[p];
    const counts = new Map();
    for (const c of hand) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
    const opts = this.options(p);
    if (!opts.length) return { type: 'pass' };
    const t = this.top;
    if (!t) {
      // Lead the lowest rank, all copies of it (shed as much low stuff as possible).
      const low = opts.filter((o) => o.length === counts.get(o[0].value)).sort((a, b) => power(a[0]) - power(b[0]))[0];
      return { type: 'play', ids: low.map((c) => c.id) };
    }
    // Follow: prefer not to break up bigger sets, then the lowest rank.
    const score = (o) => power(o[0]) + (counts.get(o[0].value) > o.length ? 6 : 0);
    const pick = [...opts].sort((a, b) => score(a) - score(b))[0];
    // Hold on to aces and 2s while the hand is long, unless the pile is already high.
    if (power(pick[0]) >= 14 && hand.length > 5 && power(t.cards[0]) < 11 && Math.random() < 0.7) return { type: 'pass' };
    return { type: 'play', ids: pick.map((c) => c.id) };
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return {
      v: 1, n: this.n, target: this.target, scores: this.scores, order: this.order, handNo: this.handNo, winner: this.winner,
      hands: this.hands.map(ids), pile: this.pile.map((x) => [x.p, ids(x.cards)]), passed: [...this.passed], lastPlayer: this.lastPlayer,
      finished: this.finished, exchanges: this.exchanges.map((x) => [x.from, x.to, ids(x.cards)]), owed: [...this.owed.entries()],
      phase: this.phase, turn: this.turn, lastHand: this.lastHand,
    };
  }

  static restore(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.hands)) return null;
    const byId = new Map(createDeck().map((c) => [c.id, c]));
    const card = (id) => {
      const c = byId.get(id);
      if (!c) throw new Error('bad save');
      return c;
    };
    const g = new President({ players: d.n, target: d.target });
    Object.assign(g, { scores: d.scores, order: d.order, handNo: d.handNo, winner: d.winner, lastPlayer: d.lastPlayer, finished: d.finished, phase: d.phase, turn: d.turn, lastHand: d.lastHand });
    g.hands = d.hands.map((h) => h.map(card));
    g.pile = d.pile.map(([p, cs]) => ({ p, cards: cs.map(card) }));
    g.passed = new Set(d.passed);
    g.exchanges = d.exchanges.map(([from, to, cs]) => ({ from, to, cards: cs.map(card) }));
    g.owed = new Map(d.owed);
    return g;
  }
}
