import * as THREE from 'three';

// The board: a lighter rounded plate on the theme ground, sprinkled with
// dots, cut open where the hole is so the shaft shows through.
export function createGround(scene) {
  const uniforms = {
    uHole: { value: new THREE.Vector2(0, 0) },
    uCut: { value: 0 },
    uGround: { value: new THREE.Color('#58b334') },
    uPlate: { value: new THREE.Color('#8ad64c') },
    uDot: { value: new THREE.Color('#7cc843') },
    uBoard: { value: new THREE.Vector2(20, 26) },
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = `
      varying vec3 vWPos;
      uniform vec2 uHole; uniform float uCut; uniform vec3 uGround; uniform vec3 uPlate; uniform vec3 uDot; uniform vec2 uBoard;
      float gh(vec2 p){ return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }
    ` + shader.fragmentShader.replace('#include <map_fragment>', `
      if (uCut > 0.0 && distance(vWPos.xz, uHole) < uCut) discard;
      float rad = 3.0;
      vec2 q = abs(vWPos.xz) - (uBoard - rad);
      float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
      float inside = 1.0 - smoothstep(-0.15, 0.15, sd);
      vec3 col = mix(uGround, uPlate, inside);
      col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.9, sd)) * step(0.0, sd);   // soft shadow off the plate edge
      vec2 cell = vWPos.xz / 1.3;
      float dotMask = step(0.91, gh(cell)) * step(length(fract(cell) - 0.5), 0.17);
      col = mix(col, uDot, dotMask * 0.9);
      diffuseColor.rgb = col;
    `);
  };
  mat.customProgramCacheKey = () => 'boardGround';

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), mat);
  plane.receiveShadow = true;
  plane.frustumCulled = false;
  scene.add(plane);

  return {
    setHole(x, z, r) { uniforms.uHole.value.set(x, z); uniforms.uCut.value = r; },
    setTheme(theme) {
      uniforms.uGround.value.set(theme.ground);
      uniforms.uPlate.value.set(theme.plate || theme.ground);
      uniforms.uDot.value.set(theme.groundDot);
    },
    setBoard(w, d) { uniforms.uBoard.value.set(w / 2 + 2, d / 2 + 2); },
  };
}
