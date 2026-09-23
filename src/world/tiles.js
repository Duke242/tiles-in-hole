import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Picture tiles: thick round "cookies" and rounded dice with an icon on the
// face. Icons are painted once into a canvas atlas; each instance picks its
// cell through an `aIcon` attribute, and the coloured side band comes from
// the instance colour.

export const DISC_R = 0.5, DISC_H = 0.34, DICE_S = 0.84;
export const ATLAS_N = 4, CELL = 128;

const TAU = Math.PI * 2;
const circle = (g, x, y, r, f, s, w = 4) => {
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  if (f) { g.fillStyle = f; g.fill(); }
  if (s) { g.lineWidth = w; g.strokeStyle = s; g.stroke(); }
};
const ellipse = (g, x, y, rx, ry, rot, f, s, w = 4) => {
  g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU);
  if (f) { g.fillStyle = f; g.fill(); }
  if (s) { g.lineWidth = w; g.strokeStyle = s; g.stroke(); }
};
const leaf = (g, x, y, len, rot, f = '#4caf3a') => {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  g.fillStyle = f; g.fill(); g.restore();
};

// Each painter draws into a 100x100 space.
export const TILE_TYPES = [
  { id: 'strawberry', side: '#e94b7a', draw(g) {
    g.beginPath(); g.moveTo(50, 88); g.bezierCurveTo(14, 66, 14, 34, 34, 30); g.bezierCurveTo(44, 28, 50, 34, 50, 34);
    g.bezierCurveTo(50, 34, 56, 28, 66, 30); g.bezierCurveTo(86, 34, 86, 66, 50, 88); g.fillStyle = '#e8322f'; g.fill();
    g.fillStyle = '#ffe28a'; for (const [x, y] of [[40, 50], [56, 46], [48, 64], [62, 62], [36, 66], [50, 76]]) circle(g, x, y, 2.6, '#ffe28a');
    leaf(g, 50, 32, 20, -2.6); leaf(g, 50, 32, 20, -0.5); leaf(g, 50, 32, 18, -1.57);
  } },
  { id: 'kiwi', side: '#5bb043', draw(g) {
    circle(g, 50, 50, 36, '#7cc243', '#4f8f25', 5); circle(g, 50, 50, 28, '#c9e59a'); circle(g, 50, 50, 10, '#f3f6e6');
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ellipse(g, 50 + Math.cos(a) * 19, 50 + Math.sin(a) * 19, 2.2, 3.6, a + 1.57, '#23231f'); }
  } },
  { id: 'sushi', side: '#2b2b2b', draw(g) {
    circle(g, 50, 50, 36, '#2a2a2e'); circle(g, 50, 50, 28, '#f6f3ea'); circle(g, 50, 50, 15, '#ff8a4a'); circle(g, 42, 44, 5, '#6cc24a'); circle(g, 58, 56, 5, '#ffd33d');
  } },
  { id: 'blueberry', side: '#5b4fcf', draw(g) {
    for (const [x, y, r] of [[36, 58, 16], [64, 56, 15], [50, 36, 15]]) { circle(g, x, y, r, '#4a5fd8', '#2f3fa8', 3); circle(g, x, y - r * 0.15, r * 0.4, '#2f3fa8'); circle(g, x - r * 0.35, y - r * 0.4, r * 0.28, 'rgba(255,255,255,.45)'); }
    leaf(g, 50, 22, 16, -0.4);
  } },
  { id: 'donut', side: '#f08ac0', draw(g) {
    circle(g, 50, 50, 36, '#d9a05e'); circle(g, 50, 52, 33, '#ff8fb8'); circle(g, 50, 50, 11, '#f6f3ea');
    const cols = ['#3e8ef0', '#ffd23e', '#33c24a', '#f6f3ee', '#8a5fd8'];
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.3, r = 22; g.save(); g.translate(50 + Math.cos(a) * r, 52 + Math.sin(a) * r); g.rotate(a * 1.7); g.fillStyle = cols[i % 5]; g.fillRect(-4, -1.5, 8, 3); g.restore(); }
  } },
  { id: 'orange', side: '#ff9a2e', draw(g) {
    circle(g, 50, 50, 37, '#ff9a2e'); circle(g, 50, 50, 31, '#fff1cf'); circle(g, 50, 50, 28, '#ffb444');
    g.strokeStyle = '#fff1cf'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(50, 50); g.lineTo(50 + Math.cos(a) * 28, 50 + Math.sin(a) * 28); g.stroke(); }
  } },
  { id: 'cookie', side: '#b8783a', draw(g) {
    circle(g, 50, 50, 36, '#e2a95c', '#c48a44', 4);
    for (const [x, y] of [[36, 40], [58, 34], [66, 56], [44, 62], [54, 50], [34, 58], [60, 70]]) circle(g, x, y, 4.5, '#5a3a1e');
  } },
  { id: 'lemon', side: '#f5d433', draw(g) {
    circle(g, 50, 50, 37, '#f5d433'); circle(g, 50, 50, 31, '#fffbe0'); circle(g, 50, 50, 28, '#ffe66b');
    g.strokeStyle = '#fffbe0'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.39; g.beginPath(); g.moveTo(50, 50); g.lineTo(50 + Math.cos(a) * 28, 50 + Math.sin(a) * 28); g.stroke(); }
  } },
  { id: 'apple', side: '#d9302a', draw(g) {
    circle(g, 38, 54, 24, '#e8322f'); circle(g, 62, 54, 24, '#e8322f'); circle(g, 50, 60, 26, '#e8322f');
    g.fillStyle = '#6b3a1a'; g.fillRect(48, 22, 4, 14); leaf(g, 52, 28, 18, -0.6); circle(g, 40, 46, 6, 'rgba(255,255,255,.35)');
  } },
  { id: 'grape', side: '#8a4fd8', draw(g) {
    for (const [x, y] of [[36, 44], [50, 40], [64, 44], [40, 58], [56, 58], [48, 72]]) { circle(g, x, y, 11, '#8a5fd8', '#5c3aa8', 2); circle(g, x - 3, y - 4, 3.5, 'rgba(255,255,255,.45)'); }
    g.fillStyle = '#6b3a1a'; g.fillRect(48, 22, 4, 12); leaf(g, 52, 26, 16, -0.4);
  } },
  { id: 'cherry', side: '#c8203a', draw(g) {
    g.strokeStyle = '#4c8a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(36, 62); g.quadraticCurveTo(44, 30, 56, 22); g.moveTo(64, 62); g.quadraticCurveTo(60, 34, 56, 22); g.stroke();
    circle(g, 36, 66, 15, '#e8322f', '#a81d20', 2); circle(g, 64, 66, 15, '#e8322f', '#a81d20', 2); circle(g, 31, 60, 4.5, 'rgba(255,255,255,.4)'); circle(g, 59, 60, 4.5, 'rgba(255,255,255,.4)'); leaf(g, 56, 22, 16, 0.3);
  } },
  { id: 'melon', side: '#3aa655', draw(g) {
    g.beginPath(); g.arc(50, 40, 38, 0, Math.PI); g.closePath(); g.fillStyle = '#3aa655'; g.fill();
    g.beginPath(); g.arc(50, 40, 32, 0, Math.PI); g.closePath(); g.fillStyle = '#f6f3ea'; g.fill();
    g.beginPath(); g.arc(50, 40, 28, 0, Math.PI); g.closePath(); g.fillStyle = '#ff4f6d'; g.fill();
    for (const [x, y] of [[40, 50], [54, 56], [64, 48], [48, 62], [34, 58]]) ellipse(g, x, y, 2.2, 3.4, 0, '#23231f');
  } },
  { id: 'avocado', side: '#6f9b2f', draw(g) {
    ellipse(g, 50, 52, 26, 36, 0, '#4e7d24'); ellipse(g, 50, 54, 21, 30, 0, '#b8e06a'); circle(g, 50, 60, 12, '#8a5a2b', '#6b3f18', 2); circle(g, 46, 56, 4, 'rgba(255,255,255,.3)');
  } },
  { id: 'candy', side: '#ff6fb1', draw(g) {
    g.fillStyle = '#ff6fb1'; g.beginPath(); g.moveTo(24, 36); g.lineTo(8, 28); g.lineTo(12, 50); g.lineTo(8, 72); g.lineTo(24, 64); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(76, 36); g.lineTo(92, 28); g.lineTo(88, 50); g.lineTo(92, 72); g.lineTo(76, 64); g.closePath(); g.fill();
    circle(g, 50, 50, 26, '#ff8fc4', '#e04f92', 3); g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); for (let t = 0; t < 12; t += 0.2) { const r = t * 2.1; g.lineTo(50 + Math.cos(t) * r, 50 + Math.sin(t) * r); } g.stroke();
  } },
  { id: 'egg', side: '#f0b43c', draw(g) {
    g.beginPath(); g.moveTo(30, 34); g.bezierCurveTo(50, 8, 90, 26, 82, 56); g.bezierCurveTo(78, 80, 40, 90, 24, 70); g.bezierCurveTo(14, 56, 18, 42, 30, 34); g.fillStyle = '#f8f6ef'; g.fill();
    circle(g, 50, 52, 15, '#ffc233', '#f0a020', 2); circle(g, 45, 47, 4.5, 'rgba(255,255,255,.45)');
  } },
  { id: 'cupcake', side: '#c86ad6', draw(g) {
    g.fillStyle = '#b8783a'; g.beginPath(); g.moveTo(26, 54); g.lineTo(74, 54); g.lineTo(68, 86); g.lineTo(32, 86); g.closePath(); g.fill();
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 2; for (let x = 34; x <= 66; x += 8) { g.beginPath(); g.moveTo(x, 56); g.lineTo(x, 84); g.stroke(); }
    circle(g, 50, 48, 24, '#ff8fb8'); circle(g, 38, 40, 14, '#ff8fb8'); circle(g, 62, 40, 14, '#ff8fb8'); circle(g, 50, 30, 12, '#ff8fb8'); circle(g, 50, 22, 6, '#e8322f');
  } },
];

let atlas = null, atlasCanvas = null;
const iconUrls = new Map();

export function getAtlas() {
  if (atlas) return atlas;
  atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasCanvas.height = ATLAS_N * CELL;
  const g = atlasCanvas.getContext('2d');
  TILE_TYPES.forEach((t, i) => {
    const cx = (i % ATLAS_N) * CELL, cy = Math.floor(i / ATLAS_N) * CELL;
    g.save(); g.translate(cx, cy);
    g.fillStyle = '#f8f5ee'; g.fillRect(0, 0, CELL, CELL);
    // a whisper of a bevel toward the edge; dice faces show the corners too,
    // so it has to stay faint
    const grad = g.createRadialGradient(CELL / 2, CELL / 2, CELL * 0.36, CELL / 2, CELL / 2, CELL * 0.52);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(120,90,50,.10)');
    g.fillStyle = grad; g.fillRect(0, 0, CELL, CELL);
    g.translate(CELL * 0.19, CELL * 0.19); g.scale(CELL * 0.62 / 100, CELL * 0.62 / 100);
    g.lineJoin = 'round'; g.lineCap = 'round';
    t.draw(g);
    g.restore();
  });
  atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

// Small PNG of one tile face, for the goal cards.
export function iconUrl(i) {
  if (iconUrls.has(i)) return iconUrls.get(i);
  getAtlas();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 31, 0, TAU); g.clip();
  g.drawImage(atlasCanvas, (i % ATLAS_N) * CELL, Math.floor(i / ATLAS_N) * CELL, CELL, CELL, 0, 0, 64, 64);
  const url = c.toDataURL();
  iconUrls.set(i, url);
  return url;
}

export function discGeometry() { return new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 28, 1); }   // groups: side, top, bottom
export function diceGeometry() { return new RoundedBoxGeometry(DICE_S, DICE_S, DICE_S, 2, 0.1); }

export function makeIconMaterial() {
  const m = new THREE.MeshPhongMaterial({ map: getAtlas(), color: 0xffffff, shininess: 28, specular: new THREE.Color(0x2e2e2e) });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aIcon;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = (uv + vec2(mod(aIcon, ${ATLAS_N}.0), ${ATLAS_N - 1}.0 - floor(aIcon / ${ATLAS_N}.0))) / ${ATLAS_N}.0;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '');
  };
  m.customProgramCacheKey = () => 'tileIcon';
  return m;
}

export function makeSideMaterial() {
  return new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 22, specular: new THREE.Color(0x262626) });
}
