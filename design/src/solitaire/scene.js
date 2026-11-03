// Klondike solitaire scene: layout, spring-driven cards, drag & drop, tap to
// auto-move, undo, auto-finish and a win screen. Lives in #solitaire inside
// #screen and gets the same (W, H, safe) as the lab.
import { CardSprite } from '../cards.js?v=landing-burst';
import { Klondike, FOUNDATIONS, TABLEAU, PILES } from './rules.js';

const SAVE_KEY = 'thedeck.solitaire.v1';
const DRAW_KEY = 'thedeck.solitaire.draw';
const K = 380; // card spring stiffness
const ZETA = 0.86;
const DRAG_K = 2400;
const DRAG_ZETA = 1;
const TAP_SLOP = 8; // px of movement before a press becomes a drag
const FLY_MS = 420; // moving cards stay above everything for this long
const FINISH_STEP_MS = 85;

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

export class SolitaireScene {
  /**
   * @param {HTMLElement} root  #solitaire
   * @param {{ scale: () => number, onExit: () => void }} opts
   */
  constructor(root, { scale, onExit }) {
    this.root = root;
    this.getScale = scale;
    this.visible = false;
    this.W = 393;
    this.H = 852;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this.m = null;
    this.press = null; // pointer down, maybe not dragging yet
    this.drag = null; // { from, index, sprites, offsets }
    this.finishing = 0; // next auto-finish step time (0 = off)
    this.elapsed = 0; // ms played, paused while hidden
    this.started = false;
    this.wonShown = false;

    this.buildDOM(onExit);

    const saved = this.load();
    this.game = saved?.game ?? new Klondike(Number(localStorage.getItem(DRAW_KEY)) === 3 ? 3 : 1);
    this.elapsed = saved?.elapsed ?? 0;
    this.started = this.game.moves > 0;
    this.placed = false; // sprites get their first position on first show
    this.dealOnShow = !saved;

    // One sprite per card for the whole session; deals just move them around.
    this.sprites = new Map();
    for (const k of PILES) for (const c of this.game.piles[k]) this.addSprite(c);
    this.syncCards();
    this.bindInput();
    this.updateHUD();
  }

  // -------------------------------------------------------------------- DOM

  buildDOM(onExit) {
    const r = this.root;
    r.innerHTML = '';
    this.slotsEl = h('div', 'sol-slots');
    this.cardsEl = h('div', 'sol-cards');

    const top = h('div', 'game-bar game-top');
    const back = h('button', 'game-icon', '‹');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back to lobby');
    back.addEventListener('click', onExit);
    const title = h('div', 'game-title', 'Solitaire');
    this.statsEl = h('div', 'game-stats');
    top.append(back, title, this.statsEl);

    const bottom = h('div', 'game-bar game-bottom');
    const btn = (label, fn, cls = '') => {
      const b = h('button', `game-btn ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      bottom.append(b);
      return b;
    };
    this.newBtn = btn('New game', () => this.newGame());
    this.drawBtn = btn('', () => this.toggleDrawCount());
    this.finishBtn = btn('Auto-finish', () => this.startFinish(), 'accent');
    this.undoBtn = btn('Undo', () => this.undo());

    this.winEl = h('div', 'game-win');
    this.winEl.innerHTML = `<div class="game-win-card"><div class="game-win-title">You won!</div><div class="game-win-stats"></div></div>`;
    const winCard = this.winEl.firstChild;
    const again = h('button', 'game-btn accent', 'Play again');
    again.type = 'button';
    again.addEventListener('click', () => this.newGame());
    const lobby = h('button', 'game-btn', 'Lobby');
    lobby.type = 'button';
    lobby.addEventListener('click', onExit);
    const row = h('div', 'game-win-actions');
    row.append(again, lobby);
    winCard.append(row);

    // Empty-pile outlines.
    this.slotEls = {};
    for (const k of ['stock', ...FOUNDATIONS, ...TABLEAU]) {
      const el = h('div', `sol-slot sol-slot-${k[0]}`);
      if (k === 'stock') el.innerHTML = '<span class="sol-recycle">↻</span>';
      if (k[0] === 'f') el.textContent = 'A';
      if (k[0] === 't') el.textContent = 'K';
      this.slotsEl.append(el);
      this.slotEls[k] = el;
    }

    r.append(this.slotsEl, this.cardsEl, top, bottom, this.winEl);
  }

  addSprite(card) {
    const sp = new CardSprite(card, this.cardsEl);
    sp.pileKey = null;
    sp.flyUntil = 0;
    sp.waitUntil = 0;
    sp.setLightSpace(this.W, this.H);
    this.sprites.set(card.id, sp);
    return sp;
  }

  /** Points each sprite at the game's current card object (they change on deal/restore). */
  syncCards() {
    for (const k of PILES) for (const c of this.game.piles[k]) this.sprites.get(c.id).card = c;
  }

  // ----------------------------------------------------------------- layout

  setSize(W, H, safe) {
    this.W = W;
    this.H = H;
    this.safe = safe;
    for (const sp of this.sprites.values()) sp.setLightSpace(W, H);
    this.relayout();
  }

  relayout() {
    const { W, H, safe } = this;
    const landscape = W > H;
    const barH = 46;
    const left = safe.left + 6;
    const right = W - safe.right - 6;
    const playTop = safe.top + barH + 6;
    const playBottom = H - safe.bottom - barH - 10;
    const gap = landscape ? 10 : 5;
    let cw = (right - left - gap * 6) / 7;
    // Landscape: the height limits size; keep room for a fanned column.
    cw = Math.min(cw, (playBottom - playTop) / 1.4 / (landscape ? 3 : 3.2), 110);
    const ch = cw * 1.4;
    const rowW = cw * 7 + gap * 6;
    const x0 = (left + right) / 2 - rowW / 2 + cw / 2;
    const colX = (i) => x0 + i * (cw + gap);
    const topY = playTop + ch / 2;
    const tabY = topY + ch + Math.max(10, ch * 0.18);
    this.m = { cw, ch, gap, colX, topY, tabY, playBottom, landscape };

    const s = this.root.style;
    s.setProperty('--cw', `${cw}px`);
    s.setProperty('--ch', `${ch}px`);
    s.setProperty('--card-radius', `${cw * 0.12}px`);
    s.setProperty('--bar-h', `${barH}px`);

    const place = (el, x, y) => {
      el.style.transform = `translate(${(x - cw / 2).toFixed(1)}px, ${(y - ch / 2).toFixed(1)}px)`;
    };
    place(this.slotEls.stock, colX(0), topY);
    FOUNDATIONS.forEach((f, i) => place(this.slotEls[f], colX(3 + i), topY));
    TABLEAU.forEach((t, i) => place(this.slotEls[t], colX(i), tabY));
  }

  /** Offsets between cards in a tableau column, compressed to fit the screen. */
  columnOffsets(pile) {
    const { ch, tabY, playBottom } = this.m;
    const down = ch * 0.12;
    const up = ch * 0.3;
    const offs = [];
    let total = 0;
    for (let i = 1; i < pile.length; i++) {
      const o = pile[i - 1].up ? up : down;
      offs.push(o);
      total += o;
    }
    const avail = playBottom - (tabY + ch / 2);
    const f = total > avail && total > 0 ? Math.max(0.2, avail / total) : 1;
    return offs.map((o) => o * f);
  }

  /** Rest position for every card: id -> { x, y, flip, z, pile, index }. */
  computeTargets() {
    const { cw, colX, topY, tabY } = this.m;
    const p = this.game.piles;
    const out = new Map();
    const set = (c, x, y, z, pile, index) => out.set(c.id, { x, y, flip: c.up ? 0 : 1, z, pile, index });

    p.stock.forEach((c, i) => set(c, colX(0) - Math.min(i, 6) * 0.25, topY - Math.min(i, 6) * 0.35, 10 + i, 'stock', i));
    const fan = this.game.drawCount === 3 ? 3 : 1;
    const wasteFanStart = p.waste.length - fan;
    p.waste.forEach((c, i) => {
      const k = Math.max(0, i - wasteFanStart);
      set(c, colX(1) + k * cw * 0.3, topY, 100 + i, 'waste', i);
    });
    FOUNDATIONS.forEach((f, fi) => p[f].forEach((c, i) => set(c, colX(3 + fi), topY, 100 + i, f, i)));
    TABLEAU.forEach((t, ti) => {
      const offs = this.columnOffsets(p[t]);
      let y = tabY;
      p[t].forEach((c, i) => {
        if (i > 0) y += offs[i - 1];
        set(c, colX(ti), y, 200 + i, t, i);
      });
    });
    return out;
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    if (!this.m) return;
    if (this.started && !this.game.won && now >= (this.heldUntil ?? 0)) this.elapsed += dt * 1000;

    if (this.finishing && now >= this.finishing) {
      const mv = this.game.nextFinishMove();
      if (mv) {
        this.game.move(mv.from, mv.index, mv.to);
        this.finishing = now + FINISH_STEP_MS;
      } else this.finishing = 0;
      this.afterChange();
    }

    const targets = this.computeTargets();
    const stock = targets.get(this.game.piles.stock[0]?.id) ?? { x: this.m.colX(0), y: this.m.topY };
    const dragIds = new Set(this.drag?.sprites.map((sp) => sp.card.id));

    for (const [id, sp] of this.sprites) {
      const t = targets.get(id);
      if (!t) continue;
      if (sp.pileKey !== t.pile) {
        if (sp.pileKey !== null) sp.flyUntil = now + FLY_MS;
        sp.pileKey = t.pile;
      }
      let k = K;
      let zeta = ZETA;
      if (dragIds.has(id)) {
        const i = this.drag.sprites.indexOf(sp);
        const o = this.drag.offsets[i];
        sp.target(this.drag.x + o.x, this.drag.y + o.y, 0, 1.06, 0, 1);
        sp.z = 5000 + i;
        k = DRAG_K;
        zeta = DRAG_ZETA;
      } else if (now < sp.waitUntil) {
        sp.target(stock.x, stock.y, 0, 1, 1, 0);
        sp.z = 10 + (sp.waitUntil - now) / 10;
      } else {
        const flying = now < sp.flyUntil;
        sp.target(t.x, t.y, 0, 1, t.flip, flying ? 0.6 : 0);
        sp.z = t.z + (flying ? 3000 : 0);
      }
      sp.step(dt, k, zeta);
      sp.render();
    }
    this.updateStats();
  }

  // ------------------------------------------------------------------ input

  bindInput() {
    const r = this.root;
    const stop = (e) => e.stopPropagation(); // keep the lab's Input on #screen out of this
    r.addEventListener('pointerdown', (e) => {
      stop(e);
      this.down(e);
    });
    r.addEventListener('pointermove', (e) => {
      stop(e);
      this.move(e);
    });
    r.addEventListener('pointerup', (e) => {
      stop(e);
      this.up(e, false);
    });
    r.addEventListener('pointercancel', (e) => {
      stop(e);
      this.up(e, true);
    });
    r.addEventListener('lostpointercapture', (e) => {
      if (this.press && e.pointerId === this.press.id) this.up(e, true);
    });
    r.addEventListener('wheel', stop, { passive: true });
    r.addEventListener(
      'touchstart',
      (e) => {
        stop(e);
        if (!(e.target instanceof Element && e.target.closest('button'))) e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      }
    });
  }

  local(e) {
    const rect = this.root.getBoundingClientRect();
    const s = this.getScale() || 1;
    return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s };
  }

  /** Topmost card (or empty stock) under a point. */
  hit(p) {
    const { cw, ch } = this.m;
    const targets = this.computeTargets();
    let best = null;
    for (const [id, t] of targets) {
      if (Math.abs(p.x - t.x) > cw / 2 || Math.abs(p.y - t.y) > ch / 2) continue;
      if (!best || t.z > best.z) best = { ...t, id };
    }
    if (best) return best;
    const sx = this.m.colX(0);
    if (Math.abs(p.x - sx) <= cw / 2 && Math.abs(p.y - this.m.topY) <= ch / 2) return { pile: 'stock', index: -1 };
    return null;
  }

  down(e) {
    if (this.press || this.finishing || !this.m) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button')) return;
    if (this.game.won) return;
    const p = this.local(e);
    const hit = this.hit(p);
    if (!hit) return;
    e.preventDefault();
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    this.press = { id: e.pointerId, start: p, hit, touch: e.pointerType === 'touch' };
  }

  move(e) {
    const p = this.local(e);
    if (!this.press || e.pointerId !== this.press.id) {
      if (e.pointerType !== 'touch' && !this.press && this.m) this.updateCursor(p);
      return;
    }
    if (!this.drag) {
      const { start, hit } = this.press;
      if (Math.hypot(p.x - start.x, p.y - start.y) < TAP_SLOP) return;
      if (hit.pile === 'stock' || !this.game.canPick(hit.pile, hit.index)) return;
      this.startDrag(hit, start);
    }
    this.drag.x = p.x;
    this.drag.y = p.y;
  }

  startDrag(hit, start) {
    const cards = this.game.piles[hit.pile].slice(hit.index);
    const sprites = cards.map((c) => this.sprites.get(c.id));
    // Fingers cover the card, so lift it a little above the touch point.
    const lift = this.press.touch ? this.m.ch * 0.18 : 0;
    const offsets = sprites.map((sp) => ({ x: sp.x.v - start.x, y: sp.y.v - start.y - lift }));
    this.drag = { from: hit.pile, index: hit.index, sprites, offsets, x: start.x, y: start.y };
    this.root.classList.add('dragging');
  }

  up(e, cancelled) {
    if (!this.press || e.pointerId !== this.press.id) return;
    const { hit } = this.press;
    const drag = this.drag;
    this.press = null;
    this.drag = null;
    this.root.classList.remove('dragging');

    if (cancelled) return;
    if (drag) {
      const to = this.dropTarget(drag);
      if (to) this.game.move(drag.from, drag.index, to);
      this.afterChange();
      return;
    }
    // Tap
    if (hit.pile === 'stock') {
      this.game.draw();
      this.afterChange();
      return;
    }
    const to = this.game.autoTarget(hit.pile, hit.index);
    if (to) {
      this.game.move(hit.pile, hit.index, to);
      this.afterChange();
    } else {
      this.nudge(hit);
    }
  }

  /** Legal pile under the dragged run with the most overlap. */
  dropTarget(drag) {
    const { cw, ch, colX, topY, tabY } = this.m;
    const lx = drag.x + drag.offsets[0].x;
    const ly = drag.y + drag.offsets[0].y;
    const cards = drag.sprites.map((sp) => sp.card);
    const overlap = (x, y, w, hh) => {
      const ox = Math.min(lx + cw / 2, x + w / 2) - Math.max(lx - cw / 2, x - w / 2);
      const oy = Math.min(ly + ch / 2, y + hh / 2) - Math.max(ly - ch / 2, y - hh / 2);
      return ox > 0 && oy > 0 ? ox * oy : 0;
    };
    const targets = this.computeTargets();
    let best = null;
    let bestArea = 0;
    const consider = (pile, area) => {
      if (area > bestArea && pile !== drag.from && this.game.canDrop(cards, pile)) {
        best = pile;
        bestArea = area;
      }
    };
    FOUNDATIONS.forEach((f, i) => consider(f, overlap(colX(3 + i), topY, cw, ch)));
    TABLEAU.forEach((t, i) => {
      const pile = this.game.piles[t];
      const lastY = pile.length ? targets.get(pile[pile.length - 1].id).y : tabY;
      // The whole column counts, from its top to just past its last card.
      const top = tabY - ch / 2;
      const bottom = lastY + ch / 2 + ch * 0.3;
      consider(t, overlap(colX(i), (top + bottom) / 2, cw + this.m.gap, bottom - top));
    });
    return best;
  }

  nudge(hit) {
    const pile = this.game.piles[hit.pile];
    if (!pile || hit.index < 0) return;
    for (const c of pile.slice(hit.index)) {
      const sp = this.sprites.get(c.id);
      if (c.up) sp.x.vel += 260;
    }
  }

  updateCursor(p) {
    const hit = this.hit(p);
    let cursor = '';
    if (hit?.pile === 'stock') cursor = 'pointer';
    else if (hit && this.game.canPick(hit.pile, hit.index)) cursor = 'grab';
    if (this.root.style.cursor !== cursor) this.root.style.cursor = cursor;
  }

  /** Pushes back everything time-based by `ms` (the lobby's zoom-in), so the game starts when it lands. */
  postpone(ms) {
    const now = performance.now();
    for (const sp of this.sprites.values()) if (sp.waitUntil > now) sp.waitUntil += ms;
    if (this.finishing) this.finishing = Math.max(this.finishing, now) + ms;
    this.heldUntil = now + ms;
  }

  cancel() {
    if (this.press) this.up({ pointerId: this.press.id }, true);
  }

  // ---------------------------------------------------------------- actions

  newGame() {
    this.cancel();
    this.finishing = 0;
    this.game = new Klondike(this.game.drawCount);
    this.syncCards();
    this.elapsed = 0;
    this.started = false;
    this.wonShown = false;
    this.winEl.classList.remove('show');
    this.dealAnimation(380);
    this.afterChange();
  }

  /** Everything gathers on the stock, then the tableau is dealt card by card. */
  dealAnimation(gather) {
    const now = performance.now();
    for (const sp of this.sprites.values()) sp.waitUntil = now + gather;
    this.game.dealOrder.forEach((c, i) => {
      this.sprites.get(c.id).waitUntil = now + gather + 40 + i * 38;
    });
  }

  toggleDrawCount() {
    const next = this.game.drawCount === 3 ? 1 : 3;
    localStorage.setItem(DRAW_KEY, String(next));
    // Changing the rules mid-game isn't fair; it applies right away only if no move has been made.
    this.game.drawCount = next;
    if (this.game.moves > 0) this.newGame();
    else this.afterChange();
  }

  undo() {
    if (this.finishing || this.drag) return;
    if (this.game.undo()) this.afterChange();
  }

  startFinish() {
    if (this.game.canAutoFinish) this.finishing = performance.now();
  }

  afterChange() {
    if (this.game.moves > 0) this.started = true;
    this.save();
    this.updateHUD();
    if (this.game.won && !this.wonShown) {
      this.wonShown = true;
      this.finishing = 0;
      this.celebrate();
    }
  }

  celebrate() {
    // Foundation cards hop in a wave, then the win card appears.
    FOUNDATIONS.forEach((f, fi) =>
      this.game.piles[f].forEach((c, i) => {
        const sp = this.sprites.get(c.id);
        setTimeout(() => {
          sp.y.vel -= 900;
          sp.lift.vel += 6;
        }, (12 - i) * 45 + fi * 30);
      }),
    );
    const stats = this.winEl.querySelector('.game-win-stats');
    stats.textContent = `${fmtMoves(this.game.moves)} · ${fmtTime(this.elapsed)}`;
    setTimeout(() => this.winEl.classList.add('show'), 900);
  }

  updateHUD() {
    const g = this.game;
    this.undoBtn.disabled = !g.history.length || g.won;
    this.drawBtn.textContent = `Draw ${g.drawCount}`;
    this.drawBtn.title = 'Cards drawn from the stock per tap. Starts a new game if one is in progress.';
    this.finishBtn.hidden = !g.canAutoFinish;
    this.slotEls.stock.classList.toggle('can-recycle', !g.piles.stock.length && g.piles.waste.length > 0);
    this.updateStats(true);
  }

  updateStats(force) {
    const text = `${fmtMoves(this.game.moves)} · ${fmtTime(this.elapsed)}`;
    if (force || text !== this._stats) {
      this.statsEl.textContent = text;
      this._stats = text;
    }
  }

  // ------------------------------------------------------------ visibility

  show() {
    this.visible = true;
    this.root.classList.add('active');
    this.relayout();
    if (this.placed) return;
    this.placed = true;
    const targets = this.computeTargets();
    const sx = this.m.colX(0);
    for (const [id, sp] of this.sprites) {
      const t = targets.get(id);
      sp.pileKey = t.pile;
      if (this.dealOnShow) sp.place(sx, this.m.topY, 0, 1, 1);
      else sp.place(t.x, t.y, 0, 1, t.flip);
    }
    if (this.dealOnShow) this.dealAnimation(150);
  }

  hide() {
    this.cancel();
    this.visible = false;
    this.root.classList.remove('active');
    this.save();
  }

  // ----------------------------------------------------------- persistence

  save() {
    try {
      if (this.game.won) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.serialize(), elapsed: Math.round(this.elapsed) }));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      const game = Klondike.restore(data);
      return game ? { game, elapsed: Number(data.elapsed) || 0 } : null;
    } catch {
      return null;
    }
  }
}

const fmtMoves = (n) => `${n} ${n === 1 ? 'move' : 'moves'}`;

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

