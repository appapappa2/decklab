// Playing-card shaped covers (5:7) for the lobby carousel, built from the game's own card
// art: a colored sleeve, a big faint suit, a few real card faces arranged per
// game, a round sticker with the title, and a plastic-wrap sheen.
// Sizes use container query units, so a cover renders at any size.
import { createDeck, faceHTML, cardBackHTML, suitHTML } from './cards.js?v=landing-burst';

const DECK = new Map(createDeck().map((c) => [c.id, c]));

// [card id or 'back', x %, y %, rotation deg] per game, back to front.
const LAYOUTS = {
  solitaire: {
    suit: 'S',
    cards: [
      ['back', 30, 26, -4], ['back', 30, 33, -3],
      ['KS', 30, 42, -2], ['QH', 30, 52, -1], ['JC', 30, 62, 0], ['10D', 30, 72, 1],
      ['AH', 72, 64, 8], ['AS', 74, 70, 14],
    ],
    sticker: { x: 74, y: 27, color: '#ffd257', ink: '#2b1d00' },
  },
  'crazy-eights': {
    suit: 'D',
    cards: [['8S', 36, 60, -24], ['8H', 45, 56, -8], ['8C', 55, 56, 8], ['8D', 64, 60, 24]],
    sticker: { x: 26, y: 24, color: '#ff8a3d', ink: '#2b0f00' },
  },
  'go-fish': {
    suit: 'C',
    cards: [['back', 78, 30, 18], ['7H', 34, 60, -16], ['7S', 46, 57, -4], ['7D', 58, 59, 9], ['back', 76, 74, 22]],
    sticker: { x: 26, y: 25, color: '#ff8fb8', ink: '#3a0f22' },
  },
  war: {
    suit: 'S',
    cards: [['KS', 37, 58, -18], ['KH', 63, 58, 18]],
    sticker: { x: 50, y: 22, color: '#ffd257', ink: '#2b1d00' },
  },
  blackjack: {
    suit: 'H',
    cards: [['back', 66, 46, 10], ['AS', 42, 58, -10], ['KH', 58, 61, 7]],
    sticker: { x: 25, y: 25, color: '#e8483b', ink: '#fff' },
    chips: [[78, 80, '#c4473a'], [70, 84, '#222'], [84, 72, '#3d6fd1']],
  },
  'rummy-500': {
    suit: 'C',
    cards: [['5S', 30, 74, -14], ['6S', 38, 72, -7], ['7S', 46, 71, 0], ['QH', 58, 47, -10], ['QC', 68, 45, 0], ['QD', 78, 47, 10]],
    sticker: { x: 30, y: 24, color: '#1b1210', ink: '#ffd257' },
  },
  shithead: {
    suit: 'D',
    cards: [['back', 30, 70, -6], ['back', 50, 70, 0], ['back', 70, 70, 6], ['10H', 30, 74, -2], ['2S', 50, 75, 3], ['AD', 70, 74, 8], ['KC', 62, 40, 14]],
    sticker: { x: 30, y: 30, color: '#fff3e6', ink: '#5a3418' },
  },
  spades: {
    suit: 'S',
    cards: [['3S', 32, 62, -18], ['7S', 42, 58, -8], ['QS', 52, 57, 2], ['AS', 63, 60, 13]],
    sticker: { x: 72, y: 25, color: '#e0b95a', ink: '#1a2338' },
  },
  speed: {
    suit: 'H',
    cards: [['back', 22, 62, -4], ['6C', 40, 60, -12], ['7H', 60, 58, 9], ['8S', 72, 70, 22], ['back', 80, 40, 6]],
    sticker: { x: 30, y: 26, color: '#ffd257', ink: '#7a0d12' },
  },
  beggar: {
    suit: 'C',
    cards: [['back', 28, 66, -10], ['5D', 44, 60, -6], ['JC', 54, 56, 6], ['AH', 64, 60, 16], ['back', 76, 72, 10]],
    sticker: { x: 30, y: 24, color: '#f2b84b', ink: '#3b1648' },
  },
  cribbage: {
    suit: 'D',
    cards: [['5H', 32, 62, -16], ['5C', 42, 58, -6], ['5S', 52, 57, 4], ['JD', 63, 60, 14], ['5D', 74, 40, 10]],
    sticker: { x: 28, y: 26, color: '#2c1a0c', ink: '#e9c48a' },
  },
  casino: {
    suit: 'D',
    cards: [['3H', 30, 66, -14], ['7C', 44, 63, -4], ['10D', 62, 55, 8], ['2S', 74, 70, 18]],
    sticker: { x: 28, y: 26, color: '#f0c75e', ink: '#0b3d31' },
    chips: [[80, 30, '#c4473a'], [72, 24, '#222']],
  },
  hearts: {
    suit: 'H',
    cards: [['2H', 34, 62, -22], ['9H', 44, 58, -9], ['AH', 66, 62, 20], ['QS', 54, 56, 5]],
    sticker: { x: 74, y: 25, color: '#fff3f6', ink: '#c2184f' },
  },
};

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function coverHTML(game, index) {
  const L = LAYOUTS[game.id] ?? { suit: 'S', cards: [['AS', 50, 56, 0]], sticker: { x: 26, y: 24, color: '#fff', ink: '#111' } };
  const [color] = game.colors ?? ['#444'];
  const cards = L.cards
    .map(([id, x, y, r]) => {
      const inner = id === 'back' ? `<div class="cv-back back-art">${cardBackHTML()}</div>` : faceHTML(DECK.get(id));
      return `<div class="cv-card" style="left:${x}%;top:${y}%;--r:${r}deg">${inner}</div>`;
    })
    .join('');
  const chips = (L.chips ?? [])
    .map(([x, y, c]) => `<div class="cv-chip" style="left:${x}%;top:${y}%;background:${c}"></div>`)
    .join('');
  const s = L.sticker;
  const no = String(index + 1).padStart(2, '0');
  return (
    `<div class="cv" style="--cv:${color}">` +
    `<div class="cv-suit">${suitHTML(L.suit)}</div>` +
    cards +
    chips +
    `<div class="cv-sticker" style="left:${s.x}%;top:${s.y}%;--sc:${s.color};--si:${s.ink}">` +
    `<div class="cv-sticker-title">${esc(game.name)}</div>` +
    `<div class="cv-sticker-small">THE DECK · VOL. I · ${no}</div>` +
    `</div>` +
    `<div class="cv-wrap" aria-hidden="true"></div>` +
    `</div>`
  );
}
