// Beggar-my-neighbour for 2–4 players. Pure state, no DOM, so it can be tested
// in Node. There are no decisions: players take turns flipping the top card of
// their pile onto the center pile.
//   A court card or ace makes the next player pay: 4 cards for an ace, 3 for
//   a king, 2 for a queen, 1 for a jack, flipped one at a time.
//   Turning up a court card while paying passes a new debt to the next player.
//   Paying in full without one lets whoever played the last court card take
//   the whole pile (to the bottom of their own pile); they flip next.
// A player who runs out of cards is out (a player who can't finish paying
// hands the pile to the court card's owner). The last player with cards wins.
import { createDeck, shuffle } from '../cards.js';

export const PENALTY = { 1: 4, 13: 3, 12: 2, 11: 1 };
export const penalty = (card) => PENALTY[card.value] ?? 0;
export const MAX_FLIPS = 20000; // games can (very rarely) loop; stop and count cards

export class Beggar {
  constructor({ players = 2, deck = shuffle(createDeck()) } = {}) {
    this.n = Math.max(2, Math.min(4, players));
    this.decks = Array.from({ length: this.n }, () => []);
    deck.forEach((c, i) => this.decks[i % this.n].push(c)); // index 0 is the top
    this.pile = [];
    this.turn = 0;
    this.debt = 0; // cards the player on turn still has to pay
    this.lastCourt = null; // who gets the pile if the debt is paid
    this.collector = null; // pile waiting to be collected by this seat
    this.winner = null;
    this.flips = 0;
    this.tricks = 0;
  }

  /** Seats that still have cards, in order after `from`. */
  nextWithCards(from) {
    for (let k = 1; k < this.n; k++) {
      const q = (from + k) % this.n;
      if (this.decks[q].length) return q;
    }
    return null;
  }

  get active() {
    return this.decks.map((d, i) => (d.length ? i : -1)).filter((i) => i >= 0);
  }

  /**
   * The player on turn flips their top card. Returns
   *   { seat, card, court?, paid?, collect? }  collect = seat that will take the pile
   * or null if it's not possible right now (waiting for collect(), or over).
   */
  flip() {
    if (this.winner !== null || this.collector !== null) return null;
    const p = this.turn;
    const card = this.decks[p].shift();
    if (!card) return null;
    this.pile.push(card);
    this.flips++;
    const out = { seat: p, card };
    const pen = penalty(card);
    if (pen) {
      this.lastCourt = p;
      out.court = pen;
      const q = this.nextWithCards(p);
      if (q === null) this.collector = p; // nobody left to pay
      else {
        this.turn = q;
        this.debt = pen;
      }
    } else if (this.debt > 0) {
      this.debt--;
      out.paid = true;
      if (this.debt === 0 || !this.decks[p].length) this.collector = this.lastCourt;
    } else {
      const q = this.nextWithCards(p);
      if (q === null) this.collector = p; // the last player with cards keeps the pile
      else this.turn = q;
    }
    if (this.collector !== null) out.collect = this.collector;
    if (this.flips >= MAX_FLIPS && this.collector === null) this.endByCount();
    return out;
  }

  /** The waiting collector takes the pile. Returns { seat, cards } or null. */
  collect() {
    const c = this.collector;
    if (c === null) return null;
    const cards = this.pile;
    this.decks[c].push(...cards);
    this.pile = [];
    this.debt = 0;
    this.lastCourt = null;
    this.collector = null;
    this.turn = c;
    this.tricks++;
    if (this.active.length === 1) this.winner = this.active[0];
    else if (this.flips >= MAX_FLIPS) this.endByCount();
    return { seat: c, cards };
  }

  endByCount() {
    const counts = this.decks.map((d) => d.length);
    this.winner = counts.indexOf(Math.max(...counts));
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    return {
      v: 1,
      n: this.n,
      decks: this.decks.map((d) => d.map((c) => c.id)),
      pile: this.pile.map((c) => c.id),
      turn: this.turn,
      debt: this.debt,
      lastCourt: this.lastCourt,
      collector: this.collector,
      winner: this.winner,
      flips: this.flips,
      tricks: this.tricks,
    };
  }

  static restore(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.decks)) return null;
    const byId = new Map(createDeck().map((c) => [c.id, c]));
    const seen = new Set();
    const card = (id) => {
      const c = byId.get(id);
      if (!c || seen.has(id)) throw new Error('bad save');
      seen.add(id);
      return c;
    };
    const g = new Beggar({ players: d.n });
    g.decks = d.decks.map((a) => a.map(card));
    g.pile = d.pile.map(card);
    if (seen.size !== 52) return null;
    Object.assign(g, { turn: d.turn, debt: d.debt, lastCourt: d.lastCourt, collector: d.collector, winner: d.winner, flips: d.flips, tricks: d.tricks });
    return g;
  }
}
