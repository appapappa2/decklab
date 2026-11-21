// Challenges: preset games with the rules bent, in the spirit of Balatro's
// challenge runs. Each one is a game you already know with a twist (a limit, a
// handicap, a rule taken away), and winning it ticks it off for good. A game's
// challenges open once you have won that game normally (progress.js).
//
// A challenge is data: which game, its name, the rules as the player reads
// them, and `mods`, which the game's scene reads in setChallenge() to change
// how it plays. Per game they form a chain: the first is open, and winning one
// unlocks the next.
//
//   solitaire  draw, passes (times through the stock), undo, maxMoves, timeLimit (s)
//   blackjack  bank, target, minBet, rounds
//   war        maxRounds, youCards, suddenDeath
//   stress     level, oneStrike, minMoney
//
// In the lobby every game has its own Challenges button under the Play bar,
// with that game's progress; it opens that game's list (createChallenges
// below). Picking one opens its game with the challenge applied (main.js hands it to
// the scene). The end-of-game popup (result.js) marks it complete on a win.
// Leaving the game ends the challenge: the next normal visit is a normal game.
import { GAMES } from './games.js?v=fourcolor';
import { hasWon } from './progress.js?v=fourcolor';
import { rankState } from './rank.js?v=fourcolor';

export const CHALLENGES = [
  { id: 'sol-one-pass', game: 'solitaire', name: 'One Pass', rules: ['Draw 1', 'One time through the stock: it cannot be turned over'], mods: { draw: 1, passes: 1 } },
  { id: 'sol-no-undo', game: 'solitaire', name: 'No Take-backs', rules: ['Draw 3', 'Undo is off'], mods: { draw: 3, undo: false } },
  { id: 'sol-economy', game: 'solitaire', name: 'Economy', rules: ['Draw 1', 'Win in 140 moves or fewer'], mods: { draw: 1, maxMoves: 140 } },
  { id: 'sol-five-minutes', game: 'solitaire', name: 'Five Minutes', rules: ['Draw 1', 'Win before the clock reaches 5:00'], mods: { draw: 1, timeLimit: 300 } },

  { id: 'bj-double', game: 'blackjack', name: 'Double or Nothing', rules: ['Start with 200', 'Reach 400 before you run out'], mods: { bank: 200, target: 400 } },
  { id: 'bj-ten-hands', game: 'blackjack', name: 'Ten Hands', rules: ['Start with 300', 'After ten deals, hold more than you started with'], mods: { bank: 300, rounds: 10 } },
  { id: 'bj-high-roller', game: 'blackjack', name: 'High Roller', rules: ['Start with 500', 'Every bet is at least 100', 'Reach 1,000'], mods: { bank: 500, target: 1000, minBet: 100 } },
  { id: 'bj-short-stack', game: 'blackjack', name: 'Short Stack', rules: ['Start with 50', 'Reach 300'], mods: { bank: 50, target: 300 } },

  { id: 'war-thirty', game: 'war', name: 'Thirty Flips', rules: ['The game ends after 30 rounds', 'Whoever holds more cards wins'], mods: { maxRounds: 30 } },
  { id: 'war-sudden-death', game: 'war', name: 'Sudden Death', rules: ['The first war decides the whole game'], mods: { suddenDeath: true } },
  { id: 'war-underdog', game: 'war', name: 'Underdog', rules: ['You start with 16 cards, the CPU with 36'], mods: { youCards: 16 } },

  { id: 'st-cold-hands', game: 'stress', name: 'Cold Hands', rules: ['The CPU plays on Hard'], mods: { level: 'hard' } },
  { id: 'st-money-talks', game: 'stress', name: 'Money Talks', rules: ['Medium CPU', 'Win with at least $35'], mods: { level: 'normal', minMoney: 35 } },
  { id: 'st-one-strike', game: 'stress', name: 'One Strike', rules: ['Medium CPU', 'Lose a single Stress call and the game is over'], mods: { level: 'normal', oneStrike: true } },

  { id: 'sp-quick-hands', game: 'speed', name: 'Quick Hands', rules: ['The CPU plays on Hard'], mods: { level: 'hard' } },
  // No twist yet for these two: the plain game, counted.
  { id: 'c8-beat-cpu', game: 'crazy-eights', name: 'Wild Night', rules: ['Beat the CPU'], mods: {} },
  { id: 'gf-beat-cpu', game: 'go-fish', name: 'Good Catch', rules: ['Beat the CPU'], mods: {} },

  // Every game with a multiplayer mode has one for it. Multiplayer is pass and
  // play on one device, so "you" are Player 1 (seat 0); result.js asks the
  // scene (`seatWon(0)`) who won.
  ...GAMES.filter((g) => g.ready?.includes('multi')).map((g) => ({
    id: `${g.id}-multi`,
    game: g.id,
    mode: 'multi',
    name: 'Table for Two',
    rules: ['Win a multiplayer match as Player 1'],
    mods: {},
  })),
];

const KEY = 'thedeck.challenges';
const byId = new Map(CHALLENGES.map((c) => [c.id, c]));

function load() {
  try {
    return new Set((JSON.parse(localStorage.getItem(KEY)) ?? []).filter((id) => byId.has(id)));
  } catch {
    return new Set();
  }
}
let done = load();

export const isDone = (id) => done.has(id);
// The later challenges of a game also need a rank (rank.js): the third rank 3, the fourth rank 5.
for (const g of GAMES) {
  CHALLENGES.filter((c) => c.game === g.id && c.mode !== 'multi').forEach((c, i) => {
    if (i >= 2) c.rank = i === 2 ? 3 : 5;
  });
}

/**
 * Why a challenge can't be played yet, or null if it can. In order: the game
 * has to be won once; then the challenges of a game form a chain (winning one
 * opens the next; the multiplayer one stands apart); and the later ones need a rank.
 */
export function lockReason(ch) {
  if (!hasWon(ch.game)) return ch.game === 'blackjack' ? 'Win a hand of Blackjack first' : `Win a game of ${GAMES.find((g) => g.id === ch.game)?.name ?? 'it'} first`;
  if (ch.mode !== 'multi') {
    const chain = CHALLENGES.filter((c) => c.game === ch.game && c.mode !== 'multi');
    const prev = chain[chain.indexOf(ch) - 1];
    if (prev && !done.has(prev.id)) return `Complete “${prev.name}” first`;
  }
  if (ch.rank && rankState().rank < ch.rank) return `Needs rank ${ch.rank}`;
  return null;
}
export const isUnlocked = (ch) => !lockReason(ch);
export const progress = () => ({ done: done.size, total: CHALLENGES.length });
/** How far along one game's challenges are. */
export function gameProgress(gameId) {
  const chain = CHALLENGES.filter((c) => c.game === gameId);
  return { done: chain.filter((c) => done.has(c.id)).length, total: chain.length };
}

/** Marks a challenge won. Returns true the first time. */
export function complete(id) {
  if (!byId.has(id) || done.has(id)) return false;
  done.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...done]));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent('challengechange'));
  return true;
}

// The challenge about to be played (picked in the lobby, not yet handed to its
// game) and the one being played now.
let pending = null;
let current = null;
/** Called as a game opens: the challenge picked for it, if any. It becomes the current one. */
export function takeChallenge(gameId) {
  current = pending && pending.game === gameId ? pending : null;
  pending = null;
  return current;
}
/** The challenge being played on this table, or null. */
export const activeChallenge = (gameId) => (current && current.game === gameId ? current : null);

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const TROPHY = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 3h10v5.5a5 5 0 0 1-10 0z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 5H4.5v1.2a3.3 3.3 0 0 0 3.1 3.3M17 5h2.5v1.2a3.3 3.3 0 0 1-3.1 3.3M12 13.5V17"/><path fill="currentColor" d="M10 16.5h4v3h-4zM8 21a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 21v.5H8z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="3" fill="currentColor"/></svg>';

/**
 * The lobby's Challenges button, which sits under the selected game's Play bar
 * and is about that game only (its progress meter and "2 of 4"), and the list
 * it opens. `setGame(game)` points both at the game the carousel is on.
 */
export function createChallenges({ haptic = () => {} } = {}) {
  let game = GAMES[0];

  const button = h('button', 'gs-ch');
  button.type = 'button';
  const icon = h('span', 'gs-ch-icon');
  const meter = h('span', 'gs-ch-meter');
  const meterFill = h('i');
  meter.append(meterFill);
  const tally = h('span', 'gs-ch-count');
  button.append(icon, h('span', 'gs-ch-label', 'Challenges'), meter, tally);

  const wrap = h('div', 'gs-sheet-wrap ch-wrap');
  const card = h('div', 'gs-sheet ch-sheet');
  card.setAttribute('role', 'dialog');
  const title = h('div', 'gs-sheet-title');
  const count = h('div', 'ch-count');
  const bar = h('div', 'pf-bar');
  const fill = h('i');
  bar.append(fill);
  const list = h('div', 'ch-list');
  const close = h('button', 'game-btn ch-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => open(false));
  card.append(title, count, bar, list, close);
  wrap.append(card);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) open(false);
  });

  function paintButton() {
    const p = gameProgress(game.id);
    // Challenges open once you have won the game (your first rank objective is to win each of them once).
    const locked = !hasWon(game.id);
    button.hidden = !p.total;
    button.classList.toggle('locked', locked);
    icon.innerHTML = locked ? LOCK : TROPHY;
    meter.hidden = locked;
    const how = game.id === 'blackjack' ? 'Win a hand to unlock' : 'Win a game to unlock';
    button.setAttribute('aria-label', locked ? `${game.name} challenges: ${how.toLowerCase()}` : `${game.name} challenges, ${p.done} of ${p.total} complete`);
    meterFill.style.width = `${p.total ? Math.round((p.done / p.total) * 100) : 0}%`;
    tally.textContent = locked ? how : `${p.done} of ${p.total}`;
  }
  function paint() {
    const p = gameProgress(game.id);
    card.setAttribute('aria-label', `${game.name} challenges`);
    card.dataset.c = game.color;
    title.textContent = game.name;
    count.textContent = hasWon(game.id) ? `${p.done} of ${p.total} challenges complete` : `${game.id === 'blackjack' ? 'Win a hand' : 'Win a game'} to unlock these`;
    fill.style.width = `${p.total ? Math.round((p.done / p.total) * 100) : 0}%`;
    list.replaceChildren();
    for (const ch of CHALLENGES.filter((c) => c.game === game.id)) {
      const why = isDone(ch.id) ? null : lockReason(ch);
      const state = isDone(ch.id) ? 'done' : why ? 'locked' : 'open';
      const row = h('button', `ch-row ${state}`);
      row.type = 'button';
      row.disabled = state === 'locked';
      const text = h('span', 'ch-text');
      // A locked challenge still shows its rules (a sneak peek), with what unlocks it underneath.
      text.append(h('span', 'ch-name', ch.name), h('span', 'ch-rules', ch.rules.join(' · ')));
      if (why) text.append(h('span', 'ch-why', why));
      const badge = h('span', 'ch-badge');
      if (state === 'done') badge.innerHTML = CHECK;
      else if (state === 'locked') badge.innerHTML = LOCK;
      else badge.textContent = 'Play';
      row.append(text, badge);
      row.addEventListener('click', () => {
        haptic(10);
        pending = ch;
        open(false);
        const base = game.route ?? `#/play/${game.id}`;
        const route = ch.mode === 'multi' ? `${base}/multi` : base;
        // Already there (a link straight into the game)? Then the hash doesn't change, so go via the lobby.
        if (location.hash === route) location.hash = '#/';
        location.hash = route;
      });
      list.append(row);
    }
  }
  function open(show) {
    if (show) paint();
    wrap.classList.toggle('show', show);
  }
  function setGame(g) {
    game = g;
    paintButton();
  }
  button.addEventListener('click', () => {
    haptic(8);
    open(true); // also while locked: the list is a sneak peek then, nothing in it can be started
  });
  window.addEventListener('challengechange', () => {
    paintButton();
    if (wrap.classList.contains('show')) paint();
  });
  window.addEventListener('progresschange', () => {
    paintButton();
    if (wrap.classList.contains('show')) paint();
  });
  paintButton();

  return { button, sheet: wrap, open, setGame, isOpen: () => wrap.classList.contains('show') };
}
