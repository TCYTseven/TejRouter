"use client";

import { useMemo } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconAlert, IconFlask } from "@/components/ui/icons";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { vizStyles } from "@/components/charts";
import { cn } from "@/lib/client/cn";
import { AccuracySection } from "./accuracy-section";
import { buildArms } from "./arms";
import { CategorySection } from "./category-section";
import { CostQualitySection } from "./cost-quality-section";
import { LatencySection } from "./latency-section";
import { OracleSection } from "./oracle-section";
import { PairwiseSection } from "./pairwise-section";
import { PowerSection } from "./power-section";
import { RatingsSection } from "./ratings-section";
import { ReportHeader } from "./report-header";
import { RoutingSection } from "./routing-section";
import { SamplesSection } from "./samples-section";
import { makeCtx, ReportProvider } from "./section";
import { TejScoreSection } from "./tejscore-section";
import { useRunReport } from "./use-run-report";
import { VerdictStrip } from "./verdict-strip";

const NAV = [
  { id: "tejscore", label: "TejScore" },
  { id: "accuracy", label: "Accuracy" },
  { id: "cost-quality", label: "Cost vs quality" },
  { id: "latency", label: "Latency" },
  { id: "categories", label: "Categories" },
  { id: "routing", label: "Routing" },
  { id: "oracle", label: "vs Oracle" },
  { id: "pairwise", label: "Pairwise" },
  { id: "ratings", label: "Ratings" },
  { id: "power", label: "Power" },
  { id: "samples", label: "Samples" },
];

/** Client root of /runs/[id]: loads the run, analyzes it off the main thread and renders every section. */
export function RunReportView({ id, name }: { id: string; name: string }) {
  const { state, settings, reanalyze } = useRunReport(id);

  if (state.status === "not-found") {
    return (
      <EmptyState
        icon={<IconFlask size={18} />}
        title="Run not found"
        description={`No stored run has the id "${id}". It may have been deleted.`}
        action={
          <ButtonLink href="/runs" size="sm">
            All runs
          </ButtonLink>
        }
      />
    );
  }
  if (state.status === "error") {
    return (
      <EmptyState
        icon={<IconAlert size={18} />}
        title="Could not build the report"
        description={state.message}
        action={
          <ButtonLink href="/runs" size="sm">
            All runs
          </ButtonLink>
        }
      />
    );
  }
  if (state.status !== "ready") return <ReportSkeleton name={name} stage={state.status === "loading" ? "Loading run…" : "Running statistics…"} />;
  return <Ready state={state} settings={settings} reanalyze={reanalyze} />;
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
  return (
    <ReportProvider value={ctx}>
      <div className={cn(vizStyles.viz, "flex flex-col gap-5")}>
        <div className="overflow-x-clip">
          <ReportHeader result={result} settings={settings} analyzing={analyzing} onReanalyze={reanalyze} />
        </div>
        <nav aria-label="Report sections" className="sticky top-14 z-20 -mx-4 border-y border-border bg-bg/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
          <ol className="flex gap-1 overflow-x-auto py-1.5 text-[12px]">
            {NAV.map((n, i) => (
              <li key={n.id} className="shrink-0">
                <a href={`#${n.id}`} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-fg-muted hover:bg-surface-2 hover:text-fg">
                  <span className="num text-[10px] text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
                  {n.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className={cn("flex flex-col gap-5 overflow-x-clip transition-opacity duration-200", analyzing && "pointer-events-none opacity-55")} aria-busy={analyzing || undefined}>
          <VerdictStrip />
          <TejScoreSection index={1} />
          <AccuracySection index={2} />
          <CostQualitySection index={3} />
          <LatencySection index={4} />
          <CategorySection index={5} />
          <RoutingSection index={6} />
          <OracleSection index={7} />
          <PairwiseSection index={8} />
          <RatingsSection index={9} />
          <PowerSection index={10} />
          <SamplesSection index={11} />
        </div>
      </div>
    </ReportProvider>
  );
}

function ReportSkeleton({ name, stage }: { name: string; stage: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5 animate-fade-in">
      <div className="flex flex-col gap-3 pb-2">
        <Skeleton className="h-3 w-40" />
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{name}</h1>
        <p className="text-sm text-fg-muted">{stage}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <SkeletonText lines={4} />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-lg border border-border bg-surface p-4">
          <Skeleton className="mb-3 h-4 w-48" />
          <Skeleton className="h-56 w-full" />
        </div>
      ))}
      <span className="sr-only">{stage}</span>
    </div>
  );
}
