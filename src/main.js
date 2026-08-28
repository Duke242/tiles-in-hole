import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { Audio } from './core/audio.js';
import { buildWorld } from './world/build.js';
import { createGround } from './world/ground.js';
import { createHole } from './game/hole.js';
import { Debris } from './game/debris.js';
import { Tiles } from './game/tiles.js';
import { updateObjects } from './game/objects.js';
import { createProgress } from './game/progress.js';
import { createHUD } from './ui/hud.js';
import { HOLE } from './game/tune.js';
import { WORLD, TILE_W, TILE_H } from './world/build.js';
import { occlusion } from './world/field.js';

const canvas = document.getElementById('c');
const engine = createEngine(canvas);
const { scene, camera, renderer } = engine;

const world = buildWorld(scene);
const ground = createGround(scene, world.districtTex);
const hole = createHole(scene);
const debris = new Debris(scene);
const tiles = new Tiles(scene, { worldSize: WORLD.size + 60, tileW: TILE_W, tileH: TILE_H });
const audio = new Audio();
const hud = createHUD(world);

// Start in the clearing at the middle of the field.
const startX = 0;
const startZ = 0;
hole.place(startX, startZ);

const input = createInput(canvas, camera, () => audio.unlock());
input.tx = startX; input.tz = startZ;

// Dev shortcuts for testing the late game without playing through it.
{
  const q = new URLSearchParams(location.search);
  const r = parseFloat(q.get('r'));
  if (r > 0) { hole.state.r = hole.state.tr = Math.min(r, HOLE.max); }

}

const fx = {
  shakeAmt: 0,
  shake(v) { fx.shakeAmt = Math.min(1.2, fx.shakeAmt + v); },
};

const progress = createProgress(world,
  () => { hud.toast('Size Up!'); audio.unlockJingle(); },
  (s) => showWin(s));

const ctx = { world, hole, debris, tiles, audio, fx, progress, time: 0 };

// --- camera -----------------------------------------------------------------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;

function updateCamera(dt) {
  const r = hole.state.r;
  // Portrait phones crop horizontally; pull back so the framing matches
  // what a landscape/desktop player sees.
  const aspectComp = Math.max(1, Math.sqrt(1.4 / Math.max(0.35, camera.aspect)));
  const dist = (34 + r * 2.6) * input.zoom * aspectComp;
  const tx = hole.state.x + hole.state.vx * 0.22;
  const tz = hole.state.z + hole.state.vz * 0.22;
  camPos.set(tx, dist * 0.92, tz + dist * 0.72);
  camLook.set(hole.state.x, -r * 0.4, hole.state.z - r * 0.35);
  if (!camInit) { camera.position.copy(camPos); camInit = true; }
  const k = Math.min(1, dt * 7);
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

  occlusion.uCamPos.value.copy(camera.position);
  occlusion.uFocus.value.set(hole.state.x, 2.0, hole.state.z);
  occlusion.uTunnel.value = hole.state.r * 0.5 + 4.0;
}

// --- overlays ---------------------------------------------------------------
const hintEl = document.getElementById('hint');
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
  const lim = WORLD.size / 2;
  input.tx = THREE.MathUtils.clamp(input.tx + (kx / l) * v * dt, -lim, lim);
  input.tz = THREE.MathUtils.clamp(input.tz + (kz / l) * v * dt, -lim, lim);
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
  if (hintEl && (progress.state.count > 2 || ctx.time > 8)) {
    hintEl.style.opacity = '0';
  }
  keySteer(dt);
  hole.update(dt, { x: input.tx, z: input.tz });
  ground.setHole(hole.state.x, hole.state.z, hole.state.r);

  updateObjects(dt, ctx);
  tiles.update(dt, hole.state, () => {
    hole.grow(0.6);
    progress.creditRaw(0.6);
  });
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
