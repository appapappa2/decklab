// Go Fish for two players ('you' and 'cpu'). Pure state, no DOM, so it can be
// tested in Node.
//
// 7 cards each; the rest is the pond. On your turn, ask the other player for
// a rank you hold. If they have any, they hand them all over and you go
// again. If not, go fish: draw one card, and if it's the rank you asked for,
// you go again; otherwise the turn passes. Four of a rank is a book, laid down
// at once. A player whose hand is empty draws a card from the pond; with an
// empty pond they sit out. When all 13 books are down, most books wins.
import { createDeck, shuffle } from '../cards.js';

export const PLAYERS = ['you', 'cpu'];
export const HAND_SIZE = 7;
export const other = (p) => (p === 'you' ? 'cpu' : 'you');

export class GoFish {
  /** `deck` (top = end) is optional, for tests. */
  constructor(deck = shuffle(createDeck()), first = 'you') {
    this.stock = deck.slice();
    this.hands = { you: [], cpu: [] };
    for (let i = 0; i < HAND_SIZE; i++) for (const p of PLAYERS) this.hands[p].push(this.stock.pop());
    this.books = { you: [], cpu: [] }; // ranks, in the order they were made
    this.turn = first;
    this.winner = null;
    // CPU memory: ranks the player has asked for (so the player holds them).
    this.memory = new Set();
    // Books dealt straight away (rare) and an empty-handed start are handled up front.
    this.dealEvents = [];
    for (const p of PLAYERS) this.collectBooks(p, this.dealEvents);
    this.settle(this.dealEvents);
  }

  ranks(p) {
    return [...new Set(this.hands[p].map((c) => c.rank))];
  }

  canAsk(p, rank) {
    return !this.winner && this.turn === p && this.hands[p].some((c) => c.rank === rank);
  }

  /**
   * `p` asks the other player for `rank`. Returns the events, in order:
   *   { type: 'ask', p, rank }
   *   { type: 'give', from, to, cards }          the other player had some
   *   { type: 'fish', p, card, match }           go fish (match = got the rank asked for)
   *   { type: 'book', p, rank, cards }           four of a kind laid down
   *   { type: 'refill', p, card }                empty hand drew a card
   *   { type: 'skip', p }                        empty hand, empty pond: turn skipped
   *   { type: 'turn', p, again }                 whose turn it is now
   *   { type: 'over', winner }
   * or null if the ask isn't allowed.
   */
  ask(p, rank) {
    if (!this.canAsk(p, rank)) return null;
    const q = other(p);
    const events = [{ type: 'ask', p, rank }];
    if (p === 'you') this.memory.add(rank);
    const given = this.hands[q].filter((c) => c.rank === rank);
    let again;
    if (given.length) {
      this.hands[q] = this.hands[q].filter((c) => c.rank !== rank);
      this.hands[p].push(...given);
      events.push({ type: 'give', from: q, to: p, cards: given });
      if (p === 'cpu') this.memory.delete(rank);
      again = true;
    } else {
      if (p === 'cpu') this.memory.delete(rank); // the player said "go fish", so they don't have it
      const card = this.stock.pop();
      if (card) {
        this.hands[p].push(card);
        events.push({ type: 'fish', p, card, match: card.rank === rank });
        again = card.rank === rank;
      } else {
        events.push({ type: 'fish', p, card: null, match: false });
        again = false;
      }
    }
    this.collectBooks(p, events);
    if (!again) this.turn = q;
    this.settle(events);
    if (!this.winner) events.push({ type: 'turn', p: this.turn, again: this.turn === p });
    return events;
  }

  /** Lays down any books in `p`'s hand. */
  collectBooks(p, events) {
    const counts = {};
    for (const c of this.hands[p]) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
    for (const [rank, n] of Object.entries(counts)) {
      if (n < 4) continue;
      const cards = this.hands[p].filter((c) => c.rank === rank);
      this.hands[p] = this.hands[p].filter((c) => c.rank !== rank);
      this.books[p].push(rank);
      if (p === 'cpu') this.memory.delete(rank);
      events.push({ type: 'book', p, rank, cards });
    }
  }

  /** Refills empty hands, skips players who can't play, and detects the end. */
  settle(events) {
    for (let guard = 0; guard < 4; guard++) {
      if (this.books.you.length + this.books.cpu.length === 13) {
        this.winner = this.books.you.length > this.books.cpu.length ? 'you' : 'cpu';
        events.push({ type: 'over', winner: this.winner });
        return;
      }
      const p = this.turn;
      if (this.hands[p].length) return;
      const card = this.stock.pop();
      if (card) {
        this.hands[p].push(card);
        events.push({ type: 'refill', p, card });
        this.collectBooks(p, events); // can't complete a book from one card, but stay safe
        return;
      }
      events.push({ type: 'skip', p });
      this.turn = other(p);
    }
  }

  // -------------------------------------------------------------------- CPU

  /** Rank the CPU asks for: one it knows you have, else the one it holds most of. */
  cpuChoice(p = 'cpu') {
    const hand = this.hands[p];
    if (!hand.length) return null;
    const count = (r) => hand.filter((c) => c.rank === r).length;
    const ranks = this.ranks(p);
    const known = ranks.filter((r) => this.memory.has(r));
    const pool = known.length ? known : ranks;
    const best = Math.max(...pool.map(count));
    const top = pool.filter((r) => count(r) === best);
    return top[(Math.random() * top.length) | 0];
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return {
      v: 1,
      stock: ids(this.stock),
      hands: { you: ids(this.hands.you), cpu: ids(this.hands.cpu) },
      books: { you: [...this.books.you], cpu: [...this.books.cpu] },
      turn: this.turn,
      winner: this.winner,
      memory: [...this.memory],
    };
  }

  static restore(data) {
    if (!data || data.v !== 1 || !data.hands || !data.books) return null;
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
    const g = new GoFish();
    g.stock = cards(data.stock);
    g.hands = { you: cards(data.hands.you), cpu: cards(data.hands.cpu) };
    g.books = { you: [], cpu: [] };
    for (const p of PLAYERS) {
      for (const rank of data.books[p] ?? []) {
        const four = [...byId.values()].filter((c) => c.rank === rank);
        if (four.length !== 4 || four.some((c) => seen.has(c.id))) return null;
        four.forEach((c) => seen.add(c.id));
        g.books[p].push(rank);
      }
    }
    if (seen.size !== 52) return null;
    g.turn = PLAYERS.includes(data.turn) ? data.turn : 'you';
    g.winner = PLAYERS.includes(data.winner) ? data.winner : null;
    g.memory = new Set(Array.isArray(data.memory) ? data.memory : []);
    g.dealEvents = [];
    return g;
  }
}
