import { initDevice } from './device.js';
import { buildPanel, loadSettings, saveSettings } from './settings.js';
import { Game } from './game.js?v=middle-only-landings';
import { Input } from './input.js';
import { DebugOverlay } from './debug.js';
import { cardBackHTML } from './cards.js?v=landing-burst';
import { SparkleTrail } from './sparkles.js?v=landing-burst';
import { LandingRipples } from './ripples.js?v=water-ripple';
import { initLobby } from './lobby.js?v=war';
import { SolitaireScene } from './solitaire/scene.js?v=war';
import { WarScene } from './war/scene.js?v=war';

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

// Handy for poking at state from the devtools console.
window.lab = { game, input, settings, device, sparkles, ripples };

// Lobby / routing. The lab stays loaded underneath; it is only shown (and
// updated) on its route. Games are created the first time they're opened.
let inLab = false;
let view = 'lobby';
function openGame(id) {
  const def = SCENES[id];
  if (!def) return null;
  if (!scenes[id]) {
    const sc = def.make($(id), {
      scale: () => device.scale,
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
initLobby($('lobby'), {
  onRoute(route) {
    const lab = route.view === 'lab';
    const game = route.view === 'game' ? openGame(route.id) : null;
    view = lab ? 'lab' : game ? 'game' : 'lobby';
    inLab = lab;
    input.cancel();
    input.clearHover();
    if (current && current !== game) current.hide();
    current = game;
    game?.show();
    for (const v of ['lab', 'game', 'lobby']) document.body.classList.toggle(`route-${v}`, view === v);
    document.body.classList.remove('panel-open');
    document.title = lab ? 'The Deck Lab · Hand Feel' : game ? `The Deck · ${SCENES[route.id].title}` : 'The Deck';
    device.measure(); // the side panel only takes space in the lab
  },
});

// Boot
device.measure();
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
