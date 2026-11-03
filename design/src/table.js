// The lab's Game (the tuned hand) with hooks for real games. A scene decides
// what "playing" a card means; Input and all hand gestures stay untouched.
//
// Scene hooks:
//   onPlay(sp)        a card was played (drag past the line, flick, or the
//                     button). Return true to put it on the pile; false keeps
//                     it in the hand (the scene gives its own feedback).
//   afterPlay(sp)     after a card went to the pile (optional)
//   onDeckTap()       the deck was tapped (optional)
//   stockCount()      cards left in the deck, for the counter
//   adjustLayout()    after the lab layout is computed: move deck/pile, etc.
//   onSelect(sp)      a card was tapped; return true if the scene handled
//                     selection itself (optional; e.g. pick 3 cards to pass)
//   hidePlayButtons() return true to suppress the button over selected cards (optional)
//   pileIndexAt(p)    which pile card is under point p, or -1 (optional; with
//   onPileTap(i)      this, taps on the pile report the card that was hit)
import { Game } from './game.js?v=middle-only-landings';
import { CardSprite } from './cards.js?v=landing-burst';
import { clamp } from './layout.js';

export class RuleTable extends Game {
  constructor(els, settings, haptic, scene, { buttonLabel = 'Play' } = {}) {
    super(els, settings, haptic);
    this.scene = scene;
    this.buttonLabel = buttonLabel;
    this.releasing = null;
  }

  relayout() {
    super.relayout();
    this.scene.adjustLayout();
  }

  release(now, cancelled) {
    this.releasing = this.drag; // play() needs to know where a returned card came from
    try {
      super.release(now, cancelled);
    } finally {
      this.releasing = null;
    }
  }

  /** From release(): the card was dragged past the play line or flicked. */
  play(sp) {
    if (this.scene.onPlay(sp)) {
      super.play(sp);
      this.scene.afterPlay?.(sp);
      return;
    }
    // Back into the hand where it was dropped (or came from).
    const d = this.releasing;
    let idx = this.hand.length;
    if (d) idx = this.s.reorder && d.gapIndex >= 0 ? d.gapIndex : d.fromIndex;
    this.hand.splice(clamp(idx, 0, this.hand.length), 0, sp);
  }

  /** The button above a selected card. */
  playFromHand(sp) {
    if (!this.scene.onPlay(sp)) return;
    const i = this.hand.indexOf(sp);
    if (i < 0) return;
    this.hand.splice(i, 1);
    if (this.peek === i) this.peek = -1;
    else if (this.peek > i) this.peek--;
    super.play(sp);
    this.haptic(15);
    this.scene.afterPlay?.(sp);
  }

  toggleSelect(i) {
    const sp = this.hand[i];
    if (sp && this.scene.onSelect?.(sp)) return;
    super.toggleSelect(i);
  }

  updatePlayButtons(now) {
    if (this.scene.hidePlayButtons?.()) {
      for (const sp of [...this.buttons]) this.removePlayButton(sp);
      return;
    }
    super.updatePlayButtons(now);
  }

  addPlayButton(sp) {
    super.addPlayButton(sp);
    sp.playBtn.textContent = this.buttonLabel;
  }

  /** Puts a card on the pile without asking the scene (opponent plays, starter card). */
  placeOnPile(sp) {
    super.play(sp);
  }

  /** Deck tap from Input. */
  draw() {
    this.scene.onDeckTap?.();
    return 0;
  }

  hitPile(p) {
    if (!this.scene.pileIndexAt) return super.hitPile(p);
    this.pileHit = this.scene.pileIndexAt(p);
    return this.pileHit >= 0;
  }

  /** Pile tap from Input (right after hitPile said yes). */
  returnPlayed() {
    if (this.scene.onPileTap && this.pileHit >= 0) this.scene.onPileTap(this.pileHit);
  }

  /** A specific card from the deck into the hand. */
  addCard(card, delay = 0) {
    return this.takeSprite(this.spriteAtDeck(card), delay);
  }

  /** An existing sprite (e.g. taken from the opponent) into the hand. */
  takeSprite(sp, delay = 0) {
    sp.isDrag = false;
    sp.waitUntil = delay ? performance.now() + delay : 0;
    this.hand.push(sp);
    return sp;
  }

  /** Removes a sprite from the hand (or the drag) without playing it. */
  removeFromHand(sp) {
    if (this.drag?.sprite === sp) this.drag = null;
    sp.isDrag = false;
    sp.setSelected(false);
    const i = this.hand.indexOf(sp);
    if (i < 0) return false;
    this.hand.splice(i, 1);
    if (this.peek === i) this.peek = -1;
    else if (this.peek > i) this.peek--;
    return true;
  }

  spriteAtDeck(card) {
    const m = this.m;
    const sp = new CardSprite(card, this.els.layer);
    sp.setLightSpace(this.W, this.H);
    sp.place(m.deck.x, m.deck.y, 0, 1, 1);
    sp.target(m.deck.x, m.deck.y, 0, 1, 1, 0);
    return sp;
  }

  /** Sends sprites back to the deck and removes them (new game, reshuffle). */
  discard(sprites, delay = 600) {
    const now = performance.now();
    for (const sp of sprites) {
      this.pendingLandings.delete(sp);
      sp.isDrag = false;
      sp.setSelected(false);
      sp.waitUntil = 0;
      sp.removeAt = now + delay;
      this.leaving.push(sp);
    }
  }

  /** Empties hand, pile and drag (their sprites fly back to the deck). */
  clearTable() {
    const old = [...this.hand, ...this.played];
    if (this.drag) old.push(this.drag.sprite);
    this.discard(old);
    this.hand = [];
    this.played = [];
    this.drag = null;
    this.peek = -1;
    this.scroll.set(0);
  }

  updateDeck() {
    const n = this.scene.stockCount?.() ?? 0;
    this.els.deckCount.textContent = n ? `${n} left` : 'empty';
    this.els.deck.classList.toggle('empty', n === 0);
  }
}
