// The devboard's Sounds tab: the two synths, the DL-106 (synth.js, polyphonic)
// and the DL-20 (ms20.js, monophonic), sharing one front panel and keyboard
// (click a model name to switch), and under it the sound bank (library.js) as buttons.
//
// Play the synth with the mouse or the computer keyboard (A W S E D F T G Y H U
// J K O L P ; = a bit over an octave, Z / X = octave down / up): chords in
// Poly, one note at a time in Mono and Unison. Every sound in
// the bank is a set of layers, each on one of the two synths: "Edit" loads a layer's
// patch onto the panel (switching to its synth), so it can be played and tweaked, and "Copy patch" puts the
// panel's settings on the clipboard as JSON (paste it into library.js).
import { DEFAULT_PATCH, makePatch, Synth, playSound, getAnalyser, setMasterVolume, audio } from './synth.js';
import { MS20_DEFAULT, Ms20 } from './ms20.js';
import { SOUNDS, GROUPS } from './library.js';

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const get = (o, path) => path.split('.').reduce((a, k) => a[k], o);
const put = (o, path, v) => {
  const ks = path.split('.');
  const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
};

// Slider scales: the slider runs 0..1, these map it to the parameter and back.
const SCALES = {
  lin: (min, max) => [(x) => min + x * (max - min), (v) => (v - min) / (max - min)],
  log: (min, max) => [(x) => min * (max / min) ** x, (v) => Math.log(v / min) / Math.log(max / min)],
  sq: (min, max) => [(x) => min + x * x * (max - min), (v) => Math.sqrt((v - min) / (max - min))],
};
const fmt = {
  hz: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`),
  s: (v) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`),
  pct: (v) => `${Math.round(v * 100)}`,
  ct: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}¢`,
  rate: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)}Hz`,
};

// The front panel, section by section, left to right in the hardware's order;
// the last three are the extras the hardware doesn't have.
const ON_OFF = [[true, 'On'], [false, 'Off']];
const SECTIONS = [
  { title: 'LFO', color: 'blue', controls: [
    { path: 'lfo.rate', label: 'Rate', scale: ['log', 0.1, 30], fmt: fmt.rate },
    { path: 'lfo.delay', label: 'Delay', scale: ['sq', 0, 3], fmt: fmt.s },
  ] },
  { title: 'DCO', color: 'yellow', controls: [
    { path: 'dco.range', label: 'Range', choices: [[-1, "16'"], [0, "8'"], [1, "4'"]] },
    { path: 'dco.lfo', label: 'LFO', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'dco.pwm', label: 'PWM', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'dco.pwmMode', label: 'PWM by', choices: [['lfo', 'LFO'], ['man', 'Man']] },
    { path: 'dco.pulse', label: 'Pulse ⊓', choices: ON_OFF },
    { path: 'dco.saw', label: 'Saw ◿', choices: ON_OFF },
    { path: 'dco.sub', label: 'Sub', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'dco.noise', label: 'Noise', scale: ['lin', 0, 1], fmt: fmt.pct },
  ] },
  { title: 'HPF', color: 'green', controls: [
    { path: 'hpf', label: 'Freq', choices: [[3, '3'], [2, '2'], [1, '1'], [0, '0']] },
  ] },
  { title: 'VCF', color: 'red', controls: [
    { path: 'vcf.freq', label: 'Freq', scale: ['log', 30, 16000], fmt: fmt.hz },
    { path: 'vcf.res', label: 'Res', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'vcf.pol', label: 'Env', choices: [[1, '+'], [-1, '−']] },
    { path: 'vcf.env', label: 'Env', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'vcf.lfo', label: 'LFO', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'vcf.kybd', label: 'Kybd', scale: ['lin', 0, 1], fmt: fmt.pct },
  ] },
  { title: 'VCA', color: 'blue', controls: [
    { path: 'vca.mode', label: 'Mode', choices: [['env', 'Env'], ['gate', 'Gate']] },
    { path: 'vca.level', label: 'Level', scale: ['lin', 0, 1], fmt: fmt.pct },
  ] },
  { title: 'Env', color: 'yellow', controls: [
    { path: 'env.a', label: 'A', scale: ['log', 0.001, 3], fmt: fmt.s },
    { path: 'env.d', label: 'D', scale: ['log', 0.002, 12], fmt: fmt.s },
    { path: 'env.s', label: 'S', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'env.r', label: 'R', scale: ['log', 0.002, 12], fmt: fmt.s },
  ] },
  { title: 'Chorus', color: 'green', controls: [
    { path: 'chorus', label: 'Mode', choices: [[0, 'Off'], [1, 'I'], [2, 'II']] },
  ] },
  { title: 'Assign', color: 'red', controls: [
    { path: 'assign.mode', label: 'Voices', choices: [['poly', 'Poly'], ['mono', 'Mono'], ['unison', 'Unison']] },
    { path: 'assign.porta', label: 'Porta', scale: ['sq', 0, 2], fmt: fmt.s },
  ] },
  { title: 'Sweep', color: 'blue', controls: [
    { path: 'sweep.amt', label: 'Amount', scale: ['lin', -4800, 4800], fmt: fmt.ct },
    { path: 'sweep.time', label: 'Time', scale: ['log', 0.01, 1.5], fmt: fmt.s },
  ] },
  { title: 'Delay', color: 'yellow', controls: [
    { path: 'delay.mix', label: 'Mix', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'delay.time', label: 'Time', scale: ['log', 0.03, 1.2], fmt: fmt.s },
    { path: 'delay.fb', label: 'Fdbk', scale: ['lin', 0, 0.9], fmt: fmt.pct },
  ] },
  { title: 'Reverb', color: 'green', controls: [
    { path: 'reverb.mix', label: 'Mix', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'reverb.size', label: 'Size', scale: ['log', 0.5, 5.5], fmt: fmt.s },
  ] },
];

// The DL-20's panel, in the hardware's order: oscillators, mixer, pitch,
// modulation generator, the two filters, the two envelopes.
const OCT = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}oct`;
const SEMI = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}st`;
const FILTER = (k) => [
  { path: `${k}.peak`, label: 'Peak', scale: ['lin', 0, 1], fmt: fmt.pct },
  { path: `${k}.eg2`, label: 'EG 2', scale: ['lin', -5, 5], fmt: OCT },
  { path: `${k}.mg`, label: 'MG', scale: ['lin', 0, 3], fmt: OCT },
  { path: `${k}.kbd`, label: 'Kbd', scale: ['lin', 0, 1], fmt: fmt.pct },
];
const SECTIONS_20 = [
  { title: 'VCO 1', color: 'yellow', controls: [
    { path: 'vco1.wave', label: 'Wave', choices: [['tri', '△'], ['saw', '◿'], ['pulse', '⊓'], ['noise', 'Noise']] },
    { path: 'vco1.range', label: 'Scale', choices: [[-2, "32'"], [-1, "16'"], [0, "8'"], [1, "4'"]] },
    { path: 'vco1.pw', label: 'PW', scale: ['lin', 0.05, 0.95], fmt: fmt.pct },
  ] },
  { title: 'VCO 2', color: 'yellow', controls: [
    { path: 'vco2.wave', label: 'Wave', choices: [['saw', '◿'], ['square', '⊓'], ['pulse', 'Thin'], ['ring', 'Ring']] },
    { path: 'vco2.range', label: 'Scale', choices: [[-1, "16'"], [0, "8'"], [1, "4'"], [2, "2'"]] },
    { path: 'vco2.pitch', label: 'Pitch', scale: ['lin', -24, 24], fmt: SEMI },
  ] },
  { title: 'Mixer', color: 'green', controls: [
    { path: 'mix.vco1', label: 'VCO 1', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'mix.vco2', label: 'VCO 2', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'mix.noise', label: 'Noise', scale: ['lin', 0, 1], fmt: fmt.pct },
  ] },
  { title: 'Pitch', color: 'blue', controls: [
    { path: 'porta', label: 'Porta', scale: ['sq', 0, 2], fmt: fmt.s },
    { path: 'fm.mg', label: 'MG', scale: ['lin', 0, 12], fmt: SEMI },
    { path: 'fm.eg1', label: 'EG 1', scale: ['lin', -24, 24], fmt: SEMI },
    { path: 'fm.eg2', label: 'EG 2', scale: ['lin', -24, 24], fmt: SEMI },
  ] },
  { title: 'MG', color: 'blue', controls: [
    { path: 'mg.rate', label: 'Rate', scale: ['log', 0.1, 30], fmt: fmt.rate },
    { path: 'mg.wave', label: 'Wave', choices: [['tri', '△'], ['saw', '◺'], ['square', '⊓']] },
  ] },
  { title: 'HPF', color: 'red', controls: [{ path: 'hpf.freq', label: 'Freq', scale: ['log', 8, 8000], fmt: fmt.hz }, ...FILTER('hpf')] },
  { title: 'LPF', color: 'red', controls: [{ path: 'lpf.freq', label: 'Freq', scale: ['log', 30, 16000], fmt: fmt.hz }, ...FILTER('lpf')] },
  { title: 'EG 1', color: 'yellow', controls: [
    { path: 'eg1.delay', label: 'Delay', scale: ['sq', 0, 2], fmt: fmt.s },
    { path: 'eg1.a', label: 'A', scale: ['log', 0.001, 3], fmt: fmt.s },
    { path: 'eg1.r', label: 'R', scale: ['log', 0.002, 6], fmt: fmt.s },
  ] },
  { title: 'EG 2', color: 'yellow', controls: [
    { path: 'eg2.hold', label: 'Hold', scale: ['sq', 0, 2], fmt: fmt.s },
    { path: 'eg2.a', label: 'A', scale: ['log', 0.001, 3], fmt: fmt.s },
    { path: 'eg2.d', label: 'D', scale: ['log', 0.002, 6], fmt: fmt.s },
    { path: 'eg2.s', label: 'S', scale: ['lin', 0, 1], fmt: fmt.pct },
    { path: 'eg2.r', label: 'R', scale: ['log', 0.002, 6], fmt: fmt.s },
  ] },
  { title: 'VCA', color: 'green', controls: [{ path: 'vca.level', label: 'Level', scale: ['lin', 0, 1], fmt: fmt.pct }] },
  { title: 'Reverb', color: 'green', controls: [{ path: 'reverb.mix', label: 'Mix', scale: ['lin', 0, 1], fmt: fmt.pct }] },
];

/** The two instruments the panel can show. */
const MACHINES = {
  dl106: { model: 'DL-106', kind: 'Polyphonic synthesizer · 6 voices', base: DEFAULT_PATCH, sections: SECTIONS, live: (p) => new Synth(p, { live: true }) },
  dl20: { model: 'DL-20', kind: 'Monophonic synthesizer · 2 VCO · 2 VCF', base: MS20_DEFAULT, sections: SECTIONS_20, live: (p) => new Ms20(p) },
};

const KEYMAP = 'awsedftgyhujkolp;'; // C up to E an octave higher
const FIRST = 41; // F2: the keyboard runs F2..C5 (32 keys)
const LAST = FIRST + 31;
const BLACK = new Set([1, 3, 6, 8, 10]);

export function initSounds(root) {
  let machine = MACHINES.dl106;
  let patch = makePatch();
  let voice = null; // the live synth under the keyboard, made on first use (audio needs a gesture)
  let octave = 0; // computer keyboard octave shift
  let editing = null; // { sound, layer } loaded onto the panel
  const keysDown = new Map(); // computer key -> midi

  const live = () => (voice ||= machine.live(patch));
  const refresh = () => voice?.apply(patch);

  root.classList.add('snd');
  const wrap = h('div', 'snd-wrap');
  root.append(wrap);

  // ------------------------------------------------------------ synth body
  const synth = h('section', 'snd-synth');
  wrap.append(synth);

  const top = h('div', 'snd-top');
  const brand = h('div', 'snd-brand');
  // The model name is the switch between the two instruments.
  const kind = h('span', 'snd-kind', machine.kind);
  const models = Object.entries(MACHINES).map(([key, m]) => {
    const b = h('button', 'snd-model', m.model);
    b.type = 'button';
    b.title = m.kind;
    b.addEventListener('click', () => {
      if (machine === m) return;
      setMachine(key);
      editing = null;
      status.textContent = 'Init patch';
      markEditing();
    });
    brand.append(b);
    return [m, b];
  });
  brand.append(kind);
  const scope = h('canvas', 'snd-scope');
  scope.width = 360;
  scope.height = 64;
  const tools = h('div', 'snd-tools');
  const status = h('div', 'snd-status', 'Init patch');
  const initBtn = h('button', 'snd-tool', 'Init');
  initBtn.type = 'button';
  initBtn.title = 'Back to the default patch';
  const copyBtn = h('button', 'snd-tool', 'Copy patch');
  copyBtn.type = 'button';
  copyBtn.title = 'Copy the panel as JSON (only what differs from the default)';
  const volume = h('label', 'snd-volume');
  volume.append(h('span', '', 'Volume'));
  const volIn = h('input');
  volIn.type = 'range';
  volIn.min = '0';
  volIn.max = '1';
  volIn.step = '0.01';
  volIn.value = '0.8';
  volIn.addEventListener('input', () => setMasterVolume(Number(volIn.value)));
  volume.append(volIn);
  tools.append(status, initBtn, copyBtn, volume);
  top.append(brand, scope, tools);
  synth.append(top);

  const panel = h('div', 'snd-panel');
  synth.append(panel);
  const controls = []; // { c, sync() }
  /** Switches the panel to the other instrument (with `over` as its patch, or its init patch). */
  function setMachine(key, over) {
    voice?.allOff();
    voice?.dispose?.();
    voice = null;
    machine = MACHINES[key];
    patch = makePatch(over, machine.base);
    kind.textContent = machine.kind;
    for (const [m, b] of models) b.setAttribute('aria-pressed', String(m === machine));
    buildPanel();
    syncAll();
  }
  function buildPanel() {
    panel.replaceChildren();
    controls.length = 0;
  for (const sec of machine.sections) {
    const s = h('div', `snd-sec c-${sec.color}`);
    s.append(h('div', 'snd-sec-title', sec.title));
    const row = h('div', 'snd-row');
    for (const c of sec.controls) {
      if (c.choices) {
        const box = h('div', 'snd-choice');
        box.append(h('div', 'snd-label', c.label));
        const btns = c.choices.map(([v, text]) => {
          const b = h('button', '', text);
          b.type = 'button';
          b.addEventListener('click', () => {
            put(patch, c.path, v);
            refresh();
            sync();
          });
          box.append(b);
          return [v, b];
        });
        const sync = () => {
          for (const [v, b] of btns) b.setAttribute('aria-pressed', String(get(patch, c.path) === v));
        };
        controls.push({ sync });
        row.append(box);
      } else {
        const [kind, min, max] = c.scale;
        const [to, from] = SCALES[kind](min, max);
        const box = h('label', 'snd-slider');
        const val = h('div', 'snd-val');
        const input = h('input');
        input.type = 'range';
        input.min = '0';
        input.max = '1';
        input.step = '0.001';
        input.addEventListener('input', () => {
          put(patch, c.path, to(Number(input.value)));
          val.textContent = c.fmt(get(patch, c.path));
          refresh();
        });
        // Double-click resets to the default.
        input.addEventListener('dblclick', () => {
          put(patch, c.path, get(machine.base, c.path));
          sync();
          refresh();
        });
        const sync = () => {
          const v = get(patch, c.path);
          input.value = String(Math.min(1, Math.max(0, from(v))));
          val.textContent = c.fmt(v);
        };
        controls.push({ sync });
        box.append(val, input, h('div', 'snd-label', c.label));
        row.append(box);
      }
    }
    s.append(row);
    panel.append(s);
  }
  }
  for (const [m, b] of models) b.setAttribute('aria-pressed', String(m === machine));
  buildPanel();
  const syncAll = () => controls.forEach((c) => c.sync());

  initBtn.addEventListener('click', () => {
    patch = makePatch({}, machine.base);
    editing = null;
    status.textContent = 'Init patch';
    syncAll();
    refresh();
    markEditing();
  });
  copyBtn.addEventListener('click', async () => {
    const json = JSON.stringify(diff(patch, machine.base));
    try {
      await navigator.clipboard.writeText(json);
      flash(copyBtn, 'Copied');
    } catch {
      console.log(json);
      flash(copyBtn, 'See console');
    }
  });

  // ------------------------------------------------------------ keyboard
  const kbWrap = h('div', 'snd-kbwrap');
  const kbInfo = h('div', 'snd-kbinfo');
  const octDown = h('button', 'snd-tool', '−');
  const octUp = h('button', 'snd-tool', '+');
  const octLabel = h('span', 'snd-oct');
  for (const b of [octDown, octUp]) b.type = 'button';
  octDown.title = 'Octave down (Z)';
  octUp.title = 'Octave up (X)';
  const setOct = (o) => {
    octave = Math.max(-2, Math.min(2, o));
    octLabel.textContent = `Oct ${octave > 0 ? '+' : ''}${octave}`;
  };
  octDown.addEventListener('click', () => setOct(octave - 1));
  octUp.addEventListener('click', () => setOct(octave + 1));
  setOct(0);
  kbInfo.append(octDown, octLabel, octUp, h('span', 'snd-hint', 'Mouse, or keys A W S E D F T G Y H U J K · Z / X octave'));
  const kb = h('div', 'snd-kb');
  const keyEls = new Map();
  let whiteIndex = 0;
  for (let m = FIRST; m <= LAST; m++) {
    const black = BLACK.has(m % 12);
    const k = h('div', black ? 'snd-key black' : 'snd-key white');
    k.dataset.midi = String(m);
    if (black) k.style.left = `calc(var(--kw) * ${whiteIndex} - var(--bw) / 2)`;
    else whiteIndex++;
    keyEls.set(m, k);
    kb.append(k);
  }
  kb.style.setProperty('--whites', String(whiteIndex));
  kbWrap.append(kbInfo, kb);
  synth.append(kbWrap);

  const press = (m, on) => keyEls.get(m)?.classList.toggle('down', on);
  let mouseKey = null;
  const keyAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.snd-key');
    return el ? Number(el.dataset.midi) : null;
  };
  kb.addEventListener('pointerdown', (e) => {
    const m = keyAt(e);
    if (m == null) return;
    kb.setPointerCapture(e.pointerId);
    mouseKey = m;
    live().keyDown(m);
    press(m, true);
  });
  kb.addEventListener('pointermove', (e) => {
    if (mouseKey == null) return;
    const m = keyAt(e);
    if (m == null || m === mouseKey) return;
    // Sliding across keys plays legato (and glides, with portamento on).
    live().keyDown(m);
    voice.keyUp(mouseKey);
    press(mouseKey, false);
    press(m, true);
    mouseKey = m;
  });
  const release = () => {
    if (mouseKey == null) return;
    voice?.keyUp(mouseKey);
    press(mouseKey, false);
    mouseKey = null;
  };
  kb.addEventListener('pointerup', release);
  kb.addEventListener('pointercancel', release);

  // ------------------------------------------------------------ sound bank
  const bank = h('section', 'snd-bank');
  wrap.append(bank);
  const tiles = new Map();
  for (const g of GROUPS) {
    const sec = h('div', 'snd-group');
    const head = h('div', 'snd-group-head');
    head.append(h('h2', '', g.name), h('span', '', g.note));
    const grid = h('div', 'snd-grid');
    for (const s of SOUNDS.filter((x) => x.group === g.id)) {
      const tile = h('div', 'snd-tile');
      const playBtn = h('button', 'snd-play');
      playBtn.type = 'button';
      playBtn.append(h('span', 'snd-tile-name', s.name), h('span', 'snd-tile-hint', s.hint));
      playBtn.addEventListener('click', () => trigger(s, tile));
      const edit = h('button', 'snd-edit', 'Edit');
      edit.type = 'button';
      edit.title = 'Load onto the synth (click again for the next layer)';
      edit.addEventListener('click', () => load(s));
      tile.append(playBtn, edit);
      grid.append(tile);
      tiles.set(s.id, tile);
    }
    sec.append(head, grid);
    bank.append(sec);
  }

  function trigger(s, tile) {
    const secs = playSound(s);
    tile.classList.remove('playing');
    void tile.offsetWidth;
    tile.style.setProperty('--dur', `${Math.max(0.15, secs)}s`);
    tile.classList.add('playing');
  }

  /** Loads a sound's layer onto the panel; pressing Edit again steps through its layers. */
  function load(s) {
    const layers = s.make();
    const i = editing?.sound === s ? (editing.layer + 1) % layers.length : 0;
    editing = { sound: s, layer: i };
    const key = layers[i].synth === 'ms20' ? 'dl20' : 'dl106';
    if (MACHINES[key] === machine) {
      patch = makePatch(layers[i].patch, machine.base);
      syncAll();
      refresh();
    } else setMachine(key, layers[i].patch);
    status.textContent = `${s.name} · layer ${i + 1}/${layers.length} · ${machine.model}`;
    markEditing();
    synth.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function markEditing() {
    for (const [id, t] of tiles) t.classList.toggle('editing', editing?.sound.id === id);
  }

  // ------------------------------------------------------------ scope
  let raf = 0;
  const g = scope.getContext('2d');
  let data = null;
  function draw() {
    raf = requestAnimationFrame(draw);
    const { width: w, height: hh } = scope;
    g.clearRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.beginPath();
    g.moveTo(0, hh / 2);
    g.lineTo(w, hh / 2);
    g.stroke();
    if (!active) return;
    const an = getAnalyser();
    data ||= new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(data);
    // Start at a rising zero crossing so the wave stands still.
    let s0 = 0;
    for (let i = 1; i < data.length / 2; i++) {
      if (data[i - 1] < 0 && data[i] >= 0) {
        s0 = i;
        break;
      }
    }
    g.strokeStyle = '#5fd4a0';
    g.lineWidth = 1.5;
    g.beginPath();
    const n = 700;
    for (let i = 0; i < n; i++) {
      const y = hh / 2 - data[s0 + i] * hh * 0.45;
      const x = (i / n) * w;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
  let active = false; // the scope only reads the analyser once audio exists
  root.addEventListener('pointerdown', () => {
    if (!active) {
      audio();
      active = true;
    }
  }, true);

  syncAll();

  // ------------------------------------------------------------ keys
  return {
    show() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    },
    hide() {
      cancelAnimationFrame(raf);
      voice?.allOff();
      keyEls.forEach((k) => k.classList.remove('down'));
      keysDown.clear();
    },
    keydown(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.target instanceof Element && e.target.closest('input:not([type=range]), textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'z') return setOct(octave - 1);
      if (k === 'x') return setOct(octave + 1);
      const i = KEYMAP.indexOf(k);
      if (i < 0 || keysDown.has(k)) return;
      e.preventDefault();
      if (!active) {
        audio();
        active = true;
      }
      const m = 60 + octave * 12 + i;
      keysDown.set(k, m);
      live().keyDown(m);
      press(m, true);
    },
    keyup(e) {
      const k = e.key.toLowerCase();
      const m = keysDown.get(k);
      if (m == null) return;
      keysDown.delete(k);
      voice?.keyUp(m);
      press(m, false);
    },
  };
}

/** Only what differs from the default patch (what library.js wants). */
function diff(p, base) {
  const out = {};
  for (const k of Object.keys(base)) {
    if (base[k] && typeof base[k] === 'object') {
      const d = {};
      for (const kk of Object.keys(base[k])) if (round(p[k][kk]) !== base[k][kk]) d[kk] = round(p[k][kk]);
      if (Object.keys(d).length) out[k] = d;
    } else if (round(p[k]) !== base[k]) out[k] = round(p[k]);
  }
  return out;
}
const round = (v) => (typeof v === 'number' ? Number(v.toPrecision(3)) : v);

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1200);
}
