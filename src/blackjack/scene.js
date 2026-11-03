// Blackjack against the dealer. Bet with chips, then Hit / Stand / Double /
// Split (buttons or H S D P; Space or Enter deals). The rules resolve each
// action at once and return events; the scene plays them back card by card,
// keeping its own picture of the table (`vis`) in step with the animation.
import { CardSprite, cardBackHTML } from '../cards.js?v=landing-burst';
import { Blackjack, CHIPS, START_BANK, handValue } from './rules.js';

const SAVE_KEY = 'thedeck.blackjack.v1';
const CARD_MS = 380; // between dealt cards
const DEALER_MS = 650; // between dealer draws
const RESULT_TEXT = { blackjack: 'Blackjack!', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust' };

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export class BlackjackScene {
  constructor(root, { settings, haptic, onExit }) {
    this.root = root;
    this.s = settings;
    this.haptic = haptic;
    this.onExit = onExit;
    this.visible = false;
    this.queue = [];
    this.vis = { dealer: [], hands: [], active: -1, discard: [], results: null };
    this.leaving = [];
    this.game = this.load() ?? new Blackjack();
    this.shownBank = this.game.bank;
    this.buildDOM();
    this.bindKeys();
    this.updateHUD();
  }

  // -------------------------------------------------------------------- DOM

  buildDOM() {
    const r = this.root;
    r.innerHTML = '';
    this.shoeEl = h('div', 'deck-pile bj-shoe');
    this.shoeEl.innerHTML = `<div class="deck-stack back-art">${cardBackHTML()}</div>`;
    this.cardsEl = h('div', 'cards-layer');

    const top = h('div', 'game-bar game-top');
    const back = h('button', 'game-icon', '‹');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back to lobby');
    back.addEventListener('click', () => this.onExit());
    this.bankEl = h('div', 'game-stats bj-bank');
    top.append(back, h('div', 'game-title', 'Blackjack'), this.bankEl);

    this.dealerLabel = h('div', 'bj-label bj-dealer-label');
    this.handLabels = [];
    this.bannerEl = h('div', 'bj-banner');
    this.ruleEl = h('div', 'bj-rules', 'Blackjack pays 3 to 2 · Dealer stands on 17');

    // Controls: bet row (between rounds) and action row (during a round).
    this.controls = h('div', 'bj-controls');
    this.betLine = h('div', 'bj-betline');
    this.betRow = h('div', 'bj-row');
    for (const v of CHIPS) {
      const b = h('button', `bj-chip bj-chip-${v}`, String(v));
      b.type = 'button';
      b.setAttribute('aria-label', `Add ${v}`);
      b.addEventListener('click', () => this.addChip(v));
      this.betRow.append(b);
    }
    this.clearBtn = this.button(this.betRow, 'Clear', () => this.clearBet(), 'small');
    this.dealBtn = this.button(this.betRow, 'Deal', () => this.deal(), 'accent');
    this.resetBtn = this.button(this.betRow, `Reset bank to ${fmt(START_BANK)}`, () => this.resetBank(), 'accent');

    this.actRow = h('div', 'bj-row');
    this.hitBtn = this.button(this.actRow, 'Hit', () => this.act('hit'));
    this.standBtn = this.button(this.actRow, 'Stand', () => this.act('stand'));
    this.doubleBtn = this.button(this.actRow, 'Double', () => this.act('double'));
    this.splitBtn = this.button(this.actRow, 'Split', () => this.act('split'));
    this.controls.append(this.betLine, this.betRow, this.actRow);

    r.append(this.shoeEl, this.cardsEl, this.dealerLabel, this.bannerEl, this.ruleEl, top, this.controls);

    // Keep the lab's Input on #screen from seeing these events.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'touchstart']) {
      r.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
  }

  button(parent, label, fn, cls = '') {
    const b = h('button', `game-btn ${cls}`, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    parent.append(b);
    return b;
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.visible || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
      const k = e.key.toLowerCase();
      const map = { h: 'hit', s: 'stand', d: 'double', p: 'split' };
      if (map[k]) this.act(map[k]);
      else if (k === ' ' || k === 'enter') {
        e.preventDefault();
        this.deal();
      } else return;
    });
    window.addEventListener('pagehide', () => this.save());
  }

  // ----------------------------------------------------------------- layout

  setSize(W, H, safe) {
    this.W = W;
    this.H = H;
    this.safe = safe;
    const landscape = W > H;
    const barH = 46;
    const ctrlH = 104;
    const top = safe.top + barH;
    const bottom = H - safe.bottom - ctrlH;
    const left = safe.left + 10;
    const right = W - safe.right - 10;
    const cx = (left + right) / 2;
    let ch;
    let m;
    if (landscape) {
      // Short screen: dealer on the left, your hands on the right, side by side.
      ch = Math.min((bottom - top) * 0.5, 115);
      const y = (top + bottom) / 2 + 16;
      m = { dealerX: left + (right - left) * 0.3, dealerY: y, playerX: left + (right - left) * 0.68, playerY: y + ch * 0.12, midY: top + 16, bannerX: cx };
    } else {
      ch = Math.min(W * 0.22 * 1.4, (bottom - top) * 0.26);
      const dealerY = top + 30 + ch / 2;
      const playerY = bottom - 34 - ch / 2 - ch * 0.12 * 2;
      m = { dealerX: cx, dealerY, playerX: cx, playerY, midY: (dealerY + ch / 2 + playerY - ch / 2) / 2, bannerX: cx };
    }
    const cw = ch / 1.4;
    this.m = { W, H, cw, ch, cx, left, right, landscape, ...m };
    this.m.shoe = landscape ? { x: right - cw / 2, y: top + ch / 2 + 6 } : { x: right - cw / 2, y: m.midY };
    this.m.discard = landscape ? { x: left + cw / 2, y: top + ch / 2 + 6 } : { x: left + cw / 2, y: m.midY };
    const { dealerX, dealerY, midY } = this.m;

    const s = this.root.style;
    s.setProperty('--cw', `${cw}px`);
    s.setProperty('--ch', `${ch}px`);
    s.setProperty('--card-radius', `${cw * 0.12}px`);
    s.setProperty('--ctrl-h', `${ctrlH}px`);
    this.shoeEl.style.transform = `translate(${this.m.shoe.x - cw / 2}px, ${this.m.shoe.y - ch / 2}px)`;
    this.dealerLabel.style.transform = `translate(${dealerX}px, ${dealerY - ch / 2 - 16}px) translate(-50%, -50%)`;
    this.bannerEl.style.transform = `translate(${cx}px, ${midY}px) translate(-50%, -50%)`;
    this.ruleEl.style.transform = `translate(${cx}px, ${landscape ? (top + bottom) / 2 : midY + 30}px) translate(-50%, -50%)`;
    for (const sp of this.allSprites()) sp.setLightSpace(W, H);
  }

  allSprites() {
    return [...this.vis.dealer, ...this.vis.hands.flat(), ...this.vis.discard, ...this.leaving];
  }

  /** Where the cards of each player hand sit. */
  handSlots() {
    const { cw, left, right, playerX: cx, playerY, landscape } = this.m;
    const n = Math.max(1, this.vis.hands.length);
    const width = landscape ? (right - cx) * 2 - cw * 1.6 : right - left - cw * 1.2;
    const spacing = n > 1 ? Math.min(cw * 2, width / (n - 1)) : 0;
    return Array.from({ length: n }, (_, i) => ({ x: cx + (i - (n - 1) / 2) * spacing - cw * 0.2, y: playerY }));
  }

  // ---------------------------------------------------------------- actions

  addChip(v) {
    if (this.busy || this.game.phase === 'play') return;
    this.game.addChip(v);
    this.haptic(6);
    this.updateHUD();
  }

  clearBet() {
    if (this.busy || this.game.phase === 'play') return;
    this.game.setBet(0);
    this.updateHUD();
  }

  resetBank() {
    const stats = this.game.stats;
    this.game = new Blackjack();
    this.game.stats = stats;
    this.shownBank = this.game.bank;
    this.clearTable(false);
    this.updateHUD();
    this.save();
  }

  deal() {
    if (this.busy || !this.game.canDeal) return;
    this.clearTable(true);
    const ev = this.game.deal();
    this.play(ev);
  }

  act(name) {
    if (this.busy) return;
    const ev = this.game[name]?.();
    if (!ev) return;
    this.haptic(8);
    this.play(ev);
  }

  /** Moves the last round's cards to the discard tray. */
  clearTable(animate) {
    const v = this.vis;
    const old = [...v.dealer, ...v.hands.flat()];
    for (const sp of old) {
      sp.down = true;
      v.discard.push(sp);
    }
    v.dealer = [];
    v.hands = [];
    v.active = -1;
    v.results = null;
    this.banner('');
    if (!animate) {
      for (const sp of v.discard) sp.destroy();
      v.discard = [];
    }
  }

  // ------------------------------------------------------- event playback

  get busy() {
    return this.queue.length > 0;
  }

  enqueue(delay, fn) {
    const last = this.queue.length ? this.queue[this.queue.length - 1].at : performance.now();
    this.queue.push({ at: Math.max(last, performance.now()) + delay, fn });
  }

  play(events) {
    const settle = events.find((e) => e.type === 'settle');
    // Payouts show up in the bank when the round's result does.
    this.shownBank = this.game.bank - (settle ? settle.results.reduce((n, r) => n + r.payout, 0) : 0);
    let dealerTurn = false;
    for (const e of events) {
      switch (e.type) {
        case 'shuffle':
          this.enqueue(0, () => this.reshuffleVisual());
          this.enqueue(650, () => {});
          break;
        case 'card':
          if (e.who === 'dealer' && dealerTurn) {
            this.enqueue(DEALER_MS, () => this.addCard(e));
          } else {
            this.enqueue(0, () => this.addCard(e));
            this.enqueue(CARD_MS, () => {});
          }
          break;
        case 'split':
          this.enqueue(0, () => {
            const v = this.vis;
            v.hands.splice(e.to, 0, [v.hands[e.from].pop()]);
          });
          this.enqueue(CARD_MS, () => {});
          break;
        case 'active':
          this.enqueue(0, () => (this.vis.active = e.hand));
          break;
        case 'reveal':
          dealerTurn = true;
          this.enqueue(250, () => {
            this.vis.active = -1;
            const hole = this.vis.dealer[1];
            if (hole) hole.down = false;
          });
          this.enqueue(DEALER_MS, () => {});
          break;
        case 'settle':
          this.enqueue(300, () => this.showResults(e.results));
          break;
        default:
      }
    }
    this.enqueue(0, () => this.updateHUD());
    this.updateHUD();
    this.save();
  }

  addCard(e) {
    const { shoe } = this.m;
    const sp = new CardSprite(e.card, this.cardsEl);
    sp.setLightSpace(this.W, this.H);
    sp.place(shoe.x, shoe.y, 0, 1, 1);
    sp.down = e.down;
    if (e.who === 'dealer') this.vis.dealer.push(sp);
    else (this.vis.hands[e.who] ??= []).push(sp);
    this.haptic(5);
  }

  reshuffleVisual() {
    const now = performance.now();
    for (const sp of this.vis.discard) {
      sp.removeAt = now + 600;
      this.leaving.push(sp);
    }
    this.vis.discard = [];
    this.banner('Shuffling…', 'info');
  }

  showResults(results) {
    this.vis.results = results;
    this.vis.active = -1;
    this.shownBank = this.game.bank;
    const net = results.reduce((n, r, i) => n + r.payout - (this.game.hands[i]?.bet ?? 0), 0);
    const d = handValue(this.game.dealer).total;
    let text;
    let kind;
    if (results.length === 1 && results[0].result === 'blackjack') (text = `Blackjack! +${fmt(net)}`), (kind = 'win');
    else if (net > 0) (text = `${d > 21 ? 'Dealer busts! ' : ''}You win +${fmt(net)}`), (kind = 'win');
    else if (net < 0) (text = `${results.every((r) => r.result === 'bust') ? 'Bust. ' : ''}You lose ${fmt(-net)}`), (kind = 'lose');
    else (text = 'Push'), (kind = 'push');
    this.banner(text, kind);
    this.haptic(net > 0 ? [10, 40, 10] : 8);
    this.updateHUD();
  }

  banner(text, kind = '') {
    this.bannerEl.textContent = text;
    this.bannerEl.className = `bj-banner${text ? ' show' : ''}${kind ? ` ${kind}` : ''}`;
  }

  // ------------------------------------------------------------------ frame

  update(now, dt) {
    if (!this.m) return;
    while (this.queue.length && now >= this.queue[0].at) this.queue.shift().fn();
    const { cw, ch, dealerX, dealerY, discard, shoe } = this.m;
    const k = this.s.stiffness;
    const z = this.s.damping;

    // Dealer: a straight row, centered.
    const dn = this.vis.dealer.length;
    this.vis.dealer.forEach((sp, i) => {
      const x = dealerX + (i - (dn - 1) / 2) * cw * 0.62;
      this.pose(sp, x, dealerY, 0, sp.down ? 1 : 0, 0, 100 + i, dt, k, z);
    });

    // Player hands: cards cascade up and to the right; the active hand lifts.
    const slots = this.handSlots();
    this.vis.hands.forEach((cards, hi) => {
      const slot = slots[hi] ?? slots[0];
      const active = hi === this.vis.active;
      const n = cards.length;
      cards.forEach((sp, i) => {
        const x = slot.x + i * cw * 0.3 - (n - 1) * cw * 0.06;
        const y = slot.y - i * ch * 0.12 - (active ? 10 : 0);
        this.pose(sp, x, y, (i - (n - 1) / 2) * 1.5, sp.down ? 1 : 0, active ? 0.5 : 0, 200 + hi * 20 + i, dt, k, z);
      });
    });

    // Discard tray: a tidy face-down stack.
    this.vis.discard.forEach((sp, i) => {
      const layer = Math.min(i, 12);
      this.pose(sp, discard.x - layer * 0.3, discard.y - layer * 0.45, ((i * 37) % 9) - 4, 1, 0, 20 + i, dt, k, z);
    });

    this.leaving = this.leaving.filter((sp) => {
      if (now >= sp.removeAt) {
        sp.destroy();
        return false;
      }
      this.pose(sp, shoe.x, shoe.y, 0, 1, 0, 30, dt, k, z);
      return true;
    });

    this.updateLabels(slots);
  }

  pose(sp, x, y, rot, flip, lift, zi, dt, k, z) {
    sp.target(x, y, rot, 1, flip, lift);
    sp.z = zi;
    sp.step(dt, k, z);
    sp.render();
  }

  // -------------------------------------------------------------------- HUD

  updateLabels(slots) {
    const v = this.vis;
    // Dealer total counts only the cards you can see.
    const shown = v.dealer.filter((sp) => !sp.down).map((sp) => sp.card);
    const dt = shown.length ? handValue(shown) : null;
    const dText = dt ? `Dealer · ${dt.total}${v.dealer.some((sp) => sp.down) ? '' : dt.total > 21 ? ' · bust' : ''}` : '';
    if (dText !== this.dealerLabel.textContent) this.dealerLabel.textContent = dText;

    while (this.handLabels.length < v.hands.length) {
      const el = h('div', 'bj-label bj-hand-label');
      this.root.insertBefore(el, this.controls);
      this.handLabels.push(el);
    }
    this.handLabels.forEach((el, i) => {
      const cards = v.hands[i];
      if (!cards?.length) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      const hv = handValue(cards.map((sp) => sp.card));
      const res = v.results?.[i];
      const bet = this.game.hands[i]?.bet;
      let text = `${hv.soft && hv.total < 21 ? 'soft ' : ''}${hv.total}`;
      if (bet) text += ` · ${fmt(bet)}`;
      if (res) text = `${RESULT_TEXT[res.result]} · ${hv.total}`;
      const cls = `bj-label bj-hand-label${i === v.active ? ' active' : ''}${res ? ` r-${res.result}` : ''}`;
      if (el.textContent !== text) el.textContent = text;
      if (el.className !== cls) el.className = cls;
      const slot = slots[i] ?? slots[0];
      const t = `translate(${slot.x + this.m.cw * 0.3}px, ${slot.y + this.m.ch / 2 + 18}px) translate(-50%, -50%)`;
      if (el.style.transform !== t) el.style.transform = t;
    });
  }

  updateHUD() {
    const g = this.game;
    const busy = this.busy;
    const between = g.phase !== 'play';
    this.bankEl.textContent = `Bank ${fmt(this.shownBank)}`;
    const broke = between && !busy && g.bank < CHIPS[0];
    this.betRow.style.display = between ? '' : 'none';
    this.actRow.style.display = between ? 'none' : '';
    this.betLine.textContent = broke ? 'Out of chips' : between ? `Bet ${fmt(g.bet)}` : `Bet ${fmt(g.wagered)} on the table`;
    for (const b of this.betRow.querySelectorAll('.bj-chip')) {
      b.disabled = busy || broke || g.bet + Number(b.textContent) > g.bank;
      b.hidden = broke;
    }
    this.clearBtn.hidden = broke;
    this.dealBtn.hidden = broke;
    this.resetBtn.hidden = !broke;
    this.clearBtn.disabled = busy || !g.bet;
    this.dealBtn.disabled = busy || !g.canDeal;
    this.dealBtn.textContent = g.phase === 'done' ? `Deal again · ${fmt(g.bet)}` : `Deal · ${fmt(g.bet)}`;
    this.hitBtn.disabled = busy || !g.canHit;
    this.standBtn.disabled = busy || !g.canStand;
    this.doubleBtn.disabled = busy || !g.canDouble;
    this.splitBtn.disabled = busy || !g.canSplit;
    this.ruleEl.classList.toggle('show', g.phase === 'bet' && !this.vis.dealer.length);
  }

  // ------------------------------------------------------------ visibility

  show() {
    this.visible = true;
    this.root.classList.add('active');
    this.updateHUD();
  }

  hide() {
    this.visible = false;
    this.root.classList.remove('active');
    this.save();
  }

  cancel() {}

  // ----------------------------------------------------------- persistence

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.serialize()));
    } catch {
      /* storage full or blocked */
    }
  }

  load() {
    try {
      return Blackjack.restore(JSON.parse(localStorage.getItem(SAVE_KEY)));
    } catch {
      return null;
    }
  }
}
