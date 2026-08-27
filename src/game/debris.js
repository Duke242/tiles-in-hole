import * as THREE from 'three';
import { funnelY, FUNNEL_OUT } from './tune.js';

const GEO = new THREE.BoxGeometry(1, 1, 1);
const _o = new THREE.Object3D();
const _c = new THREE.Color();

// Flying rubble. Anything near the hole gets caught in a vortex: pulled
// inward while being swung tangentially, so it spirals down the funnel.
export class Debris {
  constructor(scene, capacity = 5200) {
    this.mesh = new THREE.InstancedMesh(GEO, new THREE.MeshLambertMaterial({ color: 0xffffff }), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.capacity = capacity;
    this.n = 0;
    this.pool = [];
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, rot: 0, vr: 0,
        age: 0, life: 6, dust: false, col: new THREE.Color(),
      });
    }
  }

  spawn(x, y, z, vx, vy, vz, size, color, dust = false) {
    if (this.n >= this.capacity) return;
    const p = this.pool[this.n];
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.s = size; p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 12;
    p.age = 0; p.life = dust ? 0.9 : 5.5; p.dust = dust;
    if (color && color.isColor) p.col.copy(color); else p.col.set(color || '#ffffff');
    this.mesh.setColorAt(this.n, p.col);
    this.n++;
  }

  puff(x, y, z, color, count = 6, power = 6) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28;
      this.spawn(x, y, z,
        Math.cos(a) * power * Math.random(), 2 + Math.random() * power,
        Math.sin(a) * power * Math.random(),
        0.35 + Math.random() * 0.5, color);
    }
  }

  dust(x, y, z, count = 4) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28;
      this.spawn(x, y, z,
        Math.cos(a) * 3, 1.5 + Math.random() * 3, Math.sin(a) * 3,
        0.5 + Math.random() * 0.7, '#d8d4cc', true);
    }
  }

  _kill(i) {
    this.n--;
    if (i !== this.n) {
      const tmp = this.pool[i];
      this.pool[i] = this.pool[this.n];
      this.pool[this.n] = tmp;
      this.mesh.setColorAt(i, this.pool[i].col);
    }
  }

  update(dt, hole) {
    const { x: hx, z: hz, r } = hole;
    const pullR = r * FUNNEL_OUT + 6;
    for (let i = 0; i < this.n; i++) {
      const p = this.pool[i];
      p.age += dt;

      if (p.dust) {
        p.vy += 6 * dt;              // dust rises and fades away
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 0.94; p.vz *= 0.94;
        if (p.age > p.life) { this._kill(i); i--; continue; }
        _o.position.set(p.x, p.y, p.z);
        _o.rotation.set(0, p.rot, 0);
        _o.scale.setScalar(p.s * Math.max(0.02, 1 - p.age / p.life));
        _o.updateMatrix();
        this.mesh.setMatrixAt(i, _o.matrix);
        continue;
      }

      const dx = hx - p.x, dz = hz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < pullR && d > 0.01) {
        const grip = 1 - d / pullR;
        const inward = (150 * grip + 26) * dt / d;
        p.vx += dx * inward; p.vz += dz * inward;
        // tangential swirl, strongest right at the rim
        const tangent = 90 * grip * grip * dt / d;
        p.vx += -dz * tangent; p.vz += dx * tangent;
      }
      p.vy -= 46 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;

      const surface = d < r ? -1e9 : funnelY(d, r) + p.s * 0.4;
      if (p.y < surface) {
        p.y = surface;
        if (p.vy < -4) p.vy *= -0.28; else p.vy = 0;
        p.vx *= 0.9; p.vz *= 0.9;
        p.vr *= 0.9;
      }

      if (p.y < -34 || p.age > p.life) { this._kill(i); i--; continue; }

      const fade = p.age > p.life - 0.6 ? Math.max(0.02, (p.life - p.age) / 0.6) : 1;
      _o.position.set(p.x, p.y, p.z);
      _o.rotation.set(p.rot * 0.7, p.rot, p.rot * 0.4);
      _o.scale.setScalar(p.s * fade);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
