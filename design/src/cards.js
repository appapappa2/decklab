import { Spring } from './spring.js';

export const SUITS = [
  { id: 'S', name: 'spades', red: false, order: 0 },
  { id: 'H', name: 'hearts', red: true, order: 1 },
  { id: 'C', name: 'clubs', red: false, order: 2 },
  { id: 'D', name: 'diamonds', red: true, order: 3 },
];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const motionPreference = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const clamp = (value, limit) => Math.min(limit, Math.max(-limit, value));

// Rounded, consistent silhouettes instead of platform-dependent suit glyphs.
const SUIT_ART = {
  S: {
    shape: 'M50 9C47 9 44 13 40 17L20 37C4 53 12 75 29 75C37 75 43 71 46 67C45 77 41 84 37 89C36 91 38 93 41 93H59C62 93 64 91 63 89C59 84 55 77 54 67C57 71 63 75 71 75C88 75 96 53 80 37L60 17C56 13 53 9 50 9Z',
  },
  H: {
    shape: 'M50 25C43 10 20 9 12 26C2 49 24 70 45 88C48 91 52 91 55 88C76 70 98 49 88 26C80 9 57 10 50 25Z',
  },
  C: {
    shape: 'M50 9C34 9 25 24 32 37C17 33 7 43 7 56C7 70 20 80 33 75C40 73 44 68 46 64C45 76 41 84 37 89C36 91 38 93 41 93H59C62 93 64 91 63 89C59 84 55 76 54 64C56 68 60 73 67 75C80 80 93 70 93 56C93 43 83 33 68 37C75 24 66 9 50 9Z',
  },
  D: {
    shape: 'M45 10C48 6 52 6 55 10L85 44C88 48 88 52 85 56L55 90C52 94 48 94 45 90L15 56C12 52 12 48 15 44Z',
  },
};

function suitHTML(id) {
  const art = SUIT_ART[id];
  return `<svg class="suit-mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
    `<path fill="currentColor" d="${art.shape}"/>` +
    `</svg>`;
}

export function cardBackHTML() {
  const positions = { S: [13, 13], H: [63, 13], D: [13, 63], C: [63, 63] };
  const marks = SUITS.map(suit => {
    const [x, y] = positions[suit.id];
    return `<path fill="${suit.red ? '#d95742' : '#000'}" transform="translate(${x} ${y}) scale(.24)" d="${SUIT_ART[suit.id].shape}"/>`;
  }).join('');
  const pattern = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${marks}</svg>`);
  return `<div class="back-pattern" aria-hidden="true" style="background-image:url('data:image/svg+xml,${pattern}')"></div>`;
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
  const court = card.value >= 11;
  const foil = court || card.value === 1;
  return (
    `<div class="face front${card.suit.red ? ' red' : ''}${court ? ' court' : ''}${foil ? ' foil' : ''}" aria-hidden="true">` +
    (foil ? `<div class="card-foil" aria-hidden="true"></div>` : '') +
    `<div class="corner tl">${corner}</div>` +
    `<div class="center${card.value === 1 ? ' ace' : ''}">${mark}</div>` +
    `<div class="corner br">${corner}</div>` +
    `</div>`
  );
}

/**
 * A card on screen. Position is the card's CENTER in screen-local px.
 * All motion goes through springs; render() writes transforms and surface-light
 * variables only when they change. Light-space dimensions are cached by layout.
 */
export class CardSprite {
  constructor(card, layer) {
    this.card = card;
    this.isCourt = card.value >= 11;
    this.isFoil = this.isCourt || card.value === 1;
    this._lightWidth = 1;
    this._lightHeight = 1;
    this._foil = {};
    this._light = {};
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
    this.tiltX = new Spring(0, .002);
    this.tiltY = new Spring(0, .002);
    this.tiltZ = new Spring(0, .002);

    this.isDrag = false;
    this.selected = false;
    this.waitUntil = 0; // targets are frozen until this time (stagger)
    this.removeAt = 0;
    this.pile = null;
    this.z = 0;

    this.dirty = true;
    this._t = '';
    this._innerT = '';
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
    this.tiltX.set(0);
    this.tiltY.set(0);
    this.tiltZ.set(0);
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

  setLightSpace(width, height) {
    const w = Number.isFinite(width) && width > 0 ? width : 1;
    const h = Number.isFinite(height) && height > 0 ? height : 1;
    if (w === this._lightWidth && h === this._lightHeight) return;
    this._lightWidth = w;
    this._lightHeight = h;
    if (this.isFoil) this.dirty = true;
  }

  step(dt, k, zeta) {
    let moved = this.x.step(dt, k, zeta);
    moved = this.y.step(dt, k, zeta) || moved;
    moved = this.rot.step(dt, k, zeta) || moved;
    moved = this.scale.step(dt, k, zeta) || moved;
    moved = this.flip.step(dt, k, zeta) || moved;
    moved = this.lift.step(dt, k, zeta) || moved;
    if (motionPreference?.matches) {
      for (const tilt of [this.tiltX, this.tiltY, this.tiltZ]) {
        if (tilt.v || tilt.vel || tilt.t) moved = true;
        tilt.set(0);
      }
    } else {
      // Inertia stays relative to the face, even while the hand is fanned.
      const angle = this.rot.v * Math.PI / 180;
      const vx = this.x.vel * Math.cos(angle) + this.y.vel * Math.sin(angle);
      const vy = this.y.vel * Math.cos(angle) - this.x.vel * Math.sin(angle);
      this.tiltX.t = Math.tanh(vy / 420) * 3.5;
      this.tiltY.t = vx === 0 ? 0 : -Math.tanh(vx / 420) * 3.5;
      this.tiltZ.t = clamp(Math.tanh(this.rot.vel / 140) * .88 + Math.tanh(vx / 700) * .22, 1.1);
      moved = this.tiltX.step(dt, 160, .95) || moved;
      moved = this.tiltY.step(dt, 160, .95) || moved;
      moved = this.tiltZ.step(dt, 160, .95) || moved;
    }
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
    const tx = Math.round(this.tiltX.v * 1000) / 1000;
    const ty = Math.round(this.tiltY.v * 1000) / 1000;
    const tz = Math.round(this.tiltZ.v * 1000) / 1000;
    const innerT = tx || ty || tz || f
      ? `rotateX(${tx.toFixed(3)}deg) rotateY(${ty.toFixed(3)}deg) rotateZ(${tz.toFixed(3)}deg) rotateY(${(f * 180).toFixed(1)}deg)`
      : '';
    if (innerT !== this._innerT) {
      this.inner.style.transform = innerT;
      this._innerT = innerT;
    }
    const l = Math.round(Math.min(1, Math.max(0, this.lift.v)) * 100) / 100;
    if (l !== this._l) {
      this.shadowEl.style.opacity = String(l);
      this._l = l;
    }
    const tiltAmount = Math.min(1, Math.hypot(tx, ty, tz * 3) / 3.5);
    const light = {
      '--card-light-angle': `${(135 + ty * 13 - tx * 9 + tz * 12).toFixed(2)}deg`,
      '--card-light-highlight': (tiltAmount * .09).toFixed(3),
      '--card-light-shade': (tiltAmount * .09).toFixed(3),
    };
    for (const [name, value] of Object.entries(light)) {
      if (value === this._light[name]) continue;
      this.el.style.setProperty(name, value);
      this._light[name] = value;
    }
    if (this.isFoil) {
      // Keep the shine centered on the card; its angle, tint and intensity
      // respond to dragging, fanning, lifting and flips through spring values.
      const nx = Math.min(1, Math.max(0, this.x.v / this._lightWidth)) - 0.5;
      const ny = Math.min(1, Math.max(0, this.y.v / this._lightHeight)) - 0.5;
      const turn = Math.sin(this.flip.v * Math.PI);
      const scale = this.scale.v - 1;
      const values = {
        '--foil-angle': `${(this.rot.v * 0.8 + turn * 32 + nx * 35 - ny * 20 + l * 18 + ty * 8 - tx * 6 + tz * 8).toFixed(2)}deg`,
        '--foil-hue': `${(nx * 12 - ny * 8 + turn * 6 + this.rot.v * 0.08 + ty * 2 - tx + tz * .5).toFixed(2)}deg`,
        '--foil-strength': Math.min(.95, Math.max(.76, .82 + nx * .04 - ny * .03 + l * .035 + scale * .04 + turn * .025 + tiltAmount * .065)).toFixed(3),
      };
      for (const [name, value] of Object.entries(values)) {
        if (value === this._foil[name]) continue;
        this.el.style.setProperty(name, value);
        this._foil[name] = value;
      }
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
