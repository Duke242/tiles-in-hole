import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { Audio } from './core/audio.js';
import { loadSave, writeSave } from './core/save.js';
import { Field } from './world/field.js';
import { createGround } from './world/ground.js';
import { buildWorld } from './world/build.js';
import { createHole, HOLE } from './game/hole.js';
import { Debris } from './game/debris.js';
import { Rigid, L_DISC } from './game/rigid.js';
import { updateEating } from './game/eat.js';
import { createProgress } from './game/progress.js';
import { generateLevel } from './levels/generate.js';
import { generateFreeMap, FREE_MAPS } from './levels/freeplay.js';
import { THEMES, themeForLevel } from './world/themes.js';
import { createHUD } from './ui/hud.js';
import { TILE_TYPES } from './world/tiles.js';

const canvas = document.getElementById('c');
const engine = createEngine(canvas);
const { scene, camera, renderer } = engine;

const ground = createGround(scene);
const fields = {
  cube: new Field(scene, 90000, { shape: 'cube' }),
  bead: new Field(scene, 20000, { shape: 'bead' }),
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
// Two ways to play: the level path (goal card, clock, themed boards that get
// harder) and free play (one huge board, no clock, no card, eat it bare).
// `level` is whichever board is on the table; `level.free` tells them apart.
let level = null;
let progress = null;
let status = 'menu';        // menu | playing | paused | won | lost
let revived = false;
const ctx = { level: null, hole, debris, rigid: null, audio, fx, progress: null, fields, time: 0, magnet: 0, consume: null };
const active = { boost: 0, magnet: 0, time: 0 };
const cool = { boost: 0, magnet: 0 };           // free play: boosters recharge instead of running out
const FREE_COOL = { boost: 30, magnet: 25 };
let run = { tiles: 0 };                          // tiles eaten this board (free-play score)
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
  if (layer >= L_DISC) run.tiles++;
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

function refreshBoosters() { hud.setBoosters(save.boosters, active, level && level.free ? cool : null); }

// Put a board on the table and start playing it.
function setupBoard(lv) {
  level = lv;
  buildWorld(level, fields, rigid);
  debris.reset();
  ground.setTheme(level.theme);
  ground.setBoard(level.board.w, level.board.d);
  engine.setSky(level.theme.sky);
  engine.setBoard(level.board.w, level.board.d);
  hole.reset(level.holeStart);
  hole.setMax(level.holeMax || HOLE.max);
  if (dev.r > level.holeStart) hole.grow(Math.round(((dev.r / level.holeStart - 1) / 0.16) ** 2));
  hole.setBounds(level.board.w, level.board.d);
  hole.place(0, 0);
  progress = createProgress(level, { onWin, onLose });
  ctx.level = level; ctx.progress = progress; ctx.time = 0; ctx.magnet = 0;
  active.magnet = active.boost = 0;
  cool.boost = cool.magnet = 0;
  revived = false;
  popCount = 0; popTimer = 0;
  run = { tiles: 0 };
  hud.setFree(!!level.free);
  hud.setGoals(level.goals);
  hud.updateGoals(progress.state.goals);
  refreshBoosters();
  hud.show(true);
  input.show(true);
  for (const id of ['menu', 'maps', 'pause', 'win', 'lose']) hud.overlay(id, false);
  document.getElementById('restartBtn').textContent = level.free ? 'New map' : 'Restart level';
  status = 'playing';
  camInit = false;
  fx.shakeAmt = 0;
}

function startLevel(n) {
  setupBoard(generateLevel(n));
  hud.setLevel(n);
  hud.setTimer(level.time);
  hud.setHint(n === 1 ? 'Collect all goal items to win!' : `${level.theme.name} · fill the goal card before time runs out`);
}

// Free play: a fresh random board each time on the chosen map. Classic
// takes the worlds in turn; the big maps each have their own.
function startFree(id = level && level.free ? level.map : 'classic') {
  const map = FREE_MAPS.find((m) => m.id === id) || FREE_MAPS[0];
  const theme = map.world ? THEMES.find((t) => t.id === map.world) : THEMES[save.free.runs % THEMES.length];
  const seed = dev.seed || (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  save.free.runs++;
  writeSave(save);
  setupBoard(generateFreeMap({
    seed, theme, map: map.id, giants: map.giants, holeMax: map.holeMax,
    size: dev.size ?? map.size, tiles: dev.tiles ?? map.tiles, props: dev.props ?? map.props,
    voxCap: fields.cube.capacity, beadCap: fields.bead.capacity,
  }));
  hud.setScore(0, rigid.nTiles);
  hud.setHint(map.giants
    ? `${map.name} · grow big enough and the giants come down`
    : `${theme.name} · no clock, no card: eat the whole board`);
}

function bankBest() {
  save.free.best = Math.max(save.free.best, run.tiles);
  save.free.bests[level.map] = Math.max(save.free.bests[level.map] || 0, run.tiles);
}

// Leaving a free-play board early still banks its coins and best score.
function bankFreeRun() {
  if (!level || !level.free || !progress || progress.state.status !== 'playing' || run.tiles === 0) return;
  save.coins += Math.floor(run.tiles / 20);
  bankBest();
  writeSave(save);
}

// The map picker: one button per free-play map, with its best run.
function showMaps() {
  const list = document.getElementById('mapList');
  list.textContent = '';
  for (const m of FREE_MAPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn mode ' + (m.giants ? 'blue' : 'orange');
    b.dataset.map = m.id;
    const best = save.free.bests[m.id];
    b.innerHTML = `<span class="big"></span><span class="small"></span>${m.giants ? '<span class="tag">GIANT</span>' : ''}`;
    b.querySelector('.big').textContent = m.name;
    b.querySelector('.small').textContent = best ? `${m.blurb} · best ${best.toLocaleString()}` : m.blurb;
    b.addEventListener('click', () => { audio.unlock(); if (rigid) startFree(m.id); });
    list.appendChild(b);
  }
  hud.overlay('menu', false);
  hud.overlay('maps', true);
}

function restart() {
  if (!level) return;
  if (level.free) { bankFreeRun(); startFree(); } else startLevel(level.n);
}

function onWin(s) {
  status = 'won';
  audio.victory();
  const free = level.free;
  const used = free ? s.elapsed : level.time - s.left;
  let coins, stars = 3;
  if (free) {
    coins = 60 + Math.floor(run.tiles / 20);
    bankBest();
  } else {
    const n = level.n;
    stars = s.left > level.time * 0.5 ? 3 : s.left > level.time * 0.2 ? 2 : 1;
    coins = 20 + Math.min(80, n * 2) + stars * 5;
    save.level = Math.max(save.level, n + 1);
    if (n % 3 === 0) { const k = ['boost', 'magnet', 'time'][(n / 3) % 3]; save.boosters[k] = (save.boosters[k] || 0) + 1; }
  }
  save.coins += coins;
  writeSave(save);
  document.getElementById('winTitle').innerHTML = free ? 'MAP<br>CLEARED!' : 'LEVEL<br>COMPLETE!';
  const starsEl = document.getElementById('winStars');
  starsEl.classList.toggle('hidden', free);
  starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('winTime').textContent = '⏱ ' + hud.fmt(used);
  document.getElementById('winStats').innerHTML = free
    ? `+${coins} 🪙 &nbsp;·&nbsp; ${run.tiles.toLocaleString()} tiles and ${level.props.length} props eaten`
    : `+${coins} 🪙 &nbsp;·&nbsp; ${hole.state.eaten.toLocaleString()} tiles eaten`;
  document.getElementById('nextBtn').textContent = free ? 'New map' : 'Continue';
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
  bankFreeRun();
  status = 'menu';
  hud.show(false);
  input.show(false);
  for (const id of ['maps', 'pause', 'win', 'lose']) hud.overlay(id, false);
  document.getElementById('menuLevel').textContent = `Level ${save.level}`;
  document.getElementById('menuCoins').textContent = save.coins.toLocaleString();
  document.getElementById('menuTheme').textContent = `Level ${save.level} · ${themeForLevel(save.level).name}`;
  document.getElementById('menuFree').textContent = save.free.best
    ? `${FREE_MAPS.length} huge maps · best ${save.free.best.toLocaleString()} tiles`
    : `${FREE_MAPS.length} huge maps · no clock, no card`;
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
const freeBtn = document.getElementById('freeBtn');
Rigid.init().then(() => {
  rigid = new Rigid(scene);
  rigid.onConsumed = onTileEaten;
  rigid.onOverflow = (x, y, z, vx, vy, vz, col, key, shape) => debris.spawn(x, y, z, vx, vy, vz, col, key, shape, true);
  debris.onConsumed = consume;
  ctx.rigid = rigid;
  playBtn.disabled = freeBtn.disabled = false;
  document.getElementById('menuLoading').classList.add('hidden');
  if (status === 'menu') showMenu();
});

// Dev shortcuts: ?level=N, ?r=6 (start with a bigger hole), and for free play
// ?size=, ?tiles=, ?props=, ?seed= to get a small or repeatable board, and
// ?map=<id> to skip the picker.
const q = new URLSearchParams(location.search);
const num = (k) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : undefined; };
const forcedLevel = num('level') || 0;
const dev = { r: num('r') || 0, size: num('size'), tiles: num('tiles'), props: num('props'), seed: num('seed'), map: q.get('map') };
const on = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { audio.unlock(); fn(e); });
on('playBtn', () => { if (rigid) startLevel(forcedLevel || save.level); });
on('freeBtn', () => { if (!rigid) return; if (dev.map) startFree(dev.map); else showMaps(); });
on('mapsBack', showMenu);
on('nextBtn', () => { if (level.free) startFree(); else startLevel(level.n + 1); });
on('retryBtn', () => startLevel(level.n));
on('restartBtn', restart);
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

// Boosters: a stock you earn through the levels; in free play they are free
// but recharge after use (+30s means nothing there and is hidden).
for (const b of document.querySelectorAll('.boost')) {
  b.addEventListener('click', () => {
    if (status !== 'playing') return;
    const k = b.dataset.boost;
    if (level.free) {
      if (k === 'time' || active[k] > 0 || cool[k] > 0) return;
      cool[k] = FREE_COOL[k];
    } else {
      if (!save.boosters[k] || (k !== 'time' && active[k] > 0)) return;
      save.boosters[k]--;
      writeSave(save);
    }
    if (k === 'boost') { active.boost = 10; hole.boost(10); }
    if (k === 'magnet') { active.magnet = 7; ctx.magnet = 7; }
    if (k === 'time') progress.addTime(30);
    audio.boost();
    refreshBoosters();
  });
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'r' && level && status !== 'menu') restart();
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
  engine.followSun(hole.state.x, hole.state.z);

  const [sx, sy] = screenOf(hole.state.x, 0, hole.state.z + r * 1.35);
  hud.setSize(hole.state.size, sx, sy + 2);
}

// --- loop -------------------------------------------------------------------
let last = performance.now();
let tick = 0;
const perf = { frames: 0, total: 0, worst: 0, update: 0 };
const NO_MOVE = { x: 0, z: 0 };
let forcedMove = null;   // automation hook (see window.__debug.setMove)

let crashed = false;
function frame(now) {
  requestAnimationFrame(frame);
  if (crashed) return;
  try { step(now); } catch (e) { crashed = true; showFatal(e); }
}

function step(now) {
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
      rigid.magnet(hole.state, hole.state.r * 3.5 + 2, 0.06 * dt * 60);
      if (active.magnet <= 0) refreshBoosters();
    }
    if (active.boost > 0) { active.boost -= dt; if (active.boost <= 0) refreshBoosters(); }
    if (level.free) {
      let changed = false;
      for (const k of ['boost', 'magnet']) {
        if (cool[k] <= 0) continue;
        const before = Math.ceil(cool[k]);
        cool[k] = Math.max(0, cool[k] - dt);
        if (Math.ceil(cool[k]) !== before) changed = true;
      }
      if (changed) refreshBoosters();
    }

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
    if (level.free) {
      if (playing) {
        const left = rigid.nTiles;
        hud.setScore(run.tiles, left);
        if (left === 0 && level.props.every((o) => o.state === 'gone')) progress.finish();
      }
    } else {
      if (playing && progress.state.left <= 10 && progress.state.started) {
        tick += dt;
        if (tick >= 1) { tick = 0; audio.tick(); }
      }
      hud.updateGoals(progress.state.goals);
      hud.setTimer(progress.state.left);
    }
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
  level: () => level && { n: level.n, free: !!level.free, map: level.map, theme: level.theme.id, tiles: level.totalTiles, props: level.props.length, board: level.board },
  targets: () => {
    if (!rigid) return [];
    const out = [];
    for (let L = 2; L < rigid.layers.length; L++) {
      for (const b of rigid.layers[L].bodies) out.push({ x: b.px, z: b.pz, y: b.body ? b.body.translation().y : b.y, key: b.key });
    }
    for (const b of rigid.propVoxels) out.push({ x: b.px, z: b.pz, y: b.body ? b.body.translation().y : b.y, key: 'prop' });
    return out;
  },
  hole: () => ({ ...hole.state }),
  progress: () => progress && JSON.parse(JSON.stringify(progress.state)),
  run: () => ({ ...run, left: rigid ? rigid.nTiles : 0 }),
  active: () => (rigid ? rigid.nAct : 0),
  live: () => (rigid ? rigid.nLive : 0),
  start: (n) => startLevel(n),
  startFree: (id) => startFree(id),
  place: (x, z) => { hole.place(x, z); camInit = false; },
  giants: () => (level ? level.props.filter((o) => o.model.giant).map((o) => ({ kind: o.model.kind, x: o.x, z: o.z, n: o.remaining, state: o.state })) : []),
  setMove: (x, z) => { forcedMove = (x === null || x === undefined) ? null : { x, z }; },
  perf: () => { const o = { avgMs: (perf.total / perf.frames * 1000), worstMs: perf.worst * 1000, updateMs: perf.update / perf.frames }; perf.frames = perf.total = perf.worst = perf.update = 0; return o; },
};

showMenu();

// Keep the first error on screen: once the physics engine has aborted,
// every later call fails with a generic "recursive use" error that would
// hide the one that matters.
let fatalShown = false;
function showFatal(err) {
  if (fatalShown) return;
  fatalShown = true;
  const d = document.getElementById('fatal');
  d.classList.remove('hidden');
  const stack = err && err.stack ? String(err.stack).split('\n').slice(0, 6).join('\n') : '';
  d.textContent = 'Error: ' + (err && err.message || err) + (stack ? '\n\n' + stack : '');
  console.error(err);
}
addEventListener('error', (e) => showFatal(e.error || e.message));
addEventListener('unhandledrejection', (e) => showFatal(e.reason));
