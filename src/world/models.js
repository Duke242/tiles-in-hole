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

export function houseModel() {
  const wall = pick(PALETTE.house), roof = pick(PALETTE.roof);
  const w = rand(8, 12), d = rand(7, 10), h = rand(4.5, 7);
  const parts = [
    b(0, h / 2, 0, w, h, d, wall),
    b(0, 0.35, 0, w + 0.4, 0.7, d + 0.4, shade(wall, 0.85)),
  ];
  let ry = h, rw = w + 1.1, rd = d + 1.1;
  for (let i = 0; i < 3; i++) {
    parts.push(b(0, ry + 0.55, 0, rw, 1.1, rd, i === 0 ? shade(roof, 0.8) : roof));
    ry += 1.1; rw *= 0.66; rd *= 0.58;
  }
  parts.push(b(w * 0.28, ry + 0.9, 0, 1.1, 1.8, 1.1, '#8a6a5a'));
  parts.push(b(0, 1.3, d / 2 + 0.08, 1.5, 2.6, 0.16, '#6a4a32'));
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    parts.push(b(sx * w * 0.28, h * 0.62, sz * (d / 2 + 0.08), 1.7, 1.5, 0.16, '#cfe8f5'));
  return { parts, radius: Math.hypot(w, d) / 2, height: ry + 2, color: wall };
}

export function shopModel() {
  const wall = pick(PALETTE.wall), awn = pick(['#e8452f', '#3e8ef0', '#3ecf6e', '#f0a12f']);
  const w = rand(11, 15), d = rand(10, 13), h = rand(6, 9);
  const parts = [
    b(0, h / 2, 0, w, h, d, wall),
    b(0, h + 0.35, 0, w + 0.8, 0.7, d + 0.8, shade(wall, 0.7)),
    b(0, 2.2, d / 2 + 0.5, w * 0.8, 0.5, 1.4, awn),
    b(0, 1.1, d / 2 + 0.09, w * 0.55, 2.2, 0.18, '#bfe0f0'),
    b(0, h * 0.78, d / 2 + 0.12, w * 0.5, 1.2, 0.2, '#ffffff'),
  ];
  for (let i = 0; i < 3; i++)
    parts.push(b(-w * 0.28 + i * w * 0.28, h * 0.5, d / 2 + 0.09, 1.8, 1.6, 0.16, '#cfe8f5'));
  return { parts, radius: Math.hypot(w, d) / 2, height: h + 1, color: wall };
}

export function towerModel(minH, maxH) {
  const wall = pick(PALETTE.wall);
  const w = rand(12, 18), d = rand(12, 18), h = rand(minH, maxH);
  const parts = [
    b(0, h / 2, 0, w, h, d, wall),
    b(0, h + 0.4, 0, w + 1.0, 0.8, d + 1.0, shade(wall, 0.66)),
    b(0, 1.4, 0, w + 0.5, 2.8, d + 0.5, shade(wall, 1.12)),
  ];
  // roof clutter
  parts.push(b(rand(-2, 2), h + 1.6, rand(-2, 2), rand(2, 4), 1.6, rand(2, 4), '#9aa0aa'));
  if (Math.random() < 0.5) parts.push(b(0, h + 4, 0, 0.5, 5, 0.5, '#c0c4cc'));
  // window grid
  const rows = Math.max(2, Math.floor((h - 5) / 3.4));
  const colsW = Math.max(2, Math.floor(w / 4.2));
  const colsD = Math.max(2, Math.floor(d / 4.2));
  const glass = Math.random() < 0.35 ? '#8fd3ef' : '#dff0fa';
  for (let r = 0; r < rows; r++) {
    const y = 4.4 + r * ((h - 5.4) / Math.max(1, rows - 1));
    for (let i = 0; i < colsW; i++) {
      const x = -w / 2 + (i + 0.5) * (w / colsW);
      parts.push(b(x, y, d / 2 + 0.07, w / colsW * 0.55, 1.9, 0.14, glass));
      parts.push(b(x, y, -d / 2 - 0.07, w / colsW * 0.55, 1.9, 0.14, glass));
    }
    for (let i = 0; i < colsD; i++) {
      const z = -d / 2 + (i + 0.5) * (d / colsD);
      parts.push(b(w / 2 + 0.07, y, z, 0.14, 1.9, d / colsD * 0.55, glass));
      parts.push(b(-w / 2 - 0.07, y, z, 0.14, 1.9, d / colsD * 0.55, glass));
    }
  }
  return { parts, radius: Math.hypot(w, d) / 2, height: h + 2, color: wall };
}

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
