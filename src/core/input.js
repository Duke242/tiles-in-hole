import * as THREE from 'three';
import { BOUND } from '../game/tune.js';

// Pointer position is projected onto the y=0 plane: the hole targets exactly
// where the finger is, which is how the original game feels.
export function createInput(canvas, camera, onFirstTouch) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const state = { holding: false, tx: 0, tz: 0, keys: {}, zoom: 1, moved: false };
  let started = false;

  function toGround(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const { origin: o, direction: dir } = raycaster.ray;
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = -o.y / dir.y;
    if (t < 0) return null;
    return { x: o.x + dir.x * t, z: o.z + dir.z * t };
  }

  function aim(cx, cy) {
    const p = toGround(cx, cy);
    if (!p) return;
    state.tx = THREE.MathUtils.clamp(p.x, BOUND.lo, BOUND.hi);
    state.tz = THREE.MathUtils.clamp(p.z, BOUND.lo, BOUND.hi);
    state.moved = true;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!started) { started = true; onFirstTouch && onFirstTouch(); }
    state.holding = true;
    aim(e.clientX, e.clientY);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state.holding) aim(e.clientX, e.clientY);
  });
  const release = () => { state.holding = false; };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  addEventListener('blur', release);

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    state.keys[k] = true;
    if (k.startsWith('arrow') || k === ' ') e.preventDefault();
  });
  addEventListener('keyup', (e) => { state.keys[e.key.toLowerCase()] = false; });
  addEventListener('wheel', (e) => {
    state.zoom = THREE.MathUtils.clamp(state.zoom + e.deltaY * 0.0012, 0.55, 2.0);
  }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());

  return state;
}
