import * as THREE from 'three';
import { hash3 } from '../core/rng.js';

// Everything in a level is sculpted from primitives painted into an integer
// voxel grid. Later paints win, `null` erases, and a colour can be a function
// of the voxel position so windows, stripes and seeds are one-liners.
//
// Grid space: x right, z forward, y is the layer index with layer 0 resting on
// the ground. Each voxel renders as a unit cube (or a bead) centred at
// (x, y + 0.5, z).

export const CUBE = 0;
export const BEAD = 1;

const KEY = (x, y, z) => ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
const _c = new THREE.Color();

function distToSeg(px, py, pz, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const l2 = abx * abx + aby * aby + abz * abz || 1e-6;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / l2));
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class Sculpt {
  constructor() { this.map = new Map(); }

  paint(x, y, z, color, shape = CUBE) {
    if (y < 0) return this;
    const c = typeof color === 'function' ? color(x, y, z) : color;
    if (c === undefined) return this;
    const k = KEY(x, y, z);
    if (c === null) { this.map.delete(k); return this; }
    this.map.set(k, { x, y, z, c, s: shape });
    return this;
  }

  scan(x0, x1, y0, y1, z0, z1, test, color, shape = CUBE) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++)
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.ceil(y1); y++)
        for (let z = Math.floor(z0); z <= Math.ceil(z1); z++)
          if (test(x, y, z)) this.paint(x, y, z, color, shape);
    return this;
  }

  // Axis-aligned box from half extents. `hollow` leaves a shell that thick.
  box(cx, cy, cz, hx, hy, hz, color, o = {}) {
    const hollow = o.hollow || 0;
    return this.scan(cx - hx, cx + hx, cy - hy, cy + hy, cz - hz, cz + hz, (x, y, z) => {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy), dz = Math.abs(z - cz);
      if (dx > hx + 1e-6 || dy > hy + 1e-6 || dz > hz + 1e-6) return false;
      if (hollow && dx <= hx - hollow && dy <= hy - hollow && dz <= hz - hollow) return false;
      return true;
    }, color, o.shape);
  }

  ell(cx, cy, cz, rx, ry, rz, color, o = {}) {
    const hollow = o.hollow || 0;
    return this.scan(cx - rx, cx + rx, cy - ry, cy + ry, cz - rz, cz + rz, (x, y, z) => {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
      if (d > 1) return false;
      if (hollow) {
        const q = ((x - cx) / Math.max(0.5, rx - hollow)) ** 2 + ((y - cy) / Math.max(0.5, ry - hollow)) ** 2
          + ((z - cz) / Math.max(0.5, rz - hollow)) ** 2;
        if (q <= 1) return false;
      }
      return true;
    }, color, o.shape);
  }

  sphere(cx, cy, cz, r, color, o) { return this.ell(cx, cy, cz, r, r, r, color, o); }

  // Vertical cylinder; hy is the half height.
  cyl(cx, cy, cz, r, hy, color, o = {}) {
    const hollow = o.hollow || 0;
    return this.scan(cx - r, cx + r, cy - hy, cy + hy, cz - r, cz + r, (x, y, z) => {
      const d2 = (x - cx) ** 2 + (z - cz) ** 2;
      if (d2 > r * r + 1e-6 || Math.abs(y - cy) > hy + 1e-6) return false;
      if (hollow && d2 <= (r - hollow) ** 2) return false;
      return true;
    }, color, o.shape);
  }

  // Cone standing on layer cy with radius r0, radius r1 at height cy + h.
  cone(cx, cy, cz, r0, r1, h, color, o = {}) {
    const rm = Math.max(r0, r1);
    return this.scan(cx - rm, cx + rm, cy, cy + h, cz - rm, cz + rm, (x, y, z) => {
      const t = (y - cy) / Math.max(1, h);
      if (t < 0 || t > 1) return false;
      const r = r0 + (r1 - r0) * t;
      return (x - cx) ** 2 + (z - cz) ** 2 <= r * r + 1e-6;
    }, color, o.shape);
  }

  // Torus with major radius R, minor r. axis 'y' lies flat, 'z' or 'x' stand up.
  torus(cx, cy, cz, R, r, color, o = {}) {
    const axis = o.axis || 'y';
    const e = R + r;
    return this.scan(cx - e, cx + e, cy - e, cy + e, cz - e, cz + e, (x, y, z) => {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      let q;
      if (axis === 'y') q = (Math.hypot(dx, dz) - R) ** 2 + dy * dy;
      else if (axis === 'z') q = (Math.hypot(dx, dy) - R) ** 2 + dz * dz;
      else q = (Math.hypot(dy, dz) - R) ** 2 + dx * dx;
      return q <= r * r + 1e-6;
    }, color, o.shape);
  }

  // Tube of radius r swept along a polyline of [x, y, z] points.
  tube(pts, r, color, o = {}) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      this.scan(
        Math.min(a[0], b[0]) - r, Math.max(a[0], b[0]) + r,
        Math.min(a[1], b[1]) - r, Math.max(a[1], b[1]) + r,
        Math.min(a[2], b[2]) - r, Math.max(a[2], b[2]) + r,
        (x, y, z) => distToSeg(x, y, z, a, b) <= r + 1e-6, color, o.shape);
    }
    return this;
  }

  // Finalise: bake ambient occlusion and colour jitter, measure the footprint,
  // and order voxels bottom-up so structures peel from the base when eaten.
  build(meta = {}) {
    const vox = Array.from(this.map.values());
    let maxY = 0, rad = 0;
    for (const v of vox) {
      let n = 0;
      for (let ax = -1; ax <= 1; ax++)
        for (let ay = -1; ay <= 1; ay++)
          for (let az = -1; az <= 1; az++) {
            if (!ax && !ay && !az) continue;
            if (this.map.has(KEY(v.x + ax, v.y + ay, v.z + az))) n++;
          }
      const ao = 1 - 0.40 * Math.pow(n / 26, 1.4);
      const j = 1 + (hash3(v.x, v.y, v.z) - 0.5) * 0.07;
      _c.set(v.c);
      v.r = _c.r * ao * j; v.g = _c.g * ao * j; v.b = _c.b * ao * j;
      if (v.y + 1 > maxY) maxY = v.y + 1;
      const d = Math.hypot(v.x, v.z) + 0.5;
      if (d > rad) rad = d;
    }
    vox.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
    return { vox, count: vox.length, radius: rad, height: maxY, ...meta };
  }
}
