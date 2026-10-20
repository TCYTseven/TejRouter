"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BenchEvent, BenchRun, BenchRunConfig, BenchSample } from "@/lib/bench/types";
import { BenchStartError, fetchRun, startBench } from "@/lib/client/bench";
import { runsInBrowser, startLocalBench } from "@/lib/client/local-bench";
import { saveLocalRun } from "@/lib/client/local-runs";

async function pollSaved(id: string, isCurrent: () => boolean): Promise<boolean> {
  for (let i = 0; i < 15 && isCurrent(); i++) {
    await new Promise((r) => window.setTimeout(r, i === 0 ? 400 : 1000));
    try {
      await fetchRun(id, undefined, { localFallback: false });
      return true;
    } catch {
      /* not saved yet */
    }
  }
  return false;
}

export type RunStatus = "idle" | "starting" | "running" | "done" | "failed";
export type RunEnd = Extract<BenchEvent, { type: "run-end" }>;
export type RunHead = Omit<BenchRun, "samples">;

export interface LiveRunState {
  status: RunStatus;
  config: BenchRunConfig | null;
  run: RunHead | null;
  totalJobs: number;
  completed: number;
  samples: BenchSample[];
  /** Client clock when the request was sent / when the stream ended. */
  startedAt: number | null;
  endedAt: number | null;
  end: RunEnd | null;
  /** Non-fatal error events from the stream. */
  errors: string[];
  /** Config rejected or the stream failed before run-start. */
  startError: string | null;
  stoppedByUser: boolean;
  /**
   * After a user stop the client never sees run-end, so it polls GET /api/runs/[id] for the
   * saved partial run: "checking" -> "saved" | "missing". Null otherwise.
   */
  partialSave: "checking" | "saved" | "missing" | null;
  /** A copy is kept in this browser's storage (lib/client/local-runs.ts), so the report opens anywhere. */
  savedLocally: boolean;
}

const INITIAL: LiveRunState = {
  status: "idle",
  config: null,
  run: null,
  totalJobs: 0,
  completed: 0,
  samples: [],
  startedAt: null,
  endedAt: null,
  end: null,
  errors: [],
  startError: null,
  stoppedByUser: false,
  partialSave: null,
  savedLocally: false,
};

/** Keep the finished run in this browser; the server copy may live only in one instance's memory. */
function keepLocally(s: LiveRunState): boolean {
  const run = liveRunToBenchRun(s);
  if (!run) return false;
  const id = s.end?.runId || run.id;
  return saveLocalRun({ ...run, id, samples: run.samples.map((x) => ({ ...x, runId: id })) });
}

/** Marks the local copy; a server that could not write to disk is then not a problem worth reporting. */
function withLocalCopy(s: LiveRunState): LiveRunState {
  const savedLocally = keepLocally(s);
  if (!savedLocally) return s;
  return { ...s, savedLocally, errors: s.errors.filter((e) => !e.startsWith("Run finished but could not be saved")) };
}

/**
 * Drives POST /api/bench, or the in-browser runner when the run uses a browser key. Sample events arrive in bursts (simulators finish hundreds per
 * second), so they are buffered and flushed into React state once per animation frame.
 */
export function useBenchRun() {
  const [state, setState] = useState<LiveRunState>(INITIAL);
  const ctlRef = useRef<AbortController | null>(null);
  const buffer = useRef<BenchSample[]>([]);
  const completedRef = useRef(0);
  const frame = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);
  const sawEndRef = useRef(false);

  const flush = useCallback(() => {
    frame.current = null;
    if (!buffer.current.length) return;
    const batch = buffer.current;
    buffer.current = [];
    const completed = completedRef.current;
    setState((s) => ({ ...s, samples: s.samples.concat(batch), completed: Math.max(s.completed, completed) }));
  }, []);

  const schedule = useCallback(() => {
    if (frame.current != null) return;
    frame.current = window.requestAnimationFrame(flush);
  }, [flush]);

  useEffect(
    () => () => {
      ctlRef.current?.abort();
      if (frame.current != null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  const start = useCallback(
    async (config: BenchRunConfig) => {
      ctlRef.current?.abort();
      const ctl = new AbortController();
      ctlRef.current = ctl;
      buffer.current = [];
      completedRef.current = 0;
      runIdRef.current = null;
      sawEndRef.current = false;
      setState({ ...INITIAL, status: "starting", config, startedAt: Date.now() });

      const onEvent = (e: BenchEvent) => {
        if (ctl !== ctlRef.current) return;
        switch (e.type) {
          case "run-start":
            runIdRef.current = e.run.id;
            setState((s) => ({ ...s, status: "running", run: e.run, totalJobs: e.totalJobs, startedAt: Date.now() }));
            break;
          case "sample":
            buffer.current.push(e.sample);
            completedRef.current = Math.max(completedRef.current, e.completed);
            schedule();
            break;
          case "error":
            setState((s) => ({ ...s, errors: [...s.errors, e.message].slice(-20) }));
            break;
          case "run-end":
            sawEndRef.current = true;
            flush();
            setState((s) => ({ ...s, end: e, endedAt: Date.now() }));
            break;
        }
      };

      try {
        // A run that uses a key saved in Settings runs in this tab so the key stays here.
        const begin = runsInBrowser(config) ? startLocalBench : startBench;
        await begin(config, { onEvent, signal: ctl.signal });
        flush();
        setState((s) => {
          if (s.run) {
            const done: LiveRunState = { ...s, status: "done", endedAt: s.endedAt ?? Date.now() };
            return withLocalCopy(done);
          }
          return { ...s, status: "failed", startError: s.errors[0] ?? "The run ended before it started." };
        });
      } catch (e) {
        if (ctl !== ctlRef.current) return;
        flush();
        const aborted = ctl.signal.aborted;
        const message = e instanceof BenchStartError ? e.message : e instanceof Error ? e.message : String(e);
        const runId = runIdRef.current;
        const sawEnd = sawEndRef.current;
        setState((s) => {
          // Stopped before run-start arrived: back to the setup form (the stop toast explains it).
          if (!s.run) return aborted ? INITIAL : { ...s, status: "failed", startError: message };
          // Stream cut (user stop or network): the server keeps and saves the partial run.
          const done: LiveRunState = {
            ...s,
            status: "done",
            endedAt: s.endedAt ?? Date.now(),
            stoppedByUser: aborted,
            end:
              s.end ??
              ({ type: "run-end", runId: s.run.id, finishedAt: Date.now(), aborted: true } satisfies RunEnd),
            errors: aborted ? s.errors : [...s.errors, `Stream interrupted: ${message}`],
            partialSave: sawEnd ? null : "checking",
          };
          return withLocalCopy(done);
        });
        if (runId && !sawEnd) {
          const saved = await pollSaved(runId, () => ctl === ctlRef.current);
          // The server's partial copy holds calls that finished after the stop: keep it here too.
          if (saved) await fetchRun(runId, undefined, { localFallback: false }).catch(() => null);
          if (ctl === ctlRef.current) {
            setState((s) => (s.partialSave === "checking" ? { ...s, partialSave: saved ? "saved" : "missing" } : s));
          }
        }
      }
    },
    [flush, schedule],
  );

  const stop = useCallback(() => {
    ctlRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    ctlRef.current?.abort();
    ctlRef.current = null;
    buffer.current = [];
    setState(INITIAL);
  }, []);

  return { state, start, stop, reset };
}

/** The run as a full BenchRun (for export), from the live state. */
export function liveRunToBenchRun(s: LiveRunState): BenchRun | null {
  if (!s.run) return null;
  return {
    ...s.run,
    finishedAt: s.end?.finishedAt ?? s.run.finishedAt ?? null,
    ...(s.end?.aborted ? { aborted: true } : {}),
    samples: s.samples,
  };
}
