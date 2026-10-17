// Squad Rush: menus, input, HUD and the frame loop around Sim + Renderer.
//   ?level=N     start straight into level N
//   ?mode=free   start straight into Free mode
//   ?bot=1       let the autopilot play (demo / smoke tests)
//   ?quality=low|medium|high   fix the graphics level (otherwise it adapts)
import { Sim, botTarget } from './sim.js';
import { Renderer } from './render.js';
import { Sfx } from './sfx.js';
import { loadSave, writeSave } from './save.js';
import { LEVELS } from './levels.js';
import { LANE_HALF, squadRadius, steerLimit, gateLabel } from './logic.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BOT = params.get('bot') === '1';

const save = loadSave();
const sfx = new Sfx();
sfx.muted = !save.sound;
const renderer = new Renderer($('c'), { quality: params.get('quality') });

let sim = null;
let run = null;        // { mode, levelIndex } for the run being played; null on the menu
let paused = false;
let resultShown = false;
let steerTarget = 0;
let lastCount = 0;

// ---------- input ----------

const keys = {};
let drag = null;
const canvas = $('c');
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  drag = { id: e.pointerId, x: e.clientX, target: clampSteer(steerTarget) };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  $('hint').classList.add('hidden');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || paused) return;
  // Dragging across ~70% of the screen sweeps the whole road.
  const span = Math.min(innerWidth, 900) * 0.7;
  steerTarget = clampSteer(drag.target + (e.clientX - drag.x) / span * LANE_HALF * 2);
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (run && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) $('hint').classList.add('hidden');
  if ((e.code === 'Escape' || e.code === 'KeyP') && run && !resultShown) setPaused(!paused);
  sfx.unlock();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (run && !resultShown) setPaused(true); });

// Clamp to how far the squad can actually go, so there is no dead zone to
// drag back through after pushing past the edge with a big squad.
function clampSteer(x) {
  const lim = steerLimit(sim.count);
  return Math.max(-lim, Math.min(lim, x));
}

function keyboardSteer(dt) {
  const dir = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  if (dir) steerTarget = clampSteer(steerTarget + dir * 9 * dt);
}

// ---------- screens ----------

function show(id) {
  for (const s of ['menu', 'levelsScreen']) $(s).classList.toggle('hidden', s !== id);
}

function refreshMenu() {
  $('menuBest').textContent = save.best ? `Free Mode best: ${save.best.toLocaleString()}  ·  bosses ${save.bestBoss}` : '';
  const grid = $('grid');
  grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'lv' + (save.levels[i + 1] ? ' done' : '');
    b.disabled = i + 1 > save.unlocked;
    b.innerHTML = b.disabled ? '🔒' : `${i + 1}<small>${save.levels[i + 1] ? '★ ' + save.levels[i + 1] : ''}</small>`;
    b.title = lv.name;
    b.onclick = () => { sfx.unlock(); startLevel(i); };
    grid.appendChild(b);
  });
}

function toMenu() {
  run = null;
  paused = false;
  resultShown = false;
  $('hud').classList.add('hidden');
  $('soundBtn').classList.remove('hidden');
  $('pause').classList.add('hidden');
  $('result').classList.add('hidden');
  refreshMenu();
  show('menu');
  startDemo();
}

// The menu plays an autopiloted Free run behind it.
function startDemo() {
  sim = new Sim({ mode: 'free', seed: (Math.random() * 1e9) | 0 });
  renderer.reset(sim);
}

function startRun(newSim, r) {
  sim = newSim;
  run = r;
  paused = false;
  resultShown = false;
  steerTarget = 0;
  lastCount = sim.count;
  renderer.reset(sim);
  show(null);
  $('menu').classList.add('hidden');
  $('levelsScreen').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('result').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('soundBtn').classList.add('hidden');
  $('hint').classList.remove('hidden');
  $('bossBar').classList.add('hidden');
  const free = r.mode === 'free';
  $('progress').classList.toggle('hidden', free);
  $('score').classList.toggle('hidden', !free);
  $('title').textContent = free ? 'FREE' : `${r.levelIndex + 1}. ${LEVELS[r.levelIndex].name}`;
  updateCount(true);
}

function startLevel(i) {
  startRun(new Sim({ mode: 'level', level: LEVELS[i], seed: 1000 + i }), { mode: 'level', levelIndex: i });
}

function startFree() {
  startRun(new Sim({ mode: 'free', seed: (Math.random() * 1e9) | 0 }), { mode: 'free' });
}

function restart() {
  if (run.mode === 'free') startFree(); else startLevel(run.levelIndex);
}

function setPaused(p) {
  paused = p;
  drag = null;
  $('pause').classList.toggle('hidden', !p);
}

function showResult() {
  resultShown = true;
  $('toast').classList.remove('show');
  const rows = [];
  let title, cls, main, mainAction, best = false;
  if (run.mode === 'level') {
    const i = run.levelIndex;
    if (sim.status === 'won') {
      title = 'Level clear!'; cls = 'win';
      save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, i + 2));
      best = sim.count > (save.levels[i + 1] || 0);
      if (best) save.levels[i + 1] = sim.count;
      writeSave(save);
      rows.push(['Survivors', sim.count], ['Zombies', sim.kills]);
      if (i + 1 < LEVELS.length) { main = 'Next level'; mainAction = () => startLevel(i + 1); }
      else { main = 'Play Free Mode'; mainAction = startFree; rows.push(['', 'All levels cleared!']); }
    } else {
      title = 'Squad wiped out'; cls = 'lose';
      rows.push(['Distance', `${Math.floor(sim.distance)} m`], ['Zombies', sim.kills]);
      main = 'Try again'; mainAction = restart;
    }
  } else {
    title = 'Game over'; cls = 'lose';
    const score = sim.finalScore;
    best = score > save.best;
    if (best) save.best = score;
    save.bestBoss = Math.max(save.bestBoss, sim.bossesBeaten);
    writeSave(save);
    rows.push(['Score', score.toLocaleString()], ['Distance', `${Math.floor(sim.distance)} m`],
      ['Bosses beaten', sim.bossesBeaten], ['Zombies', sim.kills], ['Best', save.best.toLocaleString()]);
    main = 'Run again'; mainAction = startFree;
  }
  $('resTitle').textContent = title;
  $('resTitle').className = cls;
  $('resRows').innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  $('resBest').classList.toggle('hidden', !best);
  $('resMain').textContent = main;
  $('resMain').onclick = mainAction;
  $('resRetry').classList.toggle('hidden', sim.status !== 'won' || run.mode === 'free');
  $('result').classList.remove('hidden');
}

// ---------- HUD ----------

let toastTimer = 0;
function toast(text, danger = false, secs = 1.6) {
  const t = $('toast');
  t.textContent = text;
  t.classList.toggle('danger', danger);
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  toastTimer = secs;
}

function floater(text, x, y, good) {
  const el = document.createElement('div');
  el.className = 'floater ' + (good ? 'good' : 'bad');
  el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function updateCount(force) {
  const el = $('count'), n = sim.count;
  if (n !== lastCount || force) {
    el.textContent = n;
    el.classList.remove('bump', 'hurt'); void el.offsetWidth;
    if (!force) el.classList.add(n > lastCount ? 'bump' : 'hurt');
    lastCount = n;
  }
  const sq = sim.squad;
  const p = renderer.project(sq.x, 1.1, sq.d + squadRadius(n) * 0.6);
  el.style.left = p.x + 'px';
  el.style.top = (p.y - 6) + 'px';
  el.classList.toggle('hidden', n === 0);
}

function updateHud(dt) {
  if (run.mode === 'level') {
    $('progFill').style.width = Math.min(100, (sim.distance / (sim.goalD - 14)) * 100) + '%';
  } else {
    $('score').textContent = sim.finalScore.toLocaleString();
  }
  const b = sim.boss;
  $('bossBar').classList.toggle('hidden', !b);
  if (b) {
    $('bossFill').style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
  }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
  updateCount(false);
}

// ---------- fx → sound and HUD ----------

function handleFx() {
  let splats = 0;
  for (const f of sim.fx) {
    renderer.handleFx(f);
    if (!run) continue; // the menu demo is silent
    switch (f.type) {
      case 'zombieDown': splats++; break;
      case 'soldierDown': if (!f.quiet) sfx.ouch(); break;
      case 'gate': {
        const good = f.after >= f.before;
        good ? sfx.gateGood(f.after >= f.before * 2) : sfx.gateBad();
        const p = renderer.project(f.x, 2.2, f.d);
        floater(gateLabel(f.gate), p.x, p.y, good);
        break;
      }
      case 'gateTick': sfx.gateTick(); break;
      case 'bossSpawn':
        toast(run.mode === 'free' ? `⚠ BOSS ${f.tier} ⚠` : '⚠ BOSS AHEAD ⚠', true, 2);
        $('bossName').textContent = run.mode === 'free' ? `BOSS ${f.tier}` : `BOSS · ${LEVELS[run.levelIndex].name.toUpperCase()}`;
        sfx.roar();
        break;
      case 'telegraph': sfx.warn(); break;
      case 'roar': sfx.roar(); break;
      case 'boom': sfx.boom(); break;
      case 'bossDown':
        sfx.victory();
        if (run.mode === 'free') toast(`BOSS DOWN! +${(500 * f.tier).toLocaleString()}`, false, 2);
        break;
      case 'won': toast('VICTORY!', false, 2); break;
      case 'lost': sfx.lose(); break;
    }
  }
  if (splats && run) sfx.splat();
  if (run) sfx.shots(sim.shots);
  sim.shots = 0;
  sim.fx.length = 0;
}

// ---------- loop ----------

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const playing = run && !paused;
  if (!run || BOT) steerTarget = botTarget(sim);
  else if (playing) keyboardSteer(dt);
  if (!run || playing) {
    sim.steer(steerTarget);
    // Fixed small steps keep the simulation the same at any frame rate.
    let left = dt;
    while (left > 1e-4) { const step = Math.min(left, 1 / 60); sim.update(step); left -= step; }
    handleFx();
  }
  if (!run && sim.status !== 'running' && sim.endTimer > 1.5) startDemo();
  renderer.draw(sim, playing || !run ? dt : 0);
  if (run) {
    updateHud(dt);
    if (sim.status !== 'running' && !resultShown && sim.endTimer > 1.3) showResult();
  }
}

// ---------- wiring ----------

$('playLevels').onclick = () => { sfx.unlock(); refreshMenu(); show('levelsScreen'); };
$('playFree').onclick = () => { sfx.unlock(); startFree(); };
$('levelsBack').onclick = () => show('menu');
$('pauseBtn').onclick = () => setPaused(true);
$('resumeBtn').onclick = () => setPaused(false);
$('restartBtn').onclick = restart;
$('quitBtn').onclick = toMenu;
$('resRetry').onclick = restart;
$('resMenu').onclick = toMenu;
const soundBtn = $('soundBtn');
const paintSound = () => {
  soundBtn.textContent = sfx.muted ? '🔇' : '🔊';
  $('pauseSound').textContent = sfx.muted ? 'Sound: off' : 'Sound: on';
};
const toggleSound = () => { sfx.unlock(); sfx.muted = !sfx.muted; save.sound = !sfx.muted; writeSave(save); paintSound(); };
soundBtn.onclick = toggleSound;
$('pauseSound').onclick = toggleSound;
paintSound();

toMenu();
const lv = +params.get('level');
if (lv >= 1 && lv <= LEVELS.length) startLevel(lv - 1);
else if (params.get('mode') === 'free') startFree();
requestAnimationFrame(frame);

// Handy for poking at the game from devtools and the headless smoke test.
window.__squad = { get sim() { return sim; }, get run() { return run; }, startLevel, startFree };
