// What you have done so far: the games you have won at least once. It is the
// first rank objective ("Win every game once", profile.js), and winning a game
// is what unlocks that game's challenges (challenges.js). Saved on this device.
const KEY = 'thedeck.wins';

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
const wins = load();

export const hasWon = (gameId) => wins.has(gameId);
export const wonCount = () => wins.size;

/** A game was won. Returns true the first time for that game. */
export function recordWin(gameId) {
  if (!gameId || wins.has(gameId)) return false;
  wins.add(gameId);
  try {
    localStorage.setItem(KEY, JSON.stringify([...wins]));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent('progresschange'));
  return true;
}
