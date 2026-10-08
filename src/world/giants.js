import { CUBE } from './voxel.js';
import { hash3 } from '../core/rng.js';

// Giant set pieces for the big free-play maps: skyscrapers, stadiums, a
// ferris wheel you can see from across the board. They are far bigger than
// any hole is wide, so they are not swallowed whole: the hole eats out their
// footprint and they come down in sections (see game/structure.js).
//
// Every voxel is a block with a body when the hole is near, so they are
// sculpted as shells (hollow walls, roofs, rings) and kept to a few thousand
// blocks each. Same contract as sculpts.js: paint into S, colours from P.

const TAU = Math.PI * 2;
const stripesY = (a, b, p = 2) => (x, y) => (Math.floor(y / p) % 2 ? b : a);
const sectors = (a, b, n = 8) => (x, y, z) => (Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * n) % 2 ? b : a);
const speckle = (base, dot, p) => (x, y, z) => (hash3(x, y, z) < p ? dot : base);
const INK = '#23232b';

// A ring of one layer: cells between radius rIn and rOut.
function ring(S, y, rIn, rOut, color) {
  S.scan(-rOut, rOut, y, y, -rOut, rOut, (x, yy, z) => {
    const d2 = x * x + z * z;
    return d2 <= rOut * rOut + 1e-6 && d2 > rIn * rIn;
  }, color, CUBE);
}

export const GIANTS = {
  // ---- city ----------------------------------------------------------------
  skyscraper(S, rng, P) {
    const wall = rng.pick(P.walls), trim = rng.pick(P.walls.filter((c) => c !== wall)), glass = P.glass;
    const facade = (hx, hz, y0) => (x, y, z) => {
      const ex = Math.abs(x) === hx, ez = Math.abs(z) === hz;
      if (!ex && !ez) return wall;                 // floor and roof
      if (ex && ez) return trim;                   // corner piers
      if ((y - y0) % 4 === 0) return wall;         // floor bands
      return Math.abs(ex ? z : x) % 3 === 1 ? wall : glass;
    };
    const style = rng.pick(['setback', 'setback', 'round', 'twin']);
    let top = 0;
    if (style === 'setback') {
      let hx = rng.i(5, 7), hz = rng.i(5, 7), y = 0, last = [hx, hz];
      for (let t = 0; t < 3 && hx >= 2 && hz >= 2; t++) {
        const h = rng.i(12, 17);
        S.box(0, y + (h - 1) / 2, 0, hx, (h - 1) / 2, hz, facade(hx, hz, y), { hollow: 1 });
        last = [hx, hz]; y += h; hx -= 2; hz -= 2;
      }
      top = y;
      S.box(0, top, 0, last[0] - 1, 0, last[1] - 1, P.dark);
      S.cyl(0, top + 5, 0, 0.4, 5, P.dark);
      S.sphere(0, top + 11, 0, 0.9, P.red);
    } else if (style === 'round') {
      const r = rng.i(5, 7), h = rng.i(40, 50);
      S.cyl(0, (h - 1) / 2, 0, r, (h - 1) / 2, (x, y, z) => {
        if (y % 4 === 0) return wall;
        return Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * r * 4) % 2 ? glass : trim;
      }, { hollow: 1 });
      S.cyl(0, h - 1, 0, r, 0, wall);
      S.cone(0, h, 0, r - 1, 0.6, 9, stripesY(trim, wall, 3), { hollow: 1.2 });
      S.cyl(0, h + 12, 0, 0.4, 3, P.dark);
      top = h + 15;
    } else {
      const hx = 3, hz = rng.i(3, 4), gap = hx + 3;
      const h1 = rng.i(38, 48), h2 = h1 - rng.i(0, 6);
      for (const [sx, h] of [[-gap, h1], [gap, h2]]) {
        S.box(sx, (h - 1) / 2, 0, hx, (h - 1) / 2, hz, (x, y, z) => facade(hx, hz, 0)(x - sx, y, z), { hollow: 1 });
        S.box(sx, h, 0, hx - 1, 0, hz - 1, P.dark);
        S.cyl(sx, h + 4, 0, 0.4, 3, P.dark);
      }
      const yb = Math.round(h2 * 0.6);
      S.box(0, yb, 0, gap - hx - 1, 1, 1, (x, y) => (y === yb ? glass : trim));
      top = h1;
    }
    return { giant: true, landmark: true, top };
  },

  stadium(S, rng, P) {
    const rx = 24, rz = 17, inner = 0.7, H = 7;
    const seats = [P.red, P.blue, P.yellow, P.white];
    for (let x = -rx; x <= rx; x++) for (let z = -rz; z <= rz; z++) {
      const e = Math.hypot(x / rx, z / rz);
      if (e > 1) continue;
      if (e < inner) {
        const line = x === 0 || e > inner - 0.04 || Math.hypot(x, z) < 4 && Math.hypot(x, z) > 3;
        S.paint(x, 0, z, line ? P.white : (((x + 40) >> 2) % 2 ? '#4cc23f' : '#3aa834'));
        continue;
      }
      if (e > 0.955) {
        for (let y = 0; y <= H + 1; y++) S.paint(x, y, z, y >= H ? P.white : P.dark);
        continue;
      }
      const k = Math.min(H, 1 + Math.floor(((e - inner) / (0.955 - inner)) * H));
      const c = seats[Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * 16) % seats.length];
      for (let y = k - 2; y <= k; y++) S.paint(x, y, z, y === k ? c : P.dark);
    }
    const gx = Math.round(rx * inner) - 2;
    for (const s of [-1, 1]) S.tube([[s * gx, 0, -3], [s * gx, 3, -3], [s * gx, 3, 3], [s * gx, 0, 3]], 0.45, P.white);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const px = Math.round(sx * rx * 0.74), pz = Math.round(sz * rz * 0.74);
      S.cyl(px, 8, pz, 0.6, 8, P.dark);
      S.box(px, 17, pz, 1.5, 1, 1.5, P.yellow);
    }
    return { giant: true, landmark: true };
  },

  radioTower(S, rng, P) {
    const H = rng.i(44, 52), B = 6, T = 1.5;
    const w = (y) => B + (T - B) * (y / H);
    const col = stripesY(P.red, P.white, 6);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) S.tube([[sx * B, 0, sz * B], [sx * T, H, sz * T]], 0.75, col);
    for (let y = 7; y < H; y += 7) {
      const a = w(y), b = w(Math.min(H, y + 7));
      S.tube([[-a, y, -a], [a, y, -a], [a, y, a], [-a, y, a], [-a, y, -a]], 0.55, col);
      if (y + 7 <= H) {
        S.tube([[-a, y, -a], [b, y + 7, -b]], 0.5, P.white);
        S.tube([[a, y, a], [-b, y + 7, b]], 0.5, P.white);
      }
    }
    S.box(0, H, 0, 2, 0, 2, P.dark);
    S.cyl(0, H + 6, 0, 0.45, 6, P.white);
    S.sphere(0, H + 13, 0, 1, P.red);
    return { giant: true, landmark: true };
  },

  // ---- fruit ---------------------------------------------------------------
  giantPineapple(S, rng, P) {
    const ry = rng.i(12, 15), rx = Math.round(ry * 0.7);
    S.ell(0, ry, 0, rx, ry, rx, (x, y, z) =>
      (((x + y + z) % 4 === 0) || ((x - y + z) % 4 === 0)) ? P.yellowDark : P.yellow, { hollow: 1.5 });
    const top = ry * 2 - 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, dx = Math.cos(a), dz = Math.sin(a), s = i % 2 ? 1 : 0.7;
      S.tube([[0, top, 0], [dx * 3 * s, top + 5, dz * 3 * s], [dx * 8 * s, top + 11 * s, dz * 8 * s]], 1.1, P.leaf);
    }
    S.tube([[0, top, 0], [0, top + 13, 0]], 1.2, P.leaf);
    return { giant: true, landmark: true };
  },

  giantWatermelon(S, rng, P) {
    const r = rng.i(13, 16), t = 2;
    S.scan(-r, r, 0, r, -t, t, (x, y) => x * x + y * y <= r * r, (x, y, z) => {
      const d = Math.hypot(x, y);
      if (d > r - 1.2) return P.melonSkin;
      if (d > r - 2.4) return P.rind;
      if (Math.abs(z) < t && d < r - 3 && y > 0) return null;
      return hash3(x, y, z) < 0.06 ? INK : P.flesh;
    });
    return { giant: true };
  },

  giantStrawberry(S, rng, P) {
    const r = rng.i(8, 10), h = Math.round(r * 1.5);
    const skin = speckle(P.red, P.seed, 0.1);
    S.cone(0, 0, 0, 2, r, h, skin, { hollow: 1.5 });
    S.ell(0, h, 0, r, r * 0.6, r, skin, { hollow: 1.5 });
    S.ell(0, h + r * 0.5, 0, r * 0.9, 1, r * 0.9, sectors(P.leaf, null, 10));
    S.tube([[0, h + r * 0.5, 0], [1, h + r * 0.5 + 5, 0]], 1, P.stem);
    return { giant: true };
  },

  fruitBowl(S, rng, P) {
    const R = 12, cy = 14;
    const bowl = (x, y) => (y % 3 === 0 ? P.rind : P.blue);
    S.ell(0, cy, 0, R, R, R, bowl, { hollow: 1.5 });
    S.box(0, cy + R / 2 + 1, 0, R + 1, R / 2, R + 1, null);
    S.cyl(0, 1, 0, 5, 1, P.blue);
    const fruit = [P.red, P.orange, P.green, P.yellow];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      S.sphere(Math.round(Math.cos(a) * 5.5), 9, Math.round(Math.sin(a) * 5.5), 4, fruit[i], { hollow: 1.5 });
    }
    S.sphere(0, 15, 0, 4, P.purple, { hollow: 1.5 });
    S.tube([[0, 19, 0], [0.5, 22, 0]], 0.5, P.stem);
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([(t - 0.5) * 16, 18 + Math.sin(t * Math.PI) * 5, 6]); }
    S.tube(pts, 1.8, P.yellow);
    return { giant: true };
  },

  giantBananas(S, rng, P) {
    const L = rng.i(24, 30);
    for (const [dz, lift] of [[-4, 0], [0, 2], [4, 0]]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push([(t - 0.5) * L, 2.2 + lift + Math.sin(t * Math.PI) * 7, dz * (0.6 + 0.4 * Math.abs(t - 0.5) * 2)]);
      }
      S.tube(pts, 2.2, P.yellow);
      S.sphere(pts[8][0], pts[8][1], pts[8][2], 1.4, P.stem);
    }
    S.tube([[-L / 2, 2.2, -3], [-L / 2 - 3, 5, 0], [-L / 2, 2.2, 3]], 1.4, P.stem);
    return { giant: true };
  },

  // ---- amusement park ------------------------------------------------------
  megaFerris(S, rng, P) {
    const R = rng.i(18, 21), cy = R + 4, n = 16;
    for (const z of [-2, 2]) S.torus(0, cy, z, R, 1, P.yellow, { axis: 'z' });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, px = Math.cos(a) * R, py = cy + Math.sin(a) * R;
      for (const z of [-2, 2]) S.tube([[0, cy, z], [px, py, z]], 0.5, P.white);
      const bx = Math.round(px), by = Math.round(py) - 3;
      S.box(bx, by, 0, 1.5, 1.5, 1.5, P.cabins[i % P.cabins.length], { hollow: 1 });
      S.tube([[bx, by + 1, 0], [px, py, 0]], 0.5, P.dark);
    }
    S.cyl(0, cy, 0, 2, 0, P.blue);
    S.tube([[0, cy, -3], [0, cy, 3]], 1.6, P.blue);
    for (const z of [-4, 4]) {
      S.tube([[-R * 0.6, 0, z * 1.6], [0, cy, z]], 1, P.red);
      S.tube([[R * 0.6, 0, z * 1.6], [0, cy, z]], 1, P.red);
    }
    return { giant: true, landmark: true };
  },

  rollerCoaster(S, rng, P) {
    const ax = 26, az = 12, N = 140, pts = [];
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU;
      const y = 3 + 18 * Math.sin(th * 2) ** 2 * (th < Math.PI ? 1 : 0.55) + 3 * Math.sin(th * 6) ** 2;
      pts.push([Math.cos(th) * ax, y, Math.sin(th) * az]);
    }
    S.tube(pts, 0.8, P.red);
    for (let i = 0; i < N; i += 7) {
      const [x, y, z] = pts[i];
      S.cyl(Math.round(x), (y - 1) / 2, Math.round(z), 0.5, (y - 1) / 2, P.white);
    }
    for (let k = 0; k < 4; k++) {
      const [x, y, z] = pts[18 + k * 2];
      S.box(Math.round(x), Math.round(y) + 1, Math.round(z), 1, 0.5, 1, P.cabins[k % P.cabins.length]);
    }
    S.box(ax, 2, 0, 3, 2, 4, P.blue, { hollow: 1 });
    S.box(ax, 5, 0, 4, 0, 5, P.yellow);
    return { giant: true, landmark: true };
  },

  bigTop(S, rng, P) {
    const r = rng.i(13, 15), wall = 7, roofH = r;
    S.cyl(0, (wall - 1) / 2, 0, r, (wall - 1) / 2, sectors(P.red, P.white, 16), { hollow: 1 });
    S.box(r, 2, 0, 1, 2, 2, null);
    S.cone(0, wall, 0, r + 2, 0.8, roofH, sectors(P.red, P.white, 16), { hollow: 1.5 });
    S.cyl(0, wall + roofH + 2, 0, 0.4, 2, P.dark);
    S.box(1, wall + roofH + 4, 0, 1, 0.5, 0, P.yellow);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      S.sphere(Math.round(Math.cos(a) * (r + 2)), wall, Math.round(Math.sin(a) * (r + 2)), 0.8, P.yellow);
    }
    return { giant: true, landmark: true };
  },

  fairyCastle(S, rng, P) {
    const wall = P.white, h = 14, k = 6;
    S.box(0, (h - 1) / 2, 0, k, (h - 1) / 2, k, (x, y, z) =>
      (y % 4 === 2 && (Math.abs(x) === k || Math.abs(z) === k) && Math.abs(Math.abs(x) === k ? z : x) % 3 === 0) ? P.dark : wall, { hollow: 1 });
    S.box(0, h - 1, 0, k, 0, k, wall);
    for (let i = -k; i <= k; i += 2) {
      for (const [x, z] of [[i, -k], [i, k], [-k, i], [k, i]]) S.paint(x, h, z, wall);
    }
    S.box(0, 1, k, 1.5, 1, 0, P.pink);
    const roofs = [P.pink, P.blue];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = sx * (k + 1), z = sz * (k + 1), th = rng.i(18, 22);
      S.cyl(x, (th - 1) / 2, z, 2.5, (th - 1) / 2, wall, { hollow: 1 });
      S.cyl(x, th - 1, z, 2.5, 0, wall);
      S.cone(x, th, z, 3.5, 0.4, 8, roofs[(sx + sz + 4) / 2 % 2], { hollow: 1.2 });
      S.paint(x, th + 9, z, P.yellow);
    }
    S.cyl(0, h + 5, 0, 2.5, 5, wall, { hollow: 1 });
    S.cone(0, h + 10, 0, 3.6, 0.4, 10, P.pink, { hollow: 1.2 });
    S.box(1, h + 22, 0, 1, 0.5, 0, P.yellow);
    S.cyl(0, h + 21, 0, 0.4, 1, P.dark);
    return { giant: true, landmark: true };
  },

  giantDropTower(S, rng, P) {
    const h = rng.i(42, 50);
    S.cyl(0, (h - 1) / 2, 0, 2.5, (h - 1) / 2, stripesY(P.blue, P.white, 3), { hollow: 1 });
    S.torus(0, rng.i(12, h - 12), 0, 5, 1.4, P.yellow, { axis: 'y' });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      S.paint(Math.round(Math.cos(a) * 6.5), 0, Math.round(Math.sin(a) * 6.5), P.cabins[i % P.cabins.length]);
    }
    S.cyl(0, h, 0, 4, 0.5, P.red);
    S.cyl(0, h + 3, 0, 0.5, 2, P.white);
    S.sphere(0, h + 6, 0, 1, P.yellow);
    return { giant: true, landmark: true };
  },

  // ---- food street ---------------------------------------------------------
  megaBurger(S, rng, P) {
    const r = rng.i(11, 13);
    S.cyl(0, 0, 0, r, 0, P.bun);
    for (let y = 1; y <= 2; y++) ring(S, y, r - 1.2, r, P.bun);
    for (let y = 3; y <= 4; y++) ring(S, y, r - 0.7, r + 0.6, P.patty);
    S.scan(-r, r, 5, 5, -r, r, (x, y, z) => x * x + z * z > (r - 1.3) ** 2, P.cheese, CUBE);
    ring(S, 6, r - 0.5, r + 1.4, (x, y, z) => (hash3(x, 0, z) < 0.5 ? P.lettuce : undefined));
    ring(S, 6, r - 1.2, r + 0.8, P.lettuce);
    ring(S, 7, r - 1.2, r - 0.2, P.tomato);
    S.ell(0, 8, 0, r, r * 0.7, r, speckle(P.bun, P.sesame, 0.1), { hollow: 1.5 });
    S.tube([[0, 8 + r * 0.7 - 1, 0], [0, 8 + r * 0.7 + 5, 0]], 0.4, P.white);
    S.box(1.5, 8 + r * 0.7 + 4, 0, 1.5, 1, 0, P.red);
    return { giant: true, landmark: true };
  },

  towerCake(S, rng, P) {
    const radii = [14, 11, 8, 5], th = 5;
    let y = 0;
    for (let i = 0; i < radii.length; i++) {
      const r = radii[i], next = radii[i + 1] || 0;
      const a = i % 2 ? P.cream : P.pink, b = i % 2 ? P.pink : P.cream;
      S.cyl(0, y + (th - 1) / 2, 0, r, (th - 1) / 2, stripesY(a, b, 2), { hollow: 1 });
      ring(S, y + th - 1, Math.max(0, next - 1.5), r, P.cream);
      for (let j = 0; j < 8 + i * -1; j++) {
        const ang = (j / (8 - i)) * TAU;
        S.sphere(Math.round(Math.cos(ang) * (r - 1)), y + th, Math.round(Math.sin(ang) * (r - 1)), 0.9, P.red);
      }
      y += th;
    }
    for (let j = 0; j < 5; j++) {
      const ang = (j / 5) * TAU, cx = Math.round(Math.cos(ang) * 3), cz = Math.round(Math.sin(ang) * 3);
      S.cyl(cx, y + 1.5, cz, 0.5, 1.5, j % 2 ? P.straw : P.white);
      S.paint(cx, y + 3, cz, P.mustard);
    }
    return { giant: true, landmark: true };
  },

  giantDonut(S, rng, P) {
    const R = rng.i(10, 12), r = 4.5;
    S.torus(0, r, 0, R, r, (x, y, z) => (y >= r - 0.5
      ? (hash3(x, y, z) < 0.12 ? P.sprinkles[(x + z + 64) % P.sprinkles.length] : P.icing)
      : P.dough), { hollow: 1.3 });
    return { giant: true };
  },

  softServe(S, rng, P) {
    const waffle = (x, y, z) => (((x + z + y) % 2) ? P.cone : P.coneDark);
    S.cone(0, 0, 0, 1, 7, 17, waffle, { hollow: 1.3 });
    const flavour = rng.pick(P.scoops);
    S.cyl(0, 17, 0, 7, 0, flavour);
    S.torus(0, 19, 0, 5.5, 2.5, flavour, { hollow: 1.3 });
    S.torus(0, 23, 0, 4, 2.2, flavour, { hollow: 1.2 });
    S.torus(0, 26.5, 0, 2.5, 2, flavour, { hollow: 1.2 });
    S.cone(0, 28, 0, 2, 0.3, 4, flavour);
    S.sphere(0, 33, 0, 1.4, P.red);
    return { giant: true, landmark: true };
  },

  sodaCup(S, rng, P) {
    const h = rng.i(20, 24);
    S.cone(0, 0, 0, 6, 8, h, (x, y) => (y > h * 0.35 && y < h * 0.65 ? P.red : P.white), { hollow: 1.2 });
    S.cyl(0, 0, 0, 6, 0, P.white);
    S.cyl(0, h, 0, 8.5, 0.5, P.red);
    S.tube([[2, h - 2, 1], [4, h + 12, 2], [7, h + 14, 2]], 1, P.straw);
    return { giant: true };
  },

  // ---- water park ----------------------------------------------------------
  slideTower(S, rng, P) {
    const h = rng.i(24, 28);
    S.box(0, (h - 1) / 2, 0, 3, (h - 1) / 2, 3, (x, y, z) => (y % 5 === 0 ? P.blue : P.white), { hollow: 1 });
    S.box(0, h, 0, 5, 0, 5, P.yellow);
    S.cone(0, h + 6, 0, 6, 0.5, 5, sectors(P.red, P.white, 10), { hollow: 1.2 });
    for (const [x, z] of [[4, 4], [4, -4], [-4, 4], [-4, -4]]) S.cyl(x, h + 3, z, 0.4, 2.5, P.white);
    // Spiral slide round the tower.
    const pts = [], R = 9, turns = 1.6;
    for (let i = 0; i <= 50; i++) {
      const t = i / 50, a = t * turns * TAU;
      pts.push([Math.cos(a) * R, h - 1 - t * (h - 3), Math.sin(a) * R]);
    }
    S.tube(pts, 1.3, P.slides[0]);
    // Two long wavy runs out across the park.
    for (const [dir, c] of [[1, P.slides[1]], [-1, P.slides[2]]]) {
      const run = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        run.push([dir * (5 + t * 22), h - 2 - t * (h - 4), Math.sin(t * TAU) * 6 * dir]);
      }
      S.tube(run, 1.3, c);
      for (let i = 4; i < 16; i += 4) {
        const [x, y, z] = run[i];
        S.cyl(Math.round(x), (y - 2) / 2, Math.round(z), 0.5, (y - 2) / 2, P.white);
      }
    }
    S.cyl(0, 0, 0, 12, 0, speckle(P.water, P.waterLight, 0.2));
    S.box(0, 0, 0, 4, 0, 4, P.tile);
    return { giant: true, landmark: true };
  },

  lighthouse(S, rng, P) {
    const h = rng.i(30, 36);
    S.cyl(0, 1, 0, 9, 1, speckle('#9a9488', '#c9c2b4', 0.35));
    S.cone(0, 3, 0, 6, 3.6, h, stripesY(P.red, P.white, 5), { hollow: 1.2 });
    const g = h + 3;
    S.cyl(0, g, 0, 5, 0, P.blue);
    ring(S, g + 1, 4, 5, P.white);
    S.cyl(0, g + 3, 0, 3, 2, (x, y, z) => (y === g + 3 ? P.yellow : P.white), { hollow: 1 });
    S.cyl(0, g + 2, 0, 1.5, 1, P.yellow);
    S.cone(0, g + 6, 0, 4, 0.4, 4, P.red, { hollow: 1.2 });
    S.sphere(0, g + 11, 0, 0.8, P.red);
    return { giant: true, landmark: true };
  },

  giantPalm(S, rng, P) {
    const lean = rng.r(6, 10), H = rng.i(26, 32), a0 = rng.r(0, TAU);
    const lx = Math.cos(a0) * lean, lz = Math.sin(a0) * lean;
    const top = [lx, H, lz];
    S.tube([[0, 0, 0], [lx * 0.15, H * 0.35, lz * 0.15], [lx * 0.5, H * 0.7, lz * 0.5], top], 1.7,
      (x, y) => (y % 3 === 0 ? P.coconut : P.trunk));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, dx = Math.cos(a), dz = Math.sin(a);
      S.tube([top, [top[0] + dx * 6, H + 4, top[2] + dz * 6], [top[0] + dx * 12, H + 1, top[2] + dz * 12],
        [top[0] + dx * 15, H - 4, top[2] + dz * 15]], 1, P.leaf);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.5;
      S.sphere(Math.round(top[0] + Math.cos(a) * 2), H - 2, Math.round(top[2] + Math.sin(a) * 2), 1.5, P.coconut);
    }
    return { giant: true };
  },

  pirateShip(S, rng, P) {
    const L = 18, W = 6;
    S.ell(0, 7, 0, L, 7, W, (x, y) => (y === 5 ? P.yellow : y < 2 ? P.coconut : P.red), { hollow: 1.3 });
    S.box(0, 20, 0, L + 1, 12, W + 1, null);
    S.scan(-L, L, 7, 7, -W, W, (x, y, z) => (x / L) ** 2 + (z / W) ** 2 <= 0.9, P.trunk, CUBE);
    S.box(-L + 4, 9, 0, 3, 2, W - 2, P.coconut, { hollow: 1 });
    for (const [mx, mh] of [[-4, 26], [6, 22]]) {
      S.cyl(mx, 7 + mh / 2, 0, 0.6, mh / 2, P.coconut);
      S.ell(mx, 7 + mh * 0.6, 1, 4.5, mh * 0.27, 2, P.white, { hollow: 1.2 });
      S.box(mx, 7 + mh * 0.6, -1, 5, mh * 0.3, 1, null);
      S.cyl(mx, 7 + mh * 0.92, 0, 1.6, 0.5, P.coconut);
      S.box(mx + 2, 7 + mh + 1, 0, 2, 0.5, 0, INK);
    }
    S.tube([[L - 2, 8, 0], [L + 6, 13, 0]], 0.6, P.coconut);
    return { giant: true, landmark: true };
  },

  rubberDuck(S, rng, P) {
    const s = rng.r(0.9, 1.1);
    S.ell(0, 6 * s, 0, 10 * s, 6 * s, 7 * s, P.yellow, { hollow: 1.5 });
    S.ell(-8 * s, 4 * s, 0, 3 * s, 2.5 * s, 3 * s, P.yellow, { hollow: 1.2 });
    S.sphere(5 * s, 15 * s, 0, 5 * s, P.yellow, { hollow: 1.5 });
    S.ell(10 * s, 14 * s, 0, 3 * s, 1.2 * s, 2.2 * s, '#ff8c1a');
    for (const z of [-2.6, 2.6]) S.sphere(8 * s, 17 * s, z * s, 0.9, INK);
    S.ell(-1, 9 * s, 7 * s - 1, 5 * s, 2.5 * s, 1, P.yellow);
    S.ell(-1, 9 * s, -7 * s + 1, 5 * s, 2.5 * s, 1, P.yellow);
    return { giant: true };
  },
};
