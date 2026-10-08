// Model kit for Squad Rush: smooth low-poly characters and props built from
// rounded boxes, capsules and spheres, with one colour per vertex so a whole
// model is a single geometry (one draw call per instanced part).
//
// Characters are split into rigid parts that pivot at a joint (hips,
// shoulders) so the renderer can swing legs and arms per instance. Every
// model faces -z (towards larger d, up the road).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// Position / rotation / scale as one matrix.
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// Normalise a primitive for merging: non-indexed, transformed, painted, and
// with only the attributes every part shares.
function prep(g, color, m) {
  if (g.index) g = g.toNonIndexed();
  if (m) g.applyMatrix4(m);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export const rbox = (w, h, d, r, color, m) => prep(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), color, m);
export const cap = (r, len, color, m) => prep(new THREE.CapsuleGeometry(r, len, 4, 10), color, m);
export const ball = (r, color, m, ws = 14, hs = 10) => prep(new THREE.SphereGeometry(r, ws, hs), color, m);
export const cyl = (rt, rb, h, color, m, seg = 12) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), color, m);
export const cone = (r, h, color, m, seg = 10) => prep(new THREE.ConeGeometry(r, h, seg), color, m);
export const blob = (r, color, m, detail = 1) => prep(new THREE.IcosahedronGeometry(r, detail), color, m);
export const merge = (parts) => mergeGeometries(parts);

// ---------- soldier ----------
// Blue fatigues, tactical vest, helmet and rifle. Legs pivot at the hips.

const UNIFORM = 0x2f6fd6, VEST = 0x23344d, PANTS = 0x22324a, SKIN = 0xf0c39c, HELMET = 0x1f4f99, GUN = 0x262a30, BOOT = 0x1b1d22;

export const SOLDIER_HIP = { x: 0.085, y: 0.36 };

export function soldierBody() {
  return merge([
    rbox(0.32, 0.34, 0.2, 0.07, UNIFORM, M(0, 0.53, 0)),
    rbox(0.35, 0.24, 0.24, 0.06, VEST, M(0, 0.55, 0)),
    rbox(0.1, 0.07, 0.04, 0.02, 0x3d5068, M(-0.08, 0.5, -0.125)),
    rbox(0.1, 0.07, 0.04, 0.02, 0x3d5068, M(0.08, 0.5, -0.125)),
    rbox(0.34, 0.06, 0.22, 0.02, 0x1a2230, M(0, 0.39, 0)),
    rbox(0.24, 0.26, 0.12, 0.05, 0x3a4a5e, M(0, 0.56, 0.16)),
    cyl(0.05, 0.06, 0.06, SKIN, M(0, 0.71, 0)),
    ball(0.11, SKIN, M(0, 0.82, -0.005)),
    ball(0.128, HELMET, M(0, 0.86, 0.005, 0, 0, 0, 1, 0.78, 1.05)),
    cyl(0.14, 0.14, 0.02, HELMET, M(0, 0.835, 0.0, 0, 0, 0, 1, 1, 1.1), 14),
    rbox(0.13, 0.03, 0.02, 0.01, 0x0f1218, M(0, 0.835, -0.115)),
    // arms bent forward around the rifle
    cap(0.048, 0.16, UNIFORM, M(-0.19, 0.6, -0.05, -0.9, 0, 0.25)),
    cap(0.048, 0.16, UNIFORM, M(0.19, 0.6, -0.05, -0.9, 0, -0.25)),
    cap(0.042, 0.14, UNIFORM, M(-0.12, 0.55, -0.2, -1.5, 0.5, 0)),
    cap(0.042, 0.14, UNIFORM, M(0.13, 0.56, -0.2, -1.5, -0.4, 0)),
    ball(0.045, SKIN, M(-0.05, 0.56, -0.28)),
    ball(0.045, SKIN, M(0.08, 0.58, -0.25)),
    // rifle
    rbox(0.055, 0.09, 0.46, 0.02, GUN, M(0.03, 0.6, -0.3)),
    rbox(0.045, 0.12, 0.06, 0.015, GUN, M(0.03, 0.52, -0.3, 0.25)),
    rbox(0.05, 0.08, 0.14, 0.02, 0x3b3f46, M(0.03, 0.6, -0.04)),
    cyl(0.018, 0.018, 0.2, 0x15171b, M(0.03, 0.61, -0.62, Math.PI / 2), 8),
    rbox(0.03, 0.03, 0.08, 0.01, 0x15171b, M(0.03, 0.665, -0.3)),
  ]);
}

export function soldierLeg() {
  return merge([
    cap(0.068, 0.18, PANTS, M(0, -0.13, 0)),
    rbox(0.11, 0.08, 0.17, 0.035, BOOT, M(0, -0.32, -0.03)),
  ]);
}

// ---------- zombie ----------
// Hunched, torn shirt, green skin, arms out front. Arms pivot at the
// shoulders, legs at the hips. Kinds are tinted per instance.

const ZSKIN = 0x8dbb6a, ZSHIRT = 0xb2ab94, ZPANTS = 0x4d4436, ZDARK = 0x2c3326, BLOOD = 0x7a1414;

export const ZOMBIE_HIP = { x: 0.09, y: 0.38 };
export const ZOMBIE_SHOULDER = { x: 0.2, y: 0.7, z: -0.02 };

export function zombieBody() {
  return merge([
    rbox(0.36, 0.4, 0.22, 0.07, ZSHIRT, M(0, 0.58, 0, -0.18)),
    rbox(0.2, 0.12, 0.23, 0.04, ZSKIN, M(0.06, 0.45, -0.005, -0.18)),
    rbox(0.1, 0.12, 0.03, 0.02, BLOOD, M(-0.08, 0.62, -0.125, -0.18)),
    rbox(0.08, 0.06, 0.03, 0.02, BLOOD, M(0.1, 0.53, -0.115, -0.18)),
    rbox(0.35, 0.06, 0.22, 0.02, 0x3b3226, M(0, 0.4, 0)),
    cyl(0.055, 0.06, 0.08, ZSKIN, M(0, 0.79, -0.06, -0.4)),
    ball(0.13, ZSKIN, M(0, 0.9, -0.1, 0, 0, 0.12)),
    ball(0.1, ZSKIN, M(0, 0.83, -0.16, 0, 0, 0, 1.05, 0.7, 0.9)),
    rbox(0.1, 0.03, 0.03, 0.012, 0x3a1010, M(0, 0.8, -0.24)),
    ball(0.028, 0xffe36b, M(-0.05, 0.92, -0.215), 8, 6),
    ball(0.028, 0xffe36b, M(0.05, 0.92, -0.215), 8, 6),
    ball(0.12, ZDARK, M(0.02, 0.98, -0.07, 0, 0, 0, 1, 0.5, 1)),
  ]);
}

export function zombieArm(side) {
  return merge([
    cap(0.06, 0.1, ZSHIRT, M(0, 0, -0.06, -Math.PI / 2)),
    cap(0.05, 0.26, ZSKIN, M(0, 0, -0.24, -Math.PI / 2)),
    ball(0.055, ZSKIN, M(side * 0.01, -0.01, -0.42, 0, 0, 0, 1, 0.8, 1.2)),
  ]);
}

export function zombieLeg() {
  return merge([
    cap(0.072, 0.2, ZPANTS, M(0, -0.14, 0)),
    cap(0.05, 0.05, ZSKIN, M(0, -0.31, 0)),
    rbox(0.11, 0.07, 0.17, 0.03, 0x2a2420, M(0, -0.34, -0.03)),
  ]);
}

// ---------- boss ----------
// A hulking mutant: purple hide, bone spikes, glowing eyes, club arms.

export function bossParts() {
  const HIDE = 0x6a3f86, HIDE2 = 0x523168, FLESH = 0x79a85c, BONE = 0xe9e1c6;
  const body = merge([
    rbox(1.05, 0.85, 0.7, 0.25, HIDE, M(0, 1.05, 0.05, -0.25)),
    rbox(0.8, 0.45, 0.6, 0.2, HIDE2, M(0, 0.62, 0)),
    rbox(0.5, 0.4, 0.1, 0.08, 0x8a5aa8, M(0, 0.95, -0.33, -0.25)),
    ball(0.3, FLESH, M(0, 1.55, -0.3, 0, 0, 0, 1, 0.9, 1)),
    ball(0.22, FLESH, M(0, 1.42, -0.45, 0, 0, 0, 1.1, 0.6, 0.9)),
    rbox(0.34, 0.06, 0.06, 0.02, BONE, M(0, 1.36, -0.6)),
    cone(0.06, 0.12, BONE, M(-0.12, 1.31, -0.6, Math.PI)),
    cone(0.06, 0.12, BONE, M(0.12, 1.31, -0.6, Math.PI)),
    ...[-0.3, -0.1, 0.12, 0.32].map((x, i) => cone(0.07, 0.3 - i * 0.03, BONE, M(x, 1.52 - Math.abs(x) * 0.4, 0.22, 0.6))),
    ball(0.22, HIDE, M(-0.55, 1.35, 0)),
    ball(0.22, HIDE, M(0.55, 1.35, 0)),
  ]);
  const arm = merge([
    cap(0.16, 0.45, FLESH, M(0, -0.3, -0.05, -0.35)),
    cap(0.14, 0.4, FLESH, M(0, -0.72, -0.35, -1.0)),
    ball(0.24, 0x5e8f4a, M(0, -0.9, -0.62)),
    cone(0.05, 0.14, BONE, M(-0.1, -0.9, -0.84, -Math.PI / 2)),
    cone(0.05, 0.14, BONE, M(0.1, -0.9, -0.84, -Math.PI / 2)),
  ]);
  const leg = merge([
    cap(0.17, 0.35, HIDE2, M(0, -0.25, 0)),
    rbox(0.32, 0.18, 0.42, 0.08, 0x3a2a2a, M(0, -0.55, -0.06)),
  ]);
  const eyes = merge([
    ball(0.05, 0xffffff, M(-0.11, 1.6, -0.56), 8, 6),
    ball(0.05, 0xffffff, M(0.11, 1.6, -0.56), 8, 6),
  ]);
  return { body, arm, leg, eyes };
}

// ---------- props ----------

export function treeGeometry(shade = 0) {
  const g = [0x4f8a3c, 0x5c9a42, 0x3f7a35][shade];
  return merge([
    cyl(0.1, 0.15, 1.0, 0x6b4a2f, M(0, 0.5, 0), 8),
    blob(0.7, g, M(0, 1.45, 0, 0, 0, 0, 1, 0.85, 1)),
    blob(0.5, g, M(0.38, 1.2, 0.15)),
    blob(0.48, g, M(-0.32, 1.25, -0.18)),
    blob(0.45, g, M(0.05, 1.95, 0.05)),
  ]);
}

export function pineGeometry() {
  return merge([
    cyl(0.09, 0.13, 0.8, 0x5c3f28, M(0, 0.4, 0), 8),
    cone(0.75, 1.1, 0x2f6b3a, M(0, 1.15, 0), 12),
    cone(0.6, 0.95, 0x377a42, M(0, 1.65, 0), 12),
    cone(0.42, 0.8, 0x3f8a4a, M(0, 2.1, 0), 12),
  ]);
}

export function bushGeometry() {
  return merge([
    blob(0.42, 0x4a8a3a, M(0, 0.28, 0, 0, 0, 0, 1.2, 0.8, 1)),
    blob(0.32, 0x55993f, M(0.35, 0.22, 0.1)),
    blob(0.3, 0x447f36, M(-0.3, 0.2, -0.1)),
  ]);
}

export function carGeometry() {
  // White body: tinted per instance.
  const W = 0xffffff, GLASS = 0x2b3a48, TYRE = 0x1a1a1a, RIM = 0xb8bec6;
  const parts = [
    rbox(1.55, 0.5, 3.3, 0.2, W, M(0, 0.48, 0)),
    rbox(1.35, 0.48, 1.7, 0.22, W, M(0, 0.9, 0.2)),
    rbox(1.37, 0.34, 1.5, 0.12, GLASS, M(0, 0.92, 0.2)),
    rbox(1.4, 0.12, 0.1, 0.04, 0xd9d9d9, M(0, 0.4, -1.66)),
    rbox(1.4, 0.12, 0.1, 0.04, 0xd9d9d9, M(0, 0.4, 1.66)),
    rbox(0.3, 0.1, 0.04, 0.03, 0xfff3c0, M(-0.5, 0.55, -1.66)),
    rbox(0.3, 0.1, 0.04, 0.03, 0xfff3c0, M(0.5, 0.55, -1.66)),
    rbox(0.3, 0.1, 0.04, 0.03, 0xd02020, M(-0.5, 0.55, 1.66)),
    rbox(0.3, 0.1, 0.04, 0.03, 0xd02020, M(0.5, 0.55, 1.66)),
  ];
  for (const [x, z] of [[-0.74, 1.05], [0.74, 1.05], [-0.74, -1.05], [0.74, -1.05]]) {
    parts.push(cyl(0.3, 0.3, 0.22, TYRE, M(x, 0.3, z, 0, 0, Math.PI / 2), 14));
    parts.push(cyl(0.16, 0.16, 0.23, RIM, M(x, 0.3, z, 0, 0, Math.PI / 2), 10));
  }
  return merge(parts);
}

export function lampGeometry() {
  return merge([
    cyl(0.1, 0.13, 0.25, 0x4a4f57, M(0, 0.12, 0), 10),
    cyl(0.045, 0.06, 3.2, 0x5b616b, M(0, 1.7, 0), 8),
    cap(0.035, 0.7, 0x5b616b, M(0.33, 3.32, 0, 0, 0, Math.PI / 2 - 0.2)),
    rbox(0.42, 0.1, 0.2, 0.04, 0x3d424a, M(0.72, 3.38, 0)),
    rbox(0.34, 0.03, 0.14, 0.01, 0xfff4cf, M(0.72, 3.32, 0)),
  ]);
}

export function barrierGeometry() {
  return merge([
    rbox(1.6, 0.18, 0.5, 0.05, 0xc9c6bd, M(0, 0.09, 0)),
    rbox(1.6, 0.6, 0.24, 0.05, 0xd6d3ca, M(0, 0.45, 0)),
    rbox(1.62, 0.12, 0.26, 0.03, 0xe0a030, M(0, 0.62, 0)),
    rbox(1.62, 0.12, 0.26, 0.03, 0xe0a030, M(0, 0.38, 0)),
  ]);
}

export function coneGeometry() {
  return merge([
    rbox(0.4, 0.05, 0.4, 0.02, 0xe2541c, M(0, 0.025, 0)),
    cone(0.15, 0.55, 0xf06a24, M(0, 0.3, 0), 14),
    cyl(0.105, 0.125, 0.09, 0xf4f4f4, M(0, 0.28, 0), 14),
  ]);
}

export function rockGeometry() {
  return merge([
    blob(0.45, 0x8d918b, M(0, 0.2, 0, 0, 0, 0, 1.2, 0.6, 1), 0),
    blob(0.25, 0x7d817c, M(0.4, 0.12, 0.2, 0, 0, 0, 1, 0.7, 1), 0),
  ]);
}

export function hydrantGeometry() {
  return merge([
    cyl(0.12, 0.14, 0.5, 0xd23a2a, M(0, 0.25, 0), 12),
    ball(0.13, 0xd23a2a, M(0, 0.52, 0)),
    cyl(0.05, 0.05, 0.36, 0xb32f22, M(0, 0.35, 0, 0, 0, Math.PI / 2), 8),
  ]);
}
