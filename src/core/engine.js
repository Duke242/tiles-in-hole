import * as THREE from 'three';
import { CITY } from '../game/tune.js';

const SKY_TOP = 0x3f9fe0;
const SKY_HORIZON = 0xbfe9fa;

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance',
  });
  const mobile = Math.min(innerWidth, innerHeight) < 700;
  renderer.setPixelRatio(Math.min(mobile ? 1.75 : 2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_HORIZON, 420, 950);

  const camera = new THREE.PerspectiveCamera(44, 1, 0.5, 2600);

  // --- sky dome -----------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(SKY_TOP) },
        horizon: { value: new THREE.Color(SKY_HORIZON) },
      },
      vertexShader: `varying float vH;
        void main(){ vH = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vH; uniform vec3 top; uniform vec3 horizon;
        void main(){
          float t = smoothstep(-0.05, 0.55, vH);
          gl_FragColor = vec4(mix(horizon, top, t), 1.0);
        }`,
    }));
  sky.frustumCulled = false;
  scene.add(sky);

  // --- lights -------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x74a85c, 0.34));
  scene.add(new THREE.AmbientLight(0xffffff, 0.07));

  const sun = new THREE.DirectionalLight(0xfff6e2, 1.28);
  const mid = CITY.SPAN / 2;
  sun.position.set(mid + 260, 430, mid - 190);
  sun.target.position.set(mid, 0, mid);
  scene.add(sun.target);
  sun.castShadow = true;
  const half = CITY.SPAN * 0.72;
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 40;
  sun.shadow.camera.far = 1100;
  const sm = mobile ? 1536 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.9;
  scene.add(sun);

  // --- voxel clouds -------------------------------------------------------
  const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, transparent: true, opacity: 0.94, fog: true,
  });
  const PUFFS = 7, CLUSTERS = 34;
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, CLUSTERS * PUFFS);
  clouds.frustumCulled = false;
  const cloudData = [];
  const d = new THREE.Object3D();
  let ci = 0;
  for (let c = 0; c < CLUSTERS; c++) {
    const cx = Math.random() * 2200 - 1100 + CITY.SPAN / 2;
    const cz = Math.random() * 2200 - 1100 + CITY.SPAN / 2;
    const cy = 150 + Math.random() * 120;
    const s = 0.7 + Math.random() * 1.5;
    const drift = 1.4 + Math.random() * 2.2;
    for (let p = 0; p < PUFFS; p++) {
      cloudData.push({
        i: ci++, cx, cz, cy, drift,
        ox: (Math.random() - 0.5) * 46 * s,
        oy: (Math.random() - 0.5) * 9 * s,
        oz: (Math.random() - 0.5) * 34 * s,
        w: (14 + Math.random() * 20) * s,
        h: (7 + Math.random() * 9) * s,
        dp: (12 + Math.random() * 16) * s,
      });
    }
  }
  scene.add(clouds);

  function updateClouds(t) {
    for (const c of cloudData) {
      let x = c.cx + c.ox + t * c.drift;
      const span = 2600;
      x = ((x + 1300 - CITY.SPAN / 2) % span + span) % span - 1300 + CITY.SPAN / 2;
      d.position.set(x, c.cy + c.oy, c.cz + c.oz);
      d.rotation.set(0, 0, 0);
      d.scale.set(c.w, c.h, c.dp);
      d.updateMatrix();
      clouds.setMatrixAt(c.i, d.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, sun, sky, updateClouds, resize, mobile };
}
