import type { Scale } from "./scale";

/** Every chart label is 13px (CONTRIBUTING.md, "Design rules"). */
export const CHART_FONT = 13;
/** Rough advance width of one 13px digit/character, for collision checks. */
export const CHAR_W = 7.3;
const AXIS_FONT = CHART_FONT;

/** Horizontal gridlines at the given y ticks (hairline, recessive). */
export function GridY({ scale, ticks, width }: { scale: Scale; ticks: number[]; width: number }) {
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <line key={t} x1={0} x2={width} y1={Math.round(scale(t)) + 0.5} y2={Math.round(scale(t)) + 0.5} stroke="var(--viz-grid)" strokeWidth={1} />
      ))}
    </g>
  );
}

/** Vertical gridlines at the given x ticks. */
export function GridX({ scale, ticks, height }: { scale: Scale; ticks: number[]; height: number }) {
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <line key={t} y1={0} y2={height} x1={Math.round(scale(t)) + 0.5} x2={Math.round(scale(t)) + 0.5} stroke="var(--viz-grid)" strokeWidth={1} />
      ))}
    </g>
  );
}

/** Bottom axis: baseline, tick labels and an optional axis title. */
export function AxisBottom({
  scale,
  ticks,
  y,
  format,
  label,
  width,
  baseline = true,
}: {
  scale: Scale;
  ticks: number[];
  y: number;
  format: (v: number) => string;
  label?: string;
  width: number;
  baseline?: boolean;
}) {
  // Thin out labels that would collide.
  const labels = ticks.map((t) => ({ t, s: format(t), x: scale(t) }));
  const kept: typeof labels = [];
  for (const l of labels) {
    const w = l.s.length * CHAR_W + 14;
    const prev = kept[kept.length - 1];
    if (!prev || l.x - prev.x >= (w + prev.s.length * CHAR_W + 14) / 2) kept.push(l);
  }
  return (
    <g aria-hidden="true" transform={`translate(0,${y})`}>
      {baseline ? <line x1={0} x2={width} y1={0.5} y2={0.5} stroke="var(--viz-axis)" strokeWidth={1} /> : null}
      {kept.map((l) => {
        const half = (l.s.length * CHAR_W) / 2;
        const anchor = l.x - half < -4 ? "start" : l.x + half > width + 4 ? "end" : "middle";
        return (
          <text key={l.t} x={anchor === "start" ? Math.max(l.x - 2, -4) : anchor === "end" ? Math.min(l.x + 2, width + 4) : l.x} y={18} textAnchor={anchor} fontSize={AXIS_FONT} fill="var(--viz-muted)" className="num">
            {l.s}
          </text>
        );
      })}
      {label ? (
        <text x={width} y={38} textAnchor="end" fontSize={AXIS_FONT} fill="var(--viz-ink-2)">
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Left axis tick labels (no rule: the gridlines carry it) and optional title above. */
export function AxisLeft({
  scale,
  ticks,
  format,
  label,
}: {
  scale: Scale;
  ticks: number[];
  format: (v: number) => string;
  label?: string;
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <text key={t} x={-8} y={scale(t)} dy="0.32em" textAnchor="end" fontSize={AXIS_FONT} fill="var(--viz-muted)" className="num">
          {format(t)}
        </text>
      ))}
      {label ? (
        <text x={-8} y={-14} textAnchor="start" fontSize={AXIS_FONT} fill="var(--viz-ink-2)">
          {label}
        </text>
      ) : null}
    </g>
  );
}
