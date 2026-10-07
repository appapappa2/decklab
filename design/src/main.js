import { initDevice } from './device.js';
import { buildPanel, loadSettings, saveSettings } from './settings.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { DebugOverlay } from './debug.js';

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
const game = new Game(
  {
    screen: screenEl,
    layer: $('cards'),
    ui: $('ui'),
    deck: $('deck'),
    deckCount: $('deck-count'),
    playzone: $('playzone'),
    edgeL: $('edge-left'),
    edgeR: $('edge-right'),
  },
  settings,
  haptic,
);
const debug = new DebugOverlay($('debug'));

let input = null;
const device = initDevice({
  onResize(W, H, safe) {
    game.setSize(W, H, safe);
    debug.resize(W, H);
  },
  onRotateStart() {
    input?.cancel();
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
window.lab = { game, input, settings, device };

// Boot
device.measure();
debug.setEnabled(settings.debug);
game.newGame(7);
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('booting')));

let last = performance.now();
function frame(now) {
  const raw = Math.max(0, (now - last) / 1000);
  last = now;
  game.update(now, Math.min(raw, 0.05));
  debug.frame(raw, game, input);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
