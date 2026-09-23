import * as THREE from 'three';

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const mobile = Math.min(innerWidth, innerHeight) < 700;
  renderer.setPixelRatio(Math.min(mobile ? 2 : 2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1600);

  // --- sky dome -----------------------------------------------------------
  const skyUniforms = {
    top: { value: new THREE.Color('#3d9be6') },
    horizon: { value: new THREE.Color('#c6ebfb') },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: skyUniforms,
      vertexShader: `varying float vH;
        void main(){ vH = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vH; uniform vec3 top; uniform vec3 horizon;
        void main(){
          float t = smoothstep(-0.02, 0.5, vH);
          gl_FragColor = vec4(mix(horizon, top, t), 1.0);
        }`,
    }));
  sky.frustumCulled = false;
  scene.add(sky);

  // --- lights -------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xe4f3ff, 0x7fb86a, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.16));

  const sun = new THREE.DirectionalLight(0xfff6e6, 1.55);
  sun.position.set(140, 260, 110);
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.camera.near = 40;
  sun.shadow.camera.far = 900;
  const sm = mobile ? 1536 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);

  // The shadow frustum covers a level board whole. A board bigger than the
  // cap (free play) gets a frustum that rides along with the hole instead.
  const SHADOW_HALF_MAX = 110;
  let follow = false;
  function setSunAt(x, z) {
    sun.position.set(x + 140, 260, z + 110);
    sun.target.position.set(x, 0, z);
  }
  function setBoard(w, d) {
    const need = Math.max(w, d) * 0.72 + 20;
    const half = Math.min(SHADOW_HALF_MAX, need);
    follow = need > half;
    sun.shadow.camera.left = -half;
    sun.shadow.camera.right = half;
    sun.shadow.camera.top = half;
    sun.shadow.camera.bottom = -half;
    sun.shadow.camera.updateProjectionMatrix();
    if (!follow) setSunAt(0, 0);
  }
  function followSun(x, z) { if (follow) setSunAt(x, z); }
  setBoard(60, 80);

  function setSky([top, horizon]) {
    skyUniforms.top.value.set(top);
    skyUniforms.horizon.value.set(horizon);
  }

  // --- voxel clouds -------------------------------------------------------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  const PUFFS = 6, CLUSTERS = 22;
  const clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cloudMat, CLUSTERS * PUFFS);
  clouds.frustumCulled = false;
  const cloudData = [];
  const d = new THREE.Object3D();
  let ci = 0;
  for (let c = 0; c < CLUSTERS; c++) {
    const cx = Math.random() * 1400 - 700, cz = Math.random() * 1400 - 700;
    const cy = 120 + Math.random() * 80, s = 0.6 + Math.random() * 1.2, drift = 1 + Math.random() * 2;
    for (let p = 0; p < PUFFS; p++) {
      cloudData.push({
        i: ci++, cx, cz, cy, drift,
        ox: (Math.random() - 0.5) * 36 * s, oy: (Math.random() - 0.5) * 7 * s, oz: (Math.random() - 0.5) * 26 * s,
        w: (10 + Math.random() * 16) * s, h: (5 + Math.random() * 7) * s, dp: (9 + Math.random() * 12) * s,
      });
    }
  }
  scene.add(clouds);

  function updateClouds(t) {
    for (const c of cloudData) {
      let x = c.cx + c.ox + t * c.drift;
      x = ((x + 700) % 1400 + 1400) % 1400 - 700;
      d.position.set(x, c.cy + c.oy, c.cz + c.oz);
      d.scale.set(c.w, c.h, c.dp);
      d.updateMatrix();
      clouds.setMatrixAt(c.i, d.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 1 ? 58 : 44;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, sun, sky, setSky, setBoard, followSun, updateClouds, resize, mobile };
}
