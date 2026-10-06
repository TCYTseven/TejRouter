"use client";

import { useMemo } from "react";
import type { SuiteInfo } from "@/lib/bench/types";
import type { ProviderStatus } from "@/lib/types";
import { useWithBrowserKeys } from "@/lib/client/keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { formatNumber, formatUsd } from "@/lib/client/format";
import { useStoredState } from "@/lib/client/storage";
import type { SuiteTokenPrior } from "@/lib/client/bench";
import {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  defaultArms,
  isLauncherConfig,
  resolveSuiteIds,
  toRunConfig,
  type ArmDraft,
  type LauncherConfig,
} from "./config";
import { aboutDuration, computeEstimate } from "./estimate";
import { LiveRun } from "./live-run";
import { RouterList, useNormalizedArms } from "./router-list";
import { TaskOptions } from "./task-options";
import { useBenchRun } from "./use-bench-run";

/** Rough dollars for an estimate: "$0.03", "$2.82", "under $0.01". */
function roughUsd(n: number): string {
  if (n < 0.005) return "under $0.01";
  return n >= 100 ? formatUsd(n) : `$${n.toFixed(2)}`;
}

function costRange(low: number | null, high: number | null): string | null {
  if (low == null || high == null) return null;
  const lo = roughUsd(low);
  const hi = roughUsd(high);
  return lo === hi ? `about ${lo}` : `about ${lo} to ${hi}`;
}

export function BenchLauncher({
  providers: serverProviders,
  suites,
  tokenPriors,
}: {
  providers: ProviderStatus[];
  suites: SuiteInfo[];
  tokenPriors: Record<string, SuiteTokenPrior>;
}) {
  const toast = useToast();
  const providers = useWithBrowserKeys(serverProviders);
  const providerMap = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const [stored, setStored] = useStoredState<LauncherConfig>(CONFIG_KEY, DEFAULT_CONFIG, isLauncherConfig);
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...stored }), [stored]);
  const patch = (p: Partial<LauncherConfig>) => setStored((s) => ({ ...DEFAULT_CONFIG, ...s, ...p }));

  // null = defaults; an explicit empty list stays empty so "remove all" works.
  const arms = useMemo<ArmDraft[]>(() => {
    if (config.arms == null) return defaultArms(providers);
    return config.arms.filter((a) => providerMap[a.providerId]);
  }, [config.arms, providerMap, providers]);
  const suiteIds = useMemo(() => resolveSuiteIds(config, suites), [config, suites]);
  const suiteNames = useMemo(() => Object.fromEntries(suites.map((s) => [s.id, s.name])), [suites]);
  const normalized = useNormalizedArms(arms);
  const uniqueArms = useMemo(() => [...normalized.values()], [normalized]);
  const est = useMemo(
    () => computeEstimate(config, suiteIds, suites, uniqueArms, providerMap, tokenPriors),
    [config, suiteIds, suites, uniqueArms, providerMap, tokenPriors],
  );
  const presetHint = (p: { maxTasksPerSuite: number | null; repetitions: number }) =>
    aboutDuration(computeEstimate({ ...config, ...p }, suiteIds, suites, uniqueArms, providerMap, tokenPriors).wallMs);

  const { state, start, stop, reset } = useBenchRun();
  const showLive = state.status !== "idle" && state.status !== "failed";
  const blocking = est.note?.blocking ?? false;

  const run = () => {
    if (blocking) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    void start(toRunConfig(config, suites, arms));
  };

  const cost = costRange(est.costLow, est.costHigh);
  const summary = [`${formatNumber(est.jobs)} calls`, cost, aboutDuration(est.wallMs)].filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader title="Benchmark" description="Score your routers on graded tasks with known answers." />

      {showLive ? (
        <LiveRun
          state={state}
          providers={providerMap}
          suiteNames={suiteNames}
          onStop={() => {
            stop();
            toast({ title: "Stopping", description: "Calls already sent will finish, and the partial run is saved.", tone: "info" });
          }}
          onReset={reset}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {state.status === "failed" ? (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
              The benchmark did not start: {state.startError}
            </div>
          ) : null}

          <Card as="section" aria-labelledby="routers-title" className="p-6 max-sm:p-5">
            <h2 id="routers-title" className="mb-4 text-lg font-semibold text-fg">
              1. Routers
            </h2>
            <RouterList arms={arms} onChange={(next) => patch({ arms: next })} providers={providers} />
          </Card>

          <Card as="section" aria-labelledby="tasks-title" className="p-6 max-sm:p-5">
            <h2 id="tasks-title" className="mb-4 text-lg font-semibold text-fg">
              2. Tasks
            </h2>
            <TaskOptions suites={suites} selected={suiteIds} config={config} onChange={patch} presetHint={presetHint} />
          </Card>

          <section aria-label="Summary" className="flex flex-col gap-3">
            {est.note ? (
              <p
                role={est.note.blocking ? "alert" : undefined}
                className={
                  est.note.blocking
                    ? "rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg"
                    : "rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg"
                }
              >
                {est.note.text}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="num text-[15px] text-fg-muted">{summary}</p>
              <Button variant="primary" size="lg" disabled={blocking} onClick={run} className="max-sm:w-full">
                Start benchmark
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
