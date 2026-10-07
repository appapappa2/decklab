// Damped harmonic spring (mass = 1). Integrated with fixed sub-steps so the
// motion is identical at 60Hz, 120Hz, or after a dropped frame.
const MAX_STEP = 1 / 240;

export class Spring {
  constructor(value = 0, epsilon = 0.01) {
    this.v = value; // current value
    this.t = value; // target
    this.vel = 0;
    this.eps = epsilon;
  }

  set(value) {
    this.v = this.t = value;
    this.vel = 0;
  }

  /** @returns {boolean} whether the value moved */
  step(dt, stiffness, dampingRatio) {
    if (this.vel === 0 && this.v === this.t) return false;
    const k = stiffness;
    const c = 2 * dampingRatio * Math.sqrt(k);
    let remaining = dt;
    while (remaining > 1e-9) {
      const h = remaining > MAX_STEP ? MAX_STEP : remaining;
      this.vel += (-k * (this.v - this.t) - c * this.vel) * h; // semi-implicit Euler
      this.v += this.vel * h;
      remaining -= h;
    }
    if (Math.abs(this.v - this.t) < this.eps && Math.abs(this.vel) < this.eps * 10) {
      this.v = this.t;
      this.vel = 0;
    }
    return true;
  }
}
