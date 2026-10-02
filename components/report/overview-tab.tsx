"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { DirectLabel, Dot, Legend, LineChart, TipNote, TipRow, TipTitle, XYChart, logDomain, niceDomain, textWidth, type LineSeries, type XYContext } from "@/components/charts";
import type { CostQualityPoint } from "@/lib/analysis/types";
import { levelPct, ms, pct, usd } from "./format";
import { METHOD, Panel, useReportCtx } from "./section";
import { fin, savingText } from "./verdicts";

/** Overview: the two trade-offs a buyer weighs after accuracy: price and speed. */
export function OverviewTab() {
  return (
    <div className="flex flex-col gap-6">
      <CostAccuracy />
      <ResponseTime />
    </div>
  );
}

// ---------------------------------------------------------------- cost vs accuracy

function CostAccuracy() {
  const { report, arm } = useReportCtx();
  const cq = report.costQuality;
  const points = cq.points.filter((p) => fin(p.costUsd) && p.costUsd > 0 && fin(p.quality));
  const missing = cq.points.filter((p) => !points.includes(p));
  const name = (id: string) => <span className="text-fg">{arm(id).label}</span>;

  let takeaway: ReactNode;
  if (!points.length) takeaway = "No router reported a cost, and token usage was not available to estimate one.";
  else {
    const dominated = points.filter((p) => p.dominatedBy.length > 0);
    const cheapest = [...points].sort((a, b) => a.costUsd! - b.costUsd!)[0];
    const priciest = [...points].sort((a, b) => b.costUsd! - a.costUsd!)[0];
    if (dominated.length) {
      const d = dominated[0];
      const by = points.find((p) => p.armId === d.dominatedBy[0]);
      takeaway = (
        <>
          {name(d.armId)} is never the best pick: {by ? name(by.armId) : "another router"} is at least as accurate and costs less
          {dominated.length > 1 ? `, and ${dominated.length - 1} more router${dominated.length > 2 ? "s are" : " is"} in the same position` : ""}.
        </>
      );
    } else if (cheapest !== priciest) {
      takeaway = (
        <>
          Every router is a fair trade: paying more buys accuracy, from {pct(cheapest.quality, 0)} for {name(cheapest.armId)} to {pct(priciest.quality, 0)} for {name(priciest.armId)}, which costs{" "}
          {savingText(cheapest.costUsd!, priciest.costUsd!).replace(" less", " more")}.
        </>
      );
    } else takeaway = <>{name(cheapest.armId)} costs {usd(cheapest.costUsd)} per answer.</>;
  }

  return (
    <Panel id="cost" title="Cost vs accuracy" takeaway={takeaway} method={METHOD.frontier}>
      {points.length ? (
        <>
          <Legend
            className="mb-3"
            label="Routers"
            items={[
              ...points.map((p) => ({ key: p.armId, label: arm(p.armId).label, color: arm(p.armId).color, shape: arm(p.armId).kind === "router" ? ("dot" as const) : ("rect" as const) })),
              ...(cq.frontier.length >= 2 ? [{ key: "frontier", label: "Best accuracy for the price", color: "var(--fg-muted)", shape: "line" as const }] : []),
            ]}
          />
          <Scatter points={points} />
          <p className="mt-3 text-[13px] text-fg-muted">
            Up and to the left is better. Circles pick a model per task; squares always use the same model. Cost axis is logarithmic.
          </p>
        </>
      ) : null}
      {missing.length ? <p className="mt-2 text-[13px] text-fg-muted">Not shown, no cost data: {missing.map((m) => arm(m.armId).label).join(", ")}.</p> : null}
    </Panel>
  );
}

function Scatter({ points }: { points: CostQualityPoint[] }) {
  const { report, arm, level } = useReportCtx();
  const L = levelPct(level);
  const byId = new Map(points.map((p) => [p.armId, p]));
  const xDomain = useMemo(() => {
    const xs = points.map((p) => p.costUsd!);
    return logDomain(Math.min(...xs), Math.max(...xs), 0.25);
  }, [points]);
  const yDomain = useMemo<[number, number]>(() => {
    const ys = points.map((p) => p.quality!);
    const lo = Math.max(0, Math.floor((Math.min(...ys) - 0.04) * 20) / 20);
    const hi = Math.min(1, Math.ceil((Math.max(...ys) + 0.03) * 20) / 20);
    return [lo, hi > lo ? hi : lo + 0.1];
  }, [points]);
  const frontier = report.costQuality.frontier.map((id) => byId.get(id)).filter((p): p is CostQualityPoint => !!p);

  const tip = (p: CostQualityPoint) => {
    const a = arm(p.armId);
    return (
      <div>
        <TipTitle>{a.label}</TipTitle>
        <TipRow color={a.color} shape={a.kind === "router" ? "dot" : "rect"} label="accuracy" value={pct(p.quality)} />
        <TipRow label="per answer" value={usd(p.costUsd)} shape="none" />
        <TipNote>
          {fin(p.qualityLo) && fin(p.qualityHi) ? `Accuracy likely between ${pct(p.qualityLo)} and ${pct(p.qualityHi)} (${L}). ` : ""}
          {p.dominatedBy.length ? `${p.dominatedBy.map((id) => arm(id).label).join(", ")} is at least as accurate for less.` : "No other router is both cheaper and more accurate."}
        </TipNote>
      </div>
    );
  };

  return (
    <XYChart
      ariaLabel="Cost per answer versus accuracy for each router"
      description={points.map((p) => `${arm(p.armId).label}: ${usd(p.costUsd)} per answer, ${pct(p.quality)} accuracy`).join("; ")}
      height={340}
      x={{ type: "log", domain: xDomain, format: (v) => usd(v), label: "Cost per answer" }}
      y={{ domain: yDomain, format: (v) => `${Math.round(v * 100)}%`, label: "Accuracy" }}
      margin={{ right: 20 }}
      overlay={(ctx) => <Points ctx={ctx} points={points} tip={tip} />}
    >
      {(ctx) =>
        frontier.length >= 2 ? (
          <path
            d={frontier.map((p, i) => `${i ? "L" : "M"}${ctx.x(p.costUsd!)},${ctx.y(p.quality!)}`).join("")}
            fill="none"
            stroke="var(--viz-ink-2)"
            strokeOpacity={0.6}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ) : null
      }
    </XYChart>
  );
}

function Points({ ctx, points, tip }: { ctx: XYContext; points: CostQualityPoint[]; tip: (p: CostQualityPoint) => ReactNode }) {
  const { arm } = useReportCtx();
  // Greedy direct-label placement: right/left of the point at a few offsets,
  // avoiding other labels, points and the plot edges; drop a label with no room
  // (the legend and tooltip still carry it).
  const marks = points.map((p) => ({ x: ctx.x(p.costUsd!), y: ctx.y(p.quality!) }));
  const placed: { x0: number; x1: number; y: number }[] = [];
  const labels = [...points]
    .sort((a, b) => ctx.y(a.quality!) - ctx.y(b.quality!))
    .map((p) => {
      const px = ctx.x(p.costUsd!);
      const py = ctx.y(p.quality!);
      const text = arm(p.armId).label;
      const w = textWidth(text, 13);
      for (const side of ["right", "left"] as const) {
        for (const dy of [0, -16, 16, -30, 30]) {
          const y = py + dy;
          const x0 = side === "right" ? px + 12 : px - 12 - w;
          const x1 = x0 + w;
          if (x0 < 0 || x1 > ctx.innerWidth || y < 8 || y > ctx.innerHeight - 8) continue;
          const hitsLabel = placed.some((b) => !(b.x1 < x0 - 6 || b.x0 > x1 + 6 || Math.abs(b.y - y) >= 17));
          const hitsMark = marks.some((m) => m.x >= x0 - 8 && m.x <= x1 + 8 && Math.abs(m.y - y) < 14 && !(m.x === px && m.y === py));
          if (hitsLabel || hitsMark) continue;
          placed.push({ x0, x1, y });
          return { p, text, x: side === "right" ? x0 : x1, y, anchor: side === "right" ? ("start" as const) : ("end" as const) };
        }
      }
      return null;
    });
  return (
    <>
      {points.map((p) => {
        const a = arm(p.armId);
        return (
          <Dot
            key={p.armId}
            cx={ctx.x(p.costUsd!)}
            cy={ctx.y(p.quality!)}
            r={6}
            color={a.color}
            shape={a.kind === "router" ? "circle" : "square"}
            tabIndex={0}
            role="img"
            aria-label={`${a.label}: ${usd(p.costUsd)} per answer, ${pct(p.quality)} accuracy`}
            {...ctx.bind(() => tip(p))}
          />
        );
      })}
      {labels.map((l) =>
        l ? (
          <Fragment key={`l-${l.p.armId}`}>
            <DirectLabel x={l.x} y={l.y} anchor={l.anchor}>
              {l.text}
            </DirectLabel>
          </Fragment>
        ) : null,
      )}
    </>
  );
}

// ---------------------------------------------------------------- response time

function ResponseTime() {
  const { report, arm } = useReportCtx();
  const arms = report.perArm.filter((a) => a.latency.n > 0 && a.latencyEcdf.length > 1);
  const xMax = useMemo(() => Math.max(1, ...arms.map((a) => a.latency.p99 ?? a.latency.max ?? 0)) * 1.05, [arms]);
  const series = useMemo<LineSeries[]>(
    () => arms.map((a) => ({ key: a.armId, label: arm(a.armId).label, color: arm(a.armId).color, points: a.latencyEcdf, curve: "step" as const })),
    [arms, arm],
  );
  const byMedian = [...arms].sort((a, b) => (a.latency.p50 ?? Infinity) - (b.latency.p50 ?? Infinity));
  const fast = byMedian[0];
  const slow = byMedian[byMedian.length - 1];
  const name = (id: string) => <span className="text-fg">{arm(id).label}</span>;
  const takeaway =
    fast && slow && fast !== slow ? (
      <>
        {name(fast.armId)} answers fastest: half of its answers arrive within {ms(fast.latency.p50)}. {name(slow.armId)} is slowest at {ms(slow.latency.p50)}, and 1 in 10 of its answers takes
        longer than {ms(slow.latency.p90)}.
      </>
    ) : fast ? (
      <>Half of the answers arrive within {ms(fast.latency.p50)}.</>
    ) : (
      "No successful answers to time."
    );

  return (
    <Panel id="speed" title="Response time" takeaway={takeaway} method={METHOD.latency}>
      {series.length ? (
        <LineChart
          series={series}
          ariaLabel="Share of answers returned within each response time, per router"
          description={arms.map((a) => `${arm(a.armId).label}: half within ${ms(a.latency.p50)}, 90% within ${ms(a.latency.p90)}`).join("; ")}
          height={300}
          x={{ domain: niceDomain(0, xMax, 5), format: (v) => ms(v), label: "Response time" }}
          y={{ domain: [0, 1], format: (v) => `${Math.round(v * 100)}%`, label: "Answers returned within this time", ticks: [0, 0.5, 1] }}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          crosshairNote="Share of each router's answers that arrived within this time."
        />
      ) : null}
    </Panel>
  );
}
