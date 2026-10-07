// Lab settings: schema, persistence, presets, and the auto-generated panel.

const pct = (v) => `${Math.round(v * 100)}%`;
const x2 = (v) => `${(+v).toFixed(2)}×`;

export const SCHEMA = [
  // Layout
  { group: 'Layout', key: 'layout', label: 'Mode', type: 'select', options: [['fan', 'Fan'], ['line', 'Line'], ['stack', 'Stack']], def: 'fan' },
  { group: 'Layout', key: 'cardScale', label: 'Card size', min: 0.6, max: 1.5, step: 0.01, def: 1, fmt: x2 },
  { group: 'Layout', key: 'maxSpacing', label: 'Max spacing', min: 0.2, max: 1.1, step: 0.01, def: 0.66, unit: ' cw', hint: 'Max distance between card centers, in card widths. Compresses automatically to fit.' },
  { group: 'Layout', key: 'handWidth', label: 'Hand width', min: 0.4, max: 1, step: 0.01, def: 0.94, fmt: pct },
  { group: 'Layout', key: 'handDrop', label: 'Hidden below edge', min: 0, max: 0.6, step: 0.01, def: 0.22, unit: ' ch' },
  { group: 'Layout', key: 'fanRadius', label: 'Fan radius', min: 2, max: 30, step: 0.5, def: 6, unit: ' ch', hint: 'Radius of the arc cards sit on. Smaller = more curve.' },
  { group: 'Layout', key: 'fanTilt', label: 'Fan tilt', min: 0, max: 1.5, step: 0.05, def: 1, fmt: x2, hint: 'Multiplier on card rotation along the arc.' },
  { group: 'Layout', key: 'stackSpacing', label: 'Stack spacing (idle)', min: 0.04, max: 0.4, step: 0.01, def: 0.14, unit: ' cw' },

  // Peek
  { group: 'Peek / scrub', key: 'peekEnabled', label: 'Peek while touching', type: 'bool', def: true },
  { group: 'Peek / scrub', key: 'peekLift', label: 'Peek lift', min: 0, max: 0.8, step: 0.01, def: 0.12, unit: ' ch', hint: 'Extra lift above the fully-visible position.' },
  { group: 'Peek / scrub', key: 'peekScale', label: 'Peek scale', min: 1, max: 1.8, step: 0.01, def: 1.22, fmt: x2 },
  { group: 'Peek / scrub', key: 'peekStraighten', label: 'Straighten peeked card', type: 'bool', def: true },
  { group: 'Peek / scrub', key: 'spread', label: 'Neighbor spread', min: 0, max: 1, step: 0.01, def: 0.3, unit: ' cw' },
  { group: 'Peek / scrub', key: 'falloff', label: 'Neighbor falloff', min: 0, max: 1, step: 0.01, def: 0.5, fmt: x2, hint: 'Spread multiplier per card away from the peeked card.' },
  { group: 'Peek / scrub', key: 'scrubBias', label: 'Pick bias', min: 0, max: 1, step: 0.05, def: 0.6, fmt: pct, hint: '0% = nearest card center, 100% = visible strip of overlapped cards.' },
  { group: 'Peek / scrub', key: 'scrubHysteresis', label: 'Scrub hysteresis', min: 0, max: 0.5, step: 0.01, def: 0.15, fmt: pct },

  // Select
  { group: 'Select', key: 'selectLift', label: 'Selected lift', min: 0, max: 0.6, step: 0.01, def: 0.22, unit: ' ch' },
  { group: 'Select', key: 'multiSelect', label: 'Multi-select', type: 'bool', def: true },
  { group: 'Select', key: 'playButton', label: 'Play button on selected', type: 'bool', def: true, hint: 'Shows a Play button above selected cards. Same result as the play gesture.' },

  // Overflow
  { group: 'Screen overflow', key: 'overflow', label: 'When the hand is too wide', type: 'select', options: [['compress', 'Compress'], ['scroll', 'Overflow + scroll']], def: 'compress', hint: 'Compress squeezes cards to fit. Overflow keeps a minimum spacing and lets the hand run off-screen.' },
  { group: 'Screen overflow', key: 'minSpacing', label: 'Min spacing before overflow', min: 0.15, max: 1, step: 0.01, def: 0.45, unit: ' cw' },
  { group: 'Screen overflow', key: 'scrollMode', label: 'Scroll gesture', type: 'select', options: [['drag', 'Swipe'], ['edge', 'Edge'], ['proportional', 'Proportional']], def: 'drag', hint: 'Swipe: the hand follows your finger. Edge: scrub to a screen edge to auto-scroll. Proportional: the finger position maps across the whole hand. The mouse wheel always scrolls.' },
  { group: 'Screen overflow', key: 'overflowArc', label: 'Fan arc anchored to', type: 'select', options: [['screen', 'Screen'], ['hand', 'Hand']], def: 'screen', hint: 'Screen: cards roll along a fixed arc like a wheel. Hand: the whole fan slides sideways.' },
  { group: 'Screen overflow', key: 'overflowHint', label: 'Hidden cards hint', type: 'select', options: [['none', 'None'], ['fade', 'Fade'], ['count', 'Count'], ['both', 'Both']], def: 'both' },
  { group: 'Screen overflow', key: 'edgeZone', label: 'Edge zone', min: 0.05, max: 0.35, step: 0.01, def: 0.15, fmt: pct, hint: 'Edge mode, and reordering: how close to the edge auto-scroll starts.' },
  { group: 'Screen overflow', key: 'edgeSpeed', label: 'Edge scroll speed', min: 100, max: 2000, step: 50, def: 700, unit: ' px/s' },
  { group: 'Screen overflow', key: 'scrollMomentum', label: 'Swipe momentum', min: 0, max: 0.6, step: 0.01, def: 0.2, unit: ' s', hint: 'How far a fling carries the hand (seconds of release velocity).' },

  // Drag
  { group: 'Drag', key: 'dragThreshold', label: 'Pull-out threshold', min: 4, max: 60, step: 1, def: 12, unit: ' px' },
  { group: 'Drag', key: 'longPress', label: 'Long-press to pick up', min: 0, max: 1000, step: 10, def: 350, fmt: (v) => (v ? `${v} ms` : 'off') },
  { group: 'Drag', key: 'fingerOffset', label: 'Finger offset', min: 0, max: 160, step: 1, def: 56, unit: ' px', hint: 'Card center is held this far above the finger so it stays visible.' },
  { group: 'Drag', key: 'dragScale', label: 'Drag scale', min: 0.8, max: 1.4, step: 0.01, def: 1.08, fmt: x2 },
  { group: 'Drag', key: 'dragTilt', label: 'Velocity tilt', min: -40, max: 40, step: 1, def: 10, unit: '°', hint: 'Degrees per 1000 px/s. Negative flips the direction.' },
  { group: 'Drag', key: 'dragMaxTilt', label: 'Max tilt', min: 0, max: 45, step: 1, def: 22, unit: '°' },
  { group: 'Drag', key: 'reorder', label: 'Drag to reorder', type: 'bool', def: true },

  // Play
  { group: 'Play', key: 'playLine', label: 'Play line', min: 0.15, max: 0.9, step: 0.01, def: 0.6, fmt: pct, hint: 'Release with the card above this fraction of screen height to play.' },
  { group: 'Play', key: 'flickToPlay', label: 'Flick to play', type: 'bool', def: true },
  { group: 'Play', key: 'flickVelocity', label: 'Flick velocity', min: 300, max: 3000, step: 50, def: 1100, unit: ' px/s' },

  // Mouse / pen
  { group: 'Mouse', key: 'hoverPeek', label: 'Hover to peek', type: 'bool', def: true, hint: 'Peek at cards by hovering, no click needed.' },
  { group: 'Mouse', key: 'mouseGrab', label: 'Hold card where grabbed', type: 'bool', def: true, hint: 'Off = use the touch finger offset for the mouse too.' },

  // Motion
  { group: 'Motion', key: 'stiffness', label: 'Spring stiffness', min: 40, max: 1500, step: 10, def: 380 },
  { group: 'Motion', key: 'damping', label: 'Spring damping', min: 0.1, max: 1.5, step: 0.01, def: 0.72, hint: 'Damping ratio. <1 bouncy, 1 critical, >1 sluggish.' },
  { group: 'Motion', key: 'dragStiffness', label: 'Drag stiffness', min: 100, max: 3000, step: 10, def: 1100 },
  { group: 'Motion', key: 'dragDamping', label: 'Drag damping', min: 0.1, max: 1.5, step: 0.01, def: 0.85 },
  { group: 'Motion', key: 'dealStagger', label: 'Deal stagger', min: 0, max: 250, step: 5, def: 70, unit: ' ms' },

  // Feedback
  { group: 'Feedback', key: 'haptics', label: 'Haptics (navigator.vibrate)', type: 'bool', def: true },
  { group: 'Feedback', key: 'debug', label: 'Debug overlay', type: 'bool', def: false },
];

export const DEFAULTS = Object.fromEntries(SCHEMA.map((f) => [f.key, f.def]));

export const PRESETS = {
  'Balatro-ish': {
    layout: 'fan', fanRadius: 9, fanTilt: 0.8, maxSpacing: 0.72, handDrop: 0.1,
    peekScale: 1.12, peekLift: 0.06, spread: 0.12, falloff: 0.4,
    stiffness: 420, damping: 0.55, dragTilt: 16, dragMaxTilt: 30, dragStiffness: 700, dragDamping: 0.55,
  },
  'Hearthstone-ish': {
    layout: 'fan', fanRadius: 4.5, fanTilt: 1, maxSpacing: 0.55, handDrop: 0.38,
    peekScale: 1.5, peekLift: 0.18, spread: 0.45, falloff: 0.55,
    stiffness: 380, damping: 0.8, dragTilt: 8, fingerOffset: 70,
  },
  'Flat & snappy': {
    layout: 'line', maxSpacing: 0.8, handDrop: 0.1, peekScale: 1.1, peekLift: 0.04,
    spread: 0.2, falloff: 0.3, stiffness: 750, damping: 0.95, dragStiffness: 2200, dragDamping: 1, dragTilt: 4,
  },
  'Tight stack': {
    layout: 'stack', stackSpacing: 0.1, maxSpacing: 0.62, handDrop: 0.3, peekScale: 1.3, spread: 0.35,
  },
  'Scrolling hand': {
    overflow: 'scroll', minSpacing: 0.5, scrollMode: 'drag', overflowArc: 'screen', overflowHint: 'both',
    fanRadius: 5, handDrop: 0.2,
  },
};

const FIELDS = Object.fromEntries(SCHEMA.map((f) => [f.key, f]));

/**
 * Copies valid values from `data` (object or JSON string) into `settings`.
 * Unknown keys, wrong types and invalid options are skipped; numbers are
 * clamped to their slider range. Partial objects are fine.
 */
export function importSettings(settings, data) {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      return { error: `Not valid JSON: ${e.message}` };
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Expected a JSON object like {"layout": "fan", ...}' };
  let applied = 0;
  const skipped = [];
  for (const [k, v] of Object.entries(data)) {
    const f = FIELDS[k];
    let ok = false;
    if (!f) ok = false;
    else if (f.type === 'bool') ok = typeof v === 'boolean';
    else if (f.type === 'select') ok = f.options.some(([o]) => o === v);
    else ok = typeof v === 'number' && Number.isFinite(v);
    if (!ok) {
      skipped.push(k);
      continue;
    }
    settings[k] = f.type === 'range' || !f.type ? Math.min(f.max, Math.max(f.min, v)) : v;
    applied++;
  }
  return { applied, skipped };
}

const KEY = 'thedeck-lab:settings:v1';

export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    importSettings(s, localStorage.getItem(KEY) || '{}');
  } catch {
    /* storage unavailable */
  }
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}

// ------------------------------------------------------------------ panel

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

function decimals(step) {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function format(f, v) {
  return f.fmt ? f.fmt(v) : `${(+v).toFixed(decimals(f.step))}${f.unit || ''}`;
}

/**
 * Builds the settings panel into `root`. Mutates `settings` in place and calls
 * onChange(key) after every change. Returns { refresh } to re-sync controls.
 */
export function buildPanel(root, settings, { actions, onChange }) {
  root.textContent = '';
  const syncers = [];
  const refresh = () => syncers.forEach((fn) => fn());

  const section = (title, open = true) => {
    const el = h('details', 'group');
    el.open = open;
    el.append(h('summary', null, title));
    root.append(el);
    return el;
  };

  // Actions
  const act = section('Hand');
  for (const row of actions) {
    const wrap = h('div', 'btns');
    for (const a of row) {
      const b = h('button', 'pill', a.label);
      b.type = 'button';
      b.addEventListener('click', a.fn);
      wrap.append(b);
    }
    act.append(wrap);
  }

  // Presets
  const pre = section('Presets');
  const pwrap = h('div', 'btns');
  for (const [name, preset] of Object.entries(PRESETS)) {
    const b = h('button', 'pill', name);
    b.type = 'button';
    b.addEventListener('click', () => {
      const keep = { haptics: settings.haptics, debug: settings.debug };
      Object.assign(settings, DEFAULTS, preset, keep);
      refresh();
      onChange('*');
    });
    pwrap.append(b);
  }
  const reset = h('button', 'pill danger', 'Reset to defaults');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    Object.assign(settings, DEFAULTS);
    refresh();
    onChange('*');
  });
  pwrap.append(reset);
  pre.append(pwrap);

  // Import / export
  const io = section('Import / export', false);
  const ta = h('textarea', 'io-text');
  ta.rows = 7;
  ta.spellcheck = false;
  ta.autocomplete = 'off';
  ta.placeholder = 'Press Export to get the current settings as JSON, or paste settings here and press Import.';
  const status = h('div', 'io-status');
  const say = (msg, kind = '') => {
    status.textContent = msg;
    status.className = `io-status ${kind}`;
  };
  const exportText = () => {
    ta.value = JSON.stringify(settings, null, 2);
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
  };
  const iobtns = h('div', 'btns');
  const mk = (label, fn) => {
    const b = h('button', 'pill', label);
    b.type = 'button';
    b.addEventListener('click', fn);
    iobtns.append(b);
  };
  mk('Export', () => {
    exportText();
    say('Current settings exported. Select all and copy.');
  });
  mk('Copy', async () => {
    exportText();
    try {
      await navigator.clipboard.writeText(ta.value);
      say('Copied to clipboard.', 'ok');
    } catch {
      // Clipboard API needs a secure context (fails over plain-HTTP LAN).
      const ok = document.execCommand && document.execCommand('copy');
      say(ok ? 'Copied to clipboard.' : 'Select the text and copy it manually.', ok ? 'ok' : '');
    }
  });
  mk('Import', () => {
    const res = importSettings(settings, ta.value);
    if (res.error) {
      say(res.error, 'err');
      return;
    }
    refresh();
    onChange('*');
    const skipped = res.skipped.length ? ` Skipped: ${res.skipped.join(', ')}.` : '';
    say(`Imported ${res.applied} setting${res.applied === 1 ? '' : 's'}.${skipped}`, res.applied ? 'ok' : 'err');
  });
  io.append(ta, iobtns, status);

  // Fields
  let group = null;
  let groupName = '';
  for (const f of SCHEMA) {
    if (f.group !== groupName) {
      groupName = f.group;
      group = section(groupName);
    }
    const row = h('div', 'row');
    if (f.hint) row.title = f.hint;
    const resetField = () => {
      settings[f.key] = DEFAULTS[f.key];
      refresh();
      onChange(f.key);
    };

    if (f.type === 'bool') {
      row.classList.add('inline');
      const lab = h('label', null, f.label);
      lab.addEventListener('dblclick', resetField);
      const sw = h('label', 'switch');
      const inp = h('input');
      inp.type = 'checkbox';
      sw.append(inp, h('span'));
      inp.addEventListener('change', () => {
        settings[f.key] = inp.checked;
        onChange(f.key);
      });
      syncers.push(() => {
        inp.checked = !!settings[f.key];
      });
      row.append(lab, sw);
    } else if (f.type === 'select') {
      const head = h('div', 'row-head');
      const lab = h('label', null, f.label);
      lab.addEventListener('dblclick', resetField);
      head.append(lab);
      const seg = h('div', 'seg');
      const buttons = f.options.map(([value, text]) => {
        const b = h('button', null, text);
        b.type = 'button';
        b.addEventListener('click', () => {
          settings[f.key] = value;
          refresh();
          onChange(f.key);
        });
        seg.append(b);
        return [value, b];
      });
      syncers.push(() => {
        for (const [value, b] of buttons) b.classList.toggle('on', settings[f.key] === value);
      });
      row.append(head, seg);
    } else {
      const head = h('div', 'row-head');
      const lab = h('label', null, f.label);
      const out = h('output');
      head.append(lab, out);
      head.addEventListener('dblclick', resetField);
      const inp = h('input');
      inp.type = 'range';
      inp.min = String(f.min);
      inp.max = String(f.max);
      inp.step = String(f.step);
      const paint = () => {
        const v = settings[f.key];
        out.textContent = format(f, v);
        inp.style.setProperty('--p', `${((v - f.min) / (f.max - f.min)) * 100}%`);
      };
      inp.addEventListener('input', () => {
        settings[f.key] = parseFloat(inp.value);
        paint();
        onChange(f.key);
      });
      syncers.push(() => {
        inp.value = String(settings[f.key]);
        paint();
      });
      row.append(head, inp);
    }
    group.append(row);
  }

  refresh();
  return { refresh };
}
