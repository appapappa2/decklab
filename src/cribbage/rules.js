// Cribbage for two players. Pure state, no DOM, so it can be tested in Node.
//
// Each hand: deal 6 each; both discard 2 into the dealer's crib. Cut a starter
// (a jack gives the dealer 2, "his heels"). Pegging: the non-dealer leads and
// players alternate, the running count never passing 31. Points while pegging:
// 15 or 31 for 2; a pair 2, three of a kind 6, four 12 (same rank in a row);
// a run of 3+ (the last cards, in any order) 1 per card; and 1 for the last
// card when nobody can play ("go"), unless the count hit 31. A player who
// can't play says go and the other keeps playing. Then the show, in order:
// non-dealer's hand, dealer's hand, dealer's crib, each with the starter:
// 2 per fifteen, 2 per pair, runs (1 per card, every combination), a 4-card
// flush in hand (5 with the starter; the crib needs all 5), and 1 for the jack
// of the starter's suit ("nobs"). First to 121 wins at once, even mid-hand.
import { createDeck, shuffle } from '../cards.js';

export const TARGET = 121;
export const pip = (c) => Math.min(c.value, 10);

function subsets(cards, f) {
  const n = cards.length;
  for (let m = 1; m < 1 << n; m++) {
    const s = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) s.push(cards[i]);
    f(s);
  }
}

const isRun = (cards) => {
  const v = cards.map((c) => c.value).sort((a, b) => a - b);
  return v.every((x, i) => i === 0 || x === v[i - 1] + 1);
};

/**
 * Scores a 4-card hand with the starter. Returns { total, items }, items like
 * { kind: 'fifteen' | 'pair' | 'run' | 'flush' | 'nobs', points, count?, len? }.
 */
export function scoreHand(hand, starter, isCrib = false) {
  const all = starter ? [...hand, starter] : [...hand];
  const items = [];
  let fifteens = 0;
  subsets(all, (s) => {
    if (s.reduce((a, c) => a + pip(c), 0) === 15) fifteens++;
  });
  if (fifteens) items.push({ kind: 'fifteen', count: fifteens, points: fifteens * 2 });
  let pairs = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i].value === all[j].value) pairs++;
  if (pairs) items.push({ kind: 'pair', count: pairs, points: pairs * 2 });
  for (let len = all.length; len >= 3; len--) {
    let count = 0;
    subsets(all, (s) => {
      if (s.length === len && isRun(s)) count++;
    });
    if (count) {
      items.push({ kind: 'run', len, count, points: len * count });
      break;
    }
  }
  const suit = hand[0]?.suit.id;
  if (hand.length === 4 && hand.every((c) => c.suit.id === suit)) {
    const withStarter = starter?.suit.id === suit;
    if (withStarter) items.push({ kind: 'flush', len: 5, points: 5 });
    else if (!isCrib) items.push({ kind: 'flush', len: 4, points: 4 });
  }
  if (starter && hand.some((c) => c.value === 11 && c.suit.id === starter.suit.id)) items.push({ kind: 'nobs', points: 1 });
  return { total: items.reduce((a, x) => a + x.points, 0), items };
}

/** Points for the card just played onto `seq` (the cards since the last reset). */
export function pegScore(seq) {
  const items = [];
  const count = seq.reduce((a, c) => a + pip(c), 0);
  if (count === 15) items.push({ kind: 'fifteen', points: 2 });
  if (count === 31) items.push({ kind: 'thirtyone', points: 2 });
  const last = seq[seq.length - 1];
  let same = 1;
  for (let i = seq.length - 2; i >= 0 && seq[i].value === last.value; i--) same++;
  if (same >= 2) items.push({ kind: 'pair', count: same, points: [0, 0, 2, 6, 12][same] });
  for (let n = seq.length; n >= 3; n--) {
    const tail = seq.slice(-n);
    if (new Set(tail.map((c) => c.value)).size === n && isRun(tail)) {
      items.push({ kind: 'run', len: n, points: n });
      break;
    }
  }
  return { points: items.reduce((a, x) => a + x.points, 0), items };
}

export class Cribbage {
  constructor({ dealer = 0, target = TARGET } = {}) {
    this.target = target;
    this.scores = [0, 0];
    this.back = [0, 0]; // back pegs: the score before the last points
    this.dealer = dealer;
    this.winner = null;
    this.handNo = 0;
    this.startHand();
  }

  startHand(deck = shuffle(createDeck())) {
    this.stock = deck.slice();
    this.hands = [[], []];
    for (let i = 0; i < 6; i++) for (const p of [1 - this.dealer, this.dealer]) this.hands[p].push(this.stock.pop());
    this.kept = [null, null];
    this.crib = [];
    this.starter = null;
    this.phase = 'discard'; // 'discard' -> 'peg' -> 'show' -> 'handOver' | 'over'
    this.left = [[], []]; // cards still to peg
    this.seq = []; // cards in the current count
    this.done = []; // earlier counts this hand: [{ p, card }]
    this.plays = []; // current count: [{ p, card }]
    this.count = 0;
    this.turn = 1 - this.dealer;
    this.lastPlayer = null;
    this.showStep = 0;
    this.lastShow = null;
  }

  /** Adds points; true if that wins the game. */
  peg(p, n) {
    if (!n || this.winner !== null) return false;
    this.back[p] = this.scores[p];
    this.scores[p] = Math.min(this.target, this.scores[p] + n);
    if (this.scores[p] >= this.target) {
      this.winner = p;
      this.phase = 'over';
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- discard

  discard(p, ids) {
    if (this.phase !== 'discard' || this.kept[p] || ids.length !== 2 || ids[0] === ids[1]) return null;
    const cards = ids.map((id) => this.hands[p].find((c) => c.id === id));
    if (cards.some((c) => !c)) return null;
    this.kept[p] = this.hands[p].filter((c) => !cards.includes(c));
    this.hands[p] = [...this.kept[p]];
    this.crib.push(...cards);
    if (!this.kept[0] || !this.kept[1]) return { cards };
    this.starter = this.stock.pop();
    this.phase = 'peg';
    this.left = [[...this.kept[0]], [...this.kept[1]]];
    const heels = this.starter.value === 11;
    if (heels) this.peg(this.dealer, 2);
    return { cards, starter: this.starter, heels };
  }

  // ---------------------------------------------------------------- pegging

  canPlay(p, card) {
    return this.count + pip(card) <= 31;
  }

  playable(p) {
    return this.left[p].filter((c) => this.canPlay(p, c));
  }

  /**
   * Plays a card. Returns { card, points, items, events } where events may
   * hold { type: 'go', p } (that player couldn't play), { type: 'last', p,
   * points } (1 for the last card), { type: 'reset' } and { type: 'show' }.
   */
  play(p, id) {
    if (this.phase !== 'peg' || this.turn !== p) return null;
    const card = this.left[p].find((c) => c.id === id);
    if (!card || !this.canPlay(p, card)) return null;
    this.left[p] = this.left[p].filter((c) => c !== card);
    this.seq.push(card);
    this.plays.push({ p, card });
    this.count += pip(card);
    this.lastPlayer = p;
    const { points, items } = pegScore(this.seq);
    const events = [];
    if (this.peg(p, points)) return { card, points, items, events };
    if (this.count === 31) this.reset(events);
    this.advance(p, events);
    return { card, points, items, events };
  }

  reset(events) {
    this.done.push(...this.plays);
    this.plays = [];
    this.seq = [];
    this.count = 0;
    events.push({ type: 'reset' });
  }

  /** Gives the turn to whoever can play next, scoring go / last card when nobody can. */
  advance(last, events) {
    const q = 1 - last;
    if (this.playable(q).length) {
      this.turn = q;
      return;
    }
    if (this.playable(last).length) {
      if (this.left[q].length || this.count) events.push({ type: 'go', p: q });
      this.turn = last;
      return;
    }
    // Nobody can play: 1 for the last card (a 31 has already been scored and reset).
    if (this.count > 0) {
      if (this.left[q].length) events.push({ type: 'go', p: q });
      events.push({ type: 'last', p: last, points: 1 });
      if (this.peg(last, 1)) return;
      this.reset(events);
    }
    if (!this.left[0].length && !this.left[1].length) {
      this.done.push(...this.plays);
      this.plays = [];
      this.phase = 'show';
      events.push({ type: 'show' });
      return;
    }
    this.turn = this.left[q].length ? q : last;
  }

  // ---------------------------------------------------------------- the show

  /** The next thing to count: { p, crib, cards, starter, total, items }, scored as it's returned. */
  showNext() {
    if (this.phase !== 'show') return null;
    const p = this.showStep < 2 ? (this.showStep === 0 ? 1 - this.dealer : this.dealer) : this.dealer;
    const crib = this.showStep === 2;
    const cards = crib ? this.crib : this.kept[p];
    const res = scoreHand(cards, this.starter, crib);
    this.showStep++;
    this.lastShow = { p, crib, cards, ...res };
    if (!this.peg(p, res.total) && this.showStep === 3) {
      this.phase = 'handOver';
      this.handNo++;
    }
    return this.lastShow;
  }

  nextHand() {
    if (this.phase !== 'handOver') return false;
    this.dealer = 1 - this.dealer;
    this.startHand();
    return true;
  }

  // -------------------------------------------------------------------- CPU

  /** Keeps the 4 cards with the best average score over the possible starters, minding the crib. */
  cpuDiscard(p) {
    const hand = this.hands[p];
    const seen = new Set(hand.map((c) => c.id));
    const unseen = createDeck().filter((c) => !seen.has(c.id));
    const mine = p === this.dealer;
    let best = null;
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const keep = hand.filter((_, k) => k !== i && k !== j);
        const toss = [hand[i], hand[j]];
        let sum = 0;
        for (const s of unseen) sum += scoreHand(keep, s).total;
        let crib = 0;
        if (pip(toss[0]) + pip(toss[1]) === 15) crib += 2;
        if (toss[0].value === toss[1].value) crib += 2;
        crib += toss.filter((c) => c.value === 5).length * 1.5;
        if (Math.abs(toss[0].value - toss[1].value) === 1) crib += 0.6;
        const v = sum / unseen.length + (mine ? crib : -crib);
        if (!best || v > best.v) best = { v, ids: toss.map((c) => c.id) };
      }
    }
    return best.ids;
  }

  /** Grabs points, avoids leaving 5 or 21 (easy fifteens/31s), keeps low cards for later. */
  cpuPlay(p) {
    const opts = this.playable(p);
    if (!opts.length) return null;
    let best = null;
    for (const c of opts) {
      const after = this.count + pip(c);
      let v = pegScore([...this.seq, c]).points * 10;
      if (after === 5 || after === 21) v -= 12;
      if (this.count === 0 && c.value === 5) v -= 8;
      if (after < 15 && after > 4 && 15 - after <= 10) v -= 3; // opponent can make 15
      v += pip(c) * 0.3;
      if (!best || v > best.v) best = { v, c };
    }
    return best.c;
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => (a ? a.map((c) => c.id) : null);
    return {
      v: 1,
      target: this.target,
      scores: this.scores,
      back: this.back,
      dealer: this.dealer,
      winner: this.winner,
      handNo: this.handNo,
      stock: ids(this.stock),
      hands: this.hands.map(ids),
      kept: this.kept.map(ids),
      crib: ids(this.crib),
      starter: this.starter?.id ?? null,
      phase: this.phase,
      left: this.left.map(ids),
      seq: ids(this.seq),
      done: this.done.map((x) => [x.p, x.card.id]),
      plays: this.plays.map((x) => [x.p, x.card.id]),
      count: this.count,
      turn: this.turn,
      lastPlayer: this.lastPlayer,
      showStep: this.showStep,
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
    const list = (a) => (a ? a.map(card) : null);
    const g = new Cribbage({ dealer: d.dealer, target: d.target });
    Object.assign(g, {
      scores: d.scores, back: d.back, winner: d.winner, handNo: d.handNo, phase: d.phase, count: d.count,
      turn: d.turn, lastPlayer: d.lastPlayer, showStep: d.showStep,
    });
    g.stock = list(d.stock);
    g.hands = d.hands.map(list);
    g.kept = d.kept.map(list);
    g.crib = list(d.crib);
    g.starter = d.starter ? card(d.starter) : null;
    g.left = d.left.map(list);
    g.seq = list(d.seq);
    g.done = d.done.map(([p, id]) => ({ p, card: card(id) }));
    g.plays = d.plays.map(([p, id]) => ({ p, card: card(id) }));
    // Every card is in exactly one of: stock, a hand (before the discard), the crib or the starter.
    const all = [...g.stock, ...g.crib, ...(g.starter ? [g.starter] : []), ...(g.phase === 'discard' ? g.hands.flat() : [...g.kept[0], ...g.kept[1]])];
    if (new Set(all.map((c) => c.id)).size !== 52 || all.length !== 52) return null;
    return g;
  }
}
