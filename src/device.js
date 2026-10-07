// Phone frame emulation (desktop) vs. real fullscreen (phone).
// The game only ever receives (width, height, safeArea) through onResize.

const PHONE = { name: 'iPhone 15', w: 393, h: 852, bezel: 14 };
const SAFE = {
  portrait: { top: 59, right: 0, bottom: 34, left: 0 },
  landscape: { top: 0, right: 59, bottom: 21, left: 59 },
};
const ROTATE_MS = 450;

export function detectMode() {
  const q = new URLSearchParams(location.search).get('mode');
  if (q === 'phone' || q === 'desktop') return q;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.screen.width, window.screen.height) < 600;
  return coarse && small ? 'phone' : 'desktop';
}

export function initDevice({ onResize, onRotateStart }) {
  const mode = detectMode();
  const body = document.body;
  body.classList.add(`mode-${mode}`);

  const $ = (id) => document.getElementById(id);
  const fitEl = $('device-fit');
  const scaleEl = $('device-scale');
  const deviceEl = $('device');
  const screenEl = $('screen');
  const panel = $('panel');
  const label = $('device-label');
  const probe = $('safe-probe');

  let landscape = false;
  let rotating = false;
  let scale = 1;

  const updatePanelMode = () => {
    const overlay = mode === 'phone' || window.innerWidth < 820;
    body.classList.toggle('panel-overlay', overlay);
    return overlay;
  };

  const readSafeProbe = () => {
    const cs = getComputedStyle(probe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  };

  const dims = (isL) => (isL ? { w: PHONE.h, h: PHONE.w } : { w: PHONE.w, h: PHONE.h });

  function applyOrientation(isL) {
    const { w, h } = dims(isL);
    deviceEl.style.setProperty('--sw', `${w}px`);
    deviceEl.style.setProperty('--sh', `${h}px`);
    deviceEl.classList.toggle('landscape', isL);
    const safe = SAFE[isL ? 'landscape' : 'portrait'];
    for (const k of ['top', 'right', 'bottom', 'left']) screenEl.style.setProperty(`--safe-${k}`, `${safe[k]}px`);
    label.textContent = `${PHONE.name} · ${isL ? 'Landscape' : 'Portrait'} · ${w}×${h}`;
  }

  function fit(isL) {
    const { w, h } = dims(isL);
    const outerW = w + PHONE.bezel * 2;
    const outerH = h + PHONE.bezel * 2;
    const overlay = updatePanelMode();
    const panelW = overlay ? 0 : panel.offsetWidth;
    const availW = window.innerWidth - panelW - 48;
    const availH = window.innerHeight - 48 - 52;
    scale = Math.max(0.25, Math.min(1, availW / outerW, availH / outerH));
    fitEl.style.width = `${outerW * scale}px`;
    fitEl.style.height = `${outerH * scale}px`;
    scaleEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function measure() {
    if (rotating) return;
    if (mode === 'desktop') {
      fit(landscape);
      const { w, h } = dims(landscape);
      onResize(w, h, SAFE[landscape ? 'landscape' : 'portrait']);
    } else {
      updatePanelMode();
      onResize(screenEl.clientWidth, screenEl.clientHeight, readSafeProbe());
    }
  }

  // Emulates a real rotation: the whole (portrait) device turns 90°, then the
  // screen swaps to landscape dimensions and the game re-lays out.
  function rotate() {
    if (mode !== 'desktop' || rotating) return;
    onRotateStart?.();
    const toL = !landscape;
    fit(toL);
    rotating = true;
    deviceEl.style.transition = `transform ${ROTATE_MS}ms cubic-bezier(.45,.05,.25,1)`;
    deviceEl.style.transform = `rotate(${toL ? -90 : 90}deg)`;
    setTimeout(() => {
      deviceEl.style.transition = 'none';
      landscape = toL;
      applyOrientation(toL);
      deviceEl.style.transform = 'none';
      void deviceEl.offsetWidth; // commit before re-enabling transitions
      deviceEl.style.transition = '';
      rotating = false;
      measure();
    }, ROTATE_MS + 20);
  }

  let raf = 0;
  let late = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(measure);
    // iOS reports stale sizes right after orientationchange; measure again.
    clearTimeout(late);
    late = setTimeout(measure, 300);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);

  if (mode === 'desktop') {
    applyOrientation(false);
    $('rotate').addEventListener('click', rotate);
  } else {
    // Block iOS pinch-zoom gestures outside the game area too.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  return {
    mode,
    get scale() {
      return mode === 'desktop' ? scale : 1;
    },
    get rotating() {
      return rotating;
    },
    measure,
    rotate,
  };
}
