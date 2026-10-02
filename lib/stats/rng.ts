/**
 * Seeded pseudo-random numbers. Every randomized procedure in lib/stats takes a
 * seed so that a report computed twice from the same run is bit-for-bit identical.
 *
 * mulberry32 is the same generator used by the offline simulators
 * (lib/providers/simulator.ts); it is re-implemented here so lib/stats stays
 * dependency-free. Period 2^32, which is plenty for bootstrap resampling.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash, used to derive independent sub-seeds from labels. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Derive a seed for a named sub-computation so results do not depend on call order. */
export function deriveSeed(seed: number, label: string): number {
  return hashString(`${seed >>> 0}|${label}`);
}

/** Uniform integer in [0, n). */
export function randInt(rand: Rng, n: number): number {
  return Math.floor(rand() * n);
}

/** Standard normal via Box-Muller. */
export function randNormal(rand: Rng): number {
  const u = Math.max(rand(), 1e-300);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) via Marsaglia & Tsang (2000), with the shape<1 boost. */
export function randGamma(rand: Rng, shape: number): number {
  if (!(shape > 0)) return NaN;
  if (shape < 1) {
    const u = Math.max(rand(), 1e-300);
    return randGamma(rand, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = randNormal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(Math.max(u, 1e-300)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(a, b) via two gammas. */
export function randBeta(rand: Rng, a: number, b: number): number {
  const x = randGamma(rand, a);
  const y = randGamma(rand, b);
  return x / (x + y);
}

/** Fisher-Yates shuffle (in place) and returns the array. */
export function shuffleInPlace<T>(rand: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    const t = xs[i];
    xs[i] = xs[j];
    xs[j] = t;
  }
  return xs;
}
