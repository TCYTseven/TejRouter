"use client";

import { useMemo, useState } from "react";
import { HeatmapTable, LineChart, ScaleLegend, TipNote, TipRow, TipTitle, sequentialFill, sequentialInk, type LineSeries } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { ArmCategoryStats } from "@/lib/analysis/types";
import { levelPct, ms, pct, usd } from "./format";
import { METHOD, Panel, useReportCtx } from "./section";
import { fin } from "./verdicts";

const TOP = 12;

export function TaskTypeTab() {
  return (
    <div className="flex flex-col gap-6">
      <ByCategory />
      <ByDifficulty />
    </div>
  );
}

function ByCategory() {
  const { report, arm, level } = useReportCtx();
  const L = levelPct(level);
  const [sort, setSort] = useState<"tasks" | "spread" | "name">("tasks");
  const [showAll, setShowAll] = useState(false);
  const armIds = report.meta.arms.map((a) => a.id);

  const cells = useMemo(() => {
    const m = new Map<string, ArmCategoryStats>();
    for (const c of report.perArmCategory) m.set(`${c.category}\u0000${c.armId}`, c);
    return m;
  }, [report]);

  const cats = useMemo(() => {
    const list = report.meta.categories.map((c) => {
      const vals = armIds.map((id) => cells.get(`${c.name}\u0000${id}`)?.accuracy.value).filter(fin);
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
  // Color scale spans the observed range (rounded down to 10%) so differences show.
  const floor = useMemo(() => {
    const vals = report.perArmCategory.map((c) => c.accuracy.value).filter(fin);
    return vals.length ? Math.min(0.9, Math.floor(Math.min(...vals) * 10) / 10) : 0;
  }, [report]);
  const t = (v: number) => Math.max(0, (v - floor) / (1 - floor));
  const solid = cats.filter((c) => c.nTasks >= 3);
  const mostSpread = [...solid].sort((a, b) => b.spread - a.spread)[0];
  const hardest = [...solid].filter((c) => c.mean != null).sort((a, b) => a.mean! - b.mean!)[0];
  const takeaway = (
    <>
      {mostSpread && mostSpread.spread > 0 ? (
        <>
          Routers differ most on <span className="text-fg">{mostSpread.name}</span> ({Math.round(mostSpread.spread * 100)} points between best and worst)
        </>
      ) : (
        <>Routers score alike across task types</>
      )}
      {hardest ? (
        <>
          ; <span className="text-fg">{hardest.name}</span> is the hardest type overall ({pct(hardest.mean, 0)} on average).
        </>
      ) : (
        "."
      )}
    </>
  );

  return (
    <Panel
      id="categories"
      title="Accuracy by task type"
      takeaway={takeaway}
      method={METHOD.byCategory}
      actions={
        <Segmented
          label="Sort task types"
          value={sort}
          onChange={setSort}
          options={[
            { value: "tasks", label: "Most tasks" },
            { value: "spread", label: "Biggest gap" },
            { value: "name", label: "A–Z" },
          ]}
        />
      }
    >
      <HeatmapTable
        caption="Accuracy (percent) by task type (rows) and router (columns)"
        rowHeader="Task type"
        rows={shown.map((c) => ({ key: c.name, label: c.name, text: c.name, sub: `${c.nTasks} task${c.nTasks === 1 ? "" : "s"}` }))}
        cols={armIds.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
        cellMinWidth={96}
        rowHeaderWidth={200}
        cell={(cat, id) => {
          const c = cells.get(`${cat}\u0000${id}`);
          const v = c?.accuracy.value ?? null;
          const a = arm(id);
          return {
            value: v,
            display: v == null ? "—" : `${Math.round(v * 100)}%`,
            fill: v == null ? undefined : sequentialFill(t(v)),
            ink: v == null ? undefined : sequentialInk(t(v)),
            ariaLabel: `${cat}, ${a.label}: ${v == null ? "no answers" : pct(v)}`,
            tip: c ? (
              <div>
                <TipTitle>
                  {cat}, {a.label}
                </TipTitle>
                <TipRow color={a.color} shape="rect" label="accuracy" value={pct(v)} />
                <TipRow label="per answer" value={usd(c.meanCostUsd)} shape="none" />
                <TipRow label="typical time" value={ms(c.medianLatencyMs)} shape="none" />
                <TipNote>
                  {c.nTasks} task{c.nTasks === 1 ? "" : "s"}
                  {fin(c.accuracy.lo) && fin(c.accuracy.hi) && c.accuracy.hi - c.accuracy.lo > 1e-9 ? `; likely between ${pct(c.accuracy.lo, 0)} and ${pct(c.accuracy.hi, 0)} (${L})` : ""}. Small task types are noisy.
                </TipNote>
              </div>
            ) : (
              "This router has no answers of this type."
            ),
          };
        }}
        legend={<ScaleLegend label="Accuracy" stops={[sequentialFill(0), sequentialFill(0.5), sequentialFill(1)]} left={`${Math.round(floor * 100)}%`} right="100%" />}
      />
      {cats.length > TOP ? (
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => setShowAll((s) => !s)}>
          {showAll ? `Show the top ${TOP}` : `Show all ${cats.length} task types`}
        </Button>
      ) : null}
    </Panel>
  );
}

function ByDifficulty() {
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
              label: `${a.label}, difficulty ${b.label}: ${pct(b.accuracy.value)} over ${b.nTasks} tasks`,
              tip: (
                <div>
                  <TipTitle>
                    {a.label}, difficulty {b.label}
                  </TipTitle>
                  <TipRow color={a.color} shape="rect" label="accuracy" value={pct(b.accuracy.value)} />
                  <TipNote>{b.nTasks} tasks in this difficulty range.</TipNote>
                </div>
              ),
            })),
          } satisfies LineSeries;
        }),
    [report, arm],
  );
  const ends = report.difficultyCurves
    .filter((c) => c.curve.length > 1)
    .map((c) => ({ id: c.armId, easy: c.curve[0].p, hard: c.curve[c.curve.length - 1].p }));
  const holds = [...ends].sort((a, b) => b.hard - a.hard)[0];
  const drops = [...ends].sort((a, b) => b.easy - b.hard - (a.easy - a.hard))[0];
  const takeaway = !series.length ? (
    "Too few tasks at different difficulty levels to draw these curves."
  ) : holds && drops && holds.id !== drops.id ? (
    <>
      <span className="text-fg">{arm(holds.id).label}</span> holds up best on the hardest tasks ({pct(holds.hard, 0)}); <span className="text-fg">{arm(drops.id).label}</span> drops the most, from{" "}
      {pct(drops.easy, 0)} to {pct(drops.hard, 0)}.
    </>
  ) : holds ? (
    <>
      <span className="text-fg">{arm(holds.id).label}</span> goes from {pct(holds.easy, 0)} on the easiest tasks to {pct(holds.hard, 0)} on the hardest.
    </>
  ) : null;

  return (
    <Panel id="difficulty" title="Accuracy as tasks get harder" takeaway={takeaway} method={METHOD.difficulty}>
      {series.length ? (
        <>
          <LineChart
            series={series}
            ariaLabel="Chance of a correct answer versus task difficulty, per router"
            height={300}
            x={{ domain: [0, 1], format: (v) => (v === 0 ? "Easiest" : v === 1 ? "Hardest" : v.toFixed(1)), label: "Task difficulty", ticks: [0, 0.5, 1] }}
            y={{ domain: [0, 1], format: (v) => `${Math.round(v * 100)}%`, label: "Correct", ticks: [0, 0.5, 1] }}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            crosshairNote={`Fitted chance of a correct answer; the range in brackets is the ${L} interval.`}
          />
          <p className="mt-3 text-[13px] text-fg-muted">Lines are fitted trends with their likely range shaded; squares are measured accuracy in each difficulty range.</p>
        </>
      ) : null}
    </Panel>
  );
}
