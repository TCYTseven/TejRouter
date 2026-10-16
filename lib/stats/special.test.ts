import { describe, expect, it } from "vitest";
import {
  betaInv,
  binomialCdf,
  binomialPmf,
  binomialSf,
  chiSquareCdf,
  chiSquareSf,
  erf,
  erfc,
  incBetaInv,
  logGamma,
  normalCdf,
  normalInv,
  regIncBeta,
  studentTCdf,
  studentTInv,
  studentTTwoSidedP,
} from "./special";

/**
 * Reference values. scipy/mpmath are not installed in this environment, so the
 * references come from:
 *  - Python 3 stdlib: math.lgamma, math.erf/erfc, statistics.NormalDist (cdf, inv_cdf).
 *  - Exact rational arithmetic (fractions.Fraction) for the incomplete beta with
 *    integer parameters, via I_x(a,b) = Σ_{j=a}^{a+b-1} C(a+b-1,j) xʲ(1-x)^{a+b-1-j},
 *    and for binomial pmf/cdf.
 *  - Tanh-sinh quadrature of the density (Python, double precision, ~1e-9) for
 *    non-integer incomplete beta and Student-t CDFs.
 *  - Closed forms: t(1) = Cauchy, t(2), χ²(2), χ²(even k), I_x(½,½) = (2/π)asin√x.
 *  - Standard table values (t₀.₉₇₅,₁₀ = 2.228138852, χ²₀.₉₅,₁ = 3.841458821, ...).
 * The procedure is described in docs/METHODOLOGY.md, section 28 (Numerical methods and validation).
 */

describe("logGamma", () => {
  it.each([
    [0.5, 0.5723649429247004],
    [1, 0],
    [1.5, -0.12078223763524543],
    [3.7, 1.4280723266653883],
    [10, 12.801827480081467],
    [100.25, 360.2845596377643],
    [1e-3, 6.907178885383854],
  ])("lgamma(%f)", (x, ref) => {
    expect(logGamma(x)).toBeCloseTo(ref, 12);
  });
});

describe("erf / normal", () => {
  it.each([
    [0.1, 0.1124629160182849, 0.8875370839817152],
    [0.5, 0.5204998778130465, 0.4795001221869535],
    [1, 0.8427007929497149, 0.15729920705028513],
    [2, 0.9953222650189527, 0.004677734981047265],
    [3.5, 0.9999992569016276, 7.430983723414128e-7],
  ])("erf(%f)", (x, e, ec) => {
    expect(erf(x)).toBeCloseTo(e, 14);
    expect(erfc(x) / ec).toBeCloseTo(1, 12);
    expect(erf(-x)).toBeCloseTo(-e, 14);
  });

  it.each([
    [-3, 0.0013498980316301035],
    [-1.5, 0.06680720126885809],
    [0, 0.5],
    [0.3, 0.6179114221889526],
    [1, 0.8413447460685429],
    [2.5, 0.9937903346742238],
  ])("Φ(%f)", (z, ref) => {
    expect(normalCdf(z)).toBeCloseTo(ref, 14);
  });

  it("Φ in the far tail keeps relative accuracy", () => {
    expect(normalCdf(-8) / 6.220960574271819e-16).toBeCloseTo(1, 10);
  });

  it.each([
    [1e-10, -6.361340902404056],
    [0.001, -3.090232306167813],
    [0.025, -1.9599639845400538],
    [0.1, -1.2815515655446008],
    [0.5, 0],
    [0.8, 0.8416212335729144],
    [0.975, 1.9599639845400536],
    [0.999999, 4.753424308817089],
  ])("Φ⁻¹(%f)", (p, ref) => {
    expect(normalInv(p)).toBeCloseTo(ref, 9);
  });
});

describe("incomplete beta", () => {
  it.each([
    [0.3, 2, 5, 0.5798249999999999],
    [0.5, 10, 10, 0.5],
    [0.9, 3, 2, 0.9477],
    [0.05, 1, 20, 0.6415140775914577],
    [0.7, 30, 12, 0.40104779034960975],
  ])("I_%f(%f, %f) exact rational reference", (x, a, b, ref) => {
    expect(regIncBeta(x, a, b)).toBeCloseTo(ref, 13);
  });

  it("closed form I_x(½,½) = (2/π) asin √x", () => {
    expect(regIncBeta(0.6, 0.5, 0.5)).toBeCloseTo(0.564094216848975, 13);
  });

  it.each([
    [0.3, 2.5, 1.5, 0.08894372317066544],
    [0.2, 1.5, 4.25, 0.4278159942182459],
  ])("I_%f(%f, %f) quadrature reference", (x, a, b, ref) => {
    expect(regIncBeta(x, a, b)).toBeCloseTo(ref, 8);
  });

  it("inverse round-trips", () => {
    for (const [a, b] of [
      [0.5, 0.5],
      [2, 5],
      [30, 12],
      [0.3, 7],
      [1000, 3],
    ]) {
      // (1 - 1e-6 rather than 1 - 1e-8: for Beta(½,½) the latter's quantile is within
      // 3e-16 of 1, below double-precision resolution.)
      for (const p of [1e-8, 0.025, 0.3, 0.5, 0.9, 0.975, 1 - 1e-6]) {
        const x = incBetaInv(p, a, b);
        expect(regIncBeta(x, a, b)).toBeCloseTo(p, 10);
      }
    }
  });
});

describe("Student t", () => {
  it.each([
    [1.5, 3, 0.8847080673775887],
    [-2.1, 7, 0.036935598106462186],
    [0.4, 30, 0.6540047417429031],
    [1.2, 4.5, 0.8552614725790174],
  ])("F_t(%f; %f) quadrature reference", (t, df, ref) => {
    expect(studentTCdf(t, df)).toBeCloseTo(ref, 9);
  });

  it("closed forms for ν = 1 (Cauchy) and ν = 2", () => {
    expect(studentTCdf(-1, 1)).toBeCloseTo(0.25, 14);
    expect(studentTCdf(0.8, 2)).toBeCloseTo(0.5 + 0.8 / (2 * Math.sqrt(2.64)), 14);
  });

  it("table quantiles", () => {
    expect(studentTInv(0.975, 10)).toBeCloseTo(2.228138851986, 9);
    expect(studentTInv(0.975, 1)).toBeCloseTo(12.7062047361747, 8);
    expect(studentTInv(0.995, 30)).toBeCloseTo(2.749995653567, 8);
    expect(studentTInv(0.025, 5)).toBeCloseTo(-2.570581835636, 9);
  });

  it("two-sided p is consistent with the CDF", () => {
    expect(studentTTwoSidedP(2.1213203435596424, 3)).toBeCloseTo(0.12402706265755592, 9);
  });
});

describe("chi-square", () => {
  it("closed forms and table values", () => {
    expect(chiSquareCdf(3, 2)).toBeCloseTo(1 - Math.exp(-1.5), 14);
    expect(chiSquareCdf(10, 4)).toBeCloseTo(0.9595723180054871, 13);
    expect(chiSquareCdf(18.307038053275, 10)).toBeCloseTo(0.95, 11);
    expect(chiSquareCdf(3.841458820694124, 1)).toBeCloseTo(0.95, 13);
    expect(chiSquareCdf(2, 3)).toBeCloseTo(0.4275932955291202, 13);
    expect(chiSquareSf(3.841458820694124, 1)).toBeCloseTo(0.05, 13);
  });
});

describe("binomial", () => {
  it("pmf / cdf vs exact rational arithmetic", () => {
    expect(binomialPmf(3, 10, 0.3)).toBeCloseTo(0.266827932, 13);
    expect(binomialCdf(3, 10, 0.3)).toBeCloseTo(0.6496107184, 13);
    expect(binomialCdf(40, 100, 0.5)).toBeCloseTo(0.028443966820490395, 13);
    expect(binomialPmf(50, 100, 0.5)).toBeCloseTo(0.07958923738717877, 13);
    expect(binomialSf(41, 100, 0.5) + binomialCdf(40, 100, 0.5)).toBeCloseTo(1, 13);
  });
});

describe("beta quantile", () => {
  it("Beta(1, b) quantile has closed form 1 - (1 - p)^(1/b)", () => {
    expect(betaInv(0.3, 1, 4)).toBeCloseTo(1 - Math.pow(0.7, 0.25), 13);
  });
});
