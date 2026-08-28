// Analog stick, console style. Touching anywhere plants the stick; the offset
// from that point is a direction plus a magnitude, exactly like pushing a
// thumbstick. The hole is never teleported to the finger.

const DEADZONE = 0.13;

export function createInput(canvas, camera, onFirstTouch) {
  const state = {
    // movement vector in world axes, length 0..1
    mx: 0, mz: 0, active: false,
    keys: {}, zoom: 1, moved: false,
  };

  const stick = document.getElementById('stick');
  const knob = document.getElementById('stickKnob');
  let originX = 0, originY = 0, pointerId = null;
  let started = false;

  const radius = () => Math.max(52, Math.min(innerWidth, innerHeight) * 0.16);

  function place(x, y) {
    if (!stick) return;
    const r = radius();
    stick.style.width = stick.style.height = r * 2 + 'px';
    stick.style.left = (x - r) + 'px';
    stick.style.top = (y - r) + 'px';
    stick.classList.add('on');
  }

  function setKnob(dx, dy) {
    if (!knob) return;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function apply(cx, cy) {
    const r = radius();
    let dx = cx - originX, dy = cy - originY;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, r);
    if (len > 0.0001) { dx = (dx / len) * clamped; dy = (dy / len) * clamped; }
    setKnob(dx, dy);

    let mag = clamped / r;
    if (mag < DEADZONE) { state.mx = 0; state.mz = 0; return; }
    // Rescale past the deadzone so the first millimetre of travel does nothing
    // abrupt, then ease in slightly for fine control near the centre.
    mag = (mag - DEADZONE) / (1 - DEADZONE);
    mag = mag * mag * 0.45 + mag * 0.55;
    const inv = 1 / (Math.hypot(dx, dy) || 1);
    // Screen up is away from the camera; the camera never rotates, so the
    // mapping is fixed.
    state.mx = dx * inv * mag;
    state.mz = dy * inv * mag;
    state.moved = true;
  }

  function release() {
    state.active = false;
    pointerId = null;
    state.mx = 0; state.mz = 0;
    setKnob(0, 0);
    if (stick) stick.classList.remove('on');
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!started) { started = true; onFirstTouch && onFirstTouch(); }
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    state.active = true;
    originX = e.clientX; originY = e.clientY;
    place(originX, originY);
    setKnob(0, 0);
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
    state.zoom = Math.max(0.55, Math.min(2.0, state.zoom + e.deltaY * 0.0012));
  }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());

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
      return { x: kx / l, z: kz / l };
    }
    return { x: state.mx, z: state.mz };
  };

  return state;
}
