/**
 * Pointer gesture state machine for the hand. Works for touch, mouse and pen.
 *
 *   idle --down on hand--> press --move > 8px--> scrub
 *     press/scrub --mostly-upward move > threshold--> drag
 *     press --long press--> drag
 *     press --up--> tap (toggle select)
 *     drag --up--> play / snap back / reorder
 *
 * Mouse/pen extras: hovering over the hand peeks (no button needed), the
 * cursor reflects what's under it, and a dragged card stays where it was grabbed.
 *
 * Only one pointer is tracked at a time. Coordinates are converted to
 * screen-local px (accounting for the scaled desktop phone frame).
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
    this.idx = -1;
    this.hoverIdx = -1;
    this.cursor = '';
    this.lpTimer = 0;
    this.rect = null;
    this.scale = 1;
    this.start = null;
    this.anchor = null;
    this.last = null;

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

  // ----------------------------------------------------------------- hover

  hover(e) {
    if (e.pointerType === 'touch' || this.device.rotating) return;
    this.measure();
    const p = this.local(e);
    const g = this.game;
    const idx = g.handIndexAt(p, this.hoverIdx);
    const peekIdx = this.s.hoverPeek ? idx : -1;
    if (peekIdx !== this.hoverIdx) {
      this.hoverIdx = peekIdx;
      g.setPeek(peekIdx);
      g.setActive(peekIdx >= 0);
    }
    this.setCursor(idx >= 0 ? 'grab' : g.hitDeck(p) || g.hitPile(p) ? 'pointer' : '');
  }

  clearHover() {
    if (this.hoverIdx >= 0) {
      this.hoverIdx = -1;
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
    const idx = g.handIndexAt(p, this.hoverIdx);
    if (idx >= 0) {
      this.pid = e.pointerId;
      this.pointerType = e.pointerType || 'touch';
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      this.state = 'press';
      this.idx = idx;
      this.start = p;
      this.anchor = p;
      this.last = p;
      g.setActive(true);
      g.setPeek(idx);
      g.haptic(4);
      if (this.pointerType !== 'touch') this.setCursor('grabbing');
      clearTimeout(this.lpTimer);
      if (this.s.longPress > 0) this.lpTimer = setTimeout(() => this.onLongPress(), this.s.longPress);
      return;
    }
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

    const idx = g.slotAt(p.x, this.idx);
    if (idx !== this.idx && idx >= 0) {
      this.idx = idx;
      g.setPeek(idx);
      g.haptic(4);
    }
  }

  onLongPress() {
    if (this.state !== 'press' || this.pid === null) return;
    this.beginDrag(this.last, performance.now());
  }

  beginDrag(p, now) {
    clearTimeout(this.lpTimer);
    if (this.game.pickUp(this.idx, p.x, p.y, now, this.pointerType)) this.state = 'drag';
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
      g.toggleSelect(this.idx);
    }
    g.setPeek(-1);
    g.setActive(false);
    this.pid = null;
    this.state = 'idle';
    this.idx = -1;
    this.hoverIdx = -1;
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
