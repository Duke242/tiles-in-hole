import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const GEO = new THREE.BoxGeometry(1, 1, 1);
const _o = new THREE.Object3D();
const _q = new THREE.Quaternion();

// Collision groups packed as (membership << 16) | filter.
const G_GROUND = (0x0001 << 16) | 0x0002;   // ground collides with cubes
const G_CUBE_ON = (0x0002 << 16) | 0x0003;  // cube collides with ground + cubes
const G_CUBE_OFF = (0x0002 << 16) | 0x0002; // over the hole: cubes only, no ground

// Real rigid bodies, simulated by Rapier. Cubes collide with each other and
// with the ground, so structures topple and rubble piles the way it actually
// would. Only cubes that are in motion are bodies; once one falls asleep it is
// retired to a static instanced mesh and its body is destroyed, which keeps the
// simulation small no matter how much of the field has been knocked down.
export class Rigid {
  static async init() { await RAPIER.init(); }

  constructor(scene, { cube = 2.4, activeCap = 420, restCap = 12000 } = {}) {
    this.cube = cube;
    this.activeCap = activeCap;
    this.restCap = restCap;

    this.world = new RAPIER.World({ x: 0, y: -34, z: 0 });
    this.world.timestep = 1 / 60;

    const g = RAPIER.ColliderDesc.cuboid(700, 1, 700)
      .setTranslation(0, -1, 0)
      .setFriction(0.9)
      .setRestitution(0.02);
    g.setCollisionGroups(G_GROUND);
    this.groundCollider = this.world.createCollider(g);

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

    this.bodies = [];      // { body, collider, col, offGround }
    this.nRest = 0;
    this.rest = { x: [], y: [], z: [], live: [], col: [] };
    this._c = new THREE.Color();
  }

  get nAct() { return this.bodies.length; }

  spawn(x, y, z, vx, vy, vz, color) {
    if (this.bodies.length >= this.activeCap) this._retire(0);
    const h = this.cube * 0.5;
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinvel(vx, vy, vz)
      .setAngvel({ x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5, z: (Math.random() - 0.5) * 5 })
      .setLinearDamping(0.06)
      .setAngularDamping(0.32)
      .setCcdEnabled(false);
    const body = this.world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.cuboid(h, h, h)
      .setFriction(0.85)
      .setRestitution(0.05)
      .setDensity(1.4);
    cd.setCollisionGroups(G_CUBE_ON);
    const collider = this.world.createCollider(cd, body);
    const col = new THREE.Color();
    if (color && color.isColor) col.copy(color); else col.set(color || '#ffffff');
    this.bodies.push({ body, collider, col, offGround: false });
  }

  _retire(i) {
    const b = this.bodies[i];
    const t = b.body.translation();
    const r = b.body.rotation();
    if (this.nRest < this.restCap) {
      const k = this.nRest++;
      this.rest.x[k] = t.x; this.rest.y[k] = t.y; this.rest.z[k] = t.z;
      this.rest.live[k] = 1;
      this.rest.col[k] = (this.rest.col[k] || new THREE.Color()).copy(b.col);
      _o.position.set(t.x, t.y, t.z);
      _o.quaternion.set(r.x, r.y, r.z, r.w);
      _o.scale.setScalar(this.cube);
      _o.updateMatrix();
      this.restMesh.setMatrixAt(k, _o.matrix);
      this.restMesh.setColorAt(k, b.col);
      this.restMesh.count = this.nRest;
      const a = this.restMesh.instanceMatrix;
      a.addUpdateRange(k * 16, 16); a.needsUpdate = true;
      if (this.restMesh.instanceColor) {
        const ca = this.restMesh.instanceColor;
        ca.addUpdateRange(k * 3, 3); ca.needsUpdate = true;
      }
    }
    this.world.removeRigidBody(b.body);
    this.bodies.splice(i, 1);
  }

  _drop(i) {
    this.world.removeRigidBody(this.bodies[i].body);
    this.bodies.splice(i, 1);
  }

  // Cubes resting on the ground lose their footing when the hole reaches them.
  _wakeUnderHole(hole) {
    const { x: hx, z: hz, r } = hole;
    const rr = r * 0.97;
    for (let i = 0; i < this.nRest; i++) {
      if (!this.rest.live[i]) continue;
      const dx = this.rest.x[i] - hx, dz = this.rest.z[i] - hz;
      if (dx * dx + dz * dz > rr * rr) continue;
      this.rest.live[i] = 0;
      _o.position.set(0, 0, 0); _o.scale.setScalar(0); _o.updateMatrix();
      this.restMesh.setMatrixAt(i, _o.matrix);
      const a = this.restMesh.instanceMatrix;
      a.addUpdateRange(i * 16, 16); a.needsUpdate = true;
      this.spawn(this.rest.x[i], this.rest.y[i], this.rest.z[i], 0, -0.5, 0, this.rest.col[i]);
    }
  }

  update(dt, hole, onConsumed) {
    this._wakeUnderHole(hole);

    const { x: hx, z: hz, r } = hole;
    const rHole2 = r * r * 0.9;

    // Anything over the opening stops colliding with the ground, which is how
    // the hole is a hole as far as the simulation is concerned.
    for (const b of this.bodies) {
      const t = b.body.translation();
      const dx = t.x - hx, dz = t.z - hz;
      const over = (dx * dx + dz * dz) < rHole2;
      if (over !== b.offGround) {
        b.offGround = over;
        b.collider.setCollisionGroups(over ? G_CUBE_OFF : G_CUBE_ON);
        if (over) b.body.wakeUp();
      }
    }

    let steps = Math.min(3, Math.max(1, Math.round(dt / (1 / 60))));
    while (steps-- > 0) this.world.step();

    const deep = -(r * 0.8 + 10);
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      const t = b.body.translation();
      if (t.y < deep || t.y < -60) {
        if (t.y > -60 && onConsumed) onConsumed();
        this._drop(i);
        continue;
      }
      if (b.body.isSleeping() && !b.offGround) { this._retire(i); continue; }
    }

    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const t = b.body.translation();
      const q = b.body.rotation();
      _o.position.set(t.x, t.y, t.z);
      _o.quaternion.set(q.x, q.y, q.z, q.w);
      _o.scale.setScalar(this.cube);
      _o.updateMatrix();
      this.activeMesh.setMatrixAt(i, _o.matrix);
      this.activeMesh.setColorAt(i, b.col);
    }
    this.activeMesh.count = this.bodies.length;
    const a = this.activeMesh.instanceMatrix;
    a.clearUpdateRanges();
    if (this.bodies.length) a.addUpdateRange(0, this.bodies.length * 16);
    a.needsUpdate = true;
    if (this.activeMesh.instanceColor) this.activeMesh.instanceColor.needsUpdate = true;
  }
}
