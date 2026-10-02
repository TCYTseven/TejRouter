"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { ChartTooltip, useChartTooltip } from "./tooltip";
import { useElementWidth } from "./use-width";
import styles from "./viz.module.css";

export interface HeatCell {
  /** null renders an em dash on a neutral cell (explain why in `tip`). */
  value: number | null;
  /** Printed value (keep it short: "84%", "+3.1"). */
  display: string;
  /** Fill color (see colors.ts sequentialFill/divergingFill). */
  fill?: string;
  /** Ink chosen to clear contrast on `fill`. */
  ink?: string;
  /** Small marker after the value, e.g. "*" for significance. */
  marker?: string;
  tip?: ReactNode;
  ariaLabel?: string;
  /** Diagonal / not applicable: rendered blank and not focusable. */
  blank?: boolean;
}

export interface HeatAxisItem {
  key: string;
  label: ReactNode;
  /** Plain-text label for screen readers and tooltips. */
  text: string;
  sub?: ReactNode;
}

/**
 * Heatmap as a real <table>: values printed in every cell (the table is its own
 * accessible twin), 2px surface gaps between cells, per-cell hover/focus
 * tooltips, optional click-to-select. Scrolls inside its own container when narrow.
 */
export function HeatmapTable({
  caption,
  rowHeader,
  rows,
  cols,
  cell,
  onSelect,
  selected,
  cellMinWidth = 64,
  legend,
  rowHeaderWidth = 180,
}: {
  caption: string;
  rowHeader: string;
  rows: HeatAxisItem[];
  cols: HeatAxisItem[];
  cell: (rowKey: string, colKey: string) => HeatCell;
  onSelect?: (rowKey: string, colKey: string) => void;
  selected?: { row: string; col: string } | null;
  cellMinWidth?: number;
  legend?: ReactNode;
  rowHeaderWidth?: number;
}) {
  const { containerRef, tip, bind } = useChartTooltip();
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 520;
  const rhw = narrow ? Math.min(120, rowHeaderWidth) : rowHeaderWidth;
  return (
    <div ref={measureRef} className={cn(styles.viz, "w-full")}>
      <div ref={containerRef} className="relative">
        <div className="overflow-x-auto pb-1">
          <table className="border-separate text-xs" style={{ borderSpacing: 2, minWidth: rhw + cols.length * (narrow ? Math.min(cellMinWidth, 56) : cellMinWidth) }}>
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className="px-2 pb-1.5 text-left align-bottom text-[11px] font-medium text-fg-subtle" style={{ width: rhw, minWidth: rhw }}>
                  {rowHeader}
                </th>
                {cols.map((c) => (
                  <th key={c.key} scope="col" title={c.text} className="px-1 pb-1.5 text-center align-bottom text-[11px] leading-tight font-medium text-fg-muted">
                    <span className="mx-auto line-clamp-3 block max-w-[9rem] break-words">{c.label}</span>
                    {c.sub ? <span className="mt-0.5 block text-[10px] font-normal text-fg-subtle">{c.sub}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="px-2 py-0 text-left text-[11.5px] font-normal text-fg" style={{ width: rhw, maxWidth: rhw }}>
                    <span className="block truncate" title={r.text}>
                      {r.label}
                    </span>
                    {r.sub ? <span className="block truncate text-[10px] text-fg-subtle">{r.sub}</span> : null}
                  </th>
                  {cols.map((c) => {
                    const v = cell(r.key, c.key);
                    if (v.blank) return <td key={c.key} aria-hidden="true" className="rounded-[4px] bg-surface-2/40" />;
                    const isSel = selected?.row === r.key && selected?.col === c.key;
                    const content = (
                      <span className="num inline-flex items-baseline gap-0.5 text-[11.5px] font-medium">
                        {v.display}
                        {v.marker ? <span className="text-[10px]">{v.marker}</span> : null}
                      </span>
                    );
                    const label = v.ariaLabel ?? `${r.text}, ${c.text}: ${v.display}${v.marker ? ` ${v.marker}` : ""}`;
                    const style = {
                      background: v.value == null ? "var(--surface-2)" : v.fill,
                      color: v.value == null ? "var(--fg-subtle)" : v.ink ?? "var(--fg)",
                    };
                    return (
                      <td key={c.key} className="p-0">
                        {onSelect ? (
                          <button
                            type="button"
                            aria-label={label}
                            aria-pressed={isSel}
                            onClick={() => onSelect(r.key, c.key)}
                            className={cn(
                              "flex h-8 w-full items-center justify-center rounded-[4px] px-1.5 transition-[box-shadow,filter] hover:brightness-110",
                              isSel && "shadow-[0_0_0_2px_var(--viz-surface),0_0_0_4px_var(--fg)]",
                            )}
                            style={style}
                            {...bind(v.tip ?? null)}
                          >
                            {content}
                          </button>
                        ) : (
                          <div
                            tabIndex={0}
                            role="img"
                            aria-label={label}
                            className="flex h-8 items-center justify-center rounded-[4px] px-1.5 outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--viz-surface),0_0_0_4px_var(--ring)]"
                            style={style}
                            {...bind(v.tip ?? null)}
                          >
                            {content}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>
      {legend ? <div className="mt-2">{legend}</div> : null}
    </div>
  );
}

/** Continuous color-scale legend (gradient bar with end labels). */
export function ScaleLegend({
  stops,
  left,
  right,
  middle,
  label,
}: {
  /** CSS colors from low to high. */
  stops: string[];
  left: string;
  right: string;
  middle?: string;
  label?: string;
}) {
  return (
    <div className={cn(styles.viz, "flex flex-wrap items-center gap-2 text-[11px] text-fg-muted")}>
      {label ? <span>{label}</span> : null}
      <span className="num text-fg-subtle">{left}</span>
      <span className="relative inline-block h-2 w-32 rounded-full" style={{ background: `linear-gradient(to right, ${stops.join(",")})` }} aria-hidden="true">
        {middle ? <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-fg-subtle" /> : null}
      </span>
      <span className="num text-fg-subtle">{right}</span>
      {middle ? <span className="text-fg-subtle">(midpoint {middle})</span> : null}
    </div>
  );
}
