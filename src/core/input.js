// Thumbstick, app style: a fixed translucent ring at the bottom of the screen
// whose knob follows your finger, but you can touch anywhere; the offset from
// where you touched is the direction plus a magnitude.

const DEADZONE = 0.12;

export function createInput(canvas, camera, onFirstTouch) {
  const state = { mx: 0, mz: 0, active: false, keys: {}, zoom: 1, moved: false };
  const stick = document.getElementById('stick');
  const knob = document.getElementById('stickKnob');
  let originX = 0, originY = 0, pointerId = null;
  let started = false;

  const radius = () => Math.max(40, Math.min(innerWidth, innerHeight) * 0.15);

  function setKnob(dx, dy) { if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`; }

  function apply(cx, cy) {
    const r = radius();
    let dx = cx - originX, dy = cy - originY;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, r);
    if (len > 0.0001) { dx = (dx / len) * clamped; dy = (dy / len) * clamped; }
    setKnob(dx * 0.85, dy * 0.85);
    let mag = clamped / r;
    if (mag < DEADZONE) { state.mx = 0; state.mz = 0; return; }
    mag = (mag - DEADZONE) / (1 - DEADZONE);
    mag = mag * mag * 0.4 + mag * 0.6;
    const inv = 1 / (Math.hypot(dx, dy) || 1);
    state.mx = dx * inv * mag;
    state.mz = dy * inv * mag;
    state.moved = true;
  }

  function release() {
    state.active = false;
    pointerId = null;
    state.mx = 0; state.mz = 0;
    setKnob(0, 0);
    if (stick) stick.classList.remove('held');
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!started) { started = true; onFirstTouch && onFirstTouch(); }
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    state.active = true;
    originX = e.clientX; originY = e.clientY;
    setKnob(0, 0);
    if (stick) stick.classList.add('held');
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.active || e.pointerId !== pointerId) return;
    apply(e.clientX, e.clientY);
  });
  const up = (e) => { if (pointerId === null || e.pointerId === pointerId) release(); };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  addEventListener('blur', release);

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    state.keys[k] = true;
    if (k.startsWith('arrow') || k === ' ') e.preventDefault();
  });
  addEventListener('keyup', (e) => { state.keys[e.key.toLowerCase()] = false; });
  addEventListener('wheel', (e) => {
    state.zoom = Math.max(0.6, Math.min(1.8, state.zoom + e.deltaY * 0.0012));
  }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());

  state.show = (on) => { if (stick) stick.classList.toggle('on', on); };

  // Keyboard behaves as a digital stick held to full deflection.
  state.readMove = () => {
    let kx = 0, kz = 0;
    const k = state.keys;
    if (k.a || k.arrowleft) kx -= 1;
    if (k.d || k.arrowright) kx += 1;
    if (k.w || k.arrowup) kz -= 1;
    if (k.s || k.arrowdown) kz += 1;
    if (kx || kz) {
      const l = Math.hypot(kx, kz);
      setKnob((kx / l) * radius() * 0.85, (kz / l) * radius() * 0.85);
      return { x: kx / l, z: kz / l };
    }
    if (!state.active) setKnob(0, 0);
    return { x: state.mx, z: state.mz };
  };

  return state;
}
