import * as THREE from 'three';
import { CITY, funnelY, FUNNEL_OUT } from './tune.js';

const _v = new THREE.Vector3();

const SINKERS = new Set(['house', 'shop', 'lowrise', 'tower']);

// Drives every object in the world each frame: idle behaviour (walking,
// driving), the "too big for you" wobble, and the three ways things get
// eaten — small stuff slides down the crater, buildings sink, giants crumble.
export function updateObjects(dt, ctx) {
  const { world, hole, debris, audio, fx, time } = ctx;
  const { r, x: hx, z: hz } = hole.state;
  const funnelR = r * FUNNEL_OUT;

  for (const o of world.objects) {
    if (o.state === 'gone') continue;
    const dx = o.x - hx, dz = o.z - hz;
    const d = Math.hypot(dx, dz);

    if (o.kind === 'giant') { updateGiant(dt, o, d, ctx); continue; }

    switch (o.state) {
      case 'idle': {
        if (o.kind === 'person') stepPerson(dt, o, hx, hz, d, r, time);
        else if (o.axis) stepVehicle(dt, o);

        const eligible = r >= o.need;
        const bite = r * 0.95 + o.radius * 0.35;

        if (eligible && d < bite) {
          if (SINKERS.has(o.kind)) {
            o.state = 'sinking'; o.sink = 0;
            audio.rumble();
            fx.shake(o.kind === 'tower' ? 0.75 : 0.4);
          } else {
            o.state = 'sliding';
            o.vx = -dx * 0.4; o.vz = -dz * 0.4;
          }
          break;
        }

        // Inside the crater but not swallowed yet: things tip and slide.
        if (eligible && !SINKERS.has(o.kind) && d < funnelR) {
          o.state = 'sliding';
          o.vx = 0; o.vz = 0;
          break;
        }

        // Too big to eat: shudder and shed dust as a hint to grow more.
        if (!eligible && d < funnelR + o.radius) {
          o.shake = Math.min(1, o.shake + dt * 3);
          const j = o.shake * 0.06;
          o.field.write(o.ref, o.x + Math.sin(time * 34) * j, 0, o.z + Math.cos(time * 29) * j,
            o.yaw, 1, 0, Math.sin(time * 31) * j * 0.03);
          if (Math.random() < dt * 5) debris.dust(o.x + (Math.random() - 0.5) * o.radius, 0.4,
            o.z + (Math.random() - 0.5) * o.radius, 1);
        } else if (o.shake > 0) {
          o.shake = Math.max(0, o.shake - dt * 3);
          o.field.write(o.ref, o.x, 0, o.z, o.yaw, 1);
        }
        break;
      }

      case 'sliding': {
        // Accelerate down the crater wall toward the throat.
        const pull = (240 * (1 - Math.min(1, d / Math.max(1, funnelR))) + 55) * dt / Math.max(0.01, d);
        o.vx += -dx * pull; o.vz += -dz * pull;
        // a little swirl so things curve into the pit
        const swirl = 34 * dt / Math.max(0.01, d);
        o.vx += -dz * swirl * 0.35; o.vz += dx * swirl * 0.35;
        o.vx *= 0.985; o.vz *= 0.985;
        o.x += o.vx * dt; o.z += o.vz * dt;

        const nd = Math.hypot(o.x - hx, o.z - hz);
        o.y = funnelY(nd, r);
        // tilt to face downhill
        const slope = Math.min(1, (funnelR - nd) / Math.max(1, funnelR)) * 1.15;
        const ang = Math.atan2(o.z - hz, o.x - hx);
        o.pitch = Math.sin(ang) * slope;
        o.roll = -Math.cos(ang) * slope;
        o.t += dt;

        if (nd < r * 0.85) {
          // over the edge: drop, shrink, vanish
          o.y -= 14 * dt * (1 + o.t);
          o.scale = Math.max(0.03, o.scale - dt * 1.9);
          if (o.scale <= 0.06 || o.y < -r * 3) {
            swallow(o, ctx);
            break;
          }
        }
        o.field.write(o.ref, o.x, o.y, o.z, o.yaw + o.t * o.spin * 0.6, o.scale, o.pitch, o.roll);
        break;
      }

      case 'sinking': {
        o.sink += (o.height + 6) * dt / 1.9;
        const j = 0.4;
        o.field.write(o.ref,
          o.x + (Math.random() - 0.5) * j, -o.sink, o.z + (Math.random() - 0.5) * j, o.yaw, 1);
        if (Math.random() < dt * 34) {
          const a = Math.random() * 6.28, rr = o.radius * (0.4 + Math.random() * 0.7);
          debris.spawn(o.x + Math.cos(a) * rr, Math.max(0.6, o.height - o.sink) * Math.random(),
            o.z + Math.sin(a) * rr,
            Math.cos(a) * 8, 3 + Math.random() * 9, Math.sin(a) * 8,
            0.6 + Math.random() * 0.9, Math.random() < 0.7 ? o.color : '#dfe8f0');
        }
        if (o.sink > o.height + 5) { swallow(o, ctx); }
        break;
      }
    }
  }
}

function stepPerson(dt, o, hx, hz, d, r, time) {
  const panic = r * FUNNEL_OUT + 9;
  if (d < panic && d > 0.01) {
    o.yaw = Math.atan2(o.x - hx, o.z - hz);
    const run = 7.5;
    o.x += Math.sin(o.yaw) * run * dt;
    o.z += Math.cos(o.yaw) * run * dt;
    o.walk += dt * 15;
  } else {
    o.wander -= dt;
    if (o.wander <= 0) { o.wander = 1.5 + Math.random() * 3.5; o.yaw = Math.random() * 6.28; }
    o.x += Math.sin(o.yaw) * o.speed * dt;
    o.z += Math.cos(o.yaw) * o.speed * dt;
    o.walk += dt * o.speed * 3.4;
  }
  o.x = THREE.MathUtils.clamp(o.x, -18, CITY.SPAN + 18);
  o.z = THREE.MathUtils.clamp(o.z, -18, CITY.SPAN + 18);
  const bob = Math.abs(Math.sin(o.walk)) * 0.14;
  o.field.write(o.ref, o.x, bob, o.z, o.yaw, 1, 0, 0, Math.sin(o.walk) * 0.34);
}

function stepVehicle(dt, o) {
  const span = CITY.SPAN + 40;
  if (o.axis === 'x') {
    o.x += o.speed * dt;
    if (o.x > CITY.SPAN + 20) o.x -= span;
    if (o.x < -20) o.x += span;
  } else {
    o.z += o.speed * dt;
    if (o.z > CITY.SPAN + 20) o.z -= span;
    if (o.z < -20) o.z += span;
  }
  o.field.write(o.ref, o.x, 0, o.z, o.yaw, 1);
}

function swallow(o, ctx) {
  const { debris, audio, hole, progress, fx } = ctx;
  o.state = 'gone';
  o.field.hide(o.ref);
  hole.grow(o.value);
  progress.credit(o);
  const heavy = o.value >= 18;
  if (heavy) { audio.boom(); fx.shake(0.5); } else { audio.pop(progress.combo); audio.crunch(); }
  debris.puff(hole.state.x, -hole.state.r * 0.6, hole.state.z, o.color,
    heavy ? 14 : 5, heavy ? 12 : 6);
}

function updateGiant(dt, o, d, ctx) {
  const { debris, audio, hole, progress, fx, time } = ctx;
  const g = o.giant;
  const r = hole.state.r;

  if (o.state === 'gone') return;

  const reach = r + o.radius * 0.92;
  if (r < o.need) {
    if (d < reach + 4) {
      const j = Math.sin(time * 26) * 0.25;
      g.mesh.position.x = o.x + j;
      g.mesh.position.z = o.z + Math.cos(time * 23) * 0.25;
      if (Math.random() < dt * 8) debris.dust(o.x + (Math.random() - 0.5) * o.radius * 2, 1, o.z + (Math.random() - 0.5) * o.radius * 2, 1);
    }
    return;
  }
  if (d > reach) return;

  // Devour voxel by voxel, bottom first, streaming rubble at the hole.
  o.acc += 420 * dt;
  let n = Math.floor(o.acc);
  o.acc -= n;
  if (n > 0) {
    o.soundT = (o.soundT || 0) - dt;
    if (o.soundT <= 0) { o.soundT = 0.1; audio.crunch(); }
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  while (n-- > 0 && o.ptr < g.order.length) {
    const vi = g.order[o.ptr++];
    const v = g.vox[vi];
    g.mesh.setMatrixAt(vi, zero);
    _v.set(v.lx, v.ly, v.lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw)
      .add(g.mesh.position);
    const tx = hole.state.x - _v.x, tz = hole.state.z - _v.z;
    const td = Math.hypot(tx, tz) || 1;
    debris.spawn(_v.x, Math.max(0.5, _v.y), _v.z,
      (tx / td) * (10 + Math.random() * 18) + (Math.random() - 0.5) * 5,
      2 + Math.random() * 10,
      (tz / td) * (10 + Math.random() * 18) + (Math.random() - 0.5) * 5,
      g.voxelSize * (0.85 + Math.random() * 0.35), v.color);
    hole.grow(0.06);
    progress.creditRaw(0.06);
  }
  g.mesh.instanceMatrix.needsUpdate = true;

  // The statue settles into the ground as it is consumed.
  const frac = o.ptr / g.order.length;
  g.mesh.position.y = -g.height * frac * 0.72;

  if (o.ptr >= g.order.length) {
    o.state = 'gone';
    g.mesh.visible = false;
    progress.credit(o, true);
    audio.boom();
    fx.shake(1.0);
  }
}
