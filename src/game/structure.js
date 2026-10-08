// Authored voxel models are bonded structures, not piles of loose cubes.
// Intact bonds transmit support from the lowest course to overhangs. Detached
// sections retain their internal bonds as Rapier joints until an impact breaks
// them. This is a game support model, not a material-stress simulation.
//
// Support has a reach: vertical bonds carry load for free, every sideways
// step is one block of overhang. A block keeps standing while its shortest
// support path is at most SLACK blocks longer than it was as built, so a
// designed overhang (a ferris rim, a balcony) holds, but a big building with
// a wide bite eaten out of its base drops the columns over the gap instead of
// hanging the whole facade off one far corner.
export const SLACK = 5;

export class Structure {
  constructor(blocks) {
    this.blocks = new Set(blocks);
    const index = new Map();
    const floor = Math.min(...blocks.map(b => b.local.y));
    for (const b of blocks) {
      b.structure = this; b.attached = true; b.bonds = new Set();
      b.foundation = b.local.y === floor;
      b.limit = Infinity;
      index.set(`${b.local.x},${b.local.y},${b.local.z}`, b);
    }
    for (const b of blocks) {
      for (const [x,y,z] of [[1,0,0],[0,1,0],[0,0,1]]) {
        const other = index.get(`${b.local.x+x},${b.local.y+y},${b.local.z+z}`);
        if (other) this.bond(b, other);
      }
    }
    // Sparse details (swing chains, stems, spokes) can have gaps in the voxel
    // artwork. Give each disconnected detail an explicit connection to the
    // nearest supported section, without changing the visible model.
    const supported = new Set(this.reach().keys());
    const unvisited = new Set(blocks.filter(b => !supported.has(b)));
    while (unvisited.size) {
      const component = [unvisited.values().next().value];
      unvisited.delete(component[0]);
      for (let i=0;i<component.length;i++) for (const bond of component[i].bonds) {
        const other = bond.a === component[i] ? bond.b : bond.a;
        if (unvisited.delete(other)) component.push(other);
      }
      let bestA, bestB, distance = Infinity;
      for (const a of component) for (const b of supported) {
        const d = (a.local.x-b.local.x)**2+(a.local.y-b.local.y)**2+(a.local.z-b.local.z)**2;
        if (d<distance) {distance=d; bestA=a; bestB=b;}
      }
      if (bestA) this.bond(bestA,bestB);
      for (const b of component) supported.add(b);
    }
    const built = this.reach();
    for (const b of blocks) b.limit = (built.get(b) ?? 0) + SLACK;
  }

  bond(a,b) {
    const cost = a.local.x===b.local.x && a.local.z===b.local.z ? 0 : 1;
    const bond = {a,b,broken:false,joint:null,cost};
    a.bonds.add(bond); b.bonds.add(bond);
  }

  // Shortest support path (in sideways steps) from the foundation to every
  // attached block that is still held within its limit. 0-1 BFS.
  reach() {
    const dist = new Map();
    let frontier = [];
    for (const b of this.blocks) if (b.attached && b.foundation) { dist.set(b, 0); frontier.push(b); }
    for (let d = 0; frontier.length; d++) {
      const next = [];
      for (let i = 0; i < frontier.length; i++) {
        const a = frontier[i];
        if (dist.get(a) !== d) continue;
        for (const bond of a.bonds) {
          if (bond.broken) continue;
          const o = bond.a === a ? bond.b : bond.a;
          if (!o.attached) continue;
          const nd = d + bond.cost, cur = dist.get(o);
          if (nd > o.limit || (cur !== undefined && cur <= nd)) continue;
          dist.set(o, nd);
          (bond.cost ? next : frontier).push(o);
        }
      }
      frontier = next;
    }
    return dist;
  }

  supported() { return new Set(this.reach().keys()); }

  // Caller severs the damaged blocks' bonds before recomputing support.
  detach(damaged) {
    const list = Array.isArray(damaged) ? damaged : [damaged];
    const detached = [];
    for (const b of list) if (b.attached) { b.attached = false; detached.push(b); }
    const supported = this.reach();
    for (const b of this.blocks) if (b.attached && !supported.has(b)) {
      b.attached = false; detached.push(b);
    }
    return detached;
  }
}
