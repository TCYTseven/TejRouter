"use client";

import { useId, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { AxisBottom, GridX } from "./axis";
import { Dot, textWidth } from "./marks";
import { extent, linearScale, niceDomain } from "./scale";
import { ChartTooltip, useChartTooltip } from "./tooltip";
import { useElementWidth } from "./use-width";
import styles from "./viz.module.css";

export interface IntervalRow {
  key: string;
  label: string;
  /** Series color (CSS). */
  color: string;
  /** Hollow ring swatch instead of a filled square (e.g. simulators). */
  hollowSwatch?: boolean;
  value: number | null;
  lo: number | null;
  hi: number | null;
  /** Secondary estimate drawn as a thinner interval with a hollow marker under the main one. */
  secondary?: { value: number | null; lo: number | null; hi: number | null } | null;
  /** Extra point marker (hollow diamond), e.g. a comparison estimate. */
  marker?: number | null;
  /** Right-hand text (value and interval). */
  valueText: string;
  /** Second line of right-hand text. */
  subText?: string;
  dimmed?: boolean;
  /** Tooltip content for the row (hover/focus). */
  tip?: ReactNode;
}

/**
 * Forest plot: one row per item with a point estimate and interval on a shared
 * x axis, labels on the left and the numbers on the right (wide) or above the
 * plot line (narrow). Rows are focusable and carry a tooltip.
 */
export function IntervalPlot({
  rows,
  domain: domainProp,
  format,
  axisLabel,
  reference,
  ariaLabel,
  description,
  secondaryLabel,
  markerLabel,
}: {
  rows: IntervalRow[];
  domain?: [number, number];
  format: (v: number) => string;
  axisLabel?: string;
  /** Vertical reference line (e.g. 0 or 1000). */
  reference?: { value: number; label?: string };
  ariaLabel: string;
  description?: string;
  secondaryLabel?: string;
  markerLabel?: string;
}) {
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const { containerRef, tip, bind } = useChartTooltip();
  const uid = useId().replace(/:/g, "");

  const domain = useMemo<[number, number]>(() => {
    if (domainProp) return domainProp;
    const ext = extent(
      rows.flatMap((r) => [r.lo, r.hi, r.value, r.secondary?.lo, r.secondary?.hi, r.marker, reference?.value ?? null]),
    );
    if (!ext) return [0, 1];
    return niceDomain(ext[0], ext[1], 5);
  }, [domainProp, rows, reference]);

  const wide = width >= 620;
  const hasSecondary = rows.some((r) => r.secondary && r.secondary.value != null);
  const hasSub = rows.some((r) => r.subText);
  const labelCap = Math.min(300, Math.max(150, width * 0.24));
  const labelW = wide ? Math.min(labelCap, Math.max(120, Math.max(...rows.map((r) => textWidth(r.label, 13))) + 30)) : 0;
  const valueW = wide
    ? Math.min(220, Math.max(110, Math.max(0, ...rows.map((r) => textWidth(r.valueText, 13)), ...rows.map((r) => textWidth(r.subText ?? "", 13))) + 18))
    : 0;
  const padL = wide ? labelW + 8 : 8;
  const padR = wide ? valueW + 8 : 12;
  const plotW = Math.max(40, width - padL - padR);
  const rowH = wide ? (hasSecondary || hasSub ? 44 : 34) : hasSecondary ? 62 : 52;
  const top = 6;
  const axisH = axisLabel ? 46 : 28;
  const height = top + rows.length * rowH + axisH;
  const x = linearScale(domain, [0, plotW]);
  const ticks = x.ticks(Math.max(2, Math.min(6, Math.floor(plotW / 90))));
  const cx = (v: number) => x(Math.min(domain[1], Math.max(domain[0], v)));

  return (
    <div ref={measureRef} className={cn(styles.viz, "w-full")}>
      <div ref={containerRef} className="relative" style={{ height: width ? height : 120 }}>
        {width > 0 ? (
          <svg width={width} height={height} role="group" aria-labelledby={`${uid}-t`} aria-describedby={description ? `${uid}-d` : undefined} className="block overflow-visible">
            <title id={`${uid}-t`}>{ariaLabel}</title>
            {description ? <desc id={`${uid}-d`}>{description}</desc> : null}
            <g transform={`translate(${padL},${top})`}>
              <GridX scale={x} ticks={ticks} height={rows.length * rowH} />
              {reference ? (
                <line x1={x(reference.value)} x2={x(reference.value)} y1={-2} y2={rows.length * rowH} stroke="var(--viz-axis)" strokeWidth={1} />
              ) : null}
              <AxisBottom scale={x} ticks={ticks} y={rows.length * rowH} format={format} label={axisLabel} width={plotW} />
            </g>
            {rows.map((r, i) => {
              const y0 = top + i * rowH;
              const lineY = wide ? y0 + (hasSecondary ? 16 : rowH / 2) : y0 + 34;
              const ok = r.value != null;
              const hasCI = r.lo != null && r.hi != null;
              const sec = r.secondary;
              const op = r.dimmed ? 0.45 : 1;
              return (
                <g
                  key={r.key}
                  tabIndex={0}
                  role="img"
                  aria-label={`${r.label}: ${r.valueText}${r.subText ? `, ${r.subText}` : ""}`}
                  className="outline-none focus-visible:[&>rect.hl]:opacity-100 hover:[&>rect.hl]:opacity-100"
                  {...bind(r.tip ?? null)}
                >
                  <rect className="hl" x={0} y={y0} width={width} height={rowH} rx={4} fill="var(--surface-2)" opacity={0} />
                  {/* label */}
                  {wide ? (
                    <g opacity={op}>
                      <Swatch x={10} y={lineY} color={r.color} hollow={r.hollowSwatch} />
                      <text x={24} y={lineY} dy="0.32em" fontSize={13} fill="var(--viz-ink)">
                        {truncateTo(r.label, labelW - 30, 13)}
                      </text>
                    </g>
                  ) : (
                    <g opacity={op}>
                      <Swatch x={12} y={y0 + 10} color={r.color} hollow={r.hollowSwatch} />
                      <text x={24} y={y0 + 12} dy="0.32em" fontSize={13} fill="var(--viz-ink)" {...HALO}>
                        {truncateTo(r.label, width - 24 - textWidth(r.valueText, 13) - 16, 13)}
                      </text>
                      <text x={width - 6} y={y0 + 12} dy="0.32em" fontSize={13} textAnchor="end" fill="var(--viz-ink)" className="num" {...HALO}>
                        {r.subText && textWidth(r.label, 13) + textWidth(`${r.valueText} · ${r.subText}`, 13) + 48 < width ? (
                          <>
                            {r.valueText}
                            <tspan fill="var(--viz-muted)" fontSize={13}>{` · ${r.subText}`}</tspan>
                          </>
                        ) : (
                          r.valueText
                        )}
                      </text>
                    </g>
                  )}
                  {/* marks */}
                  <g transform={`translate(${padL},0)`} opacity={op}>
                    {hasCI ? (
                      <line x1={cx(r.lo!)} x2={cx(r.hi!)} y1={lineY} y2={lineY} stroke={r.color} strokeWidth={2.5} strokeLinecap="round" />
                    ) : null}
                    {sec && sec.value != null ? (
                      <>
                        {sec.lo != null && sec.hi != null ? (
                          <line x1={cx(sec.lo)} x2={cx(sec.hi)} y1={lineY + 9} y2={lineY + 9} stroke={r.color} strokeOpacity={0.55} strokeWidth={1.25} strokeLinecap="round" />
                        ) : null}
                        <circle cx={cx(sec.value)} cy={lineY + 9} r={2.75} fill="var(--viz-surface)" stroke={r.color} strokeWidth={1.5} />
                      </>
                    ) : null}
                    {r.marker != null ? <Dot cx={cx(r.marker)} cy={lineY} r={3.5} color={r.color} hollow shape="diamond" hitRadius={0} aria-hidden="true" /> : null}
                    {ok ? <Dot cx={cx(r.value!)} cy={lineY} r={5} color={r.color} hitRadius={0} aria-hidden="true" /> : (
                      <text x={4} y={lineY} dy="0.32em" fontSize={13} fill="var(--viz-muted)">
                        not estimable
                      </text>
                    )}
                  </g>
                  {wide ? (
                    <g opacity={op}>
                      <text x={width - valueW + 10} y={r.subText ? lineY - 8 : lineY} dy="0.32em" fontSize={13} fill="var(--viz-ink)" className="num">
                        {r.valueText}
                      </text>
                      {r.subText ? (
                        <text x={width - valueW + 10} y={lineY + 9} dy="0.32em" fontSize={13} fill="var(--viz-muted)" className="num">
                          {r.subText}
                        </text>
                      ) : null}
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>
      {secondaryLabel || markerLabel ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="10" aria-hidden="true">
              <line x1="2" x2="20" y1="5" y2="5" stroke="var(--fg-muted)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="11" cy="5" r="3.5" fill="var(--fg-muted)" />
            </svg>
            Estimate and interval
          </span>
          {secondaryLabel ? (
            <span className="inline-flex items-center gap-1.5">
              <svg width="22" height="10" aria-hidden="true">
                <line x1="2" x2="20" y1="5" y2="5" stroke="var(--fg-muted)" strokeOpacity="0.6" strokeWidth="1.25" />
                <circle cx="11" cy="5" r="2.75" fill="var(--surface)" stroke="var(--fg-muted)" strokeWidth="1.5" />
              </svg>
              {secondaryLabel}
            </span>
          ) : null}
          {markerLabel ? (
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden="true">
                <path d="M6,1.5L10.5,6L6,10.5L1.5,6Z" fill="var(--surface)" stroke="var(--fg-muted)" strokeWidth="1.5" />
              </svg>
              {markerLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const HALO = { stroke: "var(--viz-surface)", strokeWidth: 3, strokeLinejoin: "round" as const, paintOrder: "stroke" as const };

function Swatch({ x, y, color, hollow }: { x: number; y: number; color: string; hollow?: boolean }) {
  return hollow ? (
    <circle cx={x} cy={y} r={3.5} fill="none" stroke={color} strokeWidth={2} />
  ) : (
    <rect x={x - 4} y={y - 4} width={8} height={8} rx={2} fill={color} />
  );
}

/** Truncate a label with an ellipsis so it fits roughly `px` at `size`. */
export function truncateTo(s: string, px: number, size = 11): string {
  const max = Math.max(4, Math.floor(px / (size * 0.56)));
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
