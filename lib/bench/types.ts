import type { ChatMessage, ChatResult, ProviderId } from "@/lib/types";

/** How a response is scored. Every grader returns a score in [0, 1]. */
export type GraderSpec =
  | { kind: "exact"; caseSensitive?: boolean }
  | { kind: "numeric"; tolerance?: number; relative?: boolean }
  | { kind: "choice"; choices: string[] }
  | { kind: "regex"; pattern: string; flags?: string }
  | { kind: "contains"; all?: string[]; any?: string[]; none?: string[] }
  | { kind: "json"; requiredKeys: string[]; expectedValues?: Record<string, unknown> }
  | { kind: "code"; language: "javascript"; functionName: string; tests: { args: unknown[]; expected: unknown }[] }
  | { kind: "constraints"; checks: ConstraintCheck[] };

/** Verifiable instruction-following checks (IFEval style). */
export type ConstraintCheck =
  | { type: "maxWords"; value: number }
  | { type: "minWords"; value: number }
  | { type: "exactLines"; value: number }
  | { type: "startsWith"; value: string }
  | { type: "endsWith"; value: string }
  | { type: "allLowercase" }
  | { type: "allUppercase" }
  | { type: "noCommas" }
  | { type: "includes"; value: string }
  | { type: "excludes"; value: string }
  | { type: "bulletCount"; value: number };

export interface BenchTask {
  id: string;
  suiteId: string;
  category: string;
  /** Human-estimated difficulty in [0, 1]. Used for difficulty-stratified analysis. */
  difficulty: number;
  messages: ChatMessage[];
  /** Canonical answer, used by graders and by the simulators. */
  expected: string;
  grader: GraderSpec;
  tags?: string[];
}

export interface BenchSuite {
  id: string;
  name: string;
  description: string;
  tasks: BenchTask[];
  /** Left out of a run unless picked by name (edge cases, rephrasings, other languages). */
  optional?: boolean;
}

/** One thing being benchmarked: a router plus (optionally) a pinned model. */
export interface BenchArm {
  /** Stable id: `${providerId}:${model || "default"}` */
  id: string;
  providerId: ProviderId;
  model?: string;
  label: string;
  color: string;
}

export interface BenchRunConfig {
  suiteIds: string[];
  arms: Omit<BenchArm, "id" | "color" | "label">[] | BenchArm[];
  /** Times each task is sent to each arm. Repetitions give variance estimates. */
  repetitions: number;
  concurrency: number;
  temperature?: number;
  maxTokens?: number;
  seed?: number;
  /** Optional cap on tasks per suite, sampled deterministically by seed. */
  maxTasksPerSuite?: number;
  /** Optional human-readable run name. */
  name?: string;
}

export interface GradeResult {
  score: number;
  correct: boolean;
  /** Extracted answer, if the grader extracts one. */
  extracted: string | null;
  detail: string;
}

export interface BenchSample {
  runId: string;
  taskId: string;
  suiteId: string;
  category: string;
  difficulty: number;
  armId: string;
  providerId: ProviderId;
  rep: number;
  result: ChatResult;
  grade: GradeResult;
  /** Number of calls made for this sample (1 = no retries). */
  attempts?: number;
  /** Every failed attempt before the last one, in order (missing on runs saved before it was recorded). */
  attemptLog?: AttemptRecord[];
}

/** One failed call that the runner then retried. */
export interface AttemptRecord {
  httpStatus: number | null;
  error: string;
  latencyMs: number;
}

/** Task metadata without prompts, kept with each run. */
export interface BenchTaskMeta {
  id: string;
  suiteId: string;
  category: string;
  difficulty: number;
}

export interface BenchRun {
  id: string;
  name: string;
  createdAt: number;
  finishedAt: number | null;
  config: BenchRunConfig;
  arms: BenchArm[];
  tasks: BenchTaskMeta[];
  samples: BenchSample[];
  /** True when the run was stopped before every job finished. */
  aborted?: boolean;
  /** Fatal error that ended the run early, if any. */
  error?: string;
}

/** NDJSON events streamed from POST /api/bench. */
export type BenchEvent =
  | { type: "run-start"; run: Omit<BenchRun, "samples">; totalJobs: number }
  | { type: "sample"; sample: BenchSample; completed: number; totalJobs: number }
  | {
      type: "run-end";
      runId: string;
      finishedAt: number;
      aborted?: boolean;
      /** Set by POST /api/bench: whether the run was saved to data/runs. */
      persisted?: boolean;
    }
  | { type: "error"; message: string };

/** Per-arm aggregate in a run summary. */
export interface RunArmSummary {
  armId: string;
  label: string;
  color: string;
  providerId: ProviderId;
  model?: string;
  samples: number;
  /** Samples whose call failed (ok: false). */
  errors: number;
  /** Fraction of samples graded correct (failed calls count as incorrect). */
  accuracy: number;
  meanScore: number;
  totalCostUsd: number | null;
  meanLatencyMs: number | null;
}

/** Lightweight listing entry returned by GET /api/runs. */
export interface RunSummary {
  id: string;
  name: string;
  createdAt: number;
  finishedAt: number | null;
  aborted: boolean;
  suiteIds: string[];
  taskCount: number;
  sampleCount: number;
  /** tasks × arms × repetitions. */
  totalJobs: number;
  arms: RunArmSummary[];
}

/** Suite metadata returned by GET /api/bench/suites. */
export interface SuiteInfo {
  id: string;
  name: string;
  description: string;
  taskCount: number;
  categories: { name: string; count: number }[];
  /** Task counts per difficulty bucket: [0,0.2), [0.2,0.4), [0.4,0.6), [0.6,0.8), [0.8,1]. */
  difficultyHistogram: number[];
  meanDifficulty: number;
  examples: { id: string; category: string; difficulty: number; prompt: string; expected: string }[];
  optional?: boolean;
}
