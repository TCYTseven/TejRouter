"use client";

import type { ReactNode } from "react";
import type { BenchArm, SuiteInfo } from "@/lib/bench/types";
import type { ProviderStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { IconAlert, IconCheckCircle, IconInfo, IconPlay } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { formatCompact, formatMs, formatNumber, formatUsd } from "@/lib/client/format";
import {
  MAX_ARMS,
  MAX_JOBS,
  SECONDS_PER_JOB_PRIOR,
  effectiveConcurrency,
  estimateArmCost,
  estimateJobs,
  estimateTokensPerArm,
  estimateWallMs,
  minimumDetectableDiff,
  samplesForMde,
  type SuiteTokenPrior,
} from "@/lib/client/bench";
import type { LauncherConfig } from "./config";

export interface PreflightWarning {
  level: "error" | "warn" | "info";
  text: ReactNode;
}

export interface Preflight {
  tasks: number;
  jobs: number;
  perArm: number;
  repetitions: number;
  arms: BenchArm[];
  mde: number;
  parallel: number;
  wallMs: number;
  allSimulated: boolean;
  promptTokens: number;
  completionTokens: number;
  costs: { arm: BenchArm; low: number | null; high: number | null; basis: string | null; kind: string }[];
  totalLow: number | null;
  totalHigh: number | null;
  unknownCost: number;
  warnings: PreflightWarning[];
  blocking: boolean;
}

const P = 0.7;
const TARGET = 0.05;

export function computePreflight(
  config: LauncherConfig,
  suiteIds: string[],
  suites: SuiteInfo[],
  arms: BenchArm[],
  duplicateCount: number,
  providers: Record<string, ProviderStatus>,
  priors: Record<string, SuiteTokenPrior>,
): Preflight {
  const est = estimateJobs(suites, {
    suiteIds,
    repetitions: config.repetitions,
    maxTasksPerSuite: config.maxTasksPerSuite ?? undefined,
    armCount: arms.length,
  });
  const tokens = estimateTokensPerArm(
    suites,
    { suiteIds, repetitions: config.repetitions, maxTasksPerSuite: config.maxTasksPerSuite ?? undefined, maxTokens: config.maxTokens ?? undefined },
    priors,
  );
  const costs = arms.map((arm) => {
    const c = estimateArmCost(arm.model, providers[arm.providerId], tokens);
    return { arm, low: c.lowUsd, high: c.highUsd, basis: c.basis, kind: c.kind };
  });
  const known = costs.filter((c) => c.low != null);
  const parallel = effectiveConcurrency(config.concurrency, arms);
  const allSimulated = arms.length > 0 && arms.every((a) => providers[a.providerId]?.simulated);
  const mde = minimumDetectableDiff(est.perArm, P);

  const warnings: PreflightWarning[] = [];
  if (!suiteIds.length) warnings.push({ level: "error", text: "Select at least one suite." });
  if (!arms.length) warnings.push({ level: "error", text: "Add at least one arm." });
  if (arms.length > MAX_ARMS) warnings.push({ level: "error", text: `At most ${MAX_ARMS} arms per run.` });
  if (est.jobs > MAX_JOBS)
    warnings.push({
      level: "error",
      text: `${formatNumber(est.jobs)} jobs is over the ${formatNumber(MAX_JOBS)} limit. Cap tasks per suite, drop repetitions or arms.`,
    });
  const unconfigured = arms.filter((a) => {
    const p = providers[a.providerId];
    return p && !p.configured && !p.simulated;
  });
  if (unconfigured.length)
    warnings.push({
      level: "warn",
      text: `${unconfigured.map((a) => providers[a.providerId]?.name ?? a.providerId).join(", ")} ${unconfigured.length === 1 ? "has" : "have"} no API key: every call on ${unconfigured.length === 1 ? "that arm" : "those arms"} will fail and count as wrong.`,
    });
  if (duplicateCount)
    warnings.push({ level: "info", text: `${duplicateCount} duplicate arm${duplicateCount === 1 ? "" : "s"} will be dropped.` });
  if (arms.length === 1)
    warnings.push({ level: "warn", text: "A single arm means no comparisons: add a second router or a pinned baseline." });
  if (est.perArm > 0 && mde > TARGET)
    warnings.push({
      level: "warn",
      text: (
        <>
          With n = {formatNumber(est.perArm)} samples per arm the smallest accuracy gap you can reliably detect is about{" "}
          <span className="num font-medium text-fg">{(mde * 100).toFixed(1)} pp</span>. Detecting 5 pp needs about{" "}
          <span className="num">{formatNumber(samplesForMde(TARGET, P))}</span> samples per arm.
        </>
      ),
    });
  if (config.temperature > 0 && config.repetitions === 1)
    warnings.push({ level: "info", text: "Temperature above 0 with 1 repetition: add repetitions to measure run-to-run variance." });

  return {
    tasks: est.tasks,
    jobs: est.jobs,
    perArm: est.perArm,
    repetitions: est.repetitions,
    arms,
    mde,
    parallel,
    wallMs: estimateWallMs(est.jobs, parallel),
    allSimulated,
    promptTokens: tokens.promptTokens * arms.length,
    completionTokens: tokens.completionTokens * arms.length,
    costs,
    totalLow: known.length ? known.reduce((s, c) => s + (c.low ?? 0), 0) : null,
    totalHigh: known.length ? known.reduce((s, c) => s + (c.high ?? 0), 0) : null,
    unknownCost: costs.length - known.length,
    warnings,
    blocking: warnings.some((w) => w.level === "error"),
  };
}

function Figure({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-surface-2 px-2.5 py-2">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <span className="truncate text-base font-semibold tracking-tight text-fg">{value}</span>
      {sub ? <span className="text-[10.5px] leading-snug text-fg-muted">{sub}</span> : null}
    </div>
  );
}

function costRange(low: number | null, high: number | null): string {
  if (low == null || high == null) return "unknown";
  if (Math.abs(high - low) < 1e-9) return formatUsd(low);
  return `${formatUsd(low)} – ${formatUsd(high)}`;
}

export function PreflightPanel({
  pre,
  onRun,
  starting,
  className,
}: {
  pre: Preflight;
  onRun: () => void;
  starting?: boolean;
  className?: string;
}) {
  const mdeOk = pre.mde <= TARGET;
  return (
    <section aria-labelledby="preflight-title" className={cn("flex flex-col rounded-lg border border-border bg-surface shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="eyebrow mb-0.5">Pre-flight</div>
          <h2 id="preflight-title" className="text-sm font-semibold tracking-tight text-fg">
            What this run will cost you
          </h2>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Figure
            label="Total jobs"
            value={formatNumber(pre.jobs)}
            sub={
              <span className="num">
                {pre.tasks} tasks × {pre.arms.length} arms × {pre.repetitions} reps
              </span>
            }
          />
          <Figure
            label="Wall time"
            value={pre.allSimulated ? "seconds" : `~${formatMs(pre.wallMs)}`}
            sub={pre.allSimulated ? "simulators answer instantly" : `${pre.parallel} parallel × ${SECONDS_PER_JOB_PRIOR} s/job prior`}
          />
          <Figure
            label="Tokens (est.)"
            value={formatCompact(pre.promptTokens + pre.completionTokens)}
            sub={`${formatCompact(pre.promptTokens)} in · ${formatCompact(pre.completionTokens)} out`}
          />
          <Figure
            label="Detectable gap"
            value={Number.isFinite(pre.mde) ? `${(pre.mde * 100).toFixed(1)} pp` : "—"}
            sub={
              <span className={mdeOk ? "text-success" : undefined}>
                n = {formatNumber(pre.perArm)}/arm{mdeOk ? " · resolves 5 pp" : ""}
              </span>
            }
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-medium text-fg">Cost per arm</h3>
            <span className="text-[10.5px] text-fg-subtle">rough estimate, list prices</span>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {pre.costs.map((c) => (
              <li key={c.arm.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <ProviderDot color={c.arm.color} size={8} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-fg">{c.arm.label}</span>
                  <span className="block truncate font-mono text-[10px] text-fg-subtle">
                    {c.kind === "unknown" ? `no price for ${c.basis ?? "router default"}` : c.kind === "candidates" ? `range over ${c.basis}` : `priced as ${c.basis}`}
                  </span>
                </span>
                <span className={cn("num shrink-0 text-right text-[11px]", c.low == null ? "text-fg-subtle" : "text-fg")}>
                  {costRange(c.low, c.high)}
                </span>
              </li>
            ))}
            {pre.costs.length > 1 ? (
              <li className="flex items-center justify-between gap-2 bg-surface-2 px-2.5 py-1.5">
                <span className="text-xs font-medium text-fg">
                  Total{pre.unknownCost ? <span className="font-normal text-fg-subtle"> (+{pre.unknownCost} unknown)</span> : null}
                </span>
                <span className="num text-[11px] font-medium text-fg">{costRange(pre.totalLow, pre.totalHigh)}</span>
              </li>
            ) : null}
          </ul>
          <p className="mt-1.5 text-[10.5px] leading-snug text-fg-subtle">
            Low end: expected answer lengths at the cheapest price. High end: every answer hits max tokens. Routers that
            report their own cost are billed as reported in the results.
          </p>
        </div>

        {pre.warnings.length ? (
          <ul className="flex flex-col gap-1.5" aria-label="Pre-flight warnings">
            {pre.warnings.map((w, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11.5px] leading-snug",
                  w.level === "error" && "border-danger/30 bg-danger-soft text-fg",
                  w.level === "warn" && "border-warning/30 bg-warning-soft text-fg",
                  w.level === "info" && "border-border bg-surface-2 text-fg-muted",
                )}
              >
                {w.level === "info" ? (
                  <IconInfo size={14} className="mt-px shrink-0 text-info" title="Note" />
                ) : (
                  <IconAlert
                    size={14}
                    className={cn("mt-px shrink-0", w.level === "error" ? "text-danger" : "text-warning")}
                    title={w.level === "error" ? "Blocking" : "Warning"}
                  />
                )}
                <span className="min-w-0">{w.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-xs text-success">
            <IconCheckCircle size={14} /> Ready: no warnings.
          </p>
        )}

        <Button
          variant="accent"
          size="lg"
          className="w-full"
          leftIcon={<IconPlay size={14} />}
          loading={starting}
          disabled={pre.blocking}
          onClick={onRun}
        >
          Run {formatNumber(pre.jobs)} jobs
        </Button>
      </div>
    </section>
  );
}
