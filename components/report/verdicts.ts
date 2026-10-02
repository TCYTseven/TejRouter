import type { ArmStats, PairwiseStats, RoutingStats, RunReport } from "@/lib/analysis/types";
import { pct } from "./format";

/** Find the pairwise entry for (a, b) and orient it so diffs read as a − b. */
export function pairOf(report: RunReport, a: string, b: string): { p: PairwiseStats; sign: 1 | -1 } | null {
  for (const p of report.pairwise) {
    if (p.a === a && p.b === b) return { p, sign: 1 };
    if (p.a === b && p.b === a) return { p, sign: -1 };
  }
  return null;
}

export const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * How `a` compares with `b` on accuracy. "Clearly" is claimed only when the
 * Holm-adjusted McNemar test says so (pairwise.significant).
 */
export function compareAccuracy(report: RunReport, a: string, b: string): "better" | "worse" | "same" {
  const pr = pairOf(report, a, b);
  if (!pr || !pr.p.significant) return "same";
  const d = pr.sign * (pr.p.meanDiff.value ?? 0);
  return d > 0 ? "better" : d < 0 ? "worse" : "same";
}

/** Arms with an accuracy, most accurate first. */
export function rankedArms(report: RunReport): ArmStats[] {
  return report.perArm.filter((a) => a.n > 0 && fin(a.accuracy.value)).sort((a, b) => b.accuracy.value! - a.accuracy.value!);
}

export interface Headline {
  best: ArmStats;
  clearlyBetterThan: string[];
  sameAs: string[];
  /** A cheaper router worth considering, with how much less it costs. */
  alternative: { arm: ArmStats; saving: string } | null;
}

/** "28% less" or "21× less" for a cost ratio cheap/expensive < 1. */
export function savingText(cheap: number, dear: number): string {
  const r = dear / cheap;
  if (r >= 2) return `${r >= 10 ? Math.round(r) : r.toFixed(1)}× less`;
  return `${Math.round((1 - cheap / dear) * 100)}% less`;
}

export function buildHeadline(report: RunReport): Headline | null {
  const ranked = rankedArms(report);
  const best = ranked[0];
  if (!best) return null;
  const clearlyBetterThan: string[] = [];
  const sameAs: string[] = [];
  for (const o of ranked.slice(1)) {
    if (compareAccuracy(report, best.armId, o.armId) === "better") clearlyBetterThan.push(o.armId);
    else sameAs.push(o.armId);
  }
  // Cheaper alternative: the most accurate arm that costs clearly less than the best
  // (prefer one that is statistically tied with it).
  let alternative: Headline["alternative"] = null;
  const bestCost = best.cost.meanUsd;
  if (fin(bestCost) && bestCost > 0) {
    const cheaper = ranked.slice(1).filter((a) => fin(a.cost.meanUsd) && a.cost.meanUsd! > 0 && a.cost.meanUsd! < bestCost * 0.85);
    const pick = cheaper.find((a) => sameAs.includes(a.armId)) ?? cheaper[0];
    if (pick) alternative = { arm: pick, saving: savingText(pick.cost.meanUsd!, bestCost) };
  }
  return { best, clearlyBetterThan, sameAs, alternative };
}

/** Easy (difficulty < 0.5) vs hard (>= 0.5) model mix for a router, from its difficulty buckets. */
export function easyHardMix(r: RoutingStats, report: RunReport) {
  const bucketLo = new Map(report.meta.difficultyBuckets.map((b) => [b.index, b.lo]));
  const agg = (pickHard: boolean) => {
    const counts = new Map<string, { count: number; price: number | null }>();
    let n = 0;
    for (const b of r.byDifficulty) {
      const lo = bucketLo.get(b.bucket) ?? 0;
      if (lo >= 0.5 !== pickHard) continue;
      for (const m of b.models) {
        const c = counts.get(m.model) ?? { count: 0, price: m.blendedPrice };
        c.count += m.share * b.n;
        counts.set(m.model, c);
      }
      n += b.n;
    }
    return { n, models: [...counts.entries()].map(([model, c]) => ({ model, count: c.count, share: n ? c.count / n : 0, blendedPrice: c.price })) };
  };
  return { easy: agg(false), hard: agg(true) };
}

/** The router's priciest served model (by list price), if prices are known. */
export function pricierModel(r: RoutingStats): string | null {
  const priced = r.models.filter((m) => m.blendedPrice != null);
  if (priced.length < 2) return null;
  return [...priced].sort((a, b) => b.blendedPrice! - a.blendedPrice!)[0].model;
}

/** Plain-words note for the comparison table. */
export function armNote(report: RunReport, armId: string): string {
  const a = report.perArm.find((x) => x.armId === armId);
  const meta = report.meta.arms.find((x) => x.id === armId);
  const r = report.routing.find((x) => x.armId === armId);
  const parts: string[] = [];
  if (meta?.kind === "fixed") {
    parts.push(meta.model ? `Always uses ${meta.model}` : "Always uses one model");
  } else if (r && r.nWithModel > 0) {
    const big = pricierModel(r);
    const share = big ? r.models.find((m) => m.model === big)?.share : null;
    if (big && fin(share)) parts.push(`Picks per task; uses ${big} for ${pct(share, 0)}`);
    else parts.push(r.distinctModels > 1 ? `Picks among ${r.distinctModels} models` : `Always picked ${r.models[0]?.model ?? "one model"}`);
  } else {
    parts.push("Picks the model; does not say which");
  }
  if (a && fin(a.errorRate.value) && a.errorRate.value >= 0.01) parts.push(`${pct(a.errorRate.value, 0)} of calls failed`);
  return parts.join(". ");
}
