import { VelocityTracker } from './velocity.js';

/**
 * Pointer gesture state machine for the hand. Works for touch, mouse and pen.
 *
 *   idle --down on hand--> press --move > 8px--> scrub
 *     press/scrub --mostly-upward move > threshold--> drag
 *     press --long press--> drag
 *     press --up--> tap (toggle select)
 *     drag --up--> play / snap back / reorder
 *
 * When the hand overflows the screen (overflow = scroll), horizontal motion in
 * the scrub state either scrolls the hand 1:1 (swipe), auto-scrolls near the
 * edges (edge), or maps the finger across the whole hand (proportional).
 * The mouse wheel / trackpad scrolls the hand in every mode.
 *
 * Mouse/pen extras: hovering over the hand peeks (no button needed), the
 * cursor reflects what's under it, and a dragged card stays where it was grabbed.
 *
 * Only one pointer is tracked at a time. Coordinates are converted to
 * screen-local px (accounting for the scaled desktop phone frame).
 * The game's `peek` index is the single source of truth for "the card under
 * the pointer".
 */
export class Input {
  constructor(el, game, device, settings) {
    this.el = el;
    this.game = game;
    this.device = device;
    this.s = settings;
    this.pid = null;
    this.pointerType = 'touch';
    this.state = 'idle';
    this.hovering = false;
    this.cursor = '';
    this.lpTimer = 0;
    this.rect = null;
    this.scale = 1;
    this.start = null;
    this.anchor = null;
    this.last = null;
    this.scrollStart = 0;
    this.tracker = new VelocityTracker();

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e, false));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('pointerleave', () => {
      if (this.pid === null) this.clearHover();
    });
    el.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === this.pid) this.up(e, true);
    });
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dragstart', (e) => e.preventDefault());
    // Stops iOS from starting text selection / magnifier / double-tap zoom.
    el.addEventListener(
      'touchstart',
      (e) => {
        if (!(e.target instanceof Element && e.target.closest('button'))) e.preventDefault();
      },
      { passive: false },
    );
  }

  measure() {
    this.rect = this.el.getBoundingClientRect();
    this.scale = this.device.scale;
  }

  local(e) {
    return {
      x: (e.clientX - this.rect.left) / this.scale,
      y: (e.clientY - this.rect.top) / this.scale,
    };
  }

  setCursor(c) {
    if (c === this.cursor) return;
    this.cursor = c;
    this.el.style.cursor = c;
  }

  /** How horizontal motion behaves right now: 'scrub' or a scroll mode. */
  scrollMode() {
    return this.s.overflow === 'scroll' && this.game.canScroll() ? this.s.scrollMode : 'scrub';
  }

  // ----------------------------------------------------------------- wheel

  wheel(e) {
    const g = this.game;
    if (!g.canScroll()) return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1;
    g.scrollBy((d * unit) / (this.device.scale || 1));
  }

  // ----------------------------------------------------------------- hover

  hover(e) {
    if (e.pointerType === 'touch' || this.device.rotating) return;
    // Over a Play button (or the gear): freeze the hover state so the button
    // doesn't move away from the cursor.
    if (e.target instanceof Element && e.target.closest('button')) return;
    this.measure();
    const p = this.local(e);
    const g = this.game;
    const idx = g.handIndexAt(p, this.hovering ? g.peek : -1);
    if (this.s.hoverPeek && idx >= 0) {
      this.hovering = true;
      g.hoverX = p.x;
      g.setPeek(idx);
      g.setActive(true);
    } else if (this.hovering) {
      this.clearHover();
    }
    this.setCursor(idx >= 0 ? 'grab' : g.hitDeck(p) || g.hitPile(p) ? 'pointer' : '');
  }

  clearHover() {
    if (this.hovering) {
      this.hovering = false;
      this.game.hoverX = null;
      this.game.setPeek(-1);
      this.game.setActive(false);
    }
    this.setCursor('');
  }

  // --------------------------------------------------------------- gesture

  down(e) {
    if (this.pid !== null || this.device.rotating) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button')) return;
    if (e.pointerType === 'mouse') e.preventDefault(); // no text selection / focus stealing

    this.measure();
    const p = this.local(e);
    const g = this.game;

    // While hovering, hit-test against what the user sees (the peeked card).
    const idx = g.handIndexAt(p, this.hovering ? g.peek : -1);
    this.hovering = false;
    g.hoverX = null;
    if (idx >= 0) {
      this.pid = e.pointerId;
      this.pointerType = e.pointerType || 'touch';
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      this.state = 'press';
      this.start = p;
      this.anchor = p;
      this.last = p;
      this.scrollStart = g.scroll.v;
      this.tracker = new VelocityTracker();
      this.tracker.add(performance.now(), p.x, p.y);
      g.setActive(true);
      g.setPeek(idx);
      const mode = this.scrollMode();
      g.scrubX = mode === 'drag' ? null : p.x;
      if (mode === 'proportional') this.scrollProportional(p.x);
      g.haptic(4);
      if (this.pointerType !== 'touch') this.setCursor('grabbing');
      clearTimeout(this.lpTimer);
      if (this.s.longPress > 0) this.lpTimer = setTimeout(() => this.onLongPress(), this.s.longPress);
      return;
    }
    g.setPeek(-1);
    g.setActive(false);
    if (g.hitDeck(p)) {
      if (g.draw(1)) g.haptic(8);
      return;
    }
    if (g.hitPile(p)) {
      g.returnPlayed();
      g.haptic(8);
    }
  }

  move(e) {
    if (this.pid === null) {
      this.hover(e);
      return;
    }
    if (e.pointerId !== this.pid) return;
    const p = this.local(e);
    const now = performance.now();
    const g = this.game;
    this.last = p;
    this.tracker.add(now, p.x, p.y);

    if (this.state === 'drag') {
      g.moveDrag(p.x, p.y, now);
      return;
    }

    // The anchor is the low point of the current "upward stroke". Mostly
    // sideways motion keeps resetting it, so only a deliberate upward move
    // (not drift while scrubbing) pulls a card out of the hand.
    const a = this.anchor;
    if (p.y >= a.y || Math.abs(p.x - a.x) > 1.4 * (a.y - p.y) + 12) this.anchor = p;

    if (this.state === 'press' && Math.hypot(p.x - this.start.x, p.y - this.start.y) > 8) {
      this.state = 'scrub';
      clearTimeout(this.lpTimer);
    }

    if (this.anchor.y - p.y > this.s.dragThreshold) {
      this.beginDrag(p, now);
      return;
    }

    const mode = this.scrollMode();
    if (mode === 'drag') {
      // Swipe: the hand sticks to the finger, so the peeked card stays put.
      if (this.state === 'scrub') g.dragScrollTo(this.scrollStart - (p.x - this.start.x));
      g.scrubX = null;
      return;
    }
    if (mode === 'proportional') this.scrollProportional(p.x);
    g.scrubX = p.x; // edge mode auto-scrolls from this in the game loop

    const idx = g.slotAt(p.x, g.peek);
    if (idx !== g.peek && idx >= 0) {
      g.setPeek(idx);
      g.haptic(4);
    }
  }

  /** Proportional mode: finger position across the screen maps to the whole hand. */
  scrollProportional(x) {
    const m = this.game.m;
    const left = m.safe.left + m.cw * 0.6;
    const right = m.W - m.safe.right - m.cw * 0.6;
    this.game.scrollToFraction((x - left) / Math.max(1, right - left));
  }

  onLongPress() {
    if (this.state !== 'press' || this.pid === null) return;
    this.beginDrag(this.last, performance.now());
  }

  beginDrag(p, now) {
    clearTimeout(this.lpTimer);
    const g = this.game;
    if (g.peek < 0) return;
    if (g.pickUp(g.peek, p.x, p.y, now, this.pointerType)) this.state = 'drag';
  }

  up(e, cancelled) {
    if (e.pointerId !== this.pid) return;
    clearTimeout(this.lpTimer);
    const g = this.game;
    const now = performance.now();

    if (this.state === 'drag') {
      if (!cancelled) {
        const p = this.local(e);
        g.moveDrag(p.x, p.y, now);
      }
      g.release(now, cancelled);
    } else if (this.state === 'press' && !cancelled) {
      g.toggleSelect(g.peek);
    }
    g.endScrollDrag(cancelled ? 0 : this.tracker.velocity(now).x);
    g.scrubX = null;
    g.setPeek(-1);
    g.setActive(false);
    this.pid = null;
    this.state = 'idle';
    this.hovering = false;
    this.setCursor('');
    // A mouse is still over the table after release: resume hover right away.
    if (!cancelled && e.pointerType && e.pointerType !== 'touch') this.hover(e);
  }

  /** Abort any gesture in progress (e.g. rotation or a panel action). */
  cancel() {
    if (this.pid === null) {
      this.clearHover();
      return;
    }
    const pid = this.pid;
    this.up({ pointerId: pid }, true);
    try {
      this.el.releasePointerCapture(pid);
    } catch {
      /* already released */
    }
  }
}
