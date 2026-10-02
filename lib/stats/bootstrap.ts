import { mean, median, quantile, sd, sortedAsc } from "./descriptive";
import { normalCdf, normalInv } from "./special";
import { mulberry32, randInt } from "./rng";

/**
 * Nonparametric bootstrap (Efron 1979; Efron & Tibshirani 1993).
 *
 * All resampling is seeded (mulberry32) so a report is reproducible.
 * Methods:
 * - "percentile": [Q*(α/2), Q*(1-α/2)] of the bootstrap distribution (type-7 quantiles).
 * - "basic":      [2θ̂ - Q*(1-α/2), 2θ̂ - Q*(α/2)].
 * - "bca":        bias-corrected and accelerated (Efron 1987). With
 *                 z₀ = Φ⁻¹(#{θ* < θ̂}/B + ½#{θ* = θ̂}/B) and jackknife acceleration
 *                 a = Σ(θ̄₍.₎ - θ₍ᵢ₎)³ / (6 [Σ(θ̄₍.₎ - θ₍ᵢ₎)²]^{3/2}),
 *                 the endpoints are the bootstrap quantiles at
 *                 α₁,₂ = Φ(z₀ + (z₀ + z_{α/2, 1-α/2}) / (1 - a(z₀ + z_{α/2, 1-α/2}))).
 *                 For n > 1000 units a grouped (delete-block) jackknife with 1000 blocks is used.
 */

export type BootstrapMethod = "percentile" | "basic" | "bca";

export interface BootstrapOptions {
  /** Number of bootstrap resamples (default 1000). */
  iterations?: number;
  /** 1 - confidence level (default 0.05). */
  alpha?: number;
  seed?: number;
  method?: BootstrapMethod;
}

export interface BootstrapResult {
  /** θ̂ on the original sample. */
  estimate: number;
  lo: number;
  hi: number;
  /** Bootstrap standard error (sd of θ*). */
  se: number;
  /** mean(θ*) - θ̂. */
  bias: number;
  iterations: number;
  level: number;
  method: BootstrapMethod;
}

const EMPTY = (alpha: number, method: BootstrapMethod): BootstrapResult => ({
  estimate: NaN,
  lo: NaN,
  hi: NaN,
  se: NaN,
  bias: NaN,
  iterations: 0,
  level: 1 - alpha,
  method,
});

/**
 * Generic bootstrap over n exchangeable units. `stat` receives an array of unit
 * indices (with repetition). The index buffer is reused between calls, so `stat`
 * must not keep a reference to it.
 */
export function bootstrapIndices(n: number, stat: (idx: number[]) => number, opts: BootstrapOptions = {}): BootstrapResult {
  const B = Math.max(1, Math.floor(opts.iterations ?? 1000));
  const alpha = opts.alpha ?? 0.05;
  const method = opts.method ?? "percentile";
  if (n <= 0) return EMPTY(alpha, method);
  const identity = Array.from({ length: n }, (_, i) => i);
  const theta = stat(identity);
  if (!Number.isFinite(theta)) return { ...EMPTY(alpha, method), estimate: theta };
  const rand = mulberry32(opts.seed ?? 1);
  const buf = new Array<number>(n);
  const reps: number[] = [];
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) buf[i] = randInt(rand, n);
    const v = stat(buf);
    if (Number.isFinite(v)) reps.push(v);
  }
  if (reps.length === 0) return { ...EMPTY(alpha, method), estimate: theta };
  const s = sortedAsc(reps);
  const se = reps.length > 1 ? sd(reps) : 0;
  const bias = mean(reps) - theta;
  let lo: number;
  let hi: number;
  if (method === "basic") {
    lo = 2 * theta - quantile(s, 1 - alpha / 2, true);
    hi = 2 * theta - quantile(s, alpha / 2, true);
  } else if (method === "bca" && s[0] !== s[s.length - 1]) {
    const acc = jackknifeAcceleration(n, stat);
    let below = 0;
    let equal = 0;
    for (const v of s) {
      if (v < theta) below++;
      else if (v === theta) equal++;
    }
    const prop = (below + 0.5 * equal) / s.length;
    const z0 = normalInv(Math.min(1 - 1e-9, Math.max(1e-9, prop)));
    const adj = (zq: number) => {
      const num = z0 + zq;
      const den = 1 - acc * num;
      return den > 0 ? normalCdf(z0 + num / den) : zq < 0 ? 0 : 1;
    };
    const a1 = Number.isFinite(acc) ? adj(normalInv(alpha / 2)) : alpha / 2;
    const a2 = Number.isFinite(acc) ? adj(normalInv(1 - alpha / 2)) : 1 - alpha / 2;
    lo = quantile(s, a1, true);
    hi = quantile(s, a2, true);
  } else {
    lo = quantile(s, alpha / 2, true);
    hi = quantile(s, 1 - alpha / 2, true);
  }
  return { estimate: theta, lo, hi, se, bias, iterations: s.length, level: 1 - alpha, method };
}

/** Jackknife acceleration constant for BCa (grouped jackknife when n > 1000). */
export function jackknifeAcceleration(n: number, stat: (idx: number[]) => number): number {
  const groups = Math.min(n, 1000);
  if (groups < 3) return 0;
  const vals: number[] = [];
  for (let g = 0; g < groups; g++) {
    const start = Math.floor((g * n) / groups);
    const end = Math.floor(((g + 1) * n) / groups);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (i < start || i >= end) idx.push(i);
    const v = stat(idx);
    if (Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < 3) return 0;
  const m = mean(vals);
  let num = 0;
  let den = 0;
  for (const v of vals) {
    const d = m - v;
    num += d * d * d;
    den += d * d;
  }
  return den > 0 ? num / (6 * Math.pow(den, 1.5)) : 0;
}

/** Bootstrap CI for a statistic of one sample of numbers (default: the mean). */
export function bootstrapCI(
  xs: ArrayLike<number>,
  stat: (sample: number[]) => number = mean,
  opts: BootstrapOptions = {},
): BootstrapResult {
  const data = Array.from(xs);
  const tmp: number[] = [];
  return bootstrapIndices(
    data.length,
    (idx) => {
      tmp.length = idx.length;
      for (let i = 0; i < idx.length; i++) tmp[i] = data[idx[i]];
      return stat(tmp);
    },
    opts,
  );
}

/** Bootstrap CI on the mean, with a fast accumulator (no temporary arrays). */
export function bootstrapMean(xs: ArrayLike<number>, opts: BootstrapOptions = {}): BootstrapResult {
  const data = Array.from(xs);
  return bootstrapIndices(
    data.length,
    (idx) => {
      let s = 0;
      for (let i = 0; i < idx.length; i++) s += data[idx[i]];
      return s / idx.length;
    },
    opts,
  );
}

/**
 * Bootstrap CI on the median (percentile method by default). Uses a typed-array
 * buffer and the native numeric sort, which is several times faster than a generic
 * statistic for large samples.
 */
export function bootstrapMedian(xs: ArrayLike<number>, opts: BootstrapOptions = {}): BootstrapResult {
  const data = Float64Array.from(xs as ArrayLike<number>);
  let buf = new Float64Array(data.length);
  return bootstrapIndices(
    data.length,
    (idx) => {
      if (buf.length !== idx.length) buf = new Float64Array(idx.length);
      for (let i = 0; i < idx.length; i++) buf[i] = data[idx[i]];
      buf.sort();
      return median(buf, true);
    },
    opts,
  );
}

/**
 * Cluster (block) bootstrap: resample whole clusters with replacement, keeping
 * every observation of a cluster together (e.g. all repetitions of one task).
 * This respects within-cluster correlation, which an observation-level bootstrap
 * would ignore and so understate the uncertainty (Field & Welsh 2007).
 */
export function clusterBootstrap<T>(
  clusters: T[][],
  stat: (clusters: T[][]) => number,
  opts: BootstrapOptions = {},
): BootstrapResult {
  const tmp: T[][] = [];
  return bootstrapIndices(
    clusters.length,
    (idx) => {
      tmp.length = idx.length;
      for (let i = 0; i < idx.length; i++) tmp[i] = clusters[idx[i]];
      return stat(tmp);
    },
    opts,
  );
}

/** Pooled mean of all observations, the usual statistic for clustered data. */
export function pooledMean(clusters: ArrayLike<number>[]): number {
  let s = 0;
  let n = 0;
  for (const c of clusters) {
    for (let i = 0; i < c.length; i++) s += c[i];
    n += c.length;
  }
  return n ? s / n : NaN;
}

/**
 * Paired bootstrap of mean(a - b): units (e.g. tasks) are resampled jointly, so the
 * pairing between a[i] and b[i] is preserved.
 */
export function pairedBootstrapMeanDiff(a: ArrayLike<number>, b: ArrayLike<number>, opts: BootstrapOptions = {}): BootstrapResult {
  const n = Math.min(a.length, b.length);
  const d = new Array<number>(n);
  for (let i = 0; i < n; i++) d[i] = a[i] - b[i];
  return bootstrapMean(d, opts);
}
