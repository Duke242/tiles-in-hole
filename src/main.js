import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { Audio } from './core/audio.js';
import { buildWorld } from './world/build.js';
import { createGround } from './world/ground.js';
import { createHole } from './game/hole.js';
import { Debris } from './game/debris.js';
import { updateObjects } from './game/objects.js';
import { createProgress } from './game/progress.js';
import { createHUD } from './ui/hud.js';
import { CITY, HOLE, BOUND } from './game/tune.js';

const canvas = document.getElementById('c');
const engine = createEngine(canvas);
const { scene, camera, renderer } = engine;

const world = buildWorld(scene);
const ground = createGround(scene, world.districtTex);
const hole = createHole(scene);
const debris = new Debris(scene);
const audio = new Audio();
const hud = createHUD(world);

// Start on a road intersection near the middle of town.
const startX = CITY.P * 2 + CITY.RW / 2;
const startZ = CITY.P * 5 + CITY.RW / 2;
hole.place(startX, startZ);

const input = createInput(canvas, camera, () => audio.unlock());
input.tx = startX; input.tz = startZ;

// Dev shortcuts for testing the late game without playing through it.
{
  const q = new URLSearchParams(location.search);
  const r = parseFloat(q.get('r'));
  if (r > 0) { hole.state.r = hole.state.tr = Math.min(r, HOLE.max); }
  if (q.get('g') && world.giants.length) {
    const g = world.giants[0];
    hole.place(g.x - g.radius - 6, g.z);
    input.tx = g.x; input.tz = g.z;
  }
}

const fx = {
  shakeAmt: 0,
  shake(v) { fx.shakeAmt = Math.min(1.2, fx.shakeAmt + v); },
};

const progress = createProgress(world,
  (tier) => { hud.toast('UNLOCKED', tier.label); audio.unlockJingle(); },
  (s) => showWin(s));

const ctx = { world, hole, debris, audio, fx, progress, time: 0 };

// --- camera -----------------------------------------------------------------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;

function updateCamera(dt) {
  const r = hole.state.r;
  const dist = (44 + r * 2.7) * input.zoom;
  const tx = hole.state.x + hole.state.vx * 0.22;
  const tz = hole.state.z + hole.state.vz * 0.22;
  camPos.set(tx, dist * 1.06, tz + dist * 0.62);
  camLook.set(hole.state.x, -r * 0.4, hole.state.z - r * 0.35);
  if (!camInit) { camera.position.copy(camPos); camInit = true; }
  const k = Math.min(1, dt * 4.5);
  camera.position.lerp(camPos, k);
  if (fx.shakeAmt > 0) {
    const a = fx.shakeAmt * (1 + r * 0.03);
    camera.position.x += (Math.random() - 0.5) * a * 2.4;
    camera.position.y += (Math.random() - 0.5) * a * 1.6;
    camera.position.z += (Math.random() - 0.5) * a * 2.4;
    fx.shakeAmt = Math.max(0, fx.shakeAmt - dt * 2.2);
  }
  camera.lookAt(camLook);
  engine.sky.position.copy(camera.position);
}

// --- overlays ---------------------------------------------------------------
const startEl = document.getElementById('start');
const winEl = document.getElementById('win');
let running = false;

document.getElementById('playBtn').addEventListener('click', () => {
  audio.unlock();
  startEl.classList.add('hidden');
  running = true;
});
document.getElementById('againBtn').addEventListener('click', () => location.reload());

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function showWin(s) {
  document.getElementById('winStats').innerHTML =
    `<b>${s.totalCount.toLocaleString()}</b> things devoured · <b>${s.score.toLocaleString()}</b> points<br>` +
    `best combo ×${s.best} · ${fmtTime(s.time)}`;
  winEl.classList.remove('hidden');
  audio.victory();
}

// --- keyboard steering ------------------------------------------------------
function keySteer(dt) {
  const k = input.keys;
  let kx = 0, kz = 0;
  if (k.a || k.arrowleft) kx -= 1;
  if (k.d || k.arrowright) kx += 1;
  if (k.w || k.arrowup) kz -= 1;
  if (k.s || k.arrowdown) kz += 1;
  if (!kx && !kz) return;
  const l = Math.hypot(kx, kz);
  const v = (HOLE.baseSpeed + hole.state.r * HOLE.speedPerR) * 1.15;
  input.tx = THREE.MathUtils.clamp(input.tx + (kx / l) * v * dt, BOUND.lo, BOUND.hi);
  input.tz = THREE.MathUtils.clamp(input.tz + (kz / l) * v * dt, BOUND.lo, BOUND.hi);
}
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') location.reload(); });

// --- loop -------------------------------------------------------------------
let last = performance.now();
let miniTick = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!running) { renderer.render(scene, camera); return; }

  ctx.time += dt;
  keySteer(dt);
  hole.update(dt, { x: input.tx, z: input.tz });
  ground.setHole(hole.state.x, hole.state.z, hole.state.r);

  updateObjects(dt, ctx);
  debris.update(dt, hole.state);
  world.staticField.flush();
  world.dynField.flush();

  if (!progress.state.won) progress.update(dt, hole.state.r);
  engine.updateClouds(ctx.time);
  updateCamera(dt);

  hud.update(progress, hole, progress.nextTier);
  miniTick += dt;
  if (miniTick > 0.2) { miniTick = 0; hud.drawMini(hole); }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Surface real errors instead of a blank blue screen.
addEventListener('error', (e) => {
  const d = document.getElementById('fatal');
  d.classList.remove('hidden');
  d.textContent = 'Error: ' + (e.message || e.error);
});
