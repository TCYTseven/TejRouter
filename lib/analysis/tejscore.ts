import type { ArmStats, RunReport, TejComponents, TejScoreReport, TejWeights } from "./types";

/**
 * TejScore: a transparent composite in [0, 100], relative to the arms in the run.
 *
 *   TejScore = 100 · Σ_k w_k s_k / Σ_k w_k   (sum over components k with s_k defined)
 *
 * Components s_k ∈ [0, 1]:
 *   accuracy     s = (a - a_min) / (a_max - a_min), a = task-weighted mean score
 *                    (min-max across arms; 1 for every arm if all accuracies are equal)
 *   cost         s = (ln c_max - ln c) / (ln c_max - ln c_min), c = mean USD per request
 *                    (min-max on a log scale; 1 = cheapest; free arms get 1)
 *   latency      s = same log-scale min-max on median latency (1 = fastest)
 *   reliability  s = 1 - error rate (absolute: a single failure should not swing it to 0)
 * Components that are undefined for an arm (e.g. no cost data) are dropped and
 * the remaining weights renormalized, so the score stays on the same scale.
 * Because accuracy, cost and latency are normalized across the arms in the run,
 * adding or removing an arm can move every score: TejScore ranks arms within a run;
 * it is not comparable across runs. The raw accuracy is kept in components.accuracyRaw.
 */

export const DEFAULT_TEJ_WEIGHTS: TejWeights = { accuracy: 0.5, cost: 0.2, latency: 0.15, reliability: 0.15 };

export const TEJ_FORMULA =
  "TejScore = 100 · Σ w_k·s_k / Σ w_k over defined components; s_accuracy = (a − a_min)/(a_max − a_min) across arms; " +
  "s_cost = (ln c_max − ln c)/(ln c_max − ln c_min) on mean $/request; s_latency = same on median latency; " +
  "s_reliability = 1 − error rate. Defaults w = {accuracy 0.5, cost 0.2, latency 0.15, reliability 0.15}.";

function logMinMax(values: (number | null)[]): (number | null)[] {
  const pos = values.filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (pos.length === 0) return values.map((v) => (v === 0 ? 1 : null));
  const lmin = Math.log(Math.min(...pos));
  const lmax = Math.log(Math.max(...pos));
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (v <= 0) return 1;
    if (!(lmax > lmin)) return 1;
    return (lmax - Math.log(v)) / (lmax - lmin);
  });
}

function minMax(values: (number | null)[]): (number | null)[] {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0) return values.map(() => null);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return values.map((v) => (v == null || !Number.isFinite(v) ? null : hi > lo ? (v - lo) / (hi - lo) : 1));
}

/** Per-arm TejScore components (each in [0, 1] or null). */
export function tejComponents(perArm: ArmStats[]): TejComponents[] {
  const acc = minMax(perArm.map((a) => (a.n > 0 ? a.accuracy.value : null)));
  const cost = logMinMax(perArm.map((a) => a.cost.meanUsd));
  const lat = logMinMax(perArm.map((a) => a.latency.p50));
  return perArm.map((a, i) => ({
    accuracyRaw: a.n > 0 ? a.accuracy.value : null,
    accuracy: a.n > 0 ? acc[i] : null,
    cost: a.n > 0 ? cost[i] : null,
    latency: a.n > 0 ? lat[i] : null,
    reliability: a.n > 0 && a.errorRate.value != null ? 1 - a.errorRate.value : null,
  }));
}

/**
 * Compute TejScores for a report with arbitrary weights (negative weights are
 * treated as 0). Pure and cheap: the UI can call it on every slider move.
 */
export function computeTejScore(report: Pick<RunReport, "perArm">, weights: Partial<TejWeights> = {}): TejScoreReport {
  const w: TejWeights = { ...DEFAULT_TEJ_WEIGHTS, ...weights };
  for (const k of Object.keys(w) as (keyof TejWeights)[]) w[k] = Number.isFinite(w[k]) ? Math.max(0, w[k]) : 0;
  const comps = tejComponents(report.perArm);
  const scores = comps.map((c) => {
    if (c.accuracy == null) return null;
    let num = 0;
    let den = 0;
    for (const k of ["accuracy", "cost", "latency", "reliability"] as const) {
      const s = c[k];
      if (s == null || w[k] <= 0) continue;
      num += w[k] * s;
      den += w[k];
    }
    return den > 0 ? (100 * num) / den : null;
  });
  const order = scores
    .map((s, i) => [s, i] as const)
    .filter((x): x is readonly [number, number] => x[0] != null)
    .sort((a, b) => b[0] - a[0]);
  const rank = new Array<number | null>(scores.length).fill(null);
  order.forEach(([, i], pos) => (rank[i] = pos + 1));
  return {
    weights: w,
    formula: TEJ_FORMULA,
    rows: report.perArm.map((a, i) => ({ armId: a.armId, score: scores[i], rank: rank[i], components: comps[i] })),
  };
}
