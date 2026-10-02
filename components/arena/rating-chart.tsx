"use client";

import { useState } from "react";
import type { ArenaArmStats } from "@/lib/analysis/arena";
import { formatNumber, formatPercent } from "@/lib/client/format";
import { armInfo, armLabel, niceTicks, rankRange, ratingDomain } from "./arm-meta";
import { ChartTooltip } from "./chart-tooltip";
import { useElementWidth } from "./hooks";

const ROW = 40;
const TOP = 6;
const AXIS = 34;

function clip(s: string, max: number) {
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * Interval plot of Bradley-Terry ratings: one row per router in rank order,
 * the 95% bootstrap interval as a 2px whisker, the estimate as a ringed dot,
 * and the 1000 average as the reference line.
 */
export function RatingChart({ arms }: { arms: ArenaArmStats[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const rows = arms.filter((a) => a.rating != null);
  const height = TOP + rows.length * ROW + AXIS;
  const narrow = width < 520;
  const labelW = narrow ? 118 : 200;
  const valueW = narrow ? 44 : 56;
  const x0 = labelW + 8;
  const x1 = Math.max(x0 + 40, width - valueW - 10);
  const domain = ratingDomain(rows);
  const ticks = niceTicks(domain[0], domain[1], narrow ? 3 : 6);
  const x = (v: number) => x0 + ((v - domain[0]) / (domain[1] - domain[0])) * (x1 - x0);
  const plotBottom = TOP + rows.length * ROW;
  const nameChars = Math.floor((labelW - 18) / 6.8);
  const modelChars = Math.floor((labelW - 18) / 6.1);
  const h = hover != null ? rows[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Bradley-Terry ratings with 95% bootstrap intervals, in rank order"
          className="block select-none"
          onPointerLeave={() => setHover(null)}
        >
          {/* gridlines + axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={TOP} y2={plotBottom} stroke="var(--border)" strokeWidth={1} />
              <text x={x(t)} y={plotBottom + 14} textAnchor="middle" className="num fill-fg-subtle text-[10px]">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          <line x1={x0} x2={x1} y1={plotBottom} y2={plotBottom} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={x(1000)} x2={x(1000)} y1={TOP} y2={plotBottom} stroke="var(--fg-subtle)" strokeOpacity={0.55} strokeWidth={1} />
          <text x={x1} y={plotBottom + 29} textAnchor="end" className="fill-fg-subtle text-[10px]">
            Rating (Elo scale, average 1000)
          </text>

          {rows.map((a, i) => {
            const info = armInfo(a.armId);
            const cy = TOP + i * ROW + ROW / 2;
            const active = hover === i;
            return (
              <g
                key={a.armId}
                tabIndex={0}
                role="img"
                aria-label={`Rank ${a.rank}: ${armLabel(a.armId)}, rating ${formatNumber(a.rating)}, 95% interval ${formatNumber(a.lo)} to ${formatNumber(a.hi)}`}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                <rect x={0} y={cy - ROW / 2} width={width} height={ROW} rx={6} fill={active ? "var(--surface-2)" : "transparent"} />
                {/* identity mark: square = router, ring = simulator */}
                {info.simulated ? (
                  <circle cx={6} cy={cy - 5} r={3.5} fill="none" stroke={info.color} strokeWidth={2} />
                ) : (
                  <rect x={2} y={cy - 9} width={8} height={8} rx={2} fill={info.color} />
                )}
                <text x={16} y={cy - 1} className="fill-fg text-[12px] font-medium">
                  {clip(info.name, nameChars)}
                </text>
                <text x={16} y={cy + 12} className="fill-fg-subtle font-mono text-[10px]">
                  {clip(info.model ?? "default model", modelChars)}
                </text>
                {a.lo != null && a.hi != null ? (
                  <line x1={x(a.lo)} x2={x(a.hi)} y1={cy} y2={cy} stroke={info.color} strokeWidth={2} strokeLinecap="round" />
                ) : null}
                <circle
                  cx={x(a.rating!)}
                  cy={cy}
                  r={active ? 6 : 5}
                  fill={info.simulated ? "var(--surface)" : info.color}
                  stroke={info.simulated ? info.color : "var(--surface)"}
                  strokeWidth={2}
                />
                <text x={width - 4} y={cy + 4} textAnchor="end" className="num fill-fg text-[12px] font-semibold">
                  {formatNumber(a.rating)}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
      {h ? (
        <ChartTooltip x={x(h.rating!)} y={TOP + (hover ?? 0) * ROW + ROW / 2} containerWidth={width}>
          <div className="num text-[13px] font-semibold text-fg">
            {formatNumber(h.rating)}
            <span className="ml-1.5 text-[11px] font-normal text-fg-muted">
              [{formatNumber(h.lo)}, {formatNumber(h.hi)}]
            </span>
          </div>
          <div className="mt-0.5 text-fg-muted">{armLabel(h.armId)}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-fg-subtle">
            <span>Rank</span>
            <span className="num text-right text-fg">
              {h.rank}
              {rankRange(h) ? ` (${rankRange(h)})` : ""}
            </span>
            <span>Win rate</span>
            <span className="num text-right text-fg">{formatPercent(h.winRate.value, 0)}</span>
            <span>Votes</span>
            <span className="num text-right text-fg">{h.votes}</span>
          </div>
        </ChartTooltip>
      ) : null}
    </div>
  );
}
