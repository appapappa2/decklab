// Your rank, and what it takes to reach the next one.
//
// The loop: winning a game unlocks its challenges; completing challenges (and
// winning more games) raises your rank; a higher rank opens the later
// challenges of each game (challenges.js: the third needs rank 3, the fourth
// rank 5). Each rank has one objective, and they are met in order.
import { GAMES } from './games.js?v=fourcolor';
import { wonCount } from './progress.js?v=fourcolor';
import { CHALLENGES, isDone } from './challenges.js?v=fourcolor';

const doneCount = () => CHALLENGES.filter((c) => isDone(c.id)).length;
/** Games with at least one challenge completed. */
const gamesTouched = () => new Set(CHALLENGES.filter((c) => isDone(c.id)).map((c) => c.game)).size;
/** Games with every challenge completed (only games that have three or more). */
const gamesFinished = () =>
  GAMES.filter((g) => {
    const list = CHALLENGES.filter((c) => c.game === g.id);
    return list.length >= 3 && list.every((c) => isDone(c.id));
  }).length;
const multi = () => CHALLENGES.filter((c) => c.mode === 'multi');

/** RANKS[i] is the objective that takes you from rank i + 1 to rank i + 2. `get` returns [how far, how far it has to be]. */
export const RANKS = [
  { title: 'Win 3 different games', get: () => [wonCount(), 3] },
  { title: 'Complete 3 challenges', get: () => [doneCount(), 3] },
  { title: 'Complete a challenge in 4 different games', get: () => [gamesTouched(), 4] },
  { title: 'Win every game once', get: () => [wonCount(), GAMES.length] },
  { title: 'Finish every challenge of one game', get: () => [gamesFinished(), 1] },
  { title: 'Complete 12 challenges', get: () => [doneCount(), 12] },
  { title: 'Win a multiplayer match in every multiplayer game', get: () => [multi().filter((c) => isDone(c.id)).length, multi().length] },
  { title: 'Finish every challenge of 4 games', get: () => [gamesFinished(), 4] },
  { title: 'Complete every challenge', get: () => [doneCount(), CHALLENGES.length] },
];
export const TOP_RANK = RANKS.length + 1;

/** { rank, next }: `next` is the objective you are on ({ title, value, target }), or null at the top rank. */
export function rankState() {
  let rank = 1;
  for (const r of RANKS) {
    const [value, target] = r.get();
    if (value < target) return { rank, next: { title: r.title, value: Math.min(value, target), target } };
    rank++;
  }
  return { rank, next: null };
}

/** The "next rank" block (label, objective, bar, count), shared by the profile sheet and the end-of-game popup. */
export function rankGoalHTML() {
  const { rank, next } = rankState();
  if (!next) return `<div class="pf-goal-label">Rank ${rank}</div><div class="pf-goal-title">Top rank: everything is done</div><div class="pf-bar"><i style="width:100%"></i></div>`;
  return (
    `<div class="pf-goal-label">Next: rank ${rank + 1}</div>` +
    `<div class="pf-goal-title">${next.title}</div>` +
    `<div class="pf-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${next.target}" aria-valuenow="${next.value}"><i style="width:${Math.round((next.value / next.target) * 100)}%"></i></div>` +
    `<div class="pf-goal-count">${next.value} of ${next.target}</div>`
  );
}
