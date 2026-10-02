import { mean, sd } from "./descriptive";
import { incBetaInv, normalInv, studentTInv } from "./special";

/** A two-sided confidence (or credible) interval. */
export interface Interval {
  estimate: number;
  lo: number;
  hi: number;
  /** Nominal coverage, e.g. 0.95. */
  level: number;
  method: string;
}

/**
 * Wilson score interval for a binomial proportion (Wilson 1927):
 *   center = (p̂ + z²/2n) / (1 + z²/n)
 *   half   = z/(1 + z²/n) · √(p̂(1-p̂)/n + z²/4n²)
 * Good coverage even for small n and p̂ near 0 or 1; recommended by Brown, Cai & DasGupta (2001).
 */
export function wilson(successes: number, n: number, level = 0.95): Interval {
  if (!(n > 0)) return { estimate: NaN, lo: NaN, hi: NaN, level, method: "wilson" };
  const z = normalInv(1 - (1 - level) / 2);
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { estimate: p, lo: Math.max(0, center - half), hi: Math.min(1, center + half), level, method: "wilson" };
}

/**
 * Clopper-Pearson "exact" interval (1934), by inverting two one-sided binomial tests:
 *   lo = B⁻¹(α/2; x, n - x + 1),  hi = B⁻¹(1 - α/2; x + 1, n - x)
 * with lo = 0 when x = 0 and hi = 1 when x = n. Conservative (coverage ≥ nominal).
 */
export function clopperPearson(successes: number, n: number, level = 0.95): Interval {
  if (!(n > 0)) return { estimate: NaN, lo: NaN, hi: NaN, level, method: "clopper-pearson" };
  const a = 1 - level;
  const x = successes;
  const lo = x <= 0 ? 0 : incBetaInv(a / 2, x, n - x + 1);
  const hi = x >= n ? 1 : incBetaInv(1 - a / 2, x + 1, n - x);
  return { estimate: x / n, lo, hi, level, method: "clopper-pearson" };
}

/** Jeffreys interval: equal-tailed Beta(x + ½, n - x + ½) posterior interval. */
export function jeffreys(successes: number, n: number, level = 0.95): Interval {
  if (!(n > 0)) return { estimate: NaN, lo: NaN, hi: NaN, level, method: "jeffreys" };
  const a = 1 - level;
  const x = successes;
  const lo = x <= 0 ? 0 : incBetaInv(a / 2, x + 0.5, n - x + 0.5);
  const hi = x >= n ? 1 : incBetaInv(1 - a / 2, x + 0.5, n - x + 0.5);
  return { estimate: x / n, lo, hi, level, method: "jeffreys" };
}

/** Agresti-Coull "add z²/2 successes and failures" interval. */
export function agrestiCoull(successes: number, n: number, level = 0.95): Interval {
  if (!(n > 0)) return { estimate: NaN, lo: NaN, hi: NaN, level, method: "agresti-coull" };
  const z = normalInv(1 - (1 - level) / 2);
  const nt = n + z * z;
  const pt = (successes + (z * z) / 2) / nt;
  const half = z * Math.sqrt((pt * (1 - pt)) / nt);
  return { estimate: successes / n, lo: Math.max(0, pt - half), hi: Math.min(1, pt + half), level, method: "agresti-coull" };
}

/** Student-t interval for a mean: x̄ ± t_{1-α/2, n-1} · s/√n. Needs n ≥ 2. */
export function tInterval(xs: ArrayLike<number>, level = 0.95): Interval {
  const n = xs.length;
  const m = mean(xs);
  if (n < 2) return { estimate: m, lo: NaN, hi: NaN, level, method: "t" };
  const t = studentTInv(1 - (1 - level) / 2, n - 1);
  const half = (t * sd(xs)) / Math.sqrt(n);
  return { estimate: m, lo: m - half, hi: m + half, level, method: "t" };
}

/** Wald/normal interval estimate ± z·se. */
export function normalInterval(estimate: number, se: number, level = 0.95): Interval {
  const z = normalInv(1 - (1 - level) / 2);
  return { estimate, lo: estimate - z * se, hi: estimate + z * se, level, method: "normal" };
}
