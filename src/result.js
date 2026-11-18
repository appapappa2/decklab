// The end-of-game popup. Every game already builds its own result card (a
// title, a line of stats, "Play again" and a way out); this turns each of them
// into the same sheet as your profile in the lobby: your avatar (with its rank badge)
// sticking out of the top edge, the result, a small box with your progress
// toward the next rank, then the choices stacked: play again, and always an exit.
//
// It works on the cards the games make, so they need nothing: when a
// `.game-win` appears, it is dressed if it is a result (setup cards, which use
// the same element, are left alone).
//
// The rank and the progress are the profile's made-up numbers (profile.js).
import { RANK, avatarHTML, loadAvatar } from './profile.js?v=fourcolor';
import { GAMES } from './games.js?v=fourcolor';

const RESULT = /\b(won|wins?|lost|loses?|tied?|draw|over)\b/i;

function dress(win) {
  const card = win.querySelector('.game-win-card');
  if (!card) return;
  const title = card.querySelector('.game-win-title');
  const actions = card.querySelector('.game-win-actions');
  const buttons = actions ? [...actions.querySelectorAll('button')] : [];
  const isResult = !!title && RESULT.test(title.textContent) && buttons.some((b) => /again|new game/i.test(b.textContent));
  for (const n of card.querySelectorAll('.rs-added')) n.remove();
  card.classList.toggle('result', isResult);
  if (!isResult) return;

  // Your avatar breaks out of the top of the card; the way to the next rank sits in a small gray box.
  const total = GAMES.length;
  const box = document.createElement('div');
  box.className = 'rs-box rs-added';
  const avatar = document.createElement('div');
  avatar.className = 'pf-avatar rs-avatar rs-added';
  avatar.innerHTML = `<span class="pf-face">${avatarHTML(loadAvatar())}</span><span class="pf-rank">${RANK.rank}</span>`;
  const goal = document.createElement('div');
  goal.className = 'pf-goal';
  goal.innerHTML =
    `<div class="pf-goal-label">Next: rank ${RANK.rank + 1}</div>` +
    `<div class="pf-goal-title">Win every game once</div>` +
    `<div class="pf-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${RANK.won}"><i style="width:${Math.round((RANK.won / total) * 100)}%"></i></div>` +
    `<div class="pf-goal-count">${RANK.won} of ${total}</div>`;
  box.append(goal);
  card.prepend(avatar);
  actions.before(box);

  // Every result has a way out: the game's own, or the … menu's.
  for (const b of buttons) if (/^lobby$/i.test(b.textContent.trim())) b.textContent = 'Exit';
  const menuExit = win.closest('.game-scene')?.querySelector('.gm-exit');
  if (menuExit && !buttons.some((b) => /^exit$/i.test(b.textContent.trim()))) {
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'game-btn rs-added';
    exit.textContent = 'Exit';
    exit.addEventListener('click', () => menuExit.click());
    actions.append(exit);
  }
}

/**
 * A finished game doesn't wait for you: if this table was left with its result
 * showing, coming back starts over (the same thing "Play again" does), so the
 * popup is only ever seen right after a game is won or lost.
 */
export function clearResult(sceneEl) {
  const card = sceneEl?.querySelector('.game-win.show > .game-win-card.result');
  const again = card && [...card.querySelectorAll('.game-win-actions button')].find((b) => /again|new game/i.test(b.textContent));
  again?.click();
}

export function initResults(screen) {
  new MutationObserver((muts) => {
    for (const m of muts) {
      const el = m.target;
      if (!(el instanceof Element) || !el.matches('.game-win') || !el.classList.contains('show')) continue;
      if ((m.oldValue ?? '').split(/\s+/).includes('show')) continue;
      dress(el);
    }
  }).observe(screen, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
}
