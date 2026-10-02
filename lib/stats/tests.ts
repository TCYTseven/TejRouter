import { mean, rankWithTies, variance } from "./descriptive";
import {
  binomialCdf,
  binomialPmf,
  binomialSf,
  chiSquareSf,
  normalInv,
  normalSf,
  studentTInv,
  studentTTwoSidedP,
} from "./special";
import { mulberry32 } from "./rng";

/**
 * Frequentist hypothesis tests. Every test is two-sided unless stated otherwise
 * and returns p-values in [0, 1]. Degenerate inputs (too few observations,
 * zero variance with zero effect) give p = 1 or NaN rather than throwing.
 */

export interface TestResult {
  method: string;
  statistic: number;
  pValue: number;
  /** Degrees of freedom, when the reference distribution has them. */
  df?: number;
  /** Number of observations (or pairs) the test actually used. */
  n: number;
}

// ---------------------------------------------------------------- t tests

export interface TTestResult extends TestResult {
  /** Mean difference (a - b, or mean of paired differences). */
  estimate: number;
  se: number;
  ciLo: number;
  ciHi: number;
}

function tFromParts(method: string, est: number, se: number, df: number, n: number, level: number): TTestResult {
  if (!(df > 0) || !Number.isFinite(se)) {
    return { method, statistic: NaN, pValue: NaN, df, n, estimate: est, se, ciLo: NaN, ciHi: NaN };
  }
  if (se === 0) {
    const p = est === 0 ? 1 : 0;
    return { method, statistic: est === 0 ? 0 : Math.sign(est) * Infinity, pValue: p, df, n, estimate: est, se, ciLo: est, ciHi: est };
  }
  const t = est / se;
  const q = studentTInv(1 - (1 - level) / 2, df);
  return { method, statistic: t, pValue: studentTTwoSidedP(t, df), df, n, estimate: est, se, ciLo: est - q * se, ciHi: est + q * se };
}

/**
 * Welch's unequal-variance t-test (Welch 1947):
 *   t = (x̄₁ - x̄₂) / √(s₁²/n₁ + s₂²/n₂),
 *   ν = (s₁²/n₁ + s₂²/n₂)² / [(s₁²/n₁)²/(n₁-1) + (s₂²/n₂)²/(n₂-1)].
 */
export function welchTTest(a: ArrayLike<number>, b: ArrayLike<number>, level = 0.95): TTestResult {
  const n1 = a.length;
  const n2 = b.length;
  const est = mean(a) - mean(b);
  if (n1 < 2 || n2 < 2) return tFromParts("welch-t", est, NaN, NaN, n1 + n2, level);
  const v1 = variance(a) / n1;
  const v2 = variance(b) / n2;
  const se = Math.sqrt(v1 + v2);
  const df = v1 + v2 === 0 ? n1 + n2 - 2 : ((v1 + v2) * (v1 + v2)) / ((v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1));
  return tFromParts("welch-t", est, se, df, n1 + n2, level);
}

/** Student's paired t-test on differences dᵢ = aᵢ - bᵢ: t = d̄ / (s_d/√n), ν = n - 1. */
export function pairedTTest(a: ArrayLike<number>, b: ArrayLike<number>, level = 0.95): TTestResult {
  const n = Math.min(a.length, b.length);
  const d = new Array<number>(n);
  for (let i = 0; i < n; i++) d[i] = a[i] - b[i];
  return oneSampleTTest(d, 0, level, "paired-t");
}

/** One-sample t-test of H₀: μ = mu0. */
export function oneSampleTTest(xs: ArrayLike<number>, mu0 = 0, level = 0.95, method = "one-sample-t"): TTestResult {
  const n = xs.length;
  const est = mean(xs) - mu0;
  if (n < 2) return tFromParts(method, est, NaN, NaN, n, level);
  return tFromParts(method, est, Math.sqrt(variance(xs) / n), n - 1, n, level);
}

// ---------------------------------------------------------------- rank tests

export interface MannWhitneyResult extends TestResult {
  /** U statistic for sample a: number of (aᵢ, bⱼ) pairs with aᵢ > bⱼ, ties counting ½. */
  u: number;
  z: number;
  /** Rank-biserial correlation r = 2U/(n₁n₂) - 1 = P(A > B) - P(A < B) (equals Cliff's δ). */
  rankBiserial: number;
  /** Common-language effect size U/(n₁n₂) = P(A > B) + ½P(A = B). */
  commonLanguage: number;
  exact: boolean;
}

/**
 * Mann-Whitney U / Wilcoxon rank-sum test. Exact null distribution when there are
 * no ties and n₁·n₂ ≤ 2500; otherwise the normal approximation with tie-corrected
 * variance σ² = n₁n₂/12 · [(N + 1) - Σ(t³ - t)/(N(N - 1))] and a 0.5 continuity correction.
 */
export function mannWhitneyU(a: ArrayLike<number>, b: ArrayLike<number>, opts: { exact?: boolean | "auto" } = {}): MannWhitneyResult {
  const n1 = a.length;
  const n2 = b.length;
  const N = n1 + n2;
  const base = { method: "mann-whitney-u", n: N };
  if (n1 === 0 || n2 === 0) {
    return { ...base, statistic: NaN, pValue: NaN, u: NaN, z: NaN, rankBiserial: NaN, commonLanguage: NaN, exact: false };
  }
  const all = new Array<number>(N);
  for (let i = 0; i < n1; i++) all[i] = a[i];
  for (let j = 0; j < n2; j++) all[n1 + j] = b[j];
  const { ranks, tieSum } = rankWithTies(all);
  let r1 = 0;
  for (let i = 0; i < n1; i++) r1 += ranks[i];
  const u = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const sigma2 = ((n1 * n2) / 12) * (N + 1 - tieSum / (N * (N - 1)));
  const rb = (2 * u) / (n1 * n2) - 1;
  const cl = u / (n1 * n2);
  const wantExact = opts.exact === true || ((opts.exact ?? "auto") === "auto" && tieSum === 0 && n1 * n2 <= 2500);
  if (wantExact && tieSum === 0) {
    const dist = mannWhitneyExactDist(n1, n2);
    const uInt = Math.round(u);
    let lower = 0;
    let upper = 0;
    for (let k = 0; k < dist.length; k++) {
      if (k <= uInt) lower += dist[k];
      if (k >= uInt) upper += dist[k];
    }
    const p = Math.min(1, 2 * Math.min(lower, upper));
    const z = sigma2 > 0 ? (u - mu) / Math.sqrt(sigma2) : 0;
    return { ...base, statistic: u, pValue: p, u, z, rankBiserial: rb, commonLanguage: cl, exact: true };
  }
  if (!(sigma2 > 0)) return { ...base, statistic: u, pValue: 1, u, z: 0, rankBiserial: rb, commonLanguage: cl, exact: false };
  const diff = u - mu;
  const z = (diff - 0.5 * Math.sign(diff)) / Math.sqrt(sigma2);
  return { ...base, statistic: u, pValue: Math.min(1, 2 * normalSf(Math.abs(z))), u, z, rankBiserial: rb, commonLanguage: cl, exact: false };
}

/** P(U = u) for u = 0..n₁n₂ under H₀ with no ties (recurrence of Mann & Whitney 1947). */
export function mannWhitneyExactDist(n1: number, n2: number): number[] {
  // Count subsets of size n1 from {1..N} by rank-sum; U = R - n1(n1+1)/2.
  const N = n1 + n2;
  const maxU = n1 * n2;
  // dp[k][u]: number of ways to pick k items from the items processed so far with "U-contribution" u.
  // Processing item i (0-based), picking it as the (k+1)-th chosen element contributes (i - k) to U.
  let dp: number[][] = Array.from({ length: n1 + 1 }, () => new Array<number>(maxU + 1).fill(0));
  dp[0][0] = 1;
  for (let i = 0; i < N; i++) {
    const next = dp.map((row) => row.slice());
    for (let k = 0; k < n1; k++) {
      const contrib = i - k;
      if (contrib < 0 || contrib > n2) continue;
      const row = dp[k];
      const target = next[k + 1];
      for (let u = 0; u + contrib <= maxU; u++) if (row[u]) target[u + contrib] += row[u];
    }
    dp = next;
  }
  const counts = dp[n1];
  let total = 0;
  for (const c of counts) total += c;
  return counts.map((c) => c / total);
}

export interface WilcoxonResult extends TestResult {
  /** Sum of ranks of positive differences. */
  wPlus: number;
  wMinus: number;
  z: number;
  /** Matched-pairs rank-biserial r = (W⁺ - W⁻)/(W⁺ + W⁻). */
  rankBiserial: number;
  /** Number of zero differences dropped. */
  zeros: number;
  exact: boolean;
}

/**
 * Wilcoxon signed-rank test on paired samples (or one sample against mu0 when b is
 * omitted). Zero differences are dropped (Wilcoxon's method), |d| ranked with
 * average ranks. Exact permutation distribution of W⁺ conditional on the observed
 * ranks for n ≤ 50 (computed by dynamic programming on doubled ranks, so ties are
 * handled exactly); otherwise normal approximation with variance
 * n(n+1)(2n+1)/24 - Σ(t³ - t)/48 and a 0.5 continuity correction.
 */
export function wilcoxonSignedRank(a: ArrayLike<number>, b?: ArrayLike<number>, opts: { mu0?: number; exact?: boolean | "auto" } = {}): WilcoxonResult {
  const mu0 = opts.mu0 ?? 0;
  const m = b ? Math.min(a.length, b.length) : a.length;
  const d: number[] = [];
  let zeros = 0;
  for (let i = 0; i < m; i++) {
    const v = a[i] - (b ? b[i] : 0) - mu0;
    if (!Number.isFinite(v)) continue;
    if (v === 0) zeros++;
    else d.push(v);
  }
  const n = d.length;
  const base = { method: "wilcoxon-signed-rank", n, zeros };
  if (n === 0) return { ...base, statistic: 0, pValue: 1, wPlus: 0, wMinus: 0, z: 0, rankBiserial: 0, exact: true };
  const { ranks, tieSum } = rankWithTies(d.map(Math.abs));
  let wPlus = 0;
  for (let i = 0; i < n; i++) if (d[i] > 0) wPlus += ranks[i];
  const total = (n * (n + 1)) / 2;
  const wMinus = total - wPlus;
  const rb = (wPlus - wMinus) / total;
  const mu = total / 2;
  const sigma2 = (n * (n + 1) * (2 * n + 1)) / 24 - tieSum / 48;
  const zRaw = sigma2 > 0 ? (wPlus - mu) / Math.sqrt(sigma2) : 0;
  const wantExact = opts.exact === true || ((opts.exact ?? "auto") === "auto" && n <= 50);
  if (wantExact) {
    // Doubled ranks are integers even with ties (average ranks are multiples of ½).
    const r2 = ranks.map((r) => Math.round(2 * r));
    const maxS = r2.reduce((s, r) => s + r, 0);
    let dist = new Float64Array(maxS + 1);
    dist[0] = 1;
    for (const r of r2) {
      const next = new Float64Array(maxS + 1);
      for (let s = 0; s <= maxS; s++) {
        if (!dist[s]) continue;
        next[s] += 0.5 * dist[s];
        if (s + r <= maxS) next[s + r] += 0.5 * dist[s];
      }
      dist = next;
    }
    const w2 = Math.round(2 * wPlus);
    let lower = 0;
    let upper = 0;
    for (let s = 0; s <= maxS; s++) {
      if (s <= w2) lower += dist[s];
      if (s >= w2) upper += dist[s];
    }
    return { ...base, statistic: wPlus, pValue: Math.min(1, 2 * Math.min(lower, upper)), wPlus, wMinus, z: zRaw, rankBiserial: rb, exact: true };
  }
  if (!(sigma2 > 0)) return { ...base, statistic: wPlus, pValue: 1, wPlus, wMinus, z: 0, rankBiserial: rb, exact: false };
  const diff = wPlus - mu;
  const z = (diff - 0.5 * Math.sign(diff)) / Math.sqrt(sigma2);
  return { ...base, statistic: wPlus, pValue: Math.min(1, 2 * normalSf(Math.abs(z))), wPlus, wMinus, z, rankBiserial: rb, exact: false };
}

// ---------------------------------------------------------------- binomial-family tests

/**
 * Exact two-sided binomial test of H₀: p = p0. The two-sided p-value sums the
 * probabilities of all outcomes no more likely than the observed one (the
 * "minimum likelihood" method used by R's binom.test), with a 1e-7 relative tolerance.
 */
export function binomialTest(k: number, n: number, p0 = 0.5): TestResult {
  if (n <= 0) return { method: "binomial-exact", statistic: k, pValue: 1, n };
  if (p0 === 0.5) {
    // Symmetric case: p = 2·min(P(X ≤ k), P(X ≥ k)), capped at 1.
    const p = Math.min(1, 2 * Math.min(binomialCdf(k, n, 0.5), binomialSf(k, n, 0.5)));
    return { method: "binomial-exact", statistic: k, pValue: p, n };
  }
  const d = binomialPmf(k, n, p0);
  const relErr = 1 + 1e-7;
  let p = 0;
  for (let i = 0; i <= n; i++) {
    const pi = binomialPmf(i, n, p0);
    if (pi <= d * relErr) p += pi;
  }
  return { method: "binomial-exact", statistic: k, pValue: Math.min(1, p), n };
}

export interface SignTestResult extends TestResult {
  positives: number;
  negatives: number;
  ties: number;
}

/** Exact sign test on paired differences (ties dropped): binomial test of #positives ~ Bin(n, ½). */
export function signTest(a: ArrayLike<number>, b?: ArrayLike<number>, mu0 = 0): SignTestResult {
  const m = b ? Math.min(a.length, b.length) : a.length;
  let pos = 0;
  let neg = 0;
  let ties = 0;
  for (let i = 0; i < m; i++) {
    const v = a[i] - (b ? b[i] : 0) - mu0;
    if (v > 0) pos++;
    else if (v < 0) neg++;
    else if (v === 0) ties++;
  }
  const r = binomialTest(pos, pos + neg, 0.5);
  return { method: "sign-test", statistic: pos, pValue: r.pValue, n: pos + neg, positives: pos, negatives: neg, ties };
}

export interface McNemarResult extends TestResult {
  /** Discordant pairs where A is correct and B is wrong. */
  b: number;
  /** Discordant pairs where A is wrong and B is correct. */
  c: number;
  /** Exact conditional (binomial) two-sided p-value. */
  pExact: number;
  /** Mid-p version of the exact test (Fagerland, Lydersen & Laake 2013). */
  pMid: number;
  /** χ² with Edwards' continuity correction: (|b - c| - 1)² / (b + c), 1 df. */
  chiSquare: number;
  pChiSquare: number;
}

/**
 * McNemar's test for paired binary outcomes, from the discordant counts b and c.
 * statistic/pValue are the exact version.
 */
export function mcnemar(b: number, c: number): McNemarResult {
  const n = b + c;
  if (n === 0) return { method: "mcnemar", statistic: 0, pValue: 1, n: 0, b, c, pExact: 1, pMid: 1, chiSquare: 0, pChiSquare: 1 };
  const pExact = binomialTest(b, n, 0.5).pValue;
  const k = Math.min(b, c);
  const pMid = Math.min(1, 2 * (binomialCdf(k, n, 0.5) - 0.5 * binomialPmf(k, n, 0.5)));
  const chi = Math.pow(Math.max(0, Math.abs(b - c) - 1), 2) / n;
  return { method: "mcnemar", statistic: b, pValue: pExact, n, b, c, pExact, pMid, chiSquare: chi, pChiSquare: chiSquareSf(chi, 1), df: 1 };
}

/** McNemar from two paired boolean arrays (A correct?, B correct?). */
export function mcnemarFromPairs(a: ArrayLike<boolean>, b: ArrayLike<boolean>): McNemarResult {
  let nb = 0;
  let nc = 0;
  const m = Math.min(a.length, b.length);
  for (let i = 0; i < m; i++) {
    if (a[i] && !b[i]) nb++;
    else if (!a[i] && b[i]) nc++;
  }
  return mcnemar(nb, nc);
}

// ---------------------------------------------------------------- permutation tests

export interface PermutationResult extends TestResult {
  /** Observed mean difference. */
  estimate: number;
  /** Number of permutations evaluated. */
  permutations: number;
  exact: boolean;
}

/**
 * Paired permutation (sign-flip) test of H₀: the distribution of dᵢ = aᵢ - bᵢ is
 * symmetric about 0. Statistic T = |mean(d)|. Exact enumeration of all 2ⁿ sign
 * patterns when n ≤ 16; otherwise seeded Monte Carlo with p = (1 + #{T* ≥ T}) / (1 + B),
 * which is a valid (slightly conservative) p-value (Phipson & Smyth 2010).
 */
export function permutationTestPaired(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  opts: { iterations?: number; seed?: number } = {},
): PermutationResult {
  const n = Math.min(a.length, b.length);
  const d = new Array<number>(n);
  for (let i = 0; i < n; i++) d[i] = a[i] - b[i];
  const obs = n ? mean(d) : 0;
  const T = Math.abs(obs);
  const tol = 1e-12 * Math.max(1, T);
  if (n === 0) return { method: "permutation-paired", statistic: 0, pValue: 1, n, estimate: 0, permutations: 0, exact: true };
  if (n <= 16) {
    const total = 1 << n;
    let count = 0;
    for (let mask = 0; mask < total; mask++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += mask & (1 << i) ? -d[i] : d[i];
      if (Math.abs(s / n) >= T - tol) count++;
    }
    return { method: "permutation-paired", statistic: obs, pValue: count / total, n, estimate: obs, permutations: total, exact: true };
  }
  const B = Math.max(1, Math.floor(opts.iterations ?? 2000));
  const rand = mulberry32(opts.seed ?? 1);
  let count = 0;
  for (let k = 0; k < B; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rand() < 0.5 ? -d[i] : d[i];
    if (Math.abs(s / n) >= T - tol) count++;
  }
  return { method: "permutation-paired", statistic: obs, pValue: (1 + count) / (1 + B), n, estimate: obs, permutations: B, exact: false };
}

/**
 * Two-sample permutation test on the difference in means (labels shuffled), seeded
 * Monte Carlo with the (1 + count)/(1 + B) correction.
 */
export function permutationTestTwoSample(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  opts: { iterations?: number; seed?: number } = {},
): PermutationResult {
  const n1 = a.length;
  const n2 = b.length;
  const all = [...Array.from(a), ...Array.from(b)];
  const N = all.length;
  if (n1 === 0 || n2 === 0) return { method: "permutation-two-sample", statistic: NaN, pValue: NaN, n: N, estimate: NaN, permutations: 0, exact: false };
  const total = all.reduce((s, x) => s + x, 0);
  const obs = mean(a) - mean(b);
  const T = Math.abs(obs);
  const tol = 1e-12 * Math.max(1, T);
  const B = Math.max(1, Math.floor(opts.iterations ?? 2000));
  const rand = mulberry32(opts.seed ?? 1);
  const buf = all.slice();
  let count = 0;
  for (let k = 0; k < B; k++) {
    // Partial Fisher-Yates: the first n1 slots are a uniformly random subset.
    let s1 = 0;
    for (let i = 0; i < n1; i++) {
      const j = i + Math.floor(rand() * (N - i));
      const t = buf[i];
      buf[i] = buf[j];
      buf[j] = t;
      s1 += buf[i];
    }
    const diff = s1 / n1 - (total - s1) / n2;
    if (Math.abs(diff) >= T - tol) count++;
  }
  return { method: "permutation-two-sample", statistic: obs, pValue: (1 + count) / (1 + B), n: N, estimate: obs, permutations: B, exact: false };
}

// ---------------------------------------------------------------- contingency tables

export interface IndependenceResult extends TestResult {
  /** Likelihood-ratio G statistic 2Σ O ln(O/E). */
  g: number;
  pG: number;
  /** Cramér's V = √(χ²/(N·(min(r, c) - 1))). */
  cramersV: number;
}

/**
 * Pearson χ² and G-test of independence on an r × c contingency table (rows and
 * columns with zero totals are dropped). Asymptotic; expected counts < 5 make it rough.
 */
export function chiSquareIndependence(table: number[][]): IndependenceResult {
  const rowsAll = table.map((r) => r.reduce((s, x) => s + x, 0));
  const nc = table.reduce((m, r) => Math.max(m, r.length), 0);
  const colsAll = Array.from({ length: nc }, (_, j) => table.reduce((s, r) => s + (r[j] ?? 0), 0));
  const rIdx = rowsAll.map((t, i) => (t > 0 ? i : -1)).filter((i) => i >= 0);
  const cIdx = colsAll.map((t, j) => (t > 0 ? j : -1)).filter((j) => j >= 0);
  const N = rowsAll.reduce((s, x) => s + x, 0);
  const df = (rIdx.length - 1) * (cIdx.length - 1);
  if (df <= 0 || N <= 0) {
    return { method: "chi-square-independence", statistic: 0, pValue: 1, df: Math.max(0, df), n: N, g: 0, pG: 1, cramersV: 0 };
  }
  let chi = 0;
  let g = 0;
  for (const i of rIdx) {
    for (const j of cIdx) {
      const o = table[i][j] ?? 0;
      const e = (rowsAll[i] * colsAll[j]) / N;
      chi += ((o - e) * (o - e)) / e;
      if (o > 0) g += o * Math.log(o / e);
    }
  }
  g *= 2;
  const k = Math.min(rIdx.length, cIdx.length) - 1;
  return {
    method: "chi-square-independence",
    statistic: chi,
    pValue: chiSquareSf(chi, df),
    df,
    n: N,
    g,
    pG: chiSquareSf(g, df),
    cramersV: k > 0 ? Math.sqrt(chi / (N * k)) : 0,
  };
}

// ---------------------------------------------------------------- multiple comparisons

/**
 * Holm-Bonferroni step-down adjustment (Holm 1979); controls the family-wise
 * error rate under arbitrary dependence. Non-finite p-values are passed through
 * and do not count toward m.
 *   p̃₍ᵢ₎ = max_{j ≤ i} min(1, (m - j + 1) p₍ⱼ₎)
 */
export function holmAdjust(ps: ReadonlyArray<number>): number[] {
  const idx = ps.map((p, i) => i).filter((i) => Number.isFinite(ps[i])).sort((x, y) => ps[x] - ps[y]);
  const m = idx.length;
  const out = ps.slice() as number[];
  let running = 0;
  idx.forEach((i, k) => {
    running = Math.max(running, Math.min(1, (m - k) * ps[i]));
    out[i] = running;
  });
  return out;
}

/**
 * Benjamini-Hochberg step-up adjustment (1995); controls the false discovery rate
 * under independence or positive regression dependence.
 *   p̃₍ᵢ₎ = min_{j ≥ i} min(1, m p₍ⱼ₎ / j)
 */
export function benjaminiHochberg(ps: ReadonlyArray<number>): number[] {
  const idx = ps.map((p, i) => i).filter((i) => Number.isFinite(ps[i])).sort((x, y) => ps[x] - ps[y]);
  const m = idx.length;
  const out = ps.slice() as number[];
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const i = idx[k];
    running = Math.min(running, Math.min(1, (m * ps[i]) / (k + 1)));
    out[i] = running;
  }
  return out;
}

/** Bonferroni adjustment min(1, m·p). */
export function bonferroni(ps: ReadonlyArray<number>): number[] {
  const m = ps.filter((p) => Number.isFinite(p)).length;
  return ps.map((p) => (Number.isFinite(p) ? Math.min(1, m * p) : p));
}

/** Two-sided z critical value for a confidence level. */
export function zCritical(level = 0.95): number {
  return normalInv(1 - (1 - level) / 2);
}
