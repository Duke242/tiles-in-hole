import { CITY, NEED, VALUE } from '../game/tune.js';
import { Field } from './field.js';
import { createGiant, GIANT_TYPES } from './giants.js';
import { districtTexture } from './ground.js';
import * as M from './models.js';

const { N, P, RW, INNER } = CITY;
const { rand, irand, pick } = M;

const DISTRICTS = {
  downtown:    { ground: '#3fcb4a' },
  commercial:  { ground: '#41cd4c' },
  residential: { ground: '#43d24e' },
  park:        { ground: '#3ac545' },
};

// Blocks are typed by distance from the centre: towers downtown, houses out
// in the suburbs, with parks and plazas sprinkled through.
function planBlocks() {
  const blocks = [];
  const mid = (N - 1) / 2;
  for (let bz = 0; bz < N; bz++) {
    for (let bx = 0; bx < N; bx++) {
      const dist = Math.max(Math.abs(bx - mid), Math.abs(bz - mid));
      let kind;
      if (dist <= 0.6) kind = 'downtown';
      else if (dist <= 1.7) kind = Math.random() < 0.55 ? 'commercial' : 'downtown';
      else kind = Math.random() < 0.86 ? 'residential' : 'commercial';
      blocks.push({ bx, bz, kind, ground: DISTRICTS[kind].ground, giant: false, alive: 0 });
    }
  }
  // Carve out parks, never in the very centre (that is the skyline).
  let parks = 0, guard = 0;
  while (parks < 10 && guard++ < 260) {
    const i = irand(0, N * N - 1);
    const bl = blocks[i];
    const dist = Math.max(Math.abs(bl.bx - mid), Math.abs(bl.bz - mid));
    if (dist < 1.5 || bl.kind === 'park') continue;
    bl.kind = 'park'; bl.ground = DISTRICTS.park.ground; parks++;
  }
  return blocks;
}

export function buildWorld(scene) {
  const blocks = planBlocks();
  const objects = [];
  const giants = [];

  const staticField = new Field(scene, 68000, { cast: true, receive: true, occlude: true });
  const dynField = new Field(scene, 14000, { cast: true, receive: true, dynamic: true, occlude: true });

  let totalValue = 0;

  function place(kind, model, x, z, yaw, field, extra = {}) {
    const ref = field.alloc(model.parts);
    if (!ref) return null;
    const value = VALUE[kind] ?? 2;
    const o = {
      kind, x, z, yaw, ref, field,
      radius: model.radius, height: model.height, color: model.color,
      need: NEED[kind] ?? 0, value,
      state: 'idle', y: 0, pitch: 0, roll: 0, scale: 1,
      vx: 0, vz: 0, spin: rand(2.5, 5.5) * (Math.random() < 0.5 ? -1 : 1),
      shake: 0, t: 0,
      ...extra,
    };
    field.write(ref, x, 0, z, yaw, 1);
    objects.push(o);
    totalValue += value;
    return o;
  }

  // --- per-block contents -------------------------------------------------
  const giantBlocks = [];
  const parkBlocks = blocks.filter(b => b.kind === 'park');
  for (const b of parkBlocks) { b.giant = true; giantBlocks.push(b); }

  const types = [...GIANT_TYPES].sort(() => Math.random() - 0.5);
  let gi = 0;

  for (const bl of blocks) {
    const ox = bl.bx * P + RW, oz = bl.bz * P + RW;   // block interior origin
    const cx = ox + INNER / 2, cz = oz + INNER / 2;
    const inX = (m = 3) => rand(ox + m, ox + INNER - m);
    const inZ = (m = 3) => rand(oz + m, oz + INNER - m);

    if (bl.giant) {
      const g = createGiant(scene, types[gi % types.length], cx, cz, rand(1.95, 2.45));
      gi++;
      const o = {
        kind: 'giant', x: cx, z: cz, yaw: g.yaw, giant: g,
        radius: g.radius, height: g.height, color: '#ffffff',
        need: NEED.giant, value: g.vox.length * 0.06,
        state: 'idle', ptr: 0, acc: 0, shake: 0, t: 0,
      };
      objects.push(o);
      giants.push(o);
      totalValue += o.value;
      for (let i = 0; i < 6; i++) place('tree', M.treeModel(), inX(4), inZ(4), rand(0, 6.28), staticField);
      for (let i = 0; i < 4; i++) place('bench', M.benchModel(), inX(5), inZ(5), rand(0, 6.28), staticField);
      continue;
    }

    if (bl.kind === 'park') {
      if (Math.random() < 0.55) place('shop', M.fountainModel(), cx, cz, 0, staticField);
      for (let i = 0; i < 16; i++)
        place('tree', Math.random() < 0.35 ? M.pineModel() : M.treeModel(), inX(3), inZ(3), rand(0, 6.28), staticField);
      for (let i = 0; i < 6; i++) place('bench', M.benchModel(), inX(5), inZ(5), rand(0, 6.28), staticField);
      for (let i = 0; i < 3; i++) place('bin', M.binModel(), inX(4), inZ(4), 0, staticField);
    } else if (bl.kind === 'downtown') {
      place('tower', M.towerModel(20, 30), ox + INNER * 0.28, oz + INNER * 0.3, 0, staticField);
      place('tower', M.towerModel(16, 25), ox + INNER * 0.74, oz + INNER * 0.32, 0, staticField);
      if (Math.random() < 0.7) place('lowrise', M.modernModel(), ox + INNER * 0.3, oz + INNER * 0.76, 0, staticField);
      else place('lowrise', M.apartmentModel(3, 5), ox + INNER * 0.3, oz + INNER * 0.76, 0, staticField);
      place('lowrise', M.apartmentModel(3, 5), ox + INNER * 0.75, oz + INNER * 0.76, 0, staticField);
      for (let i = 0; i < 5; i++) place('tree', M.treeModel(), inX(3), inZ(3), rand(0, 6.28), staticField);
    } else if (bl.kind === 'commercial') {
      if (Math.random() < 0.5) {
        place('lowrise', M.lBlockModel(), ox + INNER * 0.42, oz + INNER * 0.4, rand(0, 4) * Math.PI / 2, staticField);
      } else {
        place('lowrise', M.apartmentModel(3, 5), ox + INNER * 0.28, oz + INNER * 0.3, 0, staticField);
        place('lowrise', M.modernModel(), ox + INNER * 0.74, oz + INNER * 0.32, 0, staticField);
      }
      place('shop', M.shopRowModel(), ox + INNER * 0.28, oz + INNER * 0.78, 0, staticField);
      place('shop', M.shopRowModel(), ox + INNER * 0.72, oz + INNER * 0.78, 0, staticField);
      for (let i = 0; i < 5; i++) place('tree', M.treeModel(), inX(3), inZ(3), rand(0, 6.28), staticField);
      for (let i = 0; i < 3; i++) place('bike', M.bikeModel(), inX(4), inZ(4), rand(0, 6.28), staticField);
    } else {
      if (Math.random() < 0.45) {
        place('lowrise', M.lBlockModel(), ox + INNER * 0.45, oz + INNER * 0.42, rand(0, 4) * Math.PI / 2, staticField);
        place('shop', M.shopRowModel(), ox + INNER * 0.72, oz + INNER * 0.8, 0, staticField);
      } else {
        place('house', M.shopRowModel(), ox + INNER * 0.26, oz + INNER * 0.28, 0, staticField);
        place('house', M.shopRowModel(), ox + INNER * 0.74, oz + INNER * 0.28, 0, staticField);
        place('lowrise', M.apartmentModel(3, 4), ox + INNER * 0.3, oz + INNER * 0.76, 0, staticField);
        place('house', M.shopRowModel(), ox + INNER * 0.76, oz + INNER * 0.78, 0, staticField);
      }
      for (let i = 0; i < 7; i++) place('tree', M.treeModel(), inX(3), inZ(3), rand(0, 6.28), staticField);
    }

    // Street furniture along the block edges, facing the pavement.
    for (let i = 0; i < 7; i++) {
      const side = irand(0, 3);
      const t = rand(0.2, 0.8);
      let px, pz;
      if (side === 0) { px = ox + INNER * t; pz = oz - 1.6; }
      else if (side === 1) { px = ox + INNER * t; pz = oz + INNER + 1.6; }
      else if (side === 2) { px = ox - 1.6; pz = oz + INNER * t; }
      else { px = ox + INNER + 1.6; pz = oz + INNER * t; }
      const r = Math.random();
      if (r < 0.42) place('lamp', M.lampModel(), px, pz, 0, staticField);
      else if (r < 0.62) place('hydrant', M.hydrantModel(), px, pz, 0, staticField);
      else if (r < 0.82) place('bin', M.binModel(), px, pz, 0, staticField);
      else place('busStop', M.busStopModel(), px, pz, side < 2 ? 0 : Math.PI / 2, staticField);
    }

    // Traffic lights at the block's near corner.
    if (Math.random() < 0.55)
      place('trafficLight', M.trafficLightModel(), ox - 2.4, oz - 2.4, 0, staticField);

    // Crowds: the reference has people lining every pavement.
    for (let i = 0; i < 9; i++) {
      const o = place('person', M.personModel(), inX(2), inZ(2), rand(0, 6.28), dynField, {
        speed: rand(1.4, 2.6), wander: rand(0, 3), phase: rand(0, 9),
      });
      if (o) o.walk = 0;
    }
  }

  // --- traffic ------------------------------------------------------------
  // Lane centres: each road carries two opposing lanes.
  function spawnVehicle(kind, model) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const roadK = irand(0, N);
    const lane = Math.random() < 0.5 ? 0 : 1;
    const lanePos = roadK * P + (lane ? RW * 0.72 : RW * 0.28);
    const along = rand(-20, CITY.SPAN + 20);
    const x = axis === 'x' ? along : lanePos;
    const z = axis === 'x' ? lanePos : along;
    const dir = lane ? 1 : -1;
    const yaw = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    return place(kind, model, x, z, yaw, dynField, {
      axis, dir, speed: rand(9, 15) * dir,
    });
  }
  for (let i = 0; i < 96; i++) spawnVehicle('car', M.carModel());
  for (let i = 0; i < 16; i++) spawnVehicle('bus', M.busModel());
  for (let i = 0; i < 14; i++) spawnVehicle('truck', M.truckModel());

  staticField.flush();
  dynField.flush();

  return {
    blocks, objects, giants, staticField, dynField, totalValue,
    districtTex: districtTexture(blocks),
    totalCount: objects.length,
  };
}
