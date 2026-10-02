"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ProviderDot } from "@/components/ui/provider";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/client/cn";
import { formatMs, formatNumber, formatUsd } from "@/lib/client/format";
import { exportRun } from "@/lib/client/bench";
import { armName } from "./config";
import { shortDuration } from "./estimate";
import { Heatmap } from "./heatmap";
import { aggregate, type ArmLive } from "./live-stats";
import { liveRunToBenchRun, type LiveRunState } from "./use-bench-run";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function LiveRun({
  state,
  providers,
  suiteNames,
  onStop,
  onReset,
}: {
  state: LiveRunState;
  providers: Record<string, ProviderStatus>;
  suiteNames: Record<string, string>;
  onStop: () => void;
  onReset: () => void;
}) {
  const running = state.status === "running" || state.status === "starting";
  const run = state.run;
  const reps = run?.config.repetitions ?? state.config?.repetitions ?? 1;
  const perArm = (run?.tasks.length ?? 0) * reps;
  const agg = useMemo(() => aggregate(run?.arms ?? [], state.samples, perArm), [run, state.samples, perArm]);
  const simulated = (id: string) => !!providers[id]?.simulated;

  // Clock for the time-left estimate while running.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const t = window.setInterval(tick, 500);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(first);
    };
  }, [running]);

  // Leaving the page stops the run, so ask first.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  const total = state.totalJobs;
  const done = Math.max(state.completed, state.samples.length);
  const frac = total ? Math.min(1, done / total) : 0;
  const clock = Math.max(now, state.startedAt ?? 0);
  const elapsed = state.startedAt ? Math.max(0, clock - state.startedAt) : 0;
  const rate = done && elapsed > 250 ? done / (elapsed / 1000) : null;
  const eta = rate && total > done ? ((total - done) / rate) * 1000 : null;
  const milestone = Math.floor(frac * 10) * 10;

  const progressText =
    state.status === "starting" || !run
      ? "Starting…"
      : running
        ? `${formatNumber(done)} of ${formatNumber(total)}${eta != null ? ` · about ${shortDuration(eta)} left` : ""}`
        : `${formatNumber(done)} of ${formatNumber(total)}`;

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" aria-labelledby="run-title" className="flex flex-col gap-5 p-6 max-sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="run-title" className="truncate text-lg font-semibold text-fg">
              {running ? "Running" : state.end?.aborted ? (state.stoppedByUser ? "Stopped" : "Ended early") : "Done"}
            </h2>
            {run ? <p className="truncate text-sm text-fg-muted">{run.name}</p> : null}
          </div>
          {running ? (
            <Button variant="secondary" onClick={onStop}>
              Stop
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label="Benchmark progress"
            aria-valuemin={0}
            aria-valuemax={total || 1}
            aria-valuenow={done}
            aria-valuetext={`${done} of ${total} calls`}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                running ? "bg-link" : state.end?.aborted ? "bg-warning" : "bg-success",
              )}
              style={{ width: `${frac * 100}%` }}
            />
          </div>
          <p className="num text-sm text-fg-muted">{progressText}</p>
          <p className="sr-only" aria-live="polite">
            {state.status === "done" ? `Benchmark ${state.end?.aborted ? "stopped" : "done"}.` : total ? `${milestone} percent done.` : ""}
          </p>
        </div>

        {state.status === "done" && run ? <Finished state={state} arms={agg.arms} onReset={onReset} /> : null}

        {state.errors.length ? (
          <p className="text-sm text-fg-muted">
            <span className="text-danger">
              {state.errors.length} problem{state.errors.length === 1 ? "" : "s"} reported.
            </span>{" "}
            Latest: {state.errors[state.errors.length - 1]}
          </p>
        ) : null}
      </Card>

      {run ? (
        <Card as="section" aria-labelledby="routers-live-title" className="p-6 max-sm:p-5">
          <h2 id="routers-live-title" className="mb-3 text-lg font-semibold text-fg">
            {running ? "By router, so far" : "By router"}
          </h2>
          <RouterRows arms={agg.arms} simulated={simulated} />
          <Disclosure summary="Show every task" className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-sm text-fg-muted">
              One square per task and router. Darker means a higher score; a red outline means the call failed. Hover a square
              for the answer.
            </p>
            <Heatmap tasks={run.tasks} arms={run.arms} cells={agg.cells} suiteNames={suiteNames} simulated={simulated} />
          </Disclosure>
        </Card>
      ) : null}
    </div>
  );
}

function RouterRows({ arms, simulated }: { arms: ArmLive[]; simulated: (providerId: string) => boolean }) {
  return (
    <table className="w-full table-fixed text-left">
      <thead>
        <tr className="border-b border-border text-[13px] text-fg-muted">
          <th scope="col" className="py-2 pr-3 font-normal">
            Router
          </th>
          <th scope="col" className="w-[4.5rem] py-2 pr-3 text-right font-normal sm:w-28">
            Accuracy
          </th>
          <th scope="col" className="w-28 py-2 pr-3 text-right font-normal max-sm:hidden">
            Avg time
          </th>
          <th scope="col" className="w-[4.5rem] py-2 text-right font-normal sm:w-28">
            Cost
          </th>
        </tr>
      </thead>
      <tbody>
        {arms.map((a) => (
          <tr key={a.arm.id} className="border-b border-border last:border-b-0">
            <td className="py-3 pr-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <ProviderDot color={a.arm.color} simulated={simulated(a.arm.providerId)} size={10} className="max-sm:mt-1.5 max-sm:self-start" />
                <div className="min-w-0">
                  <p className="text-[15px] break-words text-fg sm:truncate" title={a.arm.label}>
                    {armName(a.arm)}
                  </p>
                  {a.errors > 0 ? (
                    <p className="text-[13px] text-danger">
                      {a.errors} failed call{a.errors === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
              </div>
            </td>
            <td className="num py-3 pr-3 text-right text-[15px] font-medium text-fg">
              {a.ci ? (
                <Tooltip content={`Likely between ${pct(a.ci.lo)} and ${pct(a.ci.hi)}, from ${a.n} answers`} align="end">
                  <span tabIndex={0} className="cursor-help underline decoration-border-strong decoration-dotted underline-offset-4">
                    {pct(a.ci.p)}
                  </span>
                </Tooltip>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </td>
            <td className="num py-3 pr-3 text-right text-[15px] text-fg-muted max-sm:hidden">{formatMs(a.meanLatency)}</td>
            <td className="num py-3 text-right text-[15px] text-fg-muted">{a.costN ? formatUsd(a.cost) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One sentence naming the leader, with the uncertainty in plain words. */
function leaderSentence(arms: ArmLive[]): string | null {
  const ranked = arms.filter((a) => a.ci).sort((x, y) => y.ci!.p - x.ci!.p);
  if (!ranked.length) return null;
  const [first, second] = ranked;
  if (!second) return `${armName(first.arm)} scored ${pct(first.ci!.p)}.`;
  if (Math.round(first.ci!.p * 100) === Math.round(second.ci!.p * 100))
    return `${armName(first.arm)} and ${armName(second.arm)} tied at ${pct(first.ci!.p)}.`;
  // Two-proportion z-test: is the gap bigger than chance would usually produce?
  const p1 = first.ci!.p;
  const p2 = second.ci!.p;
  const se = Math.sqrt((p1 * (1 - p1)) / first.n + (p2 * (1 - p2)) / second.n);
  const clear = se === 0 ? p1 !== p2 : (p1 - p2) / se > 1.96;
  const base = `${armName(first.arm)} was the most accurate: ${pct(first.ci!.p)} vs ${pct(second.ci!.p)} for ${armName(second.arm)}.`;
  return clear ? base : `${base} The gap is small enough that it could be chance.`;
}

function Finished({ state, arms, onReset }: { state: LiveRunState; arms: ArmLive[]; onReset: () => void }) {
  const toast = useToast();
  const run = state.run!;
  const aborted = !!state.end?.aborted;
  const persisted = state.end?.persisted;
  const saved = persisted === true || state.partialSave === "saved";
  const unsaved = persisted === false || state.partialSave === "missing";

  const download = async () => {
    const full = liveRunToBenchRun(state);
    try {
      // Prefer the stored copy (it includes calls that finished after a stop).
      if (saved) await exportRun(run.id);
      else if (full) await exportRun(full);
    } catch {
      if (full) await exportRun(full);
    }
    toast({ title: "Downloaded", description: `${run.id}.json`, tone: "success" });
  };

  const lead = leaderSentence(arms);
  const status = aborted
    ? `Stopped after ${formatNumber(state.samples.length)} of ${formatNumber(state.totalJobs)} calls. ${
        saved ? "The partial results are saved." : state.partialSave === "checking" ? "Saving the partial results…" : ""
      }`
    : null;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5">
      <div className="flex flex-col gap-1">
        {lead ? <p className="text-[15px] text-fg">{lead}</p> : null}
        {status ? <p className="text-sm text-fg-muted">{status}</p> : null}
        {unsaved ? (
          <p className="text-sm text-warning">This run could not be saved. Download the data to keep it.</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/runs/${encodeURIComponent(run.id)}`} variant="primary">
          See full results
        </ButtonLink>
        <Button variant="secondary" onClick={download}>
          Download data
        </Button>
        <Button variant="ghost" onClick={onReset}>
          New benchmark
        </Button>
      </div>
    </div>
  );
}
