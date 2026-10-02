/**
 * Reliability across repetitions: how much of the score variance is due to the
 * task (stable) versus the repetition (noise), and how often repeated calls agree.
 */

export interface OneWayAnova {
  /** Number of groups with at least one observation. */
  k: number;
  /** Total observations. */
  n: number;
  /** Adjusted mean group size n₀ = (N - Σnᵢ²/N)/(k - 1) (equals m for balanced data). */
  n0: number;
  msBetween: number;
  msWithin: number;
  dfBetween: number;
  dfWithin: number;
  grandMean: number;
}

/** One-way random-effects ANOVA on groups (e.g. tasks) of repeated measurements. */
export function oneWayAnova(groups: ReadonlyArray<ArrayLike<number>>): OneWayAnova {
  const gs = groups.filter((g) => g.length > 0);
  const k = gs.length;
  let n = 0;
  let total = 0;
  let sumSq = 0;
  for (const g of gs) {
    n += g.length;
    for (let i = 0; i < g.length; i++) total += g[i];
    sumSq += g.length * g.length;
  }
  const grand = n ? total / n : NaN;
  let ssb = 0;
  let ssw = 0;
  for (const g of gs) {
    let s = 0;
    for (let i = 0; i < g.length; i++) s += g[i];
    const m = s / g.length;
    ssb += g.length * (m - grand) * (m - grand);
    for (let i = 0; i < g.length; i++) ssw += (g[i] - m) * (g[i] - m);
  }
  const dfB = k - 1;
  const dfW = n - k;
  return {
    k,
    n,
    n0: k > 1 ? (n - sumSq / n) / (k - 1) : NaN,
    msBetween: dfB > 0 ? ssb / dfB : NaN,
    msWithin: dfW > 0 ? ssw / dfW : NaN,
    dfBetween: dfB,
    dfWithin: dfW,
    grandMean: grand,
  };
}

export interface VarianceDecomposition {
  /** ICC(1) = (MSB - MSW)/(MSB + (n₀ - 1)MSW) (Shrout & Fleiss 1979); may be negative. */
  icc: number;
  /** Between-group variance component σ²_b = max(0, (MSB - MSW)/n₀). */
  varBetween: number;
  /** Within-group variance component σ²_w = MSW. */
  varWithin: number;
  /** σ²_w / (σ²_b + σ²_w): share of variance due to repetition noise. */
  fractionWithin: number;
  /** Reliability of a group mean of n₀ repetitions, ICC(1,k) = (MSB - MSW)/MSB (Spearman-Brown). */
  iccMean: number;
  anova: OneWayAnova;
}

/** Variance decomposition and ICC(1) for groups of repeated scores. */
export function varianceDecomposition(groups: ReadonlyArray<ArrayLike<number>>): VarianceDecomposition {
  const a = oneWayAnova(groups);
  const { msBetween: msb, msWithin: msw, n0 } = a;
  const denom = msb + (n0 - 1) * msw;
  let icc = denom > 0 ? (msb - msw) / denom : NaN;
  // All values identical: no variance at all, define ICC as NaN (undefined).
  if (msb === 0 && msw === 0) icc = NaN;
  const vb = Number.isFinite(msb) && Number.isFinite(msw) && n0 > 0 ? Math.max(0, (msb - msw) / n0) : NaN;
  const vw = msw;
  const tot = vb + vw;
  return {
    icc,
    varBetween: vb,
    varWithin: vw,
    fractionWithin: tot > 0 ? vw / tot : NaN,
    iccMean: msb > 0 ? (msb - msw) / msb : NaN,
    anova: a,
  };
}

export interface Agreement {
  /** Groups with ≥ 2 repetitions that contributed. */
  groups: number;
  /** Mean pairwise agreement: Σ_g #agreeing pairs / Σ_g C(m_g, 2). */
  pairwise: number;
  /** Share of groups where every repetition gave the same label. */
  unanimous: number;
  /**
   * Fleiss' kappa generalized to unequal group sizes: (P̄ - P̄ₑ)/(1 - P̄ₑ), with P̄ the
   * pairwise agreement above and P̄ₑ = Σⱼ pⱼ² from the pooled label frequencies.
   */
  kappa: number;
}

/** Agreement of categorical labels (correct/incorrect, extracted answer, served model) across repetitions. */
export function agreement(groups: ReadonlyArray<ReadonlyArray<string | number | boolean>>): Agreement {
  let pairs = 0;
  let agree = 0;
  let used = 0;
  let unanimous = 0;
  const pooled = new Map<string, number>();
  let pooledN = 0;
  for (const g of groups) {
    if (g.length < 2) continue;
    used++;
    const counts = new Map<string, number>();
    for (const v of g) {
      const key = String(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      pooled.set(key, (pooled.get(key) ?? 0) + 1);
      pooledN++;
    }
    let a = 0;
    for (const c of counts.values()) a += (c * (c - 1)) / 2;
    agree += a;
    pairs += (g.length * (g.length - 1)) / 2;
    if (counts.size === 1) unanimous++;
  }
  if (used === 0) return { groups: 0, pairwise: NaN, unanimous: NaN, kappa: NaN };
  const pbar = agree / pairs;
  let pe = 0;
  for (const c of pooled.values()) pe += (c / pooledN) * (c / pooledN);
  return { groups: used, pairwise: pbar, unanimous: unanimous / used, kappa: pe < 1 ? (pbar - pe) / (1 - pe) : NaN };
}
