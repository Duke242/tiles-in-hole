// Authored voxel models are bonded structures, not piles of loose cubes.
// Intact bonds transmit support from the lowest course to overhangs. Detached
// sections retain their internal bonds as Rapier joints until an impact breaks
// them. This is a game support model, not a material-stress simulation.
export class Structure {
  constructor(blocks) {
    this.blocks = new Set(blocks);
    const index = new Map();
    const floor = Math.min(...blocks.map(b => b.local.y));
    for (const b of blocks) {
      b.structure = this; b.attached = true; b.bonds = new Set();
      b.foundation = b.local.y === floor;
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
    const supported = this.supported();
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
  }

  bond(a,b) {
    const bond = {a,b,broken:false,joint:null};
    a.bonds.add(bond); b.bonds.add(bond);
  }

  supported() {
    const reached = new Set();
    const queue = [];
    for (const b of this.blocks) if (b.attached && b.foundation) { reached.add(b); queue.push(b); }
    for (let i=0;i<queue.length;i++) for (const bond of queue[i].bonds) {
      const b = bond.a===queue[i] ? bond.b : bond.a;
      if (!bond.broken && b.attached && !reached.has(b)) {reached.add(b);queue.push(b);}
    }
    return reached;
  }

  // Caller severs the damaged block's bonds before recomputing support.
  detach(damaged) {
    damaged.attached = false;
    const detached = [damaged], supported = this.supported();
    for (const b of this.blocks) if (b.attached && !supported.has(b)) {
      b.attached = false; detached.push(b);
    }
    return detached;
  }
}
