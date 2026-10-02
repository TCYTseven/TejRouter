"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { ProviderDot } from "@/components/ui/provider";
import type { RunReport } from "@/lib/analysis/types";
import type { BenchRun } from "@/lib/bench/types";
import { cn } from "@/lib/client/cn";
import { methodologyHref } from "@/lib/client/slug";
import { armOf, type ArmInfo, type ArmMap } from "./arms";
import { DASH } from "./format";

/** Methodology headings (docs/METHODOLOGY.md) the report links to. */
export const METHOD = {
  accuracy: "4. Accuracy",
  bootstrap: "6. The bootstrap",
  latency: "8. Latency, time to first token, throughput",
  cost: "9. Cost",
  byCategory: "12. Accuracy by category and by difficulty",
  difficulty: "13. Difficulty curves (logistic regression)",
  routing: "14. Routing behaviour",
  escalation: "14.5 Escalation curve and adaptivity coefficient",
  oracle: "15. Routing quality: oracle and regret",
  pairwise: "16. Pairwise comparisons",
  multiple: "19. Multiple comparisons",
  ratings: "20. Ratings: Bradley-Terry and Elo",
  frontier: "22. Cost-quality frontier and AIQ",
  tejscore: "23. TejScore",
  power: "24. Power analysis",
  consistency: "25. Consistency and reliability",
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
    <Link href={methodologyHref(heading)} className={cn("link text-[13px]", className)}>
      {children}
    </Link>
  );
}

/**
 * One block of the report: a card with a short title, a one-sentence takeaway
 * written from the data, optional controls, the evidence, and an optional
 * methodology link.
 */
export function Panel({
  id,
  title,
  takeaway,
  actions,
  method,
  children,
  className,
}: {
  id?: string;
  title: string;
  takeaway?: ReactNode;
  actions?: ReactNode;
  method?: string;
  children: ReactNode;
  className?: string;
}) {
  const hid = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={hid} aria-label={hid ? undefined : title} className={cn("min-w-0 rounded-xl border border-border bg-surface p-6 max-sm:p-5", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={hid} className="text-[15px] font-semibold text-fg">
            {title}
          </h2>
          {takeaway ? <p className="mt-1 max-w-3xl text-[15px] text-fg-muted">{takeaway}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
      {method ? (
        <div className="mt-4">
          <MethodLink heading={method} />
        </div>
      ) : null}
    </section>
  );
}

/** Missing statistic: a dash with a tooltip that says why. */
export function NA({ reason, className }: { reason: string; className?: string }) {
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className={cn("num cursor-help text-fg-muted underline decoration-dotted underline-offset-2 outline-none", className)} aria-label={`Not available: ${reason}`}>
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

/** Router identity: color swatch (ring = simulator) + name. */
export function ArmLabel({ arm, className, truncate = true }: { arm: ArmInfo; className?: string; truncate?: boolean }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <ProviderDot color={arm.color} simulated={arm.simulated} />
      <span className={cn(truncate && "truncate")} title={arm.label}>
        {arm.label}
      </span>
    </span>
  );
}

/** Dotted-underline term with a plain-language explanation on hover/focus. */
export function Term({ children, tip, align }: { children: ReactNode; tip: ReactNode; align?: "center" | "start" | "end" }) {
  return (
    <Tooltip content={tip} align={align}>
      <span tabIndex={0} className="cursor-help underline decoration-fg-subtle decoration-dotted underline-offset-4 outline-none">
        {children}
      </span>
    </Tooltip>
  );
}
