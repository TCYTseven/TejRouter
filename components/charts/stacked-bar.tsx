"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { ChartTooltip, useChartTooltip } from "./tooltip";
import { useElementWidth } from "./use-width";
import styles from "./viz.module.css";

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Ink for the inline label on this fill (default white). */
  ink?: string;
  opacity?: number;
  tip?: ReactNode;
}

type Bind = ReturnType<typeof useChartTooltip>["bind"];

/**
 * One horizontal stacked bar (segments in order, 2px surface gaps, 4px rounded
 * data end, square at the baseline). Segment widths are value/total, so pass
 * `total` to draw a partial bar (e.g. a score out of 100). Inline labels appear
 * only when they fit. Use inside <StackedBarRows> or alone.
 */
export function StackedBar({
  segments,
  total,
  height = 14,
  ariaLabel,
  bind,
  labelFormat,
  className,
}: {
  segments: Segment[];
  total?: number;
  height?: number;
  ariaLabel: string;
  bind?: Bind;
  /** Inline label text for a segment (shown only if it fits). */
  labelFormat?: (s: Segment, share: number) => string;
  className?: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const sum = total ?? segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div ref={ref} role="img" aria-label={ariaLabel} className={cn("flex w-full items-stretch gap-[2px]", className)} style={{ height }}>
      {visible.map((s, i) => {
        const share = sum > 0 ? s.value / sum : 0;
        const px = share * width;
        const text = labelFormat?.(s, share) ?? "";
        const fits = text && px >= text.length * 7.4 + 12 && height >= 18;
        const last = i === visible.length - 1;
        return (
          <div
            key={s.key}
            tabIndex={bind ? 0 : undefined}
            aria-label={bind ? `${s.label}: ${text || (share * 100).toFixed(1) + "%"}` : undefined}
            className={cn(
              "flex min-w-[2px] items-center justify-center overflow-hidden outline-none transition-[filter] hover:brightness-110 focus-visible:brightness-125",
              last ? "rounded-r-[4px]" : "",
            )}
            style={{ flex: `0 0 calc(${(share * 100).toFixed(4)}% - ${i < visible.length - 1 ? 2 : 0}px)`, background: s.color, opacity: s.opacity ?? 1 }}
            {...(bind ? bind(s.tip ?? null) : {})}
          >
            {fits ? (
              <span className="num px-1 text-[13px] font-medium whitespace-nowrap" style={{ color: s.ink ?? "#fff" }}>
                {text}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export interface StackedRow {
  key: string;
  label: ReactNode;
  /** Plain-text label for accessibility. */
  text: string;
  sub?: ReactNode;
  segments: Segment[];
  total?: number;
  /** Right-hand text (e.g. n or the total value). */
  trailing?: ReactNode;
}

/** Rows of labelled stacked bars sharing one tooltip; label column stacks above the bar when narrow. */
export function StackedBarRows({
  rows,
  height = 14,
  labelWidth = 150,
  labelFormat,
  ariaLabel,
  className,
}: {
  rows: StackedRow[];
  height?: number;
  labelWidth?: number;
  labelFormat?: (s: Segment, share: number) => string;
  ariaLabel: string;
  className?: string;
}) {
  const { containerRef, tip, bind } = useChartTooltip();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 480;
  return (
    <div ref={ref} className={cn(styles.viz, "w-full", className)}>
      <div ref={containerRef} className="relative">
        <ul aria-label={ariaLabel} className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className={cn("grid items-center gap-x-3", narrow ? "grid-cols-[1fr_auto] gap-y-1" : "")} style={narrow ? undefined : { gridTemplateColumns: `${labelWidth}px 1fr auto` }}>
              <div className="min-w-0 text-[13px] text-fg">
                <span className="block truncate" title={r.text}>
                  {r.label}
                </span>
                {r.sub ? <span className="block truncate text-[13px] text-fg-muted">{r.sub}</span> : null}
              </div>
              {narrow ? <div className="num text-right text-[13px] text-fg-muted">{r.trailing}</div> : null}
              <div className={cn(narrow && "col-span-2")}>
                <StackedBar segments={r.segments} total={r.total} height={height} ariaLabel={`${r.text}: ${r.segments.map((s) => `${s.label} ${s.value.toFixed(2)}`).join(", ")}`} bind={bind} labelFormat={labelFormat} />
              </div>
              {!narrow ? <div className="num min-w-10 text-right text-[13px] text-fg-muted">{r.trailing}</div> : null}
            </li>
          ))}
        </ul>
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>
    </div>
  );
}
