/**
 * Descriptive statistics. All functions ignore nothing silently: callers must
 * filter non-finite values first (see `finiteOnly`). Undefined statistics
 * (e.g. the variance of one value) return NaN here; lib/analysis converts NaN to
 * null before anything is serialized.
 */

/** Keep only finite numbers (drops null, undefined, NaN, ±Infinity). */
export function finiteOnly(xs: ReadonlyArray<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const x of xs) if (typeof x === "number" && Number.isFinite(x)) out.push(x);
  return out;
}

/** Neumaier-compensated sum (more accurate than naive summation for long arrays). */
export function sum(xs: ArrayLike<number>): number {
  let s = 0;
  let c = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const t = s + x;
    if (Math.abs(s) >= Math.abs(x)) c += s - t + x;
    else c += x - t + s;
    s = t;
  }
  return s + c;
}

export function mean(xs: ArrayLike<number>): number {
  return xs.length === 0 ? NaN : sum(xs) / xs.length;
}

/** Weighted mean Σwᵢxᵢ / Σwᵢ. */
export function weightedMean(xs: ArrayLike<number>, ws: ArrayLike<number>): number {
  let sw = 0;
  let swx = 0;
  for (let i = 0; i < xs.length; i++) {
    sw += ws[i];
    swx += ws[i] * xs[i];
  }
  return sw > 0 ? swx / sw : NaN;
}

/** Sample variance with Bessel's correction (divisor n - 1), two-pass algorithm. */
export function variance(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let ss = 0;
  let comp = 0;
  for (let i = 0; i < n; i++) {
    const d = xs[i] - m;
    ss += d * d;
    comp += d;
  }
  return (ss - (comp * comp) / n) / (n - 1);
}

/** Population variance (divisor n). */
export function populationVariance(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (n === 0) return NaN;
  return n === 1 ? 0 : (variance(xs) * (n - 1)) / n;
}

export function sd(xs: ArrayLike<number>): number {
  return Math.sqrt(variance(xs));
}

/** Standard error of the mean, s / √n. */
export function sem(xs: ArrayLike<number>): number {
  return sd(xs) / Math.sqrt(xs.length);
}

export function min(xs: ArrayLike<number>): number {
  let m = Infinity;
  for (let i = 0; i < xs.length; i++) if (xs[i] < m) m = xs[i];
  return xs.length ? m : NaN;
}

export function max(xs: ArrayLike<number>): number {
  let m = -Infinity;
  for (let i = 0; i < xs.length; i++) if (xs[i] > m) m = xs[i];
  return xs.length ? m : NaN;
}

/** Ascending numeric sort into a new array. */
export function sortedAsc(xs: ArrayLike<number>): number[] {
  return Array.from(xs).sort((a, b) => a - b);
}

/**
 * Quantile, Hyndman & Fan (1996) type 7 (the default in R and NumPy):
 * h = (n - 1)p, Q(p) = x₍⌊h⌋₎ + (h - ⌊h⌋)(x₍⌊h⌋+1₎ - x₍⌊h⌋₎), with 0-based order statistics.
 * Pass `isSorted` when the input is already ascending to avoid a copy.
 */
export function quantile(xs: ArrayLike<number>, p: number, isSorted = false): number {
  const n = xs.length;
  if (n === 0 || Number.isNaN(p)) return NaN;
  const s = isSorted ? xs : sortedAsc(xs);
  if (p <= 0) return s[0];
  if (p >= 1) return s[n - 1];
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const frac = h - lo;
  return lo + 1 < n ? s[lo] + frac * (s[lo + 1] - s[lo]) : s[lo];
}

export function median(xs: ArrayLike<number>, isSorted = false): number {
  return quantile(xs, 0.5, isSorted);
}

/** Interquartile range (type-7 quantiles). */
export function iqr(xs: ArrayLike<number>, isSorted = false): number {
  const s = isSorted ? xs : sortedAsc(xs);
  return quantile(s, 0.75, true) - quantile(s, 0.25, true);
}

export interface Describe {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

/** Summary statistics. Quantiles are type 7. Empty input gives NaN fields with n = 0. */
export function describe(xs: ArrayLike<number>): Describe {
  const s = sortedAsc(xs);
  return {
    n: s.length,
    mean: mean(s),
    sd: sd(s),
    min: s.length ? s[0] : NaN,
    max: s.length ? s[s.length - 1] : NaN,
    p50: quantile(s, 0.5, true),
    p90: quantile(s, 0.9, true),
    p95: quantile(s, 0.95, true),
    p99: quantile(s, 0.99, true),
  };
}

/** Geometric mean exp(mean(ln x)); requires all x > 0, else NaN. */
export function geometricMean(xs: ArrayLike<number>): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    if (!(xs[i] > 0)) return NaN;
    s += Math.log(xs[i]);
  }
  return Math.exp(s / xs.length);
}

/** Harmonic mean; requires all x > 0. */
export function harmonicMean(xs: ArrayLike<number>): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    if (!(xs[i] > 0)) return NaN;
    s += 1 / xs[i];
  }
  return xs.length / s;
}

/** Sample covariance (n - 1). */
export function covariance(xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (n - 1);
}

/** Pearson correlation coefficient. */
export function pearson(xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  const c = covariance(xs, ys);
  const d = sd(xs) * sd(ys);
  return d > 0 ? c / d : NaN;
}

/**
 * Fractional (average) ranks, 1-based: tied values share the mean of the ranks
 * they span. Also returns Σ(t³ - t) over tie groups, used by tie corrections.
 */
export function rankWithTies(xs: ArrayLike<number>): { ranks: number[]; tieSum: number } {
  const n = xs.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const ranks = new Array<number>(n);
  let tieSum = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && xs[idx[j + 1]] === xs[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = r;
    const t = j - i + 1;
    if (t > 1) tieSum += t * t * t - t;
    i = j + 1;
  }
  return { ranks, tieSum };
}

export function ranks(xs: ArrayLike<number>): number[] {
  return rankWithTies(xs).ranks;
}

/** Spearman rank correlation (Pearson on average ranks). */
export function spearman(xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  return pearson(ranks(xs), ranks(ys));
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Empirical CDF F̂(x) = #{xᵢ ≤ x}/n as step points (one per distinct value).
 * If there are more than `maxPoints` distinct values the curve is thinned to
 * evenly spaced points (always keeping the first and last).
 */
export function ecdf(xs: ArrayLike<number>, maxPoints = Infinity): Point[] {
  const s = sortedAsc(xs);
  const n = s.length;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    if (i + 1 < n && s[i + 1] === s[i]) continue;
    pts.push({ x: s[i], y: (i + 1) / n });
  }
  return thin(pts, maxPoints);
}

function thin<T>(pts: T[], maxPoints: number): T[] {
  if (pts.length <= maxPoints || maxPoints < 2) return pts;
  const out: T[] = [];
  const step = (pts.length - 1) / (maxPoints - 1);
  for (let k = 0; k < maxPoints; k++) out.push(pts[Math.round(k * step)]);
  return out;
}

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
  /** count / (n · width): integrates to 1, comparable with a KDE. */
  density: number;
}

/**
 * Histogram with equal-width bins. Default bin count is the Freedman-Diaconis
 * rule (width = 2·IQR·n^(-1/3)), falling back to Sturges (⌈log₂ n⌉ + 1) when IQR = 0,
 * clamped to [1, 100].
 */
export function histogram(xs: ArrayLike<number>, bins?: number): HistogramBin[] {
  const s = sortedAsc(xs);
  const n = s.length;
  if (n === 0) return [];
  const lo = s[0];
  const hi = s[n - 1];
  // Degenerate (all values equal): one zero-width bin; density is reported as 1 by convention.
  if (lo === hi) return [{ x0: lo, x1: hi, count: n, density: 1 }];
  let k = bins ?? 0;
  if (!k) {
    const w = (2 * iqr(s, true)) / Math.cbrt(n);
    k = w > 0 ? Math.ceil((hi - lo) / w) : Math.ceil(Math.log2(n)) + 1;
  }
  k = Math.max(1, Math.min(100, Math.round(k)));
  const width = (hi - lo) / k;
  const out: HistogramBin[] = Array.from({ length: k }, (_, i) => ({ x0: lo + i * width, x1: lo + (i + 1) * width, count: 0, density: 0 }));
  for (const x of s) {
    const i = Math.min(k - 1, Math.floor((x - lo) / width));
    out[i].count++;
  }
  for (const b of out) b.density = b.count / (n * width);
  return out;
}

/**
 * Silverman's rule-of-thumb bandwidth: h = 0.9 · min(σ̂, IQR/1.34) · n^(-1/5).
 * Falls back to σ̂ or to 1 when the spread is zero.
 */
export function silvermanBandwidth(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (n < 2) return 1;
  const s = sd(xs);
  const r = iqr(xs) / 1.34;
  let spread = Math.min(s, r);
  if (!(spread > 0)) spread = s > 0 ? s : r > 0 ? r : Math.abs(mean(xs)) * 0.1 || 1;
  return 0.9 * spread * Math.pow(n, -0.2);
}

/**
 * Gaussian kernel density estimate f̂(x) = (1/nh) Σ φ((x - xᵢ)/h) evaluated on a grid
 * of `points` values spanning [min - 3h, max + 3h]. Kernels further than 8h are skipped.
 */
export function kde(xs: ArrayLike<number>, opts: { points?: number; bandwidth?: number; from?: number; to?: number } = {}): Point[] {
  const s = sortedAsc(xs);
  const n = s.length;
  if (n === 0) return [];
  const h = opts.bandwidth ?? silvermanBandwidth(s);
  const m = Math.max(2, opts.points ?? 100);
  const from = opts.from ?? s[0] - 3 * h;
  const to = opts.to ?? s[n - 1] + 3 * h;
  const norm = 1 / (n * h * Math.sqrt(2 * Math.PI));
  const out: Point[] = [];
  let start = 0;
  for (let g = 0; g < m; g++) {
    const x = from + ((to - from) * g) / (m - 1);
    while (start < n && s[start] < x - 8 * h) start++;
    let acc = 0;
    for (let i = start; i < n && s[i] <= x + 8 * h; i++) {
      const z = (x - s[i]) / h;
      acc += Math.exp(-0.5 * z * z);
    }
    out.push({ x, y: acc * norm });
  }
  return out;
}
