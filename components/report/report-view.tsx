"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { vizStyles } from "@/components/charts";
import { cn } from "@/lib/client/cn";
import { buildArms } from "./arms";
import { OverviewTab } from "./overview-tab";
import { ReportHeader } from "./report-header";
import { RoutingTab } from "./routing-tab";
import { SamplesTab } from "./samples-tab";
import { makeCtx, ReportProvider } from "./section";
import { StatisticsTab } from "./statistics-tab";
import { TaskTypeTab } from "./task-type-tab";
import { useRunReport } from "./use-run-report";
import { Verdict } from "./verdict";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "routing", label: "Routing" },
  { value: "task-types", label: "By task type" },
  { value: "answers", label: "Every answer" },
  { value: "statistics", label: "Statistics" },
] as const;
type Tab = (typeof TABS)[number]["value"];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.value === v);

/** Client root of /runs/[id]: loads the run, analyzes it off the main thread, then answers "which router?" first. */
export function RunReportView({ id, name }: { id: string; name: string }) {
  const { state, settings, reanalyze } = useRunReport(id);

  if (state.status === "not-found") {
    return (
      <EmptyState
        title="Run not found"
        description="This run may have been deleted."
        action={
          <ButtonLink href="/runs" size="sm" variant="primary">
            All results
          </ButtonLink>
        }
      />
    );
  }
  if (state.status === "error") {
    return (
      <EmptyState
        title="Could not build the report"
        description={`${state.message} Reload the page to try again.`}
        action={
          <ButtonLink href="/runs" size="sm" variant="primary">
            All results
          </ButtonLink>
        }
      />
    );
  }
  if (state.status !== "ready") return <ReportSkeleton name={name} stage={state.status === "loading" ? "Loading the run" : "Working out the statistics"} />;
  return <Ready state={state} settings={settings} reanalyze={reanalyze} />;
}

function useTabParam(): [Tab, (t: Tab) => void] {
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = isTab(raw) ? raw : "overview";
  const setTab = useCallback(
    (t: Tab) => {
      const next = new URLSearchParams(params.toString());
      if (t === "overview") next.delete("tab");
      else next.set("tab", t);
      const qs = next.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    },
    [params],
  );
  return [tab, setTab];
}

function Ready({
  state,
  settings,
  reanalyze,
}: {
  state: Extract<ReturnType<typeof useRunReport>["state"], { status: "ready" }>;
  settings: ReturnType<typeof useRunReport>["settings"];
  reanalyze: ReturnType<typeof useRunReport>["reanalyze"];
}) {
  const { run, result, analyzing } = state;
  const report = result.report;
  const ctx = useMemo(() => makeCtx(report, run, buildArms(report)), [report, run]);
  const [tab, setTab] = useTabParam();
  const idBase = "report";
  return (
    <ReportProvider value={ctx}>
      <div className={cn(vizStyles.viz, "flex flex-col gap-8")}>
        <ReportHeader />
        <div className={cn("flex flex-col gap-8 transition-opacity duration-200", analyzing && "pointer-events-none opacity-60")} aria-busy={analyzing || undefined}>
          <Verdict />
          <div>
            <Tabs idBase={idBase} label="Report views" items={TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={setTab} className="mb-6" />
            {TABS.map((t) => (
              <TabPanel key={t.value} idBase={idBase} value={t.value} active={tab === t.value}>
                {t.value === "overview" ? <OverviewTab /> : null}
                {t.value === "routing" ? <RoutingTab /> : null}
                {t.value === "task-types" ? <TaskTypeTab /> : null}
                {t.value === "answers" ? <SamplesTab /> : null}
                {t.value === "statistics" ? <StatisticsTab result={result} settings={settings} analyzing={analyzing} onReanalyze={reanalyze} /> : null}
              </TabPanel>
            ))}
          </div>
        </div>
      </div>
    </ReportProvider>
  );
}

export function ReportSkeleton({ name, stage }: { name: string; stage: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8 animate-fade-in">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-20" />
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-fg">{name}</h1>
        <p className="text-[15px] text-fg-muted">{stage}…</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6">
        <SkeletonText lines={2} />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-lg" />
      <div className="rounded-xl border border-border bg-surface p-6">
        <Skeleton className="mb-4 h-5 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
