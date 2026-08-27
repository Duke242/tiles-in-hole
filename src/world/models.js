// Voxel model builders. Each returns a flat list of boxes in model space
// (y = 0 is the ground) plus the collision radius and height the game needs.

const b = (x, y, z, sx, sy, sz, color, leg = 0) => ({ x, y, z, sx, sy, sz, color, leg });

export const rand = (a, b2) => a + Math.random() * (b2 - a);
export const irand = (a, b2) => Math.floor(rand(a, b2 + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const bl = Math.min(255, Math.round((n & 255) * f));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export const PALETTE = {
  wall: ['#e8622f', '#2f78e8', '#d8362f', '#f3efe6', '#f0a12f', '#8a5fd8', '#2fb9a8',
         '#e8a0c0', '#5fb04a', '#4a5a7a'],
  house: ['#f3e9d8', '#e9d5b8', '#dfe8ef', '#f6dcc8', '#dceadb', '#f0e2ea'],
  roof: ['#c0453a', '#3f5d8a', '#4a7a54', '#8a5a3a', '#5a4a6a'],
  car: ['#ffd23e', '#3ec8f0', '#2f6fe8', '#f05a3c', '#7ce063', '#f08cc0', '#ffffff', '#33363f'],
  shirt: ['#e85a5a', '#3e8ef0', '#3ecf6e', '#f0c23e', '#a06ef0', '#f08cc0', '#ffffff', '#2f9fb0'],
  pants: ['#2a3550', '#3a3a45', '#5a4a3a', '#2f4a4a'],
  hair: ['#3a2a1a', '#1a1a1a', '#a06a2a', '#e0c060', '#8a3a2a'],
  skin: ['#f2c99a', '#d9a173', '#a9743f', '#6f4626'],
  leaf: ['#2fa843', '#37b94e', '#45cc59', '#249a3a'],
};

export function personModel() {
  const shirt = pick(PALETTE.shirt), pants = pick(PALETTE.pants);
  const skin = pick(PALETTE.skin), hair = pick(PALETTE.hair);
  const parts = [
    b(-0.24, 0.42, 0, 0.36, 0.85, 0.34, pants, 1),
    b(0.24, 0.42, 0, 0.36, 0.85, 0.34, pants, -1),
    b(0, 1.32, 0, 0.95, 1.0, 0.6, shirt),
    b(-0.62, 1.32, 0, 0.28, 0.9, 0.3, shirt),
    b(0.62, 1.32, 0, 0.28, 0.9, 0.3, shirt),
    b(0, 2.12, 0, 0.66, 0.66, 0.62, skin),
    b(0, 2.5, -0.02, 0.7, 0.22, 0.66, hair),
  ];
  if (Math.random() < 0.22) parts.push(b(0, 2.66, 0, 0.8, 0.16, 0.8, pick(PALETTE.shirt)));
  return { parts, radius: 0.7, height: 2.7, color: shirt };
}

export function carModel() {
  const col = pick(PALETTE.car);
  const dark = shade(col, 0.62);
  return {
    parts: [
      b(0, 0.62, 0, 4.4, 0.9, 2.1, col),
      b(-0.25, 1.42, 0, 2.3, 0.78, 1.85, '#cfe8f5'),
      b(-0.25, 1.42, 0, 2.36, 0.5, 1.92, dark),
      b(1.55, 1.42, 0, 1.3, 0.62, 1.9, col),
      b(-1.45, 0.32, 0.95, 0.75, 0.62, 0.34, '#26262e'),
      b(1.45, 0.32, 0.95, 0.75, 0.62, 0.34, '#26262e'),
      b(-1.45, 0.32, -0.95, 0.75, 0.62, 0.34, '#26262e'),
      b(1.45, 0.32, -0.95, 0.75, 0.62, 0.34, '#26262e'),
      b(2.2, 0.72, 0.6, 0.2, 0.3, 0.4, '#fff6c0'),
      b(2.2, 0.72, -0.6, 0.2, 0.3, 0.4, '#fff6c0'),
    ],
    radius: 2.4, height: 1.9, color: col,
  };
}

export function busModel() {
  const col = pick(['#f0a12f', '#e8452f', '#3e8ef0', '#3ecf6e']);
  const parts = [
    b(0, 1.35, 0, 9.5, 2.3, 2.6, col),
    b(0, 2.62, 0, 9.2, 0.3, 2.5, shade(col, 0.8)),
  ];
  for (let i = -3; i <= 3; i++) {
    parts.push(b(i * 1.25, 1.75, 1.32, 0.95, 0.9, 0.1, '#cfe8f5'));
    parts.push(b(i * 1.25, 1.75, -1.32, 0.95, 0.9, 0.1, '#cfe8f5'));
  }
  parts.push(b(4.8, 1.75, 0, 0.12, 1.0, 2.3, '#cfe8f5'));
  for (const dx of [-3.2, 3.2]) for (const dz of [1.2, -1.2])
    parts.push(b(dx, 0.42, dz, 1.0, 0.84, 0.4, '#26262e'));
  return { parts, radius: 5.0, height: 2.8, color: col };
}

export function truckModel() {
  const cab = pick(PALETTE.car), box = pick(['#f3efe6', '#dfe4ea', '#e8d9c0']);
  return {
    parts: [
      b(2.6, 1.35, 0, 3.0, 2.0, 2.5, cab),
      b(2.9, 2.15, 0, 2.0, 0.7, 2.2, '#cfe8f5'),
      b(-1.9, 1.9, 0, 6.2, 3.2, 2.7, box),
      b(-1.9, 3.55, 0, 6.3, 0.25, 2.8, shade(box, 0.85)),
      b(3.0, 0.42, 1.2, 1.0, 0.84, 0.4, '#26262e'),
      b(3.0, 0.42, -1.2, 1.0, 0.84, 0.4, '#26262e'),
      b(-2.6, 0.42, 1.25, 1.0, 0.84, 0.4, '#26262e'),
      b(-2.6, 0.42, -1.25, 1.0, 0.84, 0.4, '#26262e'),
    ],
    radius: 4.6, height: 3.6, color: box,
  };
}

export function treeModel() {
  const leaf = pick(PALETTE.leaf);
  const h = rand(1.6, 2.8);
  const parts = [b(0, h / 2, 0, 0.85, h, 0.85, '#8a5a2f')];
  const w = rand(2.6, 3.8);
  parts.push(b(0, h + w * 0.42, 0, w, w * 0.85, w, leaf));
  parts.push(b(rand(-0.9, 0.9), h + w * 0.95, rand(-0.9, 0.9), w * 0.6, w * 0.5, w * 0.6, pick(PALETTE.leaf)));
  return { parts, radius: w * 0.55, height: h + w * 1.2, color: leaf };
}

export function pineModel() {
  const leaf = pick(['#1f7a3a', '#248a42', '#2a9a4a']);
  const parts = [b(0, 0.8, 0, 0.8, 1.6, 0.8, '#7a4a26')];
  let y = 1.5, w = 3.4;
  for (let i = 0; i < 3; i++) {
    parts.push(b(0, y + 0.7, 0, w, 1.5, w, leaf));
    y += 1.25; w *= 0.68;
  }
  return { parts, radius: 1.7, height: y + 1, color: leaf };
}

// --- architecture -----------------------------------------------------------
// The reference city is built from four repeating forms: white L-blocks with a
// bold trim band, colour-faced apartment slabs with white window grids, flat
// modern boxes, and low colourful shop rows.

export const TRIM = ['#e5342c', '#2f6fe8', '#f0a12f', '#2fb86e', '#8a5fd8', '#e8622f'];
export const FACADE = ['#f07a2a', '#e8452f', '#3e8ef0', '#f0b429', '#5aa0d8',
                       '#8a5fd8', '#2fb9a8', '#e86a9a', '#6fbf4a'];
const CREAM = '#f7f3e9';
const GLASS = '#e8f2f8';

// One window: a bright plate with a thin frame, sunk a hair into the wall.
function windows(parts, w, d, h, floors, opts = {}) {
  const {
    inset = 0.09, sill = 3.0, fh = 3.4,
    wide = 1.9, tall = 2.0, frame = '#ffffff', glass = GLASS,
  } = opts;
  const colsW = Math.max(2, Math.round(w / 4.4));
  const colsD = Math.max(2, Math.round(d / 4.4));
  for (let r = 0; r < floors; r++) {
    const y = sill + r * fh;
    if (y + tall / 2 > h - 0.4) break;
    for (let i = 0; i < colsW; i++) {
      const x = -w / 2 + (i + 0.5) * (w / colsW);
      parts.push(b(x, y, d / 2 + inset, wide + 0.34, tall + 0.34, 0.1, frame));
      parts.push(b(x, y, d / 2 + inset + 0.03, wide, tall, 0.1, glass));
      parts.push(b(x, y, -d / 2 - inset, wide + 0.34, tall + 0.34, 0.1, frame));
      parts.push(b(x, y, -d / 2 - inset - 0.03, wide, tall, 0.1, glass));
    }
    for (let i = 0; i < colsD; i++) {
      const z = -d / 2 + (i + 0.5) * (d / colsD);
      parts.push(b(w / 2 + inset, y, z, 0.1, tall + 0.34, wide + 0.34, frame));
      parts.push(b(w / 2 + inset + 0.03, y, z, 0.1, tall, wide, glass));
      parts.push(b(-w / 2 - inset, y, z, 0.1, tall + 0.34, wide + 0.34, frame));
      parts.push(b(-w / 2 - inset - 0.03, y, z, 0.1, tall, wide, glass));
    }
  }
}

// Cream L-shaped block with a thick coloured band along the roofline.
export function lBlockModel() {
  const trim = pick(TRIM);
  const armW = rand(19, 26), armD = rand(10, 12);
  const legW = rand(10, 12), legD = rand(15, 21);
  const h = rand(6.5, 8.5);
  const parts = [];
  const ax = -legW / 2, az = -armD / 2;
  // long arm
  parts.push(b(ax + armW / 2 - armW / 2, h / 2, az, armW, h, armD, CREAM));
  parts.push(b(ax + armW / 2 - armW / 2, h + 0.75, az, armW + 0.7, 1.5, armD + 0.7, trim));
  // short leg
  const lz = az + armD / 2 + legD / 2;
  parts.push(b(-armW / 2 + legW / 2, h / 2, lz, legW, h, legD, CREAM));
  parts.push(b(-armW / 2 + legW / 2, h + 0.75, lz, legW + 0.7, 1.5, legD + 0.7, trim));
  // window rows on both wings
  const rowY = [2.6, 5.6];
  for (const y of rowY) {
    const n = Math.max(3, Math.round(armW / 4.4));
    for (let i = 0; i < n; i++) {
      const x = -armW / 2 + (i + 0.5) * (armW / n);
      parts.push(b(x, y, az - armD / 2 - 0.09, 2.1, 2.1, 0.12, '#ffffff'));
      parts.push(b(x, y, az - armD / 2 - 0.13, 1.75, 1.75, 0.1, GLASS));
    }
    const m = Math.max(3, Math.round(legD / 4.4));
    for (let i = 0; i < m; i++) {
      const z = lz - legD / 2 + (i + 0.5) * (legD / m);
      parts.push(b(-armW / 2 + legW / 2 - legW / 2 - 0.09, y, z, 0.12, 2.1, 2.1, '#ffffff'));
      parts.push(b(-armW / 2 + legW / 2 - legW / 2 - 0.13, y, z, 0.1, 1.75, 1.75, GLASS));
    }
  }
  return { parts, radius: Math.max(armW, legD) * 0.55, height: h + 1.5, color: trim };
}

// Colour-faced apartment slab, three to six storeys of white window grid.
export function apartmentModel(minF = 3, maxF = 6) {
  const face = pick(FACADE);
  const w = rand(14, 19), d = rand(12, 16);
  const floors = irand(minF, maxF), fh = 3.4;
  const h = 2.2 + floors * fh;
  const parts = [
    b(0, h / 2, 0, w, h, d, face),
    b(0, h + 0.5, 0, w + 1.0, 1.0, d + 1.0, '#dfe3e8'),   // roof cap
    b(0, 1.1, 0, w + 0.35, 2.2, d + 0.35, shade(face, 0.88)),
  ];
  windows(parts, w, d, h, floors, { sill: 3.4, fh });
  // door + rooftop box
  parts.push(b(0, 1.5, d / 2 + 0.2, 2.6, 3.0, 0.3, '#5b4a3a'));
  parts.push(b(rand(-3, 3), h + 2.1, rand(-3, 3), rand(3, 5), 2.2, rand(3, 5), '#c9ced6'));
  return { parts, radius: Math.hypot(w, d) / 2, height: h + 3, color: face };
}

// Flat white modern building with a grey slab roof.
export function modernModel() {
  const w = rand(15, 22), d = rand(12, 17), h = rand(7, 11);
  const parts = [
    b(0, h / 2, 0, w, h, d, '#f4f2ee'),
    b(0, h + 0.45, 0, w + 1.2, 0.9, d + 1.2, '#8e979f'),
    b(0, h + 1.5, rand(-2, 2), rand(5, 9), 1.4, rand(4, 7), '#b9c0c6'),
  ];
  const bandY = h * 0.62;
  parts.push(b(0, bandY, d / 2 + 0.1, w * 0.82, 2.4, 0.14, '#cfd8de'));
  parts.push(b(0, bandY, -d / 2 - 0.1, w * 0.82, 2.4, 0.14, '#cfd8de'));
  windows(parts, w, d, h, 2, { sill: 2.8, fh: 3.6, wide: 2.2, tall: 1.8 });
  parts.push(b(0, 1.6, d / 2 + 0.16, 3.2, 3.2, 0.2, '#9fb3c0'));
  return { parts, radius: Math.hypot(w, d) / 2, height: h + 2, color: '#f4f2ee' };
}

// Low colourful shopfront with an awning and a sign board.
export function shopRowModel() {
  const face = pick(FACADE);
  const w = rand(12, 17), d = rand(9, 12), h = rand(5, 6.5);
  const parts = [
    b(0, h / 2, 0, w, h, d, face),
    b(0, h + 0.5, 0, w + 0.9, 1.0, d + 0.9, shade(face, 0.72)),
    b(0, h * 0.86, d / 2 + 0.14, w * 0.66, 1.1, 0.22, '#ffffff'),   // sign
    b(0, 2.9, d / 2 + 0.75, w * 0.78, 0.4, 1.6, pick(TRIM)),        // awning
  ];
  const n = Math.max(2, Math.round(w / 5));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    parts.push(b(x, 1.9, d / 2 + 0.1, w / n * 0.62, 3.2, 0.12, '#ffffff'));
    parts.push(b(x, 1.9, d / 2 + 0.14, w / n * 0.52, 2.8, 0.1, GLASS));
  }
  return { parts, radius: Math.hypot(w, d) / 2, height: h + 1.5, color: face };
}

// Taller downtown slab: same language, more floors.
export function towerModel(minH, maxH) {
  const face = pick(FACADE);
  const w = rand(15, 20), d = rand(13, 17);
  const h = rand(minH, maxH);
  const floors = Math.max(3, Math.floor((h - 4) / 3.4));
  const parts = [
    b(0, h / 2, 0, w, h, d, face),
    b(0, h + 0.55, 0, w + 1.2, 1.1, d + 1.2, '#dfe3e8'),
    b(0, 1.3, 0, w + 0.4, 2.6, d + 0.4, shade(face, 0.86)),
    b(rand(-3, 3), h + 2.2, rand(-3, 3), rand(3, 6), 2.4, rand(3, 6), '#c9ced6'),
  ];
  windows(parts, w, d, h, floors, { sill: 3.6, fh: 3.4 });
  return { parts, radius: Math.hypot(w, d) / 2, height: h + 3, color: face };
}

// Kept as an alias so the generator can still ask for a "house".
export function houseModel() { return shopRowModel(); }
export function shopModel() { return shopRowModel(); }

export function lampModel() {
  return {
    parts: [
      b(0, 0.3, 0, 0.9, 0.6, 0.9, '#5a5f6a'),
      b(0, 2.6, 0, 0.34, 5.2, 0.34, '#6a707c'),
      b(0, 5.3, 0.5, 0.5, 0.4, 1.4, '#6a707c'),
      b(0, 5.0, 1.0, 0.8, 0.4, 0.8, '#fff3c4'),
    ], radius: 0.7, height: 5.5, color: '#6a707c',
  };
}
export function benchModel() {
  return {
    parts: [
      b(0, 0.65, 0, 3.4, 0.25, 1.1, '#a06a3a'),
      b(0, 1.15, -0.45, 3.4, 1.0, 0.22, '#a06a3a'),
      b(-1.4, 0.3, 0, 0.28, 0.7, 1.0, '#4a4f58'),
      b(1.4, 0.3, 0, 0.28, 0.7, 1.0, '#4a4f58'),
    ], radius: 1.8, height: 1.6, color: '#a06a3a',
  };
}
export function hydrantModel() {
  return {
    parts: [
      b(0, 0.5, 0, 0.6, 1.0, 0.6, '#d8362f'),
      b(0, 1.1, 0, 0.85, 0.3, 0.85, '#d8362f'),
      b(0, 0.7, 0.42, 0.3, 0.3, 0.3, '#b02a24'),
    ], radius: 0.5, height: 1.3, color: '#d8362f',
  };
}
export function binModel() {
  return {
    parts: [
      b(0, 0.7, 0, 1.0, 1.4, 1.0, '#3f6a4a'),
      b(0, 1.48, 0, 1.15, 0.2, 1.15, '#2f5a3a'),
    ], radius: 0.7, height: 1.6, color: '#3f6a4a',
  };
}
export function trafficLightModel() {
  return {
    parts: [
      b(0, 2.2, 0, 0.34, 4.4, 0.34, '#3f444d'),
      b(0, 4.6, 0, 0.8, 2.0, 0.7, '#2a2f36'),
      b(0, 5.2, 0.4, 0.42, 0.42, 0.16, '#ff4a3a'),
      b(0, 4.6, 0.4, 0.42, 0.42, 0.16, '#ffd23e'),
      b(0, 4.0, 0.4, 0.42, 0.42, 0.16, '#3ecf6e'),
    ], radius: 0.6, height: 5.6, color: '#3f444d',
  };
}
export function bikeModel() {
  const col = pick(['#e8452f', '#3e8ef0', '#2f2f38']);
  return {
    parts: [
      b(-0.7, 0.5, 0, 0.7, 0.7, 0.14, '#26262e'),
      b(0.7, 0.5, 0, 0.7, 0.7, 0.14, '#26262e'),
      b(0, 0.85, 0, 1.6, 0.16, 0.14, col),
      b(0.55, 1.15, 0, 0.14, 0.6, 0.14, col),
      b(0.55, 1.45, 0, 0.16, 0.12, 0.9, col),
      b(-0.5, 1.15, 0, 0.6, 0.16, 0.3, '#3a3a42'),
    ], radius: 1.1, height: 1.6, color: col,
  };
}
export function busStopModel() {
  return {
    parts: [
      b(0, 1.6, 0, 0.24, 3.2, 0.24, '#5a5f6a'),
      b(2.0, 1.6, 0, 0.24, 3.2, 0.24, '#5a5f6a'),
      b(1.0, 3.3, 0, 4.6, 0.26, 2.0, '#4a8fb0'),
      b(1.0, 1.9, -0.9, 4.2, 2.4, 0.14, '#bfe0f0'),
      b(1.0, 0.7, 0.4, 3.0, 0.2, 0.9, '#a06a3a'),
    ], radius: 2.4, height: 3.5, color: '#4a8fb0',
  };
}
export function fountainModel() {
  const parts = [
    b(0, 0.5, 0, 9, 1.0, 9, '#c8ccd4'),
    b(0, 0.9, 0, 7.6, 0.4, 7.6, '#6fc7e8'),
    b(0, 1.6, 0, 2.2, 1.6, 2.2, '#c8ccd4'),
    b(0, 2.8, 0, 1.0, 1.2, 1.0, '#dfe3ea'),
    b(0, 3.7, 0, 0.6, 0.9, 0.6, '#9fe0f5'),
  ];
  return { parts, radius: 5.2, height: 4.2, color: '#c8ccd4' };
}
