import { Spring } from './spring.js';

// U+FE0E forces text (non-emoji) presentation of the suit glyphs on iOS.
export const SUITS = [
  { id: 'S', glyph: '\u2660\uFE0E', red: false, order: 0 },
  { id: 'H', glyph: '\u2665\uFE0E', red: true, order: 1 },
  { id: 'C', glyph: '\u2663\uFE0E', red: false, order: 2 },
  { id: 'D', glyph: '\u2666\uFE0E', red: true, order: 3 },
];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    RANKS.forEach((rank, i) => deck.push({ id: rank + suit.id, rank, value: i + 1, suit }));
  }
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pip positions (% of card width/height) for number cards.
const L = 31, C = 50, R = 69;
const PIPS = {
  2: [[C, 21], [C, 79]],
  3: [[C, 21], [C, 50], [C, 79]],
  4: [[L, 21], [R, 21], [L, 79], [R, 79]],
  5: [[L, 21], [R, 21], [C, 50], [L, 79], [R, 79]],
  6: [[L, 21], [R, 21], [L, 50], [R, 50], [L, 79], [R, 79]],
  7: [[L, 21], [R, 21], [C, 35.5], [L, 50], [R, 50], [L, 79], [R, 79]],
  8: [[L, 21], [R, 21], [C, 35.5], [L, 50], [R, 50], [C, 64.5], [L, 79], [R, 79]],
  9: [[L, 21], [R, 21], [L, 40.3], [R, 40.3], [C, 50], [L, 59.7], [R, 59.7], [L, 79], [R, 79]],
  10: [[L, 21], [R, 21], [C, 30.7], [L, 40.3], [R, 40.3], [L, 59.7], [R, 59.7], [C, 69.3], [L, 79], [R, 79]],
};

function faceHTML(card) {
  const g = card.suit.glyph;
  const corner = `<b>${card.rank}</b><i>${g}</i>`;
  let center;
  if (card.value === 1) {
    center = `<div class="center ace">${g}</div>`;
  } else if (card.value > 10) {
    center = `<div class="center"><div class="court-frame"><b>${card.rank}</b><i>${g}</i></div></div>`;
  } else {
    const pips = PIPS[card.value]
      .map(([x, y]) => `<span class="pip${y > 50 ? ' flip' : ''}" style="left:${x}%;top:${y}%">${g}</span>`)
      .join('');
    center = `<div class="center">${pips}</div>`;
  }
  return (
    `<div class="face front${card.suit.red ? ' red' : ''}">` +
    `<div class="corner tl">${corner}</div>${center}<div class="corner br">${corner}</div>` +
    `</div>`
  );
}

/**
 * A card on screen. Position is the card's CENTER in screen-local px.
 * All motion goes through springs; render() writes transforms only when they change.
 */
export class CardSprite {
  constructor(card, layer) {
    this.card = card;
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="shadow"></div><div class="card-inner">${faceHTML(card)}<div class="face back back-art"></div></div>`;
    this.el = el;
    this.inner = el.querySelector('.card-inner');
    this.shadowEl = el.querySelector('.shadow');

    this.x = new Spring(0, 0.01);
    this.y = new Spring(0, 0.01);
    this.rot = new Spring(0, 0.01);
    this.scale = new Spring(1, 1e-4);
    this.flip = new Spring(0, 1e-4); // 0 = face up, 1 = face down
    this.lift = new Spring(0, 1e-3); // drives the lifted shadow

    this.isDrag = false;
    this.selected = false;
    this.waitUntil = 0; // targets are frozen until this time (stagger)
    this.removeAt = 0;
    this.pile = null;
    this.z = 0;

    this.dirty = true;
    this._t = '';
    this._f = -1;
    this._l = -1;
    this._z = -1;
    layer.appendChild(el);
  }

  place(x, y, rot = 0, scale = 1, flip = 0) {
    this.x.set(x);
    this.y.set(y);
    this.rot.set(rot);
    this.scale.set(scale);
    this.flip.set(flip);
    this.dirty = true;
  }

  target(x, y, rot, scale, flip, lift) {
    this.x.t = x;
    this.y.t = y;
    this.rot.t = rot;
    this.scale.t = scale;
    this.flip.t = flip;
    this.lift.t = lift;
  }

  step(dt, k, zeta) {
    let moved = this.x.step(dt, k, zeta);
    moved = this.y.step(dt, k, zeta) || moved;
    moved = this.rot.step(dt, k, zeta) || moved;
    moved = this.scale.step(dt, k, zeta) || moved;
    moved = this.flip.step(dt, k, zeta) || moved;
    moved = this.lift.step(dt, k, zeta) || moved;
    if (moved) this.dirty = true;
  }

  render() {
    if (this.z !== this._z) {
      this.el.style.zIndex = String(this.z);
      this._z = this.z;
    }
    if (!this.dirty) return;
    this.dirty = false;

    const t =
      `translate3d(${this.x.v.toFixed(2)}px,${this.y.v.toFixed(2)}px,0) ` +
      `rotate(${this.rot.v.toFixed(2)}deg) scale(${this.scale.v.toFixed(4)})`;
    if (t !== this._t) {
      this.el.style.transform = t;
      this._t = t;
    }
    const f = Math.round(this.flip.v * 1000) / 1000;
    if (f !== this._f) {
      this.inner.style.transform = f === 0 ? '' : `rotateY(${(f * 180).toFixed(1)}deg)`;
      this._f = f;
    }
    const l = Math.round(Math.min(1, Math.max(0, this.lift.v)) * 100) / 100;
    if (l !== this._l) {
      this.shadowEl.style.opacity = String(l);
      this._l = l;
    }
  }

  setSelected(on) {
    this.selected = on;
    this.el.classList.toggle('selected', on);
  }

  destroy() {
    this.el.remove();
  }
}
