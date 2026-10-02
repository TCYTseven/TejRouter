import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/**
 * Stat tile: label (sentence case), value, optional sub line, optional delta and
 * an optional trend slot (e.g. a sparkline). Values use the mono numerals.
 */
export function StatTile({
  label,
  value,
  sub,
  delta,
  deltaTone = "neutral",
  icon,
  trend,
  className,
  emphasis,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  /** good/bad already resolved by the caller (direction x whether up is good). */
  deltaTone?: "good" | "bad" | "neutral";
  icon?: ReactNode;
  trend?: ReactNode;
  className?: string;
  /** Highlights the tile (e.g. the winning arm). */
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border bg-surface px-3 py-2.5",
        emphasis ? "border-accent-line shadow-glow" : "border-border",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="num truncate text-lg font-semibold tracking-tight text-fg">{value}</span>
        {delta ? (
          <span
            className={cn(
              "num text-[11px]",
              deltaTone === "good" && "text-success",
              deltaTone === "bad" && "text-danger",
              deltaTone === "neutral" && "text-fg-muted",
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      {sub ? <div className="truncate text-[11px] text-fg-muted">{sub}</div> : null}
      {trend ? <div className="mt-1">{trend}</div> : null}
    </div>
  );
}

/** Compact label/value row for dense metric lists (dl semantics). */
export function MetricRow({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1", className)}>
      <dt className="shrink-0 text-[11px] text-fg-subtle">{label}</dt>
      <dd className="num min-w-0 truncate text-right text-xs text-fg">
        {value}
        {hint ? <span className="ml-1.5 text-[10px] text-fg-subtle">{hint}</span> : null}
      </dd>
    </div>
  );
}
