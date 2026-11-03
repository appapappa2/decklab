// Shithead for 2–4 players. Pure state, no DOM, so it can be tested in Node.
//
// Each player gets 3 face-down table cards, 3 face-up cards on top of them and
// 3 in hand; before play, players may swap hand cards with their face-up ones.
// The player with the lowest ordinary card in hand starts. On your turn, play
// one or more cards of the same rank that are equal to or higher than the top
// of the pile (aces high), then draw back up to 3 while the deck lasts.
//   2  resets: it goes on anything, and anything goes on it.
//   10 burns the pile: it goes on anything, the pile is removed, play again.
//   Four of a kind in a row on the pile also burns it.
// If you can't play, pick up the whole pile. With your hand and the deck
// empty, play from your face-up cards, then blind from your face-down cards
// (an unplayable blind card is picked up with the pile). Players drop out as
// they run out of cards; the last one holding cards is the Shithead.
import { createDeck, shuffle } from '../cards.js';

export const power = (c) => (c.value === 1 ? 14 : c.value);
const isWild = (c) => c.value === 2 || c.value === 10;

export class Shithead {
  constructor({ players = 2, deck = shuffle(createDeck()) } = {}) {
    this.n = Math.max(2, Math.min(4, players));
    this.stock = deck.slice();
    this.hands = [];
    this.down = [];
    this.up = [];
    for (let p = 0; p < this.n; p++) {
      this.down.push([this.stock.pop(), this.stock.pop(), this.stock.pop()]);
      this.up.push([this.stock.pop(), this.stock.pop(), this.stock.pop()]);
      this.hands.push([this.stock.pop(), this.stock.pop(), this.stock.pop()]);
    }
    this.pile = [];
    this.burned = 0;
    this.ready = Array(this.n).fill(false);
    this.phase = 'swap'; // 'swap' -> 'play' -> 'over'
    this.turn = 0;
    this.finished = []; // seats in the order they went out
    this.loser = null;
    this.lastBurn = false;
  }

  // ---------------------------------------------------------------- queries

  get top() {
    return this.pile[this.pile.length - 1] ?? null;
  }

  /** Can `card` go on the pile right now? */
  canPlayCard(card) {
    const t = this.top;
    return !t || isWild(card) || t.value === 2 || power(card) >= power(t);
  }

  /** Where `p` plays from now: 'hand', 'up', 'down', or null when out. */
  source(p) {
    if (this.hands[p].length) return 'hand';
    if (this.up[p].some(Boolean)) return 'up';
    if (this.down[p].some(Boolean)) return 'down';
    return null;
  }

  cardsLeft(p) {
    return this.hands[p].length + this.up[p].filter(Boolean).length + this.down[p].filter(Boolean).length;
  }

  /** Playable cards from the current source (face-down cards are blind, so always "playable"). */
  playable(p) {
    const src = this.source(p);
    if (src === 'hand') return this.hands[p].filter((c) => this.canPlayCard(c));
    if (src === 'up') return this.up[p].filter((c) => c && this.canPlayCard(c));
    return [];
  }

  canPickUp(p) {
    const src = this.source(p);
    return this.phase === 'play' && this.turn === p && this.pile.length > 0 && src !== 'down' && !this.playable(p).length;
  }

  // ---------------------------------------------------------------- swapping

  swap(p, handId, upId) {
    if (this.phase !== 'swap' || this.ready[p]) return false;
    const hi = this.hands[p].findIndex((c) => c.id === handId);
    const ui = this.up[p].findIndex((c) => c && c.id === upId);
    if (hi < 0 || ui < 0) return false;
    [this.hands[p][hi], this.up[p][ui]] = [this.up[p][ui], this.hands[p][hi]];
    return true;
  }

  setReady(p) {
    if (this.phase !== 'swap') return false;
    this.ready[p] = true;
    if (this.ready.every(Boolean)) {
      this.phase = 'play';
      this.turn = this.starter();
    }
    return true;
  }

  /** The player holding the lowest ordinary card (not a 2 or 10) starts. */
  starter() {
    let best = 0;
    let low = Infinity;
    for (let p = 0; p < this.n; p++) {
      for (const c of this.hands[p]) {
        const v = isWild(c) ? 100 + power(c) : power(c);
        if (v < low) {
          low = v;
          best = p;
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- playing

  /** Plays cards of one rank from the hand or the face-up cards. */
  play(p, ids) {
    if (this.phase !== 'play' || this.turn !== p || !ids.length) return null;
    const src = this.source(p);
    if (src !== 'hand' && src !== 'up') return null;
    const from = src === 'hand' ? this.hands[p] : this.up[p];
    const cards = ids.map((id) => from.find((c) => c && c.id === id));
    if (cards.some((c) => !c) || new Set(ids).size !== ids.length) return null;
    if (new Set(cards.map((c) => c.value)).size !== 1 || !this.canPlayCard(cards[0])) return null;
    if (src === 'hand') this.hands[p] = this.hands[p].filter((c) => !cards.includes(c));
    else this.up[p] = this.up[p].map((c) => (cards.includes(c) ? null : c));
    this.pile.push(...cards);
    return this.afterPlay(p, cards);
  }

  /** Flips a face-down card: played if it can be, otherwise picked up with the pile. */
  playDown(p, slot) {
    if (this.phase !== 'play' || this.turn !== p || this.source(p) !== 'down') return null;
    const card = this.down[p][slot];
    if (!card) return null;
    this.down[p][slot] = null;
    if (this.canPlayCard(card)) {
      this.pile.push(card);
      return { ...this.afterPlay(p, [card]), blind: card, ok: true };
    }
    this.hands[p].push(card, ...this.pile.splice(0));
    this.lastBurn = false;
    this.nextTurn(p);
    return { blind: card, ok: false, pickedUp: true };
  }

  pickUp(p) {
    if (!this.canPickUp(p)) return null;
    const cards = this.pile.splice(0);
    this.hands[p].push(...cards);
    this.lastBurn = false;
    this.nextTurn(p);
    return { cards };
  }

  afterPlay(p, cards) {
    // Draw back up to 3.
    while (this.hands[p].length < 3 && this.stock.length) this.hands[p].push(this.stock.pop());
    // Burn: a 10, or the top four cards of one rank.
    const t = this.pile.length;
    const four = t >= 4 && this.pile.slice(t - 4).every((c) => c.value === this.pile[t - 1].value);
    const burn = cards[0].value === 10 || four;
    if (burn) {
      this.burned += this.pile.length;
      this.pile = [];
    }
    this.lastBurn = burn;
    const out = !this.cardsLeft(p);
    if (out) this.finished.push(p);
    if (this.checkOver()) return { cards, burn, out, over: true };
    if (burn && !out) return { cards, burn, out, again: true };
    this.nextTurn(p);
    return { cards, burn, out };
  }

  nextTurn(p) {
    for (let k = 1; k <= this.n; k++) {
      const q = (p + k) % this.n;
      if (!this.finished.includes(q)) {
        this.turn = q;
        return;
      }
    }
  }

  checkOver() {
    const left = [...Array(this.n).keys()].filter((q) => !this.finished.includes(q));
    if (left.length > 1) return false;
    this.loser = left[0] ?? null;
    this.phase = 'over';
    return true;
  }

  // -------------------------------------------------------------------- CPU

  /** Puts the strongest cards face up (2s and 10s first, then high cards). */
  cpuSwap(p) {
    const keep = (c) => (isWild(c) ? 100 + c.value : power(c));
    const all = [...this.hands[p], ...this.up[p]].sort((a, b) => keep(b) - keep(a));
    this.up[p] = all.slice(0, 3);
    this.hands[p] = all.slice(3);
    this.setReady(p);
  }

  /** The CPU's move: lowest ordinary playable rank (all copies), saving 2s and 10s. */
  cpuMove(p) {
    const src = this.source(p);
    if (src === 'down') {
      const slots = this.down[p].map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
      return { type: 'down', slot: slots[(Math.random() * slots.length) | 0] };
    }
    const opts = this.playable(p);
    if (!opts.length) return { type: 'pickup' };
    const plain = opts.filter((c) => !isWild(c));
    const pool = plain.length ? plain : opts;
    // With a big pile, a 10 is worth spending.
    const ten = opts.find((c) => c.value === 10);
    if (ten && this.pile.length >= 6) return { type: 'play', ids: [ten.id] };
    const low = pool.reduce((a, b) => (power(b) < power(a) ? b : a));
    return { type: 'play', ids: opts.filter((c) => c.value === low.value).map((c) => c.id) };
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => (c ? c.id : null));
    return {
      v: 1,
      n: this.n,
      stock: ids(this.stock),
      hands: this.hands.map(ids),
      up: this.up.map(ids),
      down: this.down.map(ids),
      pile: ids(this.pile),
      burned: this.burned,
      ready: this.ready,
      phase: this.phase,
      turn: this.turn,
      finished: this.finished,
      loser: this.loser,
    };
  }

  static restore(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.hands)) return null;
    const byId = new Map(createDeck().map((c) => [c.id, c]));
    const seen = new Set();
    const card = (id) => {
      if (id === null) return null;
      const c = byId.get(id);
      if (!c || seen.has(id)) throw new Error('bad save');
      seen.add(id);
      return c;
    };
    const g = new Shithead({ players: d.n });
    g.stock = d.stock.map(card);
    g.hands = d.hands.map((a) => a.map(card));
    g.up = d.up.map((a) => a.map(card));
    g.down = d.down.map((a) => a.map(card));
    g.pile = d.pile.map(card);
    g.burned = d.burned;
    if (seen.size + g.burned !== 52) return null;
    g.ready = d.ready;
    g.phase = d.phase;
    g.turn = d.turn;
    g.finished = d.finished;
    g.loser = d.loser;
    return g;
  }
}
