// Game feel: effects and feedback for the moments that matter at a table.
//
// One layer for all games. It watches what the games already do (a banner
// popping up, a score changing, the result card appearing, a turn starting)
// and answers with something to see, so no game has to ask for it:
//   you take a trick / win a hand   a burst of confetti sparks at the banner
//   "WAR!", "Go!"                   a bigger burst and a screen shake
//   the other side wins, a bad move a short shake
//   a score goes up                 the number pops, and "+3" floats off it
//   a score goes down               the number dips
//   it becomes your turn            a soft glow rises from your side
//   you win the game                confetti from both corners, then a rain of it
// Smaller, purely visual touches (a winning hand hopping, a name popping when
// its turn starts) live in style.css under "game feel".
// Everything is skipped under prefers-reduced-motion.
//
//
// What each of those looks like is data, not code: an effect is a named list of
// layers (fx-presets.js), and this file only knows how to draw one layer of
// each kind and how to play a list of them. The games ask for an effect by name
// (`play('sparks', where)`), so editing it on the VFX/Animations board next to
// the phone (fxboard.js) changes what the games show. The same list holds
// bigger moments that nothing triggers yet (win, lose, fireworks, coins…).
import { SUIT_ART } from './cards.js?v=fourcolor';
import { reducedMotion } from './motion.js';
import { playTransition } from './transition.js?v=fourcolor';
import { DEFAULTS } from './fx-presets.js?v=fourcolor';

const COLORS = ['#F0442E', '#FFC42E', '#149A6A', '#2B62F0'];
const SCORES = '.war-count, .rm-sub, .bj-bank, .cs-score, .gn-score';
const BANNERS = '.war-banner, .bj-banner, .sd-banner';
const reduced = reducedMotion; // the system setting, unless the devboard overrides it
const rand = (a, b) => a + Math.random() * (b - a);
const INK = '#17140F';
const SUIT_PATHS = typeof Path2D === 'undefined' ? [] : Object.values(SUIT_ART).map((a) => new Path2D(a.shape));

export function initFx(screen) {
  const canvas = document.createElement('canvas');
  canvas.id = 'fx';
  canvas.setAttribute('aria-hidden', 'true');
  screen.append(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let parts = [];
  let raf = 0;
  let last = 0;

  const size = () => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    W = screen.offsetWidth;
    H = screen.offsetHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  /** An element's center in screen-local px (the desktop frame scales the screen). */
  const center = (el) => {
    const sr = screen.getBoundingClientRect();
    const k = sr.width / screen.offsetWidth || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - sr.left) / k, y: (r.top + r.height / 2 - sr.top) / k, w: r.width / k, h: r.height / k };
  };

  function tick(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.age += dt;
      if (p.age < 0) {
        parts[alive++] = p; // still waiting for its cue
        continue;
      }
      if (p.age >= p.life || p.y > H + 40) continue;
      const t = p.age / p.life;
      if (p.kind === 'ring') {
        // A ring that opens fast and thins out.
        const e = 1 - (1 - t) ** 3;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.w * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * e, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        p.vy += p.g * dt;
        p.vx *= 1 - p.drag * dt;
        p.vy *= 1 - p.drag * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // Paper confetti tumbles: its width breathes as it turns.
        const flip = p.kind === 'paper' ? Math.cos(p.age * p.tumble) : 1;
        if (p.kind === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, (p.w / 2) * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'coin') {
          // A coin spins on its upright axis: a disc that narrows to an edge and back.
          ctx.scale(Math.max(0.18, Math.abs(Math.cos(p.age * p.tumble))), 1);
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#C98F00';
          ctx.stroke();
        } else if (p.kind === 'suit') {
          // The suit shapes are drawn in a 100 x 100 box.
          ctx.scale(p.w / 100, p.w / 100);
          ctx.translate(-50, -50);
          ctx.fill(p.path);
        } else ctx.fillRect((-p.w / 2) * flip, -p.h / 2, p.w * flip, p.h);
        ctx.restore();
      }
      parts[alive++] = p;
    }
    parts.length = alive;
    ctx.globalAlpha = 1;
    if (alive) raf = requestAnimationFrame(tick);
    else {
      raf = 0;
      ctx.clearRect(0, 0, W, H);
    }
  }
  function add(list) {
    if (!ctx || reduced?.matches) return;
    size();
    parts.push(...list);
    if (parts.length > 420) parts = parts.slice(-420);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  /** Sparks thrown out from a point, with a ring opening behind them. */
  function burst(x, y, { count = 14, speed = 300, colors = COLORS, ring = colors[1 % colors.length], big = false } = {}) {
    const list = [{ kind: 'ring', x, y, r0: 6, r1: big ? 110 : 62, w: big ? 7 : 5, color: ring, age: 0, life: big ? 0.5 : 0.38 }];
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + rand(-0.25, 0.25);
      const v = speed * rand(0.55, 1.15);
      const paper = i % 3 !== 0;
      list.push({
        kind: paper ? 'paper' : 'dot',
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        g: 620,
        drag: 2.2,
        rot: rand(0, 6),
        vr: rand(-9, 9),
        tumble: rand(9, 16),
        w: paper ? rand(6, 10) : rand(5, 8),
        h: rand(4, 6),
        color: colors[i % colors.length],
        age: 0,
        life: rand(0.55, 0.85),
      });
    }
    add(list);
  }

  /** The big one: a cannon from each bottom corner, then a rain from the top. */
  function confetti(amount = 1) {
    size();
    const list = [];
    const paper = (x, y, vx, vy, delay, life) => ({
      kind: 'paper', x, y, vx, vy, g: 520, drag: 0.9, rot: rand(0, 6), vr: rand(-10, 10), tumble: rand(7, 15),
      w: rand(7, 12), h: rand(4, 7), color: COLORS[(Math.random() * 4) | 0], age: -delay, life,
    });
    for (let i = 0; i < Math.round(46 * amount); i++) {
      const left = i % 2 === 0;
      const a = left ? rand(-1.35, -0.75) : rand(-2.4, -1.8); // up and inward
      const v = rand(620, 1050);
      list.push(paper(left ? -10 : W + 10, H * 0.82, Math.cos(a) * v, Math.sin(a) * v, rand(0, 0.12), rand(1.6, 2.4)));
    }
    for (let i = 0; i < Math.round(70 * amount); i++) list.push(paper(rand(0, W), rand(-60, -10), rand(-40, 40), rand(60, 220), rand(0.25, 1.3), rand(2.2, 3.2)));
    add(list);
  }

  /** A short sideways shake. Uses `translate`, so it never fights an element's own transform. */
  function shake(el, px = 6) {
    if (reduced?.matches || !el) return;
    el.animate(
      [{ translate: '0 0' }, { translate: `${-px}px 0` }, { translate: `${px * 0.8}px 0` }, { translate: `${-px * 0.5}px 0` }, { translate: `${px * 0.25}px 0` }, { translate: '0 0' }],
      { duration: 320, easing: 'ease-out' },
    );
  }

  /** "+3" rising off a score. */
  function floater(el, text) {
    if (reduced?.matches) return;
    const c = center(el);
    const f = document.createElement('div');
    f.className = 'fx-float';
    f.textContent = text;
    // Beside the number (on whichever side has room), so it never covers the label above it.
    const right = c.x + c.w / 2 + 8;
    const fits = right + 44 < screen.offsetWidth;
    f.style.left = `${fits ? right : c.x - c.w / 2 - 8}px`;
    if (!fits) f.style.translate = '-100% 0';
    f.style.top = `${c.y}px`;
    screen.append(f);
    f.addEventListener('animationend', () => f.remove(), { once: true });
    setTimeout(() => f.remove(), 1400);
  }

  const pop = (el, cls) => {
    el.classList.remove('fx-up', 'fx-down');
    void el.offsetWidth;
    el.classList.add(cls);
  };
  const ints = (s) => (s.match(/-?\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
  function scoreChanged(el, before, after) {
    if (/\d:\d\d/.test(after)) return; // a clock, not a score
    // Your own counts are shown as a pill by your avatar (hud.js): the feedback goes there.
    if (el.closest('.hud-gone')) el = el.closest('.game-scene')?.querySelector('.hud-mine') ?? el;
    const a = ints(before);
    const b = ints(after);
    if (!b.length || a.length !== b.length) return;
    const up = b.some((n, i) => n > a[i]);
    const down = b.some((n, i) => n < a[i]);
    if (!up && !down) return;
    pop(el, up ? 'fx-up' : 'fx-down');
    if (up && b.length === 1 && b[0] - a[0] > 0) floater(el, `+${(b[0] - a[0]).toLocaleString('en-US')}`);
  }

  const scene = () => screen.querySelector('.game-scene.active');

  // ------------------------------------------------------- bigger moments

  /** Whatever is on screen right now: the table, or the lobby. */
  const stageEl = () => scene() ?? screen.querySelector('#lobby');
  const later = (ms, fn) => setTimeout(fn, ms);

  /** A sheet of color over the whole screen that fades away (or, with `hold`, lingers first). */
  function flash(color = '#FFFDF7', { peak = 0.7, ms = 420, hold = 0 } = {}) {
    if (reduced?.matches) return;
    const el = document.createElement('div');
    el.className = 'fx-veil';
    el.style.background = color;
    screen.append(el);
    const total = ms + hold;
    el.animate(
      [{ opacity: 0 }, { opacity: peak, offset: Math.min(0.2, 60 / total) }, { opacity: peak, offset: (60 + hold) / total }, { opacity: 0 }],
      { duration: total, easing: 'ease-out' },
    ).finished.then(() => el.remove(), () => el.remove());
  }

  /** The "your turn" glow, from the bottom edge, anywhere (the tables use a class for it). */
  function glow() {
    if (reduced?.matches) return;
    const el = document.createElement('div');
    el.className = 'fx-glow';
    screen.append(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    later(1200, () => el.remove());
  }

  /**
   * A sticker that slams onto the middle of the screen, sits, and lets go.
   * `round` makes it a circle (for a single number); `tilt` in degrees. By default it
   * is the text color on the backdrop, so it stands out on paper and on ink alike.
   */
  function stamp(text, { bg = 'var(--fg)', fg = 'var(--base)', round = false, tilt = -4, ms = 1100, y = 0.44 } = {}) {
    const el = document.createElement('div');
    el.className = `fx-stamp${round ? ' round' : ''}`;
    el.textContent = text;
    el.style.background = bg;
    el.style.color = fg;
    el.style.top = `${y * 100}%`;
    screen.append(el);
    if (reduced?.matches) {
      later(ms, () => el.remove());
      return el;
    }
    const inAt = Math.min(0.3, 260 / ms);
    const outAt = Math.max(inAt + 0.05, 1 - 200 / ms);
    el.animate(
      [
        { scale: 2.2, rotate: `${tilt * 3}deg`, opacity: 0 },
        { scale: 0.92, rotate: `${tilt}deg`, opacity: 1, offset: inAt * 0.6 },
        { scale: 1, rotate: `${tilt}deg`, opacity: 1, offset: inAt },
        { scale: 1, rotate: `${tilt}deg`, opacity: 1, offset: outAt },
        { scale: 0.7, rotate: `${tilt}deg`, opacity: 0 },
      ],
      { duration: ms, easing: 'cubic-bezier(.3, 1.3, .5, 1)' },
    ).finished.then(() => el.remove(), () => el.remove());
    return el;
  }

  /** A score going up, on any element: the pop and the "+N" that floats off it. */
  function score(el, n = 1) {
    if (!el) return;
    pop(el, 'fx-up');
    floater(el, `+${n}`);
  }

  /** Rockets: a handful of bursts across the upper half, one after another. */
  function fireworks(count = 6) {
    size();
    for (let i = 0; i < count; i++) {
      later(i * 170 + rand(0, 90), () => {
        const c = COLORS[(Math.random() * 4) | 0];
        burst(rand(W * 0.15, W * 0.85), rand(H * 0.14, H * 0.5), { count: 20, speed: rand(300, 420), big: true, ring: c });
      });
    }
  }

  /** A fountain of coins from the bottom of the screen. */
  function coins(count = 34) {
    size();
    const list = [];
    for (let i = 0; i < count; i++) {
      const a = rand(-2.0, -1.14); // up, fanning out
      const v = rand(620, 1080);
      list.push({
        kind: 'coin', x: W / 2 + rand(-30, 30), y: H + 16, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1500, drag: 0.35,
        rot: 0, vr: 0, tumble: rand(8, 16), w: rand(15, 22), h: 0, color: '#FFC42E', age: -rand(0, 0.5), life: rand(1.5, 2.1),
      });
    }
    add(list);
  }

  /** The four suits falling through the screen, each in its own color. */
  function suits(count = 40) {
    size();
    const list = [];
    for (let i = 0; i < count; i++) {
      const k = i % 4;
      list.push({
        kind: 'suit', path: SUIT_PATHS[k], x: rand(0, W), y: rand(-80, -20), vx: rand(-30, 30), vy: rand(120, 300), g: 260, drag: 0.5,
        rot: rand(-0.5, 0.5), vr: rand(-2.4, 2.4), w: rand(18, 34), h: 0, color: [COLORS[3], COLORS[0], COLORS[2], COLORS[1]][k], age: -rand(0, 1.1), life: rand(2.4, 3.4),
      });
    }
    add(list);
  }

  /** Rings opening from a point, one after another. */
  function rings(count, x, y) {
    add(Array.from({ length: count }, (_, i) => ({ kind: 'ring', x, y, r0: 20, r1: 150 + i * 50, w: 8, color: COLORS[(i + 1) % 4], age: -i * 0.12, life: 0.7 })));
  }

  /** Grey scraps drifting down: what is left when you lose. */
  function ash(count = 26) {
    size();
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push({
        kind: 'paper', x: rand(0, W), y: rand(-60, -10), vx: rand(-20, 20), vy: rand(40, 110), g: 90, drag: 0.6, rot: rand(0, 6), vr: rand(-3, 3),
        tumble: rand(3, 6), w: rand(7, 12), h: rand(4, 7), color: i % 3 ? '#8A857B' : '#5B574F', age: -rand(0, 0.9), life: rand(2.6, 3.4),
      });
    }
    add(list);
  }

  /** The card curtain on its own: it normally swaps the lobby and a table underneath it, here it just passes over. */
  const curtain = () => playTransition({ screen, lobbyEl: document.createElement('div'), sceneEl: document.createElement('div'), dir: 'in' });

  /** Where a score lives right now: your pill at a table, your avatar in the lobby. */
  const scoreEl = () =>
    [...screen.querySelectorAll('.game-scene.active .hud-mine, .game-scene.active .hud-you, .gs-you')].find((el) => el.getClientRects().length && (el.textContent || el.dataset.av));

  // ------------------------------------------------------ effects as data

  // Named colors a layer can ask for: [background, text on it]. "ink" follows the backdrop.
  const NAMED = {
    ink: ['var(--fg)', 'var(--base)'],
    white: ['#FFFDF7', INK],
    red: [COLORS[0], '#FFFDF7'],
    yellow: [COLORS[1], INK],
    green: [COLORS[2], '#FFFDF7'],
    blue: [COLORS[3], '#FFFDF7'],
  };
  let presets = new Map(DEFAULTS.map((p) => [p.id, p]));

  /** Draws one layer. `at` (screen px) overrides where a positioned layer goes. */
  function layer(l, at) {
    size();
    const x = at?.x ?? l.x * W;
    const y = at?.y ?? l.y * H;
    const [bg, fg] = NAMED[l.color] ?? NAMED.ink;
    switch (l.type) {
      case 'burst': return burst(x, y, { count: l.count, speed: l.speed, big: l.big });
      case 'rings': return rings(l.count, x, y);
      case 'shake': return shake(stageEl(), l.px);
      case 'flash': return flash(bg, { peak: l.peak, ms: l.ms, hold: l.hold });
      case 'glow': return glow();
      case 'stamp': return stamp(l.text, { bg, fg, round: l.round, tilt: l.tilt, ms: l.ms, y: l.y }).classList.toggle('word', l.round && l.text.length > 1);
      case 'confetti': return confetti(l.amount);
      case 'fireworks': return fireworks(l.count);
      case 'coins': return coins(l.count);
      case 'suits': return suits(l.count);
      case 'ash': return ash(l.count);
      case 'score': return score(scoreEl(), l.n);
      case 'curtain': return curtain();
      default: return undefined;
    }
  }

  /** Plays a list of layers, each after its own delay. */
  function run(layers, at) {
    for (const l of layers) {
      if (l.delay > 0) later(l.delay, () => layer(l, at));
      else layer(l, at);
    }
  }

  /** Plays an effect by name. */
  function play(id, at) {
    const p = presets.get(id);
    if (p) run(p.layers, at);
  }

  /** Swaps in an edited set of effects (from the board, or the saved file). */
  function setPresets(list) {
    presets = new Map(list.map((p) => [p.id, p]));
  }

  const quiet = () => !document.body.classList.contains('route-game') || document.body.classList.contains('zooming');
  const gained = (m, cls) => m.target.classList.contains(cls) && !` ${m.oldValue ?? ''} `.includes(` ${cls} `);

  new MutationObserver((records) => {
    if (quiet()) return;
    for (const m of records) {
      const el = m.target;
      if (m.type === 'attributes') {
        if (!(el instanceof Element)) continue;
        // A banner pops up: who is it good news for?
        if (el.matches(BANNERS) && el.classList.contains('show') && (gained(m, 'show') || el.className !== m.oldValue)) {
          const c = center(el);
          const k = el.classList;
          if (k.contains('war') || k.contains('go')) play('big-burst', c);
          else if (k.contains('you') || k.contains('win')) play('sparks', c);
          else if (k.contains('cpu') || k.contains('lose') || k.contains('bad')) play('shake');
        } else if (el.matches('.sj-slap') && gained(m, 'show')) {
          const c = center(el);
          if (el.classList.contains('bad')) play('shake');
          else play('big-burst', c);
        } else if (el.matches('.bj-hand-label')) {
          const c = center(el);
          if (gained(m, 'r-blackjack')) play('big-burst', c);
          else if (gained(m, 'r-win')) play('sparks', c);
          else if (gained(m, 'r-bust')) play('shake');
        } else if (el.matches('.c8-status, .gf-status, .hx-status') && gained(m, 'mine')) {
          // Your turn: a glow rises from your side of the table.
          play('turn');
        } else if (el.matches('.game-win') && gained(m, 'show')) {
          // The result card. Only a win gets the full treatment; setup cards get nothing.
          const title = el.querySelector('.game-win-title')?.textContent ?? '';
          if (/^you (won|tied)/i.test(title)) play('confetti');
        }
      } else {
        // Text changed somewhere: was it a score?
        const host = el instanceof Element ? el : el.parentElement;
        const score = host?.closest(SCORES);
        if (!score) continue;
        if (m.type === 'characterData') scoreChanged(score, m.oldValue ?? '', el.data ?? '');
        else if (m.removedNodes.length && m.addedNodes.length) scoreChanged(score, m.removedNodes[0].textContent ?? '', score.textContent ?? '');
      }
    }
  }).observe(screen, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true, childList: true, characterData: true, characterDataOldValue: true });

  return { play, run, setPresets, burst, confetti, shake };
}
