import { betaInv, betaLogPdf, logBeta, regIncBeta } from "./special";
import { mulberry32, randBeta } from "./rng";
import { quantile, sortedAsc } from "./descriptive";

/**
 * Beta-Binomial conjugate analysis of accuracy.
 * Prior p ~ Beta(a₀, b₀) (default uniform Beta(1, 1)); after s successes and f
 * failures the posterior is Beta(a₀ + s, b₀ + f).
 */

export interface BetaPosterior {
  alpha: number;
  beta: number;
  mean: number;
  /** Posterior mode (MAP), NaN when undefined (α ≤ 1 or β ≤ 1 with the other side). */
  mode: number;
  sd: number;
  /** Equal-tailed credible interval. */
  lo: number;
  hi: number;
  /** Highest-density interval (shortest interval with the given mass). */
  hdiLo: number;
  hdiHi: number;
  level: number;
}

export function betaPosterior(successes: number, failures: number, opts: { priorA?: number; priorB?: number; level?: number } = {}): BetaPosterior {
  const a = (opts.priorA ?? 1) + successes;
  const b = (opts.priorB ?? 1) + failures;
  const level = opts.level ?? 0.95;
  const m = a / (a + b);
  const v = (a * b) / ((a + b) * (a + b) * (a + b + 1));
  const mode = a > 1 && b > 1 ? (a - 1) / (a + b - 2) : a <= 1 && b > 1 ? 0 : b <= 1 && a > 1 ? 1 : NaN;
  const tail = (1 - level) / 2;
  const [hdiLo, hdiHi] = betaHdi(a, b, level);
  return { alpha: a, beta: b, mean: m, mode, sd: Math.sqrt(v), lo: betaInv(tail, a, b), hi: betaInv(1 - tail, a, b), hdiLo, hdiHi, level };
}

/**
 * Highest-density interval of Beta(a, b): minimize F⁻¹(p + level) - F⁻¹(p) over
 * p ∈ [0, 1 - level] by golden-section search (the width is unimodal in p for
 * unimodal densities).
 */
export function betaHdi(a: number, b: number, level = 0.95): [number, number] {
  const width = (p: number) => betaInv(p + level, a, b) - betaInv(p, a, b);
  let lo = 0;
  let hi = 1 - level;
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo);
  let d = lo + gr * (hi - lo);
  let fc = width(c);
  let fd = width(d);
  for (let i = 0; i < 80; i++) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - gr * (hi - lo);
      fc = width(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + gr * (hi - lo);
      fd = width(d);
    }
    if (hi - lo < 1e-10) break;
  }
  // Compare with the boundary solutions (J- or U-shaped densities).
  const p = (lo + hi) / 2;
  const cands: [number, number][] = [
    [betaInv(p, a, b), betaInv(p + level, a, b)],
    [0, betaInv(level, a, b)],
    [betaInv(1 - level, a, b), 1],
  ];
  cands.sort((x, y) => x[1] - x[0] - (y[1] - y[0]));
  return cands[0];
}

export type ProbGreaterMethod = "auto" | "exact" | "numeric" | "monte-carlo";

/**
 * P(X > Y) for independent X ~ Beta(a₁, b₁), Y ~ Beta(a₂, b₂).
 *
 * - "exact": closed form valid when a₁ is a positive integer (Miller 2015, from the
 *   identity for Beta tails):
 *     P(X > Y) = Σ_{i=0}^{a₁-1} B(a₂ + i, b₁ + b₂) / ((b₁ + i) B(1 + i, b₁) B(a₂, b₂))
 * - "numeric": ∫ f_X(x) F_Y(x) dx with composite Simpson on 2000 panels over the
 *   central 1 - 1e-12 mass of X (works for any real parameters).
 * - "monte-carlo": seeded draws from both posteriors.
 * "auto" uses exact when applicable (a₁ integer ≤ 20000), else numeric.
 */
export function probGreater(
  a1: number,
  b1: number,
  a2: number,
  b2: number,
  opts: { method?: ProbGreaterMethod; draws?: number; seed?: number } = {},
): number {
  const method = opts.method ?? "auto";
  const exactOk = Number.isInteger(a1) && a1 >= 1 && a1 <= 20000;
  if (method === "exact" || (method === "auto" && exactOk)) {
    if (!exactOk) throw new Error("exact P(X>Y) needs integer a1 ≥ 1");
    let total = 0;
    const lb2 = logBeta(a2, b2);
    for (let i = 0; i < a1; i++) {
      total += Math.exp(logBeta(a2 + i, b1 + b2) - Math.log(b1 + i) - logBeta(1 + i, b1) - lb2);
    }
    // Miller's formula for P(p_B > p_A) with p_B = X ~ Beta(a₁, b₁), p_A = Y ~ Beta(a₂, b₂).
    return Math.min(1, Math.max(0, total));
  }
  if (method === "monte-carlo") {
    const draws = opts.draws ?? 20000;
    const rand = mulberry32(opts.seed ?? 1);
    let wins = 0;
    for (let i = 0; i < draws; i++) if (randBeta(rand, a1, b1) > randBeta(rand, a2, b2)) wins++;
    return wins / draws;
  }
  const lo = betaInv(1e-12, a1, b1);
  const hi = betaInv(1 - 1e-12, a1, b1);
  const panels = 2000;
  const h = (hi - lo) / panels;
  if (!(h > 0)) return regIncBeta(lo, a2, b2);
  let acc = 0;
  for (let k = 0; k <= panels; k++) {
    const x = lo + k * h;
    const w = k === 0 || k === panels ? 1 : k % 2 ? 4 : 2;
    const fx = Math.exp(betaLogPdf(x, a1, b1));
    if (Number.isFinite(fx)) acc += w * fx * regIncBeta(x, a2, b2);
  }
  return Math.min(1, Math.max(0, (acc * h) / 3));
}

/**
 * Posterior summary of the difference θ_X - θ_Y between two Beta posteriors by
 * seeded Monte Carlo: mean and equal-tailed credible interval.
 */
export function betaDifference(
  a1: number,
  b1: number,
  a2: number,
  b2: number,
  opts: { draws?: number; seed?: number; level?: number } = {},
): { mean: number; lo: number; hi: number; level: number } {
  const draws = opts.draws ?? 10000;
  const level = opts.level ?? 0.95;
  const rand = mulberry32(opts.seed ?? 1);
  const d = new Array<number>(draws);
  let s = 0;
  for (let i = 0; i < draws; i++) {
    d[i] = randBeta(rand, a1, b1) - randBeta(rand, a2, b2);
    s += d[i];
  }
  const sd = sortedAsc(d);
  return { mean: s / draws, lo: quantile(sd, (1 - level) / 2, true), hi: quantile(sd, 1 - (1 - level) / 2, true), level };
}
