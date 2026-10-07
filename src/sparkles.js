const MAX_PARTICLES = 45;
const MAX_EMISSION = 6;
const EMISSION_RATE = 90;
const COLORS = ['#fffaf0', '#fffaf0', '#fffaf0', '#f3dfb7', '#dcd0ff', '#cdeff3'];

/** Sharp foil trails and small landing bursts, local to the card table. */
export class SparkleTrail {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    try {
      this.ctx = canvas?.getContext('2d') ?? null;
    } catch {
      // Canvas may be unavailable; the cards still work without the effect.
    }
    this.width = 0;
    this.height = 0;
    this.particles = [];
    this.previous = new WeakMap();
    this.frame = 0;
    this.budget = 0;
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
    // A resize can relocate every card. Start fresh rather than trailing that jump.
    this.reset();
    if (!this.canvas) return;
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    this.canvas.width = Math.ceil(this.width * dpr);
    this.canvas.height = Math.ceil(this.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  reset() {
    this.particles.length = 0;
    this.previous = new WeakMap();
    this.budget = 0;
    this.clear();
  }

  clear() {
    if (!this.painted || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.painted = false;
  }

  update(dt, game) {
    // Landing events are one-shot. Drain them even when effects are disabled,
    // so restoring motion or a canvas cannot replay old landings.
    const landings = Array.isArray(game?.landingEvents) ? game.landingEvents.splice(0) : [];
    if (!this.ctx || !this.width || !this.height || this.reduced) return;
    const step = Number.isFinite(dt) ? Math.min(0.05, Math.max(0, dt)) : 0;
    if (!step) return;
    this.frame++;
    this.budget = Math.min(MAX_EMISSION, this.budget + step * EMISSION_RATE);
    const now = globalThis.performance?.now() ?? Date.now();
    const cw = game.m?.cw;
    const ch = game.m?.ch;
    if (Number.isFinite(cw) && cw > 0 && Number.isFinite(ch) && ch > 0) {
      for (const list of [game.hand, game.played, game.leaving]) {
        if (list) for (const sprite of list) this.observe(sprite, cw, ch, step, now);
      }
      if (game.drag?.sprite) this.observe(game.drag.sprite, cw, ch, step, now);
      const seen = new Set();
      for (const sprite of landings) {
        if (seen.has(sprite)) continue;
        seen.add(sprite);
        this.observe(sprite, cw, ch, step, now);
        this.burst(sprite, cw, ch);
      }
    }

    // Compact in place so a long session does not accumulate expired particles.
    let alive = 0;
    for (const p of this.particles) {
      p.age += step;
      if (p.age >= p.life) continue;
      p.x += p.vx * step;
      p.y += p.vy * step;
      const drag = Math.exp(-step * 3);
      p.vx *= drag;
      p.vy *= drag;
      this.particles[alive++] = p;
    }
    this.particles.length = alive;
    if (!alive) {
      this.clear();
      return;
    }
    this.draw();
  }

  observe(sp, cw, ch, dt, now) {
    if (!sp) return;
    let prev = this.previous.get(sp);
    if (prev?.frame === this.frame) return;
    const x = sp.x?.v;
    const y = sp.y?.v;
    const rot = (sp.rot?.v ?? 0) * Math.PI / 180;
    const scale = sp.scale?.v ?? 1;
    const flip = sp.flip?.v ?? 0;
    const ready = Number.isFinite(x) && Number.isFinite(y) &&
      Number.isFinite(rot) && Number.isFinite(scale) && scale > 0 &&
      Number.isFinite(flip) && Math.cos(flip * Math.PI) > 0.3 &&
      !(sp.waitUntil > now);
    if (!prev) {
      this.previous.set(sp, { x, y, rot, scale, ready, carry: 0, frame: this.frame });
      return;
    }
    const dx = x - prev.x;
    const dy = y - prev.y;
    const distance = Math.hypot(dx, dy);
    const turn = Math.atan2(Math.sin(rot - prev.rot), Math.cos(rot - prev.rot));
    const radius = Math.hypot(cw, ch) / 2;
    const travel = distance + Math.abs(turn) * radius * scale * 0.45 +
      Math.abs(scale - prev.scale) * radius * 0.65;
    const speed = travel / dt;
    if (sp.isFoil && ready && prev.ready && distance < Math.max(180, ch * 1.4) &&
        speed > 26 && travel > 0.25) {
      const strength = Math.min(1, speed / 320);
      prev.carry += travel / 20 * Math.max(0.3, strength);
      const wanted = Math.floor(prev.carry);
      // Never queue missed emissions: a busy frame must not become a later burst.
      prev.carry -= wanted;
      const count = Math.min(wanted, 3, Math.floor(this.budget), MAX_PARTICLES - this.particles.length);
      this.budget -= count;
      for (let i = 0; i < count; i++) {
        this.emit(prev, { x, y, rot, scale }, cw, ch, dx, dy, turn, dt, (i + Math.random()) / count);
      }
    } else {
      prev.carry = 0;
    }
    Object.assign(prev, { x, y, rot, scale, ready, frame: this.frame });
  }

  burst(sp, cw, ch) {
    const source = this.previous.get(sp);
    if (!source?.ready) return;
    const count = Math.min(12, MAX_PARTICLES - this.particles.length);
    if (!count) return;
    const hw = cw * source.scale / 2;
    const hh = ch * source.scale / 2;
    const perimeter = (hw + hh) * 4;
    const cos = Math.cos(source.rot);
    const sin = Math.sin(source.rot);
    // Equal spacing around the complete perimeter keeps the burst balanced.
    const offset = Math.random();
    for (let i = 0; i < count; i++) {
      let distance = (i + offset) / count * perimeter;
      let lx;
      let ly;
      if (distance < hw * 2) {
        lx = -hw + distance;
        ly = -hh;
      } else if ((distance -= hw * 2) < hh * 2) {
        lx = hw;
        ly = -hh + distance;
      } else if ((distance -= hh * 2) < hw * 2) {
        lx = hw - distance;
        ly = hh;
      } else {
        lx = -hw;
        ly = hh - (distance - hw * 2);
      }
      const length = Math.hypot(lx, ly);
      const nx = lx / length;
      const ny = ly / length;
      const outwardX = cos * nx - sin * ny;
      const outwardY = sin * nx + cos * ny;
      const speed = 40 + Math.random() * 50;
      this.particles.push({
        source,
        halfWidth: cw / 2,
        halfHeight: ch / 2,
        x: source.x + cos * lx - sin * ly + outwardX * 3,
        y: source.y + sin * lx + cos * ly + outwardY * 3,
        vx: outwardX * speed,
        vy: outwardY * speed,
        age: 0,
        life: 0.22 + Math.random() * 0.12,
        size: 1.3 + Math.random(),
        angle: Math.random() * Math.PI,
        phase: Math.random() * Math.PI * 2,
        color: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }
  }

  emit(prev, current, cw, ch, dx, dy, turn, dt, t) {
    const rot = prev.rot + turn * t;
    const scale = prev.scale + (current.scale - prev.scale) * t;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const hw = cw * scale / 2;
    const hh = ch * scale / 2;
    let lx;
    let ly;
    let nx;
    let ny;
    if (Math.hypot(dx, dy) > 0.3) {
      // Choose the rear edge in the card's own orientation, outside the face.
      const localX = cos * dx + sin * dy;
      const localY = -sin * dx + cos * dy;
      if (Math.abs(localX) / hw > Math.abs(localY) / hh) {
        nx = -Math.sign(localX);
        ny = 0;
        lx = nx * (hw + 3);
        ly = (Math.random() - 0.5) * hh * 1.6;
      } else {
        nx = 0;
        ny = -Math.sign(localY);
        lx = (Math.random() - 0.5) * hw * 1.6;
        ly = ny * (hh + 3);
      }
    } else {
      // Rotation and scale changes catch the light along the perimeter too.
      // Use its current boundary so these glints never begin below the face.
      t = 1;
      const edge = (Math.random() * 4) | 0;
      nx = edge < 2 ? (edge ? 1 : -1) : 0;
      ny = edge >= 2 ? (edge === 2 ? -1 : 1) : 0;
      lx = nx ? nx * (cw * current.scale / 2 + 3) : (Math.random() - 0.5) * cw * current.scale * 0.8;
      ly = ny ? ny * (ch * current.scale / 2 + 3) : (Math.random() - 0.5) * ch * current.scale * 0.8;
    }
    const angle = t === 1 ? current.rot : rot;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const outwardX = c * nx - s * ny;
    const outwardY = s * nx + c * ny;
    const drift = 5 + Math.random() * 8;
    this.particles.push({
      source: prev,
      halfWidth: cw / 2,
      halfHeight: ch / 2,
      x: prev.x + dx * t + c * lx - s * ly,
      y: prev.y + dy * t + s * lx + c * ly,
      vx: Math.max(-28, Math.min(28, dx / dt * 0.025)) + outwardX * drift + (Math.random() - 0.5) * 8,
      vy: Math.max(-28, Math.min(28, dy / dt * 0.025)) + outwardY * drift + (Math.random() - 0.5) * 8 - 3,
      age: 0,
      life: 0.18 + Math.random() * 0.12,
      size: 1.2 + Math.random(),
      angle: Math.random() * Math.PI,
      phase: Math.random() * Math.PI * 2,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    });
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    for (const p of this.particles) {
      const source = p.source;
      if (!source.ready) continue;
      // Measure from the live card edge, so each trail follows its own card
      // through translation, rotation and scale without any layout reads.
      const dx = p.x - source.x;
      const dy = p.y - source.y;
      const cos = Math.cos(source.rot);
      const sin = Math.sin(source.rot);
      const edgeX = Math.max(0, Math.abs(cos * dx + sin * dy) - p.halfWidth * source.scale);
      const edgeY = Math.max(0, Math.abs(-sin * dx + cos * dy) - p.halfHeight * source.scale);
      const distance = Math.hypot(edgeX, edgeY);
      const t = Math.min(1, distance / (p.halfWidth * source.scale * 2.5));
      const proximity = 1 - t * t * (3 - 2 * t);
      const fade = Math.min(1, (p.life - p.age) / 0.06) * Math.min(1, p.age / 0.01);
      const twinkle = 0.9 + Math.sin(p.phase + p.age * 18) * 0.1;
      const alpha = fade * twinkle * proximity;
      const size = p.size * (0.85 + twinkle * 0.15);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      // A clean four-point glint, with no confetti or heavy glow.
      for (let i = 0; i < 8; i++) {
        const angle = p.angle + i * Math.PI / 4;
        const radius = size * (i % 2 ? 0.2 : 1.45);
        const x = p.x + Math.cos(angle) * radius;
        const y = p.y + Math.sin(angle) * radius;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(p.x) - 0.5, Math.round(p.y) - 0.5, 1, 1);
    }
    ctx.globalAlpha = 1;
    this.painted = true;
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
