// Gin Rummy for two players. Pure state, no DOM, so it can be tested in Node.
//
// 10 cards each; the next card starts the discard pile. The non-dealer may
// take that upcard or pass, then the dealer may; if both pass, the non-dealer
// draws from the stock. On a turn: draw from the stock or take the top
// discard, then discard (not the card just taken from the pile). Melds are
// sets (3–4 of a rank) and runs (3+ in a suit, ace low only). Unmelded cards
// are deadwood: ace 1, 2–10 face value, J Q K 10. With 10 or less deadwood
// after discarding you may knock: hands are shown, and the defender lays off
// deadwood onto the knocker's melds (not after gin). The knocker scores the
// difference in deadwood; if the defender's is as low or lower it's an
// undercut, and the defender scores the difference plus 25. Gin (no
// deadwood) scores 25 plus the defender's deadwood. If only 2 cards are left
// in the stock after a discard without a knock, the hand is a draw.
// First to 100: the winner adds 100, plus 25 per hand won by either player
// (a box bonus each); a shutout doubles the winner's total.
import { createDeck, shuffle } from '../cards.js';

export const TARGET = 100;
export const KNOCK_MAX = 10;
export const GIN_BONUS = 25;
export const UNDERCUT_BONUS = 25;
export const deadValue = (c) => Math.min(c.value, 10);

const sameSet = (cards) => cards.length >= 3 && cards.length <= 4 && cards.every((c) => c.value === cards[0].value);
const isRun = (cards) => {
  if (cards.length < 3 || !cards.every((c) => c.suit.id === cards[0].suit.id)) return false;
  const v = cards.map((c) => c.value).sort((a, b) => a - b);
  return v.every((x, i) => i === 0 || x === v[i - 1] + 1);
};
export const isMeld = (cards) => sameSet(cards) || isRun(cards);

/** Every meld that can be made from `cards` (as index lists). */
function candidates(cards) {
  const out = [];
  const byRank = new Map();
  cards.forEach((c, i) => byRank.set(c.value, [...(byRank.get(c.value) ?? []), i]));
  for (const idx of byRank.values()) {
    if (idx.length === 3) out.push(idx);
    if (idx.length === 4) {
      out.push(idx);
      for (let skip = 0; skip < 4; skip++) out.push(idx.filter((_, k) => k !== skip));
    }
  }
  const bySuit = new Map();
  cards.forEach((c, i) => bySuit.set(c.suit.id, [...(bySuit.get(c.suit.id) ?? []), i]));
  for (const idx of bySuit.values()) {
    const s = [...idx].sort((a, b) => cards[a].value - cards[b].value);
    for (let a = 0; a < s.length; a++) {
      for (let b = a + 2; b < s.length; b++) {
        const seg = s.slice(a, b + 1);
        if (isRun(seg.map((i) => cards[i]))) out.push(seg);
        else break;
      }
    }
  }
  return out;
}

/** Best meld arrangement: { melds: [[card]], deadwood: [card], points }. */
export function arrange(cards) {
  const n = cards.length;
  const cands = candidates(cards).map((idx) => ({ idx, mask: idx.reduce((m, i) => m | (1 << i), 0) }));
  const memo = new Map();
  const best = (mask) => {
    if (!mask) return { dw: 0, melds: [] };
    if (memo.has(mask)) return memo.get(mask);
    let i = 0;
    while (!(mask & (1 << i))) i++;
    // Card i is deadwood...
    const rest = best(mask & ~(1 << i));
    let out = { dw: rest.dw + deadValue(cards[i]), melds: rest.melds };
    // ...or part of a meld that's still available.
    for (const c of cands) {
      if (!(c.mask & (1 << i)) || (c.mask & mask) !== c.mask) continue;
      const r = best(mask & ~c.mask);
      if (r.dw < out.dw) out = { dw: r.dw, melds: [c.idx, ...r.melds] };
    }
    memo.set(mask, out);
    return out;
  };
  const r = best((1 << n) - 1);
  const used = new Set(r.melds.flat());
  const melds = r.melds.map((idx) => idx.map((i) => cards[i]).sort((a, b) => a.value - b.value || a.suit.order - b.suit.order));
  return { melds, deadwood: cards.filter((_, i) => !used.has(i)), points: r.dw };
}

export const deadwood = (cards) => arrange(cards).points;

export class GinRummy {
  constructor({ dealer = 0, target = TARGET } = {}) {
    this.target = target;
    this.scores = [0, 0];
    this.handsWon = [0, 0];
    this.dealer = dealer;
    this.handNo = 0;
    this.winner = null;
    this.final = null;
    this.startHand();
  }

  startHand(deck = shuffle(createDeck())) {
    this.stock = deck.slice();
    this.hands = [[], []];
    for (let i = 0; i < 10; i++) for (const p of [1 - this.dealer, this.dealer]) this.hands[p].push(this.stock.pop());
    this.discard = [this.stock.pop()];
    this.turn = 1 - this.dealer;
    this.phase = 'offer'; // 'offer' -> 'draw' <-> 'discard' -> 'handOver' | 'over'
    this.offerPasses = 0;
    this.taken = null; // card id taken from the discard pile this turn
    this.lastHand = null;
  }

  get top() {
    return this.discard[this.discard.length - 1];
  }

  // ---------------------------------------------------------------- drawing

  /** First upcard: pass it. Returns true if allowed. */
  passOffer(p) {
    if (this.phase !== 'offer' || this.turn !== p) return false;
    this.offerPasses++;
    if (this.offerPasses === 1) this.turn = this.dealer;
    else {
      this.turn = 1 - this.dealer;
      this.phase = 'draw';
    }
    return true;
  }

  /** Draws from 'stock' or 'discard'. Returns the card or null. */
  draw(p, from) {
    if (this.turn !== p) return null;
    if (this.phase === 'offer' && from !== 'discard') return null;
    if (this.phase !== 'draw' && this.phase !== 'offer') return null;
    let card;
    if (from === 'discard') {
      card = this.discard.pop();
      this.taken = card.id;
    } else {
      card = this.stock.pop();
      this.taken = null;
    }
    if (!card) return null;
    this.hands[p].push(card);
    this.phase = 'discard';
    return card;
  }

  // ------------------------------------------------------------- discarding

  canDiscard(p, id) {
    return this.phase === 'discard' && this.turn === p && id !== this.taken && this.hands[p].some((c) => c.id === id);
  }

  /** Deadwood p would have after discarding `id`. */
  deadwoodAfter(p, id) {
    return deadwood(this.hands[p].filter((c) => c.id !== id));
  }

  canKnock(p, id) {
    return this.canDiscard(p, id) && this.deadwoodAfter(p, id) <= KNOCK_MAX;
  }

  /** Discards a card; with knock, ends the hand. Returns { card, hand? } or null. */
  discardCard(p, id, knock = false) {
    if (!this.canDiscard(p, id) || (knock && !this.canKnock(p, id))) return null;
    const card = this.hands[p].find((c) => c.id === id);
    this.hands[p] = this.hands[p].filter((c) => c !== card);
    this.discard.push(card);
    this.taken = null;
    if (knock) return { card, hand: this.score(p) };
    if (this.stock.length <= 2) return { card, hand: this.endDraw() };
    this.turn = 1 - p;
    this.phase = 'draw';
    return { card };
  }

  // ---------------------------------------------------------------- scoring

  score(k) {
    const d = 1 - k;
    const kn = arrange(this.hands[k]);
    const df = arrange(this.hands[d]);
    const gin = kn.points === 0;
    // The defender lays off deadwood onto the knocker's melds (not after gin).
    const melds = kn.melds.map((m) => [...m]);
    let dead = [...df.deadwood];
    const layoffs = [];
    if (!gin) {
      for (let changed = true; changed; ) {
        changed = false;
        for (const c of dead) {
          const m = melds.find((mm) => isMeld([...mm, c]));
          if (!m) continue;
          m.push(c);
          m.sort((a, b) => a.value - b.value);
          layoffs.push(c);
          dead = dead.filter((x) => x !== c);
          changed = true;
          break;
        }
      }
    }
    const kp = kn.points;
    const dp = dead.reduce((a, c) => a + deadValue(c), 0);
    let winner;
    let points;
    let kind;
    if (gin) [winner, points, kind] = [k, GIN_BONUS + dp, 'gin'];
    else if (dp <= kp) [winner, points, kind] = [d, kp - dp + UNDERCUT_BONUS, 'undercut'];
    else [winner, points, kind] = [k, dp - kp, 'knock'];
    this.scores[winner] += points;
    this.handsWon[winner]++;
    this.lastHand = {
      kind, knocker: k, winner, points,
      knock: { melds, deadwood: kn.deadwood, points: kp },
      defend: { melds: df.melds, deadwood: dead, layoffs, points: dp },
      scores: [...this.scores],
    };
    this.finishHand();
    return this.lastHand;
  }

  endDraw() {
    this.lastHand = { kind: 'draw', winner: null, points: 0, scores: [...this.scores] };
    this.finishHand();
    return this.lastHand;
  }

  finishHand() {
    this.handNo++;
    this.phase = 'handOver';
    const w = this.scores.findIndex((s) => s >= this.target);
    if (w >= 0) {
      const loser = 1 - w;
      let total = this.scores[w] + 100 + 25 * this.handsWon[w];
      const shutout = this.handsWon[loser] === 0;
      if (shutout) total *= 2;
      const loserTotal = this.scores[loser] + 25 * this.handsWon[loser];
      this.winner = w;
      this.final = { totals: w === 0 ? [total, loserTotal] : [loserTotal, total], shutout, margin: total - loserTotal };
      this.phase = 'over';
    }
  }

  nextHand() {
    if (this.phase !== 'handOver') return false;
    this.dealer = 1 - this.dealer;
    this.startHand();
    return true;
  }

  // -------------------------------------------------------------------- CPU

  /** Lowest deadwood (and the discard for it) from `cards`, never discarding `keep`. */
  bestDiscard(cards, keep) {
    let best = null;
    for (const c of cards) {
      if (c.id === keep) continue;
      const dw = deadwood(cards.filter((x) => x !== c));
      // Among equals throw the highest card.
      if (!best || dw < best.dw || (dw === best.dw && deadValue(c) > deadValue(best.card))) best = { dw, card: c };
    }
    return best;
  }

  /** Take the top discard only if it clearly helps. */
  cpuWantsTop(p) {
    const top = this.top;
    if (!top) return false;
    const now = this.bestDiscard(this.hands[p], null).dw;
    const after = this.bestDiscard([...this.hands[p], top], top.id).dw;
    return after < now - 1 || after === 0;
  }

  /** { id, knock } for the CPU's discard. */
  cpuDiscard(p) {
    const b = this.bestDiscard(this.hands[p], this.taken);
    const late = this.stock.length < 16;
    const knock = b.dw === 0 || b.dw <= (late ? 9 : 6);
    return { id: b.card.id, knock: knock && b.dw <= KNOCK_MAX };
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return {
      v: 1, target: this.target, scores: this.scores, handsWon: this.handsWon, dealer: this.dealer, handNo: this.handNo,
      winner: this.winner, final: this.final, stock: ids(this.stock), hands: this.hands.map(ids), discard: ids(this.discard),
      turn: this.turn, phase: this.phase, offerPasses: this.offerPasses, taken: this.taken,
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
    const g = new GinRummy({ dealer: d.dealer, target: d.target });
    Object.assign(g, { scores: d.scores, handsWon: d.handsWon, handNo: d.handNo, winner: d.winner, final: d.final, turn: d.turn, phase: d.phase, offerPasses: d.offerPasses, taken: d.taken });
    g.stock = d.stock.map(card);
    g.hands = d.hands.map((h) => h.map(card));
    g.discard = d.discard.map(card);
    if (seen.size !== 52) return null;
    return g;
  }
}
