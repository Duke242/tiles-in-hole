// Pure rules for Squad Rush: gate maths, squad formation, enemy and boss
// stats, and the Free mode difficulty curve. No Three.js or DOM in here, so
// tests (and the headless balance runs) can use it directly.
import { makeRng } from '../core/rng.js';

export const LANE_HALF = 4;          // the road runs x in [-4, 4]
export const RUN_SPEED = 7;          // squad forward speed, units/s
export const MAX_SQUAD = 150;
export const FIRE_RATE = 2.5;        // shots per soldier per second
export const BULLET_SPEED = 42;
export const BULLET_RANGE = 24;
export const SOLDIER_SPACING = 0.42;
export const GATE_HITS_PER_STEP = 4; // bullets per step, plus the gate's value
export const GATE_GROWTH = 10;       // a gate can be shot up at most this much
export const GATE_CAP = 99;
export const BOSS_EVERY = 45;        // Free mode: seconds of running between bosses

// ---------- gates ----------

// '+5', '-3', 'x2', '/2' (also '×' and '÷') -> { op, n }
export function parseGate(s) {
  const m = /^([+\-x×/÷])\s*(\d+)$/.exec(String(s).trim());
  if (!m) throw new Error('bad gate: ' + s);
  const op = { '×': 'x', '÷': '/' }[m[1]] || m[1];
  return { op, n: +m[2] };
}

export function gateLabel(g) {
  return ({ '+': '+', '-': '−', x: '×', '/': '÷' })[g.op] + g.n;
}

export function isGoodGate(g) {
  return g.op === '+' || (g.op === 'x' && g.n >= 1);
}

export function applyGate(count, g) {
  let c = count;
  if (g.op === '+') c = count + g.n;
  else if (g.op === '-') c = count - g.n;
  else if (g.op === 'x') c = count * g.n;
  else if (g.op === '/') c = Math.floor(count / Math.max(1, g.n));
  return Math.max(0, Math.min(MAX_SQUAD, c));
}

// Shooting a gate nudges it in the player's favour: every few bullets a
// plus gate grows by one, and a minus gate shrinks until it flips to plus.
// Bigger numbers take more bullets per step, and a gate can only climb
// GATE_GROWTH steps in total. Multiply and divide gates just soak up bullets.
export function shootGate(g) {
  if (g.op !== '+' && g.op !== '-') return false;
  if ((g.steps || 0) >= GATE_GROWTH) return false;
  g.hits = (g.hits || 0) + 1;
  if (g.hits < GATE_HITS_PER_STEP + g.n) return false;
  g.hits = 0;
  g.steps = (g.steps || 0) + 1;
  if (g.op === '+') { if (g.n >= GATE_CAP) return false; g.n++; }
  else if (g.n > 1) g.n--;
  else { g.op = '+'; g.n = 1; }
  return true;
}

// ---------- squad ----------

// Sunflower packing: slot i of a squad, as an offset from the squad centre.
// Big squads pack tighter and stretch along the road (an oval, narrower
// than it is long) so even a full squad fits between the kerbs.
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export function squadSpacing(count) {
  return SOLDIER_SPACING - 0.09 * Math.min(1, Math.max(0, count - 40) / 110);
}
export function formationSlot(i, count = i + 1) {
  const r = Math.sqrt(i + 0.5) * squadSpacing(count);
  const a = i * GOLDEN;
  return { x: Math.cos(a) * r * 0.8, d: Math.sin(a) * r * 1.25 };
}
// Half-width of the squad across the road.
export function squadRadius(count) {
  return Math.sqrt(Math.max(1, count)) * squadSpacing(count) * 0.8;
}
// How far the squad centre may go so the blob stays (mostly) on the road.
export function steerLimit(count) {
  return Math.max(0.5, LANE_HALF - 0.35 - squadRadius(count) * 0.7);
}

// ---------- zombies ----------

export const ZOMBIES = {
  walker: { hp: 3,  speed: 1.4, r: 0.35, bite: 1, scale: 1.0, score: 10 },
  runner: { hp: 2,  speed: 3.4, r: 0.32, bite: 1, scale: 0.9, score: 15 },
  brute:  { hp: 20, speed: 0.9, r: 0.7,  bite: 4, scale: 1.9, score: 60 },
};

// ---------- bosses ----------

const BOSS_ATTACKS = ['spit', 'sweep', 'summon', 'charge'];

// Tier 1 is the first boss. Every tier has more HP, attacks more often, and
// unlocks one more attack until all four are in play; past that the numbers
// just keep climbing.
export function bossStats(tier) {
  const t = Math.max(1, tier);
  return {
    tier: t,
    hp: Math.round(600 * Math.pow(1.3, t - 1)),
    attacks: BOSS_ATTACKS.slice(0, Math.min(BOSS_ATTACKS.length, t)),
    interval: Math.max(1.4, 3.4 - 0.25 * (t - 1)),
    spitCount: Math.min(8, 2 + Math.floor(t / 2)),
    summonCount: Math.min(30, 4 + 2 * t),
    approach: 0.32 + 0.02 * Math.min(t, 10), // how fast it closes in, units/s
    crush: 4 + t,                            // soldiers lost per second in contact
    size: Math.min(2.4, 1.5 + 0.1 * t),
  };
}

// ---------- hazards ----------

// Boss attacks are telegraphed ground shapes that go off after a delay.
export function inHazard(h, x, d) {
  if (h.shape === 'circle') return (x - h.x) ** 2 + (d - h.d) ** 2 <= h.r * h.r;
  return x >= h.x0 && x <= h.x1 && d >= h.d0 && d <= h.d1;
}

// ---------- Free mode ----------

// Difficulty grows with running time and with every boss beaten.
export function freeDifficulty(runTime, bossesBeaten) {
  const D = 1 + runTime / 40 + bossesBeaten * 0.5;
  return {
    D,
    hordeSize: Math.round(5 + 4.5 * D),
    hpMul: 1 + 0.18 * (D - 1),
    runners: D >= 1.8,
    brutes: D >= 2.8,
  };
}

// Free mode squads are usually maxed out by the first boss, so its bosses
// start a tier up with much more HP, and keep growing past the last tier
// that adds a new attack. A run always ends eventually.
export function freeBoss(n) {
  const s = bossStats(n + 1);
  s.hp = Math.round(2000 * Math.pow(1.45, n - 1));
  s.tier = n;
  return s;
}

// One stretch of road: a gate pair, then one or two hordes. Returns events
// placed from startD on, plus where the next chunk should start.
export function freeChunk(rng, diff, startD, squadCount, first = false) {
  const ev = [];
  ev.push({ d: startD + 8, type: 'gates', ...freeGatePair(rng, diff, squadCount, first) });
  const hordes = diff.D > 2.2 && rng.chance(0.5) ? 2 : 1;
  let d = startD + 24;
  for (let i = 0; i < hordes; i++) {
    let kind = 'walker';
    const roll = rng.f();
    if (diff.brutes && roll < 0.18) kind = 'brute';
    else if (diff.runners && roll < 0.45) kind = 'runner';
    const base = kind === 'brute' ? Math.max(1, Math.round(diff.hordeSize / 7)) : diff.hordeSize;
    ev.push({ d, type: 'horde', kind, count: Math.round(base * rng.r(0.8, 1.2)),
      x: rng.r(-2.2, 2.2), spread: rng.r(1.6, 3.2), hpMul: diff.hpMul });
    d += 12;
  }
  return { events: ev, next: d + 6 };
}

function freeGatePair(rng, diff, count, first) {
  const goodN = () => rng.i(3, Math.round(6 + 4 * diff.D));
  const good = () => rng.chance(count > 12 ? 0.35 : 0.15) ? { op: 'x', n: rng.chance(0.75) ? 2 : 3 } : { op: '+', n: goodN() };
  const bad = () => count > 20 && rng.chance(0.3) ? { op: '/', n: 2 } : { op: '-', n: rng.i(2, Math.round(5 + 5 * diff.D)) };
  // A tiny squad never gets a pair with no way out.
  const roll = first ? 0.7 : count < 15 ? rng.f() * 0.85 : rng.f();
  let a, b;
  if (roll < 0.6) { a = good(); b = bad(); }
  else if (roll < 0.85) { a = good(); b = good(); }
  else { a = bad(); b = bad(); }
  return rng.chance(0.5) ? { left: a, right: b } : { left: b, right: a };
}

export function freeRng(seed = Date.now()) { return makeRng(seed); }
