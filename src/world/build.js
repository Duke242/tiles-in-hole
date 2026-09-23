import * as THREE from 'three';
import { BEAD } from './voxel.js';

// Puts a generated level on the board: tiles become sleeping rigid bodies,
// voxel props claim instanced voxels and are written once at rest.
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export function buildWorld(level, fields, rigid) {
  fields.cube.reset();
  fields.bead.reset();
  rigid.reset();
  rigid.bound = Math.max(level.board.w, level.board.d) / 2 + 12;
  for (const t of level.tiles) rigid.spawnTile(t.x, t.y, t.z, t.kind, t.type, { yaw: t.yaw, scale: t.scale, tall: t.tall });
  for (const o of level.props) {
    const cubes = [], beads = [];
    for (const v of o.model.vox) {
      const arr = v.s === BEAD ? beads : cubes;
      v.fi = v.s === BEAD ? 1 : 0;
      v.li = arr.length;
      arr.push({ x: v.x, y: v.y + 0.5, z: v.z, r: v.r, g: v.g, b: v.b });
    }
    o.refs = [cubes.length ? fields.cube.alloc(cubes) : null, beads.length ? fields.bead.alloc(beads) : null];
    o.state = 'idle';
    o.shake = 0;
    o.peeled = 0;
    _q.setFromAxisAngle(UP, o.yaw);
    writeObject(o, fields, o.x, 0, o.z, _q);
  }
  fields.cube.flush();
  fields.bead.flush();
}

export function writeObject(o, fields, x, y, z, q) {
  if (o.refs[0]) fields.cube.write(o.refs[0], x, y, z, q);
  if (o.refs[1]) fields.bead.write(o.refs[1], x, y, z, q);
}

export function hideVoxel(o, fields, v) {
  const f = v.fi ? fields.bead : fields.cube;
  f.hidePart(o.refs[v.fi], v.li);
}
