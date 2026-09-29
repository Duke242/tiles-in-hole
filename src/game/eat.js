import { hideVoxel } from '../world/build.js';

// Ordinary structures are simulated block by block by Rigid. Only the bomb
// hazard has a scripted effect; it never pulls neighbouring structures in.
export function updateEating(dt, ctx) {
  const { level, hole, debris, audio, fx, fields } = ctx;
  const { r, x: hx, z: hz } = hole.state;
  for (const o of level.props) {
    const m = o.model;
    if (o.state === 'gone' || !m.bomb) continue;
    if (Math.hypot(o.x - hx, o.z - hz) >= r * 0.85 + m.radius * 0.35) continue;
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
  }
}
