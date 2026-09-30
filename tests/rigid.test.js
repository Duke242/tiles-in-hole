import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Rigid, L_DISC, L_DICE } from '../src/game/rigid.js';

// The atlas is drawn by the real painters; these tests exercise physics and
// instance-buffer data without needing a WebGL or browser window.
const canvasContext = new Proxy({}, { get: (target, key) => target[key]
  ?? (key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}) });
globalThis.document = { createElement: () => ({ getContext: () => canvasContext }) };
await Rigid.init();
const rigid = new Rigid(new THREE.Scene());
const hole = { x: 0, z: 0, r: 1 };
test.afterEach(() => rigid.reset());
test.after(() => { rigid.events.free(); rigid.world.free(); });

function clearUploads() {
  for (const l of rigid.layers) {
    l.mesh.instanceMatrix.clearUpdateRanges();
    l.mesh.instanceColor.clearUpdateRanges();
    l.icon?.clearUpdateRanges();
  }
}

test('large maps only inspect dormant tiles in nearby cells', () => {
  const near = rigid.spawnTile(1, 1, 0, L_DISC, 0);
  let farReads = 0;
  for (let i = 0; i < 6000; i++) {
    const b = rigid.spawnTile(100 + i % 80 * 2, 1, 100 + Math.floor(i / 80) * 2, L_DISC, 0);
    const px = b.px;
    Object.defineProperty(b, 'px', { get() { farReads++; return px; } });
  }
  rigid.update(1 / 60, hole);
  assert.ok(near.body);
  assert.equal(rigid.nTiles, 6001);
  assert.equal(rigid.nLive, 1);
  assert.equal(farReads, 0);
});

test('streaming uses the same circular range across cell boundaries', () => {
  const records = [];
  for (let x = -30; x <= 30; x += 3) for (let z = -30; z <= 30; z += 3) {
    records.push(rigid.spawnTile(x, 1, z, L_DISC, 0));
  }
  const h = { x: -12.1, z: 12.1, r: 1.5 };
  const expected = new Set(records.filter(b => (b.px-h.x)**2 + (b.pz-h.z)**2 < (h.r*2+7)**2));
  rigid.update(0, h);
  assert.deepEqual(rigid.live, expected);
});

test('a settled tile stores its current pose and can rematerialize there', () => {
  const b = rigid.spawnTile(6, 1, 0, L_DICE, 0);
  rigid.update(0, hole);
  b.body.setTranslation({ x: 30, y: 2, z: 0 }, false);
  b.body.sleep(); b.asleep = true;
  rigid._dematerialize(b);
  assert.equal(b.px, 30);
  assert.equal(b.body, null);
  rigid.update(0, {x:30,z:0,r:1});
  assert.ok(b.body);
  assert.equal(b.body.translation().x, 30);
  assert.equal(rigid.nLive, 1);
});

test('magnet activates only nearby tiles and applies its impulse', () => {
  const near = rigid.spawnTile(-4, 1, 0, L_DISC, 0);
  const far = rigid.spawnTile(50, 1, 0, L_DISC, 0);
  rigid.magnet(hole, 8, 0.06);
  assert.ok(near.body.linvel().x > 0);
  assert.equal(near.asleep, false);
  assert.equal(far.body, null);
});

test('physics advances 60 steps per second at 30 through 144 Hz and caps stalls', () => {
  const step = rigid.world.step;
  let steps = 0;
  rigid.world.step = () => steps++;
  try {
    for (const hz of [30, 60, 120, 144]) {
      rigid.accumulator = 0; steps = 0;
      for (let i = 0; i < hz; i++) rigid.update(1 / hz, hole);
      assert.equal(steps, 60, `${hz} Hz`);
    }
    steps = 0; rigid.update(1, hole);
    assert.equal(steps, 3);
    assert.ok(rigid.accumulator < 1e-9);
  } finally { rigid.world.step = step; }
});

test('matrix uploads cover only changed slots without changing tile geometry', () => {
  const b = rigid.spawnTile(0, 1, 0, L_DICE, 3, {yaw:0.3,scale:2,tall:3});
  const l = rigid.layers[L_DICE];
  const matrix = l.mesh.instanceMatrix.array.slice(0,16);
  clearUploads();
  rigid._writeSlot(l,b);
  assert.deepEqual(l.mesh.instanceMatrix.array.slice(0,16), matrix);
  assert.deepEqual(l.mesh.instanceMatrix.updateRanges, [{start:0,count:16}]);
  assert.ok(l.mesh.instanceMatrix.array.length > 16);
});

test('swap removal preserves the moved tile matrix, icon, color, and indexes', () => {
  const a = rigid.spawnTile(0, 1, 0, L_DISC, 0);
  const b = rigid.spawnTile(30, 2, 0, L_DISC, 3);
  const l = rigid.layers[L_DISC];
  const matrix = l.mesh.instanceMatrix.array.slice(16,32);
  const color = l.mesh.instanceColor.array.slice(3,6);
  rigid.update(0, hole); clearUploads();
  rigid._remove(L_DISC,a.slot);
  assert.equal(rigid.live.has(a),false);
  assert.equal(b.slot,0);
  assert.deepEqual(l.mesh.instanceMatrix.array.slice(0,16),matrix);
  assert.deepEqual(l.mesh.instanceColor.array.slice(0,3),color);
  assert.equal(l.icon.array[0],3);
  assert.deepEqual(l.mesh.instanceMatrix.updateRanges,[{start:0,count:16}]);
  assert.deepEqual(l.icon.updateRanges,[{start:0,count:1}]);
  rigid.update(0,{x:30,z:0,r:1});
  assert.ok(b.body);
});

test('falling tiles are consumed once and removed from physics and render pools', () => {
  let eaten = 0;
  rigid.onConsumed = () => eaten++;
  rigid.spawnTile(0, 0.4, 0, L_DISC, 0);
  for (let i=0;i<240;i++) rigid.update(1/60,hole);
  assert.equal(eaten,1);
  assert.equal(rigid.nTiles,0);
  assert.equal(rigid.nLive,0);
  assert.equal(rigid.dormant.size,0);
  rigid.onConsumed = null;
});

test('tiles woken by contacts update their visible pose', () => {
  const b = rigid.spawnTile(6,1,0,L_DISC,0);
  rigid.update(0,hole);
  assert.equal(b.asleep,true);
  b.body.setTranslation({x:6,y:2,z:0},true);
  rigid.update(1/60,hole);
  assert.equal(b.asleep,false);
  const l=rigid.layers[L_DISC];
  assert.ok(Math.abs(l.mesh.instanceMatrix.array[b.slot*16+13]-b.body.translation().y)<1e-5);
});

test('sleeping tiles stream out beyond the drop ring and reset clears indexes', () => {
  const b = rigid.spawnTile(6,1,0,L_DISC,0);
  rigid.update(0,hole);
  assert.ok(b.body);
  rigid.update(0,{x:100,z:0,r:1});
  assert.equal(b.body,null);
  assert.equal(rigid.nLive,0);
  assert.equal(rigid.dormant.size,1);
  rigid.reset();
  assert.equal(rigid.dormant.size,0);
  assert.equal(rigid.nAct,0);
  rigid.update(1/60,hole);
  assert.equal(rigid.nLive,0);
});

test('batched upload ranges retain every edited matrix until rendering', () => {
  const tiles = Array.from({length:100},(_,i)=>rigid.spawnTile(i*2,1,30,L_DISC,0));
  const l=rigid.layers[L_DISC];
  clearUploads();
  for (const i of Array.from({length:100},(_,i)=>(i*37)%100)) rigid._writeSlot(l,tiles[i]);
  const ranges=l.mesh.instanceMatrix.updateRanges;
  assert.ok(ranges.length<=64);
  for (let i=0;i<100;i++) assert.ok(ranges.some(r=>r.start<=i*16 && r.start+r.count>=(i+1)*16));
});

test('settled tiles are not repeatedly awakened merely by being nearby',()=>{
  const b=rigid.spawnTile(1.6,0.42,0,L_DICE,0);
  rigid.update(0,hole);
  let wakes=0;
  const wake=b.body.wakeUp.bind(b.body);
  b.body.wakeUp=()=>{wakes++;wake();};
  for(let i=0;i<300;i++) rigid.update(1/60,hole);
  assert.equal(b.body.isSleeping(),true);
  assert.equal(wakes,0);
  const settled={...b.body.translation()};
  for(let i=0;i<120;i++) rigid.update(1/60,hole);
  assert.deepEqual({...b.body.translation()},settled);
  assert.ok(Math.abs(settled.x-1.6)<0.02,JSON.stringify(settled));
});
