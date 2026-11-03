// Opening intro (about 4.8 s), shown when the app starts on the lobby:
//   0–1.2 s     the game cards are laid out in a tilted grid, repeated, popping
//               in one after another in a diagonal sweep
//   1.1–4.8 s   the columns scroll vertically, neighbors in opposite
//               directions, speeding up; the logo pops in
//   3.8–4.8 s   handoff: every card flies out from the center of the screen
//               (as if the camera pushes through the grid) while the lobby
//               zooms in from the center underneath them
// A tap, click or key press skips it.
import { GAMES } from './games.js?v=euchre';
import { coverHTML } from './covers.js?v=euchre';

const POP_SWEEP_MS = 1250; // last card has popped in by now
const SCROLL_AT = 1100;
const OUT_AT = 3800;
const END = 4800;
const TILT = -12; // degrees
const LOBBY_FROM = 0.12; // lobby scale when it starts zooming in

// One shared curve, so the cards leaving and the lobby arriving move as one zoom.
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/**
 * @param {HTMLElement} screen  #screen
 * @param {{ lobby?: HTMLElement, onDone?: () => void }} opts
 */
export function playIntro(screen, { lobby, onDone } = {}) {
  const W = screen.offsetWidth;
  const H = screen.offsetHeight;
  const cw = Math.round(Math.min(W, H) / 3); // card width
  const ch = Math.round(cw * 1.4);
  const gap = Math.round(cw * 0.12);
  const px = cw + gap;
  const py = ch + gap;
  // The tilted grid has to cover the screen's corners, so it spans the diagonal.
  const A = Math.ceil(Math.hypot(W, H) * 1.06);
  const cols = Math.ceil(A / px) + 1;
  const travel = A * 0.9; // how far each column scrolls in total
  const flyOut = Math.hypot(W, H); // extra push so even the middle cards leave

  // Two layers: the dark backdrop sits *under* the lobby, the cards over it,
  // so the lobby can zoom in between them.
  const backdrop = document.createElement('div');
  backdrop.id = 'intro-bg';
  const root = document.createElement('div');
  root.id = 'intro';
  root.style.setProperty('--cover', `${cw}px`);
  const grid = document.createElement('div');
  grid.className = 'in-grid';
  grid.style.width = grid.style.height = `${A}px`;
  grid.style.transform = `translate(-50%, -50%) rotate(${TILT}deg)`;
  root.append(grid);

  const columns = [];
  const x0 = (A - cols * px + gap) / 2;
  for (let c = 0; c < cols; c++) {
    const dir = c % 2 ? 1 : -1; // -1 = moves up, 1 = moves down
    const col = document.createElement('div');
    col.className = 'in-col';
    col.style.left = `${x0 + c * px}px`;
    // Rows that are on screen at the start, plus the ones scrolling into view.
    const first = dir < 0 ? 0 : -Math.ceil(travel / py) - 1;
    const last = dir < 0 ? Math.ceil((A + travel) / py) : Math.ceil(A / py);
    const html = [];
    const rows = [];
    for (let r = first; r <= last; r++) {
      // Shift the game sequence per column so neighbors don't line up.
      const n = GAMES.length;
      const i = (((r + c * 2) % n) + n) % n;
      const delay = r >= 0 ? Math.min(POP_SWEEP_MS - 450, (c * 0.55 + r) * 85) : 0;
      html.push(
        `<div class="in-card" style="top:${r * py}px;width:${cw}px;height:${ch}px;--d:${delay.toFixed(0)}ms">${coverHTML(GAMES[i], i)}</div>`,
      );
      rows.push(r);
    }
    col.innerHTML = html.join('');
    // Card centers in grid coordinates (before scrolling), for the fly-out.
    const cards = [...col.children].map((el, k) => ({ el, x: x0 + c * px + cw / 2, y: rows[k] * py + ch / 2 }));
    grid.append(col);
    columns.push({ el: col, dir, cards });
  }

  const logo = document.createElement('div');
  logo.className = 'in-logo';
  logo.innerHTML = '<span>the</span><span>deck</span>';
  root.append(logo);
  screen.append(backdrop, root);
  if (lobby) {
    lobby.style.opacity = '0';
    lobby.style.transformOrigin = '50% 50%';
  }

  // Skip on any tap, click or key; keep those events away from the lobby and the lab.
  let done = false;
  let raf = 0;
  let flying = false;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    root.remove();
    backdrop.remove();
    if (lobby) {
      lobby.style.opacity = '';
      lobby.style.transform = '';
      lobby.style.transformOrigin = '';
    }
    document.removeEventListener('keydown', onKey, true);
    onDone?.();
  };
  const skip = (e) => {
    e.stopPropagation();
    e.preventDefault();
    finish();
  };
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    skip(e);
  };
  root.addEventListener('pointerdown', skip);
  for (const type of ['pointermove', 'pointerup', 'touchstart', 'wheel']) {
    root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }
  document.addEventListener('keydown', onKey, true);

  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    // Scroll: eases in, then keeps speeding up to the end.
    const u = clamp01((t - SCROLL_AT) / (END - SCROLL_AT));
    const d = travel * u * u * (1.6 - 0.6 * u);
    for (const { el, dir } of columns) el.style.transform = `translate3d(0, ${(dir * d).toFixed(1)}px, 0)`;

    // Handoff: cards fly out radially from the screen center (the grid's
    // center), the lobby zooms in from the center underneath.
    const o = clamp01((t - OUT_AT) / (END - OUT_AT));
    if (o > 0) {
      if (!flying) {
        flying = true;
        for (const { cards } of columns) for (const { el } of cards) el.style.animation = 'none';
        logo.style.animation = 'none';
      }
      const k = ease(o);
      for (const { dir, cards } of columns) {
        for (const card of cards) {
          const vx = card.x - A / 2;
          const vy = card.y + dir * d - A / 2;
          const len = Math.hypot(vx, vy) || 1;
          // Further cards move further (a zoom), and everyone gets pushed past the edge.
          const push = len * 1.6 * k + flyOut * k;
          const s = 1 + 0.9 * k;
          card.el.style.transform = `translate3d(${((vx / len) * push).toFixed(1)}px, ${((vy / len) * push).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
        }
      }
      // The logo zooms toward the camera and fades.
      logo.style.transform = `translate(-50%, -50%) rotate(-6deg) scale(${(1 + 2.5 * k).toFixed(3)})`;
      logo.style.opacity = String(1 - clamp01(o * 1.8));
      if (lobby) {
        lobby.style.opacity = String(clamp01(o * 3));
        lobby.style.transform = `scale(${(LOBBY_FROM + (1 - LOBBY_FROM) * k).toFixed(4)})`;
      }
    }
    if (t >= END) finish();
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { skip: finish };
}
