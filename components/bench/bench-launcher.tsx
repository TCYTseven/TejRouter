"use client";

import { useMemo } from "react";
import type { SuiteInfo } from "@/lib/bench/types";
import type { ProviderStatus } from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconAlert, IconBook, IconCpu, IconFlask, IconList, IconPlay, IconSliders } from "@/components/ui/icons";
import { formatNumber } from "@/lib/client/format";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useStoredState } from "@/lib/client/storage";
import type { SuiteTokenPrior } from "@/lib/client/bench";
import { ArmBuilder, useNormalizedArms } from "./arm-builder";
import {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  activePreset,
  defaultArms,
  draftArmId,
  isLauncherConfig,
  resolveSuiteIds,
  toRunConfig,
  type ArmDraft,
  type LauncherConfig,
} from "./config";
import { LiveRun } from "./live-run";
import { PreflightPanel, computePreflight } from "./preflight";
import { SettingsPanel } from "./settings-panel";
import { SuitePicker } from "./suite-picker";
import { useBenchRun } from "./use-bench-run";

export function BenchLauncher({
  providers,
  suites,
  tokenPriors,
}: {
  providers: ProviderStatus[];
  suites: SuiteInfo[];
  tokenPriors: Record<string, SuiteTokenPrior>;
}) {
  const toast = useToast();
  const providerMap = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const [stored, setStored] = useStoredState<LauncherConfig>(CONFIG_KEY, DEFAULT_CONFIG, isLauncherConfig);
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...stored }), [stored]);
  const patch = (p: Partial<LauncherConfig>) => setStored((s) => ({ ...DEFAULT_CONFIG, ...s, ...p }));

  const arms = useMemo<ArmDraft[]>(() => {
    const valid = (config.arms ?? []).filter((a) => providerMap[a.providerId]);
    return valid.length ? valid : defaultArms(providers);
  }, [config.arms, providerMap, providers]);
  const suiteIds = useMemo(() => resolveSuiteIds(config, suites), [config, suites]);
  const suiteNames = useMemo(() => Object.fromEntries(suites.map((s) => [s.id, s.name])), [suites]);

  const normalized = useNormalizedArms(arms);
  const uniqueArms = useMemo(() => [...normalized.values()], [normalized]);
  const duplicateCount = arms.length - new Set(arms.map(draftArmId)).size;
  const pre = useMemo(
    () => computePreflight(config, suiteIds, suites, uniqueArms, duplicateCount, providerMap, tokenPriors),
    [config, suiteIds, suites, uniqueArms, duplicateCount, providerMap, tokenPriors],
  );
  const presetId = activePreset(config, suites);

  const { state, start, stop, reset } = useBenchRun();
  const showLive = state.status !== "idle" && state.status !== "failed";

  const run = () => {
    if (pre.blocking) return;
    const body = toRunConfig(config, suites, arms);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void start(body);
  };

  const anyReal = providers.some((p) => p.configured && !p.simulated);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Benchmarks"
        icon={<IconFlask size={16} />}
        breadcrumbs={[{ label: "TejRouter", href: "/dashboard" }, { label: "Benchmarks" }]}
        description="Run graded suites across routers and pinned baselines. Every call is scored, timed and priced; repetitions and a fixed seed make it reproducible."
        actions={
          <>
            <ButtonLink href="/methodology" variant="ghost" size="sm" leftIcon={<IconBook size={13} />}>
              Methodology
            </ButtonLink>
            <ButtonLink href="/runs" variant="secondary" size="sm" leftIcon={<IconList size={13} />}>
              Past runs
            </ButtonLink>
          </>
        }
      />

      {state.status === "failed" ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
          <IconAlert size={16} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="font-medium text-fg">The run did not start</p>
            <p className="mt-0.5 text-xs break-words text-fg-muted">{state.startError}</p>
          </div>
        </div>
      ) : null}

      {showLive ? (
        <LiveRun
          state={state}
          providers={providerMap}
          suiteNames={suiteNames}
          onStop={() => {
            stop();
            toast({ title: "Stopping run", description: "In-flight calls finish; the partial run is saved.", tone: "info" });
          }}
          onReset={reset}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card as="section" aria-labelledby="suites-title">
              <CardHeader
                title={<span id="suites-title">1. Suites</span>}
                icon={<IconFlask size={14} />}
                description="Graded task sets. Difficulty histograms run easy (left) to hard (right)."
              />
              <div className="p-4">
                <SuitePicker
                  suites={suites}
                  selected={suiteIds}
                  onChange={(ids) => patch({ suiteIds: ids })}
                  maxTasksPerSuite={config.maxTasksPerSuite}
                  activePresetId={presetId}
                  onPreset={(p) => patch({ suiteIds: p.suiteIds, maxTasksPerSuite: p.maxTasksPerSuite, repetitions: p.repetitions })}
                />
              </div>
            </Card>

            <Card as="section" aria-labelledby="arms-title">
              <CardHeader
                title={<span id="arms-title">2. Arms</span>}
                icon={<IconCpu size={14} />}
                description={
                  anyReal
                    ? "A router at its auto/default model, or any provider pinned to a model. Defaults: every configured router."
                    : "No router keys are configured, so this defaults to the two offline simulators."
                }
                actions={
                  config.arms ? (
                    <button type="button" className="text-[11px] text-fg-subtle hover:text-fg" onClick={() => patch({ arms: null })}>
                      Reset
                    </button>
                  ) : null
                }
              />
              <div className="p-4">
                <ArmBuilder arms={arms} onChange={(next) => patch({ arms: next })} providers={providers} />
              </div>
            </Card>

            <Card as="section" aria-labelledby="settings-title">
              <CardHeader
                title={<span id="settings-title">3. Settings</span>}
                icon={<IconSliders size={14} />}
                description="Temperature 0 and a fixed seed give the most reproducible comparison."
              />
              <div className="p-4">
                <SettingsPanel config={config} onChange={patch} />
              </div>
            </Card>
          </div>

          <div id="preflight" className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start">
            <PreflightPanel pre={pre} onRun={run} starting={false} />
          </div>

          {/* Small screens: the pre-flight panel sits at the very bottom, so keep a compact run bar in reach. */}
          <div className="sticky bottom-3 z-20 lg:hidden">
            <div className="flex items-center gap-3 rounded-lg border border-border-strong bg-surface/95 px-3 py-2 shadow-lg backdrop-blur">
              <a href="#preflight" className="min-w-0 flex-1 text-[11px] leading-tight text-fg-muted">
                <span className="num block text-xs font-medium text-fg">
                  {formatNumber(pre.jobs)} jobs · ±{Number.isFinite(pre.mde) ? (pre.mde * 100).toFixed(1) : "—"} pp
                </span>
                {pre.warnings.length ? `${pre.warnings.length} pre-flight note${pre.warnings.length === 1 ? "" : "s"}` : "Pre-flight clear"}
              </a>
              <Button variant="accent" size="md" leftIcon={<IconPlay size={13} />} disabled={pre.blocking} onClick={run}>
                Run
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
