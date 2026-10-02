import { describe, expect, it } from "vitest";
import { betaDifference, betaPosterior, probGreater } from "./bayes";
import { betaCdf } from "./special";
import { bootstrapCI, bootstrapMean, bootstrapMedian, clusterBootstrap, pooledMean } from "./bootstrap";
import { mulberry32, randNormal } from "./rng";
import { tInterval } from "./intervals";
import { bradleyTerry, bradleyTerryBootstrap, eloWinProbability, onlineElo, type PairwiseMatch } from "./ranking";
import { contingency, entropy, entropyMillerMadow, jsDivergence, jsDivergenceRecords, klDivergence, mutualInformation, normalizedEntropy } from "./info";
import { logistic1d, logisticRegression, ols } from "./regression";
import { aiq, dominanceRelations, hullQualityAt, nonDecreasingHull, paretoFrontier, upperConvexHull } from "./costquality";
import {
  designEffect,
  mdePairedProportions,
  mdeTwoProportions,
  powerTwoProportions,
  requiredNPairedProportions,
  requiredNTwoProportions,
} from "./power";
import { agreement, varianceDecomposition } from "./reliability";

describe("Bayesian Beta-Binomial", () => {
  it("posterior moments and intervals", () => {
    const p = betaPosterior(7, 3);
    expect(p.alpha).toBe(8);
    expect(p.beta).toBe(4);
    expect(p.mean).toBeCloseTo(2 / 3, 14);
    expect(p.mode).toBeCloseTo(0.7, 14);
    expect(betaCdf(p.lo, 8, 4)).toBeCloseTo(0.025, 10);
    expect(betaCdf(p.hi, 8, 4)).toBeCloseTo(0.975, 10);
    // HDI is no wider than the equal-tailed interval and has the same mass
    expect(p.hdiHi - p.hdiLo).toBeLessThanOrEqual(p.hi - p.lo + 1e-12);
    expect(betaCdf(p.hdiHi, 8, 4) - betaCdf(p.hdiLo, 8, 4)).toBeCloseTo(0.95, 8);
  });

  it("P(X > Y) analytic cases", () => {
    // X ~ Beta(2,1) (density 2x), Y ~ U(0,1): P = ∫ 2x·x dx = 2/3
    expect(probGreater(2, 1, 1, 1)).toBeCloseTo(2 / 3, 13);
    expect(probGreater(1, 1, 2, 1)).toBeCloseTo(1 / 3, 13);
    expect(probGreater(5, 5, 5, 5)).toBeCloseTo(0.5, 13);
  });

  it("exact, numeric and Monte Carlo agree", () => {
    const exact = probGreater(41, 61, 30, 72, { method: "exact" });
    const numeric = probGreater(41, 61, 30, 72, { method: "numeric" });
    const mc = probGreater(41, 61, 30, 72, { method: "monte-carlo", draws: 40000, seed: 3 });
    expect(numeric).toBeCloseTo(exact, 8);
    expect(Math.abs(mc - exact)).toBeLessThan(0.01);
    // non-integer parameters use the numeric path
    const frac = probGreater(40.5, 61.2, 30.1, 72.3);
    expect(Math.abs(frac - exact)).toBeLessThan(0.02);
  });

  it("difference credible interval is seeded", () => {
    const a = betaDifference(41, 61, 30, 72, { seed: 1 });
    const b = betaDifference(41, 61, 30, 72, { seed: 1 });
    expect(a).toEqual(b);
    expect(a.mean).toBeCloseTo(41 / 102 - 30 / 102, 2);
  });
});

describe("bootstrap", () => {
  const rand = mulberry32(42);
  const normal = Array.from({ length: 200 }, () => 10 + 2 * randNormal(rand));

  it("percentile CI on a mean ≈ t interval, and is reproducible", () => {
    const b = bootstrapMean(normal, { seed: 1, iterations: 4000 });
    const t = tInterval(normal);
    expect(b.lo).toBeCloseTo(t.lo, 1);
    expect(b.hi).toBeCloseTo(t.hi, 1);
    expect(bootstrapMean(normal, { seed: 1, iterations: 4000 })).toEqual(b);
  });

  it("BCa shifts the interval right for right-skewed data", () => {
    const r = mulberry32(9);
    const expo = Array.from({ length: 60 }, () => -Math.log(1 - r()));
    const pct = bootstrapMean(expo, { seed: 2, iterations: 4000 });
    const bca = bootstrapMean(expo, { seed: 2, iterations: 4000, method: "bca" });
    expect(bca.hi).toBeGreaterThan(pct.hi);
    expect(bca.lo).toBeGreaterThan(pct.lo);
  });

  it("median CI brackets the median", () => {
    const m = bootstrapMedian(normal, { seed: 4 });
    expect(m.lo).toBeLessThan(m.estimate);
    expect(m.hi).toBeGreaterThan(m.estimate);
    expect(bootstrapCI([], undefined, {}).iterations).toBe(0);
  });

  it("cluster bootstrap is wider than the naive bootstrap for clustered data", () => {
    const r = mulberry32(5);
    const clusters: number[][] = [];
    for (let t = 0; t < 40; t++) {
      const effect = randNormal(r);
      clusters.push(Array.from({ length: 5 }, () => effect + 0.1 * randNormal(r)));
    }
    const cl = clusterBootstrap(clusters, pooledMean, { seed: 1, iterations: 2000 });
    const naive = bootstrapMean(clusters.flat(), { seed: 1, iterations: 2000 });
    expect(cl.hi - cl.lo).toBeGreaterThan(1.5 * (naive.hi - naive.lo));
  });
});

describe("Bradley-Terry", () => {
  it("two players, plain MLE: odds = wins ratio", () => {
    const matches: PairwiseMatch[] = [
      { a: "A", b: "B", scoreA: 1 },
      { a: "A", b: "B", scoreA: 1 },
      { a: "A", b: "B", scoreA: 1 },
      { a: "A", b: "B", scoreA: 0 },
    ];
    const fit = bradleyTerry(["A", "B"], matches, { prior: 0 });
    expect(fit.strengths[0] / fit.strengths[1]).toBeCloseTo(3, 8);
    expect(fit.ratings[0] - fit.ratings[1]).toBeCloseTo(400 * Math.log10(3), 6);
    expect(eloWinProbability(fit.ratings[0], fit.ratings[1])).toBeCloseTo(0.75, 8);
  });

  it("satisfies the likelihood equations Wᵢ = Σⱼ nᵢⱼ pᵢ/(pᵢ+pⱼ); ties count ½", () => {
    const matches: PairwiseMatch[] = [
      { a: "A", b: "B", scoreA: 1 },
      { a: "A", b: "B", scoreA: 0.5 },
      { a: "B", b: "C", scoreA: 1 },
      { a: "C", b: "A", scoreA: 1 },
      { a: "A", b: "C", scoreA: 1 },
      { a: "B", b: "C", scoreA: 0 },
      { a: "B", b: "A", scoreA: 1 },
    ];
    const items = ["A", "B", "C"];
    const fit = bradleyTerry(items, matches, { prior: 0 });
    const p = Object.fromEntries(items.map((id, i) => [id, fit.strengths[i]]));
    for (const id of items) {
      let w = 0;
      let e = 0;
      for (const m of matches) {
        if (m.a === id) {
          w += m.scoreA;
          e += p[id] / (p[id] + p[m.b]);
        } else if (m.b === id) {
          w += 1 - m.scoreA;
          e += p[id] / (p[id] + p[m.a]);
        }
      }
      expect(e).toBeCloseTo(w, 8);
    }
  });

  it("recovers known strengths from synthetic data, with bootstrap CIs covering truth", () => {
    const truth: Record<string, number> = { a: 1100, b: 1050, c: 1000, d: 900, e: 950 };
    const items = Object.keys(truth);
    const rand = mulberry32(11);
    const matches: PairwiseMatch[] = [];
    for (let g = 0; g < 600; g++) {
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
          const p = eloWinProbability(truth[items[i]], truth[items[j]]);
          matches.push({ a: items[i], b: items[j], scoreA: rand() < p ? 1 : 0, group: `t${g}` });
        }
    }
    const bt = bradleyTerryBootstrap(items, matches, { iterations: 200, seed: 1 });
    const meanTruth = 1000;
    for (const r of bt.ratings) {
      expect(Math.abs(r.rating - truth[r.id] + (1000 - meanTruth))).toBeLessThan(15);
      expect(r.lo).toBeLessThan(truth[r.id] + 5);
      expect(r.hi).toBeGreaterThan(truth[r.id] - 5);
    }
    expect(bt.ratings.find((r) => r.id === "a")!.rank).toBe(1);
    expect(bt.ratings.find((r) => r.id === "d")!.rank).toBe(5);
    const online = onlineElo(items, matches, { shuffles: 5, seed: 1 });
    expect(online.a).toBeGreaterThan(online.d);
  });

  it("regularization keeps an undefeated player finite", () => {
    const fit = bradleyTerry(["A", "B"], [{ a: "A", b: "B", scoreA: 1 }]);
    expect(Number.isFinite(fit.ratings[0])).toBe(true);
    expect(fit.ratings[0]).toBeGreaterThan(fit.ratings[1]);
  });
});

describe("information theory", () => {
  it("entropy", () => {
    expect(entropy([1, 1])).toBeCloseTo(1, 14);
    expect(entropy([1, 1, 1, 1])).toBeCloseTo(2, 14);
    expect(entropy([5, 0])).toBe(0);
    expect(normalizedEntropy([3, 1])).toBeCloseTo(entropy([3, 1]), 14);
    expect(normalizedEntropy([7])).toBe(0);
    expect(entropyMillerMadow([5, 5])).toBeCloseTo(1 + 1 / (20 * Math.LN2), 14);
  });

  it("KL and JS divergences", () => {
    expect(jsDivergence([1, 0], [0, 1])).toBeCloseTo(1, 14);
    expect(jsDivergence([1, 2], [2, 4])).toBeCloseTo(0, 14);
    expect(klDivergence([1, 0], [0, 1])).toBe(Infinity);
    expect(klDivergence([0.5, 0.5], [0.25, 0.75])).toBeCloseTo(0.5 * Math.log2(2) + 0.5 * Math.log2(2 / 3), 14);
    expect(jsDivergenceRecords({ x: 1 }, { y: 3 })).toBeCloseTo(1, 14);
  });

  it("mutual information", () => {
    const perfect = mutualInformation([
      [10, 0],
      [0, 10],
    ]);
    expect(perfect.mi).toBeCloseTo(1, 14);
    expect(perfect.nmiSqrt).toBeCloseTo(1, 14);
    expect(perfect.uncertaintyYgivenX).toBeCloseTo(1, 14);
    expect(perfect.pValue).toBeLessThan(1e-4);
    const indep = mutualInformation([
      [10, 10],
      [20, 20],
    ]);
    expect(indep.mi).toBeCloseTo(0, 14);
    expect(indep.pValue).toBeCloseTo(1, 10);
    const c = contingency(["a", "a", "b"], ["x", "y", "y"]);
    expect(c.table).toEqual([
      [1, 1],
      [0, 1],
    ]);
  });
});

describe("regression", () => {
  it("OLS on a textbook example", () => {
    const f = ols([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    expect(f.slope).toBeCloseTo(0.6, 14);
    expect(f.intercept).toBeCloseTo(2.2, 14);
    expect(f.r2).toBeCloseTo(0.6, 14);
    expect(f.seSlope).toBeCloseTo(Math.sqrt(0.8 / 10), 12);
    expect(f.pSlope).toBeCloseTo(0.12402706265755592, 8);
  });

  it("logistic MLE recovers parameters and solves the score equations", () => {
    const rand = mulberry32(3);
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const xi = rand();
      x.push(xi);
      y.push(rand() < 1 / (1 + Math.exp(-(-1 + 2 * xi))) ? 1 : 0);
    }
    const fit = logisticRegression(
      x.map((v) => [v]),
      y,
      { penalty: "none" },
    );
    expect(fit.converged).toBe(true);
    expect(fit.coef[0]).toBeCloseTo(-1, 0);
    expect(Math.abs(fit.coef[1] - 2)).toBeLessThan(0.15);
    let s0 = 0;
    let s1 = 0;
    for (let i = 0; i < x.length; i++) {
      const p = 1 / (1 + Math.exp(-(fit.coef[0] + fit.coef[1] * x[i])));
      s0 += y[i] - p;
      s1 += (y[i] - p) * x[i];
    }
    expect(Math.abs(s0)).toBeLessThan(1e-6);
    expect(Math.abs(s1)).toBeLessThan(1e-6);
    // Firth ≈ MLE for large n
    const firth = logisticRegression(
      x.map((v) => [v]),
      y,
    );
    expect(firth.coef[1]).toBeCloseTo(fit.coef[1], 1);
  });

  it("Firth stays finite under complete separation", () => {
    const x = [0.1, 0.2, 0.3, 0.7, 0.8, 0.9];
    const y = [0, 0, 0, 1, 1, 1];
    const f = logistic1d(x, y);
    expect(Number.isFinite(f.slope)).toBe(true);
    expect(f.slope).toBeGreaterThan(0);
    expect(f.curve[0].p).toBeLessThan(0.5);
    expect(f.curve[f.curve.length - 1].p).toBeGreaterThan(0.5);
    for (const c of f.curve) {
      expect(c.lo).toBeLessThanOrEqual(c.p);
      expect(c.hi).toBeGreaterThanOrEqual(c.p);
    }
  });
});

describe("cost-quality", () => {
  const pts = [
    { id: "A", cost: 1, quality: 0.5 },
    { id: "B", cost: 2, quality: 0.8 },
    { id: "C", cost: 3, quality: 0.7 },
    { id: "D", cost: 4, quality: 0.9 },
  ];

  it("Pareto frontier and dominance", () => {
    expect(paretoFrontier(pts).map((p) => p.id)).toEqual(["A", "B", "D"]);
    const dom = dominanceRelations(pts);
    expect(dom.find((d) => d.id === "C")!.dominatedBy).toEqual(["B"]);
    expect(dom.find((d) => d.id === "B")!.dominates).toEqual(["C"]);
  });

  it("AIQ by hand: (½(0.5+0.8)·1 + ½(0.8+0.9)·2)/3", () => {
    const r = aiq(pts);
    expect(r.hull.map((p) => p.id)).toEqual(["A", "B", "D"]);
    expect(r.aiq).toBeCloseTo((0.65 + 1.7) / 3, 14);
  });

  it("hull drops points below a chord", () => {
    const p2 = [
      { id: "A", cost: 0, quality: 0 },
      { id: "B", cost: 1, quality: 0.2 },
      { id: "C", cost: 2, quality: 1 },
    ];
    expect(upperConvexHull(p2).map((p) => p.id)).toEqual(["A", "C"]);
    expect(aiq(p2).aiq).toBeCloseTo(0.5, 14);
    expect(hullQualityAt(nonDecreasingHull(p2), 1)).toBeCloseTo(0.5, 14);
    expect(hullQualityAt(nonDecreasingHull(p2), 5)).toBe(1);
    expect(Number.isNaN(hullQualityAt(nonDecreasingHull(p2), -1))).toBe(true);
  });

  it("degenerate: single point", () => {
    expect(aiq([{ id: "x", cost: 1, quality: 0.4 }]).aiq).toBe(0.4);
    expect(Number.isNaN(aiq([]).aiq)).toBe(true);
  });
});

describe("power", () => {
  it("two-proportion sample size (0.5 vs 0.6 needs 388 per group)", () => {
    expect(requiredNTwoProportions(0.5, 0.6)).toBe(388);
    expect(powerTwoProportions(388, 0.5, 0.6)).toBeCloseTo(0.8, 2);
  });

  it("MDE inverts the sample size formula", () => {
    const d = mdeTwoProportions(388, 0.5);
    expect(d).toBeCloseTo(0.1, 2);
    const dp = mdePairedProportions(200, 0.2);
    expect(requiredNPairedProportions(dp, 0.2)).toBeLessThanOrEqual(201);
    expect(requiredNPairedProportions(dp * 0.9, 0.2)).toBeGreaterThan(200);
  });

  it("design effect", () => {
    expect(designEffect(5, 0.25)).toBe(2);
    expect(designEffect(1, 0.9)).toBe(1);
  });
});

describe("reliability", () => {
  it("ICC(1) on a hand-computed ANOVA", () => {
    const v = varianceDecomposition([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    expect(v.anova.msBetween).toBeCloseTo(8, 14);
    expect(v.anova.msWithin).toBeCloseTo(0.5, 14);
    expect(v.icc).toBeCloseTo(7.5 / 8.5, 14);
    expect(v.varBetween).toBeCloseTo(3.75, 14);
    expect(v.fractionWithin).toBeCloseTo(0.5 / 4.25, 14);
  });

  it("agreement and Fleiss-style kappa", () => {
    const a = agreement([
      [true, true, true],
      [true, false, true],
      [false, false],
    ]);
    expect(a.pairwise).toBeCloseTo(5 / 7, 14);
    expect(a.unanimous).toBeCloseTo(2 / 3, 14);
    expect(a.kappa).toBeCloseTo((5 / 7 - 34 / 64) / (1 - 34 / 64), 14);
  });
});
