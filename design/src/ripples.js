const MAX_RIPPLES = 8;
const RIPPLE_LIFE = 0.76;
const ECHO_DELAY = 0.11;

/** A quiet ripple in the table surface, anchored at each card's landing. */
export class LandingRipples {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    try {
      this.ctx = canvas?.getContext('2d') ?? null;
    } catch {
      // The table remains usable when a canvas context is unavailable.
    }
    this.width = 0;
    this.height = 0;
    this.ripples = [];
    this.painted = false;
    this.motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reduced = this.motionQuery?.matches ?? false;
    this.onMotionChange = (event) => {
      this.reduced = event.matches;
      this.reset();
    };
    if (this.motionQuery?.addEventListener) {
      this.motionQuery.addEventListener('change', this.onMotionChange);
    } else {
      this.motionQuery?.addListener?.(this.onMotionChange);
    }
  }

  resize(width, height) {
    this.width = Number.isFinite(width) ? Math.max(0, width) : 0;
    this.height = Number.isFinite(height) ? Math.max(0, height) : 0;
    this.reset();
    if (!this.canvas) return;
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    this.canvas.width = Math.ceil(this.width * dpr);
    this.canvas.height = Math.ceil(this.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  reset() {
    this.ripples.length = 0;
    this.clear();
  }

  clear() {
    if (!this.painted || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.painted = false;
  }

  update(dt, game) {
    if (!this.ctx || !this.width || !this.height || this.reduced) return;
    const step = Number.isFinite(dt) ? Math.min(0.05, Math.max(0, dt)) : 0;
    let alive = 0;
    for (const ripple of this.ripples) {
      ripple.age += step;
      if (ripple.age < RIPPLE_LIFE) this.ripples[alive++] = ripple;
    }
    this.ripples.length = alive;

    // Sparkles consume this queue after us. Read it without changing its contents.
    const cw = game?.m?.cw;
    if (Array.isArray(game?.landingEvents) && Number.isFinite(cw) && cw > 0) {
      const seen = new Set();
      for (const sprite of game.landingEvents) {
        if (!sprite?.isFoil || seen.has(sprite)) continue;
        seen.add(sprite);
        const x = sprite.x?.v;
        const y = sprite.y?.v;
        const scale = sprite.scale?.v ?? 1;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale) || scale <= 0) continue;
        if (this.ripples.length === MAX_RIPPLES) this.ripples.shift();
        // Store numbers, rather than the sprite, so the wave stays on the table.
        this.ripples.push({ x, y, size: cw * scale, age: 0 });
      }
    }
    if (!this.ripples.length) {
      this.clear();
      return;
    }
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    for (const ripple of this.ripples) {
      this.drawWave(ripple, ripple.age, RIPPLE_LIFE, 0.1);
      this.drawWave(ripple, ripple.age - ECHO_DELAY, RIPPLE_LIFE - ECHO_DELAY, 0.022);
    }
    this.painted = true;
  }

  drawWave(ripple, age, lifetime, strength) {
    if (age <= 0 || age >= lifetime) return;
    const ctx = this.ctx;
    const progress = age / lifetime;
    // A wave keeps propagating as its crest broadens and dissipates into the table.
    const radius = ripple.size * (0.62 + progress * 1.3);
    const softness = ripple.size * (0.028 + progress * 0.09);
    const onset = Math.min(1, age / 0.055);
    const alpha = strength * onset * onset * (3 - 2 * onset) * Math.pow(1 - progress, 2);
    const ring = ctx.createRadialGradient(
      ripple.x, ripple.y, radius - softness,
      ripple.x, ripple.y, radius + softness,
    );
    ring.addColorStop(0, 'rgba(132, 136, 143, 0)');
    ring.addColorStop(0.35, `rgba(132, 136, 143, ${alpha * 0.7})`);
    ring.addColorStop(0.5, `rgba(132, 136, 143, ${alpha})`);
    ring.addColorStop(0.65, `rgba(132, 136, 143, ${alpha * 0.7})`);
    ring.addColorStop(1, 'rgba(132, 136, 143, 0)');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, radius + softness, 0, Math.PI * 2);
    ctx.fill();
  }

  destroy() {
    this.reset();
    if (this.motionQuery?.removeEventListener) {
      this.motionQuery.removeEventListener('change', this.onMotionChange);
    } else {
      this.motionQuery?.removeListener?.(this.onMotionChange);
    }
  }
}
