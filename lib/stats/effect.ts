import { logGamma, normalInv } from "./special";
import { mean, sortedAsc, variance } from "./descriptive";

/** Effect sizes: standardized mean differences and ordinal dominance. */

export interface EffectSize {
  estimate: number;
  /** Approximate 95% (or `level`) confidence interval. */
  lo: number;
  hi: number;
  magnitude: "negligible" | "small" | "medium" | "large" | "undefined";
}

function cohenMagnitude(d: number): EffectSize["magnitude"] {
  if (!Number.isFinite(d)) return "undefined";
  const a = Math.abs(d);
  return a < 0.2 ? "negligible" : a < 0.5 ? "small" : a < 0.8 ? "medium" : "large";
}

/** Pooled standard deviation √(((n₁-1)s₁² + (n₂-1)s₂²)/(n₁ + n₂ - 2)). */
export function pooledSd(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 + n2 < 3) return NaN;
  const v1 = n1 > 1 ? variance(a) : 0;
  const v2 = n2 > 1 ? variance(b) : 0;
  return Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
}

/**
 * Cohen's d = (x̄₁ - x̄₂)/s_pooled, with the large-sample standard error
 * √((n₁+n₂)/(n₁n₂) + d²/(2(n₁+n₂))) (Hedges & Olkin 1985) for the interval.
 * Conventional magnitudes (Cohen 1988): 0.2 small, 0.5 medium, 0.8 large.
 */
export function cohenD(a: ArrayLike<number>, b: ArrayLike<number>, level = 0.95): EffectSize {
  const n1 = a.length;
  const n2 = b.length;
  const s = pooledSd(a, b);
  const d = s > 0 ? (mean(a) - mean(b)) / s : NaN;
  const se = Math.sqrt((n1 + n2) / (n1 * n2) + (d * d) / (2 * (n1 + n2)));
  const z = normalInv(1 - (1 - level) / 2);
  return { estimate: d, lo: d - z * se, hi: d + z * se, magnitude: cohenMagnitude(d) };
}

/** Exact small-sample correction factor J(ν) = Γ(ν/2) / (√(ν/2) Γ((ν-1)/2)). */
export function hedgesJ(df: number): number {
  if (!(df > 1)) return NaN;
  return Math.exp(logGamma(df / 2) - 0.5 * Math.log(df / 2) - logGamma((df - 1) / 2));
}

/** Hedges' g = J(n₁ + n₂ - 2) · d: the (approximately) unbiased version of Cohen's d. */
export function hedgesG(a: ArrayLike<number>, b: ArrayLike<number>, level = 0.95): EffectSize {
  const d = cohenD(a, b, level);
  const j = hedgesJ(a.length + b.length - 2);
  return { estimate: d.estimate * j, lo: d.lo * j, hi: d.hi * j, magnitude: cohenMagnitude(d.estimate * j) };
}

/** Paired standardized mean difference d_z = mean(d)/sd(d). */
export function cohenDz(a: ArrayLike<number>, b: ArrayLike<number>, level = 0.95): EffectSize {
  const n = Math.min(a.length, b.length);
  const d = new Array<number>(n);
  for (let i = 0; i < n; i++) d[i] = a[i] - b[i];
  const s = Math.sqrt(variance(d));
  const dz = s > 0 ? mean(d) / s : NaN;
  const se = Math.sqrt(1 / n + (dz * dz) / (2 * n));
  const z = normalInv(1 - (1 - level) / 2);
  return { estimate: dz, lo: dz - z * se, hi: dz + z * se, magnitude: cohenMagnitude(dz) };
}

export interface CliffsDelta extends EffectSize {
  /** #{aᵢ > bⱼ} */
  greater: number;
  /** #{aᵢ < bⱼ} */
  less: number;
}

/**
 * Cliff's delta δ = P(A > B) - P(A < B) over all n₁n₂ pairs (Cliff 1993), computed
 * in O((n₁ + n₂) log n) by sorting and binary search. Approximate interval on the
 * Fisher-z scale: tanh(atanh(δ) ± z·√((n₁ + n₂ + 1)/(3 n₁ n₂))), where the variance term
 * is the exact null variance of δ without ties; the atanh transform keeps the
 * interval inside (-1, 1). Magnitudes per Romano et al. (2006):
 * |δ| < 0.147 negligible, < 0.33 small, < 0.474 medium, else large.
 */
export function cliffsDelta(a: ArrayLike<number>, b: ArrayLike<number>, level = 0.95): CliffsDelta {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return { estimate: NaN, lo: NaN, hi: NaN, magnitude: "undefined", greater: 0, less: 0 };
  const sb = sortedAsc(b);
  let greater = 0;
  let less = 0;
  for (let i = 0; i < n1; i++) {
    const x = a[i];
    // number of b < x and number of b > x
    let lo = 0;
    let hi = n2;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sb[m] < x) lo = m + 1;
      else hi = m;
    }
    const nLess = lo;
    lo = 0;
    hi = n2;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sb[m] <= x) lo = m + 1;
      else hi = m;
    }
    const nGreater = n2 - lo;
    greater += nLess;
    less += nGreater;
  }
  const delta = (greater - less) / (n1 * n2);
  const z = normalInv(1 - (1 - level) / 2);
  const sez = Math.sqrt((n1 + n2 + 1) / (3 * n1 * n2));
  const zf = Math.atanh(Math.min(0.999999, Math.max(-0.999999, delta)));
  const lo = Math.tanh(zf - z * sez);
  const hi = Math.tanh(zf + z * sez);
  const ad = Math.abs(delta);
  const magnitude: EffectSize["magnitude"] = ad < 0.147 ? "negligible" : ad < 0.33 ? "small" : ad < 0.474 ? "medium" : "large";
  return { estimate: delta, lo, hi, magnitude, greater, less };
}
