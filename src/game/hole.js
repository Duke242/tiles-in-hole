import * as THREE from 'three';

// The hole: a shaft into darkness under the board, a two-tone rim, and the
// movement model. Velocity is capped so it glides with weight.
export const HOLE = { max: 9, baseSpeed: 5.2, speedPerR: 0.7, accel: 22 };

export function createHole(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const DEPTH = 40;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 0.9, DEPTH, 64, 1, true),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false,
      vertexShader: `varying float vY;
        void main(){ vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vY;
        void main(){
          float t = clamp((vY + ${(DEPTH / 2).toFixed(1)}) / ${DEPTH.toFixed(1)}, 0.0, 1.0);
          vec3 col = mix(vec3(0.0), vec3(0.05,0.07,0.22), pow(t, 3.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
  shaft.position.y = -DEPTH / 2 - 0.05;
  group.add(shaft);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  floor.position.y = -DEPTH + 0.5;
  group.add(floor);

  // Rim: a dark lip right at the edge, a wide pale ring around it.
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.98, 1.06, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x2a2320, fog: false }));
  inner.position.y = 0.05;
  group.add(inner);

  const outer = new THREE.Mesh(
    new THREE.RingGeometry(1.06, 1.26, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xeee8dc, fog: false }));
  outer.position.y = 0.05;
  group.add(outer);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.26, 1.6, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, fog: false, transparent: true, opacity: 0.0, depthWrite: false }));
  glow.position.y = 0.045;
  group.add(glow);

  const arrowGeo = new THREE.BufferGeometry();
  arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0.0, 0, 1.55, -0.4, 0, 1.05, 0.4, 0, 1.05,
  ], 3));
  arrowGeo.computeVertexNormals();
  const arrow = new THREE.Mesh(arrowGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.85 }));
  arrow.position.y = 0.08;
  group.add(arrow);

  const state = { x: 0, z: 0, r: 1, tr: 1, r0: 1, max: HOLE.max, vx: 0, vz: 0, speed: 0, eaten: 0, size: 1, boost: 0 };
  const bounds = { w: 60, d: 80 };

  function place(x, z) { state.x = x; state.z = z; }
  function reset(r0) {
    state.r = state.tr = state.r0 = r0;
    state.eaten = 0; state.size = 1; state.boost = 0;
    state.vx = state.vz = state.speed = 0;
  }
  function _target() {
    const base = state.r0 * (1 + 0.16 * Math.sqrt(state.eaten));
    state.size = 1 + Math.floor(0.45 * Math.sqrt(state.eaten));
    state.tr = Math.min(state.max, base * (state.boost > 0 ? 1.6 : 1));
  }
  function setBounds(w, d) { bounds.w = w; bounds.d = d; }
  function setMax(m) { state.max = m; _target(); }
  function setSkin([outerHex, innerHex]) { outer.material.color.set(outerHex); inner.material.color.set(innerHex); }

  // move: stick vector in world axes, length 0..1.
  function update(dt, move) {
    const maxV = HOLE.baseSpeed + state.r * HOLE.speedPerR;
    const pushing = (move.x !== 0 || move.z !== 0);
    const k = Math.min(1, dt * (pushing ? HOLE.accel : HOLE.accel * 1.7));
    state.vx += (move.x * maxV - state.vx) * k;
    state.vz += (move.z * maxV - state.vz) * k;
    const hw = bounds.w / 2 + 2, hd = bounds.d / 2 + 2;
    state.x = THREE.MathUtils.clamp(state.x + state.vx * dt, -hw, hw);
    state.z = THREE.MathUtils.clamp(state.z + state.vz * dt, -hd, hd);
    state.speed = Math.hypot(state.vx, state.vz);

    if (state.boost > 0) { state.boost -= dt; if (state.boost <= 0) _target(); }
    state.r += (state.tr - state.r) * Math.min(1, dt * 4);
    glow.material.opacity = state.boost > 0 ? 0.55 + 0.25 * Math.sin(performance.now() * 0.01) : 0;

    group.position.set(state.x, 0, state.z);
    shaft.scale.set(state.r, 1, state.r);
    floor.scale.set(state.r, 1, state.r);
    inner.scale.set(state.r, 1, state.r);
    outer.scale.set(state.r, 1, state.r);
    glow.scale.set(state.r, 1, state.r);

    const moving = state.speed > 1.2;
    arrow.visible = moving;
    if (moving) {
      arrow.scale.setScalar(state.r);
      arrow.rotation.y = Math.atan2(state.vx, state.vz);
    }
  }

  // Everything eaten counts; the radius follows the square root of the count
  // so the first tiles matter most.
  function grow(n) { state.eaten += n; _target(); }
  function boost(seconds) { state.boost = seconds; _target(); }

  return { state, update, grow, boost, place, reset, setBounds, setMax, setSkin };
}
