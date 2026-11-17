// 3D cards for the playground. Textures are drawn on canvas from the same suit
// silhouettes the game uses (SUIT_ART), so the 3D faces match the 2D ones.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SUITS, SUIT_ART, createDeck } from '../src/cards.js';

export const CARD_W = 2.5;
export const CARD_H = 3.5;
export const CARD_T = 0.03;
const RADIUS = 0.12;
const TEX_W = 512;
const TEX_H = 716;
const RED = '#c8412f';
const INK = '#1c1f26';

export const DECK = createDeck();
const textureCache = new Map();
export const physicalMaterials = new Set();
export const foilMaterials = new Set();
const renderer = { maxAniso: 8 };

// Foil lives on court cards and aces, like the 2D game's `.foil` class.
export const isFoil = (card) => card.value >= 11 || card.value === 1;

const suitColor = (suit) => (suit.red ? RED : INK);

function drawSuit(ctx, id, x, y, size, color, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size / 100, size / 100);
  ctx.translate(-50, -50);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(SUIT_ART[id].shape));
  ctx.restore();
}

// Standard pip layouts, as [column, row] with column in {L, C, R} and row in 0..1.
const L = 0.33, C = 0.5, R = 0.67;
const PIPS = {
  2: [[C, .18], [C, .82]],
  3: [[C, .16], [C, .5], [C, .84]],
  4: [[L, .2], [R, .2], [L, .8], [R, .8]],
  5: [[L, .2], [R, .2], [C, .5], [L, .8], [R, .8]],
  6: [[L, .18], [R, .18], [L, .5], [R, .5], [L, .82], [R, .82]],
  7: [[L, .18], [R, .18], [C, .34], [L, .5], [R, .5], [L, .82], [R, .82]],
  8: [[L, .18], [R, .18], [C, .34], [L, .5], [R, .5], [C, .66], [L, .82], [R, .82]],
  9: [[L, .16], [R, .16], [L, .38], [R, .38], [C, .5], [L, .62], [R, .62], [L, .84], [R, .84]],
  10: [[L, .15], [R, .15], [C, .28], [L, .4], [R, .4], [L, .6], [R, .6], [C, .72], [L, .85], [R, .85]],
};

function drawFaceCorner(ctx, card, color) {
  ctx.fillStyle = color;
  ctx.font = `700 ${card.rank === '10' ? 74 : 84}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(card.rank, 56, 112);
  drawSuit(ctx, card.suit.id, 56, 150, 62, color);
}

function drawFace(card) {
  const cv = document.createElement('canvas');
  cv.width = TEX_W; cv.height = TEX_H;
  const ctx = cv.getContext('2d');
  const color = suitColor(card.suit);

  const bg = ctx.createLinearGradient(0, 0, 0, TEX_H);
  bg.addColorStop(0, '#fdfaf3');
  bg.addColorStop(1, '#ede3cc');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(22, 22, TEX_W - 44, TEX_H - 44, 22);
  ctx.stroke();

  // Top-left corner, then the same corner rotated 180° for bottom-right.
  drawFaceCorner(ctx, card, color);
  ctx.save();
  ctx.translate(TEX_W, TEX_H);
  ctx.rotate(Math.PI);
  drawFaceCorner(ctx, card, color);
  ctx.restore();

  const v = card.value;
  if (v === 1) {
    drawSuit(ctx, card.suit.id, TEX_W / 2, TEX_H / 2, 260, color);
  } else if (v >= 11) {
    // Court: a framed panel with the rank letter and suit.
    const px = 92, py = 150, pw = TEX_W - 184, ph = TEX_H - 300;
    ctx.fillStyle = card.suit.red ? 'rgba(200,65,47,.10)' : 'rgba(28,31,38,.08)';
    ctx.strokeStyle = '#b8912e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `700 260px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.rank, TEX_W / 2, TEX_H / 2 - 40);
    drawSuit(ctx, card.suit.id, TEX_W / 2, TEX_H / 2 + 150, 100, color);
  } else {
    const pips = PIPS[v];
    const size = v >= 9 ? 74 : 92;
    for (const [col, row] of pips) {
      const x = col * TEX_W;
      const y = 150 + row * (TEX_H - 300);
      // Lower-half pips are upside down, as on a real card.
      drawSuit(ctx, card.suit.id, x, y, size, color, row > .5 ? Math.PI : 0);
    }
  }
  return cv;
}

function drawBack(suitRed) {
  const cv = document.createElement('canvas');
  cv.width = TEX_W; cv.height = TEX_H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#16203a';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.strokeStyle = 'rgba(214,181,96,.55)';
  ctx.lineWidth = 3;
  for (let i = -TEX_H; i < TEX_W + TEX_H; i += 56) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + TEX_H, TEX_H);
    ctx.moveTo(i + TEX_H, 0);
    ctx.lineTo(i, TEX_H);
    ctx.stroke();
  }
  ctx.fillStyle = '#16203a';
  ctx.beginPath();
  ctx.roundRect(60, 60, TEX_W - 120, TEX_H - 120, 26);
  ctx.fill();
  ctx.strokeStyle = '#d6b560';
  ctx.lineWidth = 8;
  ctx.stroke();
  // Four suit marks, one per suit, with the red ones tinted like the game's back.
  const spots = [[150, 200, SUITS[0]], [362, 200, SUITS[1]], [150, 516, SUITS[3]], [362, 516, SUITS[2]]];
  for (const [x, y, s] of spots) {
    drawSuit(ctx, s.id, x, y, 110, s.red ? '#d95742' : '#d6b560');
  }
  return cv;
}

function drawMask(card) {
  const cv = document.createElement('canvas');
  cv.width = TEX_W; cv.height = TEX_H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.fillStyle = '#fff';
  if (card.value === 1) {
    ctx.fillRect(22, 22, TEX_W - 44, TEX_H - 44);
  } else if (card.value >= 11) {
    ctx.beginPath();
    ctx.roundRect(92, 150, TEX_W - 184, TEX_H - 300, 18);
    ctx.fill();
  }
  return cv;
}

function toTexture(cv, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.maxAniso;
  return t;
}

// Textures are cached per card so a hand of cards shares GPU memory.
export function cardTextures(card) {
  const key = card.id;
  if (!textureCache.has(key)) {
    textureCache.set(key, {
      front: toTexture(drawFace(card)),
      mask: toTexture(drawMask(card), false),
    });
  }
  return textureCache.get(key);
}

let backTexture = null;
export function getBackTexture() {
  if (!backTexture) backTexture = toTexture(drawBack(false));
  return backTexture;
}

// Foil overlay: a view-dependent rainbow sheen plus glitter, masked to the foil area.
const foilVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const foilFragment = /* glsl */ `
  uniform sampler2D uMask;
  uniform float uStrength;
  uniform float uScale;
  uniform float uTime;
  uniform float uSparkle;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float mask = texture2D(uMask, vUv).r;
    float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float phase = vUv.x * uScale * 0.6 + vUv.y * uScale * 0.9 + fres * 2.6 + uTime * 0.05;
    vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (phase + vec3(0.0, 0.33, 0.67)));
    float glitter = pow(max(0.0, sin(vUv.x * 210.0 + sin(vUv.y * 40.0) * 3.0) * sin(vUv.y * 170.0 - vUv.x * 30.0)), 28.0);
    vec3 col = rainbow * (0.18 + fres * 0.72) * uStrength + glitter * uSparkle * vec3(1.0);
    gl_FragColor = vec4(col * mask, 1.0);
  }
`;

// The card's front, back and edge, plus a foil overlay when the card is foil.
export function createCard(card, opts = {}) {
  const tex = cardTextures(card);
  const edge = new THREE.MeshPhysicalMaterial({ color: '#f1ead8', roughness: .6 });
  const front = new THREE.MeshPhysicalMaterial({
    map: tex.front, roughness: .3, metalness: 0, clearcoat: .8, clearcoatRoughness: .15,
    iridescence: 0, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 400],
    sheen: 0, sheenRoughness: .4, sheenColor: new THREE.Color('#ffffff'),
  });
  const back = new THREE.MeshPhysicalMaterial({ map: getBackTexture(), roughness: .4, clearcoat: .6, clearcoatRoughness: .2 });
  // Index order matches BoxGeometry groups: +x, -x, +y, -y, +z (front), -z (back).
  const geo = new RoundedBoxGeometry(CARD_W, CARD_H, CARD_T, 4, RADIUS);
  const body = new THREE.Mesh(geo, [edge, edge, edge, edge, front, back]);
  front.userData.foil = isFoil(card);
  physicalMaterials.add(front);
  physicalMaterials.add(back);

  const group = new THREE.Group();
  group.add(body);
  group.userData = { card, body, front, back, overlay: null };

  if (isFoil(card)) {
    const uniforms = {
      uMask: { value: tex.mask },
      uStrength: { value: opts.foilStrength ?? 0.9 },
      uScale: { value: 6 },
      uTime: { value: 0 },
      uSparkle: { value: 0.6 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: foilVertex, fragmentShader: foilFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    foilMaterials.add(mat);
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 0.97, CARD_H * 0.97), mat);
    overlay.position.z = CARD_T / 2 + 0.003;
    group.add(overlay);
    group.userData.overlay = overlay;
  }
  return group;
}

// Apply lab settings to every card material at once. Iridescence and sheen only
// touch foil materials; roughness and clearcoat apply to all card faces.
export function applyFoilSettings(s) {
  for (const m of physicalMaterials) {
    const foil = s.foilOn && m.userData.foil;
    m.iridescence = foil ? s.iridescence : 0;
    m.iridescenceThicknessRange = [100, s.iridescenceThickness];
    m.sheen = foil ? s.sheen : 0;
    m.sheenRoughness = Math.max(.05, s.roughness);
    m.roughness = s.roughness;
    m.clearcoat = s.clearcoat;
    m.needsUpdate = true;
  }
  for (const m of foilMaterials) {
    m.uniforms.uStrength.value = s.foilOn ? s.foilStrength : 0;
    m.uniforms.uSparkle.value = s.foilOn ? s.sparkle : 0;
  }
}

export function tickFoil(t) {
  for (const m of foilMaterials) m.uniforms.uTime.value = t;
}

export function setRenderer(r) {
  renderer.maxAniso = r.capabilities.getMaxAnisotropy();
}
