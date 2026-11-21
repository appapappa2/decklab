// Your profile in the lobby: the avatar top left (with your rank in a small
// badge on its corner) and the sheet it opens, with your rank, the objective
// that leads to the next one, and a way to change the avatar.
//
// The rank is real (rank.js): each rank has one objective, built from the games
// you have won and the challenges you have completed. The avatar you pick (or upload) is remembered on this device.
import { suitHTML } from './cards.js?v=fourcolor';
import { rankState, rankGoalHTML } from './rank.js?v=fourcolor';

const AVATAR_KEY = 'thedeck.avatar';
const FACES = ['S', 'H', 'C', 'D']; // the four suits you can pick; until you pick one (or upload a picture) the avatar says "You"

// The rank comes from rank.js: one objective per rank, met in order.
const MOCK = {
  get rank() {
    return rankState().rank;
  },
};
/** The same numbers, for the end-of-game popup (result.js). */
export const RANK = MOCK;
export { faceHTML as avatarHTML, loadAvatar };

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

function loadAvatar() {
  try {
    return localStorage.getItem(AVATAR_KEY) || 'you';
  } catch {
    return 'you';
  }
}

/** What goes inside an avatar circle: "You", a suit, or an uploaded picture. */
function faceHTML(avatar) {
  if (avatar === 'you') return 'You';
  if (FACES.includes(avatar)) return suitHTML(avatar);
  return `<img src="${avatar}" alt="">`;
}

/**
 * Builds the avatar button and its sheet. `total` is the number of games in
 * the lobby (the first objective is to win each of them once).
 */
export function createProfile({ total, haptic = () => {} }) {
  let avatar = loadAvatar();

  // The avatar in the lobby's corner, with the rank badge.
  const button = h('button', 'gs-you');
  button.type = 'button';
  button.setAttribute('aria-label', `Your profile, rank ${MOCK.rank}`);
  const face = h('span', 'pf-face');
  button.append(face, h('span', 'pf-rank', String(MOCK.rank)));

  // The sheet: everything on one centered axis.
  const wrap = h('div', 'gs-sheet-wrap pf-wrap');
  const card = h('div', 'gs-sheet pf-sheet');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Your profile');

  const big = h('div', 'pf-avatar');
  const bigFace = h('span', 'pf-face');
  big.append(bigFace, h('span', 'pf-rank', String(MOCK.rank)));

  const picker = h('div', 'pf-picker');
  picker.setAttribute('role', 'radiogroup');
  picker.setAttribute('aria-label', 'Avatar');
  const file = h('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;
  const upload = h('button', 'pf-pick pf-upload', PLUS);
  upload.type = 'button';
  upload.setAttribute('aria-label', 'Upload your own image');
  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => set(String(reader.result)));
    reader.readAsDataURL(f);
    file.value = '';
  });
  for (const id of FACES) {
    const b = h('button', 'pf-pick', faceHTML(id));
    b.type = 'button';
    b.dataset.face = id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `Suit ${id}`);
    b.addEventListener('click', () => set(id));
    picker.append(b);
  }
  picker.append(upload, file);

  const goal = h('div', 'pf-goal');
  const title = h('div', 'pf-title');
  /** The rank and the way to the next one: repainted whenever a game is won for the first time. */
  const paintRank = () => {
  button.setAttribute('aria-label', `Your profile, rank ${MOCK.rank}`);
  for (const el of [button, big]) el.querySelector('.pf-rank').textContent = String(MOCK.rank);
  title.textContent = `Rank ${MOCK.rank}`;
  goal.innerHTML = rankGoalHTML();
  };
  paintRank();
  window.addEventListener('progresschange', paintRank);
  window.addEventListener('challengechange', paintRank);

  const done = h('button', 'game-btn accent pf-done', 'Close');
  done.type = 'button';
  done.addEventListener('click', () => open(false));

  card.append(big, title, picker, goal, done);
  wrap.append(card);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) open(false);
  });

  function paint() {
    face.innerHTML = faceHTML(avatar);
    bigFace.innerHTML = faceHTML(avatar);
    for (const b of picker.querySelectorAll('[data-face]')) b.setAttribute('aria-checked', String(b.dataset.face === avatar));
    upload.classList.toggle('on', avatar !== 'you' && !FACES.includes(avatar));
  }
  function set(next) {
    avatar = next;
    haptic(8);
    try {
      localStorage.setItem(AVATAR_KEY, next);
    } catch {
      // A big picture may not fit in storage: it then only lasts until the page reloads.
    }
    paint();
  }
  function open(show) {
    wrap.classList.toggle('show', show);
  }
  button.addEventListener('click', () => {
    haptic(8);
    open(true);
  });
  paint();

  return { button, sheet: wrap, open, isOpen: () => wrap.classList.contains('show') };
}
