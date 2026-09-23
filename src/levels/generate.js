import { makeRng } from '../core/rng.js';
import { TILE_TYPES } from '../world/tiles.js';
import { DISC_H, DICE_S } from '../world/tiles.js';
import { buildSculpt } from '../world/sculpts.js';
import { themeForLevel } from '../world/themes.js';
import { L_DISC, L_DICE } from '../game/rigid.js';

// A level is a seeded arrangement of picture-tile stacks in patterns (blocks,
// rings, spirals, triangles...), a goal card listing which tile types to
// collect, and a clock. Later levels sprinkle in voxel props as a bonus.

export const HOLE_START = 1.0;
export const DISC_PITCH = 1.12, DICE_PITCH = 1.0;
const TAU = Math.PI * 2;

// Footprints of one group of stacks, centred on the origin (shared with the
// free-play map).
export function patternPoints(rng, kind, pitch) {
  const pts = [];
  const push = (x, z) => pts.push([x, z]);
  if (kind === 'block') {
    const cols = rng.i(2, 6), rows = rng.i(2, 6);
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) push((a - (cols - 1) / 2) * pitch, (b - (rows - 1) / 2) * pitch);
  } else if (kind === 'line') {
    const n = rng.i(4, 10);
    for (let a = 0; a < n; a++) push((a - (n - 1) / 2) * pitch, 0);
  } else if (kind === 'ring' || kind === 'rings') {
    const k = kind === 'ring' ? 1 : rng.i(2, 4);
    const R0 = rng.r(1.4, 2.6);
    for (let i = 0; i < k; i++) {
      const R = R0 + i * pitch * 1.05, n = Math.max(6, Math.round(TAU * R / pitch));
      for (let a = 0; a < n; a++) push(Math.cos(a / n * TAU) * R, Math.sin(a / n * TAU) * R);
    }
  } else if (kind === 'spiral') {
    const turns = rng.r(1.5, 3), R0 = 0.8, R1 = rng.r(4, 7);
    let a = 0;
    while (a < turns * TAU) {
      const R = R0 + (R1 - R0) * (a / (turns * TAU));
      push(Math.cos(a) * R, Math.sin(a) * R);
      a += pitch / Math.max(0.8, R);
    }
  } else if (kind === 'triangle') {
    const rows = rng.i(4, 8);
    for (let r = 0; r < rows; r++) for (let a = 0; a <= r; a++) push((a - r / 2) * pitch, (r - (rows - 1) / 2) * pitch * 0.9);
  } else if (kind === 'diamond') {
    const half = rng.i(2, 4);
    for (let r = -half; r <= half; r++) { const w = half - Math.abs(r); for (let a = -w; a <= w; a++) push(a * pitch, r * pitch * 0.9); }
  } else if (kind === 'arc') {
    const R = rng.r(3, 6), span = rng.r(1.5, 3.2), n = Math.round(R * span / pitch);
    for (let a = 0; a <= n; a++) { const t = -span / 2 + span * a / n; push(Math.cos(t) * R, Math.sin(t) * R); }
  } else if (kind === 'cross') {
    const n = rng.i(2, 4);
    for (let a = -n; a <= n; a++) { push(a * pitch, 0); if (a) push(0, a * pitch); }
  }
  return pts;
}

export function generateLevel(n) {
  const rng = makeRng(n * 7919 + 13);
  const theme = themeForLevel(n);
  const L = Math.min(n, 400);
  const T = n === 1 ? 45 : n === 2 ? 80 : Math.min(2200, 120 + L * 8);
  const w = Math.round(12 + Math.sqrt(T) * 1.25), d = Math.round(w * 1.35);

  // Tile types: the goal ones, and fillers you must steer around.
  const pool = rng.shuffle(TILE_TYPES.map((_, i) => i));
  const nGoal = n === 1 ? 3 : n === 2 ? 1 : n < 6 ? 2 : rng.pick([1, 2, 2, 3, 3]);
  const nFill = n === 1 ? 0 : n === 2 ? 1 : rng.i(0, 2);
  const goalTypes = pool.slice(0, nGoal), fillTypes = pool.slice(nGoal, nGoal + nFill);
  const allTypes = goalTypes.concat(fillTypes);

  const tiles = [];
  const placed = [];
  const hMin = n < 3 ? 2 : 1, hMax = n < 3 ? 4 : n < 10 ? 5 : 6;
  let tilesLeft = T;
  const startClear = 2.6;

  function place(radius, tries = 60) {
    for (let t = 0; t < tries; t++) {
      const x = rng.r(-w / 2 + radius, w / 2 - radius), z = rng.r(-d / 2 + radius, d / 2 - radius);
      if (Math.hypot(x, z) < startClear + radius) continue;
      let ok = true;
      for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < p.r + radius + 0.6) { ok = false; break; }
      if (ok) { placed.push({ x, z, r: radius }); return [x, z]; }
    }
    return null;
  }

  // Groups of stacks in a pattern. Rings alternate two types like the app.
  const kinds = n < 3 ? ['block', 'block', 'line', 'ring'] : ['block', 'line', 'ring', 'rings', 'spiral', 'triangle', 'diamond', 'arc', 'cross'];
  let guard = 0;
  while (tilesLeft > 0 && guard++ < 80) {
    const isDice = n >= 3 && rng.chance(0.35);
    const pitch = isDice ? DICE_PITCH : DISC_PITCH;
    const pts = patternPoints(rng, rng.pick(kinds), pitch);
    const h = rng.i(hMin, hMax);
    let radius = 0;
    for (const p of pts) radius = Math.max(radius, Math.hypot(p[0], p[1]));
    radius += pitch * 0.6;
    const at = place(radius);
    if (!at) continue;
    const typeA = rng.pick(allTypes), typeB = rng.pick(allTypes);
    const alt = rng.chance(0.4);
    const rot = rng.r(0, TAU);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < pts.length; i++) {
      const [lx, lz] = pts[i];
      const x = at[0] + lx * cr - lz * sr, z = at[1] + lx * sr + lz * cr;
      const type = alt ? (i % 2 ? typeB : typeA) : typeA;
      const hh = Math.max(1, h + (rng.chance(0.25) ? rng.i(-1, 1) : 0));
      for (let k = 0; k < hh; k++) {
        const y = isDice ? DICE_S * (k + 0.5) : DISC_H * (k + 0.5);
        tiles.push({ x, y, z, kind: isDice ? L_DICE : L_DISC, type, yaw: isDice ? rng.i(0, 3) * Math.PI / 2 : rng.r(0, TAU), scale: 1, tall: 1 });
        tilesLeft--;
      }
    }
  }

  // Cakes: a few tall, wide single tiles of a goal type, each worth one.
  if (n >= 3) {
    const nCake = rng.i(1, Math.min(4, 1 + Math.floor(n / 4)));
    const type = goalTypes[goalTypes.length - 1];
    for (let i = 0; i < nCake; i++) {
      const at = place(1.2);
      if (!at) break;
      tiles.push({ x: at[0], y: DISC_H * 3 / 2, z: at[1], kind: L_DISC, type, yaw: rng.r(0, TAU), scale: 1.7, tall: 3 });
    }
  }

  // Goal card: every tile of each goal type on the board.
  const counts = new Map();
  for (const t of tiles) counts.set(t.type, (counts.get(t.type) || 0) + 1);
  const goals = goalTypes.filter((t) => counts.get(t)).map((t) => ({
    key: TILE_TYPES[t].id, icon: t, need: counts.get(t), have: 0,
  }));

  // Bonus voxel props from level 15: they grow the hole but are not on the card.
  const props = [];
  if (n >= 15) {
    const rMax = HOLE_START * (1 + 0.16 * Math.sqrt(tiles.length * 0.7));
    const smallKinds = theme.spawn.map((s) => s[0]).filter((k) => !['stack', 'slab', 'pile', 'bomb'].includes(k));
    const nProps = Math.min(4, 1 + Math.floor((n - 15) / 8));
    for (let i = 0; i < nProps && smallKinds.length; i++) {
      const model = buildSculpt(rng.pick(smallKinds), rng, theme.P);
      if (!model.count || model.landmark) continue;
      const need = model.radius * 0.92 + 0.4;
      if (need > rMax - 0.4) continue;
      const at = place(model.radius + 0.5);
      if (!at) continue;
      props.push({ x: at[0], z: at[1], yaw: rng.i(0, 3) * Math.PI / 2, model, need });
    }
  }

  const time = n === 1 ? 180 : Math.round(Math.min(420, Math.max(180, 140 + tiles.length * 0.35)) / 10) * 10;

  return { n, theme, board: { w, d }, tiles, props, goals, time, holeStart: HOLE_START, totalTiles: tiles.length };
}
