import { CardSprite, createDeck, shuffle } from './cards.js';
import { clamp, computeMetrics, handSlots, nearestSlot } from './layout.js';
import { Spring } from './spring.js';
import { VelocityTracker } from './velocity.js';

const SCROLL_K = 600; // stiffness of the hand-scroll spring
const SCROLL_ZETA = 1;

/**
 * Owns card state (deck / hand / played pile) and turns it into spring targets
 * every frame. Input calls into the small API below (setPeek, pickUp, moveDrag,
 * release, scroll...).
 */
export class Game {
  constructor(els, settings, haptic) {
    this.els = els;
    this.s = settings;
    this.haptic = haptic;
    this.W = 393;
    this.H = 852;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this.m = null;

    this.deck = []; // card data, top = end
    this.hand = []; // CardSprite, left -> right
    this.played = []; // CardSprite, bottom -> top
    this.leaving = []; // sprites flying back to the deck before removal

    this.drag = null;
    this.peek = -1;
    this.active = false; // a pointer is on (or hovering) the hand
    this.slots = [];
    this.gap = -1;
    this.hot = false;

    // Hand scrolling (overflow mode)
    this.scroll = new Spring(0, 0.01);
    this.scrollDrag = false;
    this.half = 0; // current max scroll each way
    this.scrubX = null; // x of a pressed finger/mouse scrubbing the hand
    this.hoverX = null; // x of a hovering mouse over the hand
    this.hintL = -1;
    this.hintR = -1;

    this.buttons = new Set(); // sprites that currently show a Play button
  }

  // ---------------------------------------------------------------- layout

  setSize(W, H, safe) {
    this.W = W;
    this.H = H;
    this.safe = safe;
    this.relayout();
  }

  relayout() {
    const m = (this.m = computeMetrics(this.W, this.H, this.safe, this.s));
    const { screen, deck, playzone, edgeL, edgeR } = this.els;
    screen.style.setProperty('--cw', `${m.cw}px`);
    screen.style.setProperty('--ch', `${m.ch}px`);
    screen.dataset.hint = this.s.overflowHint;
    deck.style.left = `${m.deck.x - m.cw / 2}px`;
    deck.style.top = `${m.deck.y - m.ch / 2}px`;
    playzone.style.left = `${m.pz.x - m.pz.w / 2}px`;
    playzone.style.top = `${m.pz.y - m.pz.h / 2}px`;
    playzone.style.width = `${m.pz.w}px`;
    playzone.style.height = `${m.pz.h}px`;
    const edgeTop = `${m.handTop - m.ch * 0.3}px`;
    edgeL.style.top = edgeTop;
    edgeR.style.top = edgeTop;
    edgeL.style.width = `${m.safe.left + m.cw * 0.7}px`;
    edgeR.style.width = `${m.safe.right + m.cw * 0.7}px`;
  }

  /** Hand layout at the current scroll position. */
  layoutHand(extra = 0, spread = this.active || !!this.drag) {
    return handSlots(this.hand.length + extra, this.m, this.s, spread, this.scroll.v);
  }

  // --------------------------------------------------------------- actions

  newGame(count = 7) {
    const now = performance.now();
    const old = [...this.hand, ...this.played];
    if (this.drag) old.push(this.drag.sprite);
    for (const sp of old) {
      sp.isDrag = false;
      sp.setSelected(false);
      sp.waitUntil = 0;
      sp.removeAt = now + 700;
      this.leaving.push(sp);
    }
    this.hand = [];
    this.played = [];
    this.drag = null;
    this.peek = -1;
    this.scroll.set(0);
    this.scrollDrag = false;
    this.setHot(false);
    this.deck = shuffle(createDeck());
    this.draw(count, old.length ? 320 : 150);
    this.updatePile();
  }

  draw(count = 1, delay = 0) {
    const now = performance.now();
    const m = this.m;
    let drawn = 0;
    for (let k = 0; k < count; k++) {
      const card = this.deck.pop();
      if (!card) break;
      const sp = new CardSprite(card, this.els.layer);
      sp.place(m.deck.x, m.deck.y, 0, 1, 1);
      sp.target(m.deck.x, m.deck.y, 0, 1, 1, 0);
      sp.waitUntil = now + delay + k * this.s.dealStagger;
      this.hand.push(sp);
      drawn++;
    }
    this.updateDeck();
    return drawn;
  }

  play(sp) {
    sp.setSelected(false);
    sp.waitUntil = 0;
    sp.pile = {
      x: (Math.random() - 0.5) * 0.16,
      y: (Math.random() - 0.5) * 0.1,
      rot: (Math.random() - 0.5) * 22,
    };
    this.played.push(sp);
    this.updatePile();
  }

  /** Play a card straight from the hand (Play button, discard). */
  playFromHand(sp) {
    const i = this.hand.indexOf(sp);
    if (i < 0) return;
    this.hand.splice(i, 1);
    if (this.peek === i) this.peek = -1;
    else if (this.peek > i) this.peek--;
    this.play(sp);
    this.haptic(15);
  }

  returnPlayed() {
    if (!this.played.length) return;
    const now = performance.now();
    const cards = this.played.splice(0).reverse();
    cards.forEach((sp, k) => {
      sp.waitUntil = now + k * 40;
      this.hand.push(sp);
    });
    this.updatePile();
  }

  discardRandom() {
    const ready = this.hand.filter((sp) => sp.waitUntil <= performance.now());
    if (!ready.length) return;
    this.playFromHand(ready[(Math.random() * ready.length) | 0]);
  }

  sortHand(by = 'suit') {
    const key =
      by === 'suit'
        ? (c) => c.suit.order * 100 + c.value
        : (c) => c.value * 10 + c.suit.order;
    this.hand.sort((a, b) => key(a.card) - key(b.card));
  }

  shuffleHand() {
    shuffle(this.hand);
  }

  deselectAll() {
    for (const sp of this.hand) if (sp.selected) sp.setSelected(false);
  }

  toggleSelect(i) {
    const sp = this.hand[i];
    if (!sp) return;
    const on = !sp.selected;
    if (on && !this.s.multiSelect) this.deselectAll();
    sp.setSelected(on);
    this.haptic(on ? 8 : 4);
  }

  updateDeck() {
    const n = this.deck.length;
    this.els.deckCount.textContent = n ? `${n} left` : 'empty';
    this.els.deck.classList.toggle('empty', n === 0);
  }

  updatePile() {
    this.els.playzone.classList.toggle('has-cards', this.played.length > 0);
  }

  setHot(on) {
    if (on === this.hot) return;
    this.hot = on;
    this.els.playzone.classList.toggle('hot', on);
  }

  // ------------------------------------------------------------ hit tests

  hitDeck(p) {
    const { deck, cw, ch } = this.m;
    return Math.abs(p.x - deck.x) < cw * 0.6 && Math.abs(p.y - deck.y) < ch * 0.6;
  }

  hitPile(p) {
    if (!this.played.length) return false;
    const z = this.m.pz;
    return Math.abs(p.x - z.x) < z.w / 2 && Math.abs(p.y - z.y) < z.h / 2;
  }

  /**
   * Index of the hand card under p (using layout, not DOM), or -1.
   * `current` is the card already peeked (mouse hover): its enlarged, lifted
   * area also counts as "on the hand", and hysteresis applies.
   */
  handIndexAt(p, current = -1) {
    const n = this.hand.length;
    if (!n) return -1;
    const m = this.m;
    const s = this.s;
    const peeking = current >= 0 && current < n;
    const { slots, spacing } = this.layoutHand(0, peeking || this.active);
    const anySelected = this.hand.some((sp) => sp.selected);
    let top = m.handTop - (anySelected ? s.selectLift * m.ch : 0) - 12;
    if (peeking && s.peekEnabled) {
      const sc = s.peekScale;
      const peekY = Math.min(slots[current].y, m.H - m.safe.bottom - (m.ch * sc) / 2 - 6) - s.peekLift * m.ch;
      top = Math.min(top, peekY - (m.ch * sc) / 2);
    }
    const minX = slots[0].x - m.cw / 2 - 10;
    const maxX = slots[n - 1].x + m.cw / 2 + 10;
    if (p.y < top || p.x < minX || p.x > maxX) return -1;
    return nearestSlot(slots, spacing, p.x, peeking ? current : -1, s.scrubHysteresis);
  }

  /** Scrub lookup against the spread-out layout, with hysteresis. */
  slotAt(x, current) {
    const { slots, spacing } = this.layoutHand(0, true);
    return nearestSlot(slots, spacing, x, current, this.s.scrubHysteresis);
  }

  setPeek(i) {
    this.peek = i >= 0 && i < this.hand.length ? i : -1;
  }

  setActive(on) {
    this.active = on;
  }

  // ---------------------------------------------------------------- scroll

  /** Max scroll distance each way for the spread hand (0 = it fits). */
  scrollRange() {
    if (this.s.overflow !== 'scroll' || !this.m) return 0;
    const extra = this.drag && this.drag.gapIndex >= 0 ? 1 : 0;
    return handSlots(this.hand.length + extra, this.m, this.s, true, 0).half;
  }

  canScroll() {
    return this.scrollRange() > 0;
  }

  /** 1:1 scroll while a finger/mouse drags the hand, rubber-banding past the ends. */
  dragScrollTo(v) {
    const h = this.scrollRange();
    let c = v;
    if (c < -h) c = -h - (-h - c) * 0.3;
    else if (c > h) c = h + (c - h) * 0.3;
    this.scroll.set(c);
    this.scrollDrag = true;
  }

  endScrollDrag(vx = 0) {
    if (!this.scrollDrag) return;
    this.scrollDrag = false;
    const h = this.scrollRange();
    this.scroll.t = clamp(this.scroll.v - vx * this.s.scrollMomentum, -h, h);
  }

  scrollBy(d) {
    const h = this.scrollRange();
    this.scroll.t = clamp(this.scroll.t + d, -h, h);
  }

  /** Proportional mode: 0 = show the left end of the hand, 1 = the right end. */
  scrollToFraction(t) {
    const h = this.scrollRange();
    this.scroll.t = -h + 2 * h * clamp(t, 0, 1);
  }

  /** Auto-scroll while scrubbing (edge mode) or reordering near a screen edge. */
  edgeScroll(dt) {
    const s = this.s;
    const m = this.m;
    if (s.overflow !== 'scroll') return;
    let ex = null;
    if (this.drag) {
      if (s.reorder && this.drag.inHand) ex = this.drag.fx + this.drag.ox;
    } else if (this.scrubX !== null && s.scrollMode === 'edge') {
      ex = this.scrubX;
    }
    if (ex === null) return;
    const zone = s.edgeZone * m.W;
    const left = m.safe.left + zone;
    const right = m.W - m.safe.right - zone;
    let v = 0;
    if (ex < left) v = -s.edgeSpeed * Math.min(1, (left - ex) / zone);
    else if (ex > right) v = s.edgeSpeed * Math.min(1, (ex - right) / zone);
    if (v) this.scrollBy(v * dt);
  }

  // ------------------------------------------------------------------ drag

  pickUp(index, fx, fy, now, pointerType = 'touch') {
    const sp = this.hand[index];
    if (!sp) return false;
    const m = this.m;
    const s = this.s;
    this.endScrollDrag(0);
    this.hand.splice(index, 1);
    sp.isDrag = true;
    sp.waitUntil = 0;
    // Offset from pointer to card center. A finger would cover the card, so
    // touch holds it above the finger; a mouse cursor doesn't, so the card can
    // stay exactly where it was grabbed.
    let ox = 0;
    let oy = -s.fingerOffset;
    if (pointerType !== 'touch' && s.mouseGrab) {
      ox = clamp(sp.x.v - fx, -m.cw * 0.45, m.cw * 0.45);
      oy = clamp(sp.y.v - fy, -m.ch * 0.45, m.ch * 0.45);
    }
    const tracker = new VelocityTracker();
    tracker.add(now, fx, fy);
    this.drag = {
      sprite: sp, fromIndex: index, gapIndex: index, lastGap: index,
      fx, fy, ox, oy, tracker, inHand: true,
    };
    this.peek = -1;
    this.scrubX = null;
    this.haptic(10);
    this.updateDragZone();
    return true;
  }

  moveDrag(fx, fy, now) {
    const d = this.drag;
    if (!d) return;
    d.fx = fx;
    d.fy = fy;
    d.tracker.add(now, fx, fy);
    this.updateDragZone();
  }

  /** Recompute reorder gap + play-zone highlight for the dragged card. */
  updateDragZone() {
    const d = this.drag;
    const m = this.m;
    const s = this.s;
    const cardX = d.fx + d.ox;
    const cardY = d.fy + d.oy;
    d.inHand = cardY > m.handTop - m.ch * 0.15;
    let gap;
    if (!s.reorder) {
      gap = d.fromIndex; // keep the original slot open so it's clear where it returns
    } else if (d.inHand) {
      const { slots, spacing } = this.layoutHand(1, true);
      gap = nearestSlot(slots, spacing, cardX, d.gapIndex, s.scrubHysteresis, 'x');
      d.lastGap = gap;
    } else {
      gap = -1; // lifted out of the hand: let the hand close up
    }
    if (gap !== d.gapIndex) {
      if (gap >= 0 && d.gapIndex >= 0) this.haptic(4);
      d.gapIndex = gap;
    }
    this.setHot(this.wouldPlay(cardX, cardY));
  }

  /** Would a card centered at (cx, cy) be played if released now? */
  wouldPlay(cx, cy) {
    const m = this.m;
    if (cy < this.s.playLine * m.H) return true;
    const z = m.pz;
    return Math.abs(cx - z.x) < z.w / 2 && Math.abs(cy - z.y) < z.h / 2;
  }

  release(now, cancelled) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.setHot(false);
    const sp = d.sprite;
    sp.isDrag = false;
    const s = this.s;
    const v = d.tracker.velocity(now);
    const flick = s.flickToPlay && -v.y > s.flickVelocity && -v.y > Math.abs(v.x) * 0.6;

    if (!cancelled && (this.wouldPlay(d.fx + d.ox, d.fy + d.oy) || flick)) {
      this.play(sp);
      this.haptic(15);
      return;
    }
    let idx = d.fromIndex;
    if (!cancelled && s.reorder) idx = d.gapIndex >= 0 ? d.gapIndex : d.lastGap;
    this.hand.splice(clamp(idx, 0, this.hand.length), 0, sp);
  }

  // ----------------------------------------------------------------- frame

  update(now, dt) {
    // Scroll: auto-scroll, clamp, spring.
    const before = this.scroll.v;
    this.edgeScroll(dt);
    if (!this.scrollDrag) {
      const h = this.scrollRange();
      this.scroll.t = clamp(this.scroll.t, -h, h);
      this.scroll.step(dt, SCROLL_K, SCROLL_ZETA);
    }
    if (Math.abs(this.scroll.v - before) > 0.01) {
      // The hand moved under a stationary pointer: re-pick what's under it.
      if (this.drag) this.updateDragZone();
      const px = this.scrubX ?? this.hoverX;
      if (px !== null && this.peek >= 0) {
        const idx = this.slotAt(px, this.peek);
        if (idx >= 0 && idx !== this.peek) {
          this.peek = idx;
          if (this.scrubX !== null) this.haptic(4);
        }
      }
    }

    this.updateTargets(now);

    // While the hand scrolls, cards track it with the stiffer drag spring so
    // scrolling feels attached rather than floaty.
    const fast = this.scrollDrag || Math.abs(this.scroll.vel) > 30;
    for (const sp of this.played) this.stepSprite(sp, dt, false);
    for (const sp of this.hand) this.stepSprite(sp, dt, fast);
    for (const sp of this.leaving) this.stepSprite(sp, dt, false);
    if (this.drag) this.stepSprite(this.drag.sprite, dt, true);

    if (this.leaving.length) {
      this.leaving = this.leaving.filter((sp) => {
        if (now < sp.removeAt) return true;
        sp.destroy();
        return false;
      });
    }

    this.updatePlayButtons(now);
    this.updateHints();
  }

  stepSprite(sp, dt, stiff) {
    const s = this.s;
    if (sp.isDrag || stiff) sp.step(dt, s.dragStiffness, s.dragDamping);
    else sp.step(dt, s.stiffness, s.damping);
    sp.render();
  }

  updateTargets(now) {
    const m = this.m;
    const s = this.s;
    const drag = this.drag;
    const n = this.hand.length;
    const gap = drag ? drag.gapIndex : -1;
    const { slots, half } = this.layoutHand(gap >= 0 ? 1 : 0);
    this.slots = slots;
    this.gap = gap;
    this.half = half;
    const peek = s.peekEnabled ? this.peek : -1;

    for (let i = 0; i < n; i++) {
      const sp = this.hand[i];
      const si = gap >= 0 && i >= gap ? i + 1 : i;
      if (sp.waitUntil > now) {
        sp.z = 90 - i; // waiting on the deck/pile: first to leave is on top
        continue;
      }
      sp.z = i === peek ? 400 : 100 + si;
      const slot = slots[si];
      let x = slot.x;
      let y = slot.y;
      let rot = slot.rot;
      let scale = 1;
      let lift = 0;

      if (sp.selected) {
        y -= s.selectLift * m.ch;
        lift = 0.35;
      }
      if (peek >= 0) {
        const d = i - peek;
        if (d === 0) {
          scale = s.peekScale;
          const fullyVisibleY = m.H - m.safe.bottom - (m.ch * scale) / 2 - 6;
          y = Math.min(y, fullyVisibleY) - s.peekLift * m.ch;
          if (s.peekStraighten) rot = 0;
          const hw = (m.cw * scale) / 2 + 4;
          x = clamp(x, m.safe.left + hw, m.W - m.safe.right - hw);
          lift = 1;
        } else {
          x += Math.sign(d) * s.spread * m.cw * Math.pow(s.falloff, Math.abs(d) - 1);
        }
      }
      sp.target(x, y, rot, scale, 0, lift);
    }

    if (drag) {
      const sp = drag.sprite;
      const v = drag.tracker.velocity(now);
      // Positive setting = "physical": the card trails like it's held near its bottom edge.
      const tilt = clamp((-v.x * s.dragTilt) / 1000, -s.dragMaxTilt, s.dragMaxTilt);
      sp.target(drag.fx + drag.ox, drag.fy + drag.oy, tilt, s.dragScale, 0, 1);
      sp.z = 1000;
    }

    this.played.forEach((sp, i) => {
      sp.z = 10 + i;
      if (sp.waitUntil > now) return;
      const o = sp.pile;
      sp.target(m.pz.x + o.x * m.cw, m.pz.y + o.y * m.ch, o.rot, 1, 0, 0);
    });

    for (const sp of this.leaving) {
      sp.z = 50;
      sp.target(m.deck.x, m.deck.y, 0, 1, 1, 0);
    }
  }

  // ---------------------------------------------------------- play buttons

  updatePlayButtons(now) {
    const want = this.s.playButton;
    for (const sp of this.hand) {
      if (want && sp.selected && sp.waitUntil <= now && !this.buttons.has(sp)) this.addPlayButton(sp);
    }
    const m = this.m;
    for (const sp of this.buttons) {
      if (!want || !sp.selected || sp.isDrag || !this.hand.includes(sp)) {
        this.removePlayButton(sp);
        continue;
      }
      // Sit just above the card's top edge, following its rotation & scale,
      // but keep the button itself upright.
      const r = (sp.rot.v * Math.PI) / 180;
      const off = (m.ch * sp.scale.v) / 2 + 20;
      const x = sp.x.v + Math.sin(r) * off;
      const y = sp.y.v - Math.cos(r) * off;
      const t = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
      if (t !== sp.playBtnT) {
        sp.playBtn.style.transform = t;
        sp.playBtnT = t;
      }
    }
  }

  addPlayButton(sp) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'play-btn';
    b.textContent = 'Play';
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.playFromHand(sp);
    });
    this.els.ui.append(b);
    sp.playBtn = b;
    sp.playBtnT = '';
    this.buttons.add(sp);
    requestAnimationFrame(() => b.classList.add('show'));
  }

  removePlayButton(sp) {
    const b = sp.playBtn;
    this.buttons.delete(sp);
    sp.playBtn = null;
    if (!b) return;
    b.classList.remove('show');
    b.disabled = true;
    setTimeout(() => b.remove(), 180);
  }

  // --------------------------------------------------------- overflow hints

  updateHints() {
    let l = 0;
    let r = 0;
    if (this.s.overflow === 'scroll' && this.s.overflowHint !== 'none' && this.half > 0) {
      const m = this.m;
      const lim = m.cw * 0.1;
      this.slots.forEach((sl, i) => {
        if (i === this.gap) return;
        if (sl.x < m.safe.left + lim) l++;
        else if (sl.x > m.W - m.safe.right - lim) r++;
      });
    }
    if (l !== this.hintL) {
      this.hintL = l;
      this.els.edgeL.classList.toggle('show', l > 0);
      if (l > 0) this.els.edgeL.firstElementChild.textContent = `‹ ${l}`;
    }
    if (r !== this.hintR) {
      this.hintR = r;
      this.els.edgeR.classList.toggle('show', r > 0);
      if (r > 0) this.els.edgeR.firstElementChild.textContent = `${r} ›`;
    }
  }
}
