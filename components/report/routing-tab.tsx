"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { Legend, LineChart, StackedBarRows, TipNote, TipRow, TipTitle, ordinalColor, type LineSeries, type Segment } from "@/components/charts";
import { ButtonLink } from "@/components/ui/button";
import type { ModelShare, RoutingStats } from "@/lib/analysis/types";
import { levelPct, pct, usd } from "./format";
import { ArmLabel, METHOD, Panel, Term, useReportCtx } from "./section";
import { easyHardMix, fin, oneModelReason, pricierModel } from "./verdicts";

/** Run-wide model colors: ordinal by list price (cheap = first step), tail folded into "Other". */
function useModelPalette(routing: RoutingStats[]) {
  return useMemo(() => {
    const agg = new Map<string, { count: number; price: number | null }>();
    for (const r of routing)
      for (const m of r.models) {
        const e = agg.get(m.model) ?? { count: 0, price: m.blendedPrice };
        e.count += m.count;
        agg.set(m.model, e);
      }
    const all = [...agg.entries()].map(([model, e]) => ({ model, ...e }));
    const keep = all.length <= 7 ? all : [...all].sort((a, b) => b.count - a.count).slice(0, 6);
    const ordered = [...keep].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.model.localeCompare(b.model));
    const color = new Map(ordered.map((m, i) => [m.model, m.price == null ? "var(--viz-other)" : ordinalColor(i, ordered.length)]));
    const ink = new Map(ordered.map((m, i) => [m.model, i / Math.max(1, ordered.length - 1) > 0.5 ? "var(--viz-seq-ink-hi)" : "var(--viz-seq-ink-lo)"]));
    return { list: ordered, colorOf: (m: string) => color.get(m) ?? "var(--viz-other)", inkOf: (m: string) => ink.get(m) ?? "var(--fg)", has: (m: string) => color.has(m) };
  }, [routing]);
}
type Palette = ReturnType<typeof useModelPalette>;

function segmentsOf(models: Pick<ModelShare, "model" | "share" | "blendedPrice">[], pal: Palette, n: number, title: string): Segment[] {
  const out = new Map<string, Segment>();
  for (const m of [...models].sort((a, b) => (a.blendedPrice ?? Infinity) - (b.blendedPrice ?? Infinity))) {
    const known = pal.has(m.model);
    const key = known ? m.model : "Other";
    const value = (out.get(key)?.value ?? 0) + m.share;
    out.set(key, {
      key,
      label: key,
      value,
      color: known ? pal.colorOf(m.model) : "var(--viz-other)",
      ink: known ? pal.inkOf(m.model) : "var(--fg)",
      tip: (
        <div>
          <TipTitle>{title}</TipTitle>
          <TipRow color={known ? pal.colorOf(m.model) : "var(--viz-other)"} shape="rect" label={key} value={pct(value, 0)} sub={`${Math.round(value * n)} of ${n}`} />
          {m.blendedPrice != null ? <TipNote>List price about ${m.blendedPrice.toFixed(2)} per million tokens.</TipNote> : null}
        </div>
      ),
    });
  }
  return [...out.values()];
}

export function RoutingTab() {
  const { report } = useReportCtx();
  const routers = report.routing.filter((r) => r.kind === "router");
  if (!routers.length) {
    return (
      <Panel title="Routing" takeaway="Every router in this run always uses one model, so there are no routing choices to show.">
        <ButtonLink href="/benchmarks" size="sm">
          Run a benchmark with a router
        </ButtonLink>
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ModelChoice routers={routers} />
      <Escalation routers={routers} />
      <VsPerfectPicker />
    </div>
  );
}

function adaptSentence(r: RoutingStats, ctx: Pick<ReturnType<typeof useReportCtx>, "report" | "run">): ReactNode {
  const { report } = ctx;
  if (r.nWithModel === 0) return "Does not report which model answered, so its choices cannot be shown.";
  const big = pricierModel(r);
  if (!big) {
    if (r.distinctModels > 1) return `Spreads tasks across ${r.distinctModels} models.`;
    const why = oneModelReason(ctx.run, r);
    return `Always picked ${r.models[0]?.model ?? "the same model"}.${why ? ` ${why}` : ""}`;
  }
  const { easy, hard } = easyHardMix(r, report);
  const e = easy.models.find((m) => m.model === big)?.share ?? 0;
  const h = hard.models.find((m) => m.model === big)?.share ?? 0;
  if (!easy.n || !hard.n) return `Uses ${big} for ${pct(r.models.find((m) => m.model === big)?.share, 0)} of tasks.`;
  if (Math.abs(h - e) < 0.05) return `Uses ${big} about as often for easy and hard tasks (${pct(e, 0)} vs ${pct(h, 0)}): its choice does not follow difficulty.`;
  return h > e ? `Sends ${pct(h, 0)} of hard tasks to ${big} vs ${pct(e, 0)} of easy ones.` : `Sends fewer hard tasks to ${big} than easy ones (${pct(h, 0)} vs ${pct(e, 0)}).`;
}

function ModelChoice({ routers }: { routers: RoutingStats[] }) {
  const { report, arm, run } = useReportCtx();
  const pal = useModelPalette(report.routing);
  const fixed = report.routing.filter((r) => r.kind === "fixed");
  const observed = routers.filter((r) => r.nWithModel > 0);
  const best = observed
    .map((r) => {
      const big = pricierModel(r);
      if (!big) return null;
      const { easy, hard } = easyHardMix(r, report);
      const gap = (hard.models.find((m) => m.model === big)?.share ?? 0) - (easy.models.find((m) => m.model === big)?.share ?? 0);
      return { r, gap };
    })
    .filter((x): x is { r: RoutingStats; gap: number } => x != null)
    .sort((a, b) => b.gap - a.gap)[0];
  const takeaway = best && best.gap >= 0.05 ? (
    <>
      <span className="text-fg">{arm(best.r.armId).label}</span> follows difficulty most closely. Easy tasks are the easier half by human-rated difficulty; hard tasks are the harder half.
    </>
  ) : (
    "None of the routers clearly picks a different model for hard tasks than for easy ones."
  );
  const used = pal.list.filter((m) => routers.some((r) => r.models.some((x) => x.model === m.model)));

  return (
    <Panel id="choices" title="Which model each router picked" takeaway={takeaway} method={METHOD.routing}>
      {used.length ? (
        <Legend className="mb-5" label="Models, cheapest first" items={used.map((m) => ({ key: m.model, label: m.price != null ? `${m.model} ($${m.price.toFixed(2)} per million tokens)` : m.model, color: pal.colorOf(m.model), shape: "rect" as const }))} />
      ) : null}
      <div className="flex flex-col gap-8">
        {routers.map((r) => {
          const a = arm(r.armId);
          const { easy, hard } = easyHardMix(r, report);
          return (
            <div key={r.armId} className="min-w-0">
              <h3 className="text-[15px] font-semibold text-fg">
                <ArmLabel arm={a} />
              </h3>
              <p className="mt-1 text-[15px] text-fg-muted">{adaptSentence(r, { report, run })}</p>
              {r.nWithModel > 0 ? (
                <StackedBarRows
                  className="mt-3"
                  ariaLabel={`Models picked by ${a.label}`}
                  labelWidth={120}
                  height={22}
                  labelFormat={(s, share) => `${Math.round(share * 100)}%`}
                  rows={[
                    { key: "all", label: "All tasks", text: "All tasks", segments: segmentsOf(r.models, pal, r.nWithModel, `${a.label}, all tasks`), trailing: `${r.nWithModel} answers` },
                    ...(easy.n ? [{ key: "easy", label: "Easy tasks", text: "Easy tasks", segments: segmentsOf(easy.models, pal, Math.round(easy.n), `${a.label}, easy tasks`), trailing: `${Math.round(easy.n)} answers` }] : []),
                    ...(hard.n ? [{ key: "hard", label: "Hard tasks", text: "Hard tasks", segments: segmentsOf(hard.models, pal, Math.round(hard.n), `${a.label}, hard tasks`), trailing: `${Math.round(hard.n)} answers` }] : []),
                  ]}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {fixed.length ? (
        <p className="mt-6 text-[13px] text-fg-muted">
          Not shown because they always use one model:{" "}
          {fixed.map((f, i) => (
            <Fragment key={f.armId}>
              {i ? ", " : ""}
              {arm(f.armId).label}
            </Fragment>
          ))}
          .
        </p>
      ) : null}
    </Panel>
  );
}

function Escalation({ routers }: { routers: RoutingStats[] }) {
  const { report, arm, level } = useReportCtx();
  const L = levelPct(level);
  const withCurve = routers.filter((r) => r.escalation && r.escalation.curve.length > 1);
  const series = useMemo<LineSeries[]>(
    () =>
      withCurve.map((r) => {
        const a = arm(r.armId);
        const buckets = report.perArmDifficultyBucket.filter((b) => b.armId === r.armId && b.escalationRate != null && b.nSamples > 0);
        return {
          key: r.armId,
          label: a.label,
          color: a.color,
          points: r.escalation!.curve.map((p) => ({ x: p.x, y: p.p })),
          band: r.escalation!.curve.map((p) => ({ x: p.x, lo: p.lo, hi: p.hi })),
          dots: buckets.map((b) => ({
            x: b.meanDifficulty ?? (b.lo + b.hi) / 2,
            y: b.escalationRate!,
            label: `${a.label}, difficulty ${b.label}: ${pct(b.escalationRate, 0)} sent to the pricier model`,
            tip: (
              <div>
                <TipTitle>
                  {a.label}, difficulty {b.label}
                </TipTitle>
                <TipRow color={a.color} shape="rect" label="sent to the pricier model" value={pct(b.escalationRate, 0)} />
                <TipNote>{b.nSamples} answers in this difficulty range.</TipNote>
              </div>
            ),
          })),
        } satisfies LineSeries;
      }),
    [withCurve, report, arm],
  );
  if (!withCurve.length) {
    return (
      <Panel title="Pricier model use by difficulty" takeaway="Not available: no router used two or more models with known, different prices." method={METHOD.escalation}>
        <span className="sr-only">No chart</span>
      </Panel>
    );
  }
  const ranked = [...withCurve].sort((a, b) => (b.escalation!.slope ?? 0) - (a.escalation!.slope ?? 0));
  const top = ranked[0];
  const first = top.escalation!.curve[0]?.p;
  const last = top.escalation!.curve[top.escalation!.curve.length - 1]?.p;
  const flat = ranked.slice(1).find((r) => r.escalation!.pSlope != null && r.escalation!.pSlope >= report.options.alpha);
  const takeaway = (
    <>
      <span className="text-fg">{arm(top.armId).label}</span> goes from {pct(first, 0)} on the easiest tasks to {pct(last, 0)} on the hardest
      {flat ? (
        <>
          ; <span className="text-fg">{arm(flat.armId).label}</span> stays near {pct(flat.escalation!.rate, 0)} whatever the difficulty
        </>
      ) : null}
      .
    </>
  );
  return (
    <Panel id="escalation" title="Pricier model use by difficulty" takeaway={takeaway} method={METHOD.escalation}>
      <LineChart
        series={series}
        ariaLabel="Chance of picking the pricier model versus task difficulty, per router"
        description={withCurve.map((r) => `${arm(r.armId).label}: ${pct(r.escalation!.rate, 0)} overall`).join("; ")}
        height={300}
        x={{ domain: [0, 1], format: (v) => (v === 0 ? "Easiest" : v === 1 ? "Hardest" : v.toFixed(1)), label: "Task difficulty", ticks: [0, 0.5, 1] }}
        y={{ domain: [0, 1], format: (v) => `${Math.round(v * 100)}%`, label: "Sent to the pricier model", ticks: [0, 0.5, 1] }}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        crosshairNote={`Fitted chance of picking the pricier model; the range in brackets is the ${L} interval.`}
      />
      <p className="mt-3 text-[13px] text-fg-muted">Lines are fitted trends with their likely range shaded; squares are what each router actually did in each difficulty range.</p>
    </Panel>
  );
}

function VsPerfectPicker() {
  const { report, arm } = useReportCtx();
  const rq = report.routingQuality;
  const picker = (
    <Term tip="A perfect picker is a hypothetical router that, for every task, uses the cheapest model that got it right. No real router can beat it on this run.">perfect picker</Term>
  );
  if (!rq.available || !rq.oracle) {
    return (
      <Panel title="Compared with a perfect picker" takeaway="Not available: this needs routers that always use one model (for example the same router pinned to each of its models) on the same tasks." method={METHOD.oracle}>
        <ButtonLink href="/benchmarks" size="sm">
          Set up a run with single-model routers
        </ButtonLink>
      </Panel>
    );
  }
  const o = rq.oracle;
  const bestFixed = rq.bestFixed;
  const fixedName = (id: string) => arm(id).model ?? arm(id).label;
  return (
    <Panel
      id="perfect"
      title="Compared with a perfect picker"
      takeaway={
        <>
          A {picker} would get {pct(o.accuracy)} at {usd(o.meanCostUsd)} per answer by choosing between {rq.baselineArmIds.map(fixedName).join(" and ")} for every task.
        </>
      }
      method={METHOD.oracle}
    >
      <ul className="divide-y divide-border">
        {rq.routers.map((r) => {
          const a = arm(r.armId);
          const ratio = r.costRatioToOracle;
          const costVsPicker = !fin(ratio) ? "" : Math.abs(ratio - 1) < 0.1 ? ", at about the same cost" : ratio < 1 ? `, at ${costWords(ratio)} the cost` : `, at ${ratio.toFixed(1)}× the cost`;
          const g = r.regretVsBestFixed;
          let vsBest = "";
          if (bestFixed && fin(bestFixed.accuracy)) {
            const sv = r.costSavingsVsBestFixed;
            const cost = fin(sv) && Math.abs(sv) >= 0.05 ? `this router costs ${Math.round(Math.abs(sv) * 100)}% ${sv > 0 ? "less" : "more"}` : "this router costs about the same";
            const acc = fin(g.lo) && fin(g.hi) ? (g.lo > 0 ? "is clearly less accurate" : g.hi < 0 ? "is clearly more accurate" : "is about as accurate") : "";
            vsBest = ` Always using ${fixedName(bestFixed.armId)} gets ${pct(bestFixed.accuracy)}; ${cost}${acc ? ` and ${acc}` : ""}.`;
          }
          return (
            <li key={r.armId} className="py-4 first:pt-0 last:pb-0">
              <ArmLabel arm={a} className="text-[15px] font-medium text-fg" />
              <p className="mt-1 text-[15px] text-fg-muted">
                Gets {pct(r.accuracy)} vs {pct(o.accuracy)} for a perfect picker{costVsPicker}.{vsBest}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function costWords(ratio: number): string {
  if (ratio > 0.45 && ratio < 0.55) return "half";
  if (ratio > 0.3 && ratio < 0.37) return "a third of";
  if (ratio > 0.22 && ratio < 0.28) return "a quarter of";
  return `${Math.round(ratio * 100)}% of`;
}
