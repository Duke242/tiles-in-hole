import * as THREE from 'three';
import { makeVoxelMaterial, VOX_SCALE } from '../world/material.js';

// Kinematic voxels: the stream that pours down the shaft, plus the overflow
// from the rigid-body budget. Gravity only; anything outside the hole rests on
// the board for a moment and fades.
const GEOS = [new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.5, 8, 6)];
const _o = new THREE.Object3D();

export class Debris {
  constructor(scene, capacity = 4000) {
    this.meshes = GEOS.map((geo) => {
      const m = new THREE.InstancedMesh(geo, makeVoxelMaterial({ bead: geo === GEOS[1] }), capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, new THREE.Color(0xffffff));
      scene.add(m);
      return m;
    });
    this.capacity = capacity;
    this.n = 0;
    this.pool = [];
    for (let i = 0; i < capacity; i++) {
      this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, vr: 0, age: 0, life: 4,
        shape: 0, key: null, credit: false, col: new THREE.Color() });
    }
    this.onConsumed = null;
  }

  reset() { this.n = 0; for (const m of this.meshes) m.count = 0; }

  spawn(x, y, z, vx, vy, vz, col, key, shape = 0, credit = false) {
    if (this.n >= this.capacity) return;
    const p = this.pool[this.n++];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 10;
    p.age = 0; p.life = 4; p.shape = shape; p.key = key; p.credit = credit;
    p.col.setRGB(col.r, col.g, col.b);
  }

  _kill(i) {
    this.n--;
    if (i !== this.n) { const t = this.pool[i]; this.pool[i] = this.pool[this.n]; this.pool[this.n] = t; }
  }

  update(dt, hole) {
    const { x: hx, z: hz, r } = hole;
    const counts = [0, 0];
    for (let i = 0; i < this.n; i++) {
      const p = this.pool[i];
      p.age += dt;
      p.vy -= 30 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      const inHole = Math.hypot(hx - p.x, hz - p.z) < r * 0.95;
      if (!inHole && p.y < 0.5) {
        p.y = 0.5;
        if (p.vy < -4) p.vy *= -0.25; else p.vy = 0;
        p.vx *= 0.85; p.vz *= 0.85; p.vr *= 0.8;
      }
      if (p.y < -10) {
        if (p.credit && this.onConsumed) this.onConsumed(p.key, 1);
        this._kill(i); i--; continue;
      }
      if (p.age > p.life) { this._kill(i); i--; continue; }
      const fade = p.age > p.life - 0.5 ? Math.max(0.02, (p.life - p.age) / 0.5) : 1;
      _o.position.set(p.x, p.y, p.z);
      _o.rotation.set(p.rot * 0.7, p.rot, p.rot * 0.4);
      _o.scale.setScalar(fade * VOX_SCALE);
      _o.updateMatrix();
      const m = this.meshes[p.shape];
      const k = counts[p.shape]++;
      m.setMatrixAt(k, _o.matrix);
      m.setColorAt(k, p.col);
    }
    for (let s = 0; s < 2; s++) {
      const m = this.meshes[s];
      m.count = counts[s];
      const a = m.instanceMatrix;
      a.clearUpdateRanges();
      if (counts[s]) a.addUpdateRange(0, counts[s] * 16);
      a.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }
}
