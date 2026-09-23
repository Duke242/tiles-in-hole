// Small seeded PRNG (mulberry32) so a level number always builds the same
// board, on every device.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    f,
    r: (lo, hi) => lo + f() * (hi - lo),
    i: (lo, hi) => Math.floor(lo + f() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(f() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
  };
}

// Deterministic per-voxel noise for patterns (seeds, sprinkles, windows).
export function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
