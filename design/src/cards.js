import { Spring } from './spring.js';

export const SUITS = [
  { id: 'S', name: 'spades', red: false, order: 0 },
  { id: 'H', name: 'hearts', red: true, order: 1 },
  { id: 'C', name: 'clubs', red: false, order: 2 },
  { id: 'D', name: 'diamonds', red: true, order: 3 },
];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Rounded, consistent silhouettes instead of platform-dependent suit glyphs.
// The short highlight paths give the large marks a softly raised edge.
const SUIT_ART = {
  S: {
    shape: 'M50 9C47 9 44 13 40 17L20 37C4 53 12 75 29 75C37 75 43 71 46 67C45 77 41 84 37 89C36 91 38 93 41 93H59C62 93 64 91 63 89C59 84 55 77 54 67C57 71 63 75 71 75C88 75 96 53 80 37L60 17C56 13 53 9 50 9Z',
    highlight: 'M18 42C22 36 35 24 44 15C47 12 49 10 51 11',
  },
  H: {
    shape: 'M50 25C43 10 20 9 12 26C2 49 24 70 45 88C48 91 52 91 55 88C76 70 98 49 88 26C80 9 57 10 50 25Z',
    highlight: 'M13 30C18 15 38 14 47 26M55 24C64 14 80 16 86 29',
  },
  C: {
    shape: 'M50 9C34 9 25 24 32 37C17 33 7 43 7 56C7 70 20 80 33 75C40 73 44 68 46 64C45 76 41 84 37 89C36 91 38 93 41 93H59C62 93 64 91 63 89C59 84 55 76 54 64C56 68 60 73 67 75C80 80 93 70 93 56C93 43 83 33 68 37C75 24 66 9 50 9Z',
    highlight: 'M32 28C32 18 40 11 49 11M9 55C10 44 19 38 29 40M73 39C83 39 89 45 91 52',
  },
  D: {
    shape: 'M45 10C48 6 52 6 55 10L85 44C88 48 88 52 85 56L55 90C52 94 48 94 45 90L15 56C12 52 12 48 15 44Z',
    highlight: 'M16 46L46 12C48 9 51 9 54 12',
  },
};

function suitHTML(id) {
  const art = SUIT_ART[id];
  return `<svg class="suit-mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
    `<path fill="currentColor" d="${art.shape}"/>` +
    `<path class="suit-highlight" d="${art.highlight}"/>` +
    `</svg>`;
}

export function cardBackHTML() {
  return `<div class="back-emblem">${suitHTML('D')}</div>`;
}

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

function faceHTML(card) {
  const mark = suitHTML(card.suit.id);
  const corner = `<b${card.rank === '10' ? ' class="rank-ten"' : ''}>${card.rank}</b>${mark}`;
  return (
    `<div class="face front${card.suit.red ? ' red' : ''}" aria-hidden="true">` +
    `<div class="corner tl">${corner}</div>` +
    `<div class="center${card.value === 1 ? ' ace' : ''}">${mark}</div>` +
    `<div class="corner br">${corner}</div>` +
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
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${card.rank} of ${card.suit.name}`);
    el.innerHTML = `<div class="shadow"></div><div class="card-inner">${faceHTML(card)}<div class="face back back-art" aria-hidden="true">${cardBackHTML()}</div></div>`;
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
