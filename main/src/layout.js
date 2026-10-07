// Pure layout math. Everything is derived from the container size + safe areas,
// so the emulated frame and a real phone go through exactly the same code.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function computeMetrics(W, H, safe, s) {
  const landscape = W > H;
  let cw, ch;
  if (landscape) {
    ch = H * 0.3 * s.cardScale;
    cw = ch / 1.4;
  } else {
    cw = W * 0.235 * s.cardScale;
    ch = cw * 1.4;
  }

  const left = safe.left + 8;
  const right = W - safe.right - 8;
  const handCenterX = (left + right) / 2;
  const handAvail = (right - left) * s.handWidth;
  const handBaseY = H - safe.bottom - ch / 2 + s.handDrop * ch;
  const handTop = handBaseY - ch / 2;

  const tableTop = safe.top + 10;
  const pzH = Math.max(ch * 0.8, Math.min(ch * 1.32, handTop - tableTop - ch * 0.25));
  const pzW = cw * 1.9;
  const pzY = (tableTop + handTop - ch * 0.15) / 2;
  const pz = { x: W / 2, y: pzY, w: pzW, h: pzH };

  const deck = landscape
    ? { x: safe.left + 18 + cw / 2, y: pzY }
    : { x: safe.left + 18 + cw / 2, y: tableTop + 8 + ch / 2 };

  return { W, H, safe, landscape, cw, ch, handCenterX, handAvail, handBaseY, handTop, pz, deck };
}

/**
 * Rest positions for n cards in the hand.
 * `px` is the "pick" x used for scrubbing: shifted toward each card's visible
 * strip (cards overlap left-to-right) depending on `scrubBias`.
 */
export function handSlots(n, m, s, spread) {
  const slots = [];
  if (n <= 0) return { slots, spacing: 0 };
  const { cw, ch } = m;
  const tight = s.layout === 'stack' && !spread;
  const maxSp = (tight ? s.stackSpacing : s.maxSpacing) * cw;
  const fit = n > 1 ? (m.handAvail - cw) / (n - 1) : maxSp;
  const spacing = n > 1 ? Math.max(1, Math.min(maxSp, fit)) : 0;
  const curved = s.layout !== 'line';
  const R = Math.max(s.fanRadius * ch, 1);
  const mid = (n - 1) / 2;
  const pickShift = (s.scrubBias * Math.max(0, cw - spacing)) / 2;

  for (let i = 0; i < n; i++) {
    const dx = (i - mid) * spacing;
    let y = m.handBaseY;
    let rot = 0;
    if (curved) {
      // Cards sit on a circle of radius R; rotation follows the tangent.
      const d = clamp(dx, -R * 0.9, R * 0.9);
      y += R - Math.sqrt(R * R - d * d);
      rot = ((Math.asin(d / R) * 180) / Math.PI) * s.fanTilt;
    }
    const x = m.handCenterX + dx;
    slots.push({ x, y, rot, px: i < n - 1 ? x - pickShift : x });
  }
  return { slots, spacing };
}

/** Index of the slot nearest to x, with hysteresis around the current one. */
export function nearestSlot(slots, spacing, x, current = -1, hysteresis = 0, key = 'px') {
  const n = slots.length;
  if (!n) return -1;
  if (current >= 0 && current < n && spacing > 0 && Math.abs(x - slots[current][key]) < spacing * (0.5 + hysteresis)) {
    return current;
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(x - slots[i][key]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
