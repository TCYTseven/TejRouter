import { asText } from "@/lib/providers/openai";
import type { BenchArm, BenchEvent, BenchRun, BenchRunConfig, RunSummary, SuiteInfo } from "@/lib/bench/types";
import type { ProviderStatus } from "@/lib/types";
import { lookupPrice } from "@/lib/pricing";
import { readNdjson } from "./ndjson";

/**
 * Browser-side helpers for benchmarks: start a streamed run, list/import/export/delete
 * stored runs, and pre-flight estimators (jobs, tokens, cost, wall time, power).
 * Mirrors the server limits in lib/bench/runner.ts.
 */

export const MAX_JOBS = 5000;
export const MAX_ARMS = 16;
export const MAX_REPETITIONS = 20;
export const MAX_CONCURRENCY = 32;
/** Wall-time prior per job for real routers, in seconds. */
export const SECONDS_PER_JOB_PRIOR = 3;

// ---------------------------------------------------------------------------
// HTTP

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    /* not JSON */
  }
  return `${fallback}: HTTP ${res.status}`;
}

/** Thrown when POST /api/bench rejects the config (HTTP 400) before streaming. */
export class BenchStartError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "BenchStartError";
    this.status = status;
  }
}

/**
 * Start a benchmark run and stream its NDJSON events into `onEvent`. Resolves when the
 * stream ends; rejects with BenchStartError for an invalid config, or an AbortError when
 * `signal` aborts (the server then stops the run and saves the partial result).
 */
export async function startBench(
  config: BenchRunConfig,
  opts: { onEvent: (e: BenchEvent) => void; signal?: AbortSignal },
): Promise<void> {
  const res = await fetch("/api/bench", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    signal: opts.signal,
    cache: "no-store",
  });
  if (!res.ok) throw new BenchStartError(await errorMessage(res, "Could not start the run"), res.status);
  await readNdjson<BenchEvent>(res, opts.onEvent, { signal: opts.signal });
}

export async function fetchSuites(signal?: AbortSignal): Promise<SuiteInfo[]> {
  const res = await fetch("/api/bench/suites", { signal, cache: "no-store" });
  if (!res.ok) throw new Error(await errorMessage(res, "GET /api/bench/suites failed"));
  const body = (await res.json()) as { suites?: SuiteInfo[] };
  return body.suites ?? [];
}

/** Stored run summaries, newest first. */
export async function fetchRuns(signal?: AbortSignal): Promise<RunSummary[]> {
  const res = await fetch("/api/runs", { signal, cache: "no-store" });
  if (!res.ok) throw new Error(await errorMessage(res, "GET /api/runs failed"));
  const body = (await res.json()) as { runs?: RunSummary[] };
  return body.runs ?? [];
}

export async function fetchRun(id: string, signal?: AbortSignal): Promise<BenchRun> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(await errorMessage(res, `GET /api/runs/${id} failed`));
  const run = (await res.json()) as BenchRun;
  // Runs saved before asText existed may hold an object where text belongs.
  for (const s of run.samples ?? []) {
    s.result.servedModel = asText(s.result.servedModel);
    s.result.servedProvider = asText(s.result.servedProvider);
    s.result.error = asText(s.result.error);
  }
  return run;
}

export async function deleteRun(id: string): Promise<void> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, `Could not delete ${id}`));
}

export interface ImportResult {
  run: RunSummary;
  persisted: boolean;
  warning?: string;
}

/** Import a BenchRun: a File/Blob holding JSON, a JSON string, or a parsed object. */
export async function importRun(input: Blob | string | object): Promise<ImportResult> {
  let body: string;
  if (typeof input === "string") body = input;
  else if (typeof Blob !== "undefined" && input instanceof Blob) body = await input.text();
  else body = JSON.stringify(input);
  try {
    JSON.parse(body);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const res = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!res.ok) throw new Error(await errorMessage(res, "Import failed"));
  return (await res.json()) as ImportResult;
}

/** Trigger a browser download of `data` as pretty JSON. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function runFilename(run: Pick<BenchRun, "id">): string {
  return `tejrouter-run-${run.id}.json`;
}

/** Download a run as JSON. Pass a full BenchRun to skip the fetch (e.g. an unsaved live run). */
export async function exportRun(runOrId: string | BenchRun): Promise<void> {
  const run = typeof runOrId === "string" ? await fetchRun(runOrId) : runOrId;
  downloadJson(runFilename(run), run);
}

// ---------------------------------------------------------------------------
// Pre-flight estimators

/** Mean prompt/completion tokens per task for a suite (computed server-side from the tasks). */
export interface SuiteTokenPrior {
  promptTokens: number;
  /** Rough expected completion length; the answer formats are short. */
  completionTokens: number;
}

export const DEFAULT_TOKEN_PRIOR: SuiteTokenPrior = { promptTokens: 250, completionTokens: 120 };

/** Opt-in task sets always run whole: a cap would split rephrasing groups and drop languages. */
export function tasksPerSuite(suite: Pick<SuiteInfo, "taskCount" | "optional">, maxTasksPerSuite?: number | null): number {
  if (suite.optional) return suite.taskCount;
  return maxTasksPerSuite && maxTasksPerSuite > 0 ? Math.min(suite.taskCount, maxTasksPerSuite) : suite.taskCount;
}

export interface JobEstimate {
  tasks: number;
  arms: number;
  repetitions: number;
  /** tasks × arms × repetitions */
  jobs: number;
  /** Samples each arm will produce: tasks × repetitions. */
  perArm: number;
}

export function estimateJobs(
  suites: SuiteInfo[],
  config: Pick<BenchRunConfig, "suiteIds" | "repetitions" | "maxTasksPerSuite"> & { armCount: number },
): JobEstimate {
  const chosen = suites.filter((s) => config.suiteIds.includes(s.id));
  const tasks = chosen.reduce((n, s) => n + tasksPerSuite(s, config.maxTasksPerSuite), 0);
  const reps = Math.max(1, config.repetitions);
  return { tasks, arms: config.armCount, repetitions: reps, jobs: tasks * config.armCount * reps, perArm: tasks * reps };
}

export interface TokenEstimate {
  /** Prompt tokens per arm (all tasks × reps). */
  promptTokens: number;
  /** Expected completion tokens per arm. */
  completionTokens: number;
  /** Worst case completion tokens per arm (every answer hits maxTokens). */
  completionTokensMax: number;
}

export function estimateTokensPerArm(
  suites: SuiteInfo[],
  config: Pick<BenchRunConfig, "suiteIds" | "repetitions" | "maxTasksPerSuite" | "maxTokens">,
  priors: Record<string, SuiteTokenPrior> = {},
): TokenEstimate {
  let prompt = 0;
  let completion = 0;
  let completionMax = 0;
  const reps = Math.max(1, config.repetitions);
  const cap = config.maxTokens && config.maxTokens > 0 ? config.maxTokens : 1024;
  for (const s of suites) {
    if (!config.suiteIds.includes(s.id)) continue;
    const n = tasksPerSuite(s, config.maxTasksPerSuite) * reps;
    const p = priors[s.id] ?? DEFAULT_TOKEN_PRIOR;
    prompt += n * p.promptTokens;
    completion += n * Math.min(cap, p.completionTokens);
    completionMax += n * cap;
  }
  return { promptTokens: prompt, completionTokens: completion, completionTokensMax: completionMax };
}

export interface CostEstimate {
  /** Model(s) the price came from. */
  basis: string | null;
  /** "exact": price for the model; "candidates": the router picks among priced candidates; "unknown". */
  kind: "exact" | "candidates" | "unknown";
  lowUsd: number | null;
  highUsd: number | null;
}

/**
 * Rough cost range for one arm. Uses the pinned model (or the provider's default model)
 * from lib/pricing.ts. A router auto model with priced candidates (e.g. the simulators)
 * gets a range across its candidates. Low = expected completion length on the cheapest
 * price; high = every answer at maxTokens on the most expensive price.
 */
export function estimateArmCost(
  model: string | null | undefined,
  provider: Pick<ProviderStatus, "defaultModel" | "autoModel" | "suggestedModels"> | undefined,
  tokens: TokenEstimate,
): CostEstimate {
  const effective = model?.trim() || provider?.defaultModel || provider?.autoModel || null;
  const cost = (p: { input: number; output: number }, completion: number) =>
    (tokens.promptTokens * p.input + completion * p.output) / 1e6;
  const exact = lookupPrice(effective);
  if (exact) {
    return {
      basis: exact.key,
      kind: "exact",
      lowUsd: cost(exact, tokens.completionTokens),
      highUsd: cost(exact, tokens.completionTokensMax),
    };
  }
  const isAuto = !model?.trim() || model.trim() === provider?.autoModel;
  const candidates = isAuto
    ? (provider?.suggestedModels ?? []).map((m) => lookupPrice(m)).filter((p): p is NonNullable<typeof p> => !!p)
    : [];
  if (candidates.length >= 2) {
    const cheap = candidates.reduce((a, b) => (a.input + a.output <= b.input + b.output ? a : b));
    const dear = candidates.reduce((a, b) => (a.input + a.output >= b.input + b.output ? a : b));
    return {
      basis: `${cheap.key} … ${dear.key}`,
      kind: "candidates",
      lowUsd: cost(cheap, tokens.completionTokens),
      highUsd: cost(dear, tokens.completionTokensMax),
    };
  }
  return { basis: effective, kind: "unknown", lowUsd: null, highUsd: null };
}

/**
 * Effective parallelism the runner will reach: a global cap plus a per-provider cap of
 * ceil(concurrency / 2) when more than one provider is in the run.
 */
export function effectiveConcurrency(concurrency: number, arms: Pick<BenchArm, "providerId">[]): number {
  const providers = new Set(arms.map((a) => a.providerId)).size;
  if (providers <= 1) return Math.max(1, concurrency);
  const cap = Math.max(1, Math.ceil(concurrency / 2));
  return Math.max(1, Math.min(concurrency, providers * cap));
}

/** Wall time in ms from a per-job prior (default 3 s/job) and effective concurrency. */
export function estimateWallMs(jobs: number, parallel: number, secondsPerJob = SECONDS_PER_JOB_PRIOR): number {
  if (jobs <= 0) return 0;
  return (Math.ceil(jobs / Math.max(1, parallel)) * secondsPerJob * 1000);
}

/**
 * Approximate minimum detectable difference (80% power, two-sided α = 0.05) between two
 * arms' accuracies with n samples each: 2.8 · sqrt(2·p·(1−p)/n). Returns a fraction.
 */
export function minimumDetectableDiff(n: number, p = 0.7): number {
  if (n <= 0) return Infinity;
  return 2.8 * Math.sqrt((2 * p * (1 - p)) / n);
}

/** Samples per arm needed to detect `delta` (fraction) at p with the same approximation. */
export function samplesForMde(delta: number, p = 0.7): number {
  return Math.ceil((2 * p * (1 - p) * 2.8 * 2.8) / (delta * delta));
}

/** Wilson score 95% interval for k successes out of n. */
export function wilson(k: number, n: number, z = 1.959964): { p: number; lo: number; hi: number } | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/** Random 31-bit seed, the same range the server accepts. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
