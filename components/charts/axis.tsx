import type { Scale } from "./scale";

const AXIS_FONT = 10.5;

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
  // Thin out labels that would collide (~ 6px per char + gap).
  const labels = ticks.map((t) => ({ t, s: format(t), x: scale(t) }));
  const kept: typeof labels = [];
  for (const l of labels) {
    const w = l.s.length * 6.2 + 10;
    const prev = kept[kept.length - 1];
    if (!prev || l.x - prev.x >= (w + prev.s.length * 6.2 + 10) / 2) kept.push(l);
  }
  return (
    <g aria-hidden="true" transform={`translate(0,${y})`}>
      {baseline ? <line x1={0} x2={width} y1={0.5} y2={0.5} stroke="var(--viz-axis)" strokeWidth={1} /> : null}
      {kept.map((l) => {
        const half = (l.s.length * 6.2) / 2;
        const anchor = l.x - half < -4 ? "start" : l.x + half > width + 4 ? "end" : "middle";
        return (
          <text key={l.t} x={anchor === "start" ? Math.max(l.x - 2, -4) : anchor === "end" ? Math.min(l.x + 2, width + 4) : l.x} y={14} textAnchor={anchor} fontSize={AXIS_FONT} fill="var(--viz-muted)" className="num">
            {l.s}
          </text>
        );
      })}
      {label ? (
        <text x={width} y={30} textAnchor="end" fontSize={AXIS_FONT} fill="var(--viz-ink-2)">
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
        <text x={-8} y={-12} textAnchor="start" fontSize={AXIS_FONT} fill="var(--viz-ink-2)" transform="translate(0,0)">
          {label}
        </text>
      ) : null}
    </g>
  );
}
