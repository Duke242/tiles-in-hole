import * as THREE from 'three';

const GEO = new THREE.BoxGeometry(1, 1, 1);

// A low camera means buildings get between you and the hole. Rather than
// raising the camera, fragments inside a cone along the view ray are
// dissolved with an ordered dither, so occluders turn to lace and the hole
// stays visible.
export const occlusion = {
  uCamPos: { value: new THREE.Vector3() },
  uFocus: { value: new THREE.Vector3() },
  uTunnel: { value: 0 },
};

function patchOcclusion(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCamPos = occlusion.uCamPos;
    shader.uniforms.uFocus = occlusion.uFocus;
    shader.uniforms.uTunnel = occlusion.uTunnel;
    shader.vertexShader = 'varying vec3 vOccPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vOccPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = `
      varying vec3 vOccPos;
      uniform vec3 uCamPos;
      uniform vec3 uFocus;
      uniform float uTunnel;
      float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    ` + shader.fragmentShader.replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      if (uTunnel > 0.0) {
        vec3 av = uFocus - uCamPos;
        float t = clamp(dot(vOccPos - uCamPos, av) / max(0.0001, dot(av, av)), 0.0, 1.0);
        float dperp = distance(vOccPos, uCamPos + av * t);
        float radius = uTunnel * mix(0.75, 0.3, t);
        if (t > 0.02 && t < 0.97 && dperp < radius) {
          float a = smoothstep(radius * 0.72, radius, dperp);
          float dith = bayer2(0.5 * gl_FragCoord.xy) * 0.25 + bayer2(gl_FragCoord.xy);
          if (a < dith) discard;
        }
      }
    `);
  };
  mat.customProgramCacheKey = () => 'occludeField';
  return mat;
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _obj = new THREE.Object3D();
const _m = new THREE.Matrix4();
const _leg = new THREE.Matrix4();
const _col = new THREE.Color();

// A pool of instanced boxes. Objects claim a run of instances ("parts") and
// are drawn by writing one transform per part each time they move.
export class Field {
  constructor(scene, capacity, { cast = true, receive = true, dynamic = false, occlude = false } = {}) {
    let mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    if (occlude) mat = patchOcclusion(mat);
    this.mesh = new THREE.InstancedMesh(GEO, mat, capacity);
    if (dynamic) this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = cast;
    this.mesh.receiveShadow = receive;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, _col.set(0xffffff));
    scene.add(this.mesh);
    this.capacity = capacity;
    this.used = 0;
    this.dirty = true;
    // Uploading the whole instance buffer every frame costs megabytes of
    // bandwidth. Track which instances actually moved and upload only those.
    this.ranges = [];
    this.fullUpload = true;
  }

  // parts: [{x,y,z,sx,sy,sz,color,leg?}] in model space
  alloc(parts) {
    const base = this.used;
    if (base + parts.length > this.capacity) {
      console.warn('Field capacity exceeded');
      return null;
    }
    const locals = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      locals.push({
        m: new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Quaternion(),
          new THREE.Vector3(p.sx, p.sy, p.sz)),
        leg: p.leg || 0,
      });
      this.mesh.setColorAt(base + i, _col.set(p.color));
    }
    this.used += parts.length;
    this.mesh.count = this.used;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return { base, locals };
  }

  write(ref, x, y, z, yaw = 0, scale = 1, pitch = 0, roll = 0, legSwing = 0) {
    _obj.position.set(x, y, z);
    _obj.rotation.set(pitch, yaw, roll);
    _obj.scale.setScalar(scale);
    _obj.updateMatrix();
    for (let i = 0; i < ref.locals.length; i++) {
      if (ref.hidden && ref.hidden.has(i)) continue;
      const l = ref.locals[i];
      if (l.leg && legSwing) {
        _leg.makeTranslation(0, 0, legSwing * l.leg);
        _m.multiplyMatrices(_obj.matrix, _leg).multiply(l.m);
      } else {
        _m.multiplyMatrices(_obj.matrix, l.m);
      }
      this.mesh.setMatrixAt(ref.base + i, _m);
    }
    this.touch(ref.base, ref.locals.length);
  }

  touch(start, count) {
    this.dirty = true;
    if (this.fullUpload) return;
    if (this.ranges.length > 96) { this.fullUpload = true; this.ranges.length = 0; return; }
    this.ranges.push(start, count);
  }

  hidePart(ref, i) {
    if (!ref.hidden) ref.hidden = new Set();
    ref.hidden.add(i);
    this.mesh.setMatrixAt(ref.base + i, ZERO);
    this.touch(ref.base + i, 1);
  }

  hide(ref) {
    for (let i = 0; i < ref.locals.length; i++) this.mesh.setMatrixAt(ref.base + i, ZERO);
    this.touch(ref.base, ref.locals.length);
  }

  flush() {
    if (!this.dirty) return;
    const attr = this.mesh.instanceMatrix;
    attr.clearUpdateRanges();
    if (!this.fullUpload) {
      for (let i = 0; i < this.ranges.length; i += 2) {
        attr.addUpdateRange(this.ranges[i] * 16, this.ranges[i + 1] * 16);
      }
    }
    attr.needsUpdate = true;
    this.ranges.length = 0;
    this.fullUpload = false;      // after the initial build, go incremental
    this.dirty = false;
  }
}
