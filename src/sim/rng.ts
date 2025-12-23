export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedForWeek(weekIdx: number, salt = 0): number {
  // A simple, stable hash-like mix for determinism.
  let s = (weekIdx + 1) >>> 0;
  s = Math.imul(s ^ 0x9e3779b1, 0x85ebca6b);
  s ^= s >>> 13;
  s = Math.imul(s ^ (salt >>> 0), 0xc2b2ae35);
  s ^= s >>> 16;
  return s >>> 0;
}

// ============================================================================
// Stateful RNG (seedable, reproducible, but not week-deterministic)
// ============================================================================

export type Rng = {
  state: number;
};

export function rngNextFloat(rng: Rng): number {
  // mulberry32 step, but with explicit state.
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(rng.state ^ (rng.state >>> 15), 1 | rng.state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngNextUint32(rng: Rng): number {
  // Convert nextFloat to uint32 without extra PRNG steps.
  // Note: rngNextFloat already advances state.
  return (rngNextFloat(rng) * 0x100000000) >>> 0;
}

export function rngNormal01(rng: Rng): number {
  // Box–Muller transform (returns N(0,1)).
  let u = 0;
  let v = 0;
  // Avoid 0 to prevent log(0).
  while (u === 0) u = rngNextFloat(rng);
  while (v === 0) v = rngNextFloat(rng);
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function rngPoisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    // Knuth’s algorithm (fast enough for small means).
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rngNextFloat(rng);
    } while (p > L);
    return k - 1;
  }
  // Normal approximation for larger means.
  const n = Math.round(lambda + rngNormal01(rng) * Math.sqrt(lambda));
  return Math.max(0, n);
}


