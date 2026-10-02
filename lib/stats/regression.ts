import { mean } from "./descriptive";
import { normalInv, normalSf, studentTInv, studentTTwoSidedP } from "./special";

/** Linear and logistic regression for small numbers of predictors. */

// ---------------------------------------------------------------- linear algebra helpers

/** Inverse of a small square matrix by Gauss-Jordan elimination with partial pivoting; null if singular. */
export function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (!(Math.abs(a[piv][col]) > 1e-300)) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

/** log-determinant of a symmetric positive-definite matrix via Cholesky; NaN if not SPD. */
export function logDetSPD(m: number[][]): number {
  const n = m.length;
  const L = m.map(() => new Array<number>(n).fill(0));
  let ld = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(s > 0)) return NaN;
        L[i][i] = Math.sqrt(s);
        ld += 2 * Math.log(L[i][i]);
      } else L[i][j] = s / L[j][j];
    }
  }
  return ld;
}

// ---------------------------------------------------------------- OLS

export interface OlsFit {
  intercept: number;
  slope: number;
  seIntercept: number;
  seSlope: number;
  /** Two-sided p-value for H₀: slope = 0 (t with n - 2 df). */
  pSlope: number;
  slopeLo: number;
  slopeHi: number;
  r2: number;
  /** Residual standard error √(SSE/(n - 2)). */
  sigma: number;
  n: number;
}

/** Simple linear regression y = β₀ + β₁x + ε by ordinary least squares. */
export function ols(x: ArrayLike<number>, y: ArrayLike<number>, level = 0.95): OlsFit {
  const n = Math.min(x.length, y.length);
  const mx = mean(Array.from(x).slice(0, n));
  const my = mean(Array.from(y).slice(0, n));
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxx > 0 ? sxy / sxx : NaN;
  const intercept = my - slope * mx;
  const sse = Math.max(0, syy - slope * sxy);
  const sigma = n > 2 ? Math.sqrt(sse / (n - 2)) : NaN;
  const seSlope = sxx > 0 ? sigma / Math.sqrt(sxx) : NaN;
  const seIntercept = sigma * Math.sqrt(1 / n + (mx * mx) / sxx);
  const t = slope / seSlope;
  const q = n > 2 ? studentTInv(1 - (1 - level) / 2, n - 2) : NaN;
  return {
    intercept,
    slope,
    seIntercept,
    seSlope,
    pSlope: n > 2 ? (seSlope === 0 ? (slope === 0 ? 1 : 0) : studentTTwoSidedP(t, n - 2)) : NaN,
    slopeLo: slope - q * seSlope,
    slopeHi: slope + q * seSlope,
    r2: syy > 0 ? 1 - sse / syy : NaN,
    sigma,
    n,
  };
}

// ---------------------------------------------------------------- logistic regression

export type LogisticPenalty = "none" | "firth" | "ridge";

export interface LogisticOptions {
  /**
   * "firth" (default): Firth's (1993) bias-reduced estimator, which always exists
   * even under complete separation (common with small benchmark samples).
   * "ridge": L2 penalty λ/2·Σβⱼ² on the non-intercept coefficients. "none": plain MLE.
   */
  penalty?: LogisticPenalty;
  lambda?: number;
  maxIterations?: number;
  tolerance?: number;
  /** Optional observation weights (frequency weights). */
  weights?: ArrayLike<number>;
}

export interface LogisticFit {
  /** [intercept, β₁, ..., β_p] on the log-odds scale. */
  coef: number[];
  /** Standard errors from the inverse (penalized) Fisher information. */
  se: number[];
  /** Wald z statistics and two-sided p-values. */
  z: number[];
  p: number[];
  /** Covariance matrix of coef. */
  cov: number[][];
  logLik: number;
  iterations: number;
  converged: boolean;
  n: number;
  penalty: LogisticPenalty;
}

const sigmoid = (t: number) => (t >= 0 ? 1 / (1 + Math.exp(-t)) : Math.exp(t) / (1 + Math.exp(t)));

/**
 * Logistic regression P(y = 1 | x) = σ(β₀ + βᵀx) fitted by Newton-Raphson / IRLS
 * with step halving on the (penalized) log-likelihood:
 *   β ← β + (XᵀWX + P)⁻¹ U*(β),  W = diag(pᵢ(1 - pᵢ)),
 * where for Firth U*(β) = Xᵀ(y - p + h ⊙ (½ - p)) with h the diagonal of the hat
 * matrix W^½X(XᵀWX)⁻¹XᵀW^½, maximizing l(β) + ½ log|XᵀWX|.
 * `X` rows are predictors without the intercept column; y in {0, 1} (or proportions).
 */
export function logisticRegression(X: number[][], y: ArrayLike<number>, opts: LogisticOptions = {}): LogisticFit {
  const penalty = opts.penalty ?? "firth";
  const lambda = opts.lambda ?? 1;
  const maxIt = opts.maxIterations ?? 100;
  const tol = opts.tolerance ?? 1e-9;
  const n = Math.min(X.length, y.length);
  const p = (X[0]?.length ?? 0) + 1;
  const rows = Array.from({ length: n }, (_, i) => [1, ...X[i]]);
  const w0 = Array.from({ length: n }, (_, i) => (opts.weights ? opts.weights[i] : 1));
  const beta = new Array<number>(p).fill(0);
  // Start the intercept at the logit of the (shrunk) mean response.
  let sw = 0;
  let swy = 0;
  for (let i = 0; i < n; i++) {
    sw += w0[i];
    swy += w0[i] * y[i];
  }
  const ybar = (swy + 0.5) / (sw + 1);
  beta[0] = Math.log(ybar / (1 - ybar));

  const info = (b: number[]) => {
    const prob = new Array<number>(n);
    const F = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    for (let i = 0; i < n; i++) {
      let eta = 0;
      for (let j = 0; j < p; j++) eta += rows[i][j] * b[j];
      const pi = sigmoid(eta);
      prob[i] = pi;
      const wi = w0[i] * pi * (1 - pi);
      for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) F[j][k] += wi * rows[i][j] * rows[i][k];
    }
    if (penalty === "ridge") for (let j = 1; j < p; j++) F[j][j] += lambda;
    return { prob, F };
  };
  const objective = (b: number[]) => {
    const { prob, F } = info(b);
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const pi = Math.min(1 - 1e-300, Math.max(1e-300, prob[i]));
      ll += w0[i] * (y[i] * Math.log(pi) + (1 - y[i]) * Math.log(1 - pi));
    }
    let pen = 0;
    if (penalty === "firth") pen = 0.5 * logDetSPD(F);
    else if (penalty === "ridge") for (let j = 1; j < p; j++) pen -= 0.5 * lambda * b[j] * b[j];
    return { ll, obj: ll + (Number.isFinite(pen) ? pen : -1e300) };
  };

  let converged = false;
  let it = 0;
  let current = objective(beta);
  for (; it < maxIt; it++) {
    const { prob, F } = info(beta);
    const Finv = invert(F);
    if (!Finv) break;
    const U = new Array<number>(p).fill(0);
    for (let i = 0; i < n; i++) {
      let resid = y[i] - prob[i];
      if (penalty === "firth") {
        // hᵢ = wᵢ xᵢᵀ F⁻¹ xᵢ
        let q = 0;
        for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) q += rows[i][j] * Finv[j][k] * rows[i][k];
        const h = w0[i] * prob[i] * (1 - prob[i]) * q;
        resid += h * (0.5 - prob[i]) / Math.max(w0[i], 1e-300);
      }
      for (let j = 0; j < p; j++) U[j] += w0[i] * resid * rows[i][j];
    }
    if (penalty === "ridge") for (let j = 1; j < p; j++) U[j] -= lambda * beta[j];
    const step = new Array<number>(p).fill(0);
    for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) step[j] += Finv[j][k] * U[k];
    // Cap enormous steps (near-separation) and halve until the objective improves.
    const maxAbs = Math.max(...step.map(Math.abs));
    let scale = maxAbs > 5 ? 5 / maxAbs : 1;
    let next = beta.map((b, j) => b + scale * step[j]);
    let cand = objective(next);
    let halvings = 0;
    while (cand.obj < current.obj - 1e-12 && halvings < 30) {
      scale /= 2;
      next = beta.map((b, j) => b + scale * step[j]);
      cand = objective(next);
      halvings++;
    }
    const delta = Math.max(...next.map((v, j) => Math.abs(v - beta[j])));
    for (let j = 0; j < p; j++) beta[j] = next[j];
    current = cand;
    if (delta < tol) {
      converged = true;
      it++;
      break;
    }
  }
  const { F } = info(beta);
  const cov = invert(F) ?? Array.from({ length: p }, () => new Array<number>(p).fill(NaN));
  const se = cov.map((row, j) => Math.sqrt(Math.max(0, row[j])));
  const z = beta.map((b, j) => b / se[j]);
  return {
    coef: beta.slice(),
    se,
    z,
    p: z.map((v) => (Number.isFinite(v) ? Math.min(1, 2 * normalSf(Math.abs(v))) : NaN)),
    cov,
    logLik: current.ll,
    iterations: it,
    converged,
    n,
    penalty,
  };
}

export interface CurvePoint {
  x: number;
  /** Fitted probability. */
  p: number;
  /** Pointwise confidence band (delta method on the logit scale). */
  lo: number;
  hi: number;
}

export interface Logistic1D {
  intercept: number;
  slope: number;
  seSlope: number;
  pSlope: number;
  slopeLo: number;
  slopeHi: number;
  /** Odds ratio per unit x, e^β₁. */
  oddsRatio: number;
  converged: boolean;
  n: number;
  curve: CurvePoint[];
}

/** Single-predictor logistic regression with a plotted curve over [from, to]. */
export function logistic1d(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  opts: LogisticOptions & { from?: number; to?: number; points?: number; level?: number } = {},
): Logistic1D {
  const n = Math.min(x.length, y.length);
  const fit = logisticRegression(
    Array.from({ length: n }, (_, i) => [x[i]]),
    Array.from({ length: n }, (_, i) => y[i]),
    opts,
  );
  const z = normalInv(1 - (1 - (opts.level ?? 0.95)) / 2);
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  const m = Math.max(2, opts.points ?? 21);
  const [b0, b1] = fit.coef;
  const curve: CurvePoint[] = [];
  for (let k = 0; k < m; k++) {
    const xv = from + ((to - from) * k) / (m - 1);
    const eta = b0 + b1 * xv;
    const v = fit.cov[0][0] + 2 * xv * fit.cov[0][1] + xv * xv * fit.cov[1][1];
    const s = Math.sqrt(Math.max(0, v));
    curve.push({ x: xv, p: sigmoid(eta), lo: sigmoid(eta - z * s), hi: sigmoid(eta + z * s) });
  }
  return {
    intercept: b0,
    slope: b1,
    seSlope: fit.se[1],
    pSlope: fit.p[1],
    slopeLo: b1 - z * fit.se[1],
    slopeHi: b1 + z * fit.se[1],
    oddsRatio: Math.exp(b1),
    converged: fit.converged,
    n,
    curve,
  };
}
