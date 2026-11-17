// Screenshot the playground views with Playwright.
// Run with the dev server up (python3 serve.py 8000). See the README note in the chat for setup.
// Env: BASE (default http://localhost:8000/playground/), OUT (default ./playground-shots), W, H.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8000/playground/';
const OUT = process.env.OUT ?? './playground-shots';
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
mkdirSync(OUT, { recursive: true });

// Cards scene: pick/back/foil are set every time, so one shot doesn't leak into the next.
// Lobby scene: hover moves the pointer over the hand.
const shots = [
  { name: '01-cards-king-hearts-front', scene: 'cards', pick: 'KH' },
  { name: '02-cards-king-hearts-tilted', scene: 'cards', pick: 'KH', tilt: [-220, -120] },
  { name: '03-cards-back', scene: 'cards', pick: 'KH', back: true },
  { name: '04-cards-ace-spades', scene: 'cards', pick: 'AS' },
  { name: '05-cards-seven-diamonds', scene: 'cards', pick: '7D' },
  { name: '06-cards-king-hearts-foil-off', scene: 'cards', pick: 'KH', foil: false },
  { name: '07-lobby', scene: 'lobby' },
  { name: '08-lobby-hover-hand', scene: 'lobby', hover: 'hand' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#view canvas', { timeout: 15000 });
const box = await page.locator('#view canvas').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

let scene = 'cards';
for (const s of shots) {
  if (s.scene !== scene) {
    await page.click(`[data-scene="${s.scene}"]`);
    scene = s.scene;
  }
  if (s.scene === 'cards') {
    await page.selectOption('#card-pick', s.pick);
    await page.setChecked('#card-back', s.back ?? false);
    await page.setChecked('#foil-on', s.foil ?? true);
  }
  await page.mouse.move(cx, cy);
  if (s.tilt) await page.mouse.move(cx + s.tilt[0], cy + s.tilt[1], { steps: 12 });
  if (s.hover === 'hand') await page.mouse.move(cx, box.y + box.height * 0.86, { steps: 12 });
  await page.waitForTimeout(1600); // let springs and the flip settle
  await page.screenshot({ path: join(OUT, `${s.name}.png`) });
  console.log('saved', join(OUT, `${s.name}.png`));
}

await browser.close();
if (errors.length) {
  console.log('\nPage errors:');
  for (const e of errors) console.log(' -', e);
} else {
  console.log('\nNo page errors.');
}
