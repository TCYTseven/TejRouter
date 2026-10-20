import type { BenchRun, RunArmSummary, RunSummary } from "./types";

/** Aggregate a run into a lightweight listing entry. */
export function summarizeRun(run: BenchRun): RunSummary {
  const by = new Map<string, { n: number; errors: number; correct: number; score: number; cost: number; costN: number; lat: number; latN: number }>();
  for (const s of run.samples ?? []) {
    const a = by.get(s.armId) ?? { n: 0, errors: 0, correct: 0, score: 0, cost: 0, costN: 0, lat: 0, latN: 0 };
    a.n++;
    if (!s.result?.ok) a.errors++;
    if (s.grade?.correct) a.correct++;
    a.score += s.grade?.score ?? 0;
    if (typeof s.result?.costUsd === "number") {
      a.cost += s.result.costUsd;
      a.costN++;
    }
    if (s.result?.ok && typeof s.result.latencyMs === "number") {
      a.lat += s.result.latencyMs;
      a.latN++;
    }
    by.set(s.armId, a);
  }
  const arms: RunArmSummary[] = (run.arms ?? []).map((arm) => {
    const a = by.get(arm.id);
    return {
      armId: arm.id,
      label: arm.label,
      color: arm.color,
      providerId: arm.providerId,
      ...(arm.model ? { model: arm.model } : {}),
      samples: a?.n ?? 0,
      errors: a?.errors ?? 0,
      accuracy: a && a.n ? a.correct / a.n : 0,
      meanScore: a && a.n ? a.score / a.n : 0,
      totalCostUsd: a && a.costN ? a.cost : null,
      meanLatencyMs: a && a.latN ? a.lat / a.latN : null,
    };
  });
  const reps = run.config?.repetitions ?? 1;
  return {
    id: run.id,
    name: run.name,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt ?? null,
    aborted: Boolean(run.aborted),
    suiteIds: run.config?.suiteIds ?? [],
    taskCount: run.tasks?.length ?? 0,
    sampleCount: run.samples?.length ?? 0,
    totalJobs: (run.tasks?.length ?? 0) * (run.arms?.length ?? 0) * reps,
    arms,
  };
}
