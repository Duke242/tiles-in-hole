// Draws a Sim with Three.js. It never changes the simulation: it reads the
// state each frame and reacts to its fx events.
//
// Look: bright, polished mobile-game style. A gradient sky, sun with soft
// shadows, smooth jointed characters (legs and arms swing per instance),
// glowing tracers and muzzle flashes through a bloom pass, blood sprays and
// stains on the road, zombies that topple when they die, fireball
// explosions, glassy glowing gates and a dressed roadside that recycles as
// the squad runs. Quality steps down by itself on slow devices.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  LANE_HALF, BULLET_SPEED, RUN_SPEED, MAX_SQUAD, MAX_ZOMBIES, MAX_BULLETS,
  gateLabel, isGoodGate, squadRadius,
} from './logic.js';
import * as K from './models.js';

const HORIZON = 0xcfe6f6;
const MAX_CORPSES = 160;
const MAX_BITS = 900;
const MAX_SPARKS = 500;
const MAX_DECALS = 240;
const ROAD_LEN = 260;
const WALK_W = 1.7;   // sidewalk width
const QUALITY = ['low', 'medium', 'high'];

// ---------- textures ----------

function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

function speckle(x, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[(Math.random() * colors.length) | 0];
    x.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

function roadTexture() {
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#50545b'; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 7000, ['rgba(90,94,101,.6)', 'rgba(64,67,72,.6)', 'rgba(110,112,118,.35)'], 2);
    // worn tyre tracks
    x.fillStyle = 'rgba(40,42,46,.18)';
    for (const cx of [110, 180, 330, 400]) x.fillRect(cx, 0, 34, h);
    // patches and cracks
    x.fillStyle = 'rgba(38,40,44,.35)'; x.fillRect(60, 300, 90, 60); x.fillRect(360, 90, 70, 50);
    x.strokeStyle = 'rgba(30,31,34,.55)'; x.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      x.beginPath(); let px = 40 + Math.random() * 430, py = Math.random() * h; x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += Math.random() * 36 - 18; py += Math.random() * 30; x.lineTo(px, py); }
      x.stroke();
    }
    // edge lines and the dashed centre line (it splits each gate pair)
    x.fillStyle = '#f2efe4';
    x.fillRect(14, 0, 10, h); x.fillRect(w - 24, 0, 10, h);
    x.fillRect(w / 2 - 6, 30, 12, 190); x.fillRect(w / 2 - 6, 286, 12, 190);
  }, { repeat: true });
}

function walkTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#c9c6bf'; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 900, ['rgba(160,156,150,.6)', 'rgba(215,212,205,.6)'], 2);
    x.strokeStyle = '#a19d96'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
  }, { repeat: true });
}

function grassTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    // Two bands give mown stripes across the verge.
    x.fillStyle = '#6cae4c'; x.fillRect(0, 0, w, h / 2);
    x.fillStyle = '#62a344'; x.fillRect(0, h / 2, w, h / 2);
    speckle(x, w, h, 5000, ['rgba(90,150,60,.6)', 'rgba(120,180,80,.5)', 'rgba(80,130,55,.5)'], 2);
    speckle(x, w, h, 60, ['rgba(255,255,255,.5)', 'rgba(255,230,120,.6)'], 3);
  }, { repeat: true });
}

// White blood splat with ragged edges; tinted per decal instance.
function splatTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(64, 64, 34, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 22, s = 5 + Math.random() * 12;
      x.beginPath(); x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 12;
      x.beginPath(); x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + Math.random() * 3, 0, Math.PI * 2); x.fill();
    }
  });
}

function gatePanelTexture(good) {
  return canvasTex(256, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    if (good) { g.addColorStop(0, '#8fd6ff'); g.addColorStop(1, '#1d64d8'); }
    else { g.addColorStop(0, '#ff9a8f'); g.addColorStop(1, '#cc1f30'); }
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.16)';
    for (let i = -h; i < w; i += 64) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 28, h); x.lineTo(i + 28 + h, 0); x.lineTo(i + h, 0); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, 0, w, 6); x.fillRect(0, h - 6, w, 6);
  }, { repeat: true });
}

function labelTexture(text, good) {
  return canvasTex(512, 256, (x, w, h) => {
    x.font = '900 190px "Baloo 2", "Arial Black", system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowOffsetY = 10; x.shadowBlur = 8;
    x.lineWidth = 26; x.strokeStyle = good ? '#0b3a8a' : '#7a0d18';
    x.strokeText(text, w / 2, h / 2 + 8);
    x.shadowColor = 'transparent';
    const g = x.createLinearGradient(0, 50, 0, 210);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, good ? '#cfeaff' : '#ffe0e0');
    x.fillStyle = g;
    x.fillText(text, w / 2, h / 2 + 8);
  });
}

function hazardTexture(kind) {
  return canvasTex(256, 256, (x, w, h) => {
    if (kind === 'circle') {
      const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,60,30,.15)'); g.addColorStop(0.75, 'rgba(255,40,20,.45)'); g.addColorStop(0.97, 'rgba(255,90,60,.95)'); g.addColorStop(1, 'rgba(255,90,60,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    } else {
      x.fillStyle = 'rgba(255,40,20,.35)'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,90,40,.55)';
      for (let i = -h; i < w; i += 48) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 22, h); x.lineTo(i + 22 + h, 0); x.lineTo(i + h, 0); x.fill(); }
      x.strokeStyle = 'rgba(255,160,120,1)'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
    }
  }, { repeat: kind !== 'circle' });
}

// ---------- instanced rigs ----------

// A character made of rigid instanced parts. Each part is drawn at the
// instance's base matrix, offset to its joint and swung about x.
class Rig {
  constructor(scene, parts, max, material) {
    this.parts = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geo, material, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.count = 0;
      // Untinted instances must start white, not black.
      const white = new THREE.Color(1, 1, 1);
      for (let i = 0; i < max; i++) mesh.setColorAt(i, white);
      scene.add(mesh);
      return { ...p, mesh };
    });
    this.local = new THREE.Matrix4();
    this.out = new THREE.Matrix4();
  }

  // swing: { legs, armL, armR } angles in radians.
  set(i, base, swing, tint) {
    for (const p of this.parts) {
      let a = 0;
      if (p.joint === 'legL') a = swing.legs;
      else if (p.joint === 'legR') a = -swing.legs;
      else if (p.joint === 'armL') a = swing.armL;
      else if (p.joint === 'armR') a = swing.armR;
      if (p.pivot) {
        this.local.makeRotationX(a).setPosition(p.pivot[0], p.pivot[1], p.pivot[2]);
        this.out.multiplyMatrices(base, this.local);
        p.mesh.setMatrixAt(i, this.out);
      } else p.mesh.setMatrixAt(i, base);
      if (tint) p.mesh.setColorAt(i, tint);
    }
  }

  finish(n) {
    for (const p of this.parts) {
      p.mesh.count = n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
}

// ---------- renderer ----------

export class Renderer {
  constructor(canvas, { quality = null } = {}) {
    this.canvas = canvas;
    this.fixedQuality = QUALITY.includes(quality) ? quality : null;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.quality = this.fixedQuality || (coarse ? 'medium' : 'high');

    const gl = this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(HORIZON, 50, 120);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.camDist = 16;
    this.shake = 0;
    this.time = 0;
    this.v3 = new THREE.Vector3();
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s3 = new THREE.Vector3();
    this.col = new THREE.Color();

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildActors();
    this.buildFx();
    this.buildProps();

    this.composer = new EffectComposer(gl);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.gateViews = new Map();
    this.hazardViews = new Map();
    this.bossView = null;
    this.perf = { t: 0, frames: 0, last: performance.now() };
    addEventListener('resize', () => this.resize());
    this.applyQuality();
  }

  // ---------- scene setup ----------

  buildSky() {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d8fe0) }, mid: { value: new THREE.Color(0x8cc4f0) },
        horizon: { value: new THREE.Color(HORIZON) }, sun: { value: new THREE.Vector3(-0.35, 0.55, -0.75).normalize() },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sun; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.75, h));
          float s = max(dot(normalize(vDir), sun), 0.0);
          c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);

    // A few soft clouds far out.
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdde9f5, emissiveIntensity: 0.55, fog: false });
    const cloudGeo = K.merge([
      K.blob(6, 0xffffff, K.M(0, 0, 0, 0, 0, 0, 1.6, 0.7, 1)),
      K.blob(4.5, 0xffffff, K.M(6, -0.8, 1, 0, 0, 0, 1.4, 0.7, 1)),
      K.blob(4, 0xffffff, K.M(-6.5, -1, -1, 0, 0, 0, 1.3, 0.65, 1)),
    ]);
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 7);
    this.cloudSpots = [];
    for (let i = 0; i < 7; i++) this.cloudSpots.push({ x: (Math.random() - 0.5) * 260, y: 40 + Math.random() * 25, d: 120 + Math.random() * 120, s: 0.8 + Math.random() * 0.8 });
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xe2f0ff, 0x5d6b45, 1.15));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d6, 2.5);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 24; sc.bottom = -16; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.flashLight = new THREE.PointLight(0xffa040, 0, 18, 1.6);
    this.flashLight.position.y = 2;
    this.scene.add(this.flashLight);
  }

  buildGround() {
    this.roadTex = roadTexture();
    this.roadTex.repeat.set(1, ROAD_LEN / 12);
    this.road = new THREE.Mesh(new THREE.PlaneGeometry(LANE_HALF * 2 + 0.5, ROAD_LEN),
      new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.92 }));
    this.road.rotation.x = -Math.PI / 2;
    this.road.receiveShadow = true;
    this.scene.add(this.road);

    this.walkTex = walkTexture();
    this.walkTex.repeat.set(1, ROAD_LEN / 1.7);
    const walkMat = new THREE.MeshStandardMaterial({ map: this.walkTex, roughness: 0.95 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xe4e1d9, roughness: 0.8 });
    this.walks = [];
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(WALK_W, 0.12, ROAD_LEN), walkMat);
      walk.position.set(side * (LANE_HALF + 0.25 + WALK_W / 2), 0.06, 0);
      walk.receiveShadow = true;
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, ROAD_LEN), curbMat);
      curb.position.set(side * (LANE_HALF + 0.3), 0.08, 0);
      curb.receiveShadow = true;
      this.scene.add(walk, curb);
      this.walks.push(walk, curb);
    }

    this.grassTex = grassTexture();
    this.grassTex.repeat.set(40, ROAD_LEN / 8);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(320, ROAD_LEN),
      new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.01;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  buildActors() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05 });
    const SH = K.SOLDIER_HIP, ZH = K.ZOMBIE_HIP, ZS = K.ZOMBIE_SHOULDER;
    this.soldierRig = new Rig(this.scene, [
      { geo: K.soldierBody() },
      { geo: K.soldierLeg(), joint: 'legL', pivot: [-SH.x, SH.y, 0] },
      { geo: K.soldierLeg(), joint: 'legR', pivot: [SH.x, SH.y, 0] },
    ], MAX_SQUAD, mat);
    this.zombieRig = new Rig(this.scene, [
      { geo: K.zombieBody() },
      { geo: K.zombieArm(-1), joint: 'armL', pivot: [-ZS.x, ZS.y, ZS.z] },
      { geo: K.zombieArm(1), joint: 'armR', pivot: [ZS.x, ZS.y, ZS.z] },
      { geo: K.zombieLeg(), joint: 'legL', pivot: [-ZH.x, ZH.y, 0] },
      { geo: K.zombieLeg(), joint: 'legR', pivot: [ZH.x, ZH.y, 0] },
    ], MAX_ZOMBIES + MAX_CORPSES, mat);
    this.corpses = [];
  }

  buildFx() {
    const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, toneMapped: false });
    const inst = (geo, mat, n, color = false) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      if (color) m.setColorAt(0, new THREE.Color());
      this.scene.add(m);
      return m;
    };
    this.tracers = inst(new THREE.BoxGeometry(0.045, 0.045, 0.9), glow(4, 2.8, 1.1), MAX_BULLETS);
    this.muzzles = inst(new THREE.OctahedronGeometry(0.1, 0), glow(6, 4, 1.6), MAX_SQUAD);
    this.bits = inst(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ roughness: 0.4 }), MAX_BITS, true);
    this.sparks = inst(new THREE.IcosahedronGeometry(0.05, 0), glow(1, 1, 1), MAX_SPARKS, true);
    this.bitList = [];
    this.sparkList = [];

    const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decals = inst(decalGeo, new THREE.MeshBasicMaterial({ map: splatTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.85 }), MAX_DECALS, true);
    this.decals.count = MAX_DECALS;
    this.decalList = [];
    this.decalNext = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DECALS; i++) this.decals.setMatrixAt(i, zero);

    // Explosions: pooled fireballs and shockwave rings.
    this.blasts = [];
    for (let i = 0; i < 14; i++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), glow(3, 1.3, 0.35));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), glow(2.5, 1.4, 0.6));
      ball.visible = ring.visible = false;
      this.scene.add(ball, ring);
      this.blasts.push({ ball, ring, t: 1, dur: 1 });
    }
  }

  buildProps() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const roadEdge = LANE_HALF + 0.25;
    const walkOut = roadEdge + WALK_W;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const side = () => (Math.random() < 0.5 ? -1 : 1);
    // Each kind: how many, and where one goes. Lamps and hydrants keep a
    // regular spacing along the sidewalk; the rest scatter on the verge.
    this.propKinds = [
      { geo: K.treeGeometry(0), n: 14, place: () => ({ x: side() * rnd(walkOut + 1.2, walkOut + 16), rot: rnd(0, 6.3), s: rnd(0.9, 1.5) }) },
      { geo: K.treeGeometry(1), n: 14, place: () => ({ x: side() * rnd(walkOut + 1.2, walkOut + 16), rot: rnd(0, 6.3), s: rnd(0.9, 1.5) }) },
      { geo: K.pineGeometry(), n: 18, place: () => ({ x: side() * rnd(walkOut + 4, walkOut + 24), rot: rnd(0, 6.3), s: rnd(1, 1.8) }) },
      { geo: K.bushGeometry(), n: 18, place: () => ({ x: side() * rnd(walkOut + 0.5, walkOut + 6), rot: rnd(0, 6.3), s: rnd(0.7, 1.2) }) },
      { geo: K.rockGeometry(), n: 10, place: () => ({ x: side() * rnd(walkOut + 1, walkOut + 12), rot: rnd(0, 6.3), s: rnd(0.6, 1.3) }) },
      { geo: K.carGeometry(), n: 7, tint: true, place: () => { const sd = side(); return { x: sd * rnd(walkOut + 1.6, walkOut + 3.5), rot: rnd(-0.5, 0.5) + (Math.random() < 0.5 ? Math.PI : 0), s: 1 }; } },
      { geo: K.barrierGeometry(), n: 6, place: () => ({ x: side() * (roadEdge + rnd(0.5, 1.2)), rot: rnd(-0.3, 0.3), s: 1 }) },
      { geo: K.coneGeometry(), n: 10, place: () => ({ x: side() * (roadEdge + rnd(0.3, 1.4)), rot: rnd(0, 6.3), s: 1 }) },
      { geo: K.lampGeometry(), n: 12, spacing: 14, place: (i) => ({ x: (i % 2 ? 1 : -1) * (walkOut - 0.3), rot: i % 2 ? Math.PI : 0, s: 1 }) },
      { geo: K.hydrantGeometry(), n: 4, spacing: 40, place: (i) => ({ x: (i % 2 ? -1 : 1) * (roadEdge + 0.9), rot: 0, s: 1 }) },
    ];
    const carColors = [0xd8402e, 0xf2c230, 0x2f7fd8, 0xeeeeee, 0x34495e, 0x3aa35a, 0xe07a2c];
    this.props = [];
    for (const k of this.propKinds) {
      k.mesh = new THREE.InstancedMesh(k.geo, mat, k.n);
      k.mesh.castShadow = true;
      k.mesh.receiveShadow = true;
      k.mesh.frustumCulled = false;
      if (k.tint) for (let i = 0; i < k.n; i++) k.mesh.setColorAt(i, new THREE.Color(carColors[i % carColors.length]));
      this.scene.add(k.mesh);
      for (let i = 0; i < k.n; i++) this.props.push({ kind: k, i, d: 0 });
    }
  }

  // ---------- quality ----------

  applyQuality() {
    const q = this.quality;
    this.gl.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    const shadows = q !== 'low';
    if (this.gl.shadowMap.enabled !== shadows) {
      this.gl.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
    this.sun.castShadow = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  // Step quality down if frames are slow (never back up within a session).
  watchPerf() {
    const now = performance.now(), p = this.perf;
    p.t += now - p.last; p.last = now; p.frames++;
    if (p.t < 2500) return;
    const fps = (p.frames * 1000) / p.t;
    p.t = 0; p.frames = 0;
    if (this.fixedQuality || fps >= 42) return;
    const i = QUALITY.indexOf(this.quality);
    if (i > 0) { this.quality = QUALITY[i - 1]; this.applyQuality(); }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.gl.setSize(w, h, false);
    this.composer?.setPixelRatio(this.gl.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    // Pull the camera back on narrow screens so the whole road fits.
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    this.camDist = Math.max(16, (LANE_HALF + 0.9) / Math.tan(hfov / 2) * 0.92);
    this.camera.updateProjectionMatrix();
  }

  // ---------- run lifecycle ----------

  reset(sim) {
    for (const v of this.gateViews.values()) this.disposeGate(v);
    this.gateViews.clear();
    for (const m of this.hazardViews.values()) this.disposeHazard(m);
    this.hazardViews.clear();
    this.disposeBoss();
    this.bitList = [];
    this.sparkList = [];
    this.corpses = [];
    this.decalList = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DECALS; i++) this.decals.setMatrixAt(i, zero);
    this.decals.instanceMatrix.needsUpdate = true;
    for (const b of this.blasts) { b.t = b.dur; b.ball.visible = b.ring.visible = false; }
    this.shake = 0;
    for (const k of this.propKinds) {
      const span = k.spacing ? k.spacing * k.n : 150;
      const list = this.props.filter((p) => p.kind === k);
      list.forEach((p, i) => this.placeProp(p, k.spacing ? sim.squad.d - 12 + i * k.spacing : sim.squad.d - 12 + Math.random() * span, i));
    }
    this.lookX = 0;
    this.camBack = 0;
  }

  placeProp(p, d, i = p.i) {
    const k = p.kind, at = k.place(i);
    p.d = d;
    this.m4.compose(this.v3.set(at.x, 0, -d), this.q.setFromEuler(this.e.set(0, at.rot, 0)), this.s3.setScalar(at.s));
    k.mesh.setMatrixAt(p.i, this.m4);
    k.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- effects ----------

  addBits(x, y, d, n, color, { speed = 3, up = 2.5, size = 1, dir = 0, life = 0.9 } = {}) {
    for (let i = 0; i < n && this.bitList.length < MAX_BITS; i++) {
      const a = Math.random() * Math.PI * 2;
      this.bitList.push({
        x, y, z: -d, vx: Math.cos(a) * speed * Math.random(), vy: up * (0.5 + Math.random()),
        vz: Math.sin(a) * speed * Math.random() - dir * (1 + Math.random() * 2),
        life: life * (0.6 + Math.random() * 0.6), color, s: size * (0.6 + Math.random() * 0.9),
      });
    }
  }

  addSparks(x, y, d, n, color, speed = 4, size = 1) {
    for (let i = 0; i < n && this.sparkList.length < MAX_SPARKS; i++) {
      const a = Math.random() * Math.PI * 2, el = Math.random() * 1.2;
      this.sparkList.push({
        x, y, z: -d, vx: Math.cos(a) * Math.cos(el) * speed * (0.3 + Math.random()), vy: Math.sin(el) * speed * (0.5 + Math.random()),
        vz: Math.sin(a) * Math.cos(el) * speed * (0.3 + Math.random()), life: 0.35 + Math.random() * 0.45, max: 0.8,
        color: new THREE.Color(color), s: size * (0.5 + Math.random()),
      });
    }
  }

  addDecal(x, d, size, color) {
    const i = this.decalNext;
    this.decalNext = (this.decalNext + 1) % MAX_DECALS;
    this.decalList[i] = { x, d, size, rot: Math.random() * Math.PI * 2, age: 0, sx: 0.8 + Math.random() * 0.5 };
    this.decals.setColorAt(i, this.col.set(color));
    this.decals.instanceColor.needsUpdate = true;
  }

  blast(x, d, r, ring = true) {
    const b = this.blasts.find((o) => o.t >= o.dur);
    if (!b) return;
    b.t = 0; b.dur = 0.55; b.x = x; b.d = d; b.r = r; b.withRing = ring;
    b.ball.visible = true; b.ring.visible = ring;
  }

  handleFx(fx) {
    switch (fx.type) {
      case 'hit':
        if (Math.random() < 0.45) this.addBits(fx.x, 0.65 * fx.scale, fx.d, 2, 0x9c0f16, { speed: 1.2, up: 1.5, size: 0.8, dir: 1, life: 0.6 });
        break;
      case 'zombieDown':
        this.corpses.push({ x: fx.x, d: fx.d, kind: fx.kind, scale: fx.scale, t: 0, yaw: null, fall: 1.35 + Math.random() * 0.2 });
        if (this.corpses.length > MAX_CORPSES) this.corpses.shift();
        this.addBits(fx.x, 0.7 * fx.scale, fx.d, Math.round(9 * fx.scale), 0x9c0f16, { speed: 2.2, up: 2.4, size: fx.scale, dir: 1.2 });
        this.addDecal(fx.x + (Math.random() - 0.5) * 0.3, fx.d + 0.4 * fx.scale, (0.7 + Math.random() * 0.5) * fx.scale, 0x6e0b10);
        break;
      case 'soldierDown':
        if (fx.quiet) { this.addSparks(fx.x, 0.5, fx.d, 4, 0xff8080, 2); break; }
        this.addBits(fx.x, 0.5, fx.d, 6, 0xa3121b, { speed: 2, up: 2, size: 0.9 });
        this.addBits(fx.x, 0.5, fx.d, 3, 0x2f6fd6, { speed: 2.5, up: 2.5, size: 1.1 });
        this.addDecal(fx.x, fx.d, 0.45 + Math.random() * 0.3, 0x700b10);
        break;
      case 'bite': case 'crush':
        this.addBits(fx.x, 0.5, fx.d, 5, 0xa3121b, { speed: 2, up: 2 });
        break;
      case 'boom': {
        const h = fx.hazard;
        if (h.shape === 'circle') {
          this.blast(h.x, h.d, h.r * 1.1);
          this.addSparks(h.x, 0.4, h.d, 22, 0xffa040, 6);
          this.addBits(h.x, 0.3, h.d, 8, 0x3a3a3a, { speed: 4, up: 4 });
          this.addDecal(h.x, h.d, h.r * 2.1, 0x1c1a18);
          this.flash(h.x, h.d, 6);
          this.shake = Math.max(this.shake, 0.3);
        } else {
          const len = h.d1 - h.d0, w = h.x1 - h.x0, n = Math.max(3, Math.round(len / 2.5));
          for (let i = 0; i < n; i++) {
            const x = h.x0 + w * (0.25 + Math.random() * 0.5), d = h.d0 + (len * (i + 0.5)) / n;
            this.blast(Math.max(-LANE_HALF, Math.min(LANE_HALF, x)), d, Math.min(1.8, w * 0.45), i % 2 === 0);
            this.addSparks(x, 0.4, d, 8, 0xffa040, 6);
            this.addDecal(x, d, Math.min(2.4, w * 0.8), 0x1c1a18);
          }
          this.flash((h.x0 + h.x1) / 2, (h.d0 + h.d1) / 2, 9);
          this.shake = Math.max(this.shake, 0.5);
        }
        break;
      }
      case 'bossDown':
        this.blast(fx.x, fx.d, 3.5);
        this.blast(fx.x - 1, fx.d - 0.5, 2.2, false);
        this.blast(fx.x + 1, fx.d + 0.5, 2.2, false);
        this.addSparks(fx.x, 1.5, fx.d, 80, 0xffb050, 9, 1.4);
        this.addBits(fx.x, 1.5, fx.d, 40, 0x6a3f86, { speed: 6, up: 6, size: 2 });
        this.addBits(fx.x, 1.5, fx.d, 40, 0x8a1016, { speed: 5, up: 5, size: 1.6 });
        this.addDecal(fx.x, fx.d, 4, 0x5a0a0e);
        this.flash(fx.x, fx.d, 14);
        this.shake = 0.9;
        break;
      case 'gate': {
        const v = this.gateViews.get(fx.id);
        if (v) v.chosen = fx.side;
        const good = fx.after >= fx.before;
        this.addSparks(fx.x, 1.2, fx.d, 40, good ? 0x7cc8ff : 0xff6070, 5, 1.3);
        break;
      }
      case 'gateTick': { const v = this.gateViews.get(fx.id); if (v) v.pulse = 0.15; break; }
      case 'roar': this.shake = Math.max(this.shake, 0.35); break;
    }
  }

  flash(x, d, intensity) {
    this.flashLight.position.set(x, 2, -d);
    this.flashLight.intensity = Math.max(this.flashLight.intensity, intensity * 12);
  }

  // ---------- gates ----------

  makeGate(g) {
    const group = new THREE.Group();
    group.position.z = -g.d;
    const view = { group, g, version: -1, sides: {}, fade: 1, chosen: null, pulse: 0 };
    const postMat = new THREE.MeshStandardMaterial({ color: 0xeef2f6, metalness: 0.55, roughness: 0.3 });
    for (const x of [-LANE_HALF - 0.05, 0, LANE_HALF + 0.05]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.9, 14), postMat);
      post.position.set(x, 1.45, 0);
      post.castShadow = true;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.18, 14), postMat);
      base.position.set(x, 0.09, 0);
      group.add(post, base);
    }
    for (const side of ['left', 'right']) {
      const cx = side === 'left' ? -LANE_HALF / 2 : LANE_HALF / 2;
      const panelMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(LANE_HALF - 0.26, 2.5), panelMat);
      panel.position.set(cx, 1.4, 0);
      const barMat = new THREE.MeshBasicMaterial({ toneMapped: false });
      const bars = [2.68, 0.13].map((y) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF - 0.2, 0.09, 0.09), barMat);
        bar.position.set(cx, y, 0);
        return bar;
      });
      const labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), labelMat);
      label.position.set(cx, 1.5, 0.03);
      group.add(panel, ...bars, label);
      view.sides[side] = { panel, label, barMat };
    }
    this.scene.add(group);
    return view;
  }

  paintGate(view) {
    for (const side of ['left', 'right']) {
      const gate = view.g[side], s = view.sides[side], good = isGoodGate(gate);
      if (s.good !== good) {
        s.panel.material.map?.dispose();
        s.panel.material.map = gatePanelTexture(good);
        s.panel.material.needsUpdate = true;
        s.barMat.color.setRGB(...(good ? [0.8, 1.9, 3.2] : [3.2, 0.7, 0.7]));
        s.good = good;
      }
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
    const circle = h.shape === 'circle';
    const geo = circle ? new THREE.CircleGeometry(h.r, 40) : new THREE.PlaneGeometry(h.x1 - h.x0, h.d1 - h.d0);
    const tex = hazardTexture(circle ? 'circle' : 'rect');
    if (!circle) tex.repeat.set(1, Math.max(1, (h.d1 - h.d0) / (h.x1 - h.x0)));
    // Drawn over the crowd (no depth test) so a warning is never hidden
    // under the soldiers standing in it.
    const overlay = { transparent: true, depthWrite: false, depthTest: false, toneMapped: false };
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, opacity: 0.8, ...overlay }));
    mesh.renderOrder = 10;
    mesh.rotation.x = -Math.PI / 2;
    if (circle) mesh.position.set(h.x, 0.04, -h.d);
    else mesh.position.set((h.x0 + h.x1) / 2, 0.04, -(h.d0 + h.d1) / 2);
    // Inner fill grows to the edge; the hazard goes off when it gets there.
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.35, 0.15), opacity: 0.45, ...overlay }));
    fill.renderOrder = 11;
    fill.position.z = 0.005;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: new THREE.Color(2.5, 1.2, 0.9), ...overlay }));
    edge.renderOrder = 12;
    mesh.add(fill, edge);
    mesh.userData = { fill, edge, tex };
    this.scene.add(mesh);
    return mesh;
  }

  disposeHazard(m) {
    this.scene.remove(m);
    m.geometry.dispose(); m.material.dispose(); m.userData.tex.dispose();
    m.userData.fill.material.dispose();
    m.userData.edge.geometry.dispose(); m.userData.edge.material.dispose();
  }

  // ---------- boss ----------

  makeBoss() {
    const P = K.bossParts();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x000000 });
    const g = new THREE.Group();
    const mesh = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };
    const pivot = (geo, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); p.add(mesh(geo)); g.add(p); return p; };
    g.add(mesh(P.body));
    const eyes = new THREE.Mesh(P.eyes, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1.4, 0.4), toneMapped: false }));
    g.add(eyes);
    g.userData = {
      mat, eyes,
      armL: pivot(P.arm, -0.62, 1.35, 0), armR: pivot(P.arm, 0.62, 1.35, 0),
      legL: pivot(P.leg, -0.28, 0.62, 0), legR: pivot(P.leg, 0.28, 0.62, 0),
      geos: [P.body, P.arm, P.leg, P.eyes],
    };
    return g;
  }

  disposeBoss() {
    if (!this.bossView) return;
    this.scene.remove(this.bossView);
    const u = this.bossView.userData;
    for (const geo of u.geos) geo.dispose();
    u.mat.dispose(); u.eyes.material.dispose();
    this.bossView = null;
  }

  // ---------- per frame ----------

  draw(sim, dt) {
    this.watchPerf();
    this.time += dt;
    const sq = sim.squad;
    this.drawCamera(sim, dt);
    this.drawWorld(sq);
    this.drawSquad(sim);
    this.drawZombies(sim, dt);
    this.drawBullets(sim);
    this.drawParticles(dt);
    this.drawDecals(sq, dt);
    this.drawBlasts(dt);
    this.drawGates(sim, dt);
    this.drawBoss(sim, dt);
    this.drawHazards(sim);
    if (this.quality === 'high') this.composer.render();
    else this.gl.render(this.scene, this.camera);
  }

  drawCamera(sim, dt) {
    const sq = sim.squad;
    this.lookX += (sq.x * 0.35 - this.lookX) * Math.min(1, dt * 4);
    // Back off for a big squad so the whole crowd stays on screen, and
    // more again in a boss fight so the boss and its attacks fit too.
    const R = squadRadius(sq.soldiers.length);
    const back = (sim.boss && sim.fighting ? 3 : 0) + Math.max(0, R - 1.2) * 2.2;
    this.camBack += (back - this.camBack) * Math.min(1, dt * 2);
    const look = this.v3.set(this.lookX, 0, -(sq.d + 6 + this.camBack * 0.5));
    const cam = this.camera.position;
    cam.set(0, 0.62, 0.78).normalize().multiplyScalar(this.camDist + this.camBack).add(look);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      cam.x += (Math.random() - 0.5) * this.shake; cam.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(look);
    this.sky.position.copy(cam);

    // The sun's shadow box follows the action.
    const tz = -(sq.d + 8);
    this.sun.target.position.set(0, 0, tz);
    this.sun.position.set(-9, 18, tz + 8);
    this.flashLight.intensity *= Math.max(0, 1 - dt * 7);
  }

  drawWorld(sq) {
    const mid = sq.d + ROAD_LEN / 2 - 40;
    for (const m of [this.road, this.ground, ...this.walks]) m.position.z = -mid;
    this.roadTex.offset.y = mid / 12;
    this.walkTex.offset.y = mid / 1.7;
    this.grassTex.offset.y = mid / 8;
    for (const p of this.props) {
      if (p.d >= sq.d - 16) continue;
      const k = p.kind;
      this.placeProp(p, p.d + (k.spacing ? k.spacing * k.n : 150 + Math.random() * 20));
    }
    for (let i = 0; i < this.cloudSpots.length; i++) {
      const c = this.cloudSpots[i];
      if (c.d < sq.d + 80) c.d += 240;
      this.m4.compose(this.v3.set(c.x, c.y, -c.d), this.q.identity(), this.s3.setScalar(c.s));
      this.clouds.setMatrixAt(i, this.m4);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  base(x, y, d, rx, yaw, rz, s) {
    return this.m4.compose(this.v3.set(x, y, -d), this.q.setFromEuler(this.e.set(rx, yaw, rz)), this.s3.setScalar(s));
  }

  drawSquad(sim) {
    const sq = sim.squad, s = sq.soldiers, run = Math.min(1, sq.speed / RUN_SPEED), t = this.time;
    let m = 0;
    for (let i = 0; i < s.length; i++) {
      const so = s[i], ph = t * 13 + so.phase;
      const bob = Math.abs(Math.cos(ph)) * 0.05 * run;
      const recoil = so.shot > 0 ? 0.03 : 0;
      this.soldierRig.set(i, this.base(so.x, bob, so.d - recoil, -0.1 * run, 0, Math.sin(ph) * 0.03 * run, 1),
        { legs: Math.sin(ph) * 0.75 * run + (1 - run) * Math.sin(t * 2 + so.phase) * 0.04 }, null);
      if (so.shot > 0 && m < MAX_SQUAD) {
        this.m4.compose(this.v3.set(so.x + 0.03, bob + 0.61, -(so.d + 0.78)),
          this.q.setFromEuler(this.e.set(Math.random() * 3, 0, Math.random() * 3)), this.s3.set(1, 1, 1).multiplyScalar(0.7 + Math.random() * 0.7));
        this.muzzles.setMatrixAt(m++, this.m4);
      }
    }
    this.soldierRig.finish(s.length);
    this.muzzles.count = m;
    this.muzzles.instanceMatrix.needsUpdate = true;
  }

  drawZombies(sim, dt) {
    const sq = sim.squad, rig = this.zombieRig, tint = this.col;
    const tints = { walker: [1, 1, 1], runner: [1.18, 1.08, 0.7], brute: [0.82, 0.74, 1.0] };
    let n = 0;
    for (const z of sim.zombies) {
      if (n >= MAX_ZOMBIES) break;
      const sw = Math.sin(z.phase);
      // Turn to face the squad (models look down -z, the squad is at +z).
      const yaw = Math.atan2(-(sq.x - z.x) * 0.6, -(z.d - sq.d));
      const awake = z.awake ? 1 : 0;
      rig.set(n, this.base(z.x, awake * Math.abs(sw) * 0.04 * z.scale, z.d, -0.12 * awake, yaw, sw * 0.08, z.scale), {
        legs: awake ? sw * 0.55 : 0,
        armL: awake ? -0.05 + Math.sin(z.phase * 0.5) * 0.18 : -1.25 + sw * 0.05,
        armR: awake ? 0.05 - Math.sin(z.phase * 0.5 + 1) * 0.18 : -1.3 - sw * 0.05,
      }, tint.setRGB(...tints[z.kind]).multiplyScalar(z.flash > 0 ? 2.6 : 1));
      n++;
    }
    // Corpses topple backwards, lie still for a moment, then sink away.
    const keep = [];
    for (const c of this.corpses) {
      c.t += dt;
      if (c.t > 2.4 || c.d < sq.d - 12) continue;
      keep.push(c);
      if (n >= MAX_ZOMBIES + MAX_CORPSES) continue;
      if (c.yaw === null) c.yaw = Math.atan2(-(sq.x - c.x) * 0.6, -(c.d - sq.d)) + (Math.random() - 0.5) * 0.6;
      const k = Math.min(1, c.t / 0.38), fall = c.fall * (1 - (1 - k) * (1 - k));
      const sink = c.t > 1.7 ? (c.t - 1.7) * 0.6 * c.scale : 0;
      rig.set(n++, this.base(c.x, 0.05 * c.scale * Math.sin(k * Math.PI) - sink, c.d + fall * 0.25 * c.scale, fall, c.yaw, 0, c.scale),
        { legs: 0.15 * k, armL: 0.6 * k, armR: 0.3 * k }, tint.setRGB(...tints[c.kind]).multiplyScalar(0.85));
    }
    this.corpses = keep;
    rig.finish(n);
  }

  drawBullets(sim) {
    let n = 0;
    for (const b of sim.bullets) {
      if (n >= MAX_BULLETS) break;
      this.m4.compose(this.v3.set(b.x, 0.6, -b.d), this.q.setFromEuler(this.e.set(0, Math.atan2(-b.vx, BULLET_SPEED), 0)), this.s3.set(1, 1, 1));
      this.tracers.setMatrixAt(n++, this.m4);
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  drawParticles(dt) {
    let n = 0;
    const keep = [];
    for (const p of this.bitList) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 16 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.04) { p.y = 0.04; p.vy *= -0.2; p.vx *= 0.5; p.vz *= 0.5; }
      this.m4.compose(this.v3.set(p.x, p.y, p.z), this.q.identity(), this.s3.setScalar(p.s * Math.min(1, p.life * 4)));
      this.bits.setMatrixAt(n, this.m4);
      this.bits.setColorAt(n, this.col.set(p.color));
      n++;
      keep.push(p);
    }
    this.bitList = keep;
    this.bits.count = n;
    this.bits.instanceMatrix.needsUpdate = true;
    if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;

    n = 0;
    const live = [];
    for (const p of this.sparkList) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 9 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.min(1, p.life / 0.3);
      this.m4.compose(this.v3.set(p.x, Math.max(0.03, p.y), p.z), this.q.identity(), this.s3.setScalar(p.s * k));
      this.sparks.setMatrixAt(n, this.m4);
      this.sparks.setColorAt(n, this.col.copy(p.color).multiplyScalar(2.5 * k));
      n++;
      live.push(p);
    }
    this.sparkList = live;
    this.sparks.count = n;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }

  drawDecals(sq, dt) {
    let dirty = false;
    for (let i = 0; i < this.decalList.length; i++) {
      const c = this.decalList[i];
      if (!c) continue;
      if (c.d < sq.d - 14) {
        this.decals.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
        this.decalList[i] = null;
        dirty = true;
        continue;
      }
      if (c.age > 0.25) continue;
      c.age += dt;
      const k = Math.min(1, c.age / 0.25), s = c.size * (0.35 + 0.65 * (1 - (1 - k) ** 3));
      this.m4.compose(this.v3.set(c.x, 0.015, -c.d), this.q.setFromEuler(this.e.set(0, c.rot, 0)), this.s3.set(s * c.sx, 1, s));
      this.decals.setMatrixAt(i, this.m4);
      dirty = true;
    }
    if (dirty) this.decals.instanceMatrix.needsUpdate = true;
  }

  drawBlasts(dt) {
    for (const b of this.blasts) {
      if (b.t >= b.dur) continue;
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      if (k >= 1) { b.ball.visible = b.ring.visible = false; continue; }
      const grow = 1 - (1 - k) ** 3;
      b.ball.position.set(b.x, b.r * 0.5 * grow, -b.d);
      b.ball.scale.set(1, 0.75, 1).multiplyScalar(b.r * (0.35 + 0.75 * grow));
      b.ball.material.opacity = (1 - k) ** 1.5;
      if (b.withRing) {
        b.ring.position.set(b.x, 0.06, -b.d);
        b.ring.scale.setScalar(b.r * (0.4 + 1.8 * grow));
        b.ring.material.opacity = 1 - k;
      }
    }
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
      for (const side of ['left', 'right']) {
        const map = v.sides[side].panel.material.map;
        if (map) map.offset.x = (this.time * 0.25) % 1;
      }
      if (!live.has(id) || v.chosen) {
        v.fade -= dt * 2.5;
        if (v.chosen) v.sides[v.chosen].label.scale.setScalar(1 + (1 - v.fade) * 0.7);
        for (const side of ['left', 'right']) {
          v.sides[side].panel.material.opacity = 0.72 * Math.max(0, v.fade);
          v.sides[side].label.material.opacity = Math.max(0, v.fade);
        }
        if (v.fade <= 0) { this.disposeGate(v); this.gateViews.delete(id); }
      } else {
        for (const side of ['left', 'right']) v.sides[side].label.scale.setScalar(1 + v.pulse * 1.2 + Math.sin(this.time * 4) * 0.02);
      }
    }
  }

  drawBoss(sim, dt) {
    const b = sim.boss;
    if (!b) { this.disposeBoss(); return; }
    if (!this.bossView) { this.bossView = this.makeBoss(); this.scene.add(this.bossView); }
    const v = this.bossView, u = v.userData, s = b.stats.size, t = this.time;
    const walk = sim.fighting ? t * 3.2 : t * 1.4;
    const lunge = b.lunge > 0 ? Math.sin((b.lunge / 0.45) * Math.PI) * 2.5 : 0;
    v.position.set(b.x, Math.abs(Math.sin(walk)) * 0.06 * s, -(b.d - lunge));
    v.rotation.set(-0.05, Math.PI, Math.sin(walk) * 0.05);
    v.scale.setScalar(s);
    const swing = sim.fighting ? 0.35 : 0.12;
    u.legL.rotation.x = Math.sin(walk) * swing;
    u.legR.rotation.x = -Math.sin(walk) * swing;
    u.armL.rotation.x = -Math.sin(walk) * swing * 0.8 + (b.lunge > 0 ? 1.2 : 0);
    u.armR.rotation.x = Math.sin(walk) * swing * 0.8 + (b.lunge > 0 ? 1.2 : 0);
    // Under constant fire the hit flash would never turn off; blink instead.
    const lit = b.flash > 0 && Math.floor(t * 12) % 2 === 0 ? 0.25 : 0;
    u.mat.emissive.setRGB(lit, lit, lit);
    u.eyes.material.color.setRGB(5 + Math.sin(t * 6) * 1.5, 1.2, 0.4);
    if (b.flash > 0 && Math.random() < 0.35) {
      this.addBits(b.x + (Math.random() - 0.5) * s, 1.1 * s, b.d - b.r * 0.6, 1, 0x7a3f96, { speed: 1.5, up: 1.5, size: 1.4, dir: 1, life: 0.6 });
    }
  }

  drawHazards(sim) {
    const live = new Set(sim.hazards);
    for (const h of sim.hazards) {
      let m = this.hazardViews.get(h);
      if (!m) { m = this.makeHazard(h); this.hazardViews.set(h, m); }
      const k = Math.min(1, h.t / h.delay);
      m.userData.fill.scale.setScalar(Math.max(0.01, k));
      m.material.opacity = 0.6 + 0.35 * Math.abs(Math.sin(this.time * (8 + 10 * k)));
      if (h.shape !== 'circle') m.userData.tex.offset.y = -this.time * 1.5;
    }
    for (const [h, m] of this.hazardViews) {
      if (live.has(h)) continue;
      this.disposeHazard(m);
      this.hazardViews.delete(h);
    }
  }

  // World point to CSS pixels, for HUD labels.
  project(x, y, d) {
    const v = new THREE.Vector3(x, y, -d).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, visible: v.z < 1 };
  }
}
