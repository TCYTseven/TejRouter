/**
 * Inline rating interval for a table cell: a 2px whisker for the 95% CI, the
 * point estimate as a ringed dot, and a hairline at the 1000 average. All rows
 * share one domain so whiskers are comparable down the column.
 */
export function CiBar({
  rating,
  lo,
  hi,
  domain,
  color,
  simulated,
  width = 168,
  height = 18,
}: {
  rating: number | null;
  lo: number | null;
  hi: number | null;
  domain: [number, number];
  color: string;
  simulated?: boolean;
  width?: number;
  height?: number;
}) {
  const pad = 6;
  const [d0, d1] = domain;
  const x = (v: number) => pad + ((v - d0) / (d1 - d0)) * (width - 2 * pad);
  const cy = height / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block shrink-0 overflow-visible">
      <line x1={pad} x2={width - pad} y1={cy} y2={cy} stroke="var(--border)" strokeWidth={1} />
      <line x1={x(1000)} x2={x(1000)} y1={2} y2={height - 2} stroke="var(--border-strong)" strokeWidth={1} />
      {lo != null && hi != null ? (
        <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke={color} strokeWidth={2} strokeLinecap="round" />
      ) : null}
      {rating != null ? (
        <circle
          cx={x(rating)}
          cy={cy}
          r={4.5}
          fill={simulated ? "var(--surface)" : color}
          stroke={simulated ? color : "var(--surface)"}
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}
