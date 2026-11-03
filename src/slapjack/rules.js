// Slapjack for 2–4 players. Pure state, no DOM, so it can be tested in Node;
// timing (who slaps first) is up to the caller.
//
// The deck is dealt out face down. In turn, players flip their top card onto
// the center pile. While a jack is on top, the first player to slap takes the
// whole pile (to the bottom of their pile) and flips next. Slapping any other
// card burns one of your cards face up under the pile. A player who runs out
// of cards may still slap the next jack to get back in; if someone else wins
// it (or they slap wrongly with no cards), they're out. The last player in
// wins (or, if a game runs too long, whoever holds the most cards).
import { createDeck, shuffle } from '../cards.js';

export const MAX_FLIPS = 3000;

export class Slapjack {
  constructor({ players = 2, deck = shuffle(createDeck()) } = {}) {
    this.n = Math.max(2, Math.min(4, players));
    this.decks = Array.from({ length: this.n }, () => []);
    deck.forEach((c, i) => this.decks[i % this.n].push(c)); // index 0 is the top
    this.pile = [];
    this.turn = 0;
    this.lastFlipper = null;
    this.out = new Set();
    this.flips = 0;
    this.winner = null;
  }

  get top() {
    return this.pile[this.pile.length - 1] ?? null;
  }

  /** A jack on top that nobody has slapped yet. */
  get jackUp() {
    return this.top?.value === 11;
  }

  inGame(p) {
    return !this.out.has(p);
  }

  /** Next player after p who still has cards to flip. */
  nextWithCards(p) {
    for (let k = 1; k <= this.n; k++) {
      const q = (p + k) % this.n;
      if (this.inGame(q) && this.decks[q].length) return q;
    }
    return null;
  }

  canFlip(p) {
    return this.winner === null && this.turn === p && !this.jackUp && this.decks[p].length > 0;
  }

  /** p flips their top card: { card, jack } or null. */
  flip(p) {
    if (!this.canFlip(p)) return null;
    const card = this.decks[p].shift();
    this.pile.push(card);
    this.lastFlipper = p;
    this.flips++;
    const next = this.nextWithCards(p);
    if (next !== null) this.turn = next;
    else if (card.value !== 11) {
      // Nobody has cards left to flip and there's no jack to fight over: the pile goes back.
      this.decks[p].push(...this.pile);
      this.pile = [];
      this.turn = p;
    }
    if (this.flips >= MAX_FLIPS && !this.jackUp) this.endByCount();
    return { card, jack: card.value === 11 };
  }

  /**
   * p slaps the pile. Returns
   *   { ok: true, cards }           took the pile (a jack was up)
   *   { ok: false, burned, out }    wrong slap: burned a card, or is out
   *   null                          nothing to slap / not in the game
   */
  slap(p) {
    if (this.winner !== null || !this.inGame(p) || !this.pile.length) return null;
    if (this.jackUp) {
      const cards = this.pile;
      this.decks[p].push(...cards);
      this.pile = [];
      this.turn = p;
      // Players at zero had their chance to slap back in.
      const knocked = [];
      for (let q = 0; q < this.n; q++) {
        if (q !== p && this.inGame(q) && !this.decks[q].length) {
          this.out.add(q);
          knocked.push(q);
        }
      }
      this.checkWinner();
      return { ok: true, cards, knocked };
    }
    if (!this.decks[p].length) {
      this.out.add(p);
      this.checkWinner();
      return { ok: false, out: true };
    }
    const burned = this.decks[p].shift();
    this.pile.unshift(burned);
    // Running out by burning leaves the player on their last chance.
    if (this.turn === p && !this.decks[p].length) this.turn = this.nextWithCards(p) ?? p;
    return { ok: false, burned };
  }

  checkWinner() {
    const left = [...Array(this.n).keys()].filter((q) => this.inGame(q));
    if (left.length === 1) this.winner = left[0];
  }

  endByCount() {
    const counts = this.decks.map((d) => d.length);
    this.winner = counts.indexOf(Math.max(...counts));
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return { v: 1, n: this.n, decks: this.decks.map(ids), pile: ids(this.pile), turn: this.turn, lastFlipper: this.lastFlipper, out: [...this.out], flips: this.flips, winner: this.winner };
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
    const g = new Slapjack({ players: d.n });
    g.decks = d.decks.map((a) => a.map(card));
    g.pile = d.pile.map(card);
    if (seen.size !== 52) return null;
    Object.assign(g, { turn: d.turn, lastFlipper: d.lastFlipper, out: new Set(d.out), flips: d.flips, winner: d.winner });
    return g;
  }
}
