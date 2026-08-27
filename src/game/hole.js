import * as THREE from 'three';
import { HOLE, FUNNEL_DEPTH, BOUND } from './tune.js';

// The hole itself: crater lip, shaft, and the movement model. Velocity is
// capped so it glides with weight instead of snapping to the finger.
export function createHole(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 0.82, 30, 64, 1, true),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false,
      vertexShader: `varying float vY;
        void main(){ vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vY;
        void main(){
          float t = clamp((vY + 15.0) / 30.0, 0.0, 1.0);
          vec3 col = mix(vec3(0.0), vec3(0.10,0.06,0.20), pow(t, 2.4));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
  group.add(shaft);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  group.add(floor);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.02, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf7f7fa, fog: false }));
  group.add(rim);

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.9, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x140f22, fog: false }));
  group.add(inner);

  const state = {
    x: 0, z: 0, r: HOLE.start, tr: HOLE.start,
    vx: 0, vz: 0, speed: 0,
  };

  function place(x, z) { state.x = x; state.z = z; }

  function update(dt, target) {
    const dx = target.x - state.x, dz = target.z - state.z;
    const d = Math.hypot(dx, dz);
    const maxV = HOLE.baseSpeed + state.r * HOLE.speedPerR;
    // Desired velocity points at the target, easing down over the last metre
    // so the hole settles instead of jittering around the finger.
    let dvx = 0, dvz = 0;
    if (d > 1e-4) {
      const want = Math.min(maxV, d * 6);
      dvx = (dx / d) * want;
      dvz = (dz / d) * want;
    }
    const k = Math.min(1, dt * HOLE.accel);
    state.vx += (dvx - state.vx) * k;
    state.vz += (dvz - state.vz) * k;
    state.x = THREE.MathUtils.clamp(state.x + state.vx * dt, BOUND.lo, BOUND.hi);
    state.z = THREE.MathUtils.clamp(state.z + state.vz * dt, BOUND.lo, BOUND.hi);
    state.speed = Math.hypot(state.vx, state.vz);

    state.r += (state.tr - state.r) * Math.min(1, dt * 3);

    const lip = -FUNNEL_DEPTH * state.r;
    group.position.set(state.x, 0, state.z);
    shaft.position.y = lip - 15;
    shaft.scale.set(state.r, 1, state.r);
    floor.position.y = lip - 29.5;
    floor.scale.set(state.r, 1, state.r);
    rim.position.y = lip + 0.06;
    rim.scale.set(state.r, 1, state.r);
    inner.position.y = lip + 0.04;
    inner.scale.set(state.r, 1, state.r);
  }

  function grow(value) {
    state.tr = Math.min(HOLE.max, Math.sqrt(state.tr * state.tr + HOLE.growK * value));
  }

  return { state, update, grow, place };
}
