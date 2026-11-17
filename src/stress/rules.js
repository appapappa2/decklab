// Stress, two players in real time. Pure state, no DOM, so it can be tested in
// Node. Seats: 0 = you, 1 = CPU. It has the same shape as Speed's rules
// (speed/rules.js), so the same table can run both.
//
// The deck is split in two. Each player lays four cards face up in front of
// them and keeps the rest as a face-down draw pile. To start, and whenever
// nobody can play, both players flip the top of their draw pile onto their own
// center pile. There are no turns: anyone may play one of their four cards onto
// either center pile when it is one rank up or down from the top card
// (wrapping, so K-A-2 all connect), and then refills to four from their draw
// pile. When the two center piles show the same rank, the first to call
// "Stress!" makes the other player take both piles into their draw pile.
// First to get rid of every card wins.
//
// Left out on purpose: stacking equal ranks on your own four cards.
import { createDeck, shuffle } from '../cards.js';
import { fits } from '../speed/rules.js';

export const HAND = 4;

export class Stress {
  constructor(deck = shuffle(createDeck())) {
    const d = deck.slice();
    const half = d.length >> 1;
    this.stocks = [d.slice(0, half), d.slice(half)];
    this.hands = [[], []];
    this.sides = [[], []]; // Speed has side piles; Stress doesn't
    this.centers = [[], []];
    this.winner = null;
    this.flips = 0;
    this.reshuffles = 0;
    this.refill(0);
    this.refill(1);
  }

  /** Tops a player's four cards up from their draw pile. Returns the cards drawn. */
  refill(p) {
    const drawn = [];
    while (this.hands[p].length < HAND && this.stocks[p].length) {
      const c = this.stocks[p].pop();
      this.hands[p].push(c);
      drawn.push(c);
    }
    return drawn;
  }

  top(i) {
    const c = this.centers[i];
    return c[c.length - 1];
  }

  /** Center piles `card` can go on. */
  targets(card) {
    return [0, 1].filter((i) => fits(card, this.top(i)));
  }

  /** Every legal move for player p: [{ id, pile }]. */
  moves(p) {
    const out = [];
    for (const c of this.hands[p]) for (const i of this.targets(c)) out.push({ id: c.id, pile: i });
    return out;
  }

  get stuck() {
    return this.winner === null && !this.moves(0).length && !this.moves(1).length;
  }

  /** Both center piles show the same rank: time to call Stress. */
  get match() {
    const a = this.top(0);
    const b = this.top(1);
    return this.winner === null && !!a && !!b && a.value === b.value;
  }

  cardsLeft(p) {
    return this.hands[p].length + this.stocks[p].length;
  }

  /** Plays a card; returns { card, pile, drawn, won } or null if it doesn't fit. */
  play(p, id, pile) {
    if (this.winner !== null) return null;
    const card = this.hands[p].find((c) => c.id === id);
    if (!card || !fits(card, this.top(pile))) return null;
    this.hands[p] = this.hands[p].filter((c) => c !== card);
    this.centers[pile].push(card);
    const drawn = this.refill(p);
    if (!this.cardsLeft(p)) this.winner = p;
    return { card, pile, drawn, won: this.winner === p };
  }

  /**
   * Player p calls Stress. If the piles match, the other player takes both
   * (shuffled, under their draw pile). Returns { loser, taken } or null.
   */
  call(p) {
    if (!this.match) return null;
    const loser = 1 - p;
    const taken = shuffle(this.centers.flat());
    this.centers = [[], []];
    this.stocks[loser] = [...taken, ...this.stocks[loser]];
    this.refill(loser);
    return { loser, taken };
  }

  /**
   * Nobody can play: each player flips the top of their draw pile onto their
   * own center pile. With both draw piles empty, the center piles are shuffled
   * and dealt back as new draw piles first. Returns { reshuffled } or null if
   * it isn't stuck.
   */
  flip() {
    if (!this.stuck) return null;
    let reshuffled = false;
    if (!this.stocks[0].length && !this.stocks[1].length) {
      const pool = shuffle(this.centers.flat());
      this.centers = [[], []];
      if (!pool.length) {
        // Nothing left to flip: fewest cards wins (a tie goes to you).
        this.winner = this.cardsLeft(0) <= this.cardsLeft(1) ? 0 : 1;
        return { reshuffled: true, ended: true };
      }
      const half = Math.ceil(pool.length / 2);
      this.stocks = [pool.slice(0, half), pool.slice(half)];
      this.reshuffles++;
      reshuffled = true;
    }
    for (const p of [0, 1]) {
      const c = this.stocks[p].pop();
      if (c) this.centers[p].push(c);
      this.refill(p);
    }
    this.flips++;
    return { reshuffled };
  }

  /** The CPU's move: prefer cards that leave it another play, otherwise any. */
  cpuMove(p = 1) {
    const moves = this.moves(p);
    if (!moves.length) return null;
    const hand = this.hands[p];
    const chain = moves.find((m) => {
      const card = hand.find((c) => c.id === m.id);
      return hand.some((o) => o !== card && fits(o, card));
    });
    return chain ?? moves[(Math.random() * moves.length) | 0];
  }
}
