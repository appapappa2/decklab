// The VFX/Animations board: the panel beside the phone in the devboard's
// VFX/Animations tab. That phone is this page embedded (devboard.js), so the
// board drives the embedded page's effects and, on Save, the real game's too.
//
// Overview: every effect, in three groups (what the games trigger themselves,
// bigger moments nothing triggers yet, and your own). The play button runs
// one; its name opens it in the editor.
//
// Editor: an effect is a stack of layers (fx-presets.js), so here you rename
// it, add, remove and reorder layers, change what each layer is, and tune its
// settings; every change replays the effect on the phone. Save writes all
// effects to src/fx-presets.json through the dev server (serve.py), which is
// what the app loads at startup, so a saved change is in the code. If the
// server can't take it (an older serve.py still running, or another server),
// the effects are kept in this browser instead and the board says so.
import { DEFAULTS, MODULES, makeLayer, mergePresets, loadPresets, PRESETS_FILE as FILE, PRESETS_LOCAL_KEY as LOCAL_KEY } from './fx-presets.js?v=fourcolor';

const GROUPS = [
  ['game', 'In the games now'],
  ['moment', 'Moments'],
  ['custom', 'Yours'],
];

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const button = (cls, text, onClick, label) => {
  const b = h('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * `fx` plays the previews (the embedded table's). `also` are other fx instances
 * that should pick up saved effects right away (the Game tab's).
 */
export function initFxBoard(stage, fx, { also = [] } = {}) {
  const apply = () => {
    for (const target of [fx, ...also]) target?.setPresets(presets);
  };
  let presets = mergePresets(null);
  let draft = null; // the effect being edited (a copy; nothing changes until Save)
  let note = '';
  let replay = 0;

  const board = h('aside');
  board.id = 'fx-board';
  board.setAttribute('aria-label', 'VFX and animations');
  // Presses here are for the board, not for the game under the pointer.
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup']) board.addEventListener(type, (e) => e.stopPropagation());
  stage.append(board);

  // ------------------------------------------------------------- storage

  async function load() {
    const loaded = await loadPresets();
    presets = loaded.presets;
    if (loaded.local) note = 'Using effects saved in this browser.';
    apply();
    render();
  }

  async function persist() {
    apply();
    const body = JSON.stringify(presets.map(({ id, name, layers }) => ({ id, name, layers })), null, 2);
    try {
      const res = await fetch(FILE, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error(String(res.status));
      localStorage.removeItem(LOCAL_KEY);
      note = `Saved to ${FILE}`;
    } catch {
      localStorage.setItem(LOCAL_KEY, body);
      note = 'Saved in this browser only. Restart serve.py to save into the code.';
    }
  }

  // ------------------------------------------------------------ overview

  function renderOverview() {
    board.append(h('div', 'fxb-title', 'VFX/Animations'));
    for (const [group, title] of GROUPS) {
      const items = presets.filter((p) => p.group === group);
      if (!items.length) continue;
      board.append(h('div', 'fxb-group', title));
      for (const p of items) {
        const row = h('div', 'fxb-row');
        row.append(
          button('fxb-btn', p.name, () => edit(p), `Edit ${p.name}`),
          button('fxb-play', '▶', () => fx.play(p.id), `Play ${p.name}`),
        );
        board.append(row);
      }
    }
    board.append(button('fxb-btn fxb-new', '+ New effect', () => {
      let n = 1;
      while (presets.some((p) => p.id === `custom-${n}`)) n++;
      edit({ id: `custom-${n}`, name: 'New effect', group: 'custom', layers: [makeLayer('burst')] });
    }));
    if (note) board.append(h('div', 'fxb-note', note));
  }

  // -------------------------------------------------------------- editor

  function edit(preset) {
    draft = clone(preset);
    render();
    preview(0);
  }

  /** Replays the draft, shortly after the last change. */
  function preview(wait = 300) {
    clearTimeout(replay);
    replay = setTimeout(() => draft && fx.run(draft.layers), wait);
  }

  function control(layer, p) {
    const row = h('label', `fxb-field fxb-${p.type}`);
    const name = h('span', 'fxb-field-name', p.label);
    if (p.type === 'range') {
      const value = h('span', 'fxb-field-value', String(layer[p.key]));
      const input = h('input');
      input.type = 'range';
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step);
      input.value = String(layer[p.key]);
      input.addEventListener('input', () => {
        layer[p.key] = Number(input.value);
        value.textContent = input.value;
        preview();
      });
      row.append(name, value, input);
    } else if (p.type === 'bool') {
      const input = h('input');
      input.type = 'checkbox';
      input.checked = !!layer[p.key];
      input.addEventListener('change', () => {
        layer[p.key] = input.checked;
        preview();
      });
      row.append(name, input);
    } else if (p.type === 'choice') {
      const input = h('select');
      for (const o of p.options) input.append(new Option(o, o, false, o === layer[p.key]));
      input.addEventListener('change', () => {
        layer[p.key] = input.value;
        preview();
      });
      row.append(name, input);
    } else {
      const input = h('input');
      input.type = 'text';
      input.value = layer[p.key];
      input.addEventListener('input', () => {
        layer[p.key] = input.value;
        preview(500);
      });
      row.append(name, input);
    }
    return row;
  }

  function renderLayer(layer, i) {
    const card = h('div', 'fxb-layer');
    const head = h('div', 'fxb-layer-head');
    const type = h('select', 'fxb-type');
    type.setAttribute('aria-label', 'What this layer is');
    for (const [key, m] of Object.entries(MODULES)) type.append(new Option(m.label, key, false, key === layer.type));
    type.addEventListener('change', () => {
      draft.layers[i] = makeLayer(type.value, { delay: layer.delay });
      render();
      preview();
    });
    const move = (by) => () => {
      const j = i + by;
      if (j < 0 || j >= draft.layers.length) return;
      [draft.layers[i], draft.layers[j]] = [draft.layers[j], draft.layers[i]];
      render();
    };
    head.append(
      type,
      button('fxb-mini', '↑', move(-1), 'Move up'),
      button('fxb-mini', '↓', move(1), 'Move down'),
      button('fxb-mini', '✕', () => {
        draft.layers.splice(i, 1);
        render();
        preview();
      }, 'Remove layer'),
    );
    card.append(head, control(layer, { key: 'delay', label: 'Starts after (ms)', type: 'range', min: 0, max: 3000, step: 20 }));
    for (const p of MODULES[layer.type].params) card.append(control(layer, p));
    return card;
  }

  function renderEditor() {
    const isDefault = DEFAULTS.find((d) => d.id === draft.id);
    const head = h('div', 'fxb-edit-head');
    head.append(button('fxb-mini', '‹', () => close(), 'Back to all effects'), h('div', 'fxb-title', 'Edit effect'));
    const name = h('input', 'fxb-name');
    name.type = 'text';
    name.value = draft.name;
    name.setAttribute('aria-label', 'Name');
    name.addEventListener('input', () => (draft.name = name.value));
    board.append(head, name, button('fxb-btn fxb-wide', '▶ Play', () => preview(0)));

    board.append(h('div', 'fxb-group', `Layers · ${draft.layers.length}`));
    draft.layers.forEach((layer, i) => board.append(renderLayer(layer, i)));
    board.append(button('fxb-btn fxb-new', '+ Add layer', () => {
      draft.layers.push(makeLayer('burst'));
      render();
      preview();
    }));

    const actions = h('div', 'fxb-actions');
    actions.append(
      button('fxb-btn fxb-save', 'Save', async () => {
        draft.name = draft.name.trim() || 'Effect';
        const i = presets.findIndex((p) => p.id === draft.id);
        if (i >= 0) presets[i] = draft;
        else presets.push(draft);
        presets = mergePresets(presets);
        await persist();
        close();
      }),
      button('fxb-btn', 'Cancel', () => close()),
    );
    board.append(actions);

    const more = h('div', 'fxb-actions');
    more.append(button('fxb-btn', 'Duplicate', () => {
      let n = 1;
      while (presets.some((p) => p.id === `custom-${n}`)) n++;
      draft = { ...clone(draft), id: `custom-${n}`, name: `${draft.name} copy`, group: 'custom' };
      render();
    }));
    if (isDefault) {
      more.append(button('fxb-btn', 'Reset', () => {
        draft = clone(isDefault);
        render();
        preview(0);
      }));
    } else if (presets.some((p) => p.id === draft.id)) {
      more.append(button('fxb-btn fxb-danger', 'Delete', async () => {
        presets = presets.filter((p) => p.id !== draft.id);
        await persist();
        close();
      }));
    }
    board.append(more);
  }

  function close() {
    clearTimeout(replay);
    draft = null;
    render();
  }

  function render() {
    const scroll = board.scrollTop;
    board.textContent = '';
    board.classList.toggle('editing', !!draft);
    document.body.classList.toggle('fx-editing', !!draft);
    if (draft) renderEditor();
    else renderOverview();
    board.scrollTop = draft ? scroll : 0;
  }

  render();
  load();
  return board;
}
