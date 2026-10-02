import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import styles from "./viz.module.css";

export interface LegendItem {
  key: string;
  label: ReactNode;
  color: string;
  /** Mirror the mark: line for lines, rect for bars/areas, dot for points, ring for hollow points. */
  shape?: "line" | "rect" | "dot" | "ring" | "band";
  dimmed?: boolean;
}

/** Swatch that mirrors the chart mark. */
export function Swatch({ color, shape = "rect", className }: { color: string; shape?: LegendItem["shape"]; className?: string }) {
  if (shape === "line")
    return <span aria-hidden="true" className={cn("inline-block h-[2px] w-3.5 shrink-0 rounded-full", className)} style={{ background: color }} />;
  if (shape === "dot")
    return <span aria-hidden="true" className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
  if (shape === "ring")
    return <span aria-hidden="true" className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }} />;
  if (shape === "band")
    return (
      <span aria-hidden="true" className={cn("relative inline-block h-2.5 w-3.5 shrink-0 rounded-[2px]", className)} style={{ background: `color-mix(in oklab, ${color} 22%, transparent)` }}>
        <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full" style={{ background: color }} />
      </span>
    );
  return <span aria-hidden="true" className={cn("inline-block h-2 w-2 shrink-0 rounded-[2px]", className)} style={{ background: color }} />;
}

/**
 * Horizontal, wrapping legend. Text is ink (never the series color); the swatch
 * carries identity. Optional hover/focus callbacks let a chart emphasize a series.
 */
export function Legend({
  items,
  className,
  onHover,
  label = "Legend",
}: {
  items: LegendItem[];
  className?: string;
  onHover?: (key: string | null) => void;
  label?: string;
}) {
  return (
    <ul aria-label={label} className={cn(styles.viz, "flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-fg-muted", className)}>
      {items.map((it) => (
        <li
          key={it.key}
          className={cn("inline-flex min-w-0 items-center gap-1.5", it.dimmed && "opacity-45")}
          onPointerEnter={onHover ? () => onHover(it.key) : undefined}
          onPointerLeave={onHover ? () => onHover(null) : undefined}
        >
          <Swatch color={it.color} shape={it.shape} />
          <span className="truncate">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
