"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyzeOptions, RunReport } from "@/lib/analysis/types";
import type { BenchRun } from "@/lib/bench/types";
import { analyzeInBrowser, fetchBenchRun, RunNotFoundError, type AnalysisResult } from "@/lib/client/report";

export interface AnalysisSettings {
  bootstrapIterations: number;
  level: number;
  seed: number | null;
}

export type ReportState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "analyzing"; run: BenchRun; previous: AnalysisResult | null }
  | { status: "ready"; run: BenchRun; result: AnalysisResult; analyzing: boolean };

export const DEFAULT_SETTINGS: AnalysisSettings = { bootstrapIterations: 1000, level: 0.95, seed: null };

/**
 * Loads a run and analyzes it (worker first, main-thread fallback). `reanalyze`
 * re-runs the analysis with new settings while the previous report stays on
 * screen (dimmed) so the layout never jumps.
 */
export function useRunReport(id: string) {
  const [state, setState] = useState<ReportState>({ status: "loading" });
  const [settings, setSettings] = useState<AnalysisSettings>(DEFAULT_SETTINGS);
  const runRef = useRef<BenchRun | null>(null);
  const resultRef = useRef<AnalysisResult | null>(null);
  const seq = useRef(0);

  const analyze = useCallback(async (run: BenchRun, s: AnalysisSettings) => {
    const mine = ++seq.current;
    const opts: AnalyzeOptions = { bootstrapIterations: s.bootstrapIterations, level: s.level };
    if (s.seed != null) opts.seed = s.seed;
    try {
      const result = await analyzeInBrowser(run, opts);
      if (mine !== seq.current) return;
      resultRef.current = result;
      setState({ status: "ready", run, result, analyzing: false });
    } catch (e) {
      if (mine !== seq.current) return;
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchBenchRun(id, ctrl.signal)
      .then((run) => {
        runRef.current = run;
        setState({ status: "analyzing", run, previous: null });
        return analyze(run, DEFAULT_SETTINGS);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof RunNotFoundError) setState({ status: "not-found" });
        else setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => ctrl.abort();
  }, [id, analyze]);

  const reanalyze = useCallback(
    (s: AnalysisSettings) => {
      setSettings(s);
      const run = runRef.current;
      if (!run) return;
      const prev = resultRef.current;
      if (prev) setState({ status: "ready", run, result: prev, analyzing: true });
      else setState({ status: "analyzing", run, previous: null });
      void analyze(run, s);
    },
    [analyze],
  );

  return { state, settings, reanalyze };
}

export type { RunReport };
