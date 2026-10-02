/// <reference lib="webworker" />
/**
 * Web Worker that runs the full statistical analysis (lib/analysis) off the main
 * thread. Created by lib/client/report.ts with
 *   new Worker(new URL("./analyze.worker.ts", import.meta.url))
 * Protocol: in  { id, run: BenchRun, options: AnalyzeOptions }
 *           out { id, ok: true, report: RunReport, ms } | { id, ok: false, error }
 */
import { analyzeRun } from "@/lib/analysis/analyze";
import type { AnalyzeOptions } from "@/lib/analysis/types";
import type { BenchRun } from "@/lib/bench/types";

interface AnalyzeRequest {
  id: number;
  run: BenchRun;
  options: AnalyzeOptions;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { id, run, options } = e.data;
  const t0 = performance.now();
  try {
    const report = analyzeRun(run, options);
    ctx.postMessage({ id, ok: true, report, ms: performance.now() - t0 });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

export {};
