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
}

/** NDJSON events streamed from POST /api/bench. */
export type BenchEvent =
  | { type: "run-start"; run: Omit<BenchRun, "samples">; totalJobs: number }
  | { type: "sample"; sample: BenchSample; completed: number; totalJobs: number }
  | { type: "run-end"; runId: string; finishedAt: number }
  | { type: "error"; message: string };
