import * as THREE from 'three';

const GEO = new THREE.BoxGeometry(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _obj = new THREE.Object3D();
const _m = new THREE.Matrix4();
const _leg = new THREE.Matrix4();
const _col = new THREE.Color();

// A pool of instanced boxes. Objects claim a run of instances ("parts") and
// are drawn by writing one transform per part each time they move.
export class Field {
  constructor(scene, capacity, { cast = true, receive = true, dynamic = false } = {}) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(GEO, mat, capacity);
    if (dynamic) this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = cast;
    this.mesh.receiveShadow = receive;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, _col.set(0xffffff));
    scene.add(this.mesh);
    this.capacity = capacity;
    this.used = 0;
    this.dirty = true;
  }

  // parts: [{x,y,z,sx,sy,sz,color,leg?}] in model space
  alloc(parts) {
    const base = this.used;
    if (base + parts.length > this.capacity) {
      console.warn('Field capacity exceeded');
      return null;
    }
    const locals = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      locals.push({
        m: new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Quaternion(),
          new THREE.Vector3(p.sx, p.sy, p.sz)),
        leg: p.leg || 0,
      });
      this.mesh.setColorAt(base + i, _col.set(p.color));
    }
    this.used += parts.length;
    this.mesh.count = this.used;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return { base, locals };
  }

  write(ref, x, y, z, yaw = 0, scale = 1, pitch = 0, roll = 0, legSwing = 0) {
    _obj.position.set(x, y, z);
    _obj.rotation.set(pitch, yaw, roll);
    _obj.scale.setScalar(scale);
    _obj.updateMatrix();
    for (let i = 0; i < ref.locals.length; i++) {
      const l = ref.locals[i];
      if (l.leg && legSwing) {
        _leg.makeTranslation(0, 0, legSwing * l.leg);
        _m.multiplyMatrices(_obj.matrix, _leg).multiply(l.m);
      } else {
        _m.multiplyMatrices(_obj.matrix, l.m);
      }
      this.mesh.setMatrixAt(ref.base + i, _m);
    }
    this.dirty = true;
  }

  hide(ref) {
    for (let i = 0; i < ref.locals.length; i++) this.mesh.setMatrixAt(ref.base + i, ZERO);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
}
