import { initDevice, EMBED } from './device.js';
import { buildPanel, loadSettings, saveSettings } from './settings.js';
import { Game } from './game.js?v=fourcolor';
import { Input } from './input.js';
import { DebugOverlay } from './debug.js';
import { cardBackHTML } from './cards.js?v=fourcolor';
import { SparkleTrail } from './sparkles.js?v=fourcolor';
import { LandingRipples } from './ripples.js?v=fourcolor';
import { initLobby } from './lobby.js?v=fourcolor';
import { GAMES } from './games.js?v=fourcolor';
import { setScreenColor, setTheme } from './theme.js';
import { playTransition, DEAL_AT } from './transition.js?v=fourcolor';
import { installGameMenu } from './gamemenu.js?v=fourcolor';
import { initHud } from './hud.js?v=fourcolor';
import { initResults } from './result.js?v=fourcolor';
import { initFx } from './fx.js?v=fourcolor';
import { loadPresets } from './fx-presets.js?v=fourcolor';
import { playIntro } from './intro.js?v=fourcolor';
import { SolitaireScene } from './solitaire/scene.js?v=fourcolor';
import { WarScene } from './war/scene.js?v=fourcolor';
import { EightsScene } from './eights/scene.js?v=fourcolor';
import { GoFishScene } from './gofish/scene.js?v=fourcolor';
import { BlackjackScene } from './blackjack/scene.js?v=fourcolor';
import { PalaceScene } from './palace/scene.js?v=fourcolor';
import { StressScene } from './stress/scene.js?v=fourcolor';
import { SpeedScene } from './speed/scene.js?v=fourcolor';
import { CasinoScene } from './casino/scene.js?v=fourcolor';
import { GinScene } from './gin/scene.js?v=fourcolor';
import { SlapjackScene } from './slapjack/scene.js?v=fourcolor';
import { sfx, installUiSounds } from './sfx.js';

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
  'go-fish': { title: 'Go Fish!', make: (root, opts) => new GoFishScene(root, opts) },
  blackjack: { title: 'Blackjack', make: (root, opts) => new BlackjackScene(root, opts) },
  palace: { title: 'Palace', make: (root, opts) => new PalaceScene(root, opts) },
  stress: { title: 'Stress', make: (root, opts) => new StressScene(root, opts) },
  speed: { title: 'Speed', make: (root, opts) => new SpeedScene(root, opts) },
  casino: { title: 'Casino', make: (root, opts) => new CasinoScene(root, opts) },
  gin: { title: 'Gin Rummy', make: (root, opts) => new GinScene(root, opts) },
  slapjack: { title: 'Slapjack', make: (root, opts) => new SlapjackScene(root, opts) },
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
// Confetti, bursts, shakes and score pops for every game (fx.js).
window.lab.fx = initFx(screenEl);
// What each effect looks like is saved data (edited on the devboard's VFX/Animations tab).
loadPresets().then(({ presets }) => window.lab.fx.setPresets(presets));
// The devboard's VFX/Animations tab lists them (fxboard.js, set up by devboard.js)
// and plays them in a frozen copy of a table: this page, embedded.
window.lab.playTransition = playTransition;
// Sound: taps and buttons on the screen; the rest is played where it happens (sfx.js).
// window.lab.sfx is how the devboard's embedded table plays through this page.
installUiSounds(screenEl);
window.lab.sfx = sfx;
// Avatars, the opponents' corner and the pills by your hand (hud.js).
initHud(screenEl);
initResults(screenEl); // the end-of-game popup: every game's result card, dressed like the profile sheet

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
      device,
      settings,
      haptic,
      onExit: () => {
        location.hash = '#/';
      },
    });
    scenes[id] = sc;
    installGameMenu($(id)); // options and the exit live behind the … button
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
  haptic,
  settings,
  saveSettings: () => {
    saveSettings(settings);
    panel.refresh(); // the lab's side panel shows the same switches
  },
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
    // A game keeps its lobby colors (matters when it is opened straight from a link).
    const entry = game && GAMES.find((g) => g.id === route.id);
    if (entry) setScreenColor(entry.color, entry.pop);
    game?.setMode?.(route.mode);
    game?.show();
    for (const v of ['lab', 'game', 'lobby']) document.body.classList.toggle(`route-${v}`, view === v);
    document.body.classList.remove('panel-open');
    document.title = lab ? 'The Deck Lab · Hand Feel' : game ? `The Deck · ${SCENES[route.id].title}` : 'The Deck';
    device.measure(); // the side panel only takes space in the lab
    if (game && zoomFrom) {
      game.postpone?.(DEAL_AT); // the deal starts as the curtain of cards falls away
      zoomGame($(route.id), 'in');
    } else if (leavingId) {
      // Back to the lobby: shrink the game back into its card.
      const rect = lobbyNav?.coverRect(leavingId);
      if (rect) zoomGame($(leavingId), 'out'); // (coverRect also brings that game back to the middle)
    }
  },
});

/** The card transition between the lobby and a game (transition.js). */
let zoomEnd = null;
function zoomGame(sceneEl, dir) {
  zoomEnd?.(); // finish a transition that's still running
  zoomEnd = playTransition({ screen: $('screen'), lobbyEl: $('lobby'), sceneEl, dir });
}

// Boot
device.measure();
// Starting on the lobby: play the intro over it first.
if (lobbyNav.route.view === 'lobby') playIntro($('screen'), { lobby: $('lobby') });
// Embedded in the devboard (?embed=stress): a table to look at, not to play.
// Deal, skip the countdown, let the middle piles turn over at "Go", then hold
// everything still. The CPU never moves and the iframe takes no pointer input.
if (EMBED && lobbyNav.route.view === 'game' && lobbyNav.route.id === EMBED) {
  const sc = scenes[EMBED];
  const update = sc.update.bind(sc);
  let holdAt = 0;
  sc.banner = () => {}; // no 3, 2, 1, Go!
  sc.update = (now, dt) => {
    if (sc.phase === 'play') {
      sc.cpuAt = sc.callAt = Infinity; // the CPU never plays or calls
      // The first flip fills the middle piles; once they show, hold a moment for the cards to land.
      if (sc.rules.centers.every((c) => c.length)) {
        sc.stuckAt = Infinity;
        holdAt ||= now + 900;
        if (now > holdAt) {
          window.lab.sfxLive = true; // from here on, effects on this table are heard (sfx.js)
          return;
        }
      }
    }
    update(now, dt);
  };
  sc.begin();
  sc.goAt = performance.now() + 1300; // right after the deal
  // The devboard's backdrop switch writes to storage; follow it.
  window.addEventListener('storage', (e) => {
    if (e.key === 'thedeck.theme') setTheme(e.newValue);
  });
}
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
