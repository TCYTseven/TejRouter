/**
 * Special functions and distribution functions, implemented from first principles.
 *
 * References:
 * - Lanczos log-gamma, g = 7, n = 9 coefficients (Godfrey; as used by Boost and many others).
 * - Regularized incomplete beta via the modified Lentz continued fraction and its
 *   inverse via Halley iterations: Press et al., Numerical Recipes 3rd ed., sec. 6.4.
 * - Regularized incomplete gamma: series / continued fraction, Numerical Recipes sec. 6.2.
 * - Inverse normal: P. J. Acklam's rational approximation polished by one Halley step,
 *   giving ~1e-15 relative accuracy.
 *
 * Accuracy is validated against reference values in special.test.ts.
 */

const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];
const LN_SQRT_2PI = 0.9189385332046727;

/** ln Γ(x) for x > 0 (reflection is used for x < 0.5). */
export function logGamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x <= 0 && Number.isInteger(x)) return Infinity;
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  const z = x - 1;
  let s = LANCZOS[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) s += LANCZOS[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return LN_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(s);
}

/** ln B(a, b) = ln Γ(a) + ln Γ(b) - ln Γ(a+b). */
export function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/** ln C(n, k). */
export function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

const FPMIN = 1e-300;

function betacf(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b) for a, b > 0, x in [0, 1]. */
export function regIncBeta(x: number, a: number, b: number): number {
  if (Number.isNaN(x) || !(a > 0) || !(b > 0)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = a * Math.log(x) + b * Math.log1p(-x) - logBeta(a, b);
  const bt = Math.exp(lbt);
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(x, a, b)) / a;
  return 1 - (bt * betacf(1 - x, b, a)) / b;
}

/** Inverse of the regularized incomplete beta: x such that I_x(a, b) = p. */
export function incBetaInv(p: number, a: number, b: number): number {
  if (Number.isNaN(p) || !(a > 0) || !(b > 0)) return NaN;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const a1 = a - 1;
  const b1 = b - 1;
  let x: number;
  let t: number;
  if (a >= 1 && b >= 1) {
    const pp = p < 0.5 ? p : 1 - p;
    t = Math.sqrt(-2 * Math.log(pp));
    x = (2.30753 + t * 0.27061) / (1 + t * (0.99229 + t * 0.04481)) - t;
    if (p < 0.5) x = -x;
    const al = (x * x - 3) / 6;
    const h = 2 / (1 / (2 * a - 1) + 1 / (2 * b - 1));
    const w = (x * Math.sqrt(al + h)) / h - (1 / (2 * b - 1) - 1 / (2 * a - 1)) * (al + 5 / 6 - 2 / (3 * h));
    x = a / (a + b * Math.exp(2 * w));
  } else {
    const lna = Math.log(a / (a + b));
    const lnb = Math.log(b / (a + b));
    t = Math.exp(a * lna) / a;
    const u = Math.exp(b * lnb) / b;
    const w = t + u;
    if (p < t / w) x = Math.pow(a * w * p, 1 / a);
    else x = 1 - Math.pow(b * w * (1 - p), 1 / b);
  }
  const afac = -logBeta(a, b);
  for (let j = 0; j < 20; j++) {
    if (x <= 0 || x >= 1) break;
    const err = regIncBeta(x, a, b) - p;
    t = Math.exp(a1 * Math.log(x) + b1 * Math.log1p(-x) + afac);
    const u = err / t;
    t = u / (1 - 0.5 * Math.min(1, u * (a1 / x - b1 / (1 - x))));
    x -= t;
    if (x <= 0) x = 0.5 * (x + t);
    if (x >= 1) x = 0.5 * (x + t + 1);
    if (Math.abs(t) < 1e-14 * x && j > 0) break;
  }
  // Safeguard: bisection polish if Halley wandered (extreme parameters).
  if (!(x > 0 && x < 1) || Math.abs(regIncBeta(x, a, b) - p) > 1e-12 * Math.max(p, 1e-300) + 1e-15) {
    let lo = 0;
    let hi = 1;
    if (x > 0 && x < 1) {
      if (regIncBeta(x, a, b) < p) lo = x;
      else hi = x;
    }
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (regIncBeta(mid, a, b) < p) lo = mid;
      else hi = mid;
      if (hi - lo < 1e-16) break;
    }
    x = 0.5 * (lo + hi);
  }
  return x;
}

/** Regularized lower incomplete gamma P(a, x). */
export function regGammaP(a: number, x: number): number {
  if (Number.isNaN(x) || !(a > 0)) return NaN;
  if (x <= 0) return 0;
  if (x === Infinity) return 1;
  if (x < a + 1) return gammaSeries(a, x);
  return 1 - gammaCf(a, x);
}

/** Regularized upper incomplete gamma Q(a, x) = 1 - P(a, x), computed without cancellation. */
export function regGammaQ(a: number, x: number): number {
  if (Number.isNaN(x) || !(a > 0)) return NaN;
  if (x <= 0) return 1;
  if (x === Infinity) return 0;
  if (x < a + 1) return 1 - gammaSeries(a, x);
  return gammaCf(a, x);
}

function gammaSeries(a: number, x: number): number {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < 100000; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gammaCf(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 100000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Error function. */
export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  return x >= 0 ? regGammaP(0.5, x * x) : -regGammaP(0.5, x * x);
}

/** Complementary error function, accurate in the tails. */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  return x >= 0 ? regGammaQ(0.5, x * x) : 1 + regGammaP(0.5, x * x);
}

/** Standard normal density. */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z - LN_SQRT_2PI);
}

/** Standard normal CDF Φ(z). */
export function normalCdf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Standard normal survival 1 - Φ(z), accurate for large z. */
export function normalSf(z: number): number {
  return normalCdf(-z);
}

const ACK_A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const ACK_B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const ACK_C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const ACK_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

/** Inverse standard normal CDF Φ⁻¹(p). */
export function normalInv(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const plow = 0.02425;
  let x: number;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((ACK_C[0] * q + ACK_C[1]) * q + ACK_C[2]) * q + ACK_C[3]) * q + ACK_C[4]) * q + ACK_C[5]) /
      ((((ACK_D[0] * q + ACK_D[1]) * q + ACK_D[2]) * q + ACK_D[3]) * q + 1);
  } else if (p <= 1 - plow) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((ACK_A[0] * r + ACK_A[1]) * r + ACK_A[2]) * r + ACK_A[3]) * r + ACK_A[4]) * r + ACK_A[5]) * q) /
      (((((ACK_B[0] * r + ACK_B[1]) * r + ACK_B[2]) * r + ACK_B[3]) * r + ACK_B[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log1p(-p));
    x = -(((((ACK_C[0] * q + ACK_C[1]) * q + ACK_C[2]) * q + ACK_C[3]) * q + ACK_C[4]) * q + ACK_C[5]) /
      ((((ACK_D[0] * q + ACK_D[1]) * q + ACK_D[2]) * q + ACK_D[3]) * q + 1);
  }
  // One Halley refinement step using an accurate CDF (work in the smaller tail).
  for (let k = 0; k < 2; k++) {
    // e = Φ(x) - p, evaluated in whichever tail avoids cancellation.
    const e = x < 0 ? normalCdf(x) - p : (1 - p) - normalSf(x);
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

/** Student-t density with ν degrees of freedom. */
export function studentTPdf(t: number, df: number): number {
  return Math.exp(logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log1p((t * t) / df));
}

/** Student-t CDF with ν > 0 degrees of freedom (ν may be fractional, e.g. Welch). */
export function studentTCdf(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  if (df === Infinity) return normalCdf(t);
  const x = df / (df + t * t);
  const tail = 0.5 * regIncBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** Two-sided p-value P(|T| ≥ |t|) for Student-t, computed without cancellation. */
export function studentTTwoSidedP(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (df === Infinity) return Math.min(1, 2 * normalSf(Math.abs(t)));
  return Math.min(1, regIncBeta(df / (df + t * t), df / 2, 0.5));
}

/** Inverse Student-t CDF. */
export function studentTInv(p: number, df: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1 || !(df > 0)) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  if (df === Infinity) return normalInv(p);
  const lower = p < 0.5 ? p : 1 - p;
  const x = incBetaInv(2 * lower, df / 2, 0.5);
  let t = Math.sqrt((df * (1 - x)) / Math.max(x, 1e-300));
  if (p < 0.5) t = -t;
  // Newton polish on the CDF.
  for (let i = 0; i < 4; i++) {
    const f = studentTCdf(t, df) - p;
    const d = studentTPdf(t, df);
    if (!(d > 0)) break;
    const step = f / d;
    t -= step;
    if (Math.abs(step) < 1e-14 * Math.max(1, Math.abs(t))) break;
  }
  return t;
}

/** Chi-square CDF with k degrees of freedom. */
export function chiSquareCdf(x: number, k: number): number {
  if (x <= 0) return 0;
  return regGammaP(k / 2, x / 2);
}

/** Chi-square survival function 1 - CDF (accurate for small p-values). */
export function chiSquareSf(x: number, k: number): number {
  if (x <= 0) return 1;
  return regGammaQ(k / 2, x / 2);
}

/** Beta(a, b) CDF. */
export function betaCdf(x: number, a: number, b: number): number {
  return regIncBeta(x, a, b);
}

/** Beta(a, b) quantile. */
export function betaInv(p: number, a: number, b: number): number {
  return incBetaInv(p, a, b);
}

/** Beta(a, b) log-density. */
export function betaLogPdf(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) return -Infinity;
  if (x === 0) return a < 1 ? Infinity : a === 1 ? -logBeta(a, b) : -Infinity;
  if (x === 1) return b < 1 ? Infinity : b === 1 ? -logBeta(a, b) : -Infinity;
  return (a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - logBeta(a, b);
}

/** Binomial probability mass P(X = k), X ~ Bin(n, p). */
export function binomialPmf(k: number, n: number, p: number): number {
  if (!Number.isInteger(k) || k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}

/** Binomial CDF P(X ≤ k). Uses the incomplete-beta identity P(X ≤ k) = I_{1-p}(n-k, k+1). */
export function binomialCdf(k: number, n: number, p: number): number {
  k = Math.floor(k);
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  return regIncBeta(1 - p, n - k, k + 1);
}

/** Binomial upper tail P(X ≥ k). */
export function binomialSf(k: number, n: number, p: number): number {
  k = Math.ceil(k);
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return regIncBeta(p, k, n - k + 1);
}
