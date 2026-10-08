import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGate, applyGate, shootGate, gateLabel, formationSlot, squadRadius, steerLimit,
  bossStats, freeBoss, freeDifficulty, freeChunk, inHazard, LANE_HALF, MAX_SQUAD, GATE_GROWTH,
} from '../src/squad/logic.js';
import { LEVELS } from '../src/squad/levels.js';
import { Sim, botTarget } from '../src/squad/sim.js';
import { makeRng } from '../src/core/rng.js';

function play(sim, maxSeconds) {
  while (sim.status === 'running' && sim.time < maxSeconds) {
    sim.steer(botTarget(sim));
    sim.update(1 / 60);
    sim.fx.length = 0;
  }
  return sim;
}

test('gates parse, print and apply', () => {
  assert.deepEqual(parseGate('+5'), { op: '+', n: 5 });
  assert.deepEqual(parseGate('×3'), { op: 'x', n: 3 });
  assert.deepEqual(parseGate('÷2'), { op: '/', n: 2 });
  assert.equal(gateLabel(parseGate('-4')), '−4');
  assert.equal(applyGate(3, parseGate('+5')), 8);
  assert.equal(applyGate(3, parseGate('-5')), 0, 'never below zero');
  assert.equal(applyGate(7, parseGate('/2')), 3, 'division rounds down');
  assert.equal(applyGate(100, parseGate('x3')), MAX_SQUAD, 'capped');
  assert.throws(() => parseGate('*2'));
});

test('shooting a gate improves it, slower for big numbers, up to a limit', () => {
  const plus = parseGate('+2');
  let steps = 0;
  for (let i = 0; i < 6; i++) steps += shootGate(plus);
  assert.equal(plus.n, 3, '+2 needs 6 bullets for one step');
  assert.equal(steps, 1);
  for (let i = 0; i < 1000; i++) shootGate(plus);
  assert.equal(plus.n, 2 + GATE_GROWTH);

  const minus = parseGate('-2');
  for (let i = 0; i < 200; i++) shootGate(minus);
  assert.equal(minus.op, '+', 'a minus gate shot enough flips to plus');

  const mul = parseGate('x2');
  for (let i = 0; i < 100; i++) shootGate(mul);
  assert.deepEqual([mul.op, mul.n], ['x', 2], 'multipliers only soak bullets');
});

test('a full squad fits on the road', () => {
  for (const n of [1, 10, 50, MAX_SQUAD]) {
    let maxX = 0;
    for (let i = 0; i < n; i++) maxX = Math.max(maxX, Math.abs(formationSlot(i, n).x));
    assert.ok(maxX <= squadRadius(n) + 1e-9, `slots stay within the radius (${n})`);
  }
  assert.ok(squadRadius(MAX_SQUAD) < LANE_HALF);
  assert.ok(steerLimit(MAX_SQUAD) > 0);
});

test('bosses get tougher every tier and unlock attacks', () => {
  for (let t = 1; t < 12; t++) {
    assert.ok(bossStats(t + 1).hp > bossStats(t).hp);
    assert.ok(bossStats(t + 1).interval <= bossStats(t).interval);
    assert.ok(freeBoss(t + 1).hp > freeBoss(t).hp);
  }
  assert.deepEqual(bossStats(1).attacks, ['spit']);
  assert.equal(bossStats(4).attacks.length, 4);
});

test('Free mode difficulty climbs with time and bosses beaten', () => {
  assert.ok(freeDifficulty(60, 0).hordeSize > freeDifficulty(0, 0).hordeSize);
  assert.ok(freeDifficulty(60, 2).hpMul > freeDifficulty(60, 0).hpMul);
  assert.ok(freeDifficulty(200, 0).brutes && !freeDifficulty(0, 0).brutes);
});

test('the first Free mode gate pair always has a way forward for one soldier', () => {
  for (let seed = 1; seed < 200; seed++) {
    const { events } = freeChunk(makeRng(seed), freeDifficulty(0, 0), 25, 1, true);
    const g = events.find((e) => e.type === 'gates');
    assert.ok(Math.max(applyGate(1, g.left), applyGate(1, g.right)) >= 1, `seed ${seed}`);
  }
});

test('hazard shapes', () => {
  assert.ok(inHazard({ shape: 'circle', x: 0, d: 10, r: 1 }, 0.5, 10.5));
  assert.ok(!inHazard({ shape: 'circle', x: 0, d: 10, r: 1 }, 1, 11));
  assert.ok(inHazard({ shape: 'rect', x0: -4, x1: 0, d0: 5, d1: 9 }, -1, 6));
  assert.ok(!inHazard({ shape: 'rect', x0: -4, x1: 0, d0: 5, d1: 9 }, 1, 6));
});

test('level data is well formed', () => {
  assert.equal(LEVELS.length, 10);
  for (const [i, lv] of LEVELS.entries()) {
    assert.ok(lv.name && lv.start >= 1, `level ${i + 1}`);
    for (let k = 1; k < lv.events.length; k++) assert.ok(lv.events[k].d > lv.events[k - 1].d, `level ${i + 1} sorted`);
    assert.equal(lv.events.at(-1).type, 'boss', `level ${i + 1} ends with a boss`);
    assert.equal(lv.events.filter((e) => e.type === 'boss').length, 1);
  }
});

test('the simulation is deterministic for a seed', () => {
  const a = play(new Sim({ mode: 'level', level: LEVELS[2], seed: 7 }), 90);
  const b = play(new Sim({ mode: 'level', level: LEVELS[2], seed: 7 }), 90);
  assert.deepEqual([a.status, a.count, a.kills, a.time], [b.status, b.count, b.kills, b.time]);
});

test('every level can be beaten by the autopilot', () => {
  for (const [i, lv] of LEVELS.entries()) {
    const wins = [1, 2, 3].filter((seed) => play(new Sim({ mode: 'level', level: lv, seed }), 150).status === 'won').length;
    assert.ok(wins >= 2, `level ${i + 1}: ${wins}/3 wins`);
  }
});

test('picking the worse gate every time loses most levels', () => {
  let lost = 0;
  for (const lv of LEVELS) {
    const sim = new Sim({ mode: 'level', level: lv, seed: 1 });
    while (sim.status === 'running' && sim.time < 150) {
      const g = sim.gates.find((g) => !g.passed && g.d > sim.squad.d && g.d - sim.squad.d < 30);
      if (g) sim.steer(applyGate(sim.count, g.left) < applyGate(sim.count, g.right) ? -2 : 2);
      else sim.steer(botTarget(sim));
      sim.update(1 / 60);
      sim.fx.length = 0;
    }
    if (sim.status === 'lost') lost++;
  }
  assert.ok(lost >= 7, `only ${lost}/10 levels punish bad gate choices`);
});

test('Free mode keeps sending bosses until the squad falls', () => {
  const sim = new Sim({ mode: 'free', seed: 3 });
  const tiers = [];
  while (sim.status === 'running' && sim.time < 900) {
    sim.steer(botTarget(sim));
    sim.update(1 / 60);
    for (const f of sim.fx) if (f.type === 'bossSpawn') tiers.push(f.tier);
    sim.fx.length = 0;
  }
  assert.equal(sim.status, 'lost', 'an endless run does end');
  assert.ok(sim.bossesBeaten >= 1, 'the autopilot beats at least the first boss');
  assert.deepEqual(tiers, tiers.map((_, i) => i + 1), 'bosses come in order: 1, 2, 3...');
  assert.ok(sim.finalScore > 0);
});
