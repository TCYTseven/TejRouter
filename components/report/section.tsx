"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { IconBook } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import type { RunReport } from "@/lib/analysis/types";
import type { BenchRun } from "@/lib/bench/types";
import { cn } from "@/lib/client/cn";
import { methodologyHref } from "@/lib/client/slug";
import { armOf, type ArmInfo, type ArmMap } from "./arms";
import { DASH } from "./format";

/** Methodology headings (docs/METHODOLOGY.md) each section links to. */
export const METHOD = {
  principles: "1. Principles",
  arms: "2.4 Router arms and fixed baselines",
  descriptive: "3. Descriptive statistics",
  accuracy: "4. Accuracy",
  wilson: "5.1 Wilson score interval (default)",
  bootstrap: "6. The bootstrap",
  errorRate: "7. Error rate",
  latency: "8. Latency, time to first token, throughput",
  cost: "9. Cost",
  byCategory: "12. Accuracy by category and by difficulty",
  difficulty: "13. Difficulty curves (logistic regression)",
  routing: "14. Routing behaviour",
  entropy: "14.2 Entropy of the model choice",
  mi: "14.3 Mutual information between task and model",
  jsd: "14.4 Easy-vs-hard divergence",
  escalation: "14.5 Escalation curve and adaptivity coefficient",
  oracle: "15. Routing quality: oracle and regret",
  pairwise: "16. Pairwise comparisons",
  mcnemar: "17.5 Sign test, binomial test, McNemar",
  effect: "18. Effect sizes",
  multiple: "19. Multiple comparisons",
  ratings: "20. Ratings: Bradley-Terry and Elo",
  frontier: "22. Cost-quality frontier and AIQ",
  tejscore: "23. TejScore",
  power: "24. Power analysis",
  consistency: "25. Consistency and reliability",
  limitations: "28. Assumptions and limitations",
} as const;

export interface ReportCtx {
  report: RunReport;
  run: BenchRun;
  arms: ArmMap;
  arm: (id: string) => ArmInfo;
  level: number;
}

const Ctx = createContext<ReportCtx | null>(null);

export function ReportProvider({ value, children }: { value: ReportCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReportCtx(): ReportCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReportCtx outside ReportProvider");
  return v;
}

export function makeCtx(report: RunReport, run: BenchRun, arms: ArmMap): ReportCtx {
  return { report, run, arms, arm: (id) => armOf(arms, id), level: report.options.level };
}

/** "How is this computed?" link to a methodology section. */
export function MethodLink({ heading, children = "How is this computed?", className }: { heading: string; children?: ReactNode; className?: string }) {
  return (
    <Link
      href={methodologyHref(heading)}
      className={cn("inline-flex items-center gap-1 rounded text-[11px] text-fg-subtle underline-offset-2 hover:text-fg hover:underline", className)}
    >
      <IconBook size={12} />
      {children}
    </Link>
  );
}

/** One report section: titled card, computed one-sentence takeaway, actions, body. */
export function ReportSection({
  id,
  index,
  title,
  takeaway,
  method,
  actions,
  children,
  className,
  footer,
}: {
  id: string;
  index?: number;
  title: string;
  takeaway?: ReactNode;
  method?: string | string[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  const methods = method == null ? [] : Array.isArray(method) ? method : [method];
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-20 rounded-lg border border-border bg-surface shadow-sm", className)}>
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="flex items-baseline gap-2 text-[15px] font-semibold tracking-tight text-fg">
            {index != null ? <span className="num text-[11px] font-normal text-fg-subtle">{String(index).padStart(2, "0")}</span> : null}
            {title}
          </h2>
          {takeaway ? <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-fg-muted">{takeaway}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="p-4">{children}</div>
      {methods.length || footer ? (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2">
          {footer}
          {methods.map((m, i) => (
            <MethodLink key={m} heading={m}>
              {i === 0 ? "How is this computed?" : m.replace(/^[\d.]+\s*/, "")}
            </MethodLink>
          ))}
        </footer>
      ) : null}
    </section>
  );
}

/** Chart / Table switch used by section headers. */
export function ViewToggle<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return <Segmented size="xs" label={label} value={value} onChange={onChange} options={options} />;
}

/** Missing statistic: an em dash with a tooltip that says why. */
export function NA({ reason, className }: { reason: string; className?: string }) {
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className={cn("num cursor-help text-fg-subtle underline decoration-dotted underline-offset-2 outline-none", className)} aria-label={`Not available: ${reason}`}>
        {DASH}
      </span>
    </Tooltip>
  );
}

/** Format a value, or render <NA> with a reason when it is null. */
export function Val({ v, fmt, reason, className }: { v: number | null | undefined; fmt: (v: number) => string; reason: string; className?: string }) {
  if (v == null || !Number.isFinite(v)) return <NA reason={reason} className={className} />;
  return <span className={cn("num", className)}>{fmt(v)}</span>;
}

/** Arm identity chip: provider dot (ring = simulator) + label. */
export function ArmLabel({ arm, className, showKind, truncate = true }: { arm: ArmInfo; className?: string; showKind?: boolean; truncate?: boolean }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <ProviderDot color={arm.color} simulated={arm.simulated} />
      <span className={cn(truncate && "truncate")} title={arm.label}>
        {arm.label}
      </span>
      {showKind ? <KindBadge arm={arm} /> : null}
    </span>
  );
}

export function KindBadge({ arm }: { arm: ArmInfo }) {
  return (
    <Tooltip content={arm.kindReason || (arm.kind === "router" ? "The router picks the model" : "Pinned to one model")}>
      <span
        tabIndex={0}
        className={cn(
          "inline-flex h-[18px] items-center rounded border px-1.5 text-[10px] font-medium whitespace-nowrap outline-none",
          arm.kind === "router" ? "border-accent-line bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted",
        )}
      >
        {arm.kind === "router" ? "router" : "fixed baseline"}
      </span>
    </Tooltip>
  );
}
