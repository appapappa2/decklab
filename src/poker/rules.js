// No-limit Texas Hold'em for 2–6 players. Pure state, no DOM, so it can be
// tested in Node. Seats are numbered clockwise.
//
// Everyone starts with the same stack. Each hand the button moves to the next
// player with chips; the next two post the small and big blind (heads-up the
// button posts the small blind and acts first before the flop). Two hole cards
// each, then betting rounds preflop, flop (3 cards), turn and river. On your
// turn: fold, check (nothing to call), call, or raise to any amount from the
// minimum raise (the last raise size) up to all-in. A round ends when everyone
// still in has acted and matched the bet or is all-in. If one player is left
// they win the pot; otherwise the best five-card hand from hole + board cards
// wins, with side pots for all-ins and ties splitting the pot (odd chips go to
// the first winner left of the button). Blinds rise every BLIND_EVERY hands.
// Players with no chips are out; the last player with chips wins.
import { createDeck, shuffle } from '../cards.js';

export const START_STACK = 1000;
export const BLINDS = [[10, 20], [20, 40], [30, 60], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000]];
export const BLIND_EVERY = 8;
export const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

// ------------------------------------------------------------ hand evaluation

const hv = (c) => (c.value === 1 ? 14 : c.value);

/** Score of exactly five cards: higher is better. Also returns the category. */
export function eval5(cards) {
  const v = cards.map(hv).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit.id === cards[0].suit.id);
  const uniq = [...new Set(v)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (v[0] - v[4] === 4) straightHigh = v[0];
    else if (v[0] === 14 && v[1] === 5) straightHigh = 5; // the wheel, A-2-3-4-5
  }
  const counts = new Map();
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1);
  // Ranks ordered by how many there are, then by rank.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  let cat;
  let kick;
  if (straightHigh && flush) [cat, kick] = [8, [straightHigh]];
  else if (shape === '41') [cat, kick] = [7, groups.map((g) => g[0])];
  else if (shape === '32') [cat, kick] = [6, groups.map((g) => g[0])];
  else if (flush) [cat, kick] = [5, v];
  else if (straightHigh) [cat, kick] = [4, [straightHigh]];
  else if (shape === '311') [cat, kick] = [3, groups.map((g) => g[0])];
  else if (shape === '221') [cat, kick] = [2, groups.map((g) => g[0])];
  else if (shape === '2111') [cat, kick] = [1, groups.map((g) => g[0])];
  else [cat, kick] = [0, v];
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (kick[i] ?? 0);
  return { score, cat };
}

/** Best five of the given cards (5–7): { score, cat, name, cards }. */
export function bestHand(cards) {
  const n = cards.length;
  let best = null;
  const consider = (five) => {
    const e = eval5(five);
    if (!best || e.score > best.score) best = { ...e, cards: five };
  };
  if (n === 5) consider(cards);
  else if (n === 6) for (let a = 0; a < 6; a++) consider(cards.filter((_, i) => i !== a));
  else for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) consider(cards.filter((_, i) => i !== a && i !== b));
  return { ...best, name: HAND_NAMES[best.cat] };
}

// ------------------------------------------------------------------ the game

export class Holdem {
  constructor({ players = 2, stack = START_STACK, dealer = 0 } = {}) {
    this.n = Math.max(2, Math.min(6, players));
    this.stacks = Array(this.n).fill(stack);
    this.dealer = dealer;
    this.handNo = 0;
    this.winner = null;
    this.phase = 'between'; // 'between' -> 'betting' -> 'showdown' -> 'between' | 'over'
    this.board = [];
    this.hole = Array.from({ length: this.n }, () => []);
    this.last = null;
  }

  get level() {
    return Math.min(BLINDS.length - 1, Math.floor(this.handNo / BLIND_EVERY));
  }

  get blinds() {
    return BLINDS[this.level];
  }

  /** Next seat after p (clockwise) that matches `ok`. */
  next(p, ok) {
    for (let k = 1; k <= this.n; k++) {
      const q = (p + k) % this.n;
      if (ok(q)) return q;
    }
    return null;
  }

  pot() {
    return this.total.reduce((a, b) => a + b, 0);
  }

  // ---------------------------------------------------------------- dealing

  startHand(deck = shuffle(createDeck())) {
    if (this.phase === 'over') return null;
    const seated = (q) => this.stacks[q] > 0;
    if (this.stacks.filter((s) => s > 0).length < 2) return null;
    if (this.handNo > 0 || !seated(this.dealer)) this.dealer = this.next(this.dealer, seated);
    this.deck = deck.slice();
    this.inHand = this.stacks.map((s) => s > 0);
    this.folded = this.inHand.map((x) => !x);
    this.allIn = Array(this.n).fill(false);
    this.bet = Array(this.n).fill(0); // this street
    this.total = Array(this.n).fill(0); // this hand
    this.hole = Array.from({ length: this.n }, () => []);
    this.board = [];
    this.street = 'preflop';
    this.phase = 'betting';
    this.result = null;
    this.startStacks = [...this.stacks];
    const players = this.inHand.filter(Boolean).length;
    // Heads-up the button is the small blind.
    const sb = players === 2 ? this.dealer : this.next(this.dealer, seated);
    const bb = this.next(sb, seated);
    const [s, b] = this.blinds;
    this.sbSeat = sb;
    this.bbSeat = bb;
    this.post(sb, s);
    this.post(bb, b);
    this.currentBet = b;
    this.minRaise = b;
    for (let r = 0; r < 2; r++) for (let k = 1; k <= this.n; k++) {
      const q = (this.dealer + k) % this.n;
      if (this.inHand[q]) this.hole[q].push(this.deck.pop());
    }
    this.handNo++;
    this.needs = new Set(this.canAct());
    this.turn = this.next(bb, (q) => this.needs.has(q));
    if (this.turn === null) this.finishStreet();
    return { sb, bb, blinds: [s, b] };
  }

  post(p, amount) {
    const a = Math.min(amount, this.stacks[p]);
    this.stacks[p] -= a;
    this.bet[p] += a;
    this.total[p] += a;
    if (!this.stacks[p]) this.allIn[p] = true;
    return a;
  }

  canAct() {
    return [...Array(this.n).keys()].filter((q) => this.inHand[q] && !this.folded[q] && !this.allIn[q]);
  }

  contenders() {
    return [...Array(this.n).keys()].filter((q) => this.inHand[q] && !this.folded[q]);
  }

  // ---------------------------------------------------------------- betting

  /** What p may do: { toCall, canCheck, minTo, maxTo } (amounts are this street's bet totals). */
  options(p) {
    const toCall = Math.min(this.currentBet - this.bet[p], this.stacks[p]);
    const maxTo = this.bet[p] + this.stacks[p];
    const minTo = Math.min(maxTo, this.currentBet + this.minRaise);
    return { toCall, canCheck: toCall === 0, minTo, maxTo, canRaise: maxTo > this.currentBet };
  }

  /**
   * p acts: { type: 'fold' | 'check' | 'call' | 'raise', to? }. Returns the
   * events: { type: 'action', p, action, amount }, { type: 'street', street,
   * cards }, { type: 'win', ... } (see finish()), or null if not allowed.
   */
  act(p, a) {
    if (this.phase !== 'betting' || this.turn !== p) return null;
    const o = this.options(p);
    const ev = [];
    if (a.type === 'fold') this.folded[p] = true;
    else if (a.type === 'check') {
      if (!o.canCheck) return null;
    } else if (a.type === 'call') {
      if (o.canCheck) return null;
      this.post(p, o.toCall);
    } else if (a.type === 'raise') {
      if (!o.canRaise) return null;
      const to = Math.max(o.minTo, Math.min(o.maxTo, Math.round(a.to)));
      const raise = to - this.currentBet;
      this.post(p, to - this.bet[p]);
      if (raise >= this.minRaise) this.minRaise = raise;
      this.currentBet = Math.max(this.currentBet, this.bet[p]);
      // Everyone else still able to act has to respond.
      this.needs = new Set(this.canAct().filter((q) => q !== p));
    } else return null;
    this.needs.delete(p);
    ev.push({ type: 'action', p, action: a.type, amount: this.bet[p], allIn: this.allIn[p] });
    this.advance(p, ev);
    return ev;
  }

  advance(p, ev) {
    if (this.contenders().length === 1) {
      ev.push(this.finish());
      return;
    }
    // Anyone left who still owes chips (e.g. facing an all-in) must act.
    for (const q of this.canAct()) if (this.bet[q] < this.currentBet) this.needs.add(q);
    if (this.needs.size) {
      this.turn = this.next(p, (q) => this.needs.has(q));
      return;
    }
    this.finishStreet(ev);
  }

  /** Deals the next street(s); runs the board out when nobody can bet. */
  finishStreet(ev = []) {
    for (;;) {
      this.bet.fill(0);
      this.currentBet = 0;
      this.minRaise = this.blinds[1];
      if (this.street === 'river') {
        ev.push(this.finish());
        return ev;
      }
      const count = this.street === 'preflop' ? 3 : 1;
      this.street = { preflop: 'flop', flop: 'turn', turn: 'river' }[this.street];
      this.deck.pop(); // burn
      const cards = [];
      for (let i = 0; i < count; i++) cards.push(this.deck.pop());
      this.board.push(...cards);
      ev.push({ type: 'street', street: this.street, cards });
      const can = this.canAct();
      if (can.length >= 2) {
        this.needs = new Set(can);
        this.turn = this.next(this.dealer, (q) => this.needs.has(q));
        return ev;
      }
    }
  }

  /** Ends the hand: returns uncalled chips, splits the pots. */
  finish() {
    const cont = this.contenders();
    // An uncalled bet goes back to whoever made it.
    const sorted = [...this.total].sort((a, b) => b - a);
    const top = this.total.indexOf(sorted[0]);
    const refund = sorted[0] - sorted[1];
    if (refund > 0) {
      this.total[top] -= refund;
      this.stacks[top] += refund;
    }
    const pots = [];
    const hands = {};
    if (cont.length === 1) {
      pots.push({ amount: this.pot(), winners: cont, eligible: cont });
    } else {
      for (const q of cont) hands[q] = bestHand([...this.hole[q], ...this.board]);
      const levels = [...new Set(cont.map((q) => this.total[q]))].sort((a, b) => a - b);
      let prev = 0;
      levels.forEach((lv, i) => {
        let amount = 0;
        for (let q = 0; q < this.n; q++) amount += Math.max(0, Math.min(this.total[q], lv) - prev);
        // Folded chips above the top level (rare) go in the last pot.
        if (i === levels.length - 1) for (let q = 0; q < this.n; q++) amount += Math.max(0, this.total[q] - lv);
        const eligible = cont.filter((q) => this.total[q] >= lv);
        const best = Math.max(...eligible.map((q) => hands[q].score));
        const winners = eligible.filter((q) => hands[q].score === best);
        if (amount > 0) pots.push({ amount, winners, eligible });
        prev = lv;
      });
    }
    const won = Array(this.n).fill(0);
    for (const pot of pots) {
      const share = Math.floor(pot.amount / pot.winners.length);
      let odd = pot.amount - share * pot.winners.length;
      // Odd chips to the first winners left of the button.
      const order = [...pot.winners].sort((a, b) => ((a - this.dealer - 1 + this.n) % this.n) - ((b - this.dealer - 1 + this.n) % this.n));
      for (const q of order) {
        won[q] += share + (odd-- > 0 ? 1 : 0);
      }
    }
    for (let q = 0; q < this.n; q++) this.stacks[q] += won[q];
    this.phase = 'showdown';
    this.result = { pots, won, hands, showdown: cont.length > 1, refund: refund > 0 ? { p: top, amount: refund } : null };
    this.last = this.result;
    this.inHand = this.inHand.map(() => false);
    const left = this.stacks.filter((s) => s > 0).length;
    if (left <= 1) {
      this.winner = this.stacks.findIndex((s) => s > 0);
      this.phase = 'over';
    }
    return { type: 'win', ...this.result };
  }

  /** After a showdown: ready for the next hand. */
  endHand() {
    if (this.phase === 'showdown') this.phase = 'between';
  }

  // -------------------------------------------------------------------- CPU

  /** Monte Carlo share of the pot p can expect against the players still in. */
  equity(p, sims = 220) {
    const opp = this.contenders().filter((q) => q !== p).length;
    if (!opp) return 1;
    const known = new Set([...this.hole[p], ...this.board].map((c) => c.id));
    const pool = createDeck().filter((c) => !known.has(c.id));
    let win = 0;
    for (let s = 0; s < sims; s++) {
      // Partial shuffle: just enough cards for the board and opponents.
      const need = 5 - this.board.length + opp * 2;
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const board = [...this.board, ...pool.slice(0, 5 - this.board.length)];
      const mine = bestHand([...this.hole[p], ...board]).score;
      let best = true;
      let ties = 0;
      for (let k = 0; k < opp; k++) {
        const o = 5 - this.board.length + k * 2;
        const theirs = bestHand([pool[o], pool[o + 1], ...board]).score;
        if (theirs > mine) {
          best = false;
          break;
        }
        if (theirs === mine) ties++;
      }
      if (best) win += 1 / (ties + 1);
    }
    return win / sims;
  }

  /** The CPU's action, from equity against pot odds with a little randomness. */
  cpuAct(p, style = 0) {
    const o = this.options(p);
    const pot = this.pot();
    const e = this.equity(p);
    const opp = this.contenders().length - 1;
    const fair = 1 / (opp + 1);
    const odds = o.toCall / (pot + o.toCall || 1);
    const r = Math.random();
    const bb = this.blinds[1];
    const sizeTo = (frac) => this.currentBet + Math.max(this.minRaise, Math.round((pot * frac) / bb) * bb);
    const strong = e > fair + 0.28 + style;
    const good = e > fair + 0.12 + style;
    if (o.canCheck) {
      if (o.canRaise && (strong || (good && r < 0.5) || r < 0.07)) return { type: 'raise', to: sizeTo(strong ? 0.75 : 0.5) };
      return { type: 'check' };
    }
    if (o.canRaise && strong && r < 0.6) return { type: 'raise', to: sizeTo(0.8) };
    if (e >= odds + 0.04 || (o.toCall <= bb && e > fair * 0.7)) return { type: 'call' };
    if (r < 0.04 && o.toCall < pot * 0.3) return { type: 'call' }; // the odd float
    return { type: 'fold' };
  }

  // ------------------------------------------------------------ persistence

  /** Saved between hands only (a hand in progress is replayed from its start). */
  serialize() {
    const mid = this.phase === 'betting';
    const stacks = mid ? this.startStacks : this.stacks;
    return { v: 1, n: this.n, stacks, dealer: this.dealer, handNo: mid ? this.handNo - 1 : this.handNo, winner: this.winner, replay: mid };
  }

  static restore(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.stacks)) return null;
    const g = new Holdem({ players: d.n, dealer: d.dealer });
    g.stacks = d.stacks.map(Number);
    g.handNo = d.handNo;
    g.winner = d.winner;
    // Replaying an unfinished hand: the button already moved for it, so step back one seat.
    if (d.replay && g.handNo > 0) g.dealer = (g.dealer - 1 + g.n) % g.n;
    if (g.winner !== null && g.winner !== undefined && g.winner >= 0) g.phase = 'over';
    else g.winner = null;
    return g;
  }
}
