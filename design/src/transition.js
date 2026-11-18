// The transition between the lobby and a game: a curtain of cards.
//
// Twelve big cards are thrown up from below the screen in one continuous
// motion: they rise fast, slow almost to a stop, float for a moment at the top
// (where together they cover the whole screen), then let go gently and drop
// fast. While they hang, the lobby is swapped for the table behind them (or
// the other way round when leaving). The cards are random faces from the deck,
// the same for every game, except that Solitaire's are in its black-and-red deck.
import { createDeck, faceHTML } from './cards.js?v=fourcolor';
import { reducedMotion } from './motion.js';

const UP_MS = 480; // ms from launch until the card has all but stopped at the top
const HANG_MS = 150; // ms it floats there, barely moving
const DOWN_MS = 340; // ms to drop off the screen: slow to let go, then fast
const APEX_AT = UP_MS + HANG_MS / 2 + 30; // the middle of the hang; the screen is covered and the swap happens
export const ZOOM_MS = APEX_AT + HANG_MS / 2 + DOWN_MS + 60; // the whole thing
export const DEAL_AT = APEX_AT + HANG_MS / 2 + 150; // games start dealing as the cards drop away

const COUNT = 12; // 3 columns x 4 rows (4 x 3 in landscape)
const DECK = createDeck();
const reduced = reducedMotion; // the system setting, unless the devboard overrides it

/**
 * @param {{ screen: HTMLElement, lobbyEl: HTMLElement, sceneEl: HTMLElement, dir: 'in' | 'out' }} o
 *   Returns a function that ends the transition at once.
 */
export function playTransition({ screen, lobbyEl, sceneEl, dir }) {
  const W = screen.offsetWidth;
  const H = screen.offsetHeight;
  document.body.classList.add('zooming');
  if (dir === 'out') sceneEl.classList.add('zoom-out'); // keep the table on screen until it is covered
  const lobbyView = lobbyEl.firstElementChild ?? lobbyEl;

  const anims = [];
  const run = (el, frames, opts = {}) => anims.push(el.animate(frames, { duration: ZOOM_MS, fill: 'both', easing: 'linear', ...opts }));
  const at = (ms) => Math.min(1, ms / ZOOM_MS);

  // What's underneath changes hands at the top of the throw, when the curtain is closed.
  const cut = at(APEX_AT);
  const shown = [{ opacity: 1, offset: 0 }, { opacity: 1, offset: cut }, { opacity: 0, offset: cut + 0.001 }, { opacity: 0, offset: 1 }];
  const hidden = [{ opacity: 0, offset: 0 }, { opacity: 0, offset: cut }, { opacity: 1, offset: cut + 0.001 }, { opacity: 1, offset: 1 }];
  run(lobbyView, dir === 'in' ? shown : hidden);
  run(sceneEl, dir === 'in' ? hidden : shown);

  // The curtain: a grid of cards, each a little bigger than its cell so they overlap.
  const layer = document.createElement('div');
  layer.className = sceneEl.id === 'solitaire' ? 'fly-layer classic' : 'fly-layer'; // Solitaire's curtain is its own black-and-red deck
  const cols = W > H ? 4 : 3;
  const rows = COUNT / cols;
  const cw = Math.max(W / cols, H / rows / 1.4) * 1.3;
  layer.style.setProperty('--cw', `${cw.toFixed(1)}px`);
  const faces = [...DECK].sort(() => Math.random() - 0.5).slice(0, COUNT);
  const T = (x, y, rot) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
  for (let i = 0; i < COUNT; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const el = document.createElement('div');
    el.className = 'fly-card';
    el.innerHTML = faceHTML(faces[i]);
    el.style.zIndex = String(row * cols + ((col * 7) % cols)); // lower rows on top, so the overlap looks stacked
    layer.append(el);
    const x = (W * (col + 0.5)) / cols + (Math.random() - 0.5) * 10;
    const y = (H * (row + 0.5)) / rows + (Math.random() - 0.5) * 10;
    const rot = Math.random() * 16 - 8;
    // A throw: the card starts just below the screen, rises to its place,
    // floats there, and drops back down. The rise decelerates on a cubic curve,
    // so it has almost stopped well before the top; it then hangs, barely
    // drifting; and the drop starts gently and builds up speed (cubic again),
    // so most of the fall happens in its last third. Cards bound for the top
    // rows have further to go, so they are thrown harder.
    const rise = H - y + cw * 0.8; // from below the bottom edge up to its place
    const apex = APEX_AT + (Math.random() - 0.5) * 40;
    const drift = (Math.random() - 0.5) * 60; // px sideways over the whole flight
    const spin = (Math.random() - 0.5) * 50; // degrees over the whole flight
    const frames = [];
    const STEPS = 16;
    const whole = UP_MS + HANG_MS + DOWN_MS;
    const frame = (ms, drop) => {
      const f = (ms - (apex - HANG_MS / 2 - UP_MS)) / whole - 0.5; // -0.5 at launch, 0.5 at the end
      frames.push({ transform: T(x + drift * f, y + rise * drop, rot + spin * f), offset: at(ms) });
    };
    for (let j = 0; j <= STEPS; j++) {
      const u = 1 - j / STEPS; // 1 at launch, 0 at the top
      frame(apex - HANG_MS / 2 - u * UP_MS, u ** 3);
    }
    for (let j = 0; j <= STEPS; j++) {
      const u = j / STEPS; // 0 at the top, 1 at the bottom again
      frame(apex + HANG_MS / 2 + u * DOWN_MS, u ** 3.2);
    }
    frames.unshift({ ...frames[0], offset: 0 });
    frames.push({ ...frames[frames.length - 1], offset: 1 });
    run(el, frames);
  }
  screen.append(layer);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    for (const a of anims) a.cancel();
    layer.remove();
    sceneEl.classList.remove('zoom-out');
    document.body.classList.remove('zooming');
  };
  const timer = setTimeout(finish, reduced?.matches ? 0 : ZOOM_MS + 20);
  return finish;
}
