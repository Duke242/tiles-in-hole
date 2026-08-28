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

  // Bright gold lip with a soft halo bleeding onto the grass.
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.12, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf6e3a8, fog: false }));
  group.add(rim);

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.78, 0.92, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xd8a63c, fog: false }));
  group.add(inner);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.85, 96).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying float vR;
        void main(){ vR = length(position.xz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vR; uniform float uT;
        void main(){
          float a = 1.0 - smoothstep(1.05, 1.85, vR);
          a *= 0.62 + 0.16 * sin(uT * 3.0);
          gl_FragColor = vec4(1.0, 0.86, 0.36, a);
        }`,
    }));
  group.add(glow);

  // Little orange chevron showing which way the hole is travelling.
  const arrowGeo = new THREE.BufferGeometry();
  arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0.0, 0, 1.45, -0.42, 0, 0.92, 0.42, 0, 0.92,
  ], 3));
  arrowGeo.computeVertexNormals();
  const arrow = new THREE.Mesh(arrowGeo,
    new THREE.MeshBasicMaterial({ color: 0xf5a623, side: THREE.DoubleSide, fog: false }));
  group.add(arrow);

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
      const want = Math.min(maxV, d * 14);
      dvx = (dx / d) * want;
      dvz = (dz / d) * want;
    }
    const k = Math.min(1, dt * HOLE.accel);
    state.vx += (dvx - state.vx) * k;
    state.vz += (dvz - state.vz) * k;
    state.x = THREE.MathUtils.clamp(state.x + state.vx * dt, BOUND.lo, BOUND.hi);
    state.z = THREE.MathUtils.clamp(state.z + state.vz * dt, BOUND.lo, BOUND.hi);
    state.speed = Math.hypot(state.vx, state.vz);

    state.r += (state.tr - state.r) * Math.min(1, dt * 4.5);

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

    glow.position.y = lip + 0.03;
    glow.scale.set(state.r, 1, state.r);
    glow.material.uniforms.uT.value += 0.016;

    const moving = state.speed > 1.5;
    arrow.visible = moving;
    if (moving) {
      arrow.position.y = 0.16;
      arrow.scale.setScalar(state.r);
      arrow.rotation.y = Math.atan2(state.vx, state.vz);
    }
  }

  function grow(value) {
    state.tr = Math.min(HOLE.max, Math.sqrt(state.tr * state.tr + HOLE.growK * value));
  }

  return { state, update, grow, place };
}
