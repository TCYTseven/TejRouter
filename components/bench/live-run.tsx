"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  IconActivity,
  IconAlert,
  IconArrowRight,
  IconCheckCircle,
  IconDownload,
  IconLayout,
  IconRefresh,
  IconRoute,
  IconStop,
} from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/client/cn";
import { formatMs, formatNumber, formatPercent, formatUsd } from "@/lib/client/format";
import { exportRun } from "@/lib/client/bench";
import { ArmTiles } from "./arm-tiles";
import { Heatmap, ScoreLegend } from "./heatmap";
import { aggregate } from "./live-stats";
import { RoutingFeed, ServedModelBars } from "./routing-feed";
import { liveRunToBenchRun, type LiveRunState } from "./use-bench-run";

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

  // Clock for elapsed / throughput / ETA while running.
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

  // Warn before leaving while the run streams (leaving stops it).
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
  const clock = running ? Math.max(now, state.startedAt ?? 0) : (state.endedAt ?? now);
  const elapsed = state.startedAt ? Math.max(0, clock - state.startedAt) : 0;
  const rate = done && elapsed > (running ? 250 : 0) ? done / (elapsed / 1000) : null;
  const eta = rate && total > done ? ((total - done) / rate) * 1000 : null;
  const milestone = Math.floor(frac * 10) * 10;
  const totalCost = agg.arms.reduce((s, a) => s + a.cost, 0);
  const anyCost = agg.arms.some((a) => a.costN > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card as="section" aria-labelledby="run-progress-title" className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {running ? (
                  <StatusDot status="live" pulse label="Running" />
                ) : state.end?.aborted ? (
                  <StatusDot status="warn" label="Stopped" />
                ) : (
                  <StatusDot status="ok" label="Complete" />
                )}
                <span className="eyebrow">
                  {state.status === "starting" ? "Starting" : running ? "Running" : state.end?.aborted ? (state.stoppedByUser ? "Stopped" : "Ended early") : "Complete"}
                </span>
              </div>
              <h2 id="run-progress-title" className="mt-1 truncate text-base font-semibold tracking-tight text-fg sm:text-lg">
                {run?.name ?? "Preparing run…"}
              </h2>
              {run ? (
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-fg-subtle">
                  {run.id} · seed {run.config.seed}
                </p>
              ) : null}
            </div>
            {running ? (
              <Button variant="danger" size="md" leftIcon={<IconStop size={13} />} onClick={onStop}>
                Stop
              </Button>
            ) : null}
          </div>

          <div
            role="progressbar"
            aria-label="Benchmark progress"
            aria-valuemin={0}
            aria-valuemax={total || 1}
            aria-valuenow={done}
            aria-valuetext={`${done} of ${total} jobs`}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-300", running ? "bg-accent" : state.end?.aborted ? "bg-warning" : "bg-success")}
              style={{ width: `${frac * 100}%` }}
            />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:flex sm:flex-wrap sm:gap-x-6">
            <Stat label="Jobs" value={`${formatNumber(done)} / ${formatNumber(total)}`} />
            <Stat label="Progress" value={formatPercent(frac)} />
            <Stat label="Throughput" value={rate ? `${rate >= 10 ? Math.round(rate) : rate.toFixed(1)} jobs/s` : "—"} />
            <Stat label="Elapsed" value={formatMs(elapsed)} />
            <Stat label={running ? "ETA" : "Cost"} value={running ? (eta != null ? formatMs(eta) : "—") : anyCost ? formatUsd(totalCost) : "—"} />
          </dl>
          <p className="sr-only" aria-live="polite">
            {state.status === "done"
              ? `Run ${state.end?.aborted ? "stopped" : "complete"}: ${done} of ${total} jobs.`
              : total
                ? `Progress ${milestone} percent.`
                : ""}
          </p>

          {state.errors.length ? (
            <ul className="flex flex-col gap-1 rounded-md border border-danger/30 bg-danger-soft px-3 py-2" aria-label="Run errors">
              {state.errors.slice(-4).map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-[11.5px] text-fg">
                  <IconAlert size={13} className="mt-px shrink-0 text-danger" />
                  <span className="min-w-0 break-words">{e}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {state.status === "done" && run ? <EndBar state={state} onReset={onReset} /> : null}
      </Card>

      {run ? (
        <>
          <ArmTiles arms={agg.arms} simulated={simulated} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Card as="section" aria-labelledby="heatmap-title" className="min-w-0 xl:col-span-7">
              <CardHeader
                title={<span id="heatmap-title">Task × arm</span>}
                icon={<IconLayout size={14} />}
                description="Each cell is one task on one arm, colored by score. Rows sorted easy to hard within each suite."
              />
              <div className="flex flex-col gap-2 p-3 sm:p-4">
                <ScoreLegend />
                <Heatmap tasks={run.tasks} arms={run.arms} cells={agg.cells} suiteNames={suiteNames} simulated={simulated} />
                <ArmLegend arms={run.arms} simulated={simulated} />
              </div>
            </Card>
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-5">
              <Card as="section" aria-labelledby="served-title">
                <CardHeader
                  title={<span id="served-title">Served-model mix</span>}
                  icon={<IconRoute size={14} />}
                  description="Which model each arm actually used, so far."
                />
                <div className="p-4">
                  <ServedModelBars arms={agg.arms} models={agg.models} simulated={simulated} />
                </div>
              </Card>
              <Card as="section" aria-labelledby="feed-title" className="flex min-h-0 flex-col">
                <CardHeader
                  title={<span id="feed-title">Routing feed</span>}
                  icon={<IconActivity size={14} />}
                  description="Latest samples: arm, task, served model, score, latency."
                  actions={<Badge className="num">{formatNumber(state.samples.length)}</Badge>}
                />
                <div className="px-3 py-1">
                  <RoutingFeed samples={state.samples} arms={run.arms} simulated={simulated} />
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="num text-fg">{value}</dd>
    </div>
  );
}

function ArmLegend({ arms, simulated }: { arms: { id: string; label: string; color: string; providerId: string }[]; simulated: (id: string) => boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2" aria-label="Arm key">
      {arms.map((a, i) => (
        <li key={a.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-fg-muted">
          <span className="num w-3 shrink-0 text-[10px] font-semibold text-fg-muted">{String.fromCharCode(65 + i)}</span>
          <span
            className={cn("h-2 w-2 shrink-0", simulated(a.providerId) ? "rounded-full" : "rounded-[2px]")}
            style={simulated(a.providerId) ? { boxShadow: `inset 0 0 0 2px ${a.color}` } : { background: a.color }}
          />
          <span className="truncate">{a.label}</span>
        </li>
      ))}
    </ul>
  );
}

function EndBar({ state, onReset }: { state: LiveRunState; onReset: () => void }) {
  const toast = useToast();
  const run = state.run!;
  const aborted = !!state.end?.aborted;
  const persisted = state.end?.persisted;
  const saveState: "saved" | "unsaved" | "checking" | "unknown" =
    persisted === true || state.partialSave === "saved"
      ? "saved"
      : persisted === false || state.partialSave === "missing"
        ? "unsaved"
        : state.partialSave === "checking"
          ? "checking"
          : "unknown";

  const doExport = async () => {
    const full = liveRunToBenchRun(state);
    try {
      // Prefer the stored copy (it includes samples that finished after a stop); fall back to the live one.
      if (saveState === "saved") await exportRun(run.id);
      else if (full) await exportRun(full);
    } catch {
      if (full) await exportRun(full);
    }
    toast({ title: "Run exported", description: `${run.id}.json`, tone: "success" });
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        aborted ? "border-warning/30 bg-warning-soft" : "border-success/30 bg-success-soft",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {aborted ? <IconAlert size={16} className="mt-0.5 shrink-0 text-warning" /> : <IconCheckCircle size={16} className="mt-0.5 shrink-0 text-success" />}
        <div className="min-w-0 text-xs">
          <p className="font-medium text-fg">
            {aborted
              ? `${state.stoppedByUser ? "Stopped" : "Ended early"} with ${formatNumber(state.samples.length)} of ${formatNumber(state.totalJobs)} jobs.`
              : `All ${formatNumber(state.totalJobs)} jobs finished.`}
          </p>
          <p className="mt-0.5 text-fg-muted">
            {saveState === "saved"
              ? aborted
                ? "The partial run is saved; the report treats it as incomplete."
                : "Saved. The full report has significance tests, cost-quality frontier and routing analysis."
              : saveState === "checking"
                ? "Saving the partial run…"
                : saveState === "unsaved"
                  ? "Could not save this run to disk. Export the JSON to keep it; the report may be unavailable after a restart."
                  : "Save status unknown. Export the JSON to be safe."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="md" leftIcon={<IconRefresh size={13} />} onClick={onReset}>
          New run
        </Button>
        <Button variant="secondary" size="md" leftIcon={<IconDownload size={13} />} onClick={doExport}>
          Export JSON
        </Button>
        <ButtonLink href={`/runs/${encodeURIComponent(run.id)}`} variant="accent" size="md" rightIcon={<IconArrowRight size={13} />}>
          Open full report
        </ButtonLink>
      </div>
    </div>
  );
}
