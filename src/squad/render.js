// Draws a Sim with Three.js: instanced low-poly soldiers, zombies, bullets
// and debris, gate panels with painted numbers, the boss, telegraphed
// hazards, and a road that scrolls under the squad. It never changes the
// simulation; it only reads it and reacts to its fx events.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE_HALF, BULLET_SPEED, MAX_SQUAD, MAX_ZOMBIES, MAX_BULLETS, gateLabel, isGoodGate, squadRadius } from './logic.js';

const SKY = 0xb9cbd6;
const MAX_BITS = 700;
const ROAD_LEN = 240;

// ---------- low-poly model kit ----------

// Give every vertex of g one colour (models use vertex colours so a whole
// character is one geometry and one draw call).
function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function part(w, h, d, x, y, z, color, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return paint(g, color);
}

// Models face -z (forward, towards larger d).
function soldierGeometry() {
  return mergeGeometries([
    part(0.11, 0.3, 0.13, -0.08, 0.15, 0, 0x2b3a4a),
    part(0.11, 0.3, 0.13, 0.08, 0.15, 0, 0x2b3a4a),
    part(0.34, 0.34, 0.22, 0, 0.46, 0, 0x2f6fd6),
    part(0.36, 0.08, 0.24, 0, 0.36, 0, 0x1d2a3a),
    part(0.21, 0.2, 0.2, 0, 0.73, 0, 0xf2c39b),
    part(0.27, 0.11, 0.27, 0, 0.86, 0.01, 0x24508f),
    part(0.08, 0.09, 0.2, -0.17, 0.5, -0.1, 0x2f6fd6),
    part(0.08, 0.09, 0.2, 0.17, 0.5, -0.1, 0x2f6fd6),
    part(0.07, 0.08, 0.46, 0.06, 0.5, -0.3, 0x222222),
  ]);
}

function zombieGeometry() {
  return mergeGeometries([
    part(0.12, 0.32, 0.14, -0.09, 0.16, 0, 0x4a3b2c),
    part(0.12, 0.32, 0.14, 0.09, 0.16, 0.03, 0x4a3b2c),
    part(0.36, 0.36, 0.22, 0, 0.5, 0, 0x8a8f78),
    part(0.2, 0.08, 0.23, 0.07, 0.38, 0, 0x6b5a3a),
    part(0.24, 0.24, 0.24, 0, 0.82, -0.02, 0x7fb069),
    part(0.07, 0.04, 0.02, -0.05, 0.84, -0.145, 0xd8202a),
    part(0.07, 0.04, 0.02, 0.06, 0.84, -0.145, 0xd8202a),
    part(0.09, 0.09, 0.4, -0.2, 0.62, -0.2, 0x7fb069),
    part(0.09, 0.09, 0.4, 0.2, 0.6, -0.22, 0x7fb069),
  ]);
}

function bossModel() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.Mesh(mergeGeometries([
    part(0.3, 0.6, 0.34, -0.22, 0.3, 0, 0x3b2d3d),
    part(0.3, 0.6, 0.34, 0.22, 0.3, 0, 0x3b2d3d),
    part(0.95, 0.75, 0.6, 0, 0.98, 0, 0x6c4a8a),
    part(0.7, 0.3, 0.5, 0, 0.66, 0, 0x55386b),
    part(0.5, 0.45, 0.45, 0, 1.55, -0.05, 0x6aa05a),
    part(0.52, 0.1, 0.1, 0, 1.4, -0.27, 0xe8e2c8),
    part(0.12, 0.08, 0.02, -0.12, 1.6, -0.28, 0xff2a2a),
    part(0.12, 0.08, 0.02, 0.12, 1.6, -0.28, 0xff2a2a),
    part(0.08, 0.18, 0.08, -0.17, 1.84, 0, 0x4c7a40),
    part(0.08, 0.14, 0.08, 0.12, 1.82, 0.05, 0x4c7a40),
    part(0.26, 0.26, 0.85, -0.63, 1.12, -0.32, 0x6aa05a, -0.25),
    part(0.26, 0.26, 0.85, 0.63, 1.12, -0.32, 0x6aa05a, -0.25),
    part(0.34, 0.3, 0.34, -0.63, 1.0, -0.78, 0x58884a),
    part(0.34, 0.3, 0.34, 0.63, 1.0, -0.78, 0x58884a),
  ]), mat);
  g.add(body);
  g.userData.mat = mat;
  return g;
}

function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6).translate(0, 0.45, 0);
  const crown = new THREE.ConeGeometry(0.75, 1.8, 7).translate(0, 1.6, 0);
  return mergeGeometries([paint(trunk, 0x6b4a2f), paint(crown, 0x3f6e3a)].map((g) => g.toNonIndexed()));
}

function carGeometry() {
  return mergeGeometries([
    part(1.6, 0.5, 3.2, 0, 0.45, 0, 0x8d3b32),
    part(1.4, 0.45, 1.6, 0, 0.92, 0.2, 0x6e2c25),
    part(1.42, 0.3, 1.2, 0, 0.95, 0.2, 0x253039),
    part(0.3, 0.3, 0.3, -0.75, 0.2, 1.0, 0x1b1b1b),
    part(0.3, 0.3, 0.3, 0.75, 0.2, 1.0, 0x1b1b1b),
    part(0.3, 0.3, 0.3, -0.75, 0.2, -1.0, 0x1b1b1b),
    part(0.3, 0.3, 0.3, 0.75, 0.2, -1.0, 0x1b1b1b),
  ]);
}

function barrierGeometry() {
  return mergeGeometries([
    part(1.8, 0.5, 0.25, 0, 0.6, 0, 0xe0a030),
    part(1.8, 0.12, 0.26, 0, 0.6, 0, 0x2a2a2a),
    part(0.12, 0.6, 0.4, -0.75, 0.3, 0, 0x555555),
    part(0.12, 0.6, 0.4, 0.75, 0.3, 0, 0x555555),
  ]);
}

function rockGeometry() {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  g.scale(1, 0.6, 1); g.translate(0, 0.2, 0);
  return paint(g, 0x8b8f88);
}

// ---------- textures ----------

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#5b5e63'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 80 + Math.random() * 30 | 0;
    x.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  x.strokeStyle = 'rgba(40,40,44,0.5)'; x.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    x.beginPath(); let px = Math.random() * 256, py = Math.random() * 256; x.moveTo(px, py);
    for (let k = 0; k < 5; k++) { px += Math.random() * 30 - 15; py += Math.random() * 30 - 15; x.lineTo(px, py); }
    x.stroke();
  }
  x.fillStyle = '#e9e2c6';
  x.fillRect(0, 0, 10, 256); x.fillRect(246, 0, 10, 256);
  x.fillStyle = 'rgba(240,235,210,0.85)';
  x.fillRect(124, 20, 8, 96); x.fillRect(124, 148, 8, 96);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#7b8a52'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) {
    const g = 110 + Math.random() * 40 | 0;
    x.fillStyle = Math.random() < 0.25 ? `rgba(120,100,70,0.5)` : `rgba(${g - 30},${g},${g - 60},0.5)`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture(text, good) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.font = '900 96px "Baloo 2", "Arial Black", system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = 14; x.strokeStyle = good ? '#0d3b8c' : '#7a0f14';
  x.strokeText(text, 128, 68);
  x.fillStyle = '#ffffff';
  x.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- renderer ----------

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 38, 90);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camDist = 16;
    this.shake = 0;
    this.time = 0;

    this.scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x5a5040, 1.5));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.position.set(-6, 12, 6);
    this.scene.add(sun);

    // Road and verges follow the squad; their textures scroll instead.
    this.roadTex = roadTexture();
    this.roadTex.repeat.set(1, ROAD_LEN / 8);
    this.road = new THREE.Mesh(new THREE.PlaneGeometry(LANE_HALF * 2 + 0.6, ROAD_LEN),
      new THREE.MeshLambertMaterial({ map: this.roadTex }));
    this.road.rotation.x = -Math.PI / 2;
    this.scene.add(this.road);
    this.groundTex = groundTexture();
    this.groundTex.repeat.set(16, ROAD_LEN / 8);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(120, ROAD_LEN),
      new THREE.MeshLambertMaterial({ map: this.groundTex }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.02;
    this.scene.add(this.ground);

    const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.soldiers = new THREE.InstancedMesh(soldierGeometry(), vc, MAX_SQUAD);
    this.zombies = new THREE.InstancedMesh(zombieGeometry(), vc, MAX_ZOMBIES);
    this.zombies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ZOMBIES * 3), 3);
    this.bullets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe36b }), MAX_BULLETS);
    this.bits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshLambertMaterial(), MAX_BITS);
    this.bits.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BITS * 3), 3);
    for (const m of [this.soldiers, this.zombies, this.bullets, this.bits]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
    }
    this.bitList = [];

    // Shadow blob under the squad helps read where it is on the road.
    this.squadShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    this.squadShadow.rotation.x = -Math.PI / 2;
    this.squadShadow.position.y = 0.01;
    this.scene.add(this.squadShadow);

    // Roadside props, recycled as the squad runs past.
    this.decoKinds = [
      { geo: treeGeometry(), n: 36 }, { geo: rockGeometry(), n: 18 },
      { geo: carGeometry(), n: 6 }, { geo: barrierGeometry(), n: 8 },
    ];
    this.deco = [];
    for (const k of this.decoKinds) {
      k.mesh = new THREE.InstancedMesh(k.geo, vc, k.n);
      k.mesh.frustumCulled = false;
      this.scene.add(k.mesh);
      for (let i = 0; i < k.n; i++) this.deco.push({ kind: k, i, d: 0, x: 0, rot: 0, s: 1 });
    }

    this.gateViews = new Map();
    this.hazardViews = new Map();
    this.bossView = null;
    this.tmp = new THREE.Object3D();
    this.col = new THREE.Color();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull the camera back on narrow screens so the whole road fits.
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    this.camDist = Math.max(19, (LANE_HALF + 1.6) / Math.tan(hfov / 2) * 0.95);
    this.camera.updateProjectionMatrix();
  }

  // Start drawing a new run.
  reset(sim) {
    for (const v of this.gateViews.values()) this.disposeGate(v);
    this.gateViews.clear();
    for (const m of this.hazardViews.values()) this.disposeHazard(m);
    this.hazardViews.clear();
    this.disposeBoss();
    this.bitList = [];
    this.shake = 0;
    for (const p of this.deco) this.placeDeco(p, sim.squad.d - 10 + Math.random() * 110);
    for (const k of this.decoKinds) k.mesh.instanceMatrix.needsUpdate = true;
    this.lookX = 0;
    this.camBack = 0;
  }

  placeDeco(p, d) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const big = p.kind.geo === this.decoKinds[2].geo;
    p.x = side * (LANE_HALF + (big ? 2.2 : 1.4) + Math.random() * (big ? 3 : 10));
    if (p.kind === this.decoKinds[3]) p.x = side * (LANE_HALF + 0.9 + Math.random() * 1.5);
    p.d = d;
    p.rot = Math.random() * Math.PI * 2;
    if (p.kind === this.decoKinds[2] || p.kind === this.decoKinds[3]) p.rot = (Math.random() - 0.5) * 0.8;
    p.s = 0.8 + Math.random() * 0.6;
    const t = this.tmp;
    t.position.set(p.x, 0, -p.d);
    t.rotation.set(0, p.rot, 0);
    t.scale.setScalar(p.s);
    t.updateMatrix();
    p.kind.mesh.setMatrixAt(p.i, t.matrix);
    p.kind.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- effects ----------

  burst(x, y, d, n, color, speed = 3, size = 1) {
    for (let i = 0; i < n && this.bitList.length < MAX_BITS; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      this.bitList.push({
        x, y, z: -d, vx: Math.cos(a) * speed * (0.4 + Math.random()), vy: 2 + up * speed * 1.4,
        vz: Math.sin(a) * speed * (0.4 + Math.random()), life: 0.6 + Math.random() * 0.5,
        color, s: size * (0.6 + Math.random() * 0.8), spin: Math.random() * 10,
      });
    }
  }

  handleFx(fx) {
    switch (fx.type) {
      case 'zombieDown': this.burst(fx.x, 0.6 * fx.scale, fx.d, Math.round(6 * fx.scale), 0x6f9f50, 3, fx.scale); break;
      case 'soldierDown': if (!fx.quiet) this.burst(fx.x, 0.5, fx.d, 5, 0x2f6fd6, 2.5); break;
      case 'bite': this.burst(fx.x, 0.5, fx.d, 4, 0xb3202a, 2); break;
      case 'crush': this.burst(fx.x, 0.4, fx.d, 3, 0xb3202a, 2); break;
      case 'boom': {
        const h = fx.hazard;
        const cx = h.shape === 'circle' ? h.x : (h.x0 + h.x1) / 2, cd = h.shape === 'circle' ? h.d : (h.d0 + h.d1) / 2;
        this.burst(cx, 0.3, cd, h.shape === 'circle' ? 14 : 30, 0xff7a1a, h.shape === 'circle' ? 4 : 7);
        this.shake = Math.max(this.shake, h.shape === 'circle' ? 0.25 : 0.45);
        break;
      }
      case 'bossDown': this.burst(fx.x, 1.5, fx.d, 80, 0x8a5aa8, 8, 2); this.burst(fx.x, 1.5, fx.d, 40, 0x6aa05a, 7, 1.5); this.shake = 0.8; break;
      case 'gate': {
        const v = this.gateViews.get(fx.id);
        if (v) v.chosen = fx.side;
        this.burst(fx.x, 1, fx.d, 16, fx.after >= fx.before ? 0x5fb0ff : 0xff5560, 4);
        break;
      }
      case 'gateTick': { const v = this.gateViews.get(fx.id); if (v) v.pulse = 0.15; break; }
      case 'roar': this.shake = Math.max(this.shake, 0.3); break;
    }
  }

  // ---------- gates ----------

  makeGate(g) {
    const group = new THREE.Group();
    group.position.z = -g.d;
    const view = { group, g, version: -1, sides: {}, fade: 1, chosen: null, pulse: 0 };
    const postMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    for (const x of [-LANE_HALF, 0, LANE_HALF]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.7, 0.22), postMat);
      post.position.set(x, 1.35, 0);
      group.add(post);
    }
    for (const side of ['left', 'right']) {
      const cx = side === 'left' ? -LANE_HALF / 2 : LANE_HALF / 2;
      const panelMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(LANE_HALF - 0.22, 2.5), panelMat);
      panel.position.set(cx, 1.3, 0);
      const labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), labelMat);
      label.position.set(cx, 1.45, 0.02);
      group.add(panel, label);
      view.sides[side] = { panel, label };
    }
    view.postMat = postMat;
    this.scene.add(group);
    return view;
  }

  paintGate(view) {
    for (const side of ['left', 'right']) {
      const gate = view.g[side], s = view.sides[side], good = isGoodGate(gate);
      s.panel.material.color.set(good ? 0x2f8cff : 0xff3b3b);
      s.label.material.map?.dispose();
      s.label.material.map = labelTexture(gateLabel(gate), good);
      s.label.material.needsUpdate = true;
    }
    view.version = view.g.version;
  }

  disposeGate(view) {
    this.scene.remove(view.group);
    view.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  }

  // ---------- hazards ----------

  makeHazard(h) {
    let geo;
    if (h.shape === 'circle') geo = new THREE.CircleGeometry(h.r, 32);
    else geo = new THREE.PlaneGeometry(h.x1 - h.x0, h.d1 - h.d0);
    // Drawn over the crowd (no depth test) so a warning is never hidden
    // under the soldiers standing in it.
    const overlay = { transparent: true, depthWrite: false, depthTest: false };
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2020, opacity: 0.3, ...overlay }));
    mesh.renderOrder = 10;
    mesh.rotation.x = -Math.PI / 2;
    if (h.shape === 'circle') mesh.position.set(h.x, 0.03, -h.d);
    else mesh.position.set((h.x0 + h.x1) / 2, 0.03, -(h.d0 + h.d1) / 2);
    // Inner fill grows until it reaches the edge, then the hazard goes off.
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3a10, opacity: 0.4, ...overlay }));
    fill.renderOrder = 11;
    fill.position.z = 0.005;
    mesh.add(fill);
    mesh.userData.fill = fill;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xffe0d0, opacity: 0.9, ...overlay }));
    edge.renderOrder = 12;
    mesh.add(edge);
    mesh.userData.edge = edge;
    this.scene.add(mesh);
    return mesh;
  }

  // ---------- per frame ----------

  draw(sim, dt) {
    this.time += dt;
    const sq = sim.squad, t = this.tmp;

    // Camera: behind and above the squad, leaning a little towards it.
    this.lookX += (sq.x * 0.35 - this.lookX) * Math.min(1, dt * 4);
    // Back off for a big squad so the whole crowd stays on screen, and
    // more again in a boss fight so the boss and its attacks fit too.
    const R = squadRadius(sq.soldiers.length);
    const back = (sim.boss && sim.fighting ? 3 : 0) + Math.max(0, R - 1.2) * 2.2;
    this.camBack += (back - this.camBack) * Math.min(1, dt * 2);
    const look = new THREE.Vector3(this.lookX, 0, -(sq.d + 6 + this.camBack * 0.5));
    const dir = new THREE.Vector3(0, 0.62, 0.78).normalize();
    const cam = look.clone().addScaledVector(dir, this.camDist + this.camBack);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      cam.x += (Math.random() - 0.5) * this.shake; cam.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.position.copy(cam);
    this.camera.lookAt(look);

    this.road.position.z = -(sq.d + ROAD_LEN / 2 - 30);
    this.ground.position.z = this.road.position.z;
    this.roadTex.offset.y = (sq.d + ROAD_LEN / 2 - 30) / 8;
    this.groundTex.offset.y = (sq.d + ROAD_LEN / 2 - 30) / 8;
    for (const p of this.deco) if (p.d < sq.d - 14) this.placeDeco(p, p.d + 120 + Math.random() * 10);

    // Soldiers
    const s = sim.squad.soldiers;
    for (let i = 0; i < s.length; i++) {
      const so = s[i], bob = Math.abs(Math.sin(this.time * 13 + so.phase)) * 0.06 * Math.min(1, sq.speed / 3);
      t.position.set(so.x, bob, -so.d);
      t.rotation.set(0, 0, Math.sin(this.time * 13 + so.phase) * 0.05);
      t.scale.setScalar(1);
      t.updateMatrix();
      this.soldiers.setMatrixAt(i, t.matrix);
    }
    this.soldiers.count = s.length;
    this.soldiers.instanceMatrix.needsUpdate = true;
    this.squadShadow.position.set(sq.x, 0.01, -sq.d);
    this.squadShadow.scale.set(R + 0.3, (R + 0.3) * 1.56, 1);
    this.squadShadow.visible = s.length > 0;

    // Zombies
    let n = 0;
    const tints = { walker: [1, 1, 1], runner: [1.25, 1.1, 0.6], brute: [0.75, 0.8, 0.95] };
    for (const z of sim.zombies) {
      if (n >= MAX_ZOMBIES) break;
      const sw = Math.sin(z.phase);
      t.position.set(z.x, z.awake ? Math.abs(sw) * 0.05 * z.scale : 0, -z.d);
      // Turn to face the squad (models look down -z, the squad is at +z).
      const face = Math.atan2(-(sq.x - z.x) * 0.6, -(z.d - sq.d));
      t.rotation.set(0, face, sw * 0.12);
      t.scale.setScalar(z.scale);
      t.updateMatrix();
      this.zombies.setMatrixAt(n, t.matrix);
      const k = tints[z.kind], f = z.flash > 0 ? 3 : 1;
      this.zombies.instanceColor.setXYZ(n, k[0] * f, k[1] * f, k[2] * f);
      n++;
    }
    this.zombies.count = n;
    this.zombies.instanceMatrix.needsUpdate = true;
    this.zombies.instanceColor.needsUpdate = true;

    // Bullets
    n = 0;
    for (const b of sim.bullets) {
      if (n >= MAX_BULLETS) break;
      t.position.set(b.x, 0.5, -b.d);
      t.rotation.set(0, Math.atan2(-b.vx, BULLET_SPEED), 0);
      t.scale.setScalar(1);
      t.updateMatrix();
      this.bullets.setMatrixAt(n++, t.matrix);
    }
    this.bullets.count = n;
    this.bullets.instanceMatrix.needsUpdate = true;

    // Debris
    n = 0;
    const keep = [];
    for (const p of this.bitList) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      t.position.set(p.x, p.y, p.z);
      t.rotation.set(p.spin * p.life, p.spin * p.life * 0.7, 0);
      t.scale.setScalar(p.s * Math.min(1, p.life * 3));
      t.updateMatrix();
      this.bits.setMatrixAt(n, t.matrix);
      this.bits.instanceColor.setXYZ(n, ...this.col.set(p.color).toArray());
      n++;
      keep.push(p);
    }
    this.bitList = keep;
    this.bits.count = n;
    this.bits.instanceMatrix.needsUpdate = true;
    this.bits.instanceColor.needsUpdate = true;

    this.drawGates(sim, dt);
    this.drawBoss(sim, dt);
    this.drawHazards(sim);
    this.gl.render(this.scene, this.camera);
  }

  drawGates(sim, dt) {
    const live = new Set();
    for (const g of sim.gates) {
      live.add(g.id);
      let v = this.gateViews.get(g.id);
      if (!v) { v = this.makeGate(g); this.gateViews.set(g.id, v); }
      if (v.version !== g.version) this.paintGate(v);
      v.pulse = Math.max(0, v.pulse - dt);
    }
    for (const [id, v] of this.gateViews) {
      if (!live.has(id) || v.chosen) {
        v.fade -= dt * 2.5;
        if (v.chosen) {
          const s = v.sides[v.chosen];
          s.label.scale.setScalar(1 + (1 - v.fade) * 0.6);
        }
        for (const side of ['left', 'right']) {
          v.sides[side].panel.material.opacity = 0.5 * Math.max(0, v.fade);
          v.sides[side].label.material.opacity = Math.max(0, v.fade);
        }
        if (v.fade <= 0) { this.disposeGate(v); this.gateViews.delete(id); }
      } else {
        for (const side of ['left', 'right']) v.sides[side].label.scale.setScalar(1 + v.pulse * 1.2);
      }
    }
  }

  drawBoss(sim, dt) {
    const b = sim.boss;
    if (!b) {
      this.disposeBoss();
      return;
    }
    if (!this.bossView) {
      this.bossView = bossModel();
      this.scene.add(this.bossView);
    }
    const v = this.bossView, s = b.stats.size;
    const walk = sim.fighting ? Math.sin(this.time * 4) : Math.sin(this.time * 1.5) * 0.4;
    const lunge = b.lunge > 0 ? Math.sin((b.lunge / 0.45) * Math.PI) * 2.5 : 0;
    v.position.set(b.x, Math.abs(walk) * 0.08 * s, -(b.d - lunge));
    v.rotation.set(0, Math.PI, walk * 0.06);
    v.scale.setScalar(s);
    // Under constant fire the hit flash would never turn off; blink instead.
    const lit = b.flash > 0 && Math.floor(this.time * 12) % 2 === 0 ? 0.22 : 0;
    v.userData.mat.emissive.setRGB(lit, lit, lit);
  }

  drawHazards(sim) {
    const live = new Set(sim.hazards);
    for (const h of sim.hazards) {
      let m = this.hazardViews.get(h);
      if (!m) { m = this.makeHazard(h); this.hazardViews.set(h, m); }
      const k = Math.min(1, h.t / h.delay);
      m.userData.fill.scale.setScalar(Math.max(0.01, k));
      m.material.opacity = 0.25 + 0.2 * Math.abs(Math.sin(this.time * 14));
    }
    for (const [h, m] of this.hazardViews) {
      if (live.has(h)) continue;
      this.disposeHazard(m);
      this.hazardViews.delete(h);
    }
  }

  disposeHazard(m) {
    this.scene.remove(m);
    m.geometry.dispose(); m.material.dispose(); m.userData.fill.material.dispose();
    m.userData.edge.geometry.dispose(); m.userData.edge.material.dispose();
  }

  disposeBoss() {
    if (!this.bossView) return;
    this.scene.remove(this.bossView);
    this.bossView.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.bossView.userData.mat.dispose();
    this.bossView = null;
  }

  // World point to CSS pixels, for HUD labels.
  project(x, y, d) {
    const v = new THREE.Vector3(x, y, -d).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, visible: v.z < 1 };
  }
}
