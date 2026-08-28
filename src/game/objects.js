// Stacks are the whole world now. A stack stands until the hole is under it,
// then sinks: tiles peel off the bottom into the pit while the rest settles
// down after them, which is the collapse the game is built around.

export function updateObjects(dt, ctx) {
  const { world, hole, debris, audio, fx, progress, time } = ctx;
  const { r, x: hx, z: hz } = hole.state;

  for (const o of world.objects) {
    if (o.state === 'gone') continue;

    const dx = o.x - hx, dz = o.z - hz;
    const d = Math.hypot(dx, dz);

    if (o.state === 'idle') {
      const eligible = r >= o.need;

      // Nothing is dragged in: the ground is simply gone underneath it.
      if (eligible && d < r * 0.94 + o.radius * 0.45) {
        o.state = 'collapsing';
        o.sink = 0;
        o.removed = 0;
        if (o.count > 12) { audio.rumble(); fx.shake(0.25); }
        continue;
      }

      // Too big for the current hole: shudder as it passes.
      if (!eligible && d < r + o.radius * 1.4) {
        o.shake = Math.min(1, o.shake + dt * 3.5);
        const j = o.shake * 0.09;
        o.field.write(o.ref, o.x + Math.sin(time * 33) * j, 0, o.z + Math.cos(time * 28) * j, 0, 1);
      } else if (o.shake > 0) {
        o.shake = Math.max(0, o.shake - dt * 4);
        o.field.write(o.ref, o.x, 0, o.z, 0, 1);
      }
      continue;
    }

    if (o.state === 'collapsing') {
      // Descend at a rate that scales a little with the hole, so a big hole
      // chews through a tower fast.
      o.sink += (7 + r * 0.45) * dt;
      const want = Math.min(o.count, Math.floor(o.sink / o.tileH));

      while (o.removed < want) {
        const i = o.removed++;
        o.field.hidePart(o.ref, i);
        // The freed tile tumbles down inside the pit.
        debris.spawn(
          o.x + (Math.random() - 0.5) * o.radius,
          -r * 0.25 - Math.random() * 2,
          o.z + (Math.random() - 0.5) * o.radius,
          (Math.random() - 0.5) * 5, -2 - Math.random() * 5, (Math.random() - 0.5) * 5,
          TILE_SIZE, o.colors[i]);
        hole.grow(0.6);
        progress.creditRaw(0.6);
        if ((i & 3) === 0) audio.pop(progress.state.combo);
      }

      o.field.write(o.ref, o.x, -o.sink, o.z, 0, 1);

      if (o.removed >= o.count) {
        o.state = 'gone';
        o.field.hide(o.ref);
        progress.credit(o, true);
        progress.bump();
        if (o.count > 18) { audio.boom(); fx.shake(0.4); }
      }
    }
  }
}

// Matches TILE_W in the world builder; kept local to avoid a cyclic import.
const TILE_SIZE = 2.4;
