// Playing-card shaped covers (5:7) for the lobby carousel, built from the game's own card
// art: a flat sleeve in the game's color, a big tone-on-tone suit, a few real
// card faces arranged per game, and a round sticker in the partner color.
// Sizes use container query units, so a cover renders at any size.
import { createDeck, faceHTML, cardBackHTML, suitHTML } from './cards.js?v=fourcolor';

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
    sticker: { x: 74, y: 27 },
  },
  'crazy-eights': {
    suit: 'D',
    cards: [['8S', 36, 60, -24], ['8H', 45, 56, -8], ['8C', 55, 56, 8], ['8D', 64, 60, 24]],
    sticker: { x: 26, y: 24 },
  },
  'go-fish': {
    suit: 'C',
    cards: [['back', 78, 30, 18], ['7H', 34, 60, -16], ['7S', 46, 57, -4], ['7D', 58, 59, 9], ['back', 76, 74, 22]],
    sticker: { x: 26, y: 25 },
  },
  war: {
    suit: 'S',
    cards: [['KS', 37, 58, -18], ['KH', 63, 58, 18]],
    sticker: { x: 50, y: 22 },
  },
  blackjack: {
    suit: 'H',
    cards: [['back', 66, 46, 10], ['AS', 42, 58, -10], ['KH', 58, 61, 7]],
    sticker: { x: 25, y: 25 },
    chips: [[78, 80, 'red'], [70, 84, 'ink'], [84, 72, 'blue']],
  },
  stress: {
    suit: 'S',
    cards: [['back', 24, 40, -8], ['9D', 34, 70, -12], ['10C', 46, 67, -4], ['7S', 62, 46, 6], ['7H', 76, 48, 14]],
    sticker: { x: 70, y: 22 },
  },
  palace: {
    suit: 'D',
    cards: [['back', 30, 70, -6], ['back', 50, 70, 0], ['back', 70, 70, 6], ['10H', 30, 74, -2], ['2S', 50, 75, 3], ['AD', 70, 74, 8], ['KC', 62, 40, 14]],
    sticker: { x: 30, y: 30 },
  },
  speed: {
    suit: 'H',
    cards: [['back', 22, 62, -4], ['6C', 40, 60, -12], ['7H', 60, 58, 9], ['8S', 72, 70, 22], ['back', 80, 40, 6]],
    sticker: { x: 30, y: 26 },
  },
  casino: {
    suit: 'D',
    cards: [['3H', 30, 66, -14], ['7C', 44, 63, -4], ['10D', 62, 55, 8], ['2S', 74, 70, 18]],
    sticker: { x: 28, y: 26 },
    chips: [[80, 30, 'red'], [72, 24, 'ink']],
  },
  gin: {
    suit: 'C',
    cards: [['7C', 26, 66, -16], ['8C', 34, 63, -10], ['9C', 42, 61, -4], ['QH', 56, 60, 4], ['QS', 64, 62, 10], ['QD', 72, 65, 16]],
    sticker: { x: 30, y: 26 },
  },
  slapjack: {
    suit: 'C',
    cards: [['back', 30, 70, -10], ['4H', 44, 62, -12], ['9S', 52, 58, 8], ['JD', 60, 55, -4], ['back', 78, 70, 14]],
    sticker: { x: 28, y: 26 },
  },
};

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function coverHTML(game, index) {
  const L = LAYOUTS[game.id] ?? { suit: 'S', cards: [['AS', 50, 56, 0]], sticker: { x: 26, y: 24 } };
  const cards = L.cards
    .map(([id, x, y, r], i) => {
      const inner = id === 'back' ? `<div class="cv-back back-art">${cardBackHTML()}</div>` : faceHTML(DECK.get(id));
      return `<div class="cv-card" style="left:${x}%;top:${y}%;--r:${r}deg;--i:${i}">${inner}</div>`;
    })
    .join('');
  const chips = (L.chips ?? [])
    .map(([x, y, c]) => `<div class="cv-chip" data-c="${c}" style="left:${x}%;top:${y}%"></div>`)
    .join('');
  const s = L.sticker;
  // The longest word decides the type size, so every name stays inside its sticker.
  const longest = Math.max(...game.name.split(/[\s-]+/).map((w) => w.length));
  return (
    `<div class="cv" data-c="${game.color}" data-p="${game.pop}">` +
    `<div class="cv-suit">${suitHTML(L.suit)}</div>` +
    cards +
    chips +
    `<div class="cv-sticker" style="left:${s.x}%;top:${s.y}%">` +
    `<div class="cv-sticker-title" style="--n:${longest}">${esc(game.name)}</div>` +
    `</div>` +
    `</div>`
  );
}
