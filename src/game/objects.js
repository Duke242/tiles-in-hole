// Stacks are the whole world now. A stack stands until the hole is under it,
// then sinks: tiles peel off the bottom into the pit while the rest settles
// down after them, which is the collapse the game is built around.

export function updateObjects(dt, ctx) {
  const { world, hole, rigid, audio, fx, progress, time } = ctx;
  const { r, x: hx, z: hz } = hole.state;

  for (const o of world.objects) {
    if (o.state === 'gone') continue;

    const dx = o.x - hx, dz = o.z - hz;
    const d = Math.hypot(dx, dz);

    if (o.state === 'idle') {
      const eligible = r >= o.need;

      // The ground under it is simply gone, so the stack stops being a
      // structure and becomes a column of loose bodies: it topples away from
      // the hole's centre, the base drops in, the rest tumbles after it.
      if (eligible && d < r * 0.94 + o.radius * 0.45) {
        o.state = 'gone';
        o.field.hide(o.ref);
        const nx = d > 0.01 ? dx / d : 0, nz = d > 0.01 ? dz / d : 0;
        for (let i = 0; i < o.count; i++) {
          const frac = i / Math.max(1, o.count - 1);
          // A nudge away from the hole; the solver does the rest, so the
          // tower topples and the cubes knock each other about on the way in.
          const lean = 0.6 + frac * 3.4;
          rigid.spawn(
            o.x, (i + 0.5) * o.tileH, o.z,
            nx * lean + (Math.random() - 0.5) * 0.8,
            0,
            nz * lean + (Math.random() - 0.5) * 0.8,
            o.colors[i]);
        }
        progress.credit(o, true);
        progress.bump();
        if (o.count > 12) { audio.rumble(); fx.shake(Math.min(0.5, o.count * 0.02)); }
        else audio.pop(progress.state.combo);
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

  }
}


