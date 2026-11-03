// Casino for two players. Pure state, no DOM, so it can be tested in Node.
//
// The dealer gives 4 cards to each player and 4 to the table, then 4 more each
// whenever both hands are empty, until the deck runs out. The non-dealer
// starts. On your turn play one card:
//   capture  take table items that match it: loose cards of the same rank,
//            groups of loose cards that add up to its value (A = 1, 2–10 at
//            face value; J, Q, K only capture their own rank), and builds of
//            its value. Clearing the table is a sweep (not on the last play).
//   build    put it together with loose cards (and/or one build) into a new
//            build of a total up to 10 that you hold another card for. You
//            then own the build; the other player may capture it, or raise it
//            to a new total they hold a card for.
//   trail    lay it on the table. Not allowed while you own a build, and you
//            can't use up the card you're saving for your build any other way.
// When the deck and hands are empty, the last player to capture takes what's
// left on the table. Points per round: most cards 3, most spades 1, 10♦ 2,
// 2♠ 1, each ace 1, each sweep 1. First to 21 wins (more points if both are).
import { createDeck, shuffle } from '../cards.js';

export const TARGET = 21;
export const val = (c) => (c.value <= 10 ? c.value : null); // face cards have no sum value
const isFace = (c) => c.value > 10;

export class Casino {
  constructor({ dealer = 0, target = TARGET } = {}) {
    this.target = target;
    this.scores = [0, 0];
    this.dealer = dealer;
    this.round = 0;
    this.winner = null;
    this.startRound();
  }

  startRound(deck = shuffle(createDeck())) {
    this.stock = deck.slice();
    this.hands = [[], []];
    this.table = []; // items: { kind: 'card', card } | { kind: 'build', cards, value, owner, id }
    this.captured = [[], []];
    this.sweeps = [0, 0];
    this.lastCapturer = null;
    this.nextBuildId = 1;
    this.deal(true);
    this.turn = 1 - this.dealer;
    this.phase = 'play'; // 'play' -> 'roundOver' | 'over'
    this.lastRound = null;
  }

  deal(withTable) {
    for (let i = 0; i < 4; i++) {
      for (const p of [1 - this.dealer, this.dealer]) this.hands[p].push(this.stock.pop());
      if (withTable) this.table.push({ kind: 'card', card: this.stock.pop() });
    }
  }

  // ---------------------------------------------------------------- queries

  /** Builds owned by p. */
  owned(p) {
    return this.table.filter((t) => t.kind === 'build' && t.owner === p);
  }

  /** Is it the very last card of the round? (no sweep for it) */
  get lastPlay() {
    return !this.stock.length && this.hands[0].length + this.hands[1].length === 1;
  }

  /**
   * Checks a capture: `items` (table items) all taken by `card`. Every item
   * must be a match on its own (same-rank card, build of the card's value) or
   * part of a group of loose number cards summing to the card's value.
   */
  validCapture(card, items) {
    if (!items.length) return false;
    const v = val(card);
    const rest = [];
    for (const it of items) {
      if (it.kind === 'build') {
        if (it.value !== v) return false;
      } else if (it.card.value === card.value) {
        /* matching rank */
      } else if (v && !isFace(it.card)) rest.push(val(it.card));
      else return false;
    }
    return partition(rest, v);
  }

  /** The biggest capture `card` can make: every match plus the most loose cards in groups. */
  bestCapture(card) {
    const v = val(card);
    const take = [];
    const loose = [];
    for (const it of this.table) {
      if (it.kind === 'build') {
        if (it.value === v) take.push(it);
      } else if (it.card.value === card.value) take.push(it);
      else if (v && !isFace(it.card) && val(it.card) < v) loose.push(it);
    }
    if (v && loose.length) take.push(...bestGroups(loose, v));
    return take;
  }

  /** Card values p still holds, minus `except`. */
  holds(p, value, except) {
    return this.hands[p].some((c) => c !== except && val(c) === value);
  }

  /**
   * Would this play leave p without the card they're saving for a build?
   * (Their last card of a build's value may only be used to capture it.)
   */
  breaksOwnBuild(p, card, captured = []) {
    for (const b of this.owned(p)) {
      if (val(card) === b.value && !this.holds(p, b.value, card) && !captured.includes(b)) return true;
    }
    return false;
  }

  /** The value a build would get, or null if it isn't a legal build for p. */
  buildValue(p, card, items) {
    if (!items.length || isFace(card)) return null;
    const builds = items.filter((t) => t.kind === 'build');
    if (builds.length > 1) return null;
    if (items.some((t) => t.kind === 'card' && isFace(t.card))) return null;
    const total = val(card) + items.reduce((a, t) => a + (t.kind === 'build' ? t.value : val(t.card)), 0);
    if (total > 10) return null;
    if (!this.holds(p, total, card)) return null;
    const old = builds[0];
    if (old) {
      if (old.owner === p && old.value === total) return null;
      if (total <= old.value) return null; // raising only
    }
    // Don't strand another build of your own.
    if (this.owned(p).some((b) => b !== old && b.value !== total && val(card) === b.value && !this.holds(p, b.value, card))) return null;
    return total;
  }

  canTrail(p, card) {
    return !this.owned(p).length && !this.breaksOwnBuild(p, card);
  }

  // ---------------------------------------------------------------- actions

  item(id) {
    return this.table.find((t) => itemId(t) === id);
  }

  /** p captures `itemIds` with card `cardId`. Returns { card, items, sweep, round? } or null. */
  capture(p, cardId, itemIds) {
    if (this.phase !== 'play' || this.turn !== p) return null;
    const card = this.hands[p].find((c) => c.id === cardId);
    const items = itemIds.map((id) => this.item(id));
    if (!card || items.some((t) => !t) || !this.validCapture(card, items)) return null;
    if (this.breaksOwnBuild(p, card, items)) return null;
    const last = this.lastPlay;
    this.hands[p] = this.hands[p].filter((c) => c !== card);
    this.table = this.table.filter((t) => !items.includes(t));
    this.captured[p].push(card, ...items.flatMap(cardsOf));
    this.lastCapturer = p;
    const sweep = !this.table.length && !last;
    if (sweep) this.sweeps[p]++;
    return { card, items, sweep, ...this.endTurn(p) };
  }

  build(p, cardId, itemIds) {
    if (this.phase !== 'play' || this.turn !== p) return null;
    const card = this.hands[p].find((c) => c.id === cardId);
    const items = itemIds.map((id) => this.item(id));
    if (!card || items.some((t) => !t)) return null;
    const value = this.buildValue(p, card, items);
    if (value === null) return null;
    this.hands[p] = this.hands[p].filter((c) => c !== card);
    this.table = this.table.filter((t) => !items.includes(t));
    const build = { kind: 'build', id: `b${this.nextBuildId++}`, value, owner: p, cards: [...items.flatMap(cardsOf), card] };
    this.table.push(build);
    return { card, build, ...this.endTurn(p) };
  }

  trail(p, cardId) {
    if (this.phase !== 'play' || this.turn !== p) return null;
    const card = this.hands[p].find((c) => c.id === cardId);
    if (!card || !this.canTrail(p, card)) return null;
    this.hands[p] = this.hands[p].filter((c) => c !== card);
    this.table.push({ kind: 'card', card });
    return { card, ...this.endTurn(p) };
  }

  /** Passes the turn, deals again or ends the round. */
  endTurn(p) {
    this.turn = 1 - p;
    if (this.hands[0].length || this.hands[1].length) return {};
    if (this.stock.length) {
      this.deal(false);
      this.turn = 1 - this.dealer;
      return { dealt: true };
    }
    // Round over: the last capturer takes the rest.
    const rest = this.table.flatMap(cardsOf);
    if (this.lastCapturer !== null) this.captured[this.lastCapturer].push(...rest);
    this.table = [];
    return { round: this.scoreRound(rest) };
  }

  scoreRound(rest) {
    const rows = [0, 1].map((p) => {
      const cards = this.captured[p];
      return {
        cards: cards.length,
        spades: cards.filter((c) => c.suit.id === 'S').length,
        bigCasino: cards.some((c) => c.id === '10D') ? 2 : 0,
        littleCasino: cards.some((c) => c.id === '2S') ? 1 : 0,
        aces: cards.filter((c) => c.value === 1).length,
        sweeps: this.sweeps[p],
      };
    });
    const most = (k) => (rows[0][k] === rows[1][k] ? -1 : rows[0][k] > rows[1][k] ? 0 : 1);
    const mc = most('cards');
    const ms = most('spades');
    rows.forEach((r, p) => {
      r.cardPts = mc === p ? 3 : 0;
      r.spadePts = ms === p ? 1 : 0;
      r.total = r.cardPts + r.spadePts + r.bigCasino + r.littleCasino + r.aces + r.sweeps;
      this.scores[p] += r.total;
    });
    this.round++;
    this.phase = 'roundOver';
    const [a, b] = this.scores;
    if (Math.max(a, b) >= this.target && a !== b) {
      this.winner = a > b ? 0 : 1;
      this.phase = 'over';
    }
    this.lastRound = { rows, rest: rest.length, restTo: this.lastCapturer, scores: [...this.scores] };
    return this.lastRound;
  }

  nextRound() {
    if (this.phase !== 'roundOver') return false;
    this.dealer = 1 - this.dealer;
    this.startRound();
    return true;
  }

  // -------------------------------------------------------------------- CPU

  /** Picks { type: 'capture' | 'build' | 'trail', cardId, itemIds }. */
  cpuMove(p) {
    const worth = (cards) =>
      cards.reduce((a, c) => a + 1 + (c.suit.id === 'S' ? 0.4 : 0) + (c.id === '10D' ? 4 : 0) + (c.id === '2S' ? 2.5 : 0) + (c.value === 1 ? 1.5 : 0), 0);
    let best = null;
    const consider = (v, move) => {
      if (!best || v > best.v) best = { v, move };
    };
    for (const card of this.hands[p]) {
      const take = this.bestCapture(card);
      if (take.length && !this.breaksOwnBuild(p, card, take)) {
        const sweep = take.length === this.table.length && !this.lastPlay;
        const ownBuild = take.some((t) => t.kind === 'build' && t.owner === p);
        consider(worth([card, ...take.flatMap(cardsOf)]) + (sweep ? 6 : 0) + (ownBuild ? 3 : 0) + 2, { type: 'capture', cardId: card.id, itemIds: take.map(itemId) });
      }
      // Builds with a single other table item (keeps the search small).
      for (const it of this.table) {
        const value = this.buildValue(p, card, [it]);
        if (value === null) continue;
        const stolen = it.kind === 'build' && it.owner !== p;
        consider(worth([card, ...cardsOf(it)]) * 0.7 + (stolen ? 2 : 0), { type: 'build', cardId: card.id, itemIds: [itemId(it)] });
      }
      if (this.canTrail(p, card)) {
        // Trail something cheap that doesn't hand the opponent an easy pick-up.
        let v = -worth([card]) - (val(card) ?? 0) * 0.05;
        const tableSum = this.table.reduce((a, t) => a + (t.kind === 'card' && val(t.card) ? val(t.card) : 0), 0);
        if (val(card) && tableSum + val(card) <= 10) v -= 1.5;
        consider(v, { type: 'trail', cardId: card.id, itemIds: [] });
      }
    }
    if (!best) {
      // Only possible when every card is reserved: capture the own build.
      const b = this.owned(p)[0];
      const card = this.hands[p].find((c) => val(c) === b?.value) ?? this.hands[p][0];
      return { type: 'capture', cardId: card.id, itemIds: this.bestCapture(card).map(itemId) };
    }
    return best.move;
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return {
      v: 1,
      target: this.target,
      scores: this.scores,
      dealer: this.dealer,
      round: this.round,
      winner: this.winner,
      stock: ids(this.stock),
      hands: this.hands.map(ids),
      table: this.table.map((t) => (t.kind === 'card' ? { c: t.card.id } : { b: t.id, v: t.value, o: t.owner, cards: ids(t.cards) })),
      captured: this.captured.map(ids),
      sweeps: this.sweeps,
      lastCapturer: this.lastCapturer,
      nextBuildId: this.nextBuildId,
      turn: this.turn,
      phase: this.phase,
      lastRound: this.lastRound,
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
    const g = new Casino({ dealer: d.dealer, target: d.target });
    Object.assign(g, { scores: d.scores, round: d.round, winner: d.winner, sweeps: d.sweeps, lastCapturer: d.lastCapturer, nextBuildId: d.nextBuildId, turn: d.turn, phase: d.phase, lastRound: d.lastRound });
    g.stock = d.stock.map(card);
    g.hands = d.hands.map((h) => h.map(card));
    g.table = d.table.map((t) => (t.c ? { kind: 'card', card: card(t.c) } : { kind: 'build', id: t.b, value: t.v, owner: t.o, cards: t.cards.map(card) }));
    g.captured = d.captured.map((h) => h.map(card));
    if (seen.size !== 52) return null;
    return g;
  }
}

export const cardsOf = (t) => (t.kind === 'build' ? t.cards : [t.card]);
export const itemId = (t) => (t.kind === 'build' ? t.id : t.card.id);

/** Can these numbers be split into groups that each add up to `target`? */
function partition(nums, target) {
  if (!nums.length) return true;
  if (!target || nums.reduce((a, b) => a + b, 0) % target) return false;
  const sorted = [...nums].sort((a, b) => b - a);
  const used = Array(sorted.length).fill(false);
  const fill = (start, left, remaining) => {
    if (remaining === 0) return true;
    if (left === 0) {
      const first = used.indexOf(false);
      used[first] = true;
      const ok = fill(first + 1, target - sorted[first], remaining - 1);
      used[first] = false;
      return ok;
    }
    for (let i = start; i < sorted.length; i++) {
      if (used[i] || sorted[i] > left) continue;
      used[i] = true;
      if (fill(i + 1, left - sorted[i], remaining - 1)) return true;
      used[i] = false;
    }
    return false;
  };
  return fill(0, 0, sorted.length);
}

/** The most loose cards that can be taken in disjoint groups adding up to `target`. */
function bestGroups(items, target) {
  const n = items.length;
  const v = items.map((t) => val(t.card));
  const sums = [];
  for (let m = 1; m < 1 << n; m++) {
    let s = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) s += v[i];
    if (s === target) sums.push(m);
  }
  const memo = new Map();
  const bits = (m) => {
    let c = 0;
    for (; m; m &= m - 1) c++;
    return c;
  };
  // Best set of extra groups given the cards already used (memoized on the used mask).
  const best = (used) => {
    if (memo.has(used)) return memo.get(used);
    let out = 0;
    for (const m of sums) {
      if (m & used) continue;
      const cand = m | best(used | m);
      if (bits(cand) > bits(out)) out = cand;
    }
    memo.set(used, out);
    return out;
  };
  const mask = best(0);
  return items.filter((_, i) => mask & (1 << i));
}
