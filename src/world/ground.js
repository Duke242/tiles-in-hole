import * as THREE from 'three';
import { CITY, FUNNEL_OUT, FUNNEL_DEPTH } from '../game/tune.js';

// Procedural city surface, evaluated per fragment from world position so the
// flat ground and the crater funnel share exactly one definition. The block
// palette comes from a tiny data texture (one texel per city block).
const CITY_GLSL = /* glsl */`
  uniform sampler2D uDistrict;
  uniform vec2 uHole;
  uniform float uCut;
  uniform float uPitDepth;

  vec3 cityColor(vec2 w){
    float P  = ${CITY.P.toFixed(1)};
    float RW = ${CITY.RW.toFixed(1)};
    float N  = ${CITY.N.toFixed(1)};

    vec2 bi = floor(w / P);
    vec2 f  = w - bi * P;

    if (bi.x < 0.0 || bi.y < 0.0 || bi.x >= N || bi.y >= N) {
      vec2 c = floor(w / 5.0);
      float k = mod(c.x + c.y, 2.0) < 1.0 ? 0.0 : 1.0;
      return mix(vec3(0.33,0.58,0.26), vec3(0.36,0.62,0.28), k);
    }

    bool rx = f.x < RW;   // road running along z
    bool rz = f.y < RW;   // road running along x

    if (rx || rz) {
      vec3 road = vec3(0.175,0.185,0.215);
      vec2 g = floor(w / 1.6);
      road += (mod(g.x * 7.0 + g.y * 3.0, 5.0) / 5.0 - 0.5) * 0.012;

      if (rx && rz) {                       // intersection: keep it clean
        return road;
      }
      if (rz) {                             // east-west road
        if (abs(f.y - RW * 0.5) < 0.42 && mod(w.x, 7.0) < 3.6) return vec3(0.93,0.90,0.62);
        float edge = min(f.y, RW - f.y);
        float ix = min(f.x - RW, P - f.x);  // distance to nearest intersection
        if (ix < 5.0 && edge > 1.2 && mod(f.y, 2.4) < 1.45) return vec3(0.92);
        if (edge < 0.9) return vec3(0.62,0.63,0.66);
        return road;
      }
      if (abs(f.x - RW * 0.5) < 0.42 && mod(w.y, 7.0) < 3.6) return vec3(0.93,0.90,0.62);
      float edge = min(f.x, RW - f.x);
      float iz = min(f.y - RW, P - f.y);
      if (iz < 5.0 && edge > 1.2 && mod(f.x, 2.4) < 1.45) return vec3(0.92);
      if (edge < 0.9) return vec3(0.55,0.56,0.60);
      return road;
    }

    // Block interior: sidewalk ring, then the district's own surface.
    float inx = min(f.x - RW, P - f.x);
    float inz = min(f.y - RW, P - f.y);
    float edge = min(inx, inz);
    if (edge < 2.1) return vec3(0.76,0.77,0.80) + (mod(floor(w.x/3.0)+floor(w.y/3.0),2.0)<1.0 ? 0.0 : 0.02);
    if (edge < 2.5) return vec3(0.66,0.67,0.70);

    vec4 dd = texture2D(uDistrict, (bi + 0.5) / N);
    vec3 base = dd.rgb;
    vec2 c = floor(w / 3.0);
    float checker = mod(c.x + c.y, 2.0) < 1.0 ? 0.0 : 1.0;
    base *= mix(0.955, 1.045, checker);

    // Park blocks (flagged in alpha) get a light path crossing them.
    if (dd.a > 0.5) {
      float px = abs(f.x - P * 0.5), pz = abs(f.y - P * 0.5);
      if (min(px, pz) < 2.6) return vec3(0.78,0.72,0.58);
    }
    return base;
  }
`;

function patchMaterial(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;'
    );
    shader.fragmentShader = 'varying vec3 vWPos;\n' + CITY_GLSL + shader.fragmentShader
      .replace('#include <map_fragment>', `
        if (uCut > 0.0 && distance(vWPos.xz, uHole) < uCut) discard;
        diffuseColor.rgb = cityColor(vWPos.xz);
        if (uPitDepth > 0.0) {
          float sink = clamp(-vWPos.y / uPitDepth, 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 0.3, pow(sink, 1.35));
        }
      `);
  };
  mat.customProgramCacheKey = () => 'cityGround';
  return mat;
}

// The crater: a ring whose vertices are pre-displaced into a funnel, so the
// whole thing scales with the hole radius and the road texture stretches
// down into the pit.
function funnelGeometry() {
  const geo = new THREE.RingGeometry(1, FUNNEL_OUT, 128, 26);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z);
    const t = Math.min(1, Math.max(0, (d - 1) / (FUNNEL_OUT - 1)));
    const k = 1 - t;
    pos.setY(i, -FUNNEL_DEPTH * k * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function createGround(scene, districtTexture) {
  const uniforms = {
    uDistrict: { value: districtTexture },
    uHole: { value: new THREE.Vector2(0, 0) },
    uCut: { value: 0 },
    uPitDepth: { value: 0 },
  };

  const flatMat = patchMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff }), {
    uDistrict: uniforms.uDistrict, uHole: uniforms.uHole, uCut: uniforms.uCut,
    uPitDepth: { value: 0 },
  });
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), flatMat);
  flat.position.set(CITY.SPAN / 2, 0, CITY.SPAN / 2);
  flat.receiveShadow = true;
  flat.frustumCulled = false;
  scene.add(flat);

  const funnelUniforms = {
    uDistrict: uniforms.uDistrict,
    uHole: { value: new THREE.Vector2(0, 0) },
    uCut: { value: 0 },   // the ring's inner edge is the hole; nothing to cut
    uPitDepth: { value: 1 },
  };
  const funnelMat = patchMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff }), funnelUniforms);
  const funnel = new THREE.Mesh(funnelGeometry(), funnelMat);
  funnel.receiveShadow = true;
  funnel.frustumCulled = false;
  scene.add(funnel);

  function setHole(x, z, r) {
    uniforms.uHole.value.set(x, z);
    uniforms.uCut.value = r * (FUNNEL_OUT - 0.05);
    funnelUniforms.uPitDepth.value = FUNNEL_DEPTH * r;
    funnel.position.set(x, 0, z);
    funnel.scale.setScalar(r);
  }

  return { flat, funnel, setHole };
}

// One texel per block: rgb = ground colour, a = 1 for park blocks (draws paths).
export function districtTexture(blocks) {
  const n = CITY.N;
  const data = new Uint8Array(n * n * 4);
  const c = new THREE.Color();
  for (let i = 0; i < n * n; i++) {
    c.set(blocks[i].ground);
    data[i * 4 + 0] = Math.round(c.r * 255);
    data[i * 4 + 1] = Math.round(c.g * 255);
    data[i * 4 + 2] = Math.round(c.b * 255);
    data[i * 4 + 3] = blocks[i].kind === 'park' ? 255 : 0;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
