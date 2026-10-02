import type { AnalyzeOptions, RunReport } from "@/lib/analysis/types";
import type { BenchRun } from "@/lib/bench/types";

/**
 * Browser-side loading and analysis for the run report (app/(app)/runs/[id]).
 *
 * - fetchBenchRun: GET /api/runs/[id] with a typed 404.
 * - analyzeInBrowser: runs lib/analysis in a Web Worker (one shared worker, requests
 *   matched by id, stale requests superseded). If the worker cannot be created or
 *   crashes, falls back to the main thread with a lighter bootstrap (400 resamples)
 *   loaded on demand so the analysis code stays out of the page bundle.
 */

export class RunNotFoundError extends Error {
  constructor(id: string) {
    super(`Run "${id}" was not found.`);
    this.name = "RunNotFoundError";
  }
}

export async function fetchBenchRun(id: string, signal?: AbortSignal): Promise<BenchRun> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, { signal, cache: "no-store" });
  if (res.status === 404) throw new RunNotFoundError(id);
  if (!res.ok) {
    let msg = `Could not load run (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) msg = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return (await res.json()) as BenchRun;
}

export interface AnalysisResult {
  report: RunReport;
  /** Where the analysis ran. */
  engine: "worker" | "main-thread";
  ms: number;
}

/** Bootstrap resamples used when the worker is unavailable (keeps the UI responsive). */
export const MAIN_THREAD_BOOTSTRAP = 400;

type Pending = { resolve: (r: AnalysisResult) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(err: Error) {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerBroken || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./analyze.worker.ts", import.meta.url), { type: "module", name: "tejrouter-analyze" });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; report?: RunReport; error?: string; ms?: number }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok && e.data.report) p.resolve({ report: e.data.report, engine: "worker", ms: e.data.ms ?? 0 });
    else p.reject(new Error(e.data.error || "Analysis failed"));
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    workerBroken = true;
    worker?.terminate();
    worker = null;
    failAll(new WorkerUnavailableError(e.message || "Analysis worker crashed"));
  };
  return worker;
}

class WorkerUnavailableError extends Error {}

async function analyzeOnMainThread(run: BenchRun, options: AnalyzeOptions): Promise<AnalysisResult> {
  const { analyzeRun } = await import("@/lib/analysis/analyze");
  // Yield a frame so the skeleton paints before the synchronous work.
  await new Promise((r) => setTimeout(r, 16));
  const t0 = performance.now();
  const report = analyzeRun(run, {
    ...options,
    bootstrapIterations: Math.min(options.bootstrapIterations ?? MAIN_THREAD_BOOTSTRAP, MAIN_THREAD_BOOTSTRAP),
  });
  return { report, engine: "main-thread", ms: performance.now() - t0 };
}

/** Analyze a run off the main thread when possible. */
export async function analyzeInBrowser(run: BenchRun, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
  const w = getWorker();
  if (!w) return analyzeOnMainThread(run, options);
  const id = nextId++;
  try {
    return await new Promise<AnalysisResult>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        w.postMessage({ id, run, options });
      } catch (err) {
        pending.delete(id);
        reject(new WorkerUnavailableError(err instanceof Error ? err.message : String(err)));
      }
    });
  } catch (err) {
    if (err instanceof WorkerUnavailableError) {
      workerBroken = true;
      return analyzeOnMainThread(run, options);
    }
    throw err;
  }
}

/** Save a JSON value as a file download. */
export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
