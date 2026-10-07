// Estimates pointer velocity (px/s) from a short window of recent samples.
// Evaluating against "now" makes the estimate decay to zero when the finger
// stops moving, even though no further pointermove events arrive.
export class VelocityTracker {
  constructor(windowMs = 80) {
    this.windowMs = windowMs;
    this.samples = [];
  }

  add(t, x, y) {
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > this.windowMs * 1.5) this.samples.shift();
  }

  velocity(now) {
    const s = this.samples;
    if (s.length < 2) return { x: 0, y: 0 };
    const last = s[s.length - 1];
    let first = null;
    for (const p of s) {
      if (now - p.t <= this.windowMs) { first = p; break; }
    }
    if (!first || first === last) return { x: 0, y: 0 };
    const dt = Math.max(16, now - first.t) / 1000;
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
  }
}
