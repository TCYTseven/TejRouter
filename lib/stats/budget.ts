/**
 * Best choice under a budget: the multiple-choice knapsack used for the
 * "hindsight at the same budget" baselines (Vals AI Router Index, 2026).
 *
 * Each group (a task, or a task category) must take exactly one option
 * (a model). Maximize total score subject to total cost <= budget.
 *
 * Solved greedily on the LP relaxation (Sinha & Zoltners 1979): each group's
 * options are reduced to their upper convex hull, every group starts at its
 * cheapest option, and upgrades are applied in order of score gained per dollar
 * while they fit. A final pass spends any leftover budget on the single best
 * remaining upgrade per group. The result is feasible and within one upgrade
 * of the LP optimum, which is an upper bound on the exact answer.
 */

export interface BudgetOption {
  id: string;
  score: number;
  cost: number;
}

export interface BudgetChoice {
  /** Total score and cost of the chosen options. */
  score: number;
  cost: number;
  /** Chosen option id per group, in input order. */
  picks: string[];
}

const EPS = 1e-12;

/** Cost-ascending upper convex hull of one group's options (dominated options removed). */
function groupHull(options: BudgetOption[]): BudgetOption[] {
  const ps = options
    .filter((o) => Number.isFinite(o.score) && Number.isFinite(o.cost))
    .sort((a, b) => a.cost - b.cost || b.score - a.score);
  const hull: BudgetOption[] = [];
  for (const p of ps) {
    if (hull.length && p.score <= hull[hull.length - 1].score + EPS) continue; // dominated: costs more, scores no higher
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      // Drop b if it lies on or under the segment a→p (lower marginal value than going straight to p).
      if ((b.score - a.score) * (p.cost - a.cost) <= (p.score - a.score) * (b.cost - a.cost) + EPS) hull.pop();
      else break;
    }
    hull.push(p);
  }
  return hull;
}

/**
 * Pick one option per group to maximize total score with total cost <= budget.
 * Returns null when a group has no valid option or even the cheapest choice
 * in every group exceeds the budget.
 */
export function bestUnderBudget(groups: BudgetOption[][], budget: number): BudgetChoice | null {
  if (!Number.isFinite(budget) || groups.length === 0) return null;
  const hulls = groups.map(groupHull);
  if (hulls.some((h) => h.length === 0)) return null;
  const level = hulls.map(() => 0);
  let cost = hulls.reduce((s, h) => s + h[0].cost, 0);
  if (cost > budget + EPS) return null;

  const steps: { g: number; to: number; ds: number; dc: number }[] = [];
  hulls.forEach((h, g) => {
    for (let k = 1; k < h.length; k++) steps.push({ g, to: k, ds: h[k].score - h[k - 1].score, dc: h[k].cost - h[k - 1].cost });
  });
  // Free upgrades first, then by score per dollar. Within a group the hull makes these non-increasing, so order is kept.
  const eff = (s: { ds: number; dc: number }) => (s.dc <= EPS ? Infinity : s.ds / s.dc);
  steps.sort((a, b) => eff(b) - eff(a) || a.g - b.g || a.to - b.to);
  const blocked = new Set<number>();
  for (const s of steps) {
    if (blocked.has(s.g) || level[s.g] !== s.to - 1) continue;
    if (cost + s.dc <= budget + EPS) {
      cost += s.dc;
      level[s.g] = s.to;
    } else {
      blocked.add(s.g);
    }
  }

  // Spend what is left on the best single jump per group, across all its original options.
  const chosen = hulls.map((h, g) => h[level[g]]);
  for (;;) {
    let best: { g: number; o: BudgetOption; gain: number } | null = null;
    groups.forEach((opts, g) => {
      for (const o of opts) {
        if (!Number.isFinite(o.score) || !Number.isFinite(o.cost)) continue;
        const gain = o.score - chosen[g].score;
        if (gain > EPS && cost - chosen[g].cost + o.cost <= budget + EPS && (!best || gain > best.gain)) best = { g, o, gain };
      }
    });
    if (!best) break;
    const { g, o } = best as { g: number; o: BudgetOption; gain: number };
    cost += o.cost - chosen[g].cost;
    chosen[g] = o;
  }

  return { score: chosen.reduce((s, o) => s + o.score, 0), cost, picks: chosen.map((o) => o.id) };
}
