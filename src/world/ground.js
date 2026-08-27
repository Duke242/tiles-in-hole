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
      return vec3(0.22,0.62,0.20);
    }

    bool rx = f.x < RW;
    bool rz = f.y < RW;

    if (rx || rz) {
      vec3 road = vec3(0.145,0.152,0.170);
      if (rx && rz) return road;                       // intersection stays clean

      if (rz) {                                        // east-west road
        float edge = min(f.y, RW - f.y);
        float ix   = min(f.x - RW, P - f.x);           // distance to intersection
        if (ix < 7.0) {                                // crosswalk bars
          if (edge > 0.9 && mod(f.y - 0.6, 2.15) < 1.25) return vec3(0.95);
        } else if (abs(f.y - RW * 0.5) < 0.36 && mod(w.x, 8.0) < 4.2) {
          return vec3(0.95);                           // white centre dashes
        }
        return road;
      }
      float edge = min(f.x, RW - f.x);                 // north-south road
      float iz   = min(f.y - RW, P - f.y);
      if (iz < 7.0) {
        if (edge > 0.9 && mod(f.x - 0.6, 2.15) < 1.25) return vec3(0.95);
      } else if (abs(f.x - RW * 0.5) < 0.36 && mod(w.y, 8.0) < 4.2) {
        return vec3(0.95);
      }
      return road;
    }

    // Wide pale pavement ringing every block, lightly tiled.
    float inx = min(f.x - RW, P - f.x);
    float inz = min(f.y - RW, P - f.y);
    float edge = min(inx, inz);
    if (edge < 4.2) {
      vec3 pave = vec3(0.855,0.845,0.815);
      if (mod(w.x, 3.6) < 0.16 || mod(w.y, 3.6) < 0.16) pave *= 0.945;
      if (edge < 0.5) pave *= 0.86;                    // kerb
      return pave;
    }

    vec4 dd = texture2D(uDistrict, (bi + 0.5) / N);
    vec3 base = dd.rgb;

    if (dd.a > 0.5) {                                  // park paths
      float px = abs(f.x - P * 0.5), pz = abs(f.y - P * 0.5);
      if (min(px, pz) < 2.8) return vec3(0.82,0.76,0.60);
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
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055,0.042,0.035), pow(sink, 0.33));
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
  const geo = new THREE.RingGeometry(1, FUNNEL_OUT, 128, 14);
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
