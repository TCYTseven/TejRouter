import type { SVGProps } from "react";
import type { Scale } from "./scale";

export interface Pt {
  x: number;
  y: number;
}

/** SVG path for a polyline (linear) or a step-after line. Skips non-finite points. */
export function linePath(points: Pt[], x: Scale, y: Scale, curve: "linear" | "step" = "linear"): string {
  let d = "";
  let prev: [number, number] | null = null;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      prev = null;
      continue;
    }
    const px = x(p.x);
    const py = y(p.y);
    if (!prev) d += `M${px.toFixed(1)},${py.toFixed(1)}`;
    else if (curve === "step") d += `H${px.toFixed(1)}V${py.toFixed(1)}`;
    else d += `L${px.toFixed(1)},${py.toFixed(1)}`;
    prev = [px, py];
  }
  return d;
}

/** 2px series line with round joins/caps. */
export function LinePath({
  points,
  x,
  y,
  color,
  width = 2,
  curve = "linear",
  opacity = 1,
  dash,
}: {
  points: Pt[];
  x: Scale;
  y: Scale;
  color: string;
  width?: number;
  curve?: "linear" | "step";
  opacity?: number;
  /** Only for reference lines (never gridlines). */
  dash?: string;
}) {
  return (
    <path
      d={linePath(points, x, y, curve)}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dash}
      opacity={opacity}
      style={{ transition: "opacity 150ms" }}
    />
  );
}

/** Confidence band between lo and hi, as a ~10% wash of the series color. */
export function BandArea({
  points,
  x,
  y,
  color,
  opacity = 0.12,
}: {
  points: { x: number; lo: number; hi: number }[];
  x: Scale;
  y: Scale;
  color: string;
  opacity?: number;
}) {
  const ok = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.lo) && Number.isFinite(p.hi));
  if (ok.length < 2) return null;
  const top = ok.map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.hi).toFixed(1)}`).join("");
  const bottom = [...ok].reverse().map((p) => `L${x(p.x).toFixed(1)},${y(p.lo).toFixed(1)}`).join("");
  return <path d={`${top}${bottom}Z`} fill={color} fillOpacity={opacity} stroke="none" style={{ transition: "fill-opacity 150ms" }} />;
}

/**
 * Data point: filled (or hollow) circle with a 2px surface ring and a transparent
 * hit area of at least 24px. Spread tooltip handlers and a11y props onto it.
 */
export function Dot({
  cx,
  cy,
  color,
  r = 4.5,
  hollow,
  opacity = 1,
  hitRadius = 12,
  shape = "circle",
  ...rest
}: {
  cx: number;
  cy: number;
  color: string;
  r?: number;
  hollow?: boolean;
  opacity?: number;
  hitRadius?: number;
  shape?: "circle" | "diamond" | "square";
} & Omit<SVGProps<SVGGElement>, "color" | "opacity">) {
  const mark =
    shape === "diamond" ? (
      <path
        d={`M${cx},${cy - r * 1.25}L${cx + r * 1.25},${cy}L${cx},${cy + r * 1.25}L${cx - r * 1.25},${cy}Z`}
        fill={hollow ? "var(--viz-surface)" : color}
        stroke={hollow ? color : "var(--viz-surface)"}
        strokeWidth={hollow ? 1.75 : 2}
        paintOrder="stroke"
      />
    ) : shape === "square" ? (
      <rect
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        rx={1.5}
        fill={hollow ? "var(--viz-surface)" : color}
        stroke={hollow ? color : "var(--viz-surface)"}
        strokeWidth={hollow ? 1.75 : 2}
        paintOrder="stroke"
      />
    ) : (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={hollow ? "var(--viz-surface)" : color}
        stroke={hollow ? color : "var(--viz-surface)"}
        strokeWidth={hollow ? 1.75 : 2}
        paintOrder="stroke"
      />
    );
  return (
    <g opacity={opacity} className="outline-none [&:focus-visible>.ring]:opacity-100" style={{ transition: "opacity 150ms" }} {...rest}>
      <circle cx={cx} cy={cy} r={hitRadius} fill="transparent" />
      <circle className="ring" cx={cx} cy={cy} r={r + 4} fill="none" stroke="var(--ring)" strokeWidth={2} opacity={0} />
      {mark}
    </g>
  );
}

/** Interval whisker (2px or thinner) with optional end caps. */
export function Whisker({
  x1,
  y1,
  x2,
  y2,
  color,
  width = 1.5,
  cap = 0,
  opacity = 1,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width?: number;
  cap?: number;
  opacity?: number;
}) {
  const vertical = Math.abs(x1 - x2) < Math.abs(y1 - y2);
  return (
    <g opacity={opacity} aria-hidden="true">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />
      {cap > 0 ? (
        vertical ? (
          <>
            <line x1={x1 - cap} x2={x1 + cap} y1={y1} y2={y1} stroke={color} strokeWidth={width} strokeLinecap="round" />
            <line x1={x2 - cap} x2={x2 + cap} y1={y2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />
          </>
        ) : (
          <>
            <line y1={y1 - cap} y2={y1 + cap} x1={x1} x2={x1} stroke={color} strokeWidth={width} strokeLinecap="round" />
            <line y1={y2 - cap} y2={y2 + cap} x1={x2} x2={x2} stroke={color} strokeWidth={width} strokeLinecap="round" />
          </>
        )
      ) : null}
    </g>
  );
}

/** Direct label in ink with a surface halo so it stays legible over marks. */
export function DirectLabel({
  x,
  y,
  children,
  anchor = "start",
  weight = 500,
  muted,
  size = 11,
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "middle" | "end";
  weight?: number;
  muted?: boolean;
  size?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      dy="0.32em"
      textAnchor={anchor}
      fontSize={size}
      fontWeight={weight}
      fill={muted ? "var(--viz-ink-2)" : "var(--viz-ink)"}
      stroke="var(--viz-surface)"
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
      aria-hidden="true"
    >
      {children}
    </text>
  );
}

/** Rough text width in px for an 11px UI font (good enough for collision checks). */
export function textWidth(s: string, size = 11): number {
  return s.length * size * 0.56;
}

/**
 * Nudge label y-positions apart so they do not overlap (keeps order, min gap).
 * Returns new y positions in the original order.
 */
export function separateLabels(ys: number[], minGap = 13, lo = -Infinity, hi = Infinity): number[] {
  const idx = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < idx.length; k++) if (idx[k].y - idx[k - 1].y < minGap) idx[k].y = idx[k - 1].y + minGap;
  const overflow = idx.length ? idx[idx.length - 1].y - hi : 0;
  if (overflow > 0) for (const it of idx) it.y -= overflow;
  for (let k = 0; k < idx.length; k++) if (idx[k].y < lo) idx[k].y = lo + k * minGap;
  const out = new Array<number>(ys.length);
  for (const it of idx) out[it.i] = it.y;
  return out;
}
