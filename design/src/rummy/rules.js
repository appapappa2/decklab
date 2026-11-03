// Rummy 500 for 2–4 players. Pure state, no DOM, so it can be tested in Node.
//
// Deal 13 cards each with 2 players, 7 with 3–4; one card starts the discard
// pile, which is kept spread so every card is visible. On your turn:
//   1. Draw the top card of the stock, or take any card from the discard pile
//      together with every card above it. A card taken from below the top
//      must be used in a meld (or laid off) this turn, so it's only allowed
//      when that's possible. The top card alone may be taken freely, but not
//      discarded again the same turn.
//   2. Meld sets (3–4 of a rank) or runs (3+ in a suit; ace low A-2-3 or high
//      Q-K-A, no wrapping), and lay off cards onto any meld on the table.
//   3. Discard one card. Emptying your hand (by melding or discarding) goes out.
// The hand ends when someone goes out, or after a discard with the stock empty.
// Each player scores the cards they put on the table minus the cards left in
// their hand: aces 15 (5 when low in a run), 10s and faces 10, 2–9 count 5.
// First to the target (500) after a hand wins; the highest score wins.
import { createDeck, shuffle } from '../cards.js';

export const TARGET = 500;

export const cardPoints = (c) => (c.value === 1 ? 15 : c.value >= 10 ? 10 : 5);

/**
 * Checks a group of cards. Returns { type: 'set' | 'run', order, aceLow } or
 * null. `order` is the cards sorted for display (runs low to high).
 */
export function checkMeld(cards) {
  if (cards.length < 3) return null;
  const ranks = new Set(cards.map((c) => c.value));
  if (ranks.size === 1) {
    const suits = new Set(cards.map((c) => c.suit.id));
    if (cards.length > 4 || suits.size !== cards.length) return null;
    return { type: 'set', order: [...cards].sort((a, b) => a.suit.order - b.suit.order), aceLow: false };
  }
  if (new Set(cards.map((c) => c.suit.id)).size !== 1 || ranks.size !== cards.length) return null;
  for (const aceLow of [true, false]) {
    const v = (c) => (c.value === 1 ? (aceLow ? 1 : 14) : c.value);
    const order = [...cards].sort((a, b) => v(a) - v(b));
    if (order.every((c, i) => i === 0 || v(c) === v(order[i - 1]) + 1)) {
      return { type: 'run', order, aceLow: aceLow && order[0].value === 1 };
    }
  }
  return null;
}

/** Points a melded card is worth (an ace at the bottom of a low run is 5). */
function meldCardPoints(card, meld) {
  if (card.value === 1 && meld.type === 'run' && meld.aceLow) return 5;
  return cardPoints(card);
}

/** Every valid meld (as card arrays) that can be made from `cards`; longest first. */
export function findMelds(cards) {
  const out = [];
  // Sets
  const byRank = new Map();
  for (const c of cards) byRank.set(c.value, [...(byRank.get(c.value) ?? []), c]);
  for (const group of byRank.values()) {
    const uniq = [...new Map(group.map((c) => [c.suit.id, c])).values()];
    if (uniq.length >= 3) out.push(uniq.slice(0, 4));
  }
  // Runs (ace as 1 and as 14)
  const bySuit = new Map();
  for (const c of cards) bySuit.set(c.suit.id, [...(bySuit.get(c.suit.id) ?? []), c]);
  for (const group of bySuit.values()) {
    for (const aceLow of [true, false]) {
      const v = (c) => (c.value === 1 ? (aceLow ? 1 : 14) : c.value);
      const sorted = [...new Map(group.map((c) => [v(c), c])).values()].sort((a, b) => v(a) - v(b));
      let run = [];
      for (const c of sorted) {
        if (run.length && v(c) !== v(run[run.length - 1]) + 1) {
          if (run.length >= 3) out.push(run);
          run = [];
        }
        run.push(c);
      }
      if (run.length >= 3) out.push(run);
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

export class Rummy500 {
  constructor({ players = 2, target = TARGET, dealer = 0 } = {}) {
    this.n = Math.max(2, Math.min(4, players));
    this.target = target;
    this.scores = Array(this.n).fill(0);
    this.handNo = 0;
    this.dealer = dealer;
    this.winners = null;
    this.startHand();
  }

  startHand(deck = shuffle(createDeck())) {
    const per = this.n === 2 ? 13 : 7;
    this.stock = deck.slice();
    this.hands = Array.from({ length: this.n }, () => []);
    for (let i = 0; i < per; i++) for (let p = 0; p < this.n; p++) this.hands[(this.dealer + 1 + p) % this.n].push(this.stock.pop());
    this.discard = [this.stock.pop()];
    this.melds = []; // [{ id, type, aceLow, cards: [{ card, owner }] }]
    this.nextMeldId = 1;
    this.turn = (this.dealer + 1) % this.n;
    this.phase = 'draw'; // 'draw' -> 'play' -> next player's 'draw' | 'handOver' | 'gameOver'
    this.mustUse = null; // card id taken from below the top, not yet melded
    this.noDiscard = null; // the top card taken this turn
    this.lastHand = null;
  }

  // ---------------------------------------------------------------- queries

  get top() {
    return this.discard[this.discard.length - 1];
  }

  /** Can `card` be put on the table right now, using `pool` from the hand? */
  usable(card, pool) {
    if (findMelds([...pool, card]).some((m) => m.includes(card))) return true;
    return this.melds.some((m) => checkMeld([...m.cards.map((x) => x.card), card]));
  }

  canTake(p, index) {
    if (this.phase !== 'draw' || this.turn !== p || index < 0 || index >= this.discard.length) return false;
    if (index === this.discard.length - 1) return true;
    const above = this.discard.slice(index + 1);
    return this.usable(this.discard[index], [...this.hands[p], ...above]);
  }

  /** The meld that `cards` could be laid off onto, or null. */
  layOffTarget(cards) {
    if (!cards.length) return null;
    return this.melds.find((m) => checkMeld([...m.cards.map((x) => x.card), ...cards])) ?? null;
  }

  canDiscard(p, id) {
    if (this.phase !== 'play' || this.turn !== p || this.mustUse) return false;
    const hand = this.hands[p];
    if (!hand.some((c) => c.id === id)) return false;
    return id !== this.noDiscard || hand.length === 1;
  }

  /** Points on the table and in hand for each player so far this hand. */
  handTally() {
    const table = Array(this.n).fill(0);
    for (const m of this.melds) for (const { card, owner } of m.cards) table[owner] += meldCardPoints(card, m);
    const hand = this.hands.map((h) => h.reduce((s, c) => s + cardPoints(c), 0));
    return { table, hand };
  }

  // ---------------------------------------------------------------- actions

  drawStock(p) {
    if (this.phase !== 'draw' || this.turn !== p || !this.stock.length) return null;
    const card = this.stock.pop();
    this.hands[p].push(card);
    this.phase = 'play';
    return { card };
  }

  /** Takes discard[index] and everything above it. */
  take(p, index) {
    if (!this.canTake(p, index)) return null;
    const cards = this.discard.splice(index);
    this.hands[p].push(...cards);
    if (cards.length === 1) this.noDiscard = cards[0].id;
    else this.mustUse = cards[0].id;
    this.phase = 'play';
    return { cards };
  }

  meld(p, ids) {
    if (this.phase !== 'play' || this.turn !== p) return null;
    const cards = this.pick(p, ids);
    const check = cards && checkMeld(cards);
    if (!check) return null;
    const meld = { id: this.nextMeldId++, type: check.type, aceLow: check.aceLow, cards: check.order.map((card) => ({ card, owner: p })) };
    this.melds.push(meld);
    this.removeFromHand(p, cards);
    return { meld, out: this.afterTablePlay(p) };
  }

  layOff(p, ids) {
    if (this.phase !== 'play' || this.turn !== p) return null;
    const cards = this.pick(p, ids);
    const meld = cards && this.layOffTarget(cards);
    if (!meld) return null;
    const check = checkMeld([...meld.cards.map((x) => x.card), ...cards]);
    const owners = new Map(meld.cards.map((x) => [x.card, x.owner]));
    for (const c of cards) owners.set(c, p);
    meld.cards = check.order.map((card) => ({ card, owner: owners.get(card) }));
    meld.aceLow = check.aceLow;
    this.removeFromHand(p, cards);
    return { meld, out: this.afterTablePlay(p) };
  }

  discardCard(p, id) {
    if (!this.canDiscard(p, id)) return null;
    const card = this.hands[p].find((c) => c.id === id);
    this.removeFromHand(p, [card]);
    this.discard.push(card);
    this.noDiscard = null;
    if (!this.hands[p].length || !this.stock.length) return { card, hand: this.endHand() };
    this.turn = (p + 1) % this.n;
    this.phase = 'draw';
    return { card };
  }

  pick(p, ids) {
    const hand = this.hands[p];
    const cards = ids.map((id) => hand.find((c) => c.id === id));
    return cards.every(Boolean) && new Set(ids).size === ids.length ? cards : null;
  }

  removeFromHand(p, cards) {
    this.hands[p] = this.hands[p].filter((c) => !cards.includes(c));
    if (this.mustUse && cards.some((c) => c.id === this.mustUse)) this.mustUse = null;
  }

  /** After melding or laying off: an empty hand goes out. */
  afterTablePlay() {
    if (this.hands[this.turn].length) return null;
    return this.endHand();
  }

  endHand() {
    const { table, hand } = this.handTally();
    const delta = table.map((t, i) => t - hand[i]);
    this.scores = this.scores.map((s, i) => s + delta[i]);
    this.handNo++;
    this.lastHand = { table, hand, delta, scores: [...this.scores], outBy: this.hands.findIndex((h) => !h.length) };
    this.phase = 'handOver';
    this.mustUse = this.noDiscard = null;
    const best = Math.max(...this.scores);
    if (best >= this.target) {
      this.winners = this.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
      this.phase = 'gameOver';
    }
    return this.lastHand;
  }

  nextHand() {
    if (this.phase !== 'handOver') return false;
    this.dealer = (this.dealer + 1) % this.n;
    this.startHand();
    return true;
  }

  // -------------------------------------------------------------------- CPU

  /** Draw choice: the deepest discard (within 5) it can use right away, else the stock. */
  cpuDraw(p) {
    const d = this.discard;
    for (let i = Math.max(0, d.length - 5); i < d.length; i++) {
      if (!this.canTake(p, i)) continue;
      if (i === d.length - 1 && !this.usable(d[i], this.hands[p])) continue; // only take the top if it melds
      return { type: 'take', index: i };
    }
    return { type: 'stock' };
  }

  /** Next meld or lay-off for a CPU, or null when it's done putting cards down. */
  cpuAction(p) {
    const hand = this.hands[p];
    const must = this.mustUse && hand.find((c) => c.id === this.mustUse);
    const melds = findMelds(hand);
    if (must) {
      const m = melds.find((x) => x.includes(must));
      if (m) return { type: 'meld', ids: m.map((c) => c.id) };
      return { type: 'layoff', ids: [must.id] };
    }
    if (melds.length) return { type: 'meld', ids: melds[0].map((c) => c.id) };
    const off = hand.find((c) => this.layOffTarget([c]));
    if (off && hand.length > 1) return { type: 'layoff', ids: [off.id] };
    if (off && hand.length === 1) return { type: 'layoff', ids: [off.id] };
    return null;
  }

  /** The card a CPU discards: high points that don't pair with or sit next to anything. */
  cpuDiscard(p) {
    const hand = this.hands[p];
    const keep = (c) =>
      hand.filter((o) => o !== c && (o.value === c.value || (o.suit.id === c.suit.id && Math.abs(o.value - c.value) <= 2))).length;
    const options = hand.filter((c) => this.canDiscard(p, c.id));
    return options.sort((a, b) => keep(a) * 12 - cardPoints(a) - (keep(b) * 12 - cardPoints(b)))[0]?.id ?? null;
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return {
      v: 1,
      n: this.n,
      target: this.target,
      scores: this.scores,
      handNo: this.handNo,
      dealer: this.dealer,
      winners: this.winners,
      stock: ids(this.stock),
      discard: ids(this.discard),
      hands: this.hands.map(ids),
      melds: this.melds.map((m) => ({ id: m.id, type: m.type, aceLow: m.aceLow, cards: m.cards.map((x) => [x.card.id, x.owner]) })),
      nextMeldId: this.nextMeldId,
      turn: this.turn,
      phase: this.phase,
      mustUse: this.mustUse,
      noDiscard: this.noDiscard,
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
    const g = new Rummy500({ players: d.n, target: d.target });
    g.scores = d.scores.map(Number);
    g.handNo = d.handNo;
    g.dealer = d.dealer;
    g.winners = d.winners ?? null;
    g.stock = d.stock.map(card);
    g.discard = d.discard.map(card);
    g.hands = d.hands.map((h) => h.map(card));
    g.melds = d.melds.map((m) => ({ id: m.id, type: m.type, aceLow: m.aceLow, cards: m.cards.map(([id, owner]) => ({ card: card(id), owner })) }));
    if (seen.size !== 52) return null;
    g.nextMeldId = d.nextMeldId;
    g.turn = d.turn;
    g.phase = d.phase;
    g.mustUse = d.mustUse;
    g.noDiscard = d.noDiscard;
    g.lastHand = d.lastHand;
    return g;
  }
}
