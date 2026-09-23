import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeVoxelMaterial, VOX_SCALE } from '../world/material.js';
import { discGeometry, diceGeometry, makeIconMaterial, makeSideMaterial, DISC_R, DISC_H, DICE_S, TILE_TYPES } from '../world/tiles.js';

// Everything that can fall is a Rapier rigid body: every picture tile on the
// board (asleep until the hole comes near) and every voxel shed by a sinking
// prop. The hole is a real pit in the ground, a heightfield patch that moves
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
const G_ON = (0x0002 << 16) | 0x0007;       // body: board + bodies + pit
const G_OFF = (0x0002 << 16) | 0x0006;      // body over the hole: bodies + pit

const PIT_N = 56;
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class Rigid {
  static async init() { await RAPIER.init(); }

  constructor(scene, { caps = [1200, 500, 7000, 5000] } = {}) {
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
      return { mesh, icon, bodies: [], cap, written: 0 };
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

  get nAct() { let n = 0; for (const l of this.layers) n += l.bodies.length; return n; }
  get nLive() { let n = 0; for (const l of this.layers) for (const b of l.bodies) if (b.body) n++; return n; }
  get nVox() { return this.layers[0].bodies.length + this.layers[1].bodies.length; }
  get nTiles() { return this.layers[L_DISC].bodies.length + this.layers[L_DICE].bodies.length; }
  get voxCap() { return this.layers[0].cap; }

  reset() {
    for (const l of this.layers) {
      for (const b of l.bodies) if (b.body) this.world.removeRigidBody(b.body);
      l.bodies.length = 0;
      l.mesh.count = 0;
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
    l.written++;
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
    l.mesh.count = l.bodies.length;
    l.mesh.setColorAt(rec.slot, rec.col);
    l.mesh.instanceColor.needsUpdate = true;
    if (l.icon) { l.icon.array[rec.slot] = rec.icon; l.icon.needsUpdate = true; }
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
    if (l.bodies[i].body) this.world.removeRigidBody(l.bodies[i].body);
    const last = l.bodies.pop();
    if (i < l.bodies.length) {
      l.bodies[i] = last;
      last.slot = i;
      l.mesh.setColorAt(i, last.col);
      l.mesh.instanceColor.needsUpdate = true;
      if (l.icon) { l.icon.array[i] = last.icon; l.icon.needsUpdate = true; }
      this._writeSlot(l, last);
      l.mesh.instanceMatrix.needsUpdate = true;
    }
    l.mesh.count = l.bodies.length;
  }

  // A loose voxel shed by a sinking prop.
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
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(b.x, b.y, b.z)
      .setRotation({ x: b.qx, y: b.qy, z: b.qz, w: b.qw })
      .setLinearDamping(0.08)
      .setAngularDamping(0.5)
      .setSleeping(true);
    b.body = this.world.createRigidBody(bd);
    b.collider = this.world.createCollider(this._tileCollider(b.kind, b.sx, b.sy), b.body);
    b.offGround = false;
    b.asleep = true;
  }

  // A settled tile far from the hole keeps its pose and drops its body.
  _dematerialize(b) {
    const t = b.body.translation(), q = b.body.rotation();
    b.x = t.x; b.y = t.y; b.z = t.z;
    b.qx = q.x; b.qy = q.y; b.qz = q.z; b.qw = q.w;
    this.world.removeRigidBody(b.body);
    b.body = null; b.collider = null;
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

  // Booster: tug everything within R toward the hole.
  magnet(hole, R, k) {
    const { x: hx, z: hz } = hole;
    const R2 = R * R;
    for (const l of this.layers) {
      for (const b of l.bodies) {
        const dx = hx - b.px, dz = hz - b.pz, d2 = dx * dx + dz * dz;
        if (d2 > R2 || d2 < 0.3) continue;
        const d = Math.sqrt(d2);
        if (!b.body) this._materialize(b);
        b.body.wakeUp(); b.asleep = false;
        b.body.applyImpulse({ x: (dx / d) * k, y: 0, z: (dz / d) * k }, true);
      }
    }
  }

  update(dt, hole) {
    const { x: hx, z: hz, r } = hole;
    if (Math.abs(r - this.pitR) > this.pitR * 0.05) this._setPit(r);
    this.pit.setTranslation({ x: hx, y: 0, z: hz });

    // Sleeping bodies keep a cached position, so the per-frame cost is only
    // the bodies that are actually moving plus a distance check each. Tiles
    // get a body inside `live` of the hole and lose it again beyond `drop`
    // (with slack so a tile on the boundary does not flicker); the wake ring
    // is well inside that so a tumbling tile always has solid neighbours.
    const wakeR2 = (r * 1.3 + 0.9) ** 2;
    const live = r * 2 + 7;
    const liveR2 = live * live, dropR2 = (live + 6) ** 2;
    for (const l of this.layers) {
      for (const b of l.bodies) {
        if (!b.asleep) continue;
        const dx = b.px - hx, dz = b.pz - hz, d2 = dx * dx + dz * dz;
        if (b.body) {
          // Rapier wakes a sleeping tile itself when something moving touches
          // it; track it from then on so its picture follows its body.
          if (d2 < wakeR2 || !b.body.isSleeping()) { b.body.wakeUp(); b.asleep = false; }
          else if (d2 > dropR2 && l.icon) this._dematerialize(b);
        } else if (d2 < liveR2) {
          this._materialize(b);
          if (d2 < wakeR2) { b.body.wakeUp(); b.asleep = false; }
        }
      }
    }

    let steps = Math.min(3, Math.max(1, Math.round(dt / (1 / 60))));
    while (steps-- > 0) this.world.step();

    const holeR2 = r * r * 0.98;
    for (let L = 0; L < this.layers.length; L++) {
      const l = this.layers[L];
      l.written = 0;
      for (let i = l.bodies.length - 1; i >= 0; i--) {
        const b = l.bodies[i];
        if (b.asleep) continue;
        const t = b.body.translation();
        b.px = t.x; b.pz = t.z;
        if (t.y < this.deep || Math.abs(t.x) > this.bound || Math.abs(t.z) > this.bound) {
          if (this.onConsumed && t.y > -40) this.onConsumed(b.key, L, t.x, t.z);
          this._remove(L, i);
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
      if (l.written) l.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
