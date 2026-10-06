import type { CallOptions } from "@/lib/providers/openai";
import { getProviderSpec } from "@/lib/providers/registry";
import type { ChatRequest, ChatResult } from "@/lib/types";
import { normalizeArms } from "./arms";
import { getSuite } from "./suites";
import { hash32, rng, shuffle } from "./suites/util";
import type { BenchArm, BenchEvent, BenchRun, BenchRunConfig, BenchSample, BenchTask, GradeResult } from "./types";

export const MAX_JOBS = 5000;
export const MAX_ARMS = 16;
export const MAX_REPETITIONS = 20;
export const MAX_CONCURRENCY = 32;
export const MAX_RETRIES = 3;

export class BenchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchConfigError";
  }
}

export interface RunPlan {
  /** Config with defaults filled in and arms normalized to full BenchArms. */
  config: BenchRunConfig & { arms: BenchArm[]; seed: number };
  arms: BenchArm[];
  tasks: BenchTask[];
  totalJobs: number;
}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/**
 * Validate a (possibly untrusted) run config and resolve suites/arms/tasks.
 * Throws BenchConfigError with a user-facing message.
 */
export function planRun(input: unknown): RunPlan {
  if (!input || typeof input !== "object") throw new BenchConfigError("Body must be a BenchRunConfig object.");
  const c = input as Partial<BenchRunConfig> & Record<string, unknown>;

  if (!Array.isArray(c.suiteIds) || c.suiteIds.length === 0 || !c.suiteIds.every((s) => typeof s === "string")) {
    throw new BenchConfigError("suiteIds must be a non-empty array of suite ids.");
  }
  const suiteIds = Array.from(new Set(c.suiteIds));
  const suites = suiteIds.map((id) => {
    const s = getSuite(id);
    if (!s) throw new BenchConfigError(`Unknown suite "${id}".`);
    return s;
  });

  if (!Array.isArray(c.arms) || c.arms.length === 0) throw new BenchConfigError("arms must be a non-empty array.");
  for (const a of c.arms) {
    if (!a || typeof a !== "object" || typeof a.providerId !== "string") {
      throw new BenchConfigError("Each arm needs a providerId.");
    }
    if (!getProviderSpec(a.providerId)) throw new BenchConfigError(`Unknown provider "${a.providerId}".`);
    if (a.model != null && typeof a.model !== "string") throw new BenchConfigError("Arm model must be a string.");
  }
  const arms = normalizeArms(c.arms);
  if (arms.length > MAX_ARMS) throw new BenchConfigError(`At most ${MAX_ARMS} arms per run.`);

  const repetitions = c.repetitions ?? 1;
  if (!isInt(repetitions) || repetitions < 1 || repetitions > MAX_REPETITIONS) {
    throw new BenchConfigError(`repetitions must be an integer from 1 to ${MAX_REPETITIONS}.`);
  }
  const concurrency = c.concurrency ?? 4;
  if (!isInt(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new BenchConfigError(`concurrency must be an integer from 1 to ${MAX_CONCURRENCY}.`);
  }
  if (c.temperature != null && (typeof c.temperature !== "number" || c.temperature < 0 || c.temperature > 2)) {
    throw new BenchConfigError("temperature must be a number from 0 to 2.");
  }
  if (c.maxTokens != null && (!isInt(c.maxTokens) || c.maxTokens < 1 || c.maxTokens > 200_000)) {
    throw new BenchConfigError("maxTokens must be a positive integer.");
  }
  if (c.seed != null && (!isInt(c.seed) || Math.abs(c.seed) > 2 ** 31)) {
    throw new BenchConfigError("seed must be an integer.");
  }
  if (c.maxTasksPerSuite != null && (!isInt(c.maxTasksPerSuite) || c.maxTasksPerSuite < 1)) {
    throw new BenchConfigError("maxTasksPerSuite must be a positive integer.");
  }
  if (c.name != null && typeof c.name !== "string") throw new BenchConfigError("name must be a string.");

  const seed = c.seed ?? Math.floor(Math.random() * 2 ** 31);
  const tasks = suites.flatMap((s) => selectTasks(s.tasks, c.maxTasksPerSuite, seed));
  const totalJobs = tasks.length * arms.length * repetitions;
  if (totalJobs > MAX_JOBS) {
    throw new BenchConfigError(
      `This run would make ${totalJobs} calls (${tasks.length} tasks × ${arms.length} arms × ${repetitions} repetitions); the limit is ${MAX_JOBS}. Lower maxTasksPerSuite, repetitions or the number of arms.`,
    );
  }

  const config: RunPlan["config"] = {
    suiteIds,
    arms,
    repetitions,
    concurrency,
    seed,
    ...(c.temperature != null ? { temperature: c.temperature } : {}),
    ...(c.maxTokens != null ? { maxTokens: c.maxTokens } : {}),
    ...(c.maxTasksPerSuite != null ? { maxTasksPerSuite: c.maxTasksPerSuite } : {}),
    ...(c.name?.trim() ? { name: c.name.trim().slice(0, 200) } : {}),
  };
  return { config, arms, tasks, totalJobs };
}

/**
 * Deterministic, difficulty-stratified subsample: sort by difficulty and take evenly spaced
 * tasks with a seeded offset, so a small sample still spans easy to hard. Original order is kept.
 */
export function selectTasks(tasks: BenchTask[], max: number | undefined, seed: number): BenchTask[] {
  if (!max || max >= tasks.length) return tasks;
  const suiteKey = tasks[0]?.suiteId ?? "";
  const r = rng(hash32(`${seed}:${suiteKey}:select`));
  const sorted = tasks
    .map((t, i) => ({ t, i, tie: hash32(`${seed}:${t.id}`) }))
    .sort((a, b) => a.t.difficulty - b.t.difficulty || a.tie - b.tie);
  const offset = r();
  const picked = new Set<number>();
  for (let k = 0; k < max; k++) {
    let idx = Math.min(sorted.length - 1, Math.floor(((k + offset) * sorted.length) / max));
    while (picked.has(idx)) idx = (idx + 1) % sorted.length;
    picked.add(idx);
  }
  return [...picked].map((i) => sorted[i]).sort((a, b) => a.i - b.i).map((x) => x.t);
}

// ---------------------------------------------------------------------------
// Retries
// ---------------------------------------------------------------------------

/** Should this failed call be retried? 429/408/5xx and transport errors yes; config errors no. */
export function isRetryable(r: ChatResult): boolean {
  if (r.ok) return false;
  const s = r.httpStatus;
  if (s === 429 || s === 408 || s === 425 || (s != null && s >= 500)) return true;
  if (/^(Network error|Stream error)/.test(r.error ?? "")) return !/aborted/i.test(r.error ?? "");
  return false;
}

function parseDurationMs(v: string): number | null {
  const s = v.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * 1000;
  // Go-style durations used by OpenAI-compatible gateways: "1s", "250ms", "6m0s".
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(re)) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : m[2] === "m" ? n * 60_000 : n * 3_600_000;
  }
  return matched ? total : null;
}

/** Wait requested by the server via Retry-After (seconds or HTTP date) or rate-limit reset headers. */
export function retryAfterMs(headers: Record<string, string>, now = Date.now()): number | null {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) h[k.toLowerCase()] = v;
  if (h["retry-after-ms"] && /^\d+(\.\d+)?$/.test(h["retry-after-ms"].trim())) return Number(h["retry-after-ms"]);
  const ra = h["retry-after"];
  if (ra) {
    if (/^\d+(\.\d+)?$/.test(ra.trim())) return Number(ra) * 1000;
    const t = Date.parse(ra);
    if (!Number.isNaN(t)) return Math.max(0, t - now);
  }
  for (const k of ["x-ratelimit-reset-requests", "x-ratelimit-reset-tokens", "x-ratelimit-reset", "ratelimit-reset"]) {
    if (!h[k]) continue;
    const v = h[k].trim();
    // Epoch seconds (large numbers) vs. delta seconds/durations.
    if (/^\d{10}$/.test(v)) return Math.max(0, Number(v) * 1000 - now);
    const d = parseDurationMs(v);
    if (d != null) return d;
  }
  return null;
}

const MAX_WAIT_MS = 60_000;

export function backoffMs(attempt: number, result: ChatResult, baseMs: number, random: () => number = Math.random): number {
  const hinted = retryAfterMs(result.routingHeaders);
  if (hinted != null) return Math.min(MAX_WAIT_MS, hinted + random() * baseMs * 0.25);
  const exp = Math.min(MAX_WAIT_MS / 2, baseMs * 2 ** (attempt - 1));
  return exp * (0.5 + random()); // full jitter around the exponential step
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * The benchmark engine. It has no server-only imports: the server runs it with
 * .env.local keys (lib/bench/runner.ts), and the browser runs it when a run uses a key
 * saved in Settings, so that key never leaves the browser (lib/client/local-bench.ts).
 */

export interface EngineOptions {
  /** Makes one router call. */
  call: (req: ChatRequest, opts: CallOptions) => Promise<ChatResult>;
  /** Scores one reply. */
  grade: (task: BenchTask, text: string) => GradeResult | Promise<GradeResult>;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Base for exponential backoff (default 1000 ms). */
  retryBaseMs?: number;
  /** Override the generated run id. */
  runId?: string;
}

interface Job {
  task: BenchTask;
  arm: BenchArm;
  rep: number;
}

export function newRunId(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `run-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultName(plan: RunPlan, createdAt: number): string {
  const when = new Date(createdAt).toISOString().slice(0, 16).replace("T", " ");
  return `${plan.config.suiteIds.join(" + ")} · ${plan.arms.length} arm${plan.arms.length === 1 ? "" : "s"} · ${when} UTC`;
}

function syntheticFailure(job: Job, error: string): ChatResult {
  const now = Date.now();
  return {
    id: `err-${now}`,
    providerId: job.arm.providerId,
    requestedModel: job.arm.model ?? "",
    servedModel: null,
    servedProvider: null,
    ok: false,
    error,
    httpStatus: null,
    text: "",
    finishReason: null,
    usage: { promptTokens: null, completionTokens: null, totalTokens: null },
    costUsd: null,
    costSource: null,
    latencyMs: 0,
    ttftMs: null,
    outputTps: null,
    startedAt: now,
    routingHeaders: {},
  };
}

/**
 * Run a benchmark: every selected task × arm × repetition, in seeded random order, with a
 * global concurrency pool plus a per-provider cap. Emits run-start, one sample event per
 * finished job, and always run-end (also after an abort or a fatal error).
 */
export async function runBenchWith(
  configInput: BenchRunConfig,
  emit: (e: BenchEvent) => void,
  signal: AbortSignal | undefined,
  opts: EngineOptions,
): Promise<BenchRun> {
  const plan = planRun(configInput);
  const call = opts.call;
  const gradeReply = opts.grade;
  const wait = opts.sleep ?? sleep;
  const retryBase = opts.retryBaseMs ?? 1000;
  const safeEmit = (e: BenchEvent) => {
    try {
      emit(e);
    } catch {
      // A broken consumer (e.g. a closed stream) must not kill the run.
    }
  };

  const createdAt = Date.now();
  const run: BenchRun = {
    id: opts.runId ?? newRunId(createdAt),
    name: plan.config.name ?? defaultName(plan, createdAt),
    createdAt,
    finishedAt: null,
    config: plan.config,
    arms: plan.arms,
    tasks: plan.tasks.map((t) => ({ id: t.id, suiteId: t.suiteId, category: t.category, difficulty: t.difficulty })),
    samples: [],
  };
  const { samples: _omit, ...head } = run;
  void _omit;
  safeEmit({ type: "run-start", run: head, totalJobs: plan.totalJobs });

  const jobs: Job[] = [];
  for (const task of plan.tasks)
    for (const arm of plan.arms)
      for (let rep = 0; rep < plan.config.repetitions; rep++) jobs.push({ task, arm, rep });
  const queue = shuffle(rng(hash32(`${plan.config.seed}:order`)), jobs);

  const distinctProviders = new Set(plan.arms.map((a) => a.providerId)).size;
  const globalCap = plan.config.concurrency;
  const providerCap = distinctProviders > 1 ? Math.max(1, Math.ceil(globalCap / 2)) : globalCap;
  const activeByProvider = new Map<string, number>();
  let active = 0;
  let completed = 0;

  const executeJob = async (job: Job): Promise<BenchSample | null> => {
    const req: ChatRequest = {
      providerId: job.arm.providerId,
      ...(job.arm.model ? { model: job.arm.model } : {}),
      messages: job.task.messages,
      ...(plan.config.temperature != null ? { temperature: plan.config.temperature } : {}),
      ...(plan.config.maxTokens != null ? { maxTokens: plan.config.maxTokens } : {}),
      seed: plan.config.seed + job.rep,
      simulatorHint: { expected: job.task.expected, difficulty: job.task.difficulty, category: job.task.category },
    };
    let attempts = 0;
    let result: ChatResult;
    for (;;) {
      attempts++;
      try {
        result = await call(req, { signal });
      } catch (e) {
        result = syntheticFailure(job, `Runner error: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (result.ok || signal?.aborted || attempts > MAX_RETRIES || !isRetryable(result)) break;
      await wait(backoffMs(attempts, result, retryBase), signal);
      if (signal?.aborted) break;
    }
    // A call cut short by the user's abort is not a router failure: drop it.
    if (signal?.aborted && !result.ok) return null;
    let g: GradeResult;
    if (!result.ok) {
      g = { score: 0, correct: false, extracted: null, detail: `request failed: ${result.error ?? "unknown error"}` };
    } else {
      try {
        g = await gradeReply(job.task, result.text);
      } catch (e) {
        g = { score: 0, correct: false, extracted: null, detail: `grader error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    return {
      runId: run.id,
      taskId: job.task.id,
      suiteId: job.task.suiteId,
      category: job.task.category,
      difficulty: job.task.difficulty,
      armId: job.arm.id,
      providerId: job.arm.providerId,
      rep: job.rep,
      result,
      grade: g,
      attempts,
    };
  };

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }
    };
    const onAbort = () => {
      queue.length = 0;
      if (active === 0) finish();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const pump = () => {
      if (signal?.aborted) queue.length = 0;
      for (let i = 0; i < queue.length && active < globalCap; ) {
        const job = queue[i];
        const p = job.arm.providerId;
        if ((activeByProvider.get(p) ?? 0) >= providerCap) {
          i++;
          continue;
        }
        queue.splice(i, 1);
        active++;
        activeByProvider.set(p, (activeByProvider.get(p) ?? 0) + 1);
        executeJob(job)
          .then((sample) => {
            if (sample) {
              run.samples.push(sample);
              completed++;
              safeEmit({ type: "sample", sample, completed, totalJobs: plan.totalJobs });
            }
          })
          .catch((e) => {
            safeEmit({ type: "error", message: `Job ${job.task.id} on ${job.arm.id} failed: ${e instanceof Error ? e.message : String(e)}` });
          })
          .finally(() => {
            active--;
            activeByProvider.set(p, (activeByProvider.get(p) ?? 1) - 1);
            pump();
          });
      }
      if (active === 0 && queue.length === 0) finish();
    };
    pump();
  });

  run.finishedAt = Date.now();
  if (signal?.aborted || run.samples.length < plan.totalJobs) run.aborted = true;
  safeEmit({ type: "run-end", runId: run.id, finishedAt: run.finishedAt, ...(run.aborted ? { aborted: true } : {}) });
  return run;
}
