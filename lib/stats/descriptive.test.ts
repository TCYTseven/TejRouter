import { describe, expect, it } from "vitest";
import {
  describe as summarize,
  ecdf,
  finiteOnly,
  geometricMean,
  histogram,
  kde,
  mean,
  median,
  pearson,
  quantile,
  rankWithTies,
  sd,
  silvermanBandwidth,
  spearman,
  sum,
  variance,
} from "./descriptive";
import { agrestiCoull, clopperPearson, jeffreys, tInterval, wilson } from "./intervals";

describe("descriptive", () => {
  it("mean / variance / sd (textbook example)", () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    expect(variance(xs)).toBeCloseTo(32 / 7, 14);
    expect(sd(xs)).toBeCloseTo(Math.sqrt(32 / 7), 14);
    expect(Number.isNaN(variance([1]))).toBe(true);
  });

  it("compensated sum", () => {
    const xs = [1e16, 1, -1e16];
    expect(sum(xs)).toBe(1);
  });

  it("type-7 quantiles match R's quantile() defaults", () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 14);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1, 14);
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(median([5])).toBe(5);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });

  it("describe()", () => {
    const d = summarize(Array.from({ length: 101 }, (_, i) => i));
    expect(d).toMatchObject({ n: 101, mean: 50, min: 0, max: 100, p50: 50, p90: 90, p95: 95, p99: 99 });
  });

  it("geometric mean, finiteOnly", () => {
    expect(geometricMean([1, 10, 100])).toBeCloseTo(10, 12);
    expect(Number.isNaN(geometricMean([1, 0]))).toBe(true);
    expect(finiteOnly([1, null, NaN, Infinity, 2, undefined])).toEqual([1, 2]);
  });

  it("average ranks and tie sums", () => {
    const r = rankWithTies([10, 20, 20, 30, 20]);
    expect(r.ranks).toEqual([1, 3, 3, 5, 3]);
    expect(r.tieSum).toBe(27 - 3);
  });

  it("pearson / spearman", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 14);
    expect(spearman([1, 2, 3, 4], [1, 8, 27, 64])).toBeCloseTo(1, 14);
  });

  it("ECDF steps and thinning", () => {
    const pts = ecdf([3, 1, 2, 2]);
    expect(pts).toEqual([
      { x: 1, y: 0.25 },
      { x: 2, y: 0.75 },
      { x: 3, y: 1 },
    ]);
    const big = ecdf(Array.from({ length: 1000 }, (_, i) => i), 50);
    expect(big.length).toBe(50);
    expect(big[49]).toEqual({ x: 999, y: 1 });
  });

  it("histogram densities integrate to 1", () => {
    const xs = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 10 + i / 50);
    const h = histogram(xs);
    const area = h.reduce((s, b) => s + b.density * (b.x1 - b.x0), 0);
    expect(area).toBeCloseTo(1, 10);
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(500);
  });

  it("Gaussian KDE integrates to ~1 and uses Silverman's bandwidth", () => {
    const xs = Array.from({ length: 200 }, (_, i) => Math.cos(i * 1.7) * 3);
    const h = silvermanBandwidth(xs);
    expect(h).toBeGreaterThan(0);
    const pts = kde(xs, { points: 400 });
    let area = 0;
    for (let i = 1; i < pts.length; i++) area += 0.5 * (pts[i].y + pts[i - 1].y) * (pts[i].x - pts[i - 1].x);
    expect(area).toBeCloseTo(1, 2);
  });
});

describe("binomial intervals", () => {
  it("Clopper-Pearson matches R binom.test(7, 10)", () => {
    const ci = clopperPearson(7, 10);
    expect(ci.lo).toBeCloseTo(0.3475471499400027, 10);
    expect(ci.hi).toBeCloseTo(0.9332604888222655, 10);
  });

  it("Clopper-Pearson edge cases", () => {
    expect(clopperPearson(0, 10).lo).toBe(0);
    expect(clopperPearson(0, 10).hi).toBeCloseTo(1 - Math.pow(0.025, 1 / 10), 12);
    expect(clopperPearson(10, 10).lo).toBeCloseTo(Math.pow(0.025, 1 / 10), 12);
    expect(clopperPearson(1, 25).lo).toBeCloseTo(0.0010121996993108441, 10);
    expect(clopperPearson(1, 25).hi).toBeCloseTo(0.203516913922414, 10);
  });

  it("Wilson interval", () => {
    const ci = wilson(7, 10);
    expect(ci.lo).toBeCloseTo(0.39677814746114537, 12);
    expect(ci.hi).toBeCloseTo(0.8922087325936989, 12);
    expect(wilson(0, 10).lo).toBeCloseTo(0, 12);
    expect(wilson(0, 10).hi).toBeCloseTo(0.27753279986288915, 12);
    expect(wilson(45, 50).lo).toBeCloseTo(0.7863976856252035, 12);
    expect(Number.isNaN(wilson(0, 0).lo)).toBe(true);
  });

  it("Jeffreys and Agresti-Coull bracket the estimate", () => {
    for (const ci of [jeffreys(7, 10), agrestiCoull(7, 10)]) {
      expect(ci.lo).toBeLessThan(0.7);
      expect(ci.hi).toBeGreaterThan(0.7);
    }
  });

  it("t interval", () => {
    const ci = tInterval([1, 2, 3, 4, 5]);
    // mean 3, s = √2.5, t₀.₉₇₅,₄ = 2.776445105
    expect(ci.hi - 3).toBeCloseTo((2.7764451051977987 * Math.sqrt(2.5)) / Math.sqrt(5), 9);
  });
});
