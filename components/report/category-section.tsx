"use client";

import { useMemo, useState } from "react";
import { DataTable, HeatmapTable, LineChart, ScaleLegend, TipNote, TipRow, TipTitle, sequentialFill, sequentialInk, type LineSeries } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { ArmCategoryStats } from "@/lib/analysis/types";
import { ci, levelPct, ms, num, pEq, pct, pctNum, usd } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, useReportCtx } from "./section";

const TOP = 12;

export function CategorySection({ index }: { index: number }) {
  const { report, arm } = useReportCtx();
  const [sort, setSort] = useState<"tasks" | "spread" | "name">("tasks");
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");
  const armIds = report.meta.arms.map((a) => a.id);

  const cells = useMemo(() => {
    const m = new Map<string, ArmCategoryStats>();
    for (const c of report.perArmCategory) m.set(`${c.category}\u0000${c.armId}`, c);
    return m;
  }, [report]);

  const cats = useMemo(() => {
    const list = report.meta.categories.map((c) => {
      const vals = armIds.map((id) => cells.get(`${c.name}\u0000${id}`)?.accuracy.value).filter((v): v is number => v != null);
      const spread = vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : 0;
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { ...c, spread, mean };
    });
    if (sort === "tasks") list.sort((a, b) => b.nTasks - a.nTasks || a.name.localeCompare(b.name));
    else if (sort === "spread") list.sort((a, b) => b.spread - a.spread || b.nTasks - a.nTasks);
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [report, armIds, cells, sort]);

  const shown = showAll ? cats : cats.slice(0, TOP);
  const mostSpread = [...cats].filter((c) => c.nTasks >= 2).sort((a, b) => b.spread - a.spread)[0];
  const hardest = [...cats].filter((c) => c.mean != null && c.nTasks >= 2).sort((a, b) => a.mean! - b.mean!)[0];

  const takeaway = (
    <>
      {cats.length} categories.
      {mostSpread && mostSpread.spread > 0 ? (
        <>
          {" "}Arms disagree most on <strong className="font-medium text-fg">{mostSpread.name}</strong> ({pct(mostSpread.spread, 0)} gap between best and worst arm, {mostSpread.nTasks} tasks)
        </>
      ) : null}
      {hardest ? (
        <>
          ; the hardest category overall is <strong className="font-medium text-fg">{hardest.name}</strong> (mean {pct(hardest.mean, 0)}).
        </>
      ) : (
        "."
      )}{" "}
      Small categories have wide intervals; hover a cell for its interval.
    </>
  );

  return (
    <ReportSection
      id="categories"
      index={index}
      title="Accuracy by category and difficulty"
      takeaway={takeaway}
      method={[METHOD.byCategory, METHOD.difficulty]}
      actions={
        <>
          <Segmented size="xs" label="Sort categories" value={sort} onChange={setSort} options={[{ value: "tasks", label: "Most tasks" }, { value: "spread", label: "Biggest gap" }, { value: "name", label: "A–Z" }]} />
          <Segmented size="xs" label="Category view" value={view} onChange={setView} options={[{ value: "chart", label: "Heatmap" }, { value: "table", label: "Table" }]} />
        </>
      }
    >
      {view === "chart" ? (
        <HeatmapTable
          caption="Accuracy by category (rows) and arm (columns)"
          rowHeader="Category · tasks"
          rows={shown.map((c) => ({ key: c.name, label: c.name, text: c.name, sub: `${c.nTasks} task${c.nTasks === 1 ? "" : "s"}${sort === "spread" && c.spread > 0 ? ` · gap ${pct(c.spread, 0)}` : ""}` }))}
          cols={armIds.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
          cellMinWidth={76}
          cell={(cat, id) => {
            const c = cells.get(`${cat}\u0000${id}`);
            const v = c?.accuracy.value ?? null;
            const a = arm(id);
            return {
              value: v,
              display: v == null ? "—" : `${Math.round(v * 100)}`,
              fill: v == null ? undefined : sequentialFill(v),
              ink: v == null ? undefined : sequentialInk(v),
              ariaLabel: `${cat}, ${a.label}: ${v == null ? "no samples" : pct(v)}`,
              tip: c ? (
                <div>
                  <TipTitle>
                    {cat} · {a.label}
                  </TipTitle>
                  <TipRow
                    color={a.color}
                    shape="rect"
                    label={
                      c.accuracy.lo != null && c.accuracy.hi != null && c.accuracy.hi - c.accuracy.lo > 1e-9
                        ? `accuracy ${ci(c.accuracy.lo, c.accuracy.hi, (x) => pctNum(x, 0))}`
                        : `accuracy · Wilson ${ci(c.correctRate.lo, c.correctRate.hi, (x) => pctNum(x, 0))}`
                    }
                    value={pct(v)}
                  />
                  <TipRow label="cost / request" value={usd(c.meanCostUsd)} shape="none" />
                  <TipRow label="median latency" value={ms(c.medianLatencyMs)} shape="none" />
                  <TipNote>
                    {c.nTasks} task{c.nTasks === 1 ? "" : "s"}, {c.nSamples} samples.
                  </TipNote>
                </div>
              ) : (
                "This arm has no samples in this category."
              ),
            };
          }}
          legend={<ScaleLegend label="Accuracy (%)" stops={[sequentialFill(0), sequentialFill(0.5), sequentialFill(1)]} left="0" right="100" />}
        />
      ) : (
        <DataTable
          caption="Accuracy by category and arm"
          rows={report.perArmCategory}
          getKey={(c) => `${c.category}-${c.armId}`}
          pageSize={25}
          minWidth={720}
          defaultSort={{ key: "cat", dir: "asc" }}
          columns={[
            { key: "cat", header: "Category", render: (c) => c.category, sort: (c) => c.category },
            { key: "arm", header: "Arm", render: (c) => <ArmLabel arm={arm(c.armId)} />, sort: (c) => arm(c.armId).label },
            { key: "acc", header: "Accuracy", align: "right", render: (c) => pct(c.accuracy.value), sort: (c) => c.accuracy.value },
            { key: "ci", header: `${levelPct(report.options.level)} CI`, align: "right", render: (c) => ci(c.accuracy.lo, c.accuracy.hi, (x) => pctNum(x)) },
            { key: "t", header: "Tasks", align: "right", render: (c) => c.nTasks, sort: (c) => c.nTasks },
            { key: "cost", header: "$/request", align: "right", render: (c) => <Val v={c.meanCostUsd} fmt={usd} reason="no cost reported" />, sort: (c) => c.meanCostUsd },
            { key: "lat", header: "p50 latency", align: "right", render: (c) => <Val v={c.medianLatencyMs} fmt={ms} reason="no successful calls" />, sort: (c) => c.medianLatencyMs },
          ]}
        />
      )}
      {view === "chart" && cats.length > TOP ? (
        <Button size="xs" variant="ghost" className="mt-2" onClick={() => setShowAll((s) => !s)}>
          {showAll ? `Show top ${TOP}` : `Show all ${cats.length} categories`}
        </Button>
      ) : null}
      <DifficultyCurves />
    </ReportSection>
  );
}

function DifficultyCurves() {
  const { report, arm, level } = useReportCtx();
  const L = levelPct(level);
  const series = useMemo<LineSeries[]>(
    () =>
      report.difficultyCurves
        .filter((c) => c.curve.length > 1)
        .map((c) => {
          const a = arm(c.armId);
          const buckets = report.perArmDifficultyBucket.filter((b) => b.armId === c.armId && b.accuracy.value != null && b.nTasks > 0);
          return {
            key: c.armId,
            label: a.label,
            color: a.color,
            points: c.curve.map((p) => ({ x: p.x, y: p.p })),
            band: c.curve.map((p) => ({ x: p.x, lo: p.lo, hi: p.hi })),
            dots: buckets.map((b) => ({
              x: b.meanDifficulty ?? (b.lo + b.hi) / 2,
              y: b.accuracy.value!,
              lo: b.accuracy.lo,
              hi: b.accuracy.hi,
              label: `${a.label}, difficulty ${b.label}: ${pct(b.accuracy.value)} over ${b.nTasks} tasks`,
              tip: (
                <div>
                  <TipTitle>
                    {a.label} · difficulty {b.label}
                  </TipTitle>
                  <TipRow color={a.color} shape="rect" label={`observed accuracy ${ci(b.accuracy.lo, b.accuracy.hi, (x) => pctNum(x, 0))}`} value={pct(b.accuracy.value)} />
                  <TipNote>
                    {b.nTasks} tasks, {b.nSamples} samples; mean difficulty {num(b.meanDifficulty, 2)}.
                  </TipNote>
                </div>
              ),
            })),
          } satisfies LineSeries;
        }),
    [report, arm],
  );
  const fits = report.difficultyCurves.filter((c) => c.slope != null);
  const flattest = [...fits].sort((a, b) => b.slope! - a.slope!)[0];
  const steepest = [...fits].sort((a, b) => a.slope! - b.slope!)[0];
  if (!series.length) {
    return <p className="mt-6 text-[12px] text-fg-subtle">Difficulty curves need tasks spread across difficulty levels; this run has too few to fit them.</p>;
  }
  return (
    <div className="mt-8 border-t border-border pt-5">
      <h3 className="text-[13px] font-semibold text-fg">Accuracy vs task difficulty</h3>
      <p className="mt-1 mb-3 max-w-3xl text-[12.5px] leading-relaxed text-fg-muted">
        Lines are logistic fits of P(correct) on human-rated difficulty with {L} bands; squares are observed accuracy per difficulty bucket.
        {flattest && steepest && flattest !== steepest ? (
          <>
            {" "}
            {arm(flattest.armId).label} holds up best on hard tasks (slope {num(flattest.slope, 2)}, odds ratio {num(flattest.oddsRatio, 3)} per unit difficulty); {arm(steepest.armId).label} degrades fastest (slope {num(steepest.slope, 2)}, {pEq(steepest.pSlope)}).
          </>
        ) : null}
      </p>
      <LineChart
        series={series}
        ariaLabel="Probability of a correct answer versus task difficulty, per arm"
        description={fits.map((f) => `${arm(f.armId).label}: slope ${num(f.slope, 2)} (${pEq(f.pSlope)})`).join("; ")}
        height={300}
        x={{ domain: [0, 1], format: (v) => v.toFixed(2), label: "Task difficulty (0 = easiest, 1 = hardest)", ticks: [0, 0.25, 0.5, 0.75, 1] }}
        y={{ domain: [0, 1], format: (v) => `${Math.round(v * 100)}%`, label: "P(correct)", ticks: [0, 0.25, 0.5, 0.75, 1] }}
        formatValue={(v) => `${(v * 100).toFixed(1)}%`}
      />
    </div>
  );
}
