import * as THREE from 'three';

// The one look every voxel shares: glossy plastic with a rounded bevel. The
// bevel is faked in the fragment shader by bending the normal toward the
// nearest face edge, so each cube reads as a separate rounded tile with a
// highlight running along its edges, without any extra geometry.
export const VOX_SCALE = 0.92;   // gap between neighbours so tiles stay distinct

export function makeVoxelMaterial({ bead = false } = {}) {
  const mat = new THREE.MeshPhongMaterial({
    color: 0xffffff, shininess: bead ? 55 : 34, specular: new THREE.Color(bead ? 0x555555 : 0x404040),
  });
  if (bead) return mat;

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal; varying vec3 vAxX; varying vec3 vAxY; varying vec3 vAxZ;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vLocal = position;
        #ifdef USE_INSTANCING
          mat3 bevelM = normalMatrix * mat3(instanceMatrix);
        #else
          mat3 bevelM = normalMatrix;
        #endif
        vAxX = normalize(bevelM[0]); vAxY = normalize(bevelM[1]); vAxZ = normalize(bevelM[2]);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal; varying vec3 vAxX; varying vec3 vAxY; varying vec3 vAxZ;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 p = vLocal * 2.0;                       // -1..1 across the cube
          vec3 ap = abs(p);
          vec3 faceMask = step(vec3(0.995), ap);       // 1 on the axis this face points along
          vec3 inPlane = p * (1.0 - faceMask);
          vec3 edgeDist = (1.0 - abs(inPlane)) + faceMask * 10.0;
          float e = min(edgeDist.x, min(edgeDist.y, edgeDist.z));
          float t = 1.0 - smoothstep(0.0, 0.26, e);
          vec3 pick = step(edgeDist, vec3(e + 1e-4)) * (1.0 - faceMask);
          vec3 push = sign(inPlane) * pick;
          vec3 pushView = vAxX * push.x + vAxY * push.y + vAxZ * push.z;
          normal = normalize(normal + pushView * t * 1.1);
          diffuseColor.rgb *= 1.0 - t * 0.10;
        }`);
  };
  mat.customProgramCacheKey = () => 'voxelBevel';
  return mat;
}
