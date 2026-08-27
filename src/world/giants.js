import * as THREE from 'three';

// Original voxel creatures, sculpted as unions of ellipsoids and boxes.
// Each is a landmark statue the hole can only swallow once it is huge.

const ell = (p, c, r) =>
  ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2 <= 1;
const box = (p, c, h) =>
  Math.abs(p[0] - c[0]) <= h[0] && Math.abs(p[1] - c[1]) <= h[1] && Math.abs(p[2] - c[2]) <= h[2];

// Each sculpt returns the colour for a voxel, or null for empty space.
const SCULPTS = {
  // Round-eared rabbit sitting upright.
  bunny(p) {
    let c = null;
    if (ell(p, [0, 8, 0], [8, 9, 7])) c = '#d7d9e0';
    if (ell(p, [0, 7, 4.6], [5, 5.4, 3])) c = '#f4f5f8';
    if (ell(p, [0, 6, -7], [2.4, 2.4, 2.4])) c = '#f4f5f8';
    if (ell(p, [-4.4, 2, 4], [2.6, 2.2, 3.2]) || ell(p, [4.4, 2, 4], [2.6, 2.2, 3.2])) c = '#e6e8ee';
    if (ell(p, [0, 19, 1], [5.6, 5.6, 5.2])) c = '#d7d9e0';
    if (ell(p, [0, 18, 5.6], [2.4, 2.0, 1.6])) c = '#f4f5f8';
    if (ell(p, [-2.9, 28, 1], [1.9, 7.5, 1.7]) || ell(p, [2.9, 28, 1], [1.9, 7.5, 1.7]))
      c = p[2] > 1.4 ? '#f6b6cd' : '#e6e8ee';
    if (ell(p, [-2.2, 20.6, 5.2], [1.0, 1.0, 1.0]) || ell(p, [2.2, 20.6, 5.2], [1.0, 1.0, 1.0])) c = '#23232b';
    if (ell(p, [0, 18.8, 6.4], [0.8, 0.7, 0.7])) c = '#f6b6cd';
    return c;
  },
  // Chunky standing bear.
  bear(p) {
    let c = null;
    if (ell(p, [0, 8, 0], [7.4, 8.4, 6.2])) c = '#a5692a';
    if (ell(p, [0, 7.5, 4.4], [4.4, 4.8, 2.4])) c = '#d9a05e';
    if (ell(p, [-7.2, 9, 1], [2.3, 5.2, 2.3]) || ell(p, [7.2, 9, 1], [2.3, 5.2, 2.3])) c = '#96601f';
    if (ell(p, [-3.6, 2, 3.6], [2.8, 2.6, 3.2]) || ell(p, [3.6, 2, 3.6], [2.8, 2.6, 3.2])) c = '#96601f';
    if (ell(p, [0, 19, 0.5], [5.4, 5.2, 5.0])) c = '#a5692a';
    if (ell(p, [-4.6, 23.4, 0.5], [2.2, 2.2, 1.7]) || ell(p, [4.6, 23.4, 0.5], [2.2, 2.2, 1.7])) c = '#96601f';
    if (ell(p, [0, 17.6, 4.6], [2.4, 2.0, 1.6])) c = '#e4c08c';
    if (ell(p, [-2.0, 20.4, 4.4], [0.9, 0.9, 0.9]) || ell(p, [2.0, 20.4, 4.4], [0.9, 0.9, 0.9])) c = '#23232b';
    if (ell(p, [0, 18.2, 5.9], [1.0, 0.8, 0.8])) c = '#23232b';
    return c;
  },
  // Bath-toy duck.
  duck(p) {
    let c = null;
    if (ell(p, [0, 6.5, -1], [6.6, 6.2, 8.0])) c = '#ffd633';
    if (ell(p, [-6.4, 7, -1], [2.0, 3.4, 5.0]) || ell(p, [6.4, 7, -1], [2.0, 3.4, 5.0])) c = '#f2c00f';
    if (ell(p, [0, 8, -8.6], [3.0, 3.6, 2.6])) c = '#ffd633';
    if (ell(p, [0, 16, 2.6], [4.6, 4.6, 4.6])) c = '#ffd633';
    if (ell(p, [0, 14.6, 7.6], [1.9, 1.1, 3.0])) c = '#ff8c1a';
    if (ell(p, [-1.9, 17.6, 5.6], [1.0, 1.0, 1.0]) || ell(p, [1.9, 17.6, 5.6], [1.0, 1.0, 1.0])) c = '#23232b';
    return c;
  },
  // Loaf-shaped cat with a tall tail.
  cat(p) {
    let c = null;
    if (ell(p, [0, 6, 0], [6.2, 6.0, 8.2])) c = '#8f8f9c';
    if (ell(p, [0, 4.4, 3.4], [4.0, 3.4, 4.4])) c = '#e8e8ee';
    if (ell(p, [-4.0, 1.8, 5.2], [2.0, 2.0, 2.6]) || ell(p, [4.0, 1.8, 5.2], [2.0, 2.0, 2.6])) c = '#e8e8ee';
    if (ell(p, [0, 13.5, 4.0], [4.8, 4.6, 4.6])) c = '#8f8f9c';
    if (box(p, [-3.4, 18.4, 4.0], [1.5, 2.2, 1.2]) && p[1] < 22 - Math.abs(p[0] + 3.4) * 1.2) c = '#8f8f9c';
    if (box(p, [3.4, 18.4, 4.0], [1.5, 2.2, 1.2]) && p[1] < 22 - Math.abs(p[0] - 3.4) * 1.2) c = '#8f8f9c';
    if (ell(p, [0, 12.6, 8.2], [2.2, 1.8, 1.4])) c = '#e8e8ee';
    if (ell(p, [-2.0, 14.6, 7.6], [0.9, 1.1, 0.9]) || ell(p, [2.0, 14.6, 7.6], [0.9, 1.1, 0.9])) c = '#4ad06a';
    if (ell(p, [0, 13.2, 9.2], [0.7, 0.6, 0.6])) c = '#f6b6cd';
    // tail sweeping up behind
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      if (ell(p, [0, 4 + t * 14, -7.6 - Math.sin(t * 2.2) * 2.6], [1.5, 1.6, 1.5])) c = '#8f8f9c';
    }
    return c;
  },
  // Blocky retro robot.
  robot(p) {
    let c = null;
    if (box(p, [0, 9, 0], [6.0, 7.0, 4.4])) c = '#4a90c8';
    if (box(p, [0, 9.5, 4.5], [3.4, 3.4, 0.6])) c = '#d8e6ef';
    if (box(p, [0, 9.5, 4.9], [2.2, 2.2, 0.5])) c = '#3ecf6e';
    if (box(p, [-7.2, 9, 0], [1.4, 6.4, 1.6]) || box(p, [7.2, 9, 0], [1.4, 6.4, 1.6])) c = '#e8622f';
    if (box(p, [-3.2, 1.2, 0], [2.2, 2.4, 2.6]) || box(p, [3.2, 1.2, 0], [2.2, 2.4, 2.6])) c = '#3f4650';
    if (box(p, [0, 18.5, 0], [4.6, 4.0, 4.0])) c = '#5aa0d8';
    if (box(p, [0, 18.8, 4.2], [3.2, 2.0, 0.5])) c = '#23232b';
    if (ell(p, [-1.8, 18.8, 4.5], [0.9, 0.9, 0.6]) || ell(p, [1.8, 18.8, 4.5], [0.9, 0.9, 0.6])) c = '#ffd23e';
    if (box(p, [0, 23.4, 0], [0.4, 1.6, 0.4])) c = '#c0c4cc';
    if (ell(p, [0, 25.4, 0], [1.2, 1.2, 1.2])) c = '#ff4a3a';
    return c;
  },
};

export const GIANT_TYPES = Object.keys(SCULPTS);

const BOX = new THREE.BoxGeometry(1, 1, 1);
const _o = new THREE.Object3D();

export function createGiant(scene, type, x, z, voxelSize) {
  const sculpt = SCULPTS[type];
  const vox = [];
  const c = new THREE.Color();
  const filled = new Set();
  const key = (a, b2, d) => a + ',' + b2 + ',' + d;
  for (let vx = -11; vx <= 11; vx++) {
    for (let vy = 0; vy <= 34; vy++) {
      for (let vz = -11; vz <= 11; vz++) {
        const hex = sculpt([vx, vy, vz]);
        if (!hex) continue;
        filled.add(key(vx, vy, vz));
        vox.push({ vx, vy, vz, hex });
      }
    }
  }

  // Baked ambient occlusion: a tile walled in by neighbours sits in a crevice
  // and goes darker, which is what makes the statue read as thousands of
  // separate tiles rather than one solid lump.
  for (const v of vox) {
    let n = 0;
    for (let ax = -1; ax <= 1; ax++)
      for (let ay = -1; ay <= 1; ay++)
        for (let az = -1; az <= 1; az++) {
          if (!ax && !ay && !az) continue;
          if (filled.has(key(v.vx + ax, v.vy + ay, v.vz + az))) n++;
        }
    const ao = 1 - 0.42 * Math.pow(n / 26, 1.6);
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    c.set(v.hex);
    v.color = new THREE.Color(c.r * ao * jitter, c.g * ao * jitter, c.b * ao * jitter);
    v.lx = v.vx * voxelSize;
    v.ly = (v.vy + 0.5) * voxelSize;
    v.lz = v.vz * voxelSize;
  }

  const mesh = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffffff }), vox.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const yaw = Math.random() * Math.PI * 2;
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  vox.forEach((v, i) => {
    _o.position.set(v.lx, v.ly, v.lz);
    _o.rotation.set(0, 0, 0);
    _o.scale.setScalar(voxelSize * 0.88);
    _o.updateMatrix();
    mesh.setMatrixAt(i, _o.matrix);
    mesh.setColorAt(i, v.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // Eat order: bottom-up with a little noise, so it collapses from the base
  // and the head topples last.
  const order = vox.map((_, i) => i)
    .sort((a, b) => (vox[a].ly + Math.random() * 1.6) - (vox[b].ly + Math.random() * 1.6));

  return {
    mesh, vox, order, yaw,
    height: 35 * voxelSize,
    radius: 11 * voxelSize,
    voxelSize,
  };
}
