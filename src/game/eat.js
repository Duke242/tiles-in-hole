import * as THREE from 'three';
import { writeObject, hideVoxel } from '../world/build.js';

// How voxel props get eaten (tiles are plain rigid bodies, see rigid.js). A
// prop stands until the hole is big enough and under it; then it loses its
// footing: it drops under gravity, topples toward the hole, and drifts to the
// centre while its voxels peel off the bottom. Voxels inside the rim pour down
// the shaft (credited at once); a share become loose rigid bodies that scatter
// and tumble in after, and anything overhanging the rim is knocked loose too.

const UP = new THREE.Vector3(0, 1, 0);
const _qy = new THREE.Quaternion();
const _ql = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _v = new THREE.Vector3();
const _pos = new THREE.Vector3();

export function updateEating(dt, ctx) {
  const { level, hole, rigid, debris, audio, fx, fields, consume, time } = ctx;
  const { r, x: hx, z: hz } = hole.state;
  let spawnedBodies = 0;

  for (const o of level.props) {
    if (o.state === 'gone') continue;
    const m = o.model;
    const dx = o.x - hx, dz = o.z - hz;
    const d = Math.hypot(dx, dz);

    if (o.state === 'idle') {
      const eligible = r >= o.need;

      if (eligible && ctx.magnet > 0 && d < r * 3.2 && d > 0.5) {
        const pull = Math.min(d - 0.2, (8 + r) * dt);
        o.x -= (dx / d) * pull; o.z -= (dz / d) * pull;
        _qy.setFromAxisAngle(UP, o.yaw);
        writeObject(o, fields, o.x, 0, o.z, _qy);
      }

      if (eligible && d < r * 0.85 + m.radius * 0.35) {
        if (m.bomb) {
          o.state = 'gone';
          for (const v of m.vox) hideVoxel(o, fields, v);
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * 6.283, s = 4 + Math.random() * 10;
            debris.spawn(o.x, 1.5, o.z, Math.cos(a) * s, 4 + Math.random() * 8, Math.sin(a) * s,
              i % 3 ? { r: 0.15, g: 0.15, b: 0.17 } : { r: 1, g: 0.55, b: 0.1 }, null, i % 2, false);
          }
          audio.boom();
          fx.shake(1.2);
          if (ctx.onBomb) ctx.onBomb();
          continue;
        }
        o.state = 'sinking';
        o.sink = 0; o.vy = 0; o.lean = 0; o.leanV = 0; o.peeled = 0;
        // topples toward the hole: the top falls over the void
        const a = Math.atan2(hz - o.z, hx - o.x) + (Math.random() - 0.5) * 0.8;
        o.leanX = Math.cos(a); o.leanZ = Math.sin(a);
        if (m.count > 60) { audio.rumble(); fx.shake(Math.min(0.6, m.count * 0.004)); }
        else audio.pop(ctx.progress.state.eaten);
        continue;
      }

      // Too big for the hole: it shudders as the hole passes underneath.
      if (!eligible && d < r + m.radius * 0.9) {
        o.shake = Math.min(1, o.shake + dt * 4);
      } else if (o.shake > 0) {
        o.shake = Math.max(0, o.shake - dt * 4);
      } else continue;
      _qy.setFromAxisAngle(UP, o.yaw);
      const j = o.shake * 0.12;
      writeObject(o, fields, o.x + Math.sin(time * 37) * j, 0, o.z + Math.cos(time * 31) * j, _qy);
      continue;
    }

    // --- sinking ----------------------------------------------------------
    // Once it is falling it belongs to the hole: it follows the hole closely
    // so a player sweeping on never leaves half-eaten stragglers behind.
    const k = Math.min(1, dt * 7);
    o.x += (hx - o.x) * k; o.z += (hz - o.z) * k;
    {
      const ddx = o.x - hx, ddz = o.z - hz, dd = Math.hypot(ddx, ddz), maxLag = r * 0.45;
      if (dd > maxLag) { o.x = hx + (ddx / dd) * maxLag; o.z = hz + (ddz / dd) * maxLag; }
    }
    o.vy = Math.min(22, o.vy + 30 * dt);
    o.sink += o.vy * dt;
    o.leanV += 1.6 * dt;
    o.lean = Math.min(0.7, o.lean + o.leanV * dt);

    _qy.setFromAxisAngle(UP, o.yaw);
    _axis.set(o.leanZ, 0, -o.leanX);
    _ql.setFromAxisAngle(_axis, o.lean);
    _q.copy(_ql).multiply(_qy);
    _pos.set(o.x, -o.sink, o.z);
    writeObject(o, fields, _pos.x, _pos.y, _pos.z, _q);

    const vox = m.vox;
    while (o.peeled < m.count) {
      const v = vox[o.peeled];
      _v.set(v.x, v.y + 0.5, v.z).applyQuaternion(_q).add(_pos);
      if (_v.y > -0.6) break;
      o.peeled++;
      hideVoxel(o, fields, v);
      const inHole = Math.hypot(_v.x - hx, _v.z - hz) < r * 0.92;
      if (inHole) {
        const share = r < 3 ? 0.08 : 0.26;
        if (spawnedBodies < 24 && rigid.nVox < rigid.voxCap * 0.8 && Math.random() < share) {
          spawnedBodies++;
          const a = Math.random() * 6.283, s = 1 + Math.random() * r * 0.5;
          rigid.spawn(_v.x, Math.max(_v.y, 0.7), _v.z, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, v, v.c, v.s);
        } else {
          consume(v.c, 1);
          debris.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2, v, v.c, v.s, false);
        }
      } else {
        // Overhanging the rim: it is still the hole's; it gets dragged over
        // the edge and drops in.
        const ax = hx - _v.x, az = hz - _v.z, al = Math.hypot(ax, az) || 1;
        const sp = al / 0.35;
        consume(v.c, 1);
        debris.spawn(_v.x, Math.max(_v.y, 0.6), _v.z, (ax / al) * sp, 2.5, (az / al) * sp, v, v.c, v.s, false);
      }
    }
    if (o.peeled >= m.count) o.state = 'gone';
  }
}
