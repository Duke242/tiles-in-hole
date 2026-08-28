import * as THREE from 'three';

const GEO = new THREE.BoxGeometry(1, 1, 1);
const _o = new THREE.Object3D();

const GRAVITY = 58;
const BOUNCE = 0.24;
const FRICTION = 0.72;
const SLEEP_V = 1.7;

// Loose tiles are real bodies: they fall, tumble, bounce, and pile up on each
// other. Piling uses a height grid rather than tile-to-tile collision, which
// gives convincing heaps for a fraction of the cost.
//
// Tiles live in one of two meshes. Awake tiles sit in a compacted active pool
// rewritten every frame; once a tile settles it is moved to a static mesh and
// never touched again until the hole comes for it.
export class Tiles {
  constructor(scene, { worldSize, tileW, tileH, activeCap = 4000, restCap = 9000 }) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.half = worldSize / 2;
    this.cell = tileW;
    this.gw = Math.ceil(worldSize / this.cell) + 2;
    this.height = new Float32Array(this.gw * this.gw);

    const mk = (cap, dynamic) => {
      const m = new THREE.InstancedMesh(GEO, new THREE.MeshLambertMaterial({ color: 0xffffff }), cap);
      if (dynamic) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return m;
    };
    this.activeMesh = mk(activeCap, true);
    this.restMesh = mk(restCap, false);
    this.activeCap = activeCap;
    this.restCap = restCap;

    this.act = [];
    for (let i = 0; i < activeCap; i++) {
      this.act.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0, col: new THREE.Color() });
    }
    this.nAct = 0;

    // Settled tiles: parallel arrays so the hole can sweep them cheaply.
    this.rest = { x: [], z: [], y: [], live: [], col: [] };
    this.nRest = 0;
  }

  gi(x, z) {
    const cx = Math.floor((x + this.half) / this.cell);
    const cz = Math.floor((z + this.half) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.gw || cz >= this.gw) return -1;
    return cz * this.gw + cx;
  }
  groundAt(x, z) { const i = this.gi(x, z); return i < 0 ? 0 : this.height[i]; }

  spawn(x, y, z, vx, vy, vz, color) {
    if (this.nAct >= this.activeCap) return;
    const t = this.act[this.nAct];
    t.x = x; t.y = y; t.z = z;
    t.vx = vx; t.vy = vy; t.vz = vz;
    t.rx = (Math.random() - 0.5) * 0.6;
    t.ry = Math.random() * 6.28;
    t.rz = (Math.random() - 0.5) * 0.6;
    t.ax = (Math.random() - 0.5) * 7;
    t.ay = (Math.random() - 0.5) * 7;
    t.az = (Math.random() - 0.5) * 7;
    if (color && color.isColor) t.col.copy(color); else t.col.set(color || '#ffffff');
    this.activeMesh.setColorAt(this.nAct, t.col);
    this.nAct++;
  }

  _settle(t) {
    if (this.nRest >= this.restCap) return;      // heap is full; let it vanish
    const i = this.nRest++;
    this.rest.x[i] = t.x; this.rest.y[i] = t.y; this.rest.z[i] = t.z; this.rest.live[i] = 1;
    this.rest.col[i] = (this.rest.col[i] || new THREE.Color()).copy(t.col);
    _o.position.set(t.x, t.y, t.z);
    // Tidy the resting pose: flat, with a square yaw, like the real game's heaps.
    _o.rotation.set(0, Math.round(t.ry / (Math.PI / 2)) * (Math.PI / 2), 0);
    _o.scale.set(this.tileW, this.tileH * 0.9, this.tileW);
    _o.updateMatrix();
    this.restMesh.setMatrixAt(i, _o.matrix);
    this.restMesh.setColorAt(i, t.col);
    this.restMesh.count = this.nRest;
    const a = this.restMesh.instanceMatrix;
    a.addUpdateRange(i * 16, 16);
    a.needsUpdate = true;
    if (this.restMesh.instanceColor) {
      const ca = this.restMesh.instanceColor;
      ca.addUpdateRange(i * 3, 3);
      ca.needsUpdate = true;
    }
    const gi = this.gi(t.x, t.z);
    if (gi >= 0) this.height[gi] = Math.max(this.height[gi], t.y + this.tileH * 0.5);
  }

  _kill(i) {
    this.nAct--;
    if (i !== this.nAct) {
      const tmp = this.act[i];
      this.act[i] = this.act[this.nAct];
      this.act[this.nAct] = tmp;
      this.activeMesh.setColorAt(i, this.act[i].col);
    }
  }

  // Settled tiles the hole reaches lose their footing and drop back in.
  _wakeUnderHole(hole) {
    const { x: hx, z: hz, r } = hole;
    const rr = r * 0.97;
    for (let i = 0; i < this.nRest; i++) {
      if (!this.rest.live[i]) continue;
      const dx = this.rest.x[i] - hx, dz = this.rest.z[i] - hz;
      if (dx * dx + dz * dz > rr * rr) continue;
      this.rest.live[i] = 0;
      _o.position.set(0, 0, 0); _o.scale.set(0, 0, 0); _o.updateMatrix();
      this.restMesh.setMatrixAt(i, _o.matrix);
      const a = this.restMesh.instanceMatrix;
      a.addUpdateRange(i * 16, 16);
      a.needsUpdate = true;
      const gi = this.gi(this.rest.x[i], this.rest.z[i]);
      if (gi >= 0) this.height[gi] = Math.max(0, this.height[gi] - this.tileH);
      this.spawn(this.rest.x[i], this.rest.y[i], this.rest.z[i],
        0, -1, 0, this.rest.col[i]);
    }
  }

  update(dt, hole, onConsumed) {
    const { x: hx, z: hz, r } = hole;
    this._wakeUnderHole(hole);

    const deep = -(r * 0.8 + 8);
    for (let i = 0; i < this.nAct; i++) {
      const t = this.act[i];
      t.vy -= GRAVITY * dt;
      t.x += t.vx * dt; t.y += t.vy * dt; t.z += t.vz * dt;
      t.rx += t.ax * dt; t.ry += t.ay * dt; t.rz += t.az * dt;

      const dx = t.x - hx, dz = t.z - hz;
      const overHole = (dx * dx + dz * dz) < r * r * 0.94;

      if (overHole) {
        // Nothing to land on. Fall through and be swallowed.
        if (t.y < deep) { onConsumed && onConsumed(); this._kill(i); i--; continue; }
      } else {
        const rest = this.groundAt(t.x, t.z) + this.tileH * 0.5;
        if (t.y <= rest) {
          t.y = rest;
          if (t.vy < -SLEEP_V) {
            t.vy = -t.vy * BOUNCE;
            t.vx *= FRICTION; t.vz *= FRICTION;
            t.ax *= 0.5; t.ay *= 0.5; t.az *= 0.5;
          } else {
            t.vy = 0; t.vx *= 0.55; t.vz *= 0.55;
            if (Math.hypot(t.vx, t.vz) < 0.9) {
              this._settle(t);
              this._kill(i); i--; continue;
            }
          }
        }
      }
      if (t.y < -140) { this._kill(i); i--; continue; }

      _o.position.set(t.x, t.y, t.z);
      _o.rotation.set(t.rx, t.ry, t.rz);
      _o.scale.set(this.tileW, this.tileH * 0.9, this.tileW);
      _o.updateMatrix();
      this.activeMesh.setMatrixAt(i, _o.matrix);
    }

    this.activeMesh.count = this.nAct;
    const a = this.activeMesh.instanceMatrix;
    a.clearUpdateRanges();
    if (this.nAct > 0) a.addUpdateRange(0, this.nAct * 16);
    a.needsUpdate = true;
    if (this.activeMesh.instanceColor) this.activeMesh.instanceColor.needsUpdate = true;
  }
}
