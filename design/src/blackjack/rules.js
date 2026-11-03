// Blackjack against the dealer. Pure state, no DOM, so it can be tested in Node.
//
// One deck, reshuffled when fewer than RESHUFFLE_AT cards are left before a
// round. Blackjack pays 3:2 (rounded down to whole chips), other wins 1:1. The dealer stands on all 17s and
// peeks for blackjack when showing an ace or a ten. Double down on any first
// two cards (also after a split). Split pairs of the same value into up to 4
// hands; split aces get one card each and can't be split again. 21 on a split
// hand isn't a blackjack. No insurance.
//
// Every action returns the events it caused, in order, so a scene can animate them:
//   { type: 'card', who: 'dealer' | hand index, card, down }
//   { type: 'split', from, to }                  second card moved to a new hand
//   { type: 'shuffle' }                          discards went back into the deck
//   { type: 'active', hand }                     this hand is now being played
//   { type: 'reveal', card }                     dealer flips the hole card
//   { type: 'settle', results }                  round over (see settle())
import { createDeck, shuffle } from '../cards.js';

export const RESHUFFLE_AT = 15;
export const MAX_HANDS = 4;
export const START_BANK = 1000;
export const CHIPS = [10, 25, 50, 100];

const cardValue = (c) => (c.value === 1 ? 11 : Math.min(c.value, 10));

/** Best total for a set of cards, and whether an ace is still counted as 11. */
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.value === 1) aces++;
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

export class Blackjack {
  constructor({ bank = START_BANK, bet = 25, deck } = {}) {
    this.bank = bank;
    this.bet = bet;
    this.shoe = deck ? deck.slice() : shuffle(createDeck());
    this.discard = [];
    this.hands = []; // [{ cards, bet, done, doubled, split, aces, result, payout }]
    this.dealer = [];
    this.holeDown = false;
    this.active = -1;
    this.phase = 'bet'; // 'bet' -> 'play' -> 'done' (-> 'bet' on the next deal)
    this.results = null;
    this.stats = { rounds: 0, won: 0, lost: 0, pushed: 0, blackjacks: 0 };
  }

  // ------------------------------------------------------------ betting

  get canDeal() {
    return this.phase !== 'play' && this.bet > 0 && this.bet <= this.bank;
  }

  setBet(amount) {
    if (this.phase === 'play') return false;
    this.bet = Math.max(0, Math.min(Math.round(amount), this.bank));
    return true;
  }

  addChip(v) {
    return this.setBet(this.bet + v);
  }

  /** Chips currently on the table (already taken from the bank). */
  get wagered() {
    return this.phase === 'play' ? this.hands.reduce((n, h) => n + h.bet, 0) : 0;
  }

  // ------------------------------------------------------------ dealing

  draw(ev) {
    if (!this.shoe.length) this.reshuffle(ev);
    return this.shoe.pop();
  }

  reshuffle(ev) {
    this.shoe = shuffle([...this.shoe, ...this.discard]);
    this.discard = [];
    ev.push({ type: 'shuffle' });
  }

  /** Clears the table and deals a new round with the current bet. */
  deal() {
    if (!this.canDeal) return null;
    const ev = [];
    this.discard.push(...this.dealer, ...this.hands.flatMap((h) => h.cards));
    this.dealer = [];
    this.hands = [];
    if (this.shoe.length < RESHUFFLE_AT) this.reshuffle(ev);
    this.bank -= this.bet;
    this.hands = [this.newHand(this.bet)];
    this.results = null;
    this.phase = 'play';
    this.stats.rounds++;
    const give = (who, down = false) => {
      const card = this.draw(ev);
      (who === 'dealer' ? this.dealer : this.hands[who].cards).push(card);
      ev.push({ type: 'card', who, card, down });
    };
    give(0);
    give('dealer');
    give(0);
    give('dealer', true);
    this.holeDown = true;

    const up = this.dealer[0];
    const dealerBJ = isBlackjack(this.dealer);
    const playerBJ = isBlackjack(this.hands[0].cards);
    // The dealer peeks with an ace or ten showing; a blackjack ends the round at once.
    if ((dealerBJ && cardValue(up) >= 10) || playerBJ) {
      this.reveal(ev);
      this.settle(ev);
      return ev;
    }
    this.active = 0;
    ev.push({ type: 'active', hand: 0 });
    return ev;
  }

  newHand(bet, cards = []) {
    return { cards, bet, done: false, doubled: false, split: false, aces: false, result: null, payout: 0 };
  }

  // ------------------------------------------------------------ actions

  get hand() {
    return this.phase === 'play' ? this.hands[this.active] : null;
  }

  get canHit() {
    const h = this.hand;
    return !!h && !h.done;
  }

  get canStand() {
    return this.canHit;
  }

  get canDouble() {
    const h = this.hand;
    return !!h && !h.done && h.cards.length === 2 && !h.aces && this.bank >= h.bet;
  }

  get canSplit() {
    const h = this.hand;
    if (!h || h.done || h.cards.length !== 2 || this.hands.length >= MAX_HANDS || this.bank < h.bet) return false;
    if (h.aces) return false; // no re-splitting aces
    return cardValue(h.cards[0]) === cardValue(h.cards[1]);
  }

  hit() {
    if (!this.canHit) return null;
    const ev = [];
    const h = this.hand;
    const card = this.draw(ev);
    h.cards.push(card);
    ev.push({ type: 'card', who: this.active, card, down: false });
    if (handValue(h.cards).total >= 21) this.finishHand(ev);
    return ev;
  }

  stand() {
    if (!this.canStand) return null;
    const ev = [];
    this.finishHand(ev);
    return ev;
  }

  double() {
    if (!this.canDouble) return null;
    const ev = [];
    const h = this.hand;
    this.bank -= h.bet;
    h.bet *= 2;
    h.doubled = true;
    const card = this.draw(ev);
    h.cards.push(card);
    ev.push({ type: 'card', who: this.active, card, down: false });
    this.finishHand(ev);
    return ev;
  }

  split() {
    if (!this.canSplit) return null;
    const ev = [];
    const h = this.hand;
    const i = this.active;
    this.bank -= h.bet;
    const second = this.newHand(h.bet, [h.cards.pop()]);
    const aces = h.cards[0].value === 1;
    h.split = second.split = true;
    h.aces = second.aces = aces;
    this.hands.splice(i + 1, 0, second);
    ev.push({ type: 'split', from: i, to: i + 1 });
    for (const k of [i, i + 1]) {
      const card = this.draw(ev);
      this.hands[k].cards.push(card);
      ev.push({ type: 'card', who: k, card, down: false });
    }
    if (aces) {
      // Split aces: one card each, then done.
      this.hands[i].done = this.hands[i + 1].done = true;
      this.advance(ev);
    } else if (handValue(h.cards).total === 21) this.finishHand(ev);
    else ev.push({ type: 'active', hand: i });
    return ev;
  }

  finishHand(ev) {
    this.hand.done = true;
    this.advance(ev);
  }

  /** Moves to the next unfinished hand, or lets the dealer play. */
  advance(ev) {
    const next = this.hands.findIndex((h) => !h.done);
    if (next >= 0) {
      this.active = next;
      if (handValue(this.hands[next].cards).total === 21) {
        this.hands[next].done = true;
        this.advance(ev);
        return;
      }
      ev.push({ type: 'active', hand: next });
      return;
    }
    this.active = -1;
    this.reveal(ev);
    // The dealer only draws if some hand is still standing.
    if (this.hands.some((h) => handValue(h.cards).total <= 21)) {
      while (handValue(this.dealer).total < 17) {
        const card = this.draw(ev);
        this.dealer.push(card);
        ev.push({ type: 'card', who: 'dealer', card, down: false });
      }
    }
    this.settle(ev);
  }

  reveal(ev) {
    if (!this.holeDown) return;
    this.holeDown = false;
    ev.push({ type: 'reveal', card: this.dealer[1] });
  }

  /**
   * Pays out every hand. results: [{ result, payout, total }] where result is
   * 'blackjack' | 'win' | 'push' | 'lose' | 'bust', and payout is what went
   * back to the bank (stake included).
   */
  settle(ev) {
    const d = handValue(this.dealer).total;
    const dealerBJ = isBlackjack(this.dealer);
    for (const h of this.hands) {
      const t = handValue(h.cards).total;
      const bj = isBlackjack(h.cards) && !h.split;
      let result;
      if (t > 21) result = 'bust';
      else if (bj && dealerBJ) result = 'push';
      else if (bj) result = 'blackjack';
      else if (dealerBJ) result = 'lose';
      else if (d > 21 || t > d) result = 'win';
      else if (t === d) result = 'push';
      else result = 'lose';
      // 3:2 is rounded down to whole chips (a 75 bet gets 112, not 112.5).
      const payout = result === 'blackjack' ? h.bet + Math.floor(h.bet * 1.5) : result === 'win' ? h.bet * 2 : result === 'push' ? h.bet : 0;
      h.result = result;
      h.payout = payout;
      h.done = true;
      this.bank += payout;
      if (result === 'blackjack') this.stats.blackjacks++;
      if (result === 'win' || result === 'blackjack') this.stats.won++;
      else if (result === 'push') this.stats.pushed++;
      else this.stats.lost++;
    }
    this.active = -1;
    this.phase = 'done';
    if (this.bet > this.bank) this.bet = Math.min(this.bet, this.bank);
    this.results = this.hands.map((h) => ({ result: h.result, payout: h.payout, total: handValue(h.cards).total }));
    ev.push({ type: 'settle', results: this.results });
  }

  // ------------------------------------------------------------ persistence

  /** Only the bank, bet and stats are saved; a round in progress is refunded. */
  serialize() {
    return { v: 1, bank: this.bank + this.wagered, bet: this.bet, stats: this.stats };
  }

  static restore(d) {
    if (!d || d.v !== 1 || !Number.isFinite(d.bank)) return null;
    const g = new Blackjack({ bank: Math.max(0, d.bank), bet: Number(d.bet) || 25 });
    if (d.stats) g.stats = { ...g.stats, ...d.stats };
    return g;
  }
}
