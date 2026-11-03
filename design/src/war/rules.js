// War rules. Pure state, no DOM, so it can be tested in Node.
//
// Two players, 'you' and 'cpu'. Each deck draws from the front (index 0) and
// winnings go to the back, shuffled so games can't loop forever.
// A round: both flip one card; the higher rank (aces high) takes the table.
// On a tie it's war: both put 3 face down and 1 face up, and the new face-up
// cards decide (repeating on another tie). A player short on cards plays what
// they have, with the last one face up. Running out entirely loses the game.
import { createDeck, shuffle } from '../cards.js';

export const PLAYERS = ['you', 'cpu'];
export const WAR_DOWN = 3;
const other = (p) => (p === 'you' ? 'cpu' : 'you');
const power = (card) => (card.value === 1 ? 14 : card.value); // aces high

export class War {
  constructor(deck = shuffle(createDeck())) {
    this.decks = { you: [], cpu: [] };
    deck.forEach((c, i) => this.decks[PLAYERS[i % 2]].push({ ...c, up: false }));
    this.table = { you: [], cpu: [] }; // bottom -> top; the last face-up card is the one in play
    this.atWar = false; // the next play() is a war placement
    this.rounds = 0;
    this.wars = 0;
    this.winner = null; // game winner
    this.result = null; // last play(): { type: 'battle'|'war'|'over', winner? }
  }

  /** Card in play for a player (their newest face-up card on the table). */
  inPlay(p) {
    const t = this.table[p];
    for (let i = t.length - 1; i >= 0; i--) if (t[i].up) return t[i];
    return null;
  }

  get tableEmpty() {
    return !this.table.you.length && !this.table.cpu.length;
  }

  /** Is the table waiting for collect()? */
  get awaitingCollect() {
    return !!this.result && this.result.type !== 'war' && !this.tableEmpty;
  }

  /**
   * Both players put cards down: one face up for a battle, or the war
   * placement after a tie. Returns the result:
   *   { type: 'battle', winner }  -> call collect()
   *   { type: 'war' }             -> call play() again for the war
   *   { type: 'over', winner }    -> someone couldn't play; collect() ends it
   */
  play() {
    if (this.winner || this.awaitingCollect) return null;
    if (!this.atWar) this.rounds++;
    for (const p of PLAYERS) {
      const deck = this.decks[p];
      if (!deck.length) {
        // Out of cards. Mid-war this means losing; nothing to put down.
        return (this.result = { type: 'over', winner: other(p) });
      }
      const n = this.atWar ? Math.min(WAR_DOWN + 1, deck.length) : 1;
      const cards = deck.splice(0, n);
      cards.forEach((c, i) => (c.up = i === n - 1));
      this.table[p].push(...cards);
    }
    const a = power(this.inPlay('you'));
    const b = power(this.inPlay('cpu'));
    if (a !== b) {
      this.atWar = false;
      return (this.result = { type: 'battle', winner: a > b ? 'you' : 'cpu' });
    }
    // Tie. If someone has nothing left to fight the war with, they lose.
    const broke = PLAYERS.find((p) => !this.decks[p].length);
    if (broke) {
      this.atWar = false;
      return (this.result = { type: 'over', winner: other(broke) });
    }
    this.atWar = true;
    this.wars++;
    return (this.result = { type: 'war' });
  }

  /** Winner of the last result takes the table. Returns the cards taken. */
  collect() {
    const r = this.result;
    if (!r || r.type === 'war') return null;
    const won = shuffle([...this.table.you, ...this.table.cpu]);
    won.forEach((c) => (c.up = false));
    this.decks[r.winner].push(...won);
    this.table = { you: [], cpu: [] };
    this.result = null;
    if (r.type === 'over' || !this.decks[other(r.winner)].length) this.winner = r.winner;
    return won;
  }

  // ------------------------------------------------------------ persistence

  /** Saved only between rounds (table empty); returns null mid-round. */
  serialize() {
    if (!this.tableEmpty) return null;
    return {
      v: 1,
      decks: { you: this.decks.you.map((c) => c.id), cpu: this.decks.cpu.map((c) => c.id) },
      rounds: this.rounds,
      wars: this.wars,
      winner: this.winner,
    };
  }

  static restore(data) {
    if (!data || data.v !== 1 || !data.decks) return null;
    const byId = new Map(createDeck().map((c) => [c.id, c]));
    const g = new War();
    const seen = new Set();
    for (const p of PLAYERS) {
      const ids = data.decks[p];
      if (!Array.isArray(ids)) return null;
      g.decks[p] = [];
      for (const id of ids) {
        const c = byId.get(id);
        if (!c || seen.has(id)) return null;
        seen.add(id);
        g.decks[p].push({ ...c, up: false });
      }
    }
    if (seen.size !== 52) return null;
    g.rounds = Number(data.rounds) || 0;
    g.wars = Number(data.wars) || 0;
    g.winner = PLAYERS.includes(data.winner) ? data.winner : null;
    return g;
  }
}
