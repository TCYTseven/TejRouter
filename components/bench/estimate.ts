import type { BenchArm, SuiteInfo } from "@/lib/bench/types";
import type { ProviderStatus } from "@/lib/types";
import {
  MAX_ARMS,
  MAX_JOBS,
  effectiveConcurrency,
  estimateArmCost,
  estimateJobs,
  estimateTokensPerArm,
  estimateWallMs,
  minimumDetectableDiff,
  type SuiteTokenPrior,
} from "@/lib/client/bench";
import { formatNumber } from "@/lib/client/format";
import type { LauncherConfig } from "./config";

/** Simulators answer in milliseconds; budget a little per call for the stream and grading. */
const SIM_SECONDS_PER_JOB = 0.05;
/** Show the "too few tasks" note when only gaps above this (fraction) are reliably visible. */
const SMALL_SAMPLE_GAP = 0.15;

export interface Estimate {
  tasks: number;
  jobs: number;
  /** Answers per router: tasks × repetitions. */
  perRouter: number;
  wallMs: number;
  costLow: number | null;
  costHigh: number | null;
  /** The one note worth showing, if any. */
  note: { text: string; blocking: boolean } | null;
}

export function computeEstimate(
  config: LauncherConfig,
  suiteIds: string[],
  suites: SuiteInfo[],
  arms: BenchArm[],
  providers: Record<string, ProviderStatus>,
  priors: Record<string, SuiteTokenPrior>,
): Estimate {
  const maxTasksPerSuite = config.maxTasksPerSuite ?? undefined;
  const est = estimateJobs(suites, { suiteIds, repetitions: config.repetitions, maxTasksPerSuite, armCount: arms.length });
  const tokens = estimateTokensPerArm(
    suites,
    { suiteIds, repetitions: config.repetitions, maxTasksPerSuite, maxTokens: config.maxTokens ?? undefined },
    priors,
  );
  const costs = arms.map((a) => estimateArmCost(a.model, providers[a.providerId], tokens)).filter((c) => c.lowUsd != null);
  const allSimulated = arms.length > 0 && arms.every((a) => providers[a.providerId]?.simulated);
  const parallel = effectiveConcurrency(config.concurrency, arms);
  const wallMs = estimateWallMs(est.jobs, parallel, allSimulated ? SIM_SECONDS_PER_JOB : undefined);
  const gap = minimumDetectableDiff(est.perArm);
  const noKey = arms.filter((a) => {
    const p = providers[a.providerId];
    return p && !p.configured && !p.simulated;
  });

  let note: Estimate["note"] = null;
  if (!arms.length) note = { text: "Add at least one router to start.", blocking: true };
  else if (!suiteIds.length) note = { text: "Choose at least one task set under Customize.", blocking: true };
  else if (arms.length > MAX_ARMS) note = { text: `A benchmark can include at most ${MAX_ARMS} routers.`, blocking: true };
  else if (est.jobs > MAX_JOBS)
    note = {
      text: `That is ${formatNumber(est.jobs)} calls, over the limit of ${formatNumber(MAX_JOBS)}. Choose fewer tasks or routers.`,
      blocking: true,
    };
  else if (noKey.length)
    note = {
      text: `${noKey.map((a) => providers[a.providerId]?.name ?? a.providerId).join(", ")} ${noKey.length === 1 ? "has" : "have"} no API key, so every call to ${noKey.length === 1 ? "it" : "them"} will fail.`,
      blocking: false,
    };
  else if (arms.length === 1)
    note = { text: "With one router there is nothing to compare. Add another router or a fixed model.", blocking: false };
  else if (est.perArm > 0 && gap > SMALL_SAMPLE_GAP)
    note = {
      text: `With this few tasks, only differences larger than about ${Math.round((gap * 100) / 5) * 5} points will show up clearly.`,
      blocking: false,
    };

  return {
    tasks: est.tasks,
    jobs: est.jobs,
    perRouter: est.perArm,
    wallMs,
    costLow: costs.length ? costs.reduce((s, c) => s + (c.lowUsd ?? 0), 0) : null,
    costHigh: costs.length ? costs.reduce((s, c) => s + (c.highUsd ?? 0), 0) : null,
    note,
  };
}

/** "about 40 seconds", "about 3 minutes", "about 1 hour". */
export function aboutDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 10) return "a few seconds";
  if (s < 50) return `about ${Math.round(s / 10) * 10} seconds`;
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `about ${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round((m / 60) * 2) / 2;
  return `about ${h} hour${h === 1 ? "" : "s"}`;
}

/** Short remaining-time form for the progress line: "30 s", "2 min". */
export function shortDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
