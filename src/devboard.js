// The devboard: the desktop shell around the phone. A bar on top switches
// between three tabs:
//   Game        the phone running the app (lobby, games, hand feel lab)
//   Animations  a second phone showing a frozen Stress table, with the effects
//               board beside it; every effect plays on that table
//   Sounds      the DL-1 synth and the sound bank (sounds/panel.js)
// On a real phone (mode-phone) there is no shell: only the game shows.
import { detectMode } from './device.js';
import { initFxBoard } from './fxboard.js?v=fourcolor';
import { fullMotion, setFullMotion } from './motion.js';

const TABS = ['game', 'animations', 'sounds'];
const KEY = 'thedeck.devboard.tab';
const PHONE = { w: 393, h: 852, bezel: 14 };

const body = document.body;
const desktop = detectMode() === 'desktop';
if (desktop) body.classList.add('devboard');

// ?tab=<id> opens a tab directly; otherwise the last one used.
let tab = new URLSearchParams(location.search).get('tab');
if (!TABS.includes(tab)) {
  tab = 'game';
  try {
    const saved = localStorage.getItem(KEY);
    if (TABS.includes(saved)) tab = saved;
  } catch {}
}

const buttons = [...document.querySelectorAll('#devboard-bar [data-tab]')];

function select(next) {
  tab = desktop && TABS.includes(next) ? next : 'game';
  body.dataset.devtab = tab;
  for (const b of buttons) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const p of document.querySelectorAll('.db-pane')) p.hidden = p.dataset.tab !== tab;
  try {
    localStorage.setItem(KEY, tab);
  } catch {}
  // The game's frame fits itself to its pane on resize; it measured 0×0 while hidden.
  window.dispatchEvent(new Event('resize'));
  fitAnimationPhone();
  if (tab === 'animations') loadAnimationTable();
  if (tab === 'sounds') loadSounds();
  else sounds?.hide();
}

/** The Sounds tab is built the first time it opens. */
let sounds = null;
let soundsLoading = false;
function loadSounds() {
  if (sounds) return sounds.show();
  if (soundsLoading) return;
  soundsLoading = true;
  import('./sounds/panel.js').then(({ initSounds }) => {
    sounds = initSounds(document.getElementById('pane-sounds'));
    if (tab === 'sounds') sounds.show();
  });
}

/**
 * The Animations phone is this same page in an iframe (?embed=stress): a Stress
 * table that deals and then holds still (main.js). Loaded the first time the
 * tab opens; the effects board then drives that page's fx.
 */
const frame = document.getElementById('anim-frame');
function loadAnimationTable() {
  if (!frame || frame.src) return;
  frame.addEventListener(
    'load',
    () => {
      const w = frame.contentWindow;
      const screen = frame.contentDocument?.getElementById('screen');
      if (!w?.lab?.fx || !screen) return;
      initFxBoard(animStage, screen, w.lab.fx, { transition: w.lab.playTransition });
    },
    { once: true },
  );
  frame.src = 'index.html?embed=stress#/play/stress';
}

for (const b of buttons) b.addEventListener('click', () => select(b.dataset.tab));

// Full motion: play every animation even when the system asks for reduced
// motion (motion.js). The embedded table follows through localStorage.
const motionBtn = document.getElementById('db-motion');
const showMotion = () => motionBtn?.setAttribute('aria-checked', String(fullMotion()));
motionBtn?.addEventListener('click', () => {
  setFullMotion(!fullMotion());
  showMotion();
});
showMotion();

// Keys belong to the game only while its tab is showing (the lobby, the lab
// and the scenes all listen on window/document). On the Sounds tab they play the synth.
window.addEventListener(
  'keydown',
  (e) => {
    if (tab === 'game') return;
    e.stopImmediatePropagation();
    if (tab === 'sounds') sounds?.keydown(e);
  },
  true,
);
window.addEventListener('keyup', (e) => {
  if (tab === 'sounds') sounds?.keyup(e);
});
// A key held while the window loses focus would never get its keyup.
window.addEventListener('blur', () => {
  sounds?.hide();
  if (tab === 'sounds') sounds?.show();
});

/** Scale the Animations tab's phone frame to fit its pane, like the game's. */
const animStage = document.querySelector('#pane-animations .db-stage');
const animFit = document.querySelector('#pane-animations .db-phone-fit');
const animPhone = document.querySelector('#pane-animations .db-phone');
function fitAnimationPhone() {
  if (!animStage || tab !== 'animations') return;
  const outerW = PHONE.w + PHONE.bezel * 2;
  const outerH = PHONE.h + PHONE.bezel * 2;
  const s = Math.max(0.25, Math.min(1, (animStage.clientWidth - 48) / outerW, (animStage.clientHeight - 48 - 52) / outerH));
  animFit.style.width = `${outerW * s}px`;
  animFit.style.height = `${outerH * s}px`;
  animPhone.style.transform = `translate(-50%, -50%) scale(${s})`;
}
window.addEventListener('resize', fitAnimationPhone);

select(tab);
