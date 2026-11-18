// Stress against a CPU, in real time. It is Speed's table (speed/scene.js) with
// Stress's rules: both players' four cards lie face up, the draw piles flip
// onto the middle, and when the two middle piles show the same rank a
// "Stress!" button appears. Whoever hits it first (you, or the CPU after its
// reaction time) hands both piles to the other player.
//
// Instead of a clock the table keeps money: every card you get onto the middle
// is $1, and a Stress call you win pays $1 for every card the other player has
// to take. It is shown next to each avatar.
import { SpeedScene, LEVELS, SIDE_SCALE } from '../speed/scene.js?v=fourcolor';
import { Stress } from './rules.js';
import { sfx } from '../sfx.js';

const STRESS = {
  title: 'Stress',
  rules: () => new Stress(),
  saveLevel: 'thedeck.stress.level',
  bestKey: null, // no clock here, so no best times
  stuckMs: 900,
  cpuFaceUp: true,
  cpuSpread: 1.08,
  centerScale: 1, // the middle piles are the size of the cards in your hand
  levelTitle: 'Difficulty',
  levelNames: { normal: 'Medium' },
};
const TAKE_MS = 520; // how long taken cards fly to the loser's pile

export class StressScene extends SpeedScene {
  constructor(root, opts) {
    super(root, opts, STRESS);
    this.flying = []; // center cards on their way to the pile of whoever lost the call
    this.callAt = 0; // when the CPU will call the match it has seen
    this.holdUntil = 0; // no flip before this, so the call's banner can be read
    this.money = [0, 0]; // you, CPU
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || !this.root.classList.contains('active') || !this.callBtn.classList.contains('show')) return;
      e.preventDefault();
      this.call(0);
    });
  }

  buildDOM() {
    super.buildDOM();
    this.callBtn = document.createElement('button');
    this.callBtn.type = 'button';
    this.callBtn.className = 'game-btn accent st-call';
    this.callBtn.textContent = 'Stress!';
    // pointerdown, not click: this is a race.
    this.callBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.call(0);
    });
    this.root.insertBefore(this.callBtn, this.bannerEl);
    this.deckEl.classList.add('st-mine'); // its count goes above it (style.css)
    // The reminder is a caption under the middle piles, not a pill by your avatar.
    this.tipEl = document.createElement('div');
    this.tipEl.className = 'rm-row-label st-tip';
    this.tipEl.textContent = 'Hit Stress! when the piles match';
    this.root.insertBefore(this.tipEl, this.callBtn);
  }

  adjustLayout() {
    super.adjustLayout();
    const { cx, midY } = this.lay;
    const m = this.table.m;
    const under = midY + (m.ch * this.game.centerScale) / 2;
    this.tipEl.style.transform = `translate(${cx}px, ${under + 20}px) translate(-50%, -50%)`;
    this.callBtn.style.left = `${cx}px`;
    this.callBtn.style.top = `${midY + (m.ch * this.game.centerScale) / 2 + 34}px`;
    // Your draw pile sits low, at the corner of your hand; a raised card may cover it.
    m.deck.y = m.handTop - (m.ch * SIDE_SCALE) / 2 + 34;
    this.deckEl.style.top = `${m.deck.y - m.ch / 2}px`;
  }

  /** The setup card is only the question: three difficulties, stacked. Picking one starts the game. */
  showSetup() {
    this.phase = 'setup';
    const c = this.overCard;
    c.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'game-win-title';
    title.textContent = 'Difficulty';
    const list = document.createElement('div');
    list.className = 'st-levels';
    for (const key of Object.keys(LEVELS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `game-btn${key === this.level ? ' accent' : ''}`; // your last choice is the highlighted one
      b.textContent = this.levelName(key);
      b.addEventListener('click', () => {
        this.level = key;
        localStorage.setItem(this.game.saveLevel, key);
        this.begin();
      });
      list.append(b);
    }
    c.append(title, list);
    this.overEl.classList.add('show');
    this.updateHUD();
  }

  begin() {
    this.dropFlying();
    this.callAt = 0;
    this.holdUntil = 0;
    this.money = [0, 0];
    super.begin();
  }

  /** A card flipped onto the middle comes from the pile of the player who flipped it. */
  sync(deal = false) {
    if (!deal) {
      this.rules.centers.forEach((cards, p) => {
        const top = cards[cards.length - 1];
        if (cards.length === 1 && top && !this.byId.has(top.id)) this.sprite(top, p === 0 ? this.table.m.deck : this.lay.cpuStock);
      });
    }
    super.sync(deal);
  }

  tick(now) {
    const r = this.rules;
    const match = r.match;
    this.callBtn.classList.toggle('show', match);
    this.tipEl.classList.toggle('show', !match);
    if (!match) this.callAt = 0;
    else if (!this.callAt) this.callAt = now + LEVELS[this.level].ms * (0.9 + Math.random() * 0.6);
    else if (now >= this.callAt) this.call(1);
  }

  /** Player p hits Stress: the other one takes both middle piles. */
  call(p) {
    const r = this.rules;
    if (this.phase !== 'play' || !r?.match) return;
    const t = this.table;
    const sprites = [...t.played];
    const res = r.call(p);
    if (!res) return;
    this.input.cancel();
    const now = performance.now();
    const to = res.loser === 0 ? t.m.deck : this.lay.cpuStock;
    for (const sp of sprites) {
      this.detach(sp);
      this.byId.delete(sp.card.id);
      this.pileOf.delete(sp);
      sp.flyTo = to;
      sp.removeAt = now + TAKE_MS;
      this.flying.push(sp);
    }
    this.callAt = 0;
    this.stuckAt = 0;
    this.holdUntil = now + 1000;
    this.callBtn.classList.remove('show');
    const n = res.taken.length;
    this.money[p] += n;
    sfx('stress'); // a low choir says the word, whoever called it
    if (p === 0) {
      this.banner(`Stress! CPU takes ${n}`, 'go', 1100);
      t.haptic([12, 30, 12]);
    } else {
      this.banner(`Stress! You take ${n}`, 'info', 1100);
      this.flash('bad');
      t.haptic(30);
    }
    this.cpuAt = now + this.cpuDelay();
    this.sync();
  }

  /** A card on the middle is a dollar. */
  afterMove(res, p) {
    if (res) this.money[p]++;
    super.afterMove(res, p);
  }

  updateHUD() {
    super.updateHUD();
    if (!this.rules) return;
    this.cpuLabel.innerHTML = `<div class="rm-name">CPU</div><div class="rm-sub">$${this.money[1]}</div>`;
    this.youLabel.innerHTML = `<div class="rm-name">You</div><div class="rm-sub">$${this.money[0]}</div>`;
  }

  clockText() {
    return ''; // no clock in Stress
  }

  resultLines() {
    return [`You $${this.money[0]} · CPU $${this.money[1]}`, this.levelName()];
  }

  stepOthers(now, dt) {
    super.stepOthers(now, dt);
    if (!this.flying.length) return;
    const s = this.table.s;
    this.flying = this.flying.filter((sp, i) => {
      if (now >= sp.removeAt) {
        sp.destroy();
        return false;
      }
      sp.z = 200 + i;
      sp.target(sp.flyTo.x, sp.flyTo.y, 0, SIDE_SCALE, 1, 0);
      sp.step(dt, s.stiffness, s.damping);
      sp.render();
      return true;
    });
  }

  dropFlying() {
    for (const sp of this.flying) sp.destroy();
    this.flying = [];
  }

  /** Matching piles wait for someone to call them, and a call gets a beat before the next flip. */
  canFlip(now) {
    return !this.rules.match && now >= this.holdUntil;
  }

  /** The opening flip ends the countdown: it gets the fourth circle. */
  stuckKind(r) {
    return r.top(0) || r.top(1) ? 'info' : 'go';
  }

  stuckText(r) {
    if (!r.stocks[0].length && !r.stocks[1].length) return 'No moves: reshuffling';
    return r.top(0) || r.top(1) ? 'No moves: flipping' : 'Flip!';
  }

  statusText() {
    return ''; // said by the caption under the middle piles instead
  }

  finish() {
    this.callBtn.classList.remove('show');
    this.tipEl.classList.remove('show');
    super.finish();
  }

  hide() {
    this.callBtn.classList.remove('show');
    this.tipEl.classList.remove('show');
    super.hide();
  }
}
