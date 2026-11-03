import { initDevice } from './device.js';
import { buildPanel, loadSettings, saveSettings } from './settings.js';
import { Game } from './game.js?v=middle-only-landings';
import { Input } from './input.js';
import { DebugOverlay } from './debug.js';
import { cardBackHTML } from './cards.js?v=landing-burst';
import { SparkleTrail } from './sparkles.js?v=landing-burst';
import { LandingRipples } from './ripples.js?v=water-ripple';
import { initLobby } from './lobby.js?v=shithead';
import { playIntro } from './intro.js?v=shithead';
import { SolitaireScene } from './solitaire/scene.js?v=rummy';
import { WarScene } from './war/scene.js?v=rummy';
import { EightsScene } from './eights/scene.js?v=rummy';
import { GoFishScene } from './gofish/scene.js?v=rummy';
import { HeartsScene } from './hearts/scene.js?v=rummy';
import { BlackjackScene } from './blackjack/scene.js?v=rummy';
import { RummyScene } from './rummy/scene.js?v=rummy';
import { ShitheadScene } from './shithead/scene.js?v=shithead';

const $ = (id) => document.getElementById(id);
const settings = loadSettings();

// iOS Safari has no navigator.vibrate; the native app will use UIImpactFeedbackGenerator.
function haptic(pattern) {
  if (!settings.haptics || typeof navigator.vibrate !== 'function') return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* blocked without user activation */
  }
}

const screenEl = $('screen');
$('deck').querySelector('.deck-stack').innerHTML = cardBackHTML();
const game = new Game(
  {
    screen: screenEl,
    layer: $('cards'),
    ui: $('ui'),
    deck: $('deck'),
    deckCount: $('deck-count'),
    edgeL: $('edge-left'),
    edgeR: $('edge-right'),
  },
  settings,
  haptic,
);
const debug = new DebugOverlay($('debug'));
const sparkles = new SparkleTrail($('sparkles'));
const ripples = new LandingRipples($('ripples'));

let input = null;
// Game scenes, created the first time they're opened. Each has
// setSize / show / hide / update / cancel.
const SCENES = {
  solitaire: { title: 'Solitaire', make: (root, opts) => new SolitaireScene(root, opts) },
  war: { title: 'War', make: (root, opts) => new WarScene(root, opts) },
  'crazy-eights': { title: 'Crazy Eights', make: (root, opts) => new EightsScene(root, opts) },
  'go-fish': { title: 'Go Fish', make: (root, opts) => new GoFishScene(root, opts) },
  hearts: { title: 'Hearts', make: (root, opts) => new HeartsScene(root, opts) },
  blackjack: { title: 'Blackjack', make: (root, opts) => new BlackjackScene(root, opts) },
  'rummy-500': { title: 'Rummy 500', make: (root, opts) => new RummyScene(root, opts) },
  shithead: { title: 'Shithead', make: (root, opts) => new ShitheadScene(root, opts) },
};
const scenes = {};
let current = null;
let lastSize = null;
const device = initDevice({
  onResize(W, H, safe) {
    game.setSize(W, H, safe);
    debug.resize(W, H);
    sparkles.resize(W, H);
    ripples.resize(W, H);
    lastSize = [W, H, safe];
    for (const sc of Object.values(scenes)) sc.setSize(W, H, safe);
  },
  onRotateStart() {
    input?.cancel();
    current?.cancel();
  },
});
input = new Input(screenEl, game, device, settings);

// Panel
const act = (fn) => () => {
  input.cancel();
  fn();
};
const onChange = () => {
  saveSettings(settings);
  game.relayout();
  debug.setEnabled(settings.debug);
};
const panel = buildPanel($('panel-body'), settings, {
  actions: [
    [
      { label: 'Draw 1', fn: act(() => game.draw(1)) },
      { label: 'Discard random', fn: act(() => game.discardRandom()) },
      { label: 'Return played', fn: act(() => game.returnPlayed()) },
    ],
    [
      { label: 'Sort by suit', fn: act(() => game.sortHand('suit')) },
      { label: 'Sort by rank', fn: act(() => game.sortHand('rank')) },
      { label: 'Shuffle hand', fn: act(() => game.shuffleHand()) },
      { label: 'Deselect', fn: act(() => game.deselectAll()) },
    ],
    [
      { label: 'Deal 5', fn: act(() => game.newGame(5)) },
      { label: 'Deal 7', fn: act(() => game.newGame(7)) },
      { label: 'Deal 10', fn: act(() => game.newGame(10)) },
      { label: 'Deal 15', fn: act(() => game.newGame(15)) },
    ],
  ],
  onChange,
});

$('gear').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  document.body.classList.toggle('panel-open');
});
$('panel-close').addEventListener('click', () => document.body.classList.remove('panel-open'));

window.addEventListener('keydown', (e) => {
  if (!inLab) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof Element && e.target.closest('textarea, input:not([type=range]):not([type=checkbox])')) return;
  switch (e.key.toLowerCase()) {
    case 'r':
      device.rotate();
      break;
    case 'g':
      settings.debug = !settings.debug;
      panel.refresh();
      onChange();
      break;
    case ' ':
      e.preventDefault();
      game.draw(1);
      break;
    default:
  }
});

// The screen and game scenes clip with overflow: hidden, but focusing a button
// near an edge can still scroll them. Keep them pinned.
document.addEventListener(
  'scroll',
  (e) => {
    const t = e.target;
    if (t instanceof Element && (t.id === 'screen' || t.classList.contains('game-scene'))) {
      t.scrollTop = 0;
      t.scrollLeft = 0;
    }
  },
  true,
);

// Handy for poking at state from the devtools console.
window.lab = { game, input, settings, device, sparkles, ripples };

// Lobby / routing. The lab stays loaded underneath; it is only shown (and
// updated) on its route. Games are created the first time they're opened.
let inLab = false;
let view = 'lobby';
const ZOOM_MS = 600; // opening a game from the lobby
function openGame(id) {
  const def = SCENES[id];
  if (!def) return null;
  if (!scenes[id]) {
    const sc = def.make($(id), {
      scale: () => device.scale,
      device,
      settings,
      haptic,
      onExit: () => {
        location.hash = '#/';
      },
    });
    scenes[id] = sc;
    window.lab[id] = sc;
    if (lastSize) sc.setSize(...lastSize);
  }
  return scenes[id];
}
$('lab-back').addEventListener('pointerdown', (e) => e.stopPropagation());
$('lab-back').addEventListener('click', () => {
  location.hash = '#/dev';
});
const lobbyNav = initLobby($('lobby'), {
  onRoute(route, { zoomFrom } = {}) {
    const lab = route.view === 'lab';
    const game = route.view === 'game' ? openGame(route.id) : null;
    const leaving = view === 'game' && route.view === 'lobby' ? current : null;
    const leavingId = leaving && Object.keys(scenes).find((id) => scenes[id] === leaving);
    view = lab ? 'lab' : game ? 'game' : 'lobby';
    inLab = lab;
    input.cancel();
    input.clearHover();
    if (current && current !== game) current.hide();
    current = game;
    game?.setMode?.(route.mode);
    game?.show();
    for (const v of ['lab', 'game', 'lobby']) document.body.classList.toggle(`route-${v}`, view === v);
    document.body.classList.remove('panel-open');
    document.title = lab ? 'The Deck Lab · Hand Feel' : game ? `The Deck · ${SCENES[route.id].title}` : 'The Deck';
    device.measure(); // the side panel only takes space in the lab
    if (game && zoomFrom) {
      game.postpone?.(ZOOM_MS); // nothing moves until the zoom lands
      zoomGame($(route.id), zoomFrom, 'in');
    } else if (leavingId) {
      // Back to the lobby: shrink the game back into its card.
      const rect = lobbyNav?.coverRect(leavingId);
      if (rect) zoomGame($(leavingId), rect, 'out');
    }
  },
});

/**
 * Opening a game from the lobby ('in'): the game starts out shrunk to sit
 * inside the card that was tapped, and the camera zooms into that card (lobby
 * and game scale together) while a small circle in the middle of the card
 * grows to reveal the game. Leaving ('out') plays the same thing backwards.
 * All in #screen-local px, so the scaled desktop frame works.
 */
let zoomRaf = 0;
let zoomEnd = null;
function zoomGame(sceneEl, rect, dir) {
  zoomEnd?.(); // finish a zoom that's still running
  const screen = $('screen');
  const lobbyEl = $('lobby');
  const sr = screen.getBoundingClientRect();
  const W = screen.offsetWidth;
  const H = screen.offsetHeight;
  const k = sr.width / W || 1;
  const from = { x: (rect.left + rect.width / 2 - sr.left) / k, y: (rect.top + rect.height / 2 - sr.top) / k };
  const s0 = rect.width / k / Math.min(W, H); // game's short side fits the cover
  const r0 = Math.min(W, H) * 0.12;
  const R = Math.hypot(W, H) / 2 + 2;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const start = performance.now();
  cancelAnimationFrame(zoomRaf);
  document.body.classList.add('zooming');
  // Leaving: the scene is already hidden by the router; keep it on screen until it's back in its card.
  if (dir === 'out') sceneEl.classList.add('zoom-out');
  lobbyEl.style.transformOrigin = `${from.x}px ${from.y}px`;
  sceneEl.style.transformOrigin = '0 0';

  const frame = (now) => {
    const t = Math.min(1, (now - start) / ZOOM_MS);
    const tt = dir === 'out' ? 1 - t : t;
    const e = ease(tt);
    const s = s0 + (1 - s0) * e; // game scale
    const px = from.x + (W / 2 - from.x) * e; // where the game's center is
    const py = from.y + (H / 2 - from.y) * e;
    // Lobby zooms by the same factor around the cover, and follows it.
    lobbyEl.style.transform = `translate(${(px - from.x).toFixed(2)}px, ${(py - from.y).toFixed(2)}px) scale(${(s / s0).toFixed(4)})`;
    sceneEl.style.transform = `translate(${(px - (W / 2) * s).toFixed(2)}px, ${(py - (H / 2) * s).toFixed(2)}px) scale(${s.toFixed(4)})`;
    const r = r0 + (R - r0) * ease(Math.min(1, tt * 1.08));
    sceneEl.style.clipPath = `circle(${r.toFixed(1)}px at ${W / 2}px ${H / 2}px)`;
    if (t < 1) {
      zoomRaf = requestAnimationFrame(frame);
      return;
    }
    zoomEnd();
  };
  zoomEnd = () => {
    cancelAnimationFrame(zoomRaf);
    zoomEnd = null;
    for (const el of [lobbyEl, sceneEl]) {
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.clipPath = '';
    }
    sceneEl.classList.remove('zoom-out');
    document.body.classList.remove('zooming');
  };
  zoomRaf = requestAnimationFrame(frame);
}

// Boot
device.measure();
// Starting on the lobby: play the intro over it first.
if (lobbyNav.route.view === 'lobby') playIntro($('screen'), { lobby: $('lobby') });
debug.setEnabled(settings.debug);
game.newGame(7);
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('booting')));

let last = performance.now();
function frame(now) {
  const raw = Math.max(0, (now - last) / 1000);
  last = now;
  const dt = Math.min(raw, 0.05);
  if (view === 'game') current?.update(now, dt);
  if (!inLab) {
    requestAnimationFrame(frame);
    return;
  }
  game.update(now, dt);
  ripples.update(dt, game);
  sparkles.update(dt, game);
  debug.frame(raw, game, input);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
