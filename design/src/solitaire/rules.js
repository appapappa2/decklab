// Klondike rules. Pure state, no DOM, so it can be tested in Node.
//
// Piles are keyed: 'stock', 'waste', 'f0'..'f3' (foundations), 't0'..'t6'
// (tableau). Each pile is an array of cards, bottom -> top. A card is the deck
// card object ({ id, rank, value, suit }) plus an `up` flag.
import { createDeck, shuffle } from '../cards.js';

export const FOUNDATIONS = ['f0', 'f1', 'f2', 'f3'];
export const TABLEAU = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
export const PILES = ['stock', 'waste', ...FOUNDATIONS, ...TABLEAU];
const UNDO_LIMIT = 500;

const top = (pile) => pile[pile.length - 1];
const isRed = (card) => card.suit.red;

export class Klondike {
  constructor(drawCount = 1) {
    this.drawCount = drawCount === 3 ? 3 : 1;
    this.deal();
  }

  /** Deals a new game. `deck` (bottom -> top) is optional, for tests. */
  deal(deck = shuffle(createDeck())) {
    this.piles = Object.fromEntries(PILES.map((k) => [k, []]));
    const cards = deck.map((c) => ({ ...c, up: false }));
    // Deal row by row, like a real deal: one card to each remaining column.
    for (let row = 0; row < 7; row++) {
      for (let col = row; col < 7; col++) {
        const card = cards.pop();
        card.up = col === row;
        this.piles[TABLEAU[col]].push(card);
      }
    }
    this.piles.stock = cards; // the rest, face down
    this.history = [];
    this.moves = 0;
    this.dealOrder = TABLEAU.flatMap((_, row) => TABLEAU.slice(row).map((k) => this.piles[k][row]));
  }

  // ---------------------------------------------------------------- queries

  /** Can the cards from `index` to the end of pile `from` be picked up? */
  canPick(from, index) {
    const pile = this.piles[from];
    if (!pile || index < 0 || index >= pile.length) return false;
    if (from === 'stock') return false;
    if (from === 'waste' || from.startsWith('f')) return index === pile.length - 1;
    // Tableau: any face-up card, together with everything on top of it.
    if (!pile[index].up) return false;
    for (let i = index + 1; i < pile.length; i++) {
      const a = pile[i - 1];
      const b = pile[i];
      if (!b.up || b.value !== a.value - 1 || isRed(a) === isRed(b)) return false;
    }
    return true;
  }

  /** Can `cards` (a picked-up run, bottom first) be dropped on pile `to`? */
  canDrop(cards, to) {
    const lead = cards[0];
    const pile = this.piles[to];
    if (!lead || !pile) return false;
    const t = top(pile);
    if (to.startsWith('f')) {
      if (cards.length !== 1) return false;
      return t ? t.suit.id === lead.suit.id && lead.value === t.value + 1 : lead.value === 1;
    }
    if (to.startsWith('t')) {
      return t ? t.up && lead.value === t.value - 1 && isRed(lead) !== isRed(t) : lead.value === 13;
    }
    return false;
  }

  canMove(from, index, to) {
    return from !== to && this.canPick(from, index) && this.canDrop(this.piles[from].slice(index), to);
  }

  /**
   * Best destination for a tap on a card: foundation first, then a tableau
   * column with cards, then an empty column (never a pointless king shuffle).
   */
  autoTarget(from, index) {
    if (!this.canPick(from, index)) return null;
    const cards = this.piles[from].slice(index);
    if (cards.length === 1) {
      for (const f of FOUNDATIONS) if (from !== f && this.canDrop(cards, f)) return f;
    }
    let empty = null;
    for (const t of TABLEAU) {
      if (t === from || !this.canDrop(cards, t)) continue;
      if (this.piles[t].length) return t;
      empty ??= t;
    }
    // Moving a king that's already at the bottom of a column to another empty column does nothing.
    if (empty && from.startsWith('t') && index === 0) return null;
    return empty;
  }

  get won() {
    return FOUNDATIONS.every((f) => this.piles[f].length === 13);
  }

  /** Everything is face up and dealt out, so the rest is mechanical. */
  get canAutoFinish() {
    if (this.won || this.piles.stock.length || this.piles.waste.length) return false;
    return TABLEAU.every((t) => this.piles[t].every((c) => c.up));
  }

  /** The next card that auto-finish would send to a foundation. */
  nextFinishMove() {
    let best = null;
    for (const from of [...TABLEAU, 'waste']) {
      const pile = this.piles[from];
      const card = top(pile);
      if (!card) continue;
      const to = FOUNDATIONS.find((f) => this.canDrop([card], f));
      if (to && (!best || card.value < best.value)) best = { from, index: pile.length - 1, to, value: card.value };
    }
    return best;
  }

  // ---------------------------------------------------------------- actions

  /** Moves cards from `index` up in `from` onto `to`. Returns the moved cards or null. */
  move(from, index, to) {
    if (!this.canMove(from, index, to)) return null;
    this.snapshot();
    const cards = this.piles[from].splice(index);
    this.piles[to].push(...cards);
    const exposed = top(this.piles[from]);
    if (from.startsWith('t') && exposed && !exposed.up) exposed.up = true;
    this.moves++;
    return cards;
  }

  /** Taps the stock: draws 1 or 3 to the waste, or recycles the waste when empty. */
  draw() {
    const { stock, waste } = this.piles;
    if (!stock.length && !waste.length) return null;
    this.snapshot();
    if (!stock.length) {
      while (waste.length) {
        const c = waste.pop();
        c.up = false;
        stock.push(c);
      }
      this.moves++;
      return 'recycle';
    }
    for (let i = 0; i < this.drawCount && stock.length; i++) {
      const c = stock.pop();
      c.up = true;
      waste.push(c);
    }
    this.moves++;
    return 'draw';
  }

  snapshot() {
    this.history.push({
      moves: this.moves,
      piles: PILES.map((k) => this.piles[k].map((c) => [c, c.up])),
    });
    if (this.history.length > UNDO_LIMIT) this.history.shift();
  }

  undo() {
    const s = this.history.pop();
    if (!s) return false;
    this.moves = s.moves;
    PILES.forEach((k, i) => {
      this.piles[k] = s.piles[i].map(([c, up]) => {
        c.up = up;
        return c;
      });
    });
    return true;
  }

  // ------------------------------------------------------------ persistence

  /** Compact JSON-able state (undo history isn't saved). */
  serialize() {
    return {
      v: 1,
      drawCount: this.drawCount,
      moves: this.moves,
      piles: Object.fromEntries(PILES.map((k) => [k, this.piles[k].map((c) => (c.up ? '+' : '-') + c.id)])),
    };
  }

  static restore(data) {
    if (!data || data.v !== 1 || !data.piles) return null;
    const byId = new Map(createDeck().map((c) => [c.id, c]));
    const game = new Klondike(data.drawCount);
    const seen = new Set();
    for (const k of PILES) {
      const ids = data.piles[k];
      if (!Array.isArray(ids)) return null;
      game.piles[k] = ids.map((s) => {
        const card = byId.get(String(s).slice(1));
        if (!card || seen.has(card.id)) throw new Error('bad save');
        seen.add(card.id);
        return { ...card, up: s[0] === '+' };
      });
    }
    if (seen.size !== 52) return null;
    game.moves = Number(data.moves) || 0;
    game.history = [];
    game.dealOrder = [];
    return game;
  }
}
