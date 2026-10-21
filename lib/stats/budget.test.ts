import { describe, expect, it } from "vitest";
import { bestUnderBudget, type BudgetOption } from "./budget";
import { mulberry32 } from "./rng";

/** Exhaustive optimum for small instances. */
function bruteForce(groups: BudgetOption[][], budget: number): number | null {
  let best: number | null = null;
  const go = (g: number, score: number, cost: number) => {
    if (cost > budget + 1e-12) return;
    if (g === groups.length) {
      if (best == null || score > best) best = score;
      return;
    }
    for (const o of groups[g]) go(g + 1, score + o.score, cost + o.cost);
  };
  go(0, 0, 0);
  return best;
}

describe("bestUnderBudget", () => {
  it("upgrades the group with the most score per dollar first", () => {
    const groups = [
      [{ id: "a", score: 0, cost: 1 }, { id: "b", score: 1, cost: 2 }],
      [{ id: "a", score: 0, cost: 1 }, { id: "b", score: 1, cost: 5 }],
    ];
    const r = bestUnderBudget(groups, 3)!;
    expect(r.picks).toEqual(["b", "a"]);
    expect(r.score).toBe(1);
    expect(r.cost).toBe(3);
  });

  it("returns null when even the cheapest choice is over budget", () => {
    expect(bestUnderBudget([[{ id: "a", score: 1, cost: 2 }]], 1)).toBeNull();
    expect(bestUnderBudget([], 1)).toBeNull();
  });

  it("takes free upgrades and ignores dominated options", () => {
    const r = bestUnderBudget([[{ id: "cheap", score: 0, cost: 1 }, { id: "same", score: 1, cost: 1 }, { id: "worse", score: 0.5, cost: 3 }]], 1)!;
    expect(r.picks).toEqual(["same"]);
  });

  it("is feasible and close to the exact optimum on random instances", () => {
    const rand = mulberry32(7);
    let total = 0;
    let gap = 0;
    for (let trial = 0; trial < 200; trial++) {
      const groups = Array.from({ length: 2 + Math.floor(rand() * 5) }, () =>
        Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, k) => ({ id: `m${k}`, score: rand(), cost: 0.1 + rand() })),
      );
      const minCost = groups.reduce((s, g) => s + Math.min(...g.map((o) => o.cost)), 0);
      const budget = minCost + rand() * groups.length;
      const r = bestUnderBudget(groups, budget)!;
      const opt = bruteForce(groups, budget)!;
      expect(r.cost).toBeLessThanOrEqual(budget + 1e-9);
      expect(r.score).toBeLessThanOrEqual(opt + 1e-9);
      total += opt;
      gap += opt - r.score;
    }
    expect(gap / total).toBeLessThan(0.05);
  });
});
