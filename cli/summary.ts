import { armNote, buildHeadline, fin, rankedArms } from "@/components/report/verdicts";
import { pct, usd } from "@/components/report/format";
import type { DriftReport } from "@/lib/analysis/advanced";
import type { RunReport } from "@/lib/analysis/types";
import type { BenchRun } from "@/lib/bench/types";

/** One router (or pinned model) in a summary, most accurate first. */
export interface ArmSummary {
  id: string;
  label: string;
  kind: "router" | "fixed";
  calls: number;
  /** Share of tasks answered correctly, with its interval; failed calls count as wrong. */
  accuracy: number | null;
  accuracyLo: number | null;
  accuracyHi: number | null;
  costPerAnswerUsd: number | null;
  totalCostUsd: number | null;
  medianLatencyMs: number | null;
  errorRate: number | null;
  /** Models the router served, largest share first. */
  models: { model: string; share: number }[];
  note: string;
}

/** What the CLI prints, writes as Markdown and returns from --json. */
export interface Summary {
  runId: string;
  name: string;
  createdAt: number;
  tasks: number;
  calls: number;
  repetitions: number;
  aborted: boolean;
  /** Plain sentences: which router to use, a cheaper option, whether a single model beats a router. */
  verdict: string[];
  arms: ArmSummary[];
  pairwise: { a: string; b: string; diff: number | null; lo: number | null; hi: number | null; p: number | null; significant: boolean }[];
  categories: { category: string; tasks: number; accuracy: Record<string, number | null> }[];
  warnings: string[];
}

function spell(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? String(n);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The report's verdict in plain sentences (the same wording as the Results page). */
export function verdictSentences(report: RunReport): string[] {
  const label = (id: string) => report.meta.arms.find((a) => a.id === id)?.label ?? id;
  const headline = buildHeadline(report);
  if (!headline) return ["No router produced a graded answer in this run."];
  const { best, clearlyBetterThan: win, sameAs: tie, alternative } = headline;
  const others = rankedArms(report).length - 1;
  const cost = fin(best.cost.meanUsd) ? ` at ${usd(best.cost.meanUsd)} per answer` : "";
  const confidence =
    others === 0
      ? ". Add a second router to compare."
      : tie.length === 0
        ? `, clearly better than ${others === 1 ? label(win[0]) : `the other ${spell(others)}`}.`
        : win.length === 0
          ? `, but it is about the same as ${tie.length === others && others > 2 ? `the other ${spell(others)}` : joinNames(tie.map(label))}: this run cannot separate them.`
          : `, clearly better than ${joinNames(win.map(label))} and about the same as ${joinNames(tie.map(label))}.`;
  const out = [
    `${label(best.armId)} ${win.length || others === 0 ? "is the most accurate" : "has the highest accuracy"}: ${pct(best.accuracy.value)} correct${cost}${confidence}`,
  ];
  if (alternative && fin(alternative.arm.accuracy.value)) {
    out.push(`If cost matters, ${label(alternative.arm.armId)} gets ${pct(alternative.arm.accuracy.value)} for ${alternative.saving} per answer.`);
  }
  // Vals AI Router Index check: is any router beaten on both accuracy and cost by one single model?
  const rq = report.routingQuality;
  if (rq.available && rq.routers.length > 0) {
    const beaten = rq.routers.filter((r) => r.dominatedBy.length > 0);
    if (beaten.length === 0) {
      out.push(`No single model in this run beats ${rq.routers.length === 1 ? label(rq.routers[0].armId) : "any router"} on both accuracy and cost.`);
    } else {
      for (const r of beaten) out.push(`Always using ${label(r.dominatedBy[0].armId)} beats ${label(r.armId)} on both accuracy and cost.`);
    }
  }
  return out;
}

export function summarize(run: BenchRun, report: RunReport): Summary {
  const kindOf = new Map(report.meta.arms.map((a) => [a.id, a.kind]));
  const arms: ArmSummary[] = rankedArms(report).map((a) => {
    const routing = report.routing.find((r) => r.armId === a.armId);
    return {
      id: a.armId,
      label: a.label,
      kind: kindOf.get(a.armId) ?? a.kind,
      calls: a.n,
      accuracy: a.accuracy.value,
      accuracyLo: a.accuracy.lo,
      accuracyHi: a.accuracy.hi,
      costPerAnswerUsd: a.cost.meanUsd,
      totalCostUsd: a.cost.totalUsd,
      medianLatencyMs: a.latency.p50,
      errorRate: a.errorRate.value,
      models: (routing?.models ?? []).map((m) => ({ model: m.model, share: m.share })),
      note: armNote(report, a.armId),
    };
  });
  const order = arms.map((a) => a.id);
  const categories = report.meta.categories.map((c) => ({
    category: c.name,
    tasks: c.nTasks,
    accuracy: Object.fromEntries(
      order.map((id) => [id, report.perArmCategory.find((x) => x.armId === id && x.category === c.name)?.accuracy.value ?? null]),
    ),
  }));
  return {
    runId: run.id,
    name: run.name,
    createdAt: run.createdAt,
    tasks: report.meta.nTasks,
    calls: report.meta.nSamples,
    repetitions: report.meta.repetitions,
    aborted: Boolean(run.aborted),
    verdict: verdictSentences(report),
    arms,
    pairwise: report.pairwise.map((p) => ({
      a: p.a,
      b: p.b,
      diff: p.meanDiff.value,
      lo: p.meanDiff.lo,
      hi: p.meanDiff.hi,
      p: p.pAdjusted.mcnemarHolm,
      significant: p.significant,
    })),
    categories,
    warnings: [
      ...(run.aborted ? ["This run was stopped before every task finished, so routers may have answered different numbers of tasks."] : []),
      ...(run.error ? [`The run ended with an error: ${run.error}`] : []),
      ...report.warnings,
    ],
  };
}

// ---------------------------------------------------------------- pass or fail

export interface GateOptions {
  /** Fail when any router's accuracy is below this (0 to 1). */
  failUnder?: number;
  /** Fail when a router's accuracy fell by more than this (0 to 1) since the baseline. */
  maxDrop?: number;
  /** A drop counts as real below this p-value (default 0.05). */
  alpha?: number;
}

export interface Gate {
  passed: boolean;
  failures: string[];
}

/**
 * Decide whether a run passes. With a baseline, a router fails when its accuracy fell and
 * the drop is statistically clear (McNemar on the shared tasks), or exceeds maxDrop.
 */
export function checkGate(summary: Summary, drift: DriftReport | null, opts: GateOptions): Gate {
  const failures: string[] = [];
  const label = (id: string) => summary.arms.find((a) => a.id === id)?.label ?? id;
  if (opts.failUnder != null) {
    for (const a of summary.arms) {
      if (a.accuracy != null && a.accuracy < opts.failUnder) failures.push(`${a.label} scored ${pct(a.accuracy)}, below the required ${pct(opts.failUnder)}.`);
    }
    if (!summary.arms.length) failures.push("No router produced a graded answer.");
  }
  if (drift) {
    if (drift.reason) failures.push(`Could not compare with the baseline: ${drift.reason}`);
    const alpha = opts.alpha ?? 0.05;
    for (const r of drift.rows) {
      if (r.delta == null || r.delta >= 0) continue;
      const change = `${label(r.armId)} fell from ${pct(r.accuracyThen)} to ${pct(r.accuracyNow)} on ${r.nTasks} shared tasks`;
      if (r.pValue != null && r.pValue < alpha) failures.push(`${change} (p = ${r.pValue.toFixed(3)}).`);
      else if (opts.maxDrop != null && -r.delta > opts.maxDrop) failures.push(`${change}, more than the allowed ${(opts.maxDrop * 100).toFixed(1)} points.`);
    }
  }
  return { passed: failures.length === 0, failures };
}
