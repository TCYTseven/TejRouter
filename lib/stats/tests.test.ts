import { describe, expect, it } from "vitest";
import {
  benjaminiHochberg,
  binomialTest,
  chiSquareIndependence,
  holmAdjust,
  mannWhitneyU,
  mcnemar,
  pairedTTest,
  permutationTestPaired,
  permutationTestTwoSample,
  signTest,
  welchTTest,
  wilcoxonSignedRank,
} from "./tests";
import { cliffsDelta, cohenD, hedgesG, hedgesJ } from "./effect";

/**
 * Reference p-values were computed independently in Python 3 (stdlib only):
 * t statistics by hand + t CDF by tanh-sinh quadrature, exact rank tests by full
 * enumeration of all sign patterns / subsets, binomial tails with exact fractions.
 */

describe("t tests", () => {
  it("Welch two-sample", () => {
    const r = welchTTest([19.1, 21.4, 18.8, 22.0, 20.5, 19.9, 23.1], [17.2, 18.9, 16.5, 19.4, 18.0]);
    expect(r.statistic).toBeCloseTo(3.3700452264871252, 10);
    expect(r.df).toBeCloseTo(9.914130667180132, 10);
    expect(r.pValue).toBeCloseTo(0.007206533531788795, 8);
    expect(r.ciLo).toBeLessThan(r.estimate);
  });

  it("paired", () => {
    const r = pairedTTest([5.1, 4.8, 6.0, 5.5, 5.9, 4.7, 5.2, 6.1], [4.9, 4.9, 5.4, 5.0, 5.6, 4.8, 4.9, 5.5]);
    expect(r.statistic).toBeCloseTo(2.9043208718479225, 10);
    expect(r.df).toBe(7);
    expect(r.pValue).toBeCloseTo(0.02284473417342281, 8);
  });

  it("degenerate inputs", () => {
    expect(pairedTTest([1, 1, 1], [1, 1, 1]).pValue).toBe(1);
    expect(pairedTTest([2, 2, 2], [1, 1, 1]).pValue).toBe(0);
    expect(Number.isNaN(welchTTest([1], [2, 3]).pValue)).toBe(true);
  });
});

describe("rank tests", () => {
  it("Mann-Whitney exact (no ties) vs full enumeration", () => {
    const r = mannWhitneyU([1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3], [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.07, 3.14, 1.31]);
    expect(r.exact).toBe(true);
    expect(r.u).toBe(57);
    expect(r.pValue).toBeCloseTo(0.16149732620320856, 12);
  });

  it("Mann-Whitney normal approximation with ties", () => {
    const r = mannWhitneyU([1, 2, 2, 3, 4, 5, 5, 5, 6, 7, 8, 9], [3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11]);
    expect(r.exact).toBe(false);
    expect(r.u).toBe(42);
    expect(r.z).toBeCloseTo(-1.9410502733602548, 10);
    expect(r.pValue).toBeCloseTo(0.052252179774957705, 10);
    // rank-biserial equals Cliff's delta
    expect(r.rankBiserial).toBeCloseTo(cliffsDelta([1, 2, 2, 3, 4, 5, 5, 5, 6, 7, 8, 9], [3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11]).estimate, 12);
  });

  it("Wilcoxon signed-rank exact vs enumeration", () => {
    const a = [3, -1, 6, 5, 2.5, -2, 4, 7, 1.5];
    const r = wilcoxonSignedRank(a);
    expect(r.exact).toBe(true);
    expect(r.wPlus).toBe(41);
    expect(r.pValue).toBeCloseTo(0.02734375, 12);
  });

  it("Wilcoxon signed-rank exact with tied ranks (conditional distribution)", () => {
    const r = wilcoxonSignedRank([2, -1, 2, 3, -2, 4, 4, 5, 1, 2]);
    expect(r.wPlus).toBe(49);
    expect(r.pValue).toBeCloseTo(0.03125, 12);
  });

  it("Wilcoxon normal approximation (n > 50) with ties and zeros", () => {
    const d = [
      -0.9, -0.8, 1.0, -2.0, 0.2, -2.0, 1.4, 0.5, 1.7, -0.2, 0.7, 0.0, -0.4, 0.4, -1.0, -0.1, 1.0, 0.4, -0.1, 2.5, 0.4, -0.3, 0.5, -0.2, -0.1,
      -0.1, 2.3, 0.3, 0.5, 1.0, 2.3, 0.1, -0.3, 2.8, -1.2, -0.1, 1.0, 2.6, -0.6, -2.1, 1.0, -0.2, -0.1, 0.8, 0.5, 0.6, -0.1, 1.6, 1.8, 0.3, -0.2,
      1.0, 0.8, -0.7, -0.2, 1.3, 0.2, -0.0, 0.5, 0.3,
    ];
    const r = wilcoxonSignedRank(d);
    expect(r.exact).toBe(false);
    expect(r.n).toBe(58);
    expect(r.zeros).toBe(2);
    expect(r.wPlus).toBe(1184);
    expect(r.z).toBeCloseTo(2.5419102006648853, 10);
    expect(r.pValue).toBeCloseTo(0.011024849450893425, 10);
  });
});

describe("binomial-family tests", () => {
  it("sign test 2 of 12", () => {
    const a = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const b = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    expect(signTest(a, b).pValue).toBeCloseTo(0.03857421875, 14);
  });

  it("McNemar exact and χ² with continuity correction", () => {
    const r = mcnemar(12, 4);
    expect(r.pExact).toBeCloseTo(0.076812744140625, 14);
    expect(r.chiSquare).toBeCloseTo(3.0625, 14);
    expect(r.pChiSquare).toBeCloseTo(0.08011831372763419, 12);
    expect(r.pMid).toBeLessThan(r.pExact);
    expect(mcnemar(0, 0).pValue).toBe(1);
  });

  it("binomial test p0 ≠ ½ (R minlike method)", () => {
    // Sum of exact (Fraction) pmfs of outcomes with pmf ≤ pmf(3)·(1 + 1e-7), as in R's binom.test.
    expect(binomialTest(3, 20, 0.4).pValue).toBeCloseTo(0.02242703814204326, 12);
  });
});

describe("permutation tests", () => {
  it("paired exact enumeration (n ≤ 16)", () => {
    const r = permutationTestPaired([0.9, 0.7, 0.8, 1.0, 0.6, 0.75, 0.95, 0.85], [0.8, 0.72, 0.6, 0.9, 0.65, 0.7, 0.85, 0.7]);
    expect(r.exact).toBe(true);
    expect(r.pValue).toBeCloseTo(0.046875, 12);
  });

  it("paired Monte Carlo agrees with paired t on a large sample and is seeded", () => {
    const a = Array.from({ length: 60 }, (_, i) => Math.sin(i) + 0.3);
    const b = Array.from({ length: 60 }, (_, i) => Math.sin(i) + Math.cos(i * 3) * 0.8);
    const r1 = permutationTestPaired(a, b, { iterations: 4000, seed: 7 });
    const r2 = permutationTestPaired(a, b, { iterations: 4000, seed: 7 });
    expect(r1.pValue).toBe(r2.pValue);
    expect(Math.abs(r1.pValue - pairedTTest(a, b).pValue)).toBeLessThan(0.03);
  });

  it("two-sample permutation agrees with Welch roughly", () => {
    const a = Array.from({ length: 40 }, (_, i) => Math.cos(i) + 0.5);
    const b = Array.from({ length: 40 }, (_, i) => Math.cos(i * 1.3));
    const r = permutationTestTwoSample(a, b, { iterations: 4000, seed: 3 });
    expect(Math.abs(r.pValue - welchTTest(a, b).pValue)).toBeLessThan(0.03);
  });
});

describe("contingency", () => {
  it("χ² of independence (hand-computed)", () => {
    // Expected counts all 25 → χ² = 4·(5²/25) = 4, df 1
    const r = chiSquareIndependence([
      [30, 20],
      [20, 30],
    ]);
    expect(r.statistic).toBeCloseTo(4, 12);
    expect(r.df).toBe(1);
    expect(r.pValue).toBeCloseTo(0.04550026389635842, 10);
    expect(r.cramersV).toBeCloseTo(0.2, 12);
  });
});

describe("multiple comparisons", () => {
  it("Holm and BH on a hand-checked example", () => {
    const ps = [0.01, 0.04, 0.03, 0.005];
    const holm = holmAdjust(ps);
    [0.03, 0.06, 0.06, 0.02].forEach((v, i) => expect(holm[i]).toBeCloseTo(v, 14));
    const bh = benjaminiHochberg(ps);
    [0.02, 0.04, 0.04, 0.02].forEach((v, i) => expect(bh[i]).toBeCloseTo(v, 14));
  });

  it("passes through NaN", () => {
    const h = holmAdjust([0.01, NaN, 0.02]);
    expect(h[0]).toBeCloseTo(0.02, 14);
    expect(Number.isNaN(h[1])).toBe(true);
    expect(h[2]).toBeCloseTo(0.02, 14);
  });
});

describe("effect sizes", () => {
  it("Cohen's d and Hedges' g", () => {
    const a = [2, 4, 6];
    const b = [1, 3, 5];
    // pooled sd = 2, d = 0.5
    expect(cohenD(a, b).estimate).toBeCloseTo(0.5, 14);
    // J(4) = Γ(2)/(√2 Γ(1.5)) = 1/(√2·√π/2) = 0.7978845608
    expect(hedgesJ(4)).toBeCloseTo(0.7978845608028654, 12);
    expect(hedgesG(a, b).estimate).toBeCloseTo(0.5 * 0.7978845608028654, 12);
  });

  it("Cliff's delta brute force", () => {
    const a = [1, 5, 3, 3, 9];
    const b = [2, 3, 4];
    let g = 0;
    let l = 0;
    for (const x of a)
      for (const y of b) {
        if (x > y) g++;
        if (x < y) l++;
      }
    const r = cliffsDelta(a, b);
    expect(r.estimate).toBeCloseTo((g - l) / 15, 14);
    expect(r.lo).toBeLessThan(r.estimate);
    expect(r.hi).toBeGreaterThan(r.estimate);
    expect(cliffsDelta([10, 11], [1, 2]).estimate).toBe(1);
    expect(cliffsDelta([10, 11], [1, 2]).magnitude).toBe("large");
  });
});
