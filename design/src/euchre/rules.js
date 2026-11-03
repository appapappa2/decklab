// Euchre for four players in two partnerships. Pure state, no DOM, so it can
// be tested in Node.
//
// Seats clockwise: 0 South, 1 West, 2 North, 3 East; 0 & 2 are a team, 1 & 3
// the other. 24 cards (9 through ace), 5 each; the top card of the 4-card
// kitty is turned up. Round one, starting left of the dealer: order the
// dealer to pick up the upcard (its suit becomes trump; the dealer takes it
// and discards a card) or pass. If all pass, round two: name any other suit
// as trump or pass; the dealer can't pass ("stick the dealer"). The maker may
// go alone: their partner sits the hand out.
// Trump ranks: jack of trump (right bower), jack of the same color (left
// bower, counts as trump), A, K, Q, 10, 9. Other suits: A, K, Q, J, 10, 9.
// Left of the dealer leads; follow suit if you can (the left bower follows
// trump); highest trump wins, else the highest card of the suit led.
// Makers taking 3–4 tricks score 1, all 5 score 2 (4 alone); fewer than 3 is
// a euchre and the defenders score 2. First team to 10 wins.
import { createDeck, shuffle } from '../cards.js';

export const TARGET = 10;
export const SUIT_IDS = ['S', 'H', 'C', 'D'];
const RED = { H: true, D: true, S: false, C: false };
export const teamOf = (seat) => seat % 2;
export const partnerOf = (seat) => (seat + 2) % 4;
const sameColor = (a, b) => RED[a] === RED[b] && a !== b;

export const euchreDeck = () => createDeck().filter((c) => c.value === 1 || c.value >= 9);

/** The suit a card plays as (the left bower is trump). */
export function suitOf(card, trump) {
  if (trump && card.value === 11 && sameColor(card.suit.id, trump)) return trump;
  return card.suit.id;
}

/** Strength of a card for winning a trick (higher is better). */
export function strength(card, trump, led) {
  const s = suitOf(card, trump);
  const high = card.value === 1 ? 14 : card.value;
  if (s === trump) {
    if (card.value === 11) return card.suit.id === trump ? 200 : 199;
    return 100 + high;
  }
  return s === led ? high : 0;
}

export class Euchre {
  constructor({ dealer = 3, target = TARGET } = {}) {
    this.target = target;
    this.scores = [0, 0];
    this.dealer = dealer;
    this.handNo = 0;
    this.winner = null;
    this.startHand();
  }

  startHand(deck = shuffle(euchreDeck())) {
    const d = deck.slice();
    this.hands = [[], [], [], []];
    for (let i = 0; i < 5; i++) for (let k = 1; k <= 4; k++) this.hands[(this.dealer + k) % 4].push(d.pop());
    this.kitty = d; // 4 cards; the last one is the upcard
    this.upcard = d[d.length - 1];
    this.trump = null;
    this.maker = null;
    this.alone = false;
    this.out = null; // seat sitting out (partner of a lone maker)
    this.turn = (this.dealer + 1) % 4;
    this.phase = 'bid1'; // 'bid1' -> ('discard' ->) 'play' | 'bid2' -> 'play' -> 'handOver' | 'over'
    this.passes = 0;
    this.tricks = [0, 0, 0, 0];
    this.trick = [];
    this.trickNo = 0;
    this.lastHand = null;
  }

  // ---------------------------------------------------------------- bidding

  /** Round one: order the upcard's suit as trump. */
  orderUp(p, alone = false) {
    if (this.phase !== 'bid1' || this.turn !== p) return false;
    this.setTrump(p, this.upcard.suit.id, alone);
    // The dealer takes the upcard, unless the dealer is the one sitting out.
    if (this.out === this.dealer) {
      this.startPlay();
    } else {
      this.kitty.pop();
      this.hands[this.dealer].push(this.upcard);
      this.phase = 'discard';
      this.turn = this.dealer;
    }
    return true;
  }

  pass(p) {
    if (this.turn !== p) return false;
    if (this.phase === 'bid1') {
      this.passes++;
      this.turn = (p + 1) % 4;
      if (this.passes === 4) {
        this.phase = 'bid2';
        this.passes = 0;
      }
      return true;
    }
    if (this.phase === 'bid2' && p !== this.dealer) {
      this.turn = (p + 1) % 4;
      return true;
    }
    return false; // stick the dealer
  }

  /** Round two: name a suit other than the turned-down one. */
  name(p, suit, alone = false) {
    if (this.phase !== 'bid2' || this.turn !== p || suit === this.upcard.suit.id || !SUIT_IDS.includes(suit)) return false;
    this.setTrump(p, suit, alone);
    this.startPlay();
    return true;
  }

  setTrump(p, suit, alone) {
    this.trump = suit;
    this.maker = p;
    this.alone = !!alone;
    this.out = alone ? partnerOf(p) : null;
  }

  discard(p, id) {
    if (this.phase !== 'discard' || p !== this.dealer) return false;
    const card = this.hands[p].find((c) => c.id === id);
    if (!card) return false;
    this.hands[p] = this.hands[p].filter((c) => c !== card);
    this.kitty.push(card);
    this.startPlay();
    return true;
  }

  startPlay() {
    this.phase = 'play';
    this.turn = this.nextSeat(this.dealer);
  }

  nextSeat(from) {
    let q = (from + 1) % 4;
    if (q === this.out) q = (q + 1) % 4;
    return q;
  }

  get playersPerTrick() {
    return this.out === null ? 4 : 3;
  }

  // ---------------------------------------------------------------- playing

  legal(p) {
    if (this.phase !== 'play' || this.turn !== p) return [];
    const hand = this.hands[p];
    if (!this.trick.length) return hand;
    const led = suitOf(this.trick[0].card, this.trump);
    const follow = hand.filter((c) => suitOf(c, this.trump) === led);
    return follow.length ? follow : hand;
  }

  canPlay(p, card) {
    return this.legal(p).includes(card);
  }

  winningSeat(trick = this.trick) {
    if (!trick.length) return null;
    const led = suitOf(trick[0].card, this.trump);
    let best = trick[0];
    for (const t of trick) if (strength(t.card, this.trump, led) > strength(best.card, this.trump, led)) best = t;
    return best.seat;
  }

  /** Plays a card: { card, trick?: { winner, cards }, hand?, game? } or null. */
  play(p, id) {
    const card = this.hands[p].find((c) => c.id === id);
    if (!card || !this.canPlay(p, card)) return null;
    this.hands[p] = this.hands[p].filter((c) => c !== card);
    this.trick.push({ seat: p, card });
    const out = { card };
    if (this.trick.length < this.playersPerTrick) {
      this.turn = this.nextSeat(p);
      return out;
    }
    const winner = this.winningSeat();
    out.trick = { winner, cards: this.trick };
    this.tricks[winner]++;
    this.trick = [];
    this.trickNo++;
    this.turn = winner;
    if (this.trickNo === 5) {
      out.hand = this.endHand();
      if (this.winner !== null) out.game = { winner: this.winner };
    }
    return out;
  }

  teamTricks(t) {
    return this.tricks[t] + this.tricks[t + 2];
  }

  endHand() {
    const mt = teamOf(this.maker);
    const made = this.teamTricks(mt);
    let team;
    let points;
    let kind;
    if (made < 3) {
      team = 1 - mt;
      points = 2;
      kind = 'euchre';
    } else if (made === 5) {
      team = mt;
      points = this.alone ? 4 : 2;
      kind = this.alone ? 'alone-march' : 'march';
    } else {
      team = mt;
      points = 1;
      kind = 'made';
    }
    this.scores[team] += points;
    this.handNo++;
    this.lastHand = { maker: this.maker, trump: this.trump, alone: this.alone, made, team, points, kind, scores: [...this.scores] };
    this.phase = 'handOver';
    if (this.scores[team] >= this.target) {
      this.winner = team;
      this.phase = 'over';
    }
    return this.lastHand;
  }

  nextHand() {
    if (this.phase !== 'handOver') return false;
    this.dealer = (this.dealer + 1) % 4;
    this.startHand();
    return true;
  }

  // -------------------------------------------------------------------- CPU

  /** How good a hand is with `trump`: about 7 is worth calling, 11+ alone. */
  handValue(cards, trump) {
    let v = 0;
    const trumps = cards.filter((c) => suitOf(c, trump) === trump);
    for (const c of trumps) {
      const s = strength(c, trump);
      v += s === 200 ? 3.2 : s === 199 ? 2.6 : s === 114 ? 2 : s === 113 ? 1.6 : s === 112 ? 1.3 : 1;
    }
    for (const c of cards) if (suitOf(c, trump) !== trump && c.value === 1) v += 1.1;
    if (trumps.length >= 2) {
      for (const s of SUIT_IDS) if (s !== trump && !cards.some((c) => suitOf(c, trump) === s)) v += 0.7;
    }
    return v;
  }

  /** CPU bid: { type: 'order' | 'name' | 'pass', suit?, alone? }. */
  cpuBid(p) {
    const hand = this.hands[p];
    if (this.phase === 'bid1') {
      const s = this.upcard.suit.id;
      let cards = hand;
      if (p === this.dealer) {
        // The dealer picks it up and drops the weakest card.
        const withUp = [...hand, this.upcard];
        const worst = withUp.reduce((a, b) => (this.keepValue(b, s) < this.keepValue(a, s) ? b : a));
        cards = withUp.filter((c) => c !== worst);
      }
      let v = this.handValue(cards, s);
      const upTrump = strength(this.upcard, s);
      if (partnerOf(p) === this.dealer) v += upTrump >= 199 ? 1.5 : 0.6; // feeding partner
      else if (p !== this.dealer && teamOf(p) !== teamOf(this.dealer)) v -= upTrump >= 199 ? 1.5 : 0.6; // giving it to them
      if (v >= 7) return { type: 'order', alone: v >= 11.5 };
      return { type: 'pass' };
    }
    let best = null;
    for (const s of SUIT_IDS) {
      if (s === this.upcard.suit.id) continue;
      const v = this.handValue(hand, s);
      if (!best || v > best.v) best = { s, v };
    }
    if (best.v >= 6.5 || p === this.dealer) return { type: 'name', suit: best.s, alone: best.v >= 11.5 };
    return { type: 'pass' };
  }

  /** How much a card is worth keeping (low = discard first). */
  keepValue(card, trump) {
    if (suitOf(card, trump) === trump) return 100 + strength(card, trump);
    const same = this.hands[this.dealer].filter((c) => suitOf(c, trump) === card.suit.id).length;
    return (card.value === 1 ? 30 : card.value) + same * 2; // keep aces; void short suits
  }

  cpuDiscard(p) {
    const hand = this.hands[p];
    return hand.reduce((a, b) => (this.keepValue(b, this.trump) < this.keepValue(a, this.trump) ? b : a)).id;
  }

  cpuPlay(p) {
    const opts = this.legal(p);
    if (!opts.length) return null;
    const t = this.trump;
    const lead = this.trick.length ? suitOf(this.trick[0].card, t) : null;
    const pow = (c) => strength(c, t, lead ?? suitOf(c, t));
    const low = (cs) => cs.reduce((a, b) => (pow(b) < pow(a) ? b : a));
    const high = (cs) => cs.reduce((a, b) => (pow(b) > pow(a) ? b : a));
    const maker = teamOf(p) === teamOf(this.maker);
    if (!this.trick.length) {
      const trumps = opts.filter((c) => suitOf(c, t) === t);
      // Makers pull trump with the right bower; otherwise lead an off-suit ace.
      if (maker && trumps.some((c) => strength(c, t) === 200)) return trumps.find((c) => strength(c, t) === 200);
      const aces = opts.filter((c) => c.value === 1 && suitOf(c, t) !== t);
      if (aces.length) return aces[0];
      if (maker && trumps.length >= 2) return high(trumps);
      const off = opts.filter((c) => suitOf(c, t) !== t);
      return low(off.length ? off : opts);
    }
    const winning = this.winningSeat();
    if (winning === partnerOf(p)) return low(opts);
    const winners = opts.filter((c) => this.winningSeat([...this.trick, { seat: p, card: c }]) === p);
    if (winners.length) return low(winners);
    return low(opts);
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    const ids = (a) => a.map((c) => c.id);
    return {
      v: 1,
      target: this.target,
      scores: this.scores,
      dealer: this.dealer,
      handNo: this.handNo,
      winner: this.winner,
      hands: this.hands.map(ids),
      kitty: ids(this.kitty),
      upcard: this.upcard.id,
      trump: this.trump,
      maker: this.maker,
      alone: this.alone,
      out: this.out,
      turn: this.turn,
      phase: this.phase,
      passes: this.passes,
      tricks: this.tricks,
      trick: this.trick.map((t) => [t.seat, t.card.id]),
      trickNo: this.trickNo,
      lastHand: this.lastHand,
    };
  }

  static restore(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.hands)) return null;
    const byId = new Map(euchreDeck().map((c) => [c.id, c]));
    const card = (id) => {
      const c = byId.get(id);
      if (!c) throw new Error('bad save');
      return c;
    };
    const g = new Euchre({ dealer: d.dealer, target: d.target });
    Object.assign(g, {
      scores: d.scores, handNo: d.handNo, winner: d.winner, trump: d.trump, maker: d.maker, alone: d.alone, out: d.out,
      turn: d.turn, phase: d.phase, passes: d.passes, tricks: d.tricks, trickNo: d.trickNo, lastHand: d.lastHand,
    });
    g.hands = d.hands.map((h) => h.map(card));
    g.kitty = d.kitty.map(card);
    g.upcard = card(d.upcard);
    g.trick = d.trick.map(([seat, id]) => ({ seat, card: card(id) }));
    const live = [...g.hands.flat(), ...g.kitty, ...g.trick.map((t) => t.card)];
    if (new Set(live.map((c) => c.id)).size !== live.length) return null;
    return g;
  }
}
