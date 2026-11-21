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
// The rank and its progress are the profile's (profile.js): games won at least
// once. The first win of a game is recorded here (progress.js).
import { avatarHTML, loadAvatar } from './profile.js?v=fourcolor';
import { rankState, rankGoalHTML } from './rank.js?v=fourcolor';
import { activeChallenge, complete, gameProgress } from './challenges.js?v=fourcolor';
import { recordWin } from './progress.js?v=fourcolor';

const RESULT = /\b(won|wins?|lost|loses?|tied?|draw|over|last out)\b/i;

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

  const rankBefore = rankState().rank;

  // Did you win? Against the CPU that is seat 0 (or what the title says). The
  // first win of a game counts toward your rank and unlocks its challenges.
  const sceneId = win.closest('.game-scene')?.id;
  const table = window.lab?.[sceneId];
  const single = !table?.mode || table.mode === 'single';
  const youWon = single && (typeof table?.seatWon === 'function' ? !!table.seatWon(0) : /^you (won|win)/i.test(title.textContent.trim()));
  if (youWon && recordWin(sceneId) && gameProgress(sceneId).total) {
    const line = document.createElement('div');
    line.className = 'rs-ch rs-added won';
    line.textContent = 'Challenges unlocked';
    title.before(line);
  }

  // A challenge: winning the game completes it. The popup says which one and how it went.
  const ch = activeChallenge(win.closest('.game-scene')?.id);
  if (ch) {
    // Against the CPU the title says it; in a multiplayer (pass and play) match you are Player 1, and the scene knows who won.
    const scene = window.lab?.[ch.game];
    const won = ch.mode === 'multi' ? scene?.mode === 'multi' && !!scene.seatWon?.(0) : /^you (won|win)/i.test(title.textContent.trim());
    if (won) complete(ch.id);
    const line = document.createElement('div');
    line.className = `rs-ch rs-added ${won ? 'won' : 'lost'}`;
    line.textContent = `${ch.name} · ${won ? 'Challenge complete' : 'Challenge failed'}`;
    title.before(line);
  }

  // Your avatar breaks out of the top of the card; the way to the next rank sits in a small gray box.
  // A win or a completed challenge may just have raised your rank.
  const rankNow = rankState().rank;
  if (rankNow > rankBefore) {
    const line = document.createElement('div');
    line.className = 'rs-ch rs-added won';
    line.textContent = `Rank up: you are rank ${rankNow}`;
    title.before(line);
  }
  const box = document.createElement('div');
  box.className = 'rs-box rs-added';
  const avatar = document.createElement('div');
  avatar.className = 'pf-avatar rs-avatar rs-added';
  avatar.innerHTML = `<span class="pf-face">${avatarHTML(loadAvatar())}</span><span class="pf-rank">${rankNow}</span>`;
  const goal = document.createElement('div');
  goal.className = 'pf-goal';
  goal.innerHTML = rankGoalHTML();
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
