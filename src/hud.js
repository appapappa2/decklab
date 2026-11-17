// One HUD for every game, built from what each scene already prints:
//
//   top left      the opponents: a round avatar per seat with its line of detail
//   top right     the … menu (gamemenu.js)
//   bottom right  your "You" avatar, just above your hand
//   beside it     every line of information (whose turn, scores, hints, your own
//                 counts) as pills that slide out of the avatar to the left
//
// The scenes keep writing plain text into their own elements. This module only
// re-homes those elements (labels into the top bar, status and hints into the
// pill row) and marks them up for the CSS: the circles are drawn from
// data-av / data-av-rest, so nothing here fights with a scene's updates.

const NAMES = '.rm-name, .war-name, .c8-cpu-count, .gf-label, .bj-dealer-label';
const SEATS = '.rm-label, .war-label';
const HINTS = '.rm-hint, .gf-hint, .sj-hint:not(.top), .gn-dw';
const PARSE = /^(You|CPU(?: \d)?|Dealer|Player \d)(?![\w’'])[\s·●]*([\s\S]*)$/;

const el = (cls) => {
  const e = document.createElement('div');
  e.className = cls;
  return e;
};

/** Mark a name up as an avatar. Returns what it parsed, or null if it isn't a name. */
function decorate(name, solo) {
  const m = PARSE.exec(name.textContent.trim());
  const set = (k, v) => {
    if (v == null) delete name.dataset[k];
    else if (name.dataset[k] !== v) name.dataset[k] = v;
  };
  if (!m) {
    for (const k of ['av', 'avRest', 'avMe', 'avLong']) set(k, null);
    return null;
  }
  // A lone opponent is just "CPU": the number only matters when there are several.
  const label = m[1].replace(/^Player (\d)$/, 'P$1').replace(/^CPU \d$/, (t) => (solo ? 'CPU' : t));
  const rest = m[2].trim();
  set('av', label);
  set('avRest', rest || null);
  set('avMe', m[1] === 'You' ? '' : null);
  set('avLong', label.length > 5 ? '2' : label.length > 3 ? '1' : null);
  return { me: m[1] === 'You', rest };
}

export function initHud(screenEl) {
  const huds = new WeakMap(); // scene -> { opps, pills, you, mine }
  const shown = new WeakMap(); // pill -> the text it last slid out with (digits ignored)

  function build(scene) {
    const top = scene.querySelector('.game-top');
    if (!top) return null;
    const opps = el('hud-opps');
    top.prepend(opps);
    const me = el('hud-me');
    const pills = el('hud-pills');
    const you = el('hud-you');
    you.dataset.av = 'You';
    you.dataset.avMe = '';
    const mine = el('hud-pill hud-mine');
    me.append(you, pills);
    // Closest to the avatar first: the status line, your own counts, then hints.
    for (const child of [...top.children]) {
      if (child === opps || child.matches('.game-icon, .game-title')) continue;
      child.classList.add('hud-pill');
      pills.append(child);
    }
    pills.append(mine);
    scene.append(me);
    scene.classList.add('hud');
    const hud = { opps, pills, you, mine };
    huds.set(scene, hud);
    return hud;
  }

  /** A pill whose words changed slides out of the avatar again (a ticking number doesn't). */
  function slide(pill) {
    const key = pill.textContent.replace(/\d+/g, '#').trim();
    if (shown.get(pill) === key) return;
    shown.set(pill, key);
    if (!key) return;
    pill.classList.remove('hud-out');
    void pill.offsetWidth;
    pill.classList.add('hud-out');
  }

  function sync(scene) {
    const hud = huds.get(scene) ?? build(scene);
    if (!hud) return;
    for (const hint of scene.querySelectorAll(HINTS)) {
      if (hint.parentElement === hud.pills) continue;
      hint.classList.add('hud-pill');
      hud.pills.append(hint);
    }
    const own = []; // what your own label(s) say about you
    let seats = false; // pass-and-play: the seats are "Player 1…", nobody is "You"
    const names = [...scene.querySelectorAll(NAMES)].filter((n) => n !== hud.you);
    const solo = names.filter((n) => /^CPU \d/.test(n.textContent.trim()) && (n.closest(SEATS) ?? n).style.display !== 'none').length === 1;
    for (const name of names) {
      const who = decorate(name, solo);
      if (!who) continue;
      const seat = name.closest(SEATS) ?? name;
      if (/^P\d$/.test(name.dataset.av)) seats = true;
      if (who.me) {
        // Your own label: its circle is the shared one, its detail becomes a pill.
        seat.classList.add('hud-gone');
        for (const part of [who.rest, ...[...seat.children].filter((c) => c !== name).map((c) => c.textContent.trim())]) {
          if (part && !own.includes(part)) own.push(part);
        }
      } else {
        seat.classList.remove('hud-gone');
        if (seat.parentElement !== hud.opps) hud.opps.append(seat);
      }
    }
    let mine = own.join(' · ');
    if (/^\d+$/.test(mine)) mine += ' pts';
    if (hud.mine.textContent !== mine) hud.mine.textContent = mine;
    scene.classList.toggle('hud-seats', seats);
    for (const pill of hud.pills.children) slide(pill);
  }

  const flush = () => {
    for (const scene of screenEl.querySelectorAll('.game-scene')) sync(scene);
  };
  // Mutations arrive batched, so this runs once per burst of changes; its own
  // attribute and class writes are not observed.
  new MutationObserver(flush).observe(screenEl, { childList: true, subtree: true, characterData: true });
  // Whose turn it is lives in a class on the (now hidden) label: mirror it as a ring on "You".
  setInterval(() => {
    const scene = screenEl.querySelector('.game-scene.active');
    const hud = scene && huds.get(scene);
    if (!hud) return;
    hud.you.classList.toggle('on', scene.classList.contains('my-turn') || !!scene.querySelector('.hud-gone.active, .hud-pill.mine'));
    // Draw piles are drawn at different scales; their count captions shouldn't be (style.css divides by --ps).
    for (const pile of scene.querySelectorAll('.deck-pile')) {
      const ps = /scale\(([\d.]+)\)/.exec(pile.style.transform)?.[1] ?? '1';
      if (pile.style.getPropertyValue('--ps') !== ps) pile.style.setProperty('--ps', ps);
    }
  }, 250);
  flush();
}
