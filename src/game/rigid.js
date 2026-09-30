import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeVoxelMaterial, VOX_SCALE } from '../world/material.js';
import { discGeometry, diceGeometry, makeIconMaterial, makeSideMaterial, DISC_R, DISC_H, DICE_S, TILE_TYPES } from '../world/tiles.js';

// Everything that can fall is a Rapier rigid body: every picture tile on the
// board and every block in a structure (asleep until the hole comes near).
// The hole is a real pit in the ground, a heightfield patch that moves
// with it, so a tile hanging over the rim tips in the way it should, and a
// stack standing over the void drops as one column.
//
// Rapier charges for every body in the world, asleep or not, so tiles are
// streamed: a tile far from the hole is dormant (an instance with a stored
// pose and no body at all), gets a body when the hole comes within reach,
// and drops it again once it has settled far away. A big board therefore
// costs what is near the hole, not what is on it.

export const L_CUBE = 0, L_BEAD = 1, L_DISC = 2, L_DICE = 3;

const G_GROUND = (0x0001 << 16) | 0x0002;   // flat board: bodies only
const G_PIT = (0x0004 << 16) | 0x0002;      // pit patch: bodies only
const G_ON = (0x0002 << 16) | 0x0003;       // supported body: board + bodies
const G_OFF = (0x0002 << 16) | 0x0006;      // body over the hole: bodies + pit

const PIT_N = 56;
const CELL_SIZE = 12;
const STEP = 1 / 60;
const BREAK_FORCE = 100;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// Preserve the same instance data, but upload only slots that changed.
function dirtyRange(attr, start, count) {
  if (attr.updateRanges.length >= 64) {
    let end = start + count;
    for (const range of attr.updateRanges) {
      start = Math.min(start, range.start);
      end = Math.max(end, range.start + range.count);
    }
    attr.clearUpdateRanges();
    count = end - start;
  }
  attr.addUpdateRange(start, count);
  attr.needsUpdate = true;
}

export class Rigid {
  static async init() { await RAPIER.init(); }

  constructor(scene, { caps = [1200, 500, 7000, 5000] } = {}) {
    this.dormant = new Map();
    this.live = new Set();
    this.propVoxels = new Set();
    this.colliderRecords = new Map();
    this.events = new RAPIER.EventQueue(true);
    this.accumulator = 0;
    this.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.world.timestep = 1 / 60;

    const g = RAPIER.ColliderDesc.cuboid(1200, 1, 1200).setTranslation(0, -1, 0).setFriction(0.8).setRestitution(0.02);
    g.setCollisionGroups(G_GROUND);
    this.world.createCollider(g);

    this.pitHeights = new Float32Array((PIT_N + 1) * (PIT_N + 1));
    const pd = RAPIER.ColliderDesc.heightfield(PIT_N, PIT_N, this.pitHeights, { x: 4, y: 1, z: 4 }).setFriction(0.5);
    pd.setCollisionGroups(G_PIT);
    this.pit = this.world.createCollider(pd);
    this.pitR = 0;
    this._setPit(1);

    const iconMat = makeIconMaterial(), sideMat = makeSideMaterial();
    const mk = (geo, mat, cap, tile) => {
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, _c.set(0xffffff));
      let icon = null;
      if (tile) {
        icon = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
        icon.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aIcon', icon);
      }
      scene.add(mesh);
      return { mesh, icon, bodies: [], cap };
    };
    this.layers = [
      mk(new THREE.BoxGeometry(1, 1, 1), makeVoxelMaterial(), caps[0], false),
      mk(new THREE.SphereGeometry(0.5, 8, 6), makeVoxelMaterial({ bead: true }), caps[1], false),
      mk(discGeometry(), [sideMat, iconMat, sideMat], caps[2], true),
      mk(diceGeometry(), iconMat, caps[3], true),
    ];
    this.onConsumed = null;
    this.onOverflow = null;
    this.deep = -7;
    this.bound = 1e9;
  }

  get nAct() { let n = this.propVoxels.size; for (const l of this.layers) n += l.bodies.length; return n; }
  get nLive() { return this.live.size; }
  get nVox() { return this.layers[0].bodies.length + this.layers[1].bodies.length; }
  get nTiles() { return this.layers[L_DISC].bodies.length + this.layers[L_DICE].bodies.length; }
  get voxCap() { return this.layers[0].cap; }

  reset() {
    for (const b of this.live) this.world.removeRigidBody(b.body);
    this.dormant.clear(); this.live.clear(); this.accumulator = 0;
    this.propVoxels.clear();
    this.colliderRecords.clear(); this.events.clear();
    for (const l of this.layers) {
      l.bodies.length = 0;
      l.mesh.count = 0;
    }
  }

  _storeDormant(b) {
    const key = Math.floor(b.px / CELL_SIZE) + ',' + Math.floor(b.pz / CELL_SIZE);
    b.cell = key;
    if (!this.dormant.has(key)) this.dormant.set(key, new Set());
    this.dormant.get(key).add(b);
  }

  _forgetDormant(b) {
    const cell = this.dormant.get(b.cell);
    if (cell) {
      cell.delete(b);
      if (!cell.size) this.dormant.delete(b.cell);
    }
    b.cell = null;
  }

  _visitDormant(x, z, radius, visit) {
    for (let iz = Math.floor((z - radius) / CELL_SIZE); iz <= Math.floor((z + radius) / CELL_SIZE); iz++) {
      for (let ix = Math.floor((x - radius) / CELL_SIZE); ix <= Math.floor((x + radius) / CELL_SIZE); ix++) {
        const cell = this.dormant.get(ix + ',' + iz);
        if (cell) for (const b of cell) visit(b);
      }
    }
  }

  // The pit: a disc of radius r punched into a square patch of ground. The
  // patch never shrinks below 8 units: with cells much under a tenth of a
  // unit the 16-deep walls become slivers and Rapier stops letting tiles
  // through, so a small hole would eat nothing.
  _setPit(r) {
    const S = Math.max(8, r * 3.4), n = PIT_N + 1, h = this.pitHeights;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = (i / PIT_N - 0.5) * S, z = (j / PIT_N - 0.5) * S;
        h[i * n + j] = (x * x + z * z < r * r) ? -16 : 0;
      }
    }
    this.pit.setShape(new RAPIER.Heightfield(PIT_N, PIT_N, h, { x: S, y: 1, z: S }));
    this.pitR = r;
  }

  _writeSlot(l, b) {
    if (b.prop) {
      b.field.writePart(b.ref, b.part, b.body.translation(), b.body.rotation());
      return;
    }
    if (b.body) {
      const t = b.body.translation(), q = b.body.rotation();
      _o.position.set(t.x, t.y, t.z);
      _o.quaternion.set(q.x, q.y, q.z, q.w);
    } else {
      _o.position.set(b.x, b.y, b.z);
      _o.quaternion.set(b.qx, b.qy, b.qz, b.qw);
    }
    _o.scale.set(b.sx, b.sy, b.sz);
    _o.updateMatrix();
    l.mesh.setMatrixAt(b.slot, _o.matrix);
    dirtyRange(l.mesh.instanceMatrix, b.slot * 16, 16);
  }

  _add(L, rec) {
    const l = this.layers[L];
    if (l.bodies.length >= l.cap) this._overflow(L);
    rec.layer = L;
    rec.slot = l.bodies.length;
    if (rec.body) {
      const t0 = rec.body.translation();
      rec.px = t0.x; rec.pz = t0.z;
      rec.asleep = rec.body.isSleeping();
    } else {
      rec.px = rec.x; rec.pz = rec.z;
      rec.asleep = true;
    }
    l.bodies.push(rec);
    if (rec.collider) this.colliderRecords.set(rec.collider.handle, rec);
    if (rec.body) this.live.add(rec); else this._storeDormant(rec);
    l.mesh.count = l.bodies.length;
    l.mesh.setColorAt(rec.slot, rec.col);
    dirtyRange(l.mesh.instanceColor, rec.slot * 3, 3);
    if (l.icon) { l.icon.array[rec.slot] = rec.icon; dirtyRange(l.icon, rec.slot, 1); }
    this._writeSlot(l, rec);
    l.mesh.instanceMatrix.needsUpdate = true;
    return rec;
  }

  _overflow(L) {
    const l = this.layers[L];
    const b = l.bodies[0];
    if (L <= 1 && this.onOverflow) {
      const t = b.body.translation(), v = b.body.linvel();
      this.onOverflow(t.x, t.y, t.z, v.x, v.y, v.z, b.col, b.key, L);
    }
    this._remove(L, 0);
  }

  _remove(L, i) {
    const l = this.layers[L];
    this.live.delete(l.bodies[i]);
    this._forgetDormant(l.bodies[i]);
    if (l.bodies[i].collider) this.colliderRecords.delete(l.bodies[i].collider.handle);
    if (l.bodies[i].body) this.world.removeRigidBody(l.bodies[i].body);
    const last = l.bodies.pop();
    if (i < l.bodies.length) {
      l.bodies[i] = last;
      last.slot = i;
      l.mesh.setColorAt(i, last.col);
      dirtyRange(l.mesh.instanceColor, i * 3, 3);
      if (l.icon) { l.icon.array[i] = last.icon; dirtyRange(l.icon, i, 1); }
      this._writeSlot(l, last);
      l.mesh.instanceMatrix.needsUpdate = true;
    }
    l.mesh.count = l.bodies.length;
  }

  // A loose effect voxel, separate from persistent structure blocks.
  spawn(x, y, z, vx, vy, vz, col, key, shape = 0) {
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinvel(vx, vy, vz)
      .setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 })
      .setLinearDamping(0.05)
      .setAngularDamping(0.3);
    const body = this.world.createRigidBody(bd);
    const cd = (shape ? RAPIER.ColliderDesc.ball(0.5) : RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5))
      .setFriction(0.8).setRestitution(0.06).setDensity(1.2);
    cd.setCollisionGroups(G_ON);
    const collider = this.world.createCollider(cd, body);
    return this._add(shape, {
      body, collider, col: new THREE.Color(col.r, col.g, col.b), key, icon: 0, offGround: false,
      sx: VOX_SCALE, sy: VOX_SCALE, sz: VOX_SCALE,
    });
  }

  _tileCollider(kind, scale, tall) {
    const cd = kind === L_DISC
      ? RAPIER.ColliderDesc.cylinder(DISC_H * tall / 2, DISC_R * scale)
      : RAPIER.ColliderDesc.roundCuboid(DICE_S * scale / 2 - 0.08, DICE_S * tall / 2 - 0.08, DICE_S * scale / 2 - 0.08, 0.08);
    cd.setFriction(0.7).setRestitution(0.04).setDensity(1);
    cd.setCollisionGroups(G_ON);
    return cd;
  }

  // Give a dormant tile a body at its stored pose. It starts asleep; the
  // wake pass below rouses it if the hole is already close.
  _materialize(b) {
    const group = this._bondedGroup(b);
    for (const block of group) if (!block.body) this._createBody(block);
    for (const block of group) for (const bond of block.bonds || []) this._joinBond(bond);
  }

  _createBody(b) {
    this._forgetDormant(b);
    const bd = (b.attached ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(b.x, b.y, b.z)
      .setRotation({ x: b.qx, y: b.qy, z: b.qz, w: b.qw })
      .setLinearDamping(0.08)
      .setAngularDamping(0.5)
      .setSleeping(true);
    b.body = this.world.createRigidBody(bd);
    const collider = b.prop
      ? (b.layer === L_BEAD ? RAPIER.ColliderDesc.ball(0.5) : RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5))
        .setFriction(0.8).setRestitution(0.02).setDensity(1.2).setCollisionGroups(G_ON)
      : this._tileCollider(b.kind, b.sx, b.sy);
    b.collider = this.world.createCollider(collider, b.body);
    if (b.prop) b.collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    if (b.prop) b.collider.setContactForceEventThreshold(BREAK_FORCE);
    this.colliderRecords.set(b.collider.handle, b);
    b.offGround = false;
    b.asleep = true;
    this.live.add(b);
  }

  // A settled tile far from the hole keeps its pose and drops its body.
  _dematerialize(b, hole, dropR2 = 0, checked = new Set()) {
    const group = this._bondedGroup(b);
    for (const block of group) checked.add(block);
    if (group.some(block => block.body && !block.attached && !block.body.isSleeping())) return;
    if (hole && group.some(block => (block.px-hole.x)**2+(block.pz-hole.z)**2<=dropR2)) return;
    for (const block of group) for (const bond of block.bonds || []) {
      if (bond.joint) { this.world.removeImpulseJoint(bond.joint, false); bond.joint = null; }
    }
    for (const block of group) if (block.body) this._storeBody(block);
  }

  _storeBody(b) {
    const t = b.body.translation(), q = b.body.rotation();
    b.x = t.x; b.y = t.y; b.z = t.z;
    b.qx = q.x; b.qy = q.y; b.qz = q.z; b.qw = q.w;
    b.px = t.x; b.pz = t.z;
    this.colliderRecords.delete(b.collider.handle);
    this.world.removeRigidBody(b.body);
    b.body = null; b.collider = null;
    this.live.delete(b); this._storeDormant(b);
  }

  // A picture tile. kind: L_DISC or L_DICE. scale widens it, tall stretches it
  // (cakes). It goes down dormant, a pose and an instance, and only becomes a
  // body when the hole gets near.
  spawnTile(x, y, z, kind, type, { yaw = 0, scale = 1, tall = 1 } = {}) {
    _q.setFromAxisAngle(UP, yaw);
    const t = TILE_TYPES[type];
    return this._add(kind, {
      body: null, collider: null, col: new THREE.Color(t.side), key: t.id, icon: type, offGround: false,
      kind, x, y, z, qx: _q.x, qy: _q.y, qz: _q.z, qw: _q.w,
      sx: scale, sy: tall, sz: scale,
    });
  }

  spawnPropVoxel(prop, voxel, field, ref, rotation) {
    _o.position.set(voxel.x, voxel.y + 0.5, voxel.z).applyQuaternion(rotation);
    const b = {
      prop, field, ref, part: voxel.li, layer: voxel.fi, key: voxel.c,
      local: {x:voxel.x,y:voxel.y,z:voxel.z},
      body: null, collider: null, asleep: true, offGround: false,
      x: prop.x + _o.position.x, y: _o.position.y, z: prop.z + _o.position.z,
      qx: rotation.x, qy: rotation.y, qz: rotation.z, qw: rotation.w,
    };
    b.px = b.x; b.pz = b.z;
    this.propVoxels.add(b);
    this._storeDormant(b);
    return b;
  }

  _removePropVoxel(b) {
    this._breakBonds(b);
    b.structure?.blocks.delete(b);
    if (b.collider) this.colliderRecords.delete(b.collider.handle);
    if (b.body) this.world.removeRigidBody(b.body);
    this.live.delete(b); this._forgetDormant(b); this.propVoxels.delete(b);
    b.field.hidePart(b.ref, b.part);
    b.prop.remaining--;
    if (b.prop.remaining === 0) b.prop.state = 'gone';
  }

  _bondedGroup(b) {
    if (!b.prop || b.attached) return [b];
    const group = [b], seen = new Set(group);
    for (let i=0;i<group.length;i++) for (const bond of group[i].bonds || []) {
      const other = bond.a===group[i] ? bond.b : bond.a;
      if (!bond.broken && !other.attached && !seen.has(other)) {seen.add(other);group.push(other);}
    }
    return group;
  }

  _joinBond(bond) {
    const {a,b} = bond;
    if (bond.broken || bond.joint || a.attached || b.attached || !a.body || !b.body) return;
    const half = {x:(b.local.x-a.local.x)/2,y:(b.local.y-a.local.y)/2,z:(b.local.z-a.local.z)/2};
    const opposite = {x:-half.x,y:-half.y,z:-half.z};
    bond.joint = this.world.createImpulseJoint(RAPIER.JointData.fixed(half,IDENTITY,opposite,IDENTITY),a.body,b.body,false);
    bond.joint.setContactsEnabled(false);
  }

  _breakBonds(b) {
    for (const bond of b.bonds || []) {
      if (bond.joint) {this.world.removeImpulseJoint(bond.joint,true);bond.joint=null;}
      bond.broken = true;
    }
  }

  _damage(b) {
    this._breakBonds(b);
    if (!b.attached) return;
    const detached = b.structure.detach(b);
    for (const block of detached) {
      if (!block.body) this._createBody(block);
      else block.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      block.body.wakeUp();
      block.asleep = false;
    }
    for (const block of detached) for (const bond of block.bonds) this._joinBond(bond);
  }

  _handleImpacts() {
    const damaged = new Set();
    this.events.drainContactForceEvents(event => {
      const a=this.colliderRecords.get(event.collider1()), b=this.colliderRecords.get(event.collider2());
      if (event.totalForceMagnitude()<BREAK_FORCE || Math.max(a?.impactSpeed||0,b?.impactSpeed||0)<2) return;
      if (a?.prop) damaged.add(a);
      if (b?.prop) damaged.add(b);
    });
    for (const b of damaged) this._damage(b);
  }

  // Booster: tug everything within R toward the hole.
  magnet(hole, R, k) {
    const { x: hx, z: hz } = hole;
    const R2 = R * R;
    this._visitDormant(hx, hz, R, b => {
      const dx = hx - b.px, dz = hz - b.pz;
      if (dx * dx + dz * dz <= R2) this._materialize(b);
    });
    for (const b of this.live) {
      const dx = hx - b.px, dz = hz - b.pz, d2 = dx * dx + dz * dz;
      if (d2 > R2 || d2 < 0.3) continue;
      if (b.attached) this._damage(b);
      const d = Math.sqrt(d2);
      b.body.wakeUp(); b.asleep = false;
      b.body.applyImpulse({ x: (dx / d) * k, y: 0, z: (dz / d) * k }, true);
    }
  }

  update(dt, hole) {
    const { x: hx, z: hz, r } = hole;
    if (Math.abs(r - this.pitR) > this.pitR * 0.05) this._setPit(r);
    this.pit.setTranslation({ x: hx, y: 0, z: hz });

    // Stream colliders ahead of the hole, without disturbing their supports.
    // Wake only on a change of ground contact or a real collision.
    const holeR2 = r * r * 0.98;
    const live = r * 2 + 7;
    const liveR2 = live * live, dropR2 = (live + 6) ** 2;
    this._visitDormant(hx, hz, live, b => {
      const dx = b.px - hx, dz = b.pz - hz;
      if (dx * dx + dz * dz < liveR2) this._materialize(b);
    });
    const streamChecked = new Set();
    for (const b of this.live) {
      const dx = b.px - hx, dz = b.pz - hz, d2 = dx * dx + dz * dz;
      if (b.attached && b.foundation && d2 < holeR2) this._damage(b);
      if (!b.attached) {
        const over = d2 < holeR2 || b.body.translation().y < 0.05;
        if (over !== b.offGround) {
          b.offGround = over;
          b.collider.setCollisionGroups(over ? G_OFF : G_ON);
          b.body.wakeUp(); b.asleep = false;
        } else if (!b.body.isSleeping()) b.asleep = false;
      }
      if (b.asleep && d2 > dropR2 && (b.prop || b.layer >= L_DISC) && !streamChecked.has(b)) {
        this._dematerialize(b, hole, dropR2, streamChecked);
      }
    }
    // Fractional frames accumulate instead of advancing physics twice as fast
    // on 120 Hz screens. Discard excess backlog after a stall.
    this.accumulator = Math.min(this.accumulator + dt, STEP * 3);
    while (this.accumulator + 1e-9 >= STEP) {
      for (const b of this.live) {
        b.impactSpeed = 0;
        if (!b.attached && !b.asleep) {
          const v = b.body.linvel(); b.impactSpeed = Math.hypot(v.x,v.y,v.z);
        }
      }
      this.world.step(this.events);
      this._handleImpacts();
      this.accumulator = Math.max(0, this.accumulator - STEP);
    }

    for (const b of this.live) {
      const L = b.layer, l = this.layers[L];
      if (b.attached) continue;
      if (b.asleep && b.body.isSleeping()) continue;
      b.asleep = false;
      const t = b.body.translation();
      b.px = t.x; b.pz = t.z;
      if (t.y < this.deep || Math.abs(t.x) > this.bound || Math.abs(t.z) > this.bound) {
        if (this.onConsumed && t.y > -40) this.onConsumed(b.key, L, t.x, t.z);
        if (b.prop) this._removePropVoxel(b); else this._remove(L, b.slot);
        continue;
      }
      // Off the ground while over the hole, and for good once it is under
      // the board: the ground is a 2-deep slab, and a tile still inside it
      // when the hole moves on would be shoved back up onto the board.
      const dx = t.x - hx, dz = t.z - hz;
      const over = (dx * dx + dz * dz) < holeR2 || t.y < 0.05;
      if (over !== b.offGround) {
        b.offGround = over;
        b.collider.setCollisionGroups(over ? G_OFF : G_ON);
      }
      this._writeSlot(l, b);
      if (b.body.isSleeping()) b.asleep = true;
    }
  }
}
