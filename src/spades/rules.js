// Spades for four players in two partnerships. Pure state, no DOM, so it can
// be tested in Node.
//
// Seats in play order (clockwise): 0 South, 1 West, 2 North, 3 East. South and
// North are team 0, West and East team 1. 13 cards each. Bidding starts left
// of the dealer: each player bids the tricks they expect to win, or Nil (0).
// The player left of the dealer leads the first trick. Follow suit if you can;
// spades are trump; spades can't be led until one has been played (unless
// that's all you have). Highest spade wins, otherwise the highest card of the
// led suit (aces high); the winner leads next.
// Scoring per team: making the combined bid of its non-Nil players scores 10
// per trick bid, plus 1 per extra trick (a "bag"); missing it costs 10 per
// trick bid. Bags score 1 point each. A Nil scores +100 if that player takes no tricks, −100 if they
// do (their tricks count as bags). Every 10 bags costs 100. A team at 500 or
// more, or at −200 or less, ends the game; the higher score wins.
import { createDeck, shuffle } from '../cards.js';

export const TARGET = 500;
export const LOSE_AT = -200;
export const power = (c) => (c.value === 1 ? 14 : c.value);
export const teamOf = (seat) => seat % 2;
const isSpade = (c) => c.suit.id === 'S';

export class Spades {
  constructor({ target = TARGET, dealer = 3 } = {}) {
    this.target = target;
    this.scores = [0, 0];
    this.bags = [0, 0];
    this.handNo = 0;
    this.dealer = dealer;
    this.winner = null; // team
    this.history = [];
    this.startHand();
  }

  startHand(deck = shuffle(createDeck())) {
    this.hands = [[], [], [], []];
    deck.forEach((c, i) => this.hands[i % 4].push(c));
    this.bids = [null, null, null, null];
    this.tricks = [0, 0, 0, 0];
    this.trick = []; // [{ seat, card }]
    this.spadesBroken = false;
    this.trickNo = 0;
    this.turn = (this.dealer + 1) % 4;
    this.phase = 'bid'; // 'bid' -> 'play' -> 'handOver' | 'gameOver'
    this.lastHand = null;
  }

  // ---------------------------------------------------------------- bidding

  bid(p, n) {
    if (this.phase !== 'bid' || this.turn !== p || !Number.isInteger(n) || n < 0 || n > 13) return false;
    this.bids[p] = n;
    this.turn = (p + 1) % 4;
    if (this.bids.every((b) => b !== null)) {
      this.phase = 'play';
      this.turn = (this.dealer + 1) % 4;
    }
    return true;
  }

  /** Combined bid of a team's non-Nil players (null while bids are missing). */
  teamBid(t) {
    const b = [this.bids[t], this.bids[t + 2]];
    return b.reduce((s, x) => s + (x ?? 0), 0);
  }

  teamTricks(t) {
    return this.tricks[t] + this.tricks[t + 2];
  }

  // ---------------------------------------------------------------- playing

  legal(p) {
    if (this.phase !== 'play' || this.turn !== p) return [];
    const hand = this.hands[p];
    if (!this.trick.length) {
      if (!this.spadesBroken) {
        const other = hand.filter((c) => !isSpade(c));
        if (other.length) return other;
      }
      return hand;
    }
    const lead = this.trick[0].card.suit.id;
    const follow = hand.filter((c) => c.suit.id === lead);
    return follow.length ? follow : hand;
  }

  canPlay(p, card) {
    return this.legal(p).includes(card);
  }

  /** The seat currently winning the trick in progress. */
  winningSeat(trick = this.trick) {
    if (!trick.length) return null;
    const lead = trick[0].card.suit.id;
    let best = trick[0];
    for (const t of trick) {
      const bs = isSpade(best.card);
      const ts = isSpade(t.card);
      if (ts && !bs) best = t;
      else if (ts === bs && t.card.suit.id === best.card.suit.id && power(t.card) > power(best.card)) best = t;
      else if (!ts && !bs && t.card.suit.id === lead && best.card.suit.id !== lead) best = t;
    }
    return best.seat;
  }

  /**
   * Plays a card. Returns { card, trick?, hand?, game? }:
   *   trick: { winner, cards }        when the trick completes
   *   hand:  this.lastHand            when the hand ends
   *   game:  { winner }               when the game ends
   */
  play(p, id) {
    const card = this.hands[p].find((c) => c.id === id);
    if (!card || !this.canPlay(p, card)) return null;
    this.hands[p] = this.hands[p].filter((c) => c !== card);
    this.trick.push({ seat: p, card });
    if (isSpade(card)) this.spadesBroken = true;
    const out = { card };
    if (this.trick.length < 4) {
      this.turn = (p + 1) % 4;
      return out;
    }
    const winner = this.winningSeat();
    out.trick = { winner, cards: this.trick };
    this.tricks[winner]++;
    this.trick = [];
    this.trickNo++;
    this.turn = winner;
    if (this.trickNo === 13) {
      out.hand = this.endHand();
      if (this.winner !== null) out.game = { winner: this.winner };
    }
    return out;
  }

  endHand() {
    const teams = [0, 1].map((t) => {
      const seats = [t, t + 2];
      let points = 0;
      let bags = 0;
      const nil = [];
      let contract = 0;
      let made = 0;
      for (const s of seats) {
        if (this.bids[s] === 0) {
          const ok = this.tricks[s] === 0;
          points += ok ? 100 : -100;
          bags += this.tricks[s];
          nil.push({ seat: s, ok });
        } else {
          contract += this.bids[s];
          made += this.tricks[s];
        }
      }
      // Overtricks and a Nil player's tricks are bags, worth 1 point each.
      if (contract > 0) {
        if (made >= contract) {
          points += contract * 10;
          bags += made - contract;
        } else points -= contract * 10;
      }
      points += bags;
      let penalty = 0;
      let total = this.bags[t] + bags;
      while (total >= 10) {
        total -= 10;
        penalty += 100;
      }
      points -= penalty;
      return { bid: contract, made, points, bags, bagsTotal: total, penalty, nil, tricks: this.teamTricks(t) };
    });
    for (const t of [0, 1]) {
      this.scores[t] += teams[t].points;
      this.bags[t] = teams[t].bagsTotal;
    }
    this.handNo++;
    this.history.push(teams.map((x) => x.points));
    this.lastHand = { teams, scores: [...this.scores], bids: [...this.bids], tricks: [...this.tricks] };
    this.phase = 'handOver';
    const [a, b] = this.scores;
    const done = Math.max(a, b) >= this.target || Math.min(a, b) <= LOSE_AT;
    if (done && a !== b) {
      this.winner = a > b ? 0 : 1;
      this.phase = 'gameOver';
    }
    return this.lastHand;
  }

  nextHand() {
    if (this.phase !== 'handOver') return false;
    this.dealer = (this.dealer + 1) % 4;
    this.startHand();
    return true;
  }

  // -------------------------------------------------------------------- CPU

  /** Estimated tricks: aces, protected kings and queens, and length/height in spades. */
  cpuBid(p) {
    const hand = this.hands[p];
    const bySuit = (s) => hand.filter((c) => c.suit.id === s);
    let est = 0;
    for (const s of ['C', 'D', 'H']) {
      const cards = bySuit(s);
      const has = (v) => cards.some((c) => power(c) === v);
      if (has(14)) est += cards.length <= 5 ? 1 : 0.7;
      if (has(13)) est += cards.length >= 2 && cards.length <= 5 ? 0.75 : 0.2;
      if (has(12) && cards.length >= 3 && cards.length <= 4) est += 0.3;
      if (cards.length <= 1) est += 0.5; // a void or singleton can be trumped into
    }
    const spades = bySuit('S').map(power).sort((a, b) => b - a);
    spades.forEach((v, i) => {
      if (v >= 13 || (v === 12 && spades.length >= 3)) est += 1;
      else if (i >= 3) est += 0.8; // long spades win late
      else if (v >= 10) est += 0.35;
    });
    const highCards = hand.filter((c) => power(c) >= 13).length;
    if (est < 1 && highCards === 0 && spades.length <= 3 && (spades[0] ?? 0) < 10) return 0; // Nil
    // A partner who already bid big leaves less room.
    const partner = this.bids[(p + 2) % 4];
    const n = Math.round(est);
    return Math.max(1, Math.min(13 - (partner ?? 0), n));
  }

  cpuPlay(p) {
    const opts = this.legal(p);
    if (!opts.length) return null;
    const low = (cs) => cs.reduce((a, b) => (power(b) < power(a) ? b : a));
    const high = (cs) => cs.reduce((a, b) => (power(b) > power(a) ? b : a));
    const t = teamOf(p);
    const nil = this.bids[p] === 0;
    const partnerNil = this.bids[(p + 2) % 4] === 0;
    const need = this.teamBid(t) - (this.tricks[nil ? (p + 2) % 4 : p] + (this.bids[(p + 2) % 4] === 0 ? 0 : this.tricks[(p + 2) % 4]));
    const beats = (card) => this.winningSeat([...this.trick, { seat: p, card }]) === p;

    if (!this.trick.length) {
      if (nil) return low(opts);
      const plain = opts.filter((c) => !isSpade(c));
      const aces = plain.filter((c) => power(c) === 14);
      if (aces.length && need > 0) return aces[0];
      if (this.spadesBroken && need > 0) {
        const s = opts.filter(isSpade);
        if (s.length && power(high(s)) >= 13) return high(s);
      }
      return low(plain.length ? plain : opts);
    }
    const winner = this.winningSeat();
    const partnerWinning = winner === (p + 2) % 4;
    const winners = opts.filter(beats);
    // Nil (mine): stay under; when void, dump the highest card.
    if (nil) {
      const losers = opts.filter((c) => !beats(c));
      return losers.length ? high(losers) : low(opts);
    }
    // Protect a partner's Nil: win the trick if they're winning it.
    if (partnerNil && partnerWinning && winners.length) return low(winners);
    if (partnerWinning && !partnerNil) return low(opts);
    if (need > 0 && winners.length) return low(winners);
    // Not needed (or can't win): throw the cheapest card, avoiding spades.
    const plain = opts.filter((c) => !isSpade(c));
    return low(plain.length ? plain : opts);
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    return {
      v: 1,
      target: this.target,
      scores: this.scores,
      bags: this.bags,
      handNo: this.handNo,
      dealer: this.dealer,
      winner: this.winner,
      history: this.history,
      hands: this.hands.map((h) => h.map((c) => c.id)),
      bids: this.bids,
      tricks: this.tricks,
      trick: this.trick.map((t) => [t.seat, t.card.id]),
      spadesBroken: this.spadesBroken,
      trickNo: this.trickNo,
      turn: this.turn,
      phase: this.phase,
      lastHand: this.lastHand,
    };
  }

  static restore(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.hands)) return null;
    const byId = new Map(createDeck().map((c) => [c.id, c]));
    const seen = new Set();
    const card = (id) => {
      const c = byId.get(id);
      if (!c || seen.has(id)) throw new Error('bad save');
      seen.add(id);
      return c;
    };
    const g = new Spades({ target: d.target });
    Object.assign(g, {
      scores: d.scores, bags: d.bags, handNo: d.handNo, dealer: d.dealer, winner: d.winner, history: d.history ?? [],
      bids: d.bids, tricks: d.tricks, spadesBroken: d.spadesBroken, trickNo: d.trickNo, turn: d.turn, phase: d.phase, lastHand: d.lastHand,
    });
    g.hands = d.hands.map((h) => h.map(card));
    g.trick = d.trick.map(([seat, id]) => ({ seat, card: card(id) }));
    // Cards from finished tricks aren't kept, so a save is valid if the rest adds up.
    if (seen.size + g.trickNo * 4 !== 52 && (g.phase === 'bid' || g.phase === 'play')) return null;
    return g;
  }
}
