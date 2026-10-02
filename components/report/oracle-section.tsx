"use client";

import { IntervalPlot, Meter, TipNote, TipRow, TipTitle, type IntervalRow } from "@/components/charts";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconGauge } from "@/components/ui/icons";
import { StatTile } from "@/components/ui/stat";
import { ci, levelPct, pct, pctNum, pp, times, usd } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, useReportCtx } from "./section";

export function OracleSection({ index }: { index: number }) {
  const { report, arm, level } = useReportCtx();
  const rq = report.routingQuality;
  const L = levelPct(level);

  if (!rq.available) {
    return (
      <ReportSection id="oracle" index={index} title="Routing quality vs oracle" takeaway="Not available for this run." method={METHOD.oracle}>
        <EmptyState
          compact
          icon={<IconGauge size={18} />}
          title="Add pinned baselines to unlock routing quality"
          description={
            <>
              {rq.reason ? `${rq.reason} ` : ""}Comparing a router against an oracle needs fixed-model baseline arms (the same router or provider pinned to
              individual models) run on the same tasks. The oracle picks, per task, the cheapest baseline that answered correctly; regret is measured against the
              best single baseline.
            </>
          }
          action={
            <ButtonLink href="/benchmarks" size="sm" variant="secondary">
              Set up a run with baselines
            </ButtonLink>
          }
        />
      </ReportSection>
    );
  }

  const routers = rq.routers;
  const best = [...routers].filter((r) => r.headroomCaptured != null).sort((a, b) => b.headroomCaptured! - a.headroomCaptured!)[0];
  const takeaway = best ? (
    <>
      The oracle reaches <span className="num text-fg">{pct(rq.oracle?.accuracy)}</span> at <span className="num text-fg">{usd(rq.oracle?.meanCostUsd)}</span> per request. The best
      router, {arm(best.armId).label}, captures <span className="num text-fg">{pct(best.headroomCaptured, 0)}</span> of the headroom between the cheapest baseline and the oracle
      {best.headroomCaptured! < 0 ? " (negative: it is less accurate than simply always using the cheapest baseline)" : ""}.
    </>
  ) : (
    "No router could be compared with the baselines."
  );

  const minH = Math.min(0, ...routers.map((r) => r.headroomCaptured ?? 0));
  const meterMin = minH < 0 ? Math.max(-2, Math.floor(minH)) : 0;

  const regretRows: IntervalRow[] = routers.map((r) => {
    const a = arm(r.armId);
    const g = r.regretVsBestFixed;
    return {
      key: r.armId,
      label: a.label,
      color: a.color,
      hollowSwatch: a.simulated,
      value: g.value,
      lo: g.lo,
      hi: g.hi,
      valueText: `${pp(g.value)} ${ci(g.lo, g.hi, (v) => pctNum(v))}`,
      subText: g.lo != null && g.hi != null ? (g.lo > 0 ? "reliably worse than best fixed" : g.hi < 0 ? "reliably better than best fixed" : "interval includes 0") : undefined,
      tip: (
        <div>
          <TipTitle>{a.label}</TipTitle>
          <TipRow color={a.color} label={`regret vs ${rq.bestFixed ? arm(rq.bestFixed.armId).label : "best fixed"}, ${L} CI`} value={pp(g.value)} sub={ci(g.lo, g.hi, (v) => pctNum(v))} />
          <TipNote>Best fixed accuracy minus router accuracy on shared tasks; positive = the router is worse than always using the best single model.</TipNote>
        </div>
      ),
    };
  });

  return (
    <ReportSection id="oracle" index={index} title="Routing quality vs oracle" takeaway={takeaway} method={[METHOD.oracle, METHOD.arms]}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatTile
          label="Oracle (per-task cheapest correct baseline)"
          value={pct(rq.oracle?.accuracy)}
          sub={
            <>
              {usd(rq.oracle?.meanCostUsd)}/request · picks {rq.oracle?.picks.map((p) => `${arm(p.armId).model ?? arm(p.armId).label} ${pct(p.share, 0)}`).join(", ")}
            </>
          }
          emphasis
        />
        <StatTile
          label="Best fixed baseline"
          value={pct(rq.bestFixed?.accuracy)}
          sub={rq.bestFixed ? `${arm(rq.bestFixed.armId).label} · ${usd(rq.bestFixed.meanCostUsd)}/request` : "—"}
        />
        <StatTile
          label="Cheapest fixed baseline"
          value={pct(rq.cheapestFixed?.accuracy)}
          sub={rq.cheapestFixed ? `${arm(rq.cheapestFixed.armId).label} · ${usd(rq.cheapestFixed.meanCostUsd)}/request` : "—"}
        />
      </div>

      <ul className="mt-4 grid gap-3 md:grid-cols-2" aria-label="Routers versus the oracle">
        {routers.map((r) => {
          const a = arm(r.armId);
          const h = r.headroomCaptured;
          return (
            <li key={r.armId} className="rounded-md border border-border bg-surface-2/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <ArmLabel arm={a} className="text-[13px] font-medium text-fg" />
                <span className="num text-[12px] text-fg-muted">
                  {pct(r.accuracy)} · {usd(r.meanCostUsd)}
                </span>
              </div>
              <div className="mb-1 flex items-baseline justify-between text-[11.5px]">
                <span className="text-fg-muted">Headroom captured</span>
                <span className="num font-semibold text-fg">
                  <Val v={h} fmt={(v) => pct(v, 0)} reason="oracle and cheapest baseline have the same accuracy, so there is no headroom" />
                  {h != null && h < 0 ? <span className="ml-1.5 text-[10.5px] font-normal text-danger">below cheapest baseline</span> : null}
                </span>
              </div>
              <Meter
                value={h}
                min={meterMin}
                max={1}
                tone={h != null && h < 0 ? "danger" : "accent"}
                ariaLabel={`${a.label}: share of oracle headroom captured`}
                valueText={h == null ? "not available" : `${pct(h, 0)}${h < 0 ? ", below the cheapest baseline" : ""}`}
                marks={[
                  { value: 0, label: "cheapest fixed" },
                  { value: 1, label: "oracle" },
                ]}
              />
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-[11.5px] sm:grid-cols-2">
                <Item label="Gap to oracle accuracy" value={<Val v={r.accuracyGapToOracle} fmt={(v) => pp(v).replace("+", "")} reason="oracle accuracy not available" />} />
                <Item label="Cost vs oracle" value={<Val v={r.costRatioToOracle} fmt={times} reason="no cost data" />} />
                <Item label="Regret vs best fixed" value={<span className="num">{pp(r.regretVsBestFixed.value)}</span>} />
                <Item
                  label="Cost vs best fixed"
                  value={<Val v={r.costSavingsVsBestFixed} fmt={(v) => `${pct(Math.abs(v), 0)} ${v >= 0 ? "cheaper" : "dearer"}`} reason="no cost data" />}
                />
                <Item label="vs baseline hull" value={<Val v={r.gainOverBaselineHull} fmt={(v) => pp(v)} reason="router cost outside the baselines' cost range" />} />
                <Item label="Shared tasks" value={<span className="num">{r.nTasks}</span>} />
              </dl>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-6 mb-2 text-xs font-semibold text-fg">Regret vs best fixed baseline · lower is better</h3>
      <IntervalPlot
        rows={regretRows}
        format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)} pp`}
        reference={{ value: 0 }}
        axisLabel={`Accuracy regret (pp), ${L} paired bootstrap CI`}
        ariaLabel="Accuracy regret of each router versus the best fixed baseline"
      />
    </ReportSection>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-right text-fg">{value}</dd>
    </div>
  );
}
