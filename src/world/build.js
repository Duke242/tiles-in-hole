import { Field } from './field.js';

// The world is a flat green field carpeted with stacks of flat tiles, built
// from the actual gameplay: columns of plates in saturated colours, packed
// into slabs, plateaus, staircases and lone spires.

export const WORLD = { size: 580 };

const COLORS = ['#e5322c', '#2f6fe8', '#33c24a', '#28b6a6', '#f5c518',
                '#8a5fd8', '#e8459a', '#f0842a', '#f4ead2', '#4fd0ea'];

export const TILE_W = 2.7;
export const TILE_H = 0.62;

const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function buildWorld(scene) {
  const objects = [];
  const field = new Field(scene, 90000, { cast: true, receive: false });
  let totalValue = 0;

  function addStack(x, z, count, mode, baseColor) {
    if (count < 1) return null;
    const parts = [], colors = [];
    for (let i = 0; i < count; i++) {
      let c;
      if (mode === 'solid') c = baseColor;
      else if (mode === 'stripe') c = COLORS[i % COLORS.length];
      else if (mode === 'duo') c = i % 2 ? baseColor : '#f4ead2';
      else c = pick(COLORS);
      colors.push(c);
      parts.push({
        x: 0, y: (i + 0.5) * TILE_H, z: 0,
        sx: TILE_W, sy: TILE_H * 0.9, sz: TILE_W, color: c,
      });
    }
    const ref = field.alloc(parts);
    if (!ref) return null;
    const value = count * 0.6;
    const o = {
      kind: 'stack', x, z, yaw: 0, ref, field, colors,
      count, tileH: TILE_H, radius: TILE_W * 0.71,
      height: count * TILE_H,
      need: 1.7 + count * 0.21,
      value, state: 'idle', sink: 0, removed: 0, shake: 0,
    };
    field.write(ref, x, 0, z, 0, 1);
    objects.push(o);
    totalValue += value;
    return o;
  }

  // A cluster is a grid of touching columns; the height profile decides
  // whether it reads as a slab, a staircase or a ragged pile.
  function cluster(cx, cz) {
    const cols = irand(2, 8), rows = irand(2, 8);
    const profile = pick(['flat', 'stairs', 'ridge', 'noise']);
    const mode = Math.random() < 0.62 ? 'solid' : (Math.random() < 0.5 ? 'stripe' : 'duo');
    const base = pick(COLORS);
    const peak = irand(6, 34);
    for (let a = 0; a < cols; a++) {
      for (let c = 0; c < rows; c++) {
        let n;
        if (profile === 'flat') n = peak + irand(-1, 1);
        else if (profile === 'stairs') n = Math.max(2, Math.round(peak * (a + 1) / cols));
        else if (profile === 'ridge') {
          const t = 1 - Math.abs((a / (cols - 1 || 1)) - 0.5) * 2;
          n = Math.max(2, Math.round(2 + peak * t));
        } else n = Math.max(2, peak + irand(-5, 5));
        if (Math.random() < 0.05) continue;
        addStack(cx + (a - cols / 2) * TILE_W, cz + (c - rows / 2) * TILE_W,
          n, mode, mode === 'solid' && Math.random() < 0.25 ? pick(COLORS) : base);
      }
    }
  }

  const half = WORLD.size / 2;
  const clear = 24;   // just enough room to start

  for (let i = 0; i < 150; i++) {
    let cx, cz, guard = 0;
    do { cx = rand(-half + 40, half - 40); cz = rand(-half + 40, half - 40); guard++; }
    while (Math.hypot(cx, cz) < clear && guard < 40);
    cluster(cx, cz);
  }

  // Lone spires: the towers that dominate the skyline.
  for (let i = 0; i < 170; i++) {
    const a = rand(0, 6.2832), rr = rand(clear + 10, half - 24);
    addStack(Math.cos(a) * rr, Math.sin(a) * rr, irand(30, 95),
      Math.random() < 0.5 ? 'stripe' : 'solid', pick(COLORS));
  }

  // Short scattered stacks filling the gaps, incl. a few right by the start.
  for (let i = 0; i < 1500; i++) {
    const a = rand(0, 6.2832), rr = rand(8, half - 16);
    addStack(Math.cos(a) * rr, Math.sin(a) * rr, irand(2, 13),
      Math.random() < 0.75 ? 'solid' : 'duo', pick(COLORS));
  }

  field.flush();
  console.log('tiles placed:', field.used, 'stacks:', objects.length);

  return {
    objects, field, totalValue,
    totalCount: objects.length,
    giants: [],
    staticField: field,
    dynField: field,
  };
}
