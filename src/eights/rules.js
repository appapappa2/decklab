// Crazy Eights rules for two players ('you' and 'cpu'). Pure state, no DOM,
// so it can be tested in Node.
//
// Each player gets 7 cards; one card starts the discard pile (an 8 there is
// buried in the stock and replaced). On your turn, play a card matching the
// top card's suit or rank. Eights are wild: play one any time and name the
// next suit. If you can't play, draw until you can. When the stock runs out,
// the discard pile (except its top card) is shuffled into a new stock; if
// there's still nothing to draw, you pass. First to empty their hand wins.
// If both players pass in a row the game is blocked and the smaller hand wins.
import { createDeck, shuffle, SUITS } from '../cards.js';

export const PLAYERS = ['you', 'cpu'];
export const HAND_SIZE = 7;
export const other = (p) => (p === 'you' ? 'cpu' : 'you');

export class CrazyEights {
  /** `deck` (top = end) is optional, for tests. */
  constructor(deck = shuffle(createDeck()), first = 'you') {
    this.stock = deck.slice();
    this.hands = { you: [], cpu: [] };
    for (let i = 0; i < HAND_SIZE; i++) for (const p of PLAYERS) this.hands[p].push(this.stock.pop());
    // Starter: bury eights in the middle of the stock.
    let starter = this.stock.pop();
    while (starter.value === 8) {
      this.stock.splice((Math.random() * this.stock.length) | 0, 0, starter);
      starter = this.stock.pop();
    }
    this.discard = [starter];
    this.suit = null; // suit named with an 8 (null = the top card's own suit)
    this.turn = first;
    this.choosing = false; // current player played an 8 and must name a suit
    this.passes = 0; // consecutive passes
    this.winner = null; // 'you' | 'cpu' | 'tie'
  }

  get top() {
    return this.discard[this.discard.length - 1];
  }

  get activeSuit() {
    return this.suit ?? this.top.suit.id;
  }

  canPlay(card) {
    if (this.winner) return false;
    return card.value === 8 || card.suit.id === this.activeSuit || card.value === this.top.value;
  }

  playable(p) {
    return this.hands[p].filter((c) => this.canPlay(c));
  }

  /** Can `p` draw right now? Only on their turn, with nothing to play. */
  canDraw(p) {
    return this.turn === p && !this.winner && !this.choosing && !this.playable(p).length;
  }

  // ---------------------------------------------------------------- actions

  /**
   * Plays a card. An 8 without `suit` leaves the turn open until chooseSuit().
   * Returns true if the play was legal.
   */
  play(p, cardId, suit) {
    if (this.turn !== p || this.choosing || this.winner) return false;
    const hand = this.hands[p];
    const i = hand.findIndex((c) => c.id === cardId);
    if (i < 0 || !this.canPlay(hand[i])) return false;
    const [card] = hand.splice(i, 1);
    this.discard.push(card);
    this.suit = null;
    this.passes = 0;
    if (card.value === 8) {
      if (suit) this.suit = suit;
      else if (!hand.length) {
        this.winner = p; // going out on an 8 needs no suit
        return true;
      } else {
        this.choosing = true;
        return true;
      }
    }
    this.endTurn();
    return true;
  }

  chooseSuit(p, suit) {
    if (!this.choosing || this.turn !== p || !SUITS.some((s) => s.id === suit)) return false;
    this.choosing = false;
    this.suit = suit;
    this.endTurn();
    return true;
  }

  /**
   * Draws one card for `p`. Returns { card, reshuffled } or, when nothing can
   * be drawn, { pass: true } after passing the turn. null if drawing isn't allowed.
   */
  draw(p) {
    if (!this.canDraw(p)) return null;
    let reshuffled = false;
    if (!this.stock.length && this.discard.length > 1) {
      const top = this.discard.pop();
      this.stock = shuffle(this.discard);
      this.discard = [top];
      reshuffled = true;
    }
    if (!this.stock.length) {
      this.passes++;
      if (this.passes >= 2) this.block();
      else this.turn = other(p);
      return { pass: true, reshuffled };
    }
    const card = this.stock.pop();
    this.hands[p].push(card);
    return { card, reshuffled };
  }

  endTurn() {
    const p = this.turn;
    if (!this.hands[p].length) {
      this.winner = p;
      return;
    }
    this.turn = other(p);
  }

  block() {
    const a = this.hands.you.length;
    const b = this.hands.cpu.length;
    this.winner = a === b ? 'tie' : a < b ? 'you' : 'cpu';
  }

  // -------------------------------------------------------------------- CPU

  /** The CPU's move: { type: 'play', card, suit? } or { type: 'draw' }. */
  cpuMove(p = 'cpu') {
    const hand = this.hands[p];
    const options = this.playable(p);
    if (!options.length) return { type: 'draw' };
    const count = (suit, without) => hand.filter((c) => c !== without && c.value !== 8 && c.suit.id === suit).length;
    const plain = options.filter((c) => c.value !== 8);
    if (plain.length) {
      // Keep options open: play into the suit we hold most of; dump high cards first.
      plain.sort((a, b) => count(b.suit.id, b) - count(a.suit.id, a) || b.value - a.value);
      return { type: 'play', card: plain[0] };
    }
    // Only eights: play one and name our strongest suit.
    const eight = options[0];
    return { type: 'play', card: eight, suit: this.bestSuit(p, eight) };
  }

  /** Suit `p` holds the most of (ignoring eights and `without`). */
  bestSuit(p, without) {
    let best = SUITS[0].id;
    let n = -1;
    for (const s of SUITS) {
      const k = this.hands[p].filter((c) => c !== without && c.value !== 8 && c.suit.id === s.id).length;
      if (k > n) {
        n = k;
        best = s.id;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return {
      v: 1,
      stock: ids(this.stock),
      discard: ids(this.discard),
      hands: { you: ids(this.hands.you), cpu: ids(this.hands.cpu) },
      suit: this.suit,
      turn: this.turn,
      choosing: this.choosing,
      passes: this.passes,
      winner: this.winner,
    };
  }

  static restore(data) {
    if (!data || data.v !== 1 || !data.hands) return null;
    const byId = new Map(createDeck().map((c) => [c.id, c]));
    const seen = new Set();
    const cards = (ids) => {
      if (!Array.isArray(ids)) throw new Error('bad save');
      return ids.map((id) => {
        const c = byId.get(id);
        if (!c || seen.has(id)) throw new Error('bad save');
        seen.add(id);
        return c;
      });
    };
    const g = new CrazyEights();
    g.stock = cards(data.stock);
    g.discard = cards(data.discard);
    g.hands = { you: cards(data.hands.you), cpu: cards(data.hands.cpu) };
    if (seen.size !== 52 || !g.discard.length) return null;
    g.suit = SUITS.some((s) => s.id === data.suit) ? data.suit : null;
    g.turn = PLAYERS.includes(data.turn) ? data.turn : 'you';
    g.choosing = !!data.choosing;
    g.passes = Number(data.passes) || 0;
    g.winner = [...PLAYERS, 'tie'].includes(data.winner) ? data.winner : null;
    return g;
  }
}
