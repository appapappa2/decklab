// Card + lobby playground. Three.js is loaded from the importmap in index.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GAMES } from '../src/games.js';
import {
  DECK, createCard, getBackTexture, applyFoilSettings, tickFoil, setRenderer,
  CARD_W, CARD_H, CARD_T,
} from './cards3d.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const clamp = THREE.MathUtils.clamp;

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
setRenderer(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0e13');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 4;
controls.maxDistance = 24;

const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
keyLight.position.set(3, 5, 6);
const fillLight = new THREE.DirectionalLight('#9ec5ff', 0.6);
fillLight.position.set(-5, 2, 3);
scene.add(keyLight, fillLight, new THREE.AmbientLight('#ffffff', 0.15));

const cardsRoot = new THREE.Group();
const lobbyRoot = new THREE.Group();
lobbyRoot.visible = false;
scene.add(cardsRoot, lobbyRoot);

const CAM_HOME = { cards: [0, 0.6, 9], lobby: [0, 0, 14.5] };
let mode = 'cards';

// ---------- panel state ----------
const state = {
  foilOn: true, iridescence: 1, iridescenceThickness: 380, sheen: 0.6,
  roughness: 0.25, clearcoat: 0.8, tilt: 0.6, handN: 7, fan: 26, spin: true,
  foilStrength: 0.9, sparkle: 0.6,
};
let showBack = false;

function readPanel() {
  state.foilOn = $('foil-on').checked;
  state.iridescence = +$('irid').value;
  state.iridescenceThickness = +$('irid-th').value;
  state.sheen = +$('sheen').value;
  state.roughness = +$('rough').value;
  state.clearcoat = +$('clear').value;
  state.tilt = +$('tilt').value;
  state.handN = +$('hand-n').value;
  state.fan = +$('fan').value;
  state.spin = $('spin').checked;
  showBack = $('card-back').checked;
  applyFoilSettings(state);
}

// ---------- single card scene ----------
const cardPick = $('card-pick');
for (const c of DECK) {
  const opt = document.createElement('option');
  opt.value = c.id;
  opt.textContent = `${c.rank} of ${c.suit.name}${c.value >= 11 || c.value === 1 ? ' · foil' : ''}`;
  cardPick.appendChild(opt);
}
cardPick.value = 'KH';

let current = null;
let flip = 0;
const pointer = { tx: 0, ty: 0, x: 0, y: 0 };

function setCard(id) {
  const card = DECK.find((c) => c.id === id);
  if (current) cardsRoot.remove(current);
  current = createCard(card);
  cardsRoot.add(current);
  readPanel();
}

// ---------- lobby: game tiles + fanned hand ----------
const TILE_SPACING = CARD_W * 0.82 + 0.35;
const tileRow = new THREE.Group();
tileRow.position.set(0, 1.6, 0);
const handRoot = new THREE.Group();
handRoot.position.set(0, -3.4, 0);
lobbyRoot.add(tileRow, handRoot);

// A felt table below the hand, so the lobby has something to sit on.
const felt = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 30),
  new THREE.MeshStandardMaterial({ color: '#1d5a44', roughness: 0.95 }),
);
felt.rotation.x = -Math.PI / 2;
felt.position.y = -5.8;
lobbyRoot.add(felt);

const cardGeo = new RoundedBoxGeometry(CARD_W, CARD_H, CARD_T, 4, 0.12);
const edgeMat = new THREE.MeshPhysicalMaterial({ color: '#f1ead8', roughness: 0.6 });

function wrapLines(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Game cover art drawn from the game's own colors, shaped like a card face.
function tileCanvas(g) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 716;
  const ctx = cv.getContext('2d');
  const [a, b, c] = g.colors;
  const grad = ctx.createLinearGradient(0, 0, 512, 716);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 716);
  const glow = ctx.createRadialGradient(256, 260, 20, 256, 260, 330);
  glow.addColorStop(0, `${c}cc`);
  glow.addColorStop(1, `${c}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 716);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(26, 26, 460, 664, 28);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 60px Georgia, "Times New Roman", serif';
  const lines = wrapLines(ctx, g.name, 400);
  lines.forEach((ln, i) => ctx.fillText(ln, 256, 400 + i * 72));
  const after = 400 + lines.length * 72 + 22;
  ctx.font = '500 28px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fillText(g.tag, 256, after);
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.fillText(`PLAYERS ${g.players}`, 256, 640);
  return cv;
}

function tileMesh(g) {
  const tex = new THREE.CanvasTexture(tileCanvas(g));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const front = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  const back = new THREE.MeshPhysicalMaterial({ map: getBackTexture(), roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  return new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, front, back]);
}

const tiles = GAMES.map((g, i) => {
  const m = tileMesh(g);
  m.userData.index = i;
  tileRow.add(m);
  return m;
});
const carousel = { x: 0, tx: 0, drag: null };
const tileLimit = ((GAMES.length - 1) / 2) * TILE_SPACING;

function buildHand() {
  handRoot.clear();
  const n = state.handN;
  const R = 7;
  for (let i = 0; i < n; i++) {
    const deckIndex = Math.floor(((i + 0.5) * DECK.length) / n);
    const card = createCard(DECK[deckIndex]);
    const a = n > 1 ? THREE.MathUtils.lerp(-state.fan / 2, state.fan / 2, i / (n - 1)) : 0;
    const r = THREE.MathUtils.degToRad(a);
    const baseY = Math.cos(r) * R - R;
    card.position.set(Math.sin(r) * R, baseY, i * 0.02);
    card.rotation.z = -r;
    card.userData.handIndex = i;
    card.userData.baseY = baseY;
    card.userData.lift = 0;
    handRoot.add(card);
  }
  readPanel();
}

// ---------- pointer ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(-9, -9);
let hoveredHand = -1;

function setNdc(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

function handIndexOf(obj) {
  let o = obj;
  while (o && o.userData.handIndex === undefined) o = o.parent;
  return o ? o.userData.handIndex : -1;
}

const canvas = renderer.domElement;
canvas.addEventListener('pointermove', (e) => {
  setNdc(e);
  if (mode === 'lobby' && carousel.drag) {
    const dx = (e.clientX - carousel.drag.x) * 0.02;
    carousel.drag.x = e.clientX;
    carousel.x = clamp(carousel.x + dx, -tileLimit, tileLimit);
    carousel.tx = carousel.x;
  }
});
canvas.addEventListener('pointerleave', () => { ndc.set(-9, -9); });
canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'lobby') carousel.drag = { x: e.clientX };
});
window.addEventListener('pointerup', () => { carousel.drag = null; });
canvas.addEventListener('wheel', (e) => {
  if (mode !== 'lobby') return;
  e.preventDefault();
  carousel.tx = clamp(carousel.tx - e.deltaY * 0.01, -tileLimit, tileLimit);
}, { passive: false });

// ---------- per-frame updates ----------
function updateCards(t) {
  if (!current) return;
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;
  flip += ((showBack ? Math.PI : 0) - flip) * 0.12;
  current.rotation.set(
    -pointer.y * state.tilt * 0.5,
    flip + pointer.x * state.tilt * 0.5,
    0,
  );
  current.position.y = Math.sin(t * 0.9) * 0.04;
}

function updateLobby(t) {
  if (!carousel.drag) carousel.x += (carousel.tx - carousel.x) * 0.1;
  const center = (GAMES.length - 1) / 2;
  for (const m of tiles) {
    const i = m.userData.index;
    const base = (i - center) * TILE_SPACING + carousel.x;
    const d = Math.abs(base);
    m.position.set(base, Math.sin(t * 0.7 + i * 0.4) * (state.spin ? 0.05 : 0), -Math.min(d * 0.3, 2.2));
    m.rotation.y = -clamp(base * 0.12, -0.9, 0.9);
    m.rotation.x = state.spin ? Math.sin(t * 0.8 + i * 0.4) * 0.05 : 0;
    m.scale.setScalar(Math.max(0.72, 1 - d * 0.05));
  }

  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(handRoot.children, true);
  hoveredHand = hits.length ? handIndexOf(hits[0].object) : -1;
  for (const card of handRoot.children) {
    const ud = card.userData;
    const target = ud.handIndex === hoveredHand ? 0.5 : 0;
    ud.lift += (target - ud.lift) * 0.15;
    card.position.y = ud.baseY + ud.lift;
  }
}

// ---------- scenes, camera, panel ----------
function resetCamera() {
  camera.position.set(...CAM_HOME[mode]);
  controls.target.set(0, mode === 'lobby' ? 0 : 0, 0);
  controls.update();
}

function setScene(name) {
  mode = name;
  for (const b of document.querySelectorAll('[data-scene]')) {
    b.classList.toggle('on', b.dataset.scene === name);
  }
  for (const s of document.querySelectorAll('section[data-for]')) {
    s.toggleAttribute('data-hidden', s.dataset.for !== name);
  }
  cardsRoot.visible = name === 'cards';
  lobbyRoot.visible = name === 'lobby';
  controls.enabled = name === 'cards';
  resetCamera();
}

for (const b of document.querySelectorAll('[data-scene]')) {
  b.addEventListener('click', () => setScene(b.dataset.scene));
}
$('reset-cam').addEventListener('click', resetCamera);
$('card-pick').addEventListener('change', (e) => setCard(e.target.value));
for (const el of document.querySelectorAll('#panel input')) {
  el.addEventListener('input', (e) => {
    readPanel();
    if (e.target.id === 'hand-n' || e.target.id === 'fan') buildHand();
  });
}

function resize() {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- boot ----------
resize();
setCard(cardPick.value);
buildHand();
setScene('cards');

const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime();
  if (mode === 'cards') updateCards(t);
  else updateLobby(t);
  controls.update();
  tickFoil(t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
