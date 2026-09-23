import * as THREE from 'three';
import { makeVoxelMaterial, VOX_SCALE } from './material.js';

// A pool of instanced voxels. Objects claim a run of instances and are placed
// with one rigid transform; hidden instances are scaled to nothing. Only the
// instances that changed are uploaded each frame.

const CUBE_GEO = new THREE.BoxGeometry(1, 1, 1);
const BEAD_GEO = new THREE.SphereGeometry(0.5, 8, 6);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _obj = new THREE.Object3D();
const _m = new THREE.Matrix4();
const _col = new THREE.Color();

export class Field {
  constructor(scene, capacity, { shape = 'cube', cast = true, receive = false } = {}) {
    const mat = makeVoxelMaterial({ bead: shape === 'bead' });
    this.mesh = new THREE.InstancedMesh(shape === 'bead' ? BEAD_GEO : CUBE_GEO, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = cast;
    this.mesh.receiveShadow = receive;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, _col.set(0xffffff));
    scene.add(this.mesh);
    this.capacity = capacity;
    this.used = 0;
    this.dirty = true;
    this.ranges = [];
    this.fullUpload = true;
  }

  reset() {
    this.used = 0;
    this.mesh.count = 0;
    this.fullUpload = true;
    this.dirty = true;
    this.ranges.length = 0;
  }

  // parts: [{x, y, z, r, g, b}] voxel centres in model space.
  alloc(parts) {
    const base = this.used;
    if (base + parts.length > this.capacity) {
      console.warn('Field capacity exceeded');
      return null;
    }
    const locals = new Float32Array(parts.length * 3);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      locals[i * 3] = p.x; locals[i * 3 + 1] = p.y; locals[i * 3 + 2] = p.z;
      this.mesh.setColorAt(base + i, _col.setRGB(p.r, p.g, p.b));
    }
    this.used += parts.length;
    this.mesh.count = this.used;
    this.mesh.instanceColor.needsUpdate = true;
    return { base, n: parts.length, locals, hidden: null };
  }

  write(ref, x, y, z, q) {
    _obj.position.set(x, y, z);
    _obj.quaternion.copy(q);
    _obj.scale.setScalar(1);
    _obj.updateMatrix();
    const L = ref.locals;
    for (let i = 0; i < ref.n; i++) {
      if (ref.hidden && ref.hidden[i]) continue;
      _m.makeScale(VOX_SCALE, VOX_SCALE, VOX_SCALE);
      _m.setPosition(L[i * 3], L[i * 3 + 1], L[i * 3 + 2]);
      _m.premultiply(_obj.matrix);
      this.mesh.setMatrixAt(ref.base + i, _m);
    }
    this.touch(ref.base, ref.n);
  }

  touch(start, count) {
    this.dirty = true;
    if (this.fullUpload) return;
    if (this.ranges.length > 120) { this.fullUpload = true; this.ranges.length = 0; return; }
    this.ranges.push(start, count);
  }

  hidePart(ref, i) {
    if (!ref.hidden) ref.hidden = new Uint8Array(ref.n);
    ref.hidden[i] = 1;
    this.mesh.setMatrixAt(ref.base + i, ZERO);
    this.touch(ref.base + i, 1);
  }

  hide(ref) {
    for (let i = 0; i < ref.n; i++) this.mesh.setMatrixAt(ref.base + i, ZERO);
    this.touch(ref.base, ref.n);
  }

  flush() {
    if (!this.dirty) return;
    const attr = this.mesh.instanceMatrix;
    attr.clearUpdateRanges();
    if (!this.fullUpload) {
      for (let i = 0; i < this.ranges.length; i += 2) attr.addUpdateRange(this.ranges[i] * 16, this.ranges[i + 1] * 16);
    }
    attr.needsUpdate = true;
    this.ranges.length = 0;
    this.fullUpload = false;
    this.dirty = false;
  }
}
