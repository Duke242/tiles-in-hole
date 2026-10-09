import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildWorld } from '../src/world/build.js';
import { Field } from '../src/world/field.js';
import { Rigid } from '../src/game/rigid.js';
import { Sculpt } from '../src/world/voxel.js';
import { buildSculpt } from '../src/world/sculpts.js';
import { GIANTS } from '../src/world/giants.js';
import { THEMES } from '../src/world/themes.js';
import { generateFreeMap, FREE_MAPS } from '../src/levels/freeplay.js';
import { makeRng } from '../src/core/rng.js';

const canvasContext = new Proxy({}, { get: (target, key) => target[key]
  ?? (key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}) });
globalThis.document = { createElement: () => ({ getContext: () => canvasContext }) };
await Rigid.init();
const scene = new THREE.Scene();
const rigid = new Rigid(scene);
const fields = { cube: new Field(scene, 90000), bead: new Field(scene, 20000, { shape: 'bead' }) };
test.afterEach(() => rigid.reset());
test.after(() => { rigid.events.free(); rigid.world.free(); });

function setup(model, { x = 0, z = 0 } = {}) {
  let credited = 0;
  const prop = { x, z, yaw: 0, model };
  buildWorld({ props: [prop], tiles: [], board: { w: 320, d: 320 } }, fields, rigid);
  rigid.onConsumed = () => credited++;
  return { prop, credited: () => credited };
}
const run = (hole, frames) => { for (let i = 0; i < frames; i++) rigid.update(1 / 60, hole); };

test('a wide bite under a long wall drops the columns over the gap, not the whole wall', () => {
  const s = new Sculpt();
  s.box(0, 3, 0, 15, 3, 0, '#ff8844');
  const { prop } = setup(s.build({ kind: 'wall' }));
  rigid.update(1 / 60, { x: 0, z: 0, r: 7 });
  const blocks = [...prop.structure.blocks];
  const at = (x) => blocks.filter((b) => b.local.x === x);
  for (const x of [-15, -10, 10, 15]) assert.ok(at(x).every((b) => b.attached), `column ${x} stands`);
  for (const x of [-1, 0, 1]) assert.ok(at(x).every((b) => !b.attached), `column ${x} falls`);
});

test('a mass collapse over the pit falls without bodies and is all credited', () => {
  const s = new Sculpt();
  s.box(0, 9.5, 0, 4, 9.5, 4, '#ff8844', { hollow: 1 });
  const model = s.build({ kind: 'tower' });
  const { prop, credited } = setup(model);
  rigid.update(1 / 60, { x: 0, z: 0, r: 8 });
  assert.ok(rigid.falling.size > 100);
  assert.ok(rigid.nLive < 120, 'falling blocks have no bodies');
  run({ x: 0, z: 0, r: 8 }, 120);
  assert.equal(credited(), model.count);
  assert.equal(prop.state, 'gone');
  assert.equal(rigid.falling.size, 0);
});

test('a falling block the hole slides away from lands as a body unless it is in the ground', () => {
  const s = new Sculpt();
  s.box(0, 9.5, 0, 4, 9.5, 4, '#ff8844', { hollow: 1 });
  setup(s.build({ kind: 'tower' }));
  rigid.update(1 / 60, { x: 0, z: 0, r: 8 });
  const n = rigid.falling.size;
  rigid.update(1 / 60, { x: 60, z: 0, r: 8 });
  assert.ok(rigid.falling.size < n / 5);
  for (const b of rigid.falling) assert.ok(b.y <= 0.5, 'only blocks already in the ground keep falling');
  assert.ok(rigid.nLive >= n - rigid.falling.size);
});

test('hollow cones keep their tip', () => {
  const s = new Sculpt();
  s.cone(0, 0, 0, 4, 0.6, 9, '#ff8844', { hollow: 1.2 });
  const top = s.build({}).vox.filter((v) => v.y === 9);
  assert.equal(top.length, 1);
});

test('the magnet only tears blocks off near the rim', () => {
  const s = new Sculpt();
  s.box(0, 0, 0, 0, 0, 0, '#ff8844');
  const { prop } = setup(s.build({ kind: 'one' }), { x: 30 });
  rigid.magnet({ x: 0, z: 0, r: 2 }, 40, 0.1);
  assert.ok([...prop.structure.blocks].every((b) => b.attached));
});

test('every giant stands as built and fits the voxel pool', () => {
  const themeOf = {};
  for (const m of FREE_MAPS) for (const [kind] of m.giants || []) themeOf[kind] = m.world;
  for (const kind of Object.keys(GIANTS)) {
    assert.ok(themeOf[kind], `${kind} is on a map`);
    const P = THEMES.find((t) => t.id === themeOf[kind]).P;
    const model = buildSculpt(kind, makeRng(7), P);
    assert.ok(model.count > 300 && model.count < 4000, `${kind}: ${model.count} blocks`);
    const { prop } = setup(model);
    rigid.update(1 / 60, { x: 200, z: 200, r: 20 });
    assert.ok([...prop.structure.blocks].every((b) => b.attached), kind);
    assert.equal(rigid.propVoxels.size, model.count);
    rigid.reset();
  }
});

test('every free-play map places its giants on the board within the voxel pool', () => {
  for (const m of FREE_MAPS) {
    const theme = THEMES.find((t) => t.id === (m.world || 'city'));
    const level = generateFreeMap({ seed: 99, theme, ...m, map: m.id, voxCap: 90000, beadCap: 20000 });
    const want = (m.giants || []).reduce((n, g) => n + g[1], 0);
    const giants = level.props.filter((p) => p.model.giant);
    assert.ok(giants.length >= want * 0.8, `${m.id}: ${giants.length}/${want} giants`);
    let cubes = 0;
    for (const p of level.props) {
      cubes += p.model.vox.length;
      assert.ok(Math.abs(p.x) + p.model.radius <= level.board.w / 2 + 1);
      assert.ok(Math.abs(p.z) + p.model.radius <= level.board.d / 2 + 1);
    }
    assert.ok(cubes < 90000);
    assert.equal(level.map, m.id);
    assert.ok(level.tiles.length > 5000);
  }
});

test('a runaway body is slowed before the step instead of flying off to infinity', () => {
  const s = new Sculpt();
  s.paint(0, 3, 0, '#ff8844');
  setup(s.build({ kind: 'one' }));
  const b = [...rigid.propVoxels][0];
  rigid._damage(b);
  b.body.setLinvel({ x: 1e6, y: 0, z: 0 }, true); b.asleep = false;
  rigid.update(1 / 60, { x: 50, z: 50, r: 1 });
  const v = b.body.linvel();
  assert.ok(Math.hypot(v.x, v.y, v.z) <= 81);
});

test('removed and reset blocks drop their stale body handles', () => {
  const s = new Sculpt();
  s.box(0, 9.5, 0, 4, 9.5, 4, '#ff8844', { hollow: 1 });
  setup(s.build({ kind: 'tower' }));
  rigid.update(1 / 60, { x: 30, z: 0, r: 3 });
  for (let i = 0; i < 60; i++) rigid.update(1 / 60, { x: 3, z: 0, r: 3 });
  const live = [...rigid.live];
  assert.ok(live.length > 0);
  rigid.reset();
  for (const b of live) assert.equal(b.body, null);
});
