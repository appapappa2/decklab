// Speed (also called Stress), two players in real time. Pure state, no DOM,
// so it can be tested in Node. Seats: 0 = you, 1 = CPU.
//
// Each player gets a 15-card draw pile and a 5-card hand. Two side piles of 5
// sit face down next to two center piles, which start with one card each.
// There are no turns: anyone may play a card from their hand onto a center
// pile when it is one rank up or down from the top card (wrapping, so K-A-2
// all connect). Hands refill to 5 from the player's own draw pile. When
// neither player can play, the side piles each flip a card onto the centers;
// when the side piles are empty, the center piles (except their top cards)
// are shuffled into new side piles. First to empty hand and draw pile wins.
import { createDeck, shuffle } from '../cards.js';

export const HAND = 5;

/** One rank up or down, ace to king wrapping. */
export const fits = (card, top) => {
  const d = Math.abs(card.value - top.value);
  return d === 1 || d === 12;
};

export class Speed {
  constructor(deck = shuffle(createDeck())) {
    const d = deck.slice();
    this.stocks = [d.splice(0, 15), d.splice(0, 15)];
    this.hands = [d.splice(0, HAND), d.splice(0, HAND)];
    this.sides = [d.splice(0, 5), d.splice(0, 5)];
    this.centers = [[d.pop()], [d.pop()]];
    this.winner = null;
    this.flips = 0;
    this.reshuffles = 0;
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
    const drawn = [];
    while (this.hands[p].length < HAND && this.stocks[p].length) {
      const c = this.stocks[p].pop();
      this.hands[p].push(c);
      drawn.push(c);
    }
    if (!this.cardsLeft(p)) this.winner = p;
    return { card, pile, drawn, won: this.winner === p };
  }

  /**
   * Nobody can play: flip a side card onto each center. With the side piles
   * empty, the center piles (minus their tops) are shuffled into new side
   * piles first. Returns { reshuffled } or null if it isn't stuck.
   */
  flip() {
    if (!this.stuck) return null;
    let reshuffled = false;
    if (!this.sides[0].length && !this.sides[1].length) {
      const pool = shuffle(this.centers.flatMap((c) => c.slice(0, -1)));
      this.centers = this.centers.map((c) => c.slice(-1));
      const half = Math.ceil(pool.length / 2);
      this.sides = [pool.slice(0, half), pool.slice(half)];
      this.reshuffles++;
      reshuffled = true;
      if (!pool.length) {
        // Nothing left to flip: fewest cards wins (a tie goes to you).
        this.winner = this.cardsLeft(0) <= this.cardsLeft(1) ? 0 : 1;
        return { reshuffled, ended: true };
      }
    }
    for (const i of [0, 1]) {
      const c = this.sides[i].pop() ?? this.sides[1 - i].pop();
      if (c) this.centers[i].push(c);
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
