// Debug overlay: play line, hand zone, slot positions, finger, FPS.
export class DebugOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 0;
    this.H = 0;
    this.enabled = false;
    this.fps = 0;
    this.worst = 0;
    this.frames = 0;
    this.acc = 0;
    this.maxDt = 0;
  }

  resize(W, H) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = W;
    this.H = H;
  }

  setEnabled(on) {
    this.enabled = on;
    this.canvas.style.display = on ? 'block' : 'none';
    if (!on) this.ctx.clearRect(0, 0, this.W, this.H);
  }

  frame(rawDt, game, input) {
    this.frames++;
    this.acc += rawDt;
    this.maxDt = Math.max(this.maxDt, rawDt);
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.worst = this.maxDt * 1000;
      this.frames = 0;
      this.acc = 0;
      this.maxDt = 0;
    }
    if (this.enabled) this.draw(game, input);
  }

  draw(game, input) {
    const { ctx } = this;
    const m = game.m;
    const s = game.s;
    if (!m) return;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.font = '600 10px -apple-system, system-ui, sans-serif';
    ctx.lineWidth = 1;

    const hline = (y, color, text) => {
      ctx.strokeStyle = color;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(m.W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(text, m.W - m.safe.right - 8, y - 4);
    };

    hline(s.playLine * m.H, 'rgba(255,90,90,.95)', 'play line');
    hline(m.handTop - m.ch * 0.15, 'rgba(90,170,255,.95)', 'hand zone');

    ctx.strokeStyle = 'rgba(255,220,0,.7)';
    ctx.strokeRect(m.pz.x - m.pz.w / 2, m.pz.y - m.pz.h / 2, m.pz.w, m.pz.h);

    // Safe area
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.strokeRect(m.safe.left, m.safe.top, m.W - m.safe.left - m.safe.right, m.H - m.safe.top - m.safe.bottom);

    // Slots
    ctx.textAlign = 'center';
    game.slots.forEach((sl, i) => {
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, 4, 0, Math.PI * 2);
      if (i === game.gap) {
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillText(String(i), sl.x, sl.y - 8);
      ctx.strokeStyle = 'rgba(255,0,200,.8)';
      ctx.beginPath();
      ctx.moveTo(sl.px, m.handTop - 6);
      ctx.lineTo(sl.px, m.handTop + 6);
      ctx.stroke();
    });

    // Finger
    const d = game.drag;
    const finger = d ? { x: d.fx, y: d.fy } : input.state !== 'idle' ? input.last : null;
    if (finger) {
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath();
      ctx.arc(finger.x, finger.y, 18, 0, Math.PI * 2);
      ctx.stroke();
      if (d) {
        ctx.beginPath();
        ctx.moveTo(finger.x, finger.y);
        ctx.lineTo(finger.x + d.ox, finger.y + d.oy);
        ctx.stroke();
      }
    }

    // Stats
    const scroll = game.half > 0 ? ` · scroll ${game.scroll.v.toFixed(0)}/±${game.half.toFixed(0)}` : '';
    const text = `${this.fps.toFixed(0)} fps · worst ${this.worst.toFixed(1)} ms · ${game.hand.length} in hand · ${input.state}${scroll}`;
    ctx.textAlign = 'left';
    const tx = m.safe.left + 10;
    const ty = m.safe.top + 10;
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(tx, ty, w, 18);
    ctx.fillStyle = '#9ff5c4';
    ctx.fillText(text, tx + 6, ty + 12.5);
  }
}
