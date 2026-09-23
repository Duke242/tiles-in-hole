import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { Audio } from './core/audio.js';
import { loadSave, writeSave } from './core/save.js';
import { Field } from './world/field.js';
import { createGround } from './world/ground.js';
import { buildWorld } from './world/build.js';
import { createHole } from './game/hole.js';
import { Debris } from './game/debris.js';
import { Rigid, L_DISC } from './game/rigid.js';
import { updateEating } from './game/eat.js';
import { createProgress } from './game/progress.js';
import { generateLevel } from './levels/generate.js';
import { themeForLevel } from './world/themes.js';
import { createHUD } from './ui/hud.js';
import { TILE_TYPES } from './world/tiles.js';

const canvas = document.getElementById('c');
const engine = createEngine(canvas);
const { scene, camera, renderer } = engine;

const ground = createGround(scene);
const fields = {
  cube: new Field(scene, 40000, { shape: 'cube' }),
  bead: new Field(scene, 16000, { shape: 'bead' }),
};
const hole = createHole(scene);
const debris = new Debris(scene);
const audio = new Audio();
const hud = createHUD();
const save = loadSave();
audio.muted = !save.sound;
let rigid = null;

const input = createInput(canvas, camera, () => audio.unlock());

const fx = {
  shakeAmt: 0,
  shake(v) { fx.shakeAmt = Math.min(1.2, fx.shakeAmt + v); },
};

// --- game state ---------------------------------------------------------------
let level = null;
let progress = null;
let status = 'menu';        // menu | playing | paused | won | lost
let revived = false;
const ctx = { level: null, hole, debris, rigid: null, audio, fx, progress: null, fields, time: 0, magnet: 0, consume: null };
const active = { boost: 0, magnet: 0, time: 0 };
const typeIndex = new Map(TILE_TYPES.map((t, i) => [t.id, i]));
let popCount = 0, popTimer = 0;
const _p = new THREE.Vector3();

function screenOf(x, y, z) {
  _p.set(x, y, z).project(camera);
  return [(_p.x * 0.5 + 0.5) * innerWidth, (-_p.y * 0.5 + 0.5) * innerHeight];
}

// A tile went down the hole.
function onTileEaten(key, layer, x, z) {
  hole.grow(1);
  if (!progress) return;
  const goal = progress.state.goals.find((g) => g.key === key);
  const counted = goal && goal.have < goal.need;
  progress.credit(key, 1);
  popCount++;
  if (counted && layer >= L_DISC) {
    const [sx, sy] = screenOf(x, 0.4, z);
    hud.flyIcon(key, typeIndex.get(key), sx, sy);
  }
  audio.pop(hole.state.eaten);
}

// A voxel from a prop went down: grows the hole, no card.
function consume(key, n) {
  hole.grow(n);
  if (progress) progress.credit(key, n);
}
ctx.consume = consume;
ctx.onBomb = () => { if (progress) progress.fail('bomb'); };

function startLevel(n) {
  level = generateLevel(n);
  buildWorld(level, fields, rigid);
  debris.reset();
  ground.setTheme(level.theme);
  ground.setBoard(level.board.w, level.board.d);
  engine.setSky(level.theme.sky);
  engine.setBoard(level.board.w, level.board.d);
  hole.reset(level.holeStart);
  hole.setBounds(level.board.w, level.board.d);
  hole.place(0, 0);
  progress = createProgress(level, { onWin, onLose });
  ctx.level = level; ctx.progress = progress; ctx.time = 0; ctx.magnet = 0;
  active.magnet = active.boost = 0;
  revived = false;
  popCount = 0; popTimer = 0;
  hud.setLevel(n);
  hud.setGoals(level.goals);
  hud.updateGoals(progress.state.goals);
  hud.setTimer(level.time);
  hud.setBoosters(save.boosters, active);
  hud.setHint(n === 1 ? 'Collect all goal items to win!' : `${level.theme.name} · fill the goal card before time runs out`);
  hud.show(true);
  input.show(true);
  for (const id of ['menu', 'pause', 'win', 'lose']) hud.overlay(id, false);
  status = 'playing';
  camInit = false;
  fx.shakeAmt = 0;
}

function onWin(s) {
  status = 'won';
  audio.victory();
  const n = level.n;
  const used = level.time - s.left;
  const stars = s.left > level.time * 0.5 ? 3 : s.left > level.time * 0.2 ? 2 : 1;
  const coins = 20 + Math.min(80, n * 2) + stars * 5;
  save.level = Math.max(save.level, n + 1);
  save.coins += coins;
  if (n % 3 === 0) { const k = ['boost', 'magnet', 'time'][(n / 3) % 3]; save.boosters[k] = (save.boosters[k] || 0) + 1; }
  writeSave(save);
  document.getElementById('winStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('winTime').textContent = '⏱ ' + hud.fmt(used);
  document.getElementById('winStats').innerHTML = `+${coins} 🪙 &nbsp;·&nbsp; ${hole.state.eaten.toLocaleString()} tiles eaten`;
  setTimeout(() => { if (status === 'won') { input.show(false); hud.overlay('win', true); } }, 1000);
}

function onLose(s) {
  status = 'lost';
  const bomb = s && s.reason === 'bomb';
  if (!bomb) audio.timeUp();
  document.querySelector('#lose h1').textContent = bomb ? 'BOOM!' : "TIME'S UP!";
  document.getElementById('loseStats').textContent = bomb
    ? 'You swallowed a bomb. Steer around the black ones.'
    : 'So close. The goal card is still waiting.';
  document.getElementById('reviveBtn').classList.toggle('hidden', revived || bomb);
  setTimeout(() => { if (status === 'lost') { input.show(false); hud.overlay('lose', true); } }, 500);
}

function showMenu() {
  status = 'menu';
  hud.show(false);
  input.show(false);
  for (const id of ['pause', 'win', 'lose']) hud.overlay(id, false);
  document.getElementById('menuLevel').textContent = `Level ${save.level}`;
  document.getElementById('menuCoins').textContent = save.coins.toLocaleString();
  document.getElementById('menuTheme').textContent = themeForLevel(save.level).name;
  hud.overlay('menu', true);
  if (!level && rigid) {
    level = generateLevel(save.level);
    buildWorld(level, fields, rigid);
    ground.setTheme(level.theme);
    ground.setBoard(level.board.w, level.board.d);
    engine.setSky(level.theme.sky);
    hole.reset(level.holeStart);
  }
}

// --- buttons ------------------------------------------------------------------
const playBtn = document.getElementById('playBtn');
playBtn.disabled = true;
Rigid.init().then(() => {
  rigid = new Rigid(scene);
  rigid.onConsumed = onTileEaten;
  rigid.onOverflow = (x, y, z, vx, vy, vz, col, key, shape) => debris.spawn(x, y, z, vx, vy, vz, col, key, shape, true);
  debris.onConsumed = consume;
  ctx.rigid = rigid;
  playBtn.disabled = false;
  playBtn.textContent = 'Play';
  if (status === 'menu') showMenu();
});

const forcedLevel = parseInt(new URLSearchParams(location.search).get('level')) || 0;
const on = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { audio.unlock(); fn(e); });
on('playBtn', () => { if (rigid) startLevel(forcedLevel || save.level); });
on('nextBtn', () => startLevel(level.n + 1));
on('retryBtn', () => startLevel(level.n));
on('restartBtn', () => startLevel(level.n));
on('homeBtn', showMenu);
on('loseHomeBtn', showMenu);
on('pauseBtn', () => { if (status === 'playing') { status = 'paused'; hud.overlay('pause', true); } });
on('resumeBtn', () => { if (status === 'paused') { status = 'playing'; hud.overlay('pause', false); } });
on('reviveBtn', () => {
  if (status !== 'lost') return;
  revived = true;
  progress.revive(30);
  status = 'playing';
  input.show(true);
  hud.overlay('lose', false);
});
on('soundBtn', (e) => {
  save.sound = !save.sound; audio.muted = !save.sound; writeSave(save);
  e.currentTarget.textContent = save.sound ? '🔊' : '🔇';
});
document.getElementById('soundBtn').textContent = save.sound ? '🔊' : '🔇';

for (const b of document.querySelectorAll('.boost')) {
  b.addEventListener('click', () => {
    if (status !== 'playing') return;
    const k = b.dataset.boost;
    if (!save.boosters[k] || (k !== 'time' && active[k] > 0)) return;
    save.boosters[k]--;
    writeSave(save);
    if (k === 'boost') { active.boost = 10; hole.boost(10); }
    if (k === 'magnet') { active.magnet = 7; ctx.magnet = 7; }
    if (k === 'time') progress.addTime(30);
    audio.boost();
    hud.setBoosters(save.boosters, active);
  });
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'r' && level && status !== 'menu') startLevel(level.n);
  if (k === 'escape' || k === 'p') {
    if (status === 'playing') { status = 'paused'; hud.overlay('pause', true); }
    else if (status === 'paused') { status = 'playing'; hud.overlay('pause', false); }
  }
});

// --- camera -----------------------------------------------------------------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;

function updateCamera(dt) {
  const r = hole.state.r;
  const comp = camera.aspect < 1 ? 1.0 : 1.35;
  const dist = (24 + r * 4) * input.zoom * comp;
  const tx = hole.state.x + hole.state.vx * 0.3;
  const tz = hole.state.z + hole.state.vz * 0.3;
  camPos.set(tx, dist * 1.0, tz + dist * 0.55);
  camLook.set(hole.state.x, 0, hole.state.z - r * 0.5 - 1.5);
  if (!camInit) { camera.position.copy(camPos); camInit = true; }
  camera.position.lerp(camPos, Math.min(1, dt * 6));
  if (fx.shakeAmt > 0) {
    const a = fx.shakeAmt;
    camera.position.x += (Math.random() - 0.5) * a * 1.2;
    camera.position.y += (Math.random() - 0.5) * a * 0.8;
    camera.position.z += (Math.random() - 0.5) * a * 1.2;
    fx.shakeAmt = Math.max(0, fx.shakeAmt - dt * 2.2);
  }
  camera.lookAt(camLook);
  engine.sky.position.copy(camera.position);

  const [sx, sy] = screenOf(hole.state.x, 0, hole.state.z + r * 1.35);
  hud.setSize(hole.state.size, sx, sy + 2);
}

// --- loop -------------------------------------------------------------------
let last = performance.now();
let tick = 0;
const perf = { frames: 0, total: 0, worst: 0, update: 0 };
const NO_MOVE = { x: 0, z: 0 };
let forcedMove = null;   // automation hook (see window.__debug.setMove)

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  perf.frames++; perf.total += raw; if (raw > perf.worst) perf.worst = raw;
  const t0 = performance.now();
  if (!level || !rigid) { renderer.render(scene, camera); return; }

  const playing = status === 'playing';
  const simulate = playing || status === 'won' || status === 'lost';
  if (simulate) {
    ctx.time += dt;
    const move = playing ? (forcedMove || input.readMove()) : NO_MOVE;
    if (playing && (move.x || move.z) && !progress.state.started) progress.state.started = true;
    if (progress.state.started && ctx.time > 6) hud.fadeHint();
    hole.update(dt, move);
    ground.setHole(hole.state.x, hole.state.z, hole.state.r);

    if (active.magnet > 0) {
      active.magnet -= dt; ctx.magnet = active.magnet;
      rigid.magnet(hole.state, hole.state.r * 3.5 + 2, 0.06);
      if (active.magnet <= 0) hud.setBoosters(save.boosters, active);
    }
    if (active.boost > 0) { active.boost -= dt; if (active.boost <= 0) hud.setBoosters(save.boosters, active); }

    updateEating(dt, ctx);
    rigid.update(dt, hole.state);
    debris.update(dt, hole.state);
    fields.cube.flush();
    fields.bead.flush();

    // "+N" popups, batched so a whole stack reads as one number.
    popTimer += dt;
    if (popCount > 0 && popTimer > 0.14) {
      const [sx, sy] = screenOf(hole.state.x, 0.5, hole.state.z - hole.state.r * 0.3);
      hud.popup('+' + popCount, sx, sy);
      popCount = 0; popTimer = 0;
    }

    progress.update(dt);
    if (playing && progress.state.left <= 10 && progress.state.started) {
      tick += dt;
      if (tick >= 1) { tick = 0; audio.tick(); }
    }
    hud.updateGoals(progress.state.goals);
    hud.setTimer(progress.state.left);
  } else if (status === 'menu') {
    hole.update(dt, NO_MOVE);
    ground.setHole(hole.state.x, hole.state.z, hole.state.r);
  }
  engine.updateClouds(ctx.time);
  updateCamera(dt);
  perf.update += performance.now() - t0;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Inspection handle for automated checks.
window.__debug = {
  ready: () => !!rigid,
  rigid: () => rigid,
  engine: () => engine,
  status: () => status,
  level: () => level && { n: level.n, theme: level.theme.id, tiles: level.totalTiles, board: level.board },
  targets: () => {
    if (!rigid) return [];
    const out = [];
    for (let L = 2; L < rigid.layers.length; L++) {
      for (const b of rigid.layers[L].bodies) { const t = b.body.translation(); out.push({ x: t.x, z: t.z, y: t.y, key: b.key }); }
    }
    for (const o of (level ? level.props : [])) if (o.state === 'idle') out.push({ x: o.x, z: o.z, y: 0, key: 'prop', need: o.need });
    return out;
  },
  hole: () => ({ ...hole.state }),
  progress: () => progress && JSON.parse(JSON.stringify(progress.state)),
  active: () => (rigid ? rigid.nAct : 0),
  start: (n) => startLevel(n),
  setMove: (x, z) => { forcedMove = (x === null || x === undefined) ? null : { x, z }; },
  perf: () => { const o = { avgMs: (perf.total / perf.frames * 1000), worstMs: perf.worst * 1000, updateMs: perf.update / perf.frames }; perf.frames = perf.total = perf.worst = perf.update = 0; return o; },
};

showMenu();

addEventListener('error', (e) => {
  const d = document.getElementById('fatal');
  d.classList.remove('hidden');
  d.textContent = 'Error: ' + (e.message || e.error);
});
