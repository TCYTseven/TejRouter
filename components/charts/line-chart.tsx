"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BandArea, DirectLabel, Dot, LinePath, separateLabels, textWidth, Whisker, type Pt } from "./marks";
import { Legend } from "./legend";
import { interpolateAt } from "./scale";
import { TipNote, TipRow, TipTitle } from "./tooltip";
import { XYChart, type AxisSpec, type Margin } from "./xy-chart";
import { cn } from "@/lib/client/cn";
import styles from "./viz.module.css";

export interface LineSeries {
  key: string;
  label: string;
  /** Short label for direct end-labels. */
  shortLabel?: string;
  color: string;
  points: Pt[];
  /** Pointwise confidence band. */
  band?: { x: number; lo: number; hi: number }[];
  curve?: "linear" | "step";
  /** Reference points on the line (e.g. p50/p90/p99), drawn as small hollow markers. */
  markers?: { x: number; y: number; label: string }[];
  /** Observed points with optional vertical whiskers (e.g. bucket accuracy). */
  dots?: { x: number; y: number; lo?: number | null; hi?: number | null; tip?: ReactNode; label: string }[];
}

/**
 * Multi-series line chart with optional confidence bands, reference markers,
 * observed points with whiskers, a crosshair tooltip listing every series at
 * the hovered x, a legend (>= 2 series) and optional direct end labels.
 */
export function LineChart({
  series,
  x,
  y,
  height = 280,
  ariaLabel,
  description,
  formatValue,
  endLabels = false,
  crosshairNote,
  margin,
  legend = true,
}: {
  series: LineSeries[];
  x: AxisSpec;
  y: AxisSpec;
  height?: number;
  ariaLabel: string;
  description?: string;
  /** Format for y values in the crosshair tooltip (default y.format). */
  formatValue?: (v: number) => string;
  endLabels?: boolean;
  crosshairNote?: ReactNode;
  margin?: Partial<Margin>;
  legend?: boolean;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const fmt = formatValue ?? y.format;
  const xsAll = useMemo(() => {
    const set = new Set<number>();
    for (const s of series) for (const p of s.points) if (Number.isFinite(p.x)) set.add(p.x);
    return [...set].sort((a, b) => a - b);
  }, [series]);
  const snapValues = xsAll.length <= 120 ? xsAll : undefined;
  const labelW = endLabels ? Math.max(0, ...series.map((s) => textWidth(s.shortLabel ?? s.label, 13))) + 14 : 0;

  return (
    <div className={cn(styles.viz, "flex flex-col gap-2")}>
      {legend && series.length >= 2 ? (
        <Legend
          items={series.map((s) => ({ key: s.key, label: s.label, color: s.color, shape: s.band ? "band" : "line", dimmed: focus != null && focus !== s.key }))}
          onHover={setFocus}
        />
      ) : null}
      <XYChart
        ariaLabel={ariaLabel}
        description={description}
        height={height}
        x={x}
        y={y}
        margin={{ right: endLabels ? Math.min(160, labelW) : 14, ...margin }}
        crosshair={{
          values: snapValues,
          content: (xv) => (
            <div>
              <TipTitle>{x.format(xv)}</TipTitle>
              {series
                .map((s) => ({ s, v: interpolateAt(s.points, xv, s.curve === "step" ? "step" : "linear") }))
                .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
                .map(({ s, v }) => {
                  const band = s.band?.length ? { lo: interpolateAt(s.band.map((b) => ({ x: b.x, y: b.lo })), xv), hi: interpolateAt(s.band.map((b) => ({ x: b.x, y: b.hi })), xv) } : null;
                  return (
                    <TipRow
                      key={s.key}
                      color={s.color}
                      label={s.label}
                      value={v == null ? "—" : fmt(v)}
                      sub={band && band.lo != null && band.hi != null ? `[${fmt(band.lo)}, ${fmt(band.hi)}]` : undefined}
                    />
                  );
                })}
              {crosshairNote ? <TipNote>{crosshairNote}</TipNote> : null}
            </div>
          ),
          markers: (xv, ctx) =>
            series.map((s) => {
              const v = interpolateAt(s.points, xv, s.curve === "step" ? "step" : "linear");
              if (v == null) return null;
              return <circle key={s.key} cx={ctx.x(xv)} cy={ctx.y(v)} r={3.5} fill={s.color} stroke="var(--viz-surface)" strokeWidth={2} />;
            }),
        }}
        overlay={(ctx) => (
          <>
            {series.map((s) =>
              (s.dots ?? []).map((d, i) => (
                <g key={`${s.key}-d${i}`} opacity={focus && focus !== s.key ? 0.2 : 1}>
                  {d.lo != null && d.hi != null ? <Whisker x1={ctx.x(d.x)} x2={ctx.x(d.x)} y1={ctx.y(d.lo)} y2={ctx.y(d.hi)} color={s.color} width={1.5} opacity={0.7} /> : null}
                  <Dot
                    cx={ctx.x(d.x)}
                    cy={ctx.y(d.y)}
                    r={4}
                    color={s.color}
                    shape="square"
                    tabIndex={0}
                    role="img"
                    aria-label={d.label}
                    {...ctx.bind(d.tip ?? d.label)}
                  />
                </g>
              )),
            )}
            {endLabels && ctx.innerWidth > 260 ? <EndLabels series={series} ctx={ctx} /> : null}
          </>
        )}
      >
        {(ctx) => (
          <>
            {series.map((s) =>
              s.band ? <BandArea key={`${s.key}-band`} points={s.band} x={ctx.x} y={ctx.y} color={s.color} opacity={focus && focus !== s.key ? 0.03 : 0.11} /> : null,
            )}
            {series.map((s) => (
              <LinePath key={s.key} points={s.points} x={ctx.x} y={ctx.y} color={s.color} curve={s.curve} opacity={focus && focus !== s.key ? 0.2 : 1} />
            ))}
            {series.map((s) =>
              (s.markers ?? []).map((m) => (
                <g key={`${s.key}-${m.label}`} opacity={focus && focus !== s.key ? 0.2 : 1} aria-hidden="true">
                  <circle cx={ctx.x(m.x)} cy={ctx.y(m.y)} r={3.25} fill="var(--viz-surface)" stroke={s.color} strokeWidth={1.75} />
                </g>
              )),
            )}
          </>
        )}
      </XYChart>
    </div>
  );
}

function EndLabels({ series, ctx }: { series: LineSeries[]; ctx: { x: (v: number) => number; y: (v: number) => number; innerWidth: number; innerHeight: number } }) {
  const ends = series.map((s) => {
    const pts = s.points.filter((p) => Number.isFinite(p.y));
    const last = pts[pts.length - 1];
    return last ? { s, px: ctx.x(last.x), py: ctx.y(last.y) } : null;
  });
  const valid = ends.filter((e): e is NonNullable<typeof e> => e != null);
  const ys = separateLabels(valid.map((e) => e.py), 16, 6, ctx.innerHeight - 6);
  return (
    <g aria-hidden="true">
      {valid.map((e, i) => (
        <g key={e.s.key}>
          {Math.abs(ys[i] - e.py) > 3 ? <line x1={e.px + 2} x2={e.px + 8} y1={e.py} y2={ys[i]} stroke="var(--viz-muted)" strokeWidth={1} /> : null}
          <DirectLabel x={e.px + 10} y={ys[i]}>
            {e.s.shortLabel ?? e.s.label}
          </DirectLabel>
        </g>
      ))}
    </g>
  );
}
