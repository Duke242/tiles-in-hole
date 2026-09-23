import { makeRng } from '../core/rng.js';
import { TILE_TYPES, DISC_H, DICE_S } from '../world/tiles.js';
import { buildSculpt } from '../world/sculpts.js';
import { BEAD } from '../world/voxel.js';
import { L_DISC, L_DICE } from '../game/rigid.js';
import { patternPoints, DISC_PITCH, DICE_PITCH, HOLE_START } from './generate.js';

// Free play: one huge board, no clock, no goal card. Stacks get taller the
// further you are from the middle, so the start is easy pickings and the
// edges are where the big columns are, and voxel props of every size (the
// landmarks too) are scattered by how much hole it takes to eat them. It
// ends when the board is bare.

export const FREE_SIZE = 220;
export const FREE_TILES = 6000;
export const FREE_HOLE_MAX = 13;
export const FREE_PROPS = 96;
const TAU = Math.PI * 2;
const NOT_PROPS = new Set(['stack', 'slab', 'pile', 'bomb']);

export function generateFreeMap({ seed, theme, size = FREE_SIZE, tiles: T = FREE_TILES, props: nProps = FREE_PROPS, voxCap = 40000, beadCap = 16000 }) {
  const rng = makeRng(seed);
  const w = size, d = size, half = size / 2;
  const reach = Math.hypot(half, half);

  // Placement with a coarse grid so thousands of footprints stay quick.
  const CELL = 12, G = Math.ceil(size / CELL) + 2;
  const grid = Array.from({ length: G * G }, () => []);
  const cellOf = (v) => Math.max(0, Math.min(G - 1, Math.floor((v + half) / CELL) + 1));
  function fits(x, z, radius) {
    if (Math.abs(x) > half - radius || Math.abs(z) > half - radius) return false;
    if (Math.hypot(x, z) < 3.2 + radius) return false;
    const cx = cellOf(x), cz = cellOf(z), span = Math.ceil((radius + 12) / CELL);
    for (let i = Math.max(0, cx - span); i <= Math.min(G - 1, cx + span); i++) {
      for (let j = Math.max(0, cz - span); j <= Math.min(G - 1, cz + span); j++) {
        for (const p of grid[i * G + j]) if (Math.hypot(p.x - x, p.z - z) < p.r + radius + 0.8) return false;
      }
    }
    return true;
  }
  function place(radius, dMin = 0, dMax = reach, tries = 40) {
    for (let t = 0; t < tries; t++) {
      let x, z;
      if (dMin > 0 || dMax < reach) {
        const a = rng.r(0, TAU), rr = Math.sqrt(rng.r(dMin * dMin, dMax * dMax));
        x = Math.cos(a) * rr; z = Math.sin(a) * rr;
      } else {
        x = rng.r(-half, half); z = rng.r(-half, half);
      }
      if (!fits(x, z, radius)) continue;
      grid[cellOf(x) * G + cellOf(z)].push({ x, z, r: radius });
      return [x, z];
    }
    return null;
  }

  // --- props ------------------------------------------------------------------
  // A spread of every prop the theme has, sorted by how big a hole they need;
  // the small ones go near the middle and the big ones out where the hole
  // will be big by the time it gets there. They go down first so the big
  // ones find room; the pool budget keeps the instance fields safe.
  const props = [];
  const kindsAvail = theme.spawn.map((s) => s[0]).filter((k) => !NOT_PROPS.has(k));
  const rMax = FREE_HOLE_MAX - 0.6;
  const cand = [];
  for (let i = 0; i < nProps && kindsAvail.length; i++) {
    const model = buildSculpt(kindsAvail[i % kindsAvail.length], rng, theme.P);
    if (!model.count) continue;
    const need = model.radius * 0.92 + 0.4;
    if (need > rMax) continue;
    cand.push({ model, need });
  }
  cand.sort((a, b) => a.need - b.need);
  let cubes = 0, beads = 0;
  for (let i = 0; i < cand.length; i++) {
    const { model, need } = cand[i];
    const nb = model.vox.reduce((n, v) => n + (v.s === BEAD ? 1 : 0), 0), nc = model.count - nb;
    if (cubes + nc > voxCap * 0.9 || beads + nb > beadCap * 0.9) continue;
    const t = cand.length > 1 ? i / (cand.length - 1) : 0;
    const dMin = 12 + t * 70;
    const at = place(model.radius + 0.6, dMin, Math.min(reach, dMin + 60));
    if (!at) continue;
    cubes += nc; beads += nb;
    props.push({ x: at[0], z: at[1], yaw: rng.i(0, 3) * Math.PI / 2, model, need });
  }

  // --- stacks -----------------------------------------------------------------
  const tiles = [];
  const allTypes = TILE_TYPES.map((_, i) => i);
  const kinds = ['block', 'block', 'line', 'ring', 'rings', 'spiral', 'triangle', 'diamond', 'arc', 'cross'];
  let tilesLeft = T, guard = 0;
  while (tilesLeft > 0 && guard++ < 4000) {
    const isDice = rng.chance(0.35);
    const pitch = isDice ? DICE_PITCH : DISC_PITCH;
    const pts = patternPoints(rng, rng.pick(kinds), pitch);
    let radius = 0;
    for (const p of pts) radius = Math.max(radius, Math.hypot(p[0], p[1]));
    radius += pitch * 0.6;
    const at = place(radius);
    if (!at) continue;
    // Taller toward the edge: 1-3 high in the middle, 3-6 at the rim.
    const far = Math.min(1, Math.hypot(at[0], at[1]) / (half * 0.95));
    const hMin = 1 + Math.floor(far * 2.2), hMax = 3 + Math.floor(far * 3.2);
    const h = rng.i(hMin, hMax);
    const typeA = rng.pick(allTypes), typeB = rng.pick(allTypes);
    const alt = rng.chance(0.4);
    const rot = rng.r(0, TAU), cr = Math.cos(rot), sr = Math.sin(rot);
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

  // Cakes: tall wide single tiles, one item each, away from the start.
  for (let i = 0; i < 40; i++) {
    const at = place(1.2, 22);
    if (!at) break;
    tiles.push({ x: at[0], y: DISC_H * 3 / 2, z: at[1], kind: L_DISC, type: rng.pick(allTypes), yaw: rng.r(0, TAU), scale: 1.7, tall: 3 });
  }

  return {
    n: 0, free: true, seed, theme, board: { w, d }, tiles, props, goals: [], time: 0,
    holeStart: HOLE_START, holeMax: FREE_HOLE_MAX, totalTiles: tiles.length,
  };
}
