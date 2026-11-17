// The effects board: a small panel next to the devboard's Animations phone, with a button for
// every effect, so each one can be looked at on its own. The first group is
// what the games already trigger by themselves; the second is the bigger
// moments that nothing triggers yet (fx.js has both).
import { playTransition } from './transition.js?v=fourcolor';

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

// `transition` is the curtain to play: pass the one from the page that owns
// `screen` when that is another document (the devboard's embedded table).
export function initFxBoard(stage, screen, fx, { transition = playTransition } = {}) {
  const mid = () => {
    const { W, H } = fx.size();
    return { x: W / 2, y: H * 0.44 };
  };
  // Where a score lives right now: your pill at a table, your avatar in the lobby.
  const scoreEl = () =>
    [...screen.querySelectorAll('.game-scene.active .hud-mine, .game-scene.active .hud-you, .gs-you')].find((el) => el.getClientRects().length && (el.textContent || el.dataset.av));
  // The card curtain normally swaps the lobby and a table underneath it; here it just passes over.
  const curtain = () => transition({ screen, lobbyEl: document.createElement('div'), sceneEl: document.createElement('div'), dir: 'in' });
  let streak = 1;
  let streakTimer = 0;

  const GROUPS = [
    ['In the games now', [
      ['Sparks', () => fx.burst(mid().x, mid().y, { count: 16, speed: 320 })],
      ['Big burst', () => (fx.burst(mid().x, mid().y, { count: 22, speed: 420, big: true }), fx.shake(fx.stage(), 7))],
      ['Shake', () => fx.shake(fx.stage(), 7)],
      ['Score +3', () => fx.score(scoreEl(), 3)],
      ['Your turn', () => fx.glow()],
      ['Confetti', () => fx.confetti()],
      ['Card curtain', curtain],
      ['Countdown', () => fx.countdown()],
    ]],
    ['New', [
      ['Win', () => fx.win()],
      ['Lose', () => fx.lose()],
      ['Fireworks', () => fx.fireworks()],
      ['Coins', () => fx.coins()],
      ['Suit rain', () => fx.suits()],
      ['Flash', () => fx.flash()],
      // Pressed again within a moment, the combo climbs.
      ['Combo', () => {
        clearTimeout(streakTimer);
        streak = Math.min(9, streak + 1);
        fx.combo(streak);
        streakTimer = setTimeout(() => (streak = 1), 1600);
      }],
      ['Rank up', () => fx.rankUp(2)],
    ]],
  ];

  const board = h('aside', '');
  board.id = 'fx-board';
  board.setAttribute('aria-label', 'Effects');
  board.append(h('div', 'fxb-title', 'Effects'));
  for (const [name, items] of GROUPS) {
    board.append(h('div', 'fxb-group', name));
    for (const [label, run] of items) {
      const b = h('button', 'fxb-btn', label);
      b.type = 'button';
      b.addEventListener('click', run);
      board.append(b);
    }
  }
  // Presses here are for the board, not for the game under the pointer.
  for (const type of ['pointerdown', 'pointerup', 'keydown']) board.addEventListener(type, (e) => e.stopPropagation());
  stage.append(board);
  return board;
}
