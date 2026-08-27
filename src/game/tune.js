// Shared tuning constants. Anything the designer would want to touch lives here.

export const CITY = {
  N: 8,          // blocks per side
  P: 62,         // block pitch (block + road)
  RW: 15,        // road width
};
CITY.SPAN = CITY.N * CITY.P;
CITY.INNER = CITY.P - CITY.RW;

export const BOUND = { lo: -26, hi: CITY.SPAN + 26 };

// Funnel/crater profile, expressed in multiples of the hole radius so the
// crater scales with the hole. Baked into the ring geometry AND used by the
// object physics, so both must agree.
export const FUNNEL_OUT = 1.45;
export const FUNNEL_DEPTH = 0.5;

export function funnelY(d, r) {
  const outer = r * FUNNEL_OUT;
  if (d >= outer) return 0;
  const t = Math.max(0, (d - r) / (outer - r));
  const k = 1 - t;
  return -FUNNEL_DEPTH * r * k * k;
}

export const HOLE = {
  start: 3.2,
  max: 32,
  baseSpeed: 26,       // units/sec at starting size
  speedPerR: 0.85,     // extra speed per unit of radius
  accel: 8,            // how quickly velocity converges on desired
  growK: 0.3,          // r' = sqrt(r^2 + growK * value)
};

// Size gates. Each object gets a `need` from this table; crossing a
// threshold fires an unlock toast.
export const TIERS = [
  { r: 0,    label: 'People & street props' },
  { r: 4.2,  label: 'Trees & benches' },
  { r: 6.5,  label: 'Cars' },
  { r: 9.5,  label: 'Buses & houses' },
  { r: 13,   label: 'Shops & low-rises' },
  { r: 16,   label: 'Tower blocks' },
  { r: 20,   label: 'GIANT STATUES' },
];

export const NEED = {
  person: 0, prop: 0, bin: 0, hydrant: 0,
  bench: 4.2, tree: 4.2, lamp: 4.2, bike: 4.2,
  car: 6.5, trafficLight: 6.5,
  bus: 9.5, truck: 9.5, house: 9.5,
  shop: 13, lowrise: 13,
  tower: 16,
  giant: 20,
};

export const VALUE = {
  person: 1, prop: 1, bin: 1, hydrant: 1, bench: 2, lamp: 2, bike: 3,
  tree: 3, car: 5, trafficLight: 3, bus: 10, truck: 9, house: 18,
  shop: 25, lowrise: 32, tower: 45,
};
