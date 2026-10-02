"use client";

import { useMemo, useState } from "react";
import {
  DataTable,
  DirectLabel,
  Dot,
  Legend,
  TipNote,
  TipRow,
  TipTitle,
  Whisker,
  XYChart,
  logDomain,
  textWidth,
  type XYContext,
} from "@/components/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { IconCoins } from "@/components/ui/icons";
import type { CostQualityPoint } from "@/lib/analysis/types";
import { ci, levelPct, pct, pctNum, pp, usd } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, ViewToggle, useReportCtx } from "./section";

export function CostQualitySection({ index }: { index: number }) {
  const { report, arm, level } = useReportCtx();
  const [view, setView] = useState<"chart" | "table">("chart");
  const cq = report.costQuality;
  const L = levelPct(level);
  const plotted = cq.points.filter((p) => p.costUsd != null && p.costUsd > 0 && p.quality != null);
  const missing = cq.points.filter((p) => !(p.costUsd != null && p.costUsd > 0 && p.quality != null));
  const perArm = useMemo(() => new Map(report.perArm.map((a) => [a.armId, a])), [report]);
  const gain = new Map(cq.gainOverBaselineHull.map((g) => [g.armId, g.gain]));

  const dominated = plotted.filter((p) => p.dominatedBy.length > 0);
  const takeaway = !report.meta.hasCost ? (
    "No cost data: this chart needs cost per request, reported by the router or estimated from token usage."
  ) : (
    <>
      {cq.frontier.length} of {plotted.length} arms are Pareto-optimal ({cq.frontier.map((id) => arm(id).label).join(", ")})
      {dominated.length ? (
        <>
          ; {dominated.map((d) => arm(d.armId).label).join(", ")} {dominated.length === 1 ? "is" : "are"} dominated (another arm is at least as accurate and no more expensive)
        </>
      ) : null}
      . Area under the cost–quality hull (AIQ) is <span className="num text-fg">{cq.aiq != null ? cq.aiq.toFixed(3) : "—"}</span>.
    </>
  );

  return (
    <ReportSection
      id="cost-quality"
      index={index}
      title="Cost vs quality"
      takeaway={takeaway}
      method={[METHOD.frontier, METHOD.cost]}
      actions={plotted.length ? <ViewToggle label="Cost-quality view" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} /> : undefined}
    >
      {plotted.length === 0 ? (
        <EmptyState compact icon={<IconCoins size={18} />} title="No cost data to plot" description="None of the arms reported a cost, and token usage was not available to estimate one." />
      ) : view === "chart" ? (
        <>
          <Legend
            className="mb-2"
            label="Cost-quality legend"
            items={[
              { key: "router", label: "Router", color: "var(--fg-muted)", shape: "dot" },
              { key: "fixed", label: "Fixed baseline", color: "var(--fg-muted)", shape: "rect" },
              { key: "frontier", label: "Pareto frontier", color: "var(--fg)", shape: "line" },
              { key: "hull", label: `Hull area (AIQ ${cq.aiq != null ? cq.aiq.toFixed(3) : "—"})`, color: "var(--accent)", shape: "band" },
              ...(cq.baselineHull.length >= 2 && cq.baselineHull.join() !== cq.hull.join()
                ? [{ key: "bh", label: `Baseline hull (AIQ ${cq.baselineAiq?.toFixed(3) ?? "—"})`, color: "var(--fg-subtle)", shape: "line" as const }]
                : []),
            ]}
          />
          <Scatter points={plotted} />
          <p className="mt-2 text-[11.5px] text-fg-subtle">
            Cost per request on a log scale; whiskers are {L} intervals on both axes. Faded points are dominated. Up and to the left is better.
            {cq.baselineHull.length >= 2 && cq.baselineHull.join() === cq.hull.join() ? " The baseline-only hull coincides with the overall hull: no router extends it." : ""}
          </p>
        </>
      ) : (
        <DataTable
          caption="Cost and quality by arm"
          rows={cq.points}
          getKey={(p) => p.armId}
          defaultSort={{ key: "q", dir: "desc" }}
          minWidth={820}
          columns={[
            { key: "arm", header: "Arm", render: (p) => <ArmLabel arm={arm(p.armId)} /> },
            { key: "c", header: "$/request", align: "right", render: (p) => <Val v={p.costUsd} fmt={usd} reason="no cost reported" />, sort: (p) => p.costUsd },
            { key: "cci", header: `${L} CI`, align: "right", render: (p) => ci(p.costLo, p.costHi, usd) },
            { key: "q", header: "Accuracy", align: "right", render: (p) => pct(p.quality), sort: (p) => p.quality },
            { key: "qci", header: `${L} CI`, align: "right", render: (p) => ci(p.qualityLo, p.qualityHi, (v) => pctNum(v)) },
            { key: "cpc", header: "$/correct", align: "right", render: (p) => <Val v={perArm.get(p.armId)?.cost.costPerCorrect} fmt={usd} reason="no cost or no correct answers" />, sort: (p) => perArm.get(p.armId)?.cost.costPerCorrect ?? null },
            { key: "f", header: "Frontier", align: "center", render: (p) => (p.onFrontier ? "yes" : "—") },
            { key: "d", header: "Dominated by", render: (p) => (p.dominatedBy.length ? p.dominatedBy.map((id) => arm(id).label).join(", ") : "—") },
            { key: "g", header: "vs baseline hull", align: "right", render: (p) => <Val v={gain.get(p.armId)} fmt={(v) => pp(v)} reason="baselines define the hull; gain is only computed for routers inside its cost range" /> },
          ]}
        />
      )}
      {missing.length ? (
        <p className="mt-2 text-[11.5px] text-fg-subtle">
          Not plotted (no cost or accuracy): {missing.map((m) => arm(m.armId).label).join(", ")}.
        </p>
      ) : null}
    </ReportSection>
  );
}

function Scatter({ points }: { points: CostQualityPoint[] }) {
  const { report, arm, level } = useReportCtx();
  const cq = report.costQuality;
  const L = levelPct(level);
  const byId = new Map(points.map((p) => [p.armId, p]));
  const xDomain = useMemo(() => {
    const xs = points.flatMap((p) => [p.costLo ?? p.costUsd, p.costHi ?? p.costUsd]).filter((v): v is number => v != null && v > 0);
    return logDomain(Math.min(...xs), Math.max(...xs), 0.15);
  }, [points]);
  const yDomain = useMemo<[number, number]>(() => {
    const ys = points.flatMap((p) => [p.qualityLo ?? p.quality, p.qualityHi ?? p.quality]).filter((v): v is number => v != null);
    const lo = Math.max(0, Math.floor((Math.min(...ys) - 0.03) * 20) / 20);
    const hi = Math.min(1, Math.ceil((Math.max(...ys) + 0.02) * 20) / 20);
    return [lo, hi > lo ? hi : lo + 0.1];
  }, [points]);

  const hullPts = cq.hull.map((id) => byId.get(id)).filter((p): p is CostQualityPoint => !!p);
  const frontierPts = cq.frontier.map((id) => byId.get(id)).filter((p): p is CostQualityPoint => !!p);
  const baseHullPts = cq.baselineHull.map((id) => byId.get(id)).filter((p): p is CostQualityPoint => !!p);
  const showBaseHull = baseHullPts.length >= 2 && cq.baselineHull.join() !== cq.hull.join();

  const tip = (p: CostQualityPoint) => {
    const a = arm(p.armId);
    return (
      <div>
        <TipTitle>
          {a.label} · {a.kind === "router" ? "router" : "fixed baseline"}
        </TipTitle>
        <TipRow color={a.color} shape={a.kind === "router" ? "dot" : "rect"} label={`accuracy ${ci(p.qualityLo, p.qualityHi, (v) => pctNum(v))}`} value={pct(p.quality)} />
        <TipRow label={`per request ${ci(p.costLo, p.costHi, usd)}`} value={usd(p.costUsd)} shape="none" />
        <TipNote>
          {p.onFrontier
            ? "On the Pareto frontier: no other arm is both cheaper and more accurate."
            : p.dominatedBy.length
              ? `Dominated by ${p.dominatedBy.map((id) => arm(id).label).join(", ")} (at least as accurate, no more expensive).`
              : "Not on the frontier."}{" "}
          Intervals: {L}.
        </TipNote>
      </div>
    );
  };

  return (
    <XYChart
      ariaLabel="Cost per request versus accuracy, with Pareto frontier and convex hull"
      description={points.map((p) => `${arm(p.armId).label}: ${usd(p.costUsd)} per request, ${pct(p.quality)} accuracy${p.dominatedBy.length ? ", dominated" : ""}`).join("; ")}
      height={360}
      x={{ type: "log", domain: xDomain, format: (v) => usd(v), label: "Mean cost per request (USD, log scale)", grid: true }}
      y={{ domain: yDomain, format: (v) => `${Math.round(v * 100)}%`, label: "Accuracy" }}
      margin={{ right: 18 }}
      overlay={(ctx) => <Points ctx={ctx} points={points} tip={tip} />}
    >
      {(ctx) => (
        <>
          {hullPts.length >= 2 ? (
            <>
              <path
                d={`M${ctx.x(hullPts[0].costUsd!)},${ctx.innerHeight}${hullPts.map((p) => `L${ctx.x(p.costUsd!)},${ctx.y(p.quality!)}`).join("")}L${ctx.x(hullPts[hullPts.length - 1].costUsd!)},${ctx.innerHeight}Z`}
                fill="var(--accent)"
                fillOpacity={0.08}
              />
              <path d={hullPts.map((p, i) => `${i ? "L" : "M"}${ctx.x(p.costUsd!)},${ctx.y(p.quality!)}`).join("")} fill="none" stroke="var(--accent)" strokeOpacity={0.55} strokeWidth={1.25} />
              {cq.aiq != null ? (
                <DirectLabel
                  x={(ctx.x(hullPts[0].costUsd!) + ctx.x(hullPts[hullPts.length - 1].costUsd!)) / 2}
                  y={ctx.innerHeight - 12}
                  anchor="middle"
                  muted
                  size={10.5}
                >
                  {`AIQ ${cq.aiq.toFixed(3)}`}
                </DirectLabel>
              ) : null}
            </>
          ) : null}
          {showBaseHull ? (
            <path d={baseHullPts.map((p, i) => `${i ? "L" : "M"}${ctx.x(p.costUsd!)},${ctx.y(p.quality!)}`).join("")} fill="none" stroke="var(--fg-subtle)" strokeWidth={1.25} strokeDasharray="4 3" />
          ) : null}
          {frontierPts.length >= 2 ? (
            <path
              d={frontierPts
                .map((p, i) => {
                  const x = ctx.x(p.costUsd!);
                  const y = ctx.y(p.quality!);
                  return i === 0 ? `M${x},${y}` : `H${x}V${y}`;
                })
                .join("")}
              fill="none"
              stroke="var(--viz-ink)"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ) : null}
          {points.map((p) => {
            const a = arm(p.armId);
            const x = ctx.x(p.costUsd!);
            const y = ctx.y(p.quality!);
            const op = p.dominatedBy.length ? 0.4 : 0.75;
            return (
              <g key={`w-${p.armId}`}>
                {p.qualityLo != null && p.qualityHi != null ? <Whisker x1={x} x2={x} y1={ctx.y(p.qualityLo)} y2={ctx.y(p.qualityHi)} color={a.color} opacity={op} cap={3} /> : null}
                {p.costLo != null && p.costHi != null && p.costLo > 0 ? <Whisker y1={y} y2={y} x1={ctx.x(p.costLo)} x2={ctx.x(p.costHi)} color={a.color} opacity={op} cap={3} /> : null}
              </g>
            );
          })}
        </>
      )}
    </XYChart>
  );
}

function Points({ ctx, points, tip }: { ctx: XYContext; points: CostQualityPoint[]; tip: (p: CostQualityPoint) => React.ReactNode }) {
  const { arm } = useReportCtx();
  // Place direct labels greedily, avoiding overlaps; skip a label if no slot is free.
  const placed: { x0: number; x1: number; y: number }[] = [];
  const labels = [...points]
    .sort((a, b) => ctx.y(a.quality!) - ctx.y(b.quality!))
    .map((p) => {
      const a = arm(p.armId);
      const px = ctx.x(p.costUsd!);
      const py = ctx.y(p.quality!);
      const text = a.label.length > 28 ? `${a.label.slice(0, 27)}…` : a.label;
      const w = textWidth(text, 11);
      const right = px + 12 + w < ctx.innerWidth;
      const x0 = right ? px + 10 : px - 10 - w;
      const x1 = x0 + w;
      for (const dy of [-12, 12, -24, 24, 0]) {
        const y = py + dy;
        if (y < 6 || y > ctx.innerHeight - 6) continue;
        if (placed.every((b) => b.x1 < x0 - 4 || b.x0 > x1 + 4 || Math.abs(b.y - y) >= 13)) {
          placed.push({ x0, x1, y });
          return { p, text, x: right ? x0 : x1, y, anchor: right ? ("start" as const) : ("end" as const) };
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
            r={5.5}
            color={a.color}
            shape={a.kind === "router" ? "circle" : "square"}
            opacity={p.dominatedBy.length ? 0.45 : 1}
            tabIndex={0}
            role="img"
            aria-label={`${a.label}: ${usd(p.costUsd)} per request, accuracy ${pct(p.quality)}${p.dominatedBy.length ? `, dominated by ${p.dominatedBy.map((id) => arm(id).label).join(", ")}` : p.onFrontier ? ", on the Pareto frontier" : ""}`}
            {...ctx.bind(() => tip(p))}
          />
        );
      })}
      {labels.map((l) =>
        l ? (
          <g key={`l-${l.p.armId}`} opacity={l.p.dominatedBy.length ? 0.6 : 1}>
            <DirectLabel x={l.x} y={l.y} anchor={l.anchor} size={11}>
              {l.text}
            </DirectLabel>
          </g>
        ) : null,
      )}
    </>
  );
}
