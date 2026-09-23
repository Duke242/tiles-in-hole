import { Sculpt, CUBE, BEAD } from './voxel.js';
import { hash3 } from '../core/rng.js';

// The structure library. Every sculpt paints into a fresh Sculpt centred on
// the origin with its base on layer 0, using colours from the theme palette P
// so goal cards stay coherent. Returns metadata (landmarks are rationed by
// the level generator).

const TAU = Math.PI * 2;
const stripesY = (a, b, p = 2) => (x, y) => (Math.floor(y / p) % 2 ? b : a);
const sectors = (a, b, n = 8) => (x, y, z) => (Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * n) % 2 ? b : a);
const speckle = (base, dot, p) => (x, y, z) => (hash3(x, y, z) < p ? dot : base);

export const SCULPTS = {
  // ---- shared filler -------------------------------------------------------
  stack(S, rng, P) {
    const h = rng.i(2, 7);
    const cols = P.tiles;
    const mode = rng.pick(['solid', 'solid', 'stripe', 'duo']);
    const base = rng.pick(cols), alt = rng.pick(cols);
    const shape = rng.chance(0.3) ? BEAD : CUBE;
    const off = rng.i(0, cols.length - 1);
    for (let y = 0; y < h; y++) {
      const c = mode === 'solid' ? base : mode === 'stripe' ? cols[(y + off) % cols.length] : (y % 2 ? alt : base);
      S.paint(0, y, 0, c, shape);
    }
    return {};
  },
  slab(S, rng, P) {
    const w = rng.i(1, 2), d = rng.i(1, 2), h = rng.i(1, 4);
    const c = rng.pick(P.tiles);
    S.box(0, (h - 1) / 2, 0, w, (h - 1) / 2, d, c, { shape: rng.chance(0.25) ? BEAD : CUBE });
    return {};
  },
  pile(S, rng, P) {
    const n = rng.i(3, 6), c = rng.pick(P.tiles), c2 = rng.pick(P.tiles);
    for (let i = 0; i < n; i++) {
      S.box(rng.i(-2, 2), 0, rng.i(-2, 2), rng.i(0, 1), 0, rng.i(0, 1), rng.chance(0.5) ? c : c2);
    }
    S.box(0, 1, 0, 1, 0, 1, c);
    return {};
  },

  // A bomb: swallow it and the level is over. Kept small so it hides among
  // the tiles you actually want.
  bomb(S, rng, P) {
    S.sphere(0, 2, 0, 2, '#23232b', { shape: BEAD });
    S.tube([[0, 4, 0], [1, 6, 0]], 0.4, '#8c8c96');
    S.sphere(1, 6.5, 0, 0.7, '#ff8c1a', { shape: BEAD });
    return { bomb: true };
  },

  // ---- city ----------------------------------------------------------------
  building(S, rng, P) {
    const hx = rng.i(2, 4), hz = rng.i(2, 4), h = rng.i(6, 16);
    const wall = rng.pick(P.walls), trim = rng.pick(P.walls), win = P.glass;
    S.box(0, (h - 1) / 2, 0, hx, (h - 1) / 2, hz, (x, y, z) => {
      const onEdge = Math.abs(x) === hx || Math.abs(z) === hz;
      if (!onEdge) return wall;
      const col = Math.abs(x) === hx ? z : x;
      return (y > 0 && y < h - 1 && y % 3 !== 0 && col % 2 === 0) ? win : wall;
    });
    S.box(0, h, 0, hx - 1, 0, hz - 1, trim);
    if (rng.chance(0.5)) S.cyl(rng.i(-hx + 2, hx - 2), h + 1.5, rng.i(-hz + 2, hz - 2), 1, 1, P.dark);
    return {};
  },
  tower(S, rng, P) {
    const wall = rng.pick(P.walls), wall2 = rng.pick(P.walls);
    let hx = rng.i(3, 4), y = 0;
    const tiers = rng.i(2, 3);
    for (let t = 0; t < tiers; t++) {
      const h = rng.i(6, 11), c = t % 2 ? wall2 : wall;
      S.box(0, y + (h - 1) / 2, 0, hx, (h - 1) / 2, hx, (x, yy, z) => {
        const onEdge = Math.abs(x) === hx || Math.abs(z) === hx;
        const col = Math.abs(x) === hx ? z : x;
        return (onEdge && (yy - y) % 3 === 1 && col % 2 === 0) ? P.glass : c;
      });
      y += h; hx = Math.max(1, hx - 1);
    }
    S.box(0, y, 0, hx, 0, hx, P.dark);
    S.cyl(0, y + 2, 0, 0.4, 2, P.dark);
    S.sphere(0, y + 4.5, 0, 0.7, P.red, { shape: BEAD });
    return { landmark: true };
  },
  house(S, rng, P) {
    const wall = rng.pick(P.walls), roof = rng.pick(P.roofs);
    const hx = rng.i(2, 3), hz = rng.i(2, 3), h = rng.i(3, 4);
    S.box(0, (h - 1) / 2, 0, hx, (h - 1) / 2, hz, (x, y, z) =>
      (y === 1 && Math.abs(z) === hz && x % 2 === 0 && x !== 0) ? P.glass : wall);
    S.paint(0, 0, hz, P.dark); S.paint(0, 1, hz, P.dark);
    for (let i = 0; i <= hx + 1; i++) S.box(0, h + i, 0, hx + 1 - i, 0, hz + 1, roof);
    return {};
  },
  tree(S, rng, P) {
    const th = rng.i(2, 4);
    S.cyl(0, (th - 1) / 2, 0, 0.6, (th - 1) / 2, P.trunk);
    if (rng.chance(0.6)) {
      const r = rng.r(2, 3.2);
      S.ell(0, th + r - 1, 0, r, r, r, P.leaf, { shape: rng.chance(0.5) ? BEAD : CUBE });
    } else {
      const r = rng.r(2, 3);
      S.cone(0, th, 0, r, 0.4, Math.round(r * 2.4), P.pine);
    }
    return {};
  },
  car(S, rng, P) {
    const c = rng.pick(P.cars);
    S.box(0, 1, 0, 2, 0, 1, c);
    S.box(0, 2, 0, 1, 0, 1, (x, y, z) => (Math.abs(x) === 1 ? P.glass : c));
    S.box(-1.5, 0, 0, 0.5, 0, 1, P.dark); S.box(1.5, 0, 0, 0.5, 0, 1, P.dark);
    return {};
  },
  bus(S, rng, P) {
    const c = rng.pick([P.yellow, P.red, P.blue]);
    S.box(0, 1.5, 0, 3.5, 1, 1, (x, y, z) => (y === 2 && x % 2 !== 0 ? P.glass : c));
    S.box(0, 3, 0, 3.5, 0, 1, c);
    S.box(-2, 0, 0, 0.5, 0, 1, P.dark); S.box(2, 0, 0, 0.5, 0, 1, P.dark);
    return {};
  },
  fountain(S, rng, P) {
    S.cyl(0, 0, 0, 5, 0, P.stone);
    S.cyl(0, 1, 0, 4, 0, P.water, { shape: BEAD });
    S.cyl(0, 1.5, 0, 1, 1.5, P.stone);
    S.cyl(0, 3, 0, 2.5, 0, P.stone);
    S.cyl(0, 4, 0, 2, 0, P.water, { shape: BEAD });
    S.cyl(0, 5, 0, 0.7, 1, P.stone);
    S.sphere(0, 7, 0, 1, P.water, { shape: BEAD });
    return {};
  },
  statue(S, rng, P) {
    const m = P.mint;
    S.box(0, 2, 0, 4, 2, 4, P.stone);
    S.box(0, 5, 0, 3, 1, 3, P.stone);
    S.cone(0, 6, 0, 2.6, 1.7, 10, m);
    S.ell(0, 17, 0, 2.2, 3, 2, m);
    S.sphere(0, 21.5, 0, 1.6, m);
    S.torus(0, 23.5, 0, 1.7, 0.5, m);
    S.tube([[2, 17, 0], [3, 22, 0], [3, 26, 0]], 0.7, m);
    S.sphere(3, 27.5, 0, 1.2, P.yellow, { shape: BEAD });
    S.tube([[-2, 16, 0], [-3.5, 13, 1]], 0.7, m);
    S.box(-4, 13, 1, 0.5, 1.5, 1, m);
    return { landmark: true };
  },
  lamp(S, rng, P) {
    S.cyl(0, 2.5, 0, 0.3, 2.5, P.dark);
    S.sphere(0, 5.5, 0, 0.9, P.yellow, { shape: BEAD });
    return {};
  },
  bench(S, rng, P) {
    S.box(0, 1, 0, 1.5, 0, 0.5, P.brown);
    S.box(0, 2, -0.5, 1.5, 0.5, 0, P.brown);
    S.paint(-1, 0, 0, P.dark); S.paint(1, 0, 0, P.dark);
    return {};
  },

  // ---- fruit ---------------------------------------------------------------
  pineapple(S, rng, P) {
    const ry = rng.i(5, 7), rx = Math.round(ry * 0.72);
    S.ell(0, ry, 0, rx, ry, rx, (x, y, z) =>
      (((x + y + z) % 3 === 0) || ((x - y + z) % 3 === 0)) ? P.yellowDark : P.yellow, { hollow: 2 });
    const top = ry * 2 - 1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, dx = Math.cos(a), dz = Math.sin(a);
      S.tube([[0, top, 0], [dx * 2, top + 3, dz * 2], [dx * 3.5, top + 6, dz * 3.5]], 0.7, P.leaf);
    }
    S.tube([[0, top, 0], [0, top + 7, 0]], 0.7, P.leaf);
    return {};
  },
  strawberry(S, rng, P) {
    const r = rng.i(3, 5), h = Math.round(r * 1.6);
    const skin = speckle(P.red, P.seed, 0.14);
    S.cone(0, 0, 0, 1.2, r, h, skin);
    S.ell(0, h, 0, r, r * 0.55, r, skin);
    S.cone(0, 2, 0, 0.3, r - 2, h - 2, null);
    S.ell(0, h + r * 0.45, 0, r * 0.85, 1, r * 0.85, sectors(P.leaf, null, 10));
    S.tube([[0, h + r * 0.4, 0], [0, h + r * 0.4 + 3, 0]], 0.5, P.stem);
    return {};
  },
  grapes(S, rng, P) {
    const n = rng.i(14, 26), H = rng.i(8, 12);
    for (let i = 0; i < n; i++) {
      const t = i / n, y = 1.5 + t * (H - 3), rr = (1 - t) * 3.5 + 0.5, a = i * 2.4;
      S.sphere(Math.round(Math.cos(a) * rr), Math.round(y), Math.round(Math.sin(a) * rr), 1.5, P.purple, { shape: BEAD });
    }
    S.tube([[0, H - 1, 0], [0, H + 3, 1]], 0.5, P.stem);
    return {};
  },
  banana(S, rng, P) {
    const L = rng.i(8, 12), pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([(t - 0.5) * L, 1.5 + Math.sin(t * Math.PI) * 4, 0]); }
    S.tube(pts, 1.4, P.yellow);
    S.sphere(pts[0][0], pts[0][1], 0, 1, P.stem);
    S.sphere(pts[6][0], pts[6][1], 0, 1, P.stem);
    return {};
  },
  orange(S, rng, P) {
    const r = rng.i(3, 5);
    S.sphere(0, r, 0, r, P.orange, { shape: BEAD, hollow: 2 });
    S.tube([[0, 2 * r - 1, 0], [0, 2 * r + 1, 0]], 0.4, P.stem);
    S.ell(1.5, 2 * r + 1, 0, 1.8, 0.4, 0.9, P.leaf);
    return {};
  },
  apple(S, rng, P) {
    const r = rng.i(3, 5);
    S.sphere(0, r, 0, r, rng.pick([P.red, P.green]), { hollow: 2 });
    S.cyl(0, 2 * r, 0, r * 0.35, 0.6, null);
    S.tube([[0, 2 * r - 2, 0], [0.5, 2 * r + 1, 0]], 0.4, P.stem);
    S.ell(1.8, 2 * r, 0, 1.8, 0.4, 1, P.leaf);
    return {};
  },
  melon(S, rng, P) {
    const r = rng.i(4, 6), t = 1.5;
    S.scan(-r, r, 0, r, -t, t, (x, y, z) => x * x + y * y <= r * r && Math.abs(z) <= t, (x, y, z) => {
      const d = Math.hypot(x, y);
      if (d > r - 1) return P.melonSkin;
      if (d > r - 2) return P.rind;
      if (Math.abs(z) < t - 1 && d < r - 2.5) return null;
      return hash3(x, y, z) < 0.12 ? P.seed : P.flesh;
    });
    return {};
  },
  cherry(S, rng, P) {
    S.sphere(-2, 2, 0, 2, P.red, { shape: BEAD });
    S.sphere(2, 2, 1, 2, P.red, { shape: BEAD });
    S.tube([[-2, 3, 0], [0, 8, 0]], 0.4, P.stem);
    S.tube([[2, 3, 1], [0, 8, 0]], 0.4, P.stem);
    S.ell(1, 8, 0, 2, 0.4, 1, P.leaf);
    return {};
  },
  berries(S, rng, P) {
    const n = rng.i(5, 9);
    for (let i = 0; i < n; i++) S.sphere(rng.i(-2, 2), rng.i(1, 3), rng.i(-2, 2), 1.4, P.blue, { shape: BEAD });
    S.ell(0, 0, 0, 3, 0.4, 3, P.leaf);
    return {};
  },

  // ---- amusement park ------------------------------------------------------
  ferris(S, rng, P) {
    const R = rng.i(7, 10), cy = R + 2;
    S.torus(0, cy, 0, R, 1, P.yellow, { axis: 'z', shape: BEAD });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, px = Math.round(Math.cos(a) * R), py = Math.round(cy + Math.sin(a) * R);
      S.tube([[0, cy, 0], [px, py, 0]], 0.5, P.white);
      S.box(px, py - 1, 0, 1, 1.5, 1, P.cabins[i % P.cabins.length], { hollow: 1 });
    }
    S.sphere(0, cy, 0, 1.6, P.blue);
    S.tube([[-R * 0.7, 0, 2], [0, cy, 1]], 0.7, P.red);
    S.tube([[R * 0.7, 0, 2], [0, cy, 1]], 0.7, P.red);
    S.tube([[-R * 0.7, 0, -2], [0, cy, -1]], 0.7, P.red);
    S.tube([[R * 0.7, 0, -2], [0, cy, -1]], 0.7, P.red);
    return { landmark: true };
  },
  carousel(S, rng, P) {
    const r = rng.i(5, 7);
    S.cyl(0, 0, 0, r, 0, sectors(P.pink, P.white, 10));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, px = Math.round(Math.cos(a) * (r - 2)), pz = Math.round(Math.sin(a) * (r - 2));
      S.cyl(px, 4, pz, 0.4, 3.5, P.yellow);
      S.box(px, 3, pz, 1, 0.5, 0.5, P.pastel[i % P.pastel.length]);
    }
    S.cyl(0, 4, 0, 1, 4, P.blue);
    S.cone(0, 8, 0, r + 1, 0.5, 4, sectors(P.red, P.white, 12));
    S.sphere(0, 13, 0, 0.9, P.yellow, { shape: BEAD });
    return {};
  },
  swing(S, rng, P) {
    const w = 5;
    for (const sx of [-w, w]) S.tube([[sx, 0, -2.5], [sx, 7, 0], [sx, 0, 2.5]], 0.5, P.blue);
    S.tube([[-w, 7, 0], [w, 7, 0]], 0.5, P.blue);
    for (const sx of [-2, 2]) {
      S.tube([[sx - 1, 7, 0], [sx - 1, 3, 0]], 0.3, P.dark);
      S.tube([[sx + 1, 7, 0], [sx + 1, 3, 0]], 0.3, P.dark);
      S.box(sx, 3, 0, 1.5, 0, 0.5, P.red);
    }
    return {};
  },
  slide(S, rng, P) {
    const h = rng.i(6, 9);
    S.tube([[-3, 0, -1], [-3, h, -1]], 0.4, P.blue);
    S.tube([[-3, 0, 1], [-3, h, 1]], 0.4, P.blue);
    for (let y = 1; y < h; y += 2) S.tube([[-3, y, -1], [-3, y, 1]], 0.3, P.blue);
    S.box(-1, h, 0, 2, 0, 1.5, P.yellow);
    S.tube([[1, h, 0], [9, 1, 0]], 1.2, P.red);
    return {};
  },
  balloons(S, rng, P) {
    const n = rng.i(4, 7);
    for (let i = 0; i < n; i++) {
      const bx = rng.i(-3, 3), by = rng.i(8, 12), bz = rng.i(-3, 3);
      S.tube([[bx, by - 1, bz], [0, 0, 0]], 0.2, P.white);
      S.sphere(bx, by, bz, 1.8, rng.pick(P.pastel), { shape: BEAD });
    }
    return {};
  },
  tent(S, rng, P) {
    const r = rng.i(4, 6);
    S.cyl(0, 1.5, 0, r, 1.5, sectors(P.red, P.white, 12));
    S.cone(0, 3, 0, r + 1, 0.5, r, sectors(P.red, P.white, 12));
    S.box(0, 1, r, 1, 1, 1, null);
    S.sphere(0, 3 + r + 1, 0, 0.8, P.yellow, { shape: BEAD });
    return {};
  },
  dropTower(S, rng, P) {
    const h = rng.i(18, 26);
    S.cyl(0, h / 2, 0, 1.5, h / 2, stripesY(P.blue, P.white, 2));
    S.torus(0, rng.i(5, h - 6), 0, 4, 1.3, P.yellow, { axis: 'y' });
    S.cyl(0, h, 0, 3, 0.5, P.red);
    return { landmark: true };
  },

  // ---- food street ---------------------------------------------------------
  burger(S, rng, P) {
    const r = rng.i(4, 6);
    S.ell(0, 6, 0, r, 3.2, r, speckle(P.bun, P.sesame, 0.12));
    S.cyl(0, 0.5, 0, r, 0.5, P.bun);
    S.cyl(0, 2, 0, r, 0, P.patty);
    S.box(0, 3, 0, r, 0, r, P.cheese);
    S.cyl(0, 4, 0, r + 0.5, 0, P.lettuce);
    S.cyl(0, 5, 0, r - 0.5, 0, P.tomato);
    return {};
  },
  donut(S, rng, P) {
    const R = rng.i(4, 5);
    S.torus(0, 2, 0, R, 2, (x, y, z) => (y >= 2 ? (hash3(x, y, z) < 0.15 ? P.sprinkles[(x + z + 8) % P.sprinkles.length] : P.icing) : P.dough));
    return {};
  },
  icecream(S, rng, P) {
    S.cone(0, 0, 0, 0.6, 2.6, 7, (x, y, z) => (((x + z + y) % 2) ? P.cone : P.coneDark));
    S.sphere(0, 8.5, 0, 3, rng.pick(P.scoops), { shape: BEAD });
    S.sphere(0, 12.5, 0, 2.6, rng.pick(P.scoops), { shape: BEAD });
    S.sphere(0, 15.5, 0, 1, P.red, { shape: BEAD });
    return {};
  },
  cake(S, rng, P) {
    const r = rng.i(5, 6);
    S.cyl(0, 1.5, 0, r, 1.5, stripesY(P.pink, P.cream, 1));
    S.cyl(0, 4.5, 0, r - 1.5, 1.5, stripesY(P.cream, P.pink, 1));
    S.cyl(0, 7.5, 0, r - 3, 1.5, stripesY(P.pink, P.cream, 1));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      S.sphere(Math.round(Math.cos(a) * (r - 3)), 10, Math.round(Math.sin(a) * (r - 3)), 0.8, P.red, { shape: BEAD });
    }
    return {};
  },
  cup(S, rng, P) {
    const r = 2.5, h = 7;
    S.cone(0, 0, 0, r - 0.6, r, h, (x, y, z) => (y > 2 && y < 5 ? P.red : P.white));
    S.cyl(0, h, 0, r + 0.5, 0.5, P.red);
    S.tube([[0.5, h, 0.5], [1.5, h + 4, 1]], 0.4, P.straw);
    return {};
  },
  hotdog(S, rng, P) {
    S.ell(0, 1.5, 0, 5, 1.5, 2, P.bun);
    S.ell(0, 3, 0, 5.5, 1, 1, P.sausage);
    const zig = [];
    for (let i = 0; i <= 8; i++) zig.push([-4 + i, 4, (i % 2 ? 0.6 : -0.6)]);
    S.tube(zig, 0.35, P.mustard);
    return {};
  },
  pizza(S, rng, P) {
    const r = rng.i(5, 7);
    S.cyl(0, 0, 0, r, 0, (x, y, z) => (Math.hypot(x, z) > r - 1.2 ? P.crust : P.cheese));
    S.cyl(0, 1, 0, r - 1.5, 0, (x, y, z) => (hash3(x, y, z) < 0.12 ? P.tomato : undefined));
    return {};
  },
  tableset(S, rng, P) {
    S.cyl(0, 3, 0, 2.5, 0, P.tableTop);
    S.cyl(0, 1, 0, 0.4, 1.5, P.dark);
    for (const sx of [-4, 4]) {
      S.box(sx, 1, 0, 1, 0, 1, P.chair);
      S.box(sx + Math.sign(sx), 2.5, 0, 0, 1.5, 1, P.chair);
      S.paint(sx - 1, 0, -1, P.dark); S.paint(sx + 1, 0, -1, P.dark);
      S.paint(sx - 1, 0, 1, P.dark); S.paint(sx + 1, 0, 1, P.dark);
    }
    return {};
  },
  fries(S, rng, P) {
    S.box(0, 1.5, 0, 2, 1.5, 1, P.fryBox);
    for (let i = 0; i < 7; i++) {
      const x = rng.r(-1.5, 1.5), z = rng.r(-0.6, 0.6);
      S.tube([[x, 2, z], [x + rng.r(-1, 1), 7, z]], 0.45, P.fry);
    }
    return {};
  },

  // ---- water park ----------------------------------------------------------
  pool(S, rng, P) {
    const r = rng.i(5, 8);
    S.cyl(0, 0, 0, r + 1, 0, P.tile);
    S.cyl(0, 0, 0, r, 0, speckle(P.water, P.waterLight, 0.22));
    return {};
  },
  spiral(S, rng, P) {
    const R = rng.i(4, 6), turns = rng.r(1.5, 2.5), h = rng.i(12, 18), pts = [];
    const c = rng.pick(P.slides);
    for (let i = 0; i <= 44; i++) {
      const t = i / 44;
      pts.push([Math.cos(t * turns * TAU) * R, h - t * (h - 1) + 1, Math.sin(t * turns * TAU) * R]);
    }
    S.tube(pts, 1.1, c);
    S.cyl(0, h / 2, 0, 1, h / 2, P.white);
    S.cyl(0, h + 1, 0, 2.5, 0.5, P.white);
    return { landmark: true };
  },
  palm(S, rng, P) {
    const top = [3, 11, 1];
    S.tube([[0, 0, 0], [1, 4, 0], [2.5, 8, 0.5], top], 0.8, P.trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, dx = Math.cos(a), dz = Math.sin(a);
      S.tube([top, [top[0] + dx * 3, top[1] + 2, top[2] + dz * 3], [top[0] + dx * 6, top[1] - 1, top[2] + dz * 6]], 0.6, P.leaf);
    }
    S.sphere(top[0] + 1, top[1] - 1, top[2], 0.8, P.coconut, { shape: BEAD });
    S.sphere(top[0] - 1, top[1] - 1, top[2] + 1, 0.8, P.coconut, { shape: BEAD });
    return {};
  },
  umbrella(S, rng, P) {
    S.cyl(0, 3, 0, 0.3, 3.5, P.white);
    S.cone(0, 6, 0, rng.i(4, 5), 0.5, 3, sectors(rng.pick([P.red, P.blue, P.pink]), P.white, 10));
    S.sphere(0, 9.8, 0, 0.6, P.yellow, { shape: BEAD });
    return {};
  },
  lounger(S, rng, P) {
    const c = rng.pick([P.blue, P.pink, P.yellow]);
    S.box(0, 1, 0, 3, 0, 1, c);
    S.box(-2.5, 2.5, 0, 0.5, 1.5, 1, c);
    S.paint(-2, 0, 0, P.white); S.paint(2, 0, 0, P.white);
    return {};
  },
  floatRing(S, rng, P) {
    S.torus(0, 1, 0, 3, 1, sectors(P.pink, P.white, 8), { axis: 'y', shape: BEAD });
    return {};
  },
};

export function buildSculpt(kind, rng, P) {
  const S = new Sculpt();
  const meta = SCULPTS[kind](S, rng, P) || {};
  return S.build({ kind, ...meta });
}
