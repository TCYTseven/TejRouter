"use client";

import { useMemo, useState } from "react";
import { DataTable, Legend, StackedBar, TipRow, TipTitle, TipNote, useChartTooltip, ChartTooltip, vizStyles, type Segment } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { IconRefresh } from "@/components/ui/icons";
import { Slider } from "@/components/ui/slider";
import { computeTejScore, DEFAULT_TEJ_WEIGHTS, TEJ_FORMULA } from "@/lib/analysis/tejscore";
import type { TejWeights } from "@/lib/analysis/types";
import { cn } from "@/lib/client/cn";
import { useElementWidth } from "@/components/charts/use-width";
import { ms, num, pct, usd } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, ViewToggle, useReportCtx } from "./section";

const KEYS = ["accuracy", "cost", "latency", "reliability"] as const;
type K = (typeof KEYS)[number];
const NAMES: Record<K, string> = { accuracy: "Accuracy", cost: "Cost", latency: "Latency", reliability: "Reliability" };
const OPACITY: Record<K, number> = { accuracy: 1, cost: 0.7, latency: 0.48, reliability: 0.3 };
const WHY_NULL: Record<K, string> = {
  accuracy: "no samples",
  cost: "no cost reported or estimated for this arm; weight renormalized over the other components",
  latency: "no successful samples with a latency",
  reliability: "no samples",
};

export function TejScoreSection({ index }: { index: number }) {
  const { report, arm } = useReportCtx();
  const [weights, setWeights] = useState<TejWeights>(DEFAULT_TEJ_WEIGHTS);
  const [view, setView] = useState<"chart" | "table">("chart");
  const tej = useMemo(() => computeTejScore(report, weights), [report, weights]);
  const isDefault = KEYS.every((k) => Math.abs(weights[k] - DEFAULT_TEJ_WEIGHTS[k]) < 1e-9);
  const wSum = KEYS.reduce((a, k) => a + weights[k], 0);
  const perArm = useMemo(() => new Map(report.perArm.map((a) => [a.armId, a])), [report]);

  const rows = useMemo(() => {
    return [...tej.rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((r) => {
      const c = r.components;
      const den = KEYS.reduce((a, k) => a + (c[k] != null && weights[k] > 0 ? weights[k] : 0), 0);
      const contrib = KEYS.map((k) => ({ k, s: c[k], v: c[k] != null && den > 0 ? (100 * weights[k] * c[k]!) / den : 0 }));
      return { ...r, contrib };
    });
  }, [tej, weights]);

  const top = rows[0];
  const takeaway = top?.score != null ? (
    <>
      <strong className="font-medium text-fg">{arm(top.armId).label}</strong> ranks first with a TejScore of{" "}
      <span className="num text-fg">{top.score.toFixed(1)}</span> under {isDefault ? "the default weights" : "your weights"}
      {rows[1]?.score != null ? (
        <>
          , {(top.score - rows[1].score).toFixed(1)} points ahead of {arm(rows[1].armId).label}
        </>
      ) : null}
      . Scores are relative to the arms in this run.
    </>
  ) : (
    "TejScore is not defined for any arm in this run."
  );

  return (
    <ReportSection
      id="tejscore"
      index={index}
      title="TejScore leaderboard"
      takeaway={takeaway}
      method={[METHOD.tejscore]}
      actions={<ViewToggle label="TejScore view" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {view === "chart" ? <Leaderboard rows={rows} /> : <TejTable rows={rows} perArm={perArm} />}
          <p className="mt-3 text-[11.5px] leading-relaxed text-fg-subtle">
            Each bar is split into the weighted contribution of each component (0–100 total). Accuracy, cost and latency are
            min-max normalized across the arms in this run, so adding or removing an arm can move every score: compare
            arms within this run only.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-2/50 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-fg">Weights</h3>
            <Button size="xs" variant="ghost" leftIcon={<IconRefresh size={12} />} onClick={() => setWeights(DEFAULT_TEJ_WEIGHTS)} disabled={isDefault}>
              Reset
            </Button>
          </div>
          {KEYS.map((k) => (
            <Slider
              key={k}
              id={`tej-w-${k}`}
              label={NAMES[k]}
              min={0}
              max={1}
              step={0.05}
              value={weights[k]}
              onChange={(v) => setWeights((w) => ({ ...w, [k]: v }))}
              format={(v) => `${v.toFixed(2)} · ${wSum > 0 ? Math.round((100 * v) / wSum) : 0}%`}
            />
          ))}
          {wSum === 0 ? <p className="text-[11px] text-warning">All weights are zero: no score can be computed.</p> : null}
          <Disclosure summary="Formula">
            <p className="num rounded-md border border-border bg-surface p-2 text-[10.5px] leading-relaxed break-words text-fg-muted">{TEJ_FORMULA}</p>
          </Disclosure>
        </div>
      </div>
    </ReportSection>
  );
}

type Row = { armId: string; score: number | null; rank: number | null; contrib: { k: K; s: number | null; v: number }[] };

function Leaderboard({ rows }: { rows: Row[] }) {
  const { arm } = useReportCtx();
  const { containerRef, tip, bind } = useChartTooltip();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 520;
  return (
    <div ref={ref} className={cn(vizStyles.viz)}>
      <Legend
        className="mb-3"
        items={KEYS.map((k) => ({ key: k, label: NAMES[k], color: `color-mix(in oklab, var(--fg-muted) ${Math.round(OPACITY[k] * 100)}%, var(--surface))`, shape: "rect" }))}
        label="Score components"
      />
      <div ref={containerRef} className="relative">
        <ol className="flex flex-col gap-2.5" aria-label="TejScore ranking">
          {rows.map((r) => {
            const a = arm(r.armId);
            const segs: Segment[] = r.contrib.map((c) => ({
              key: c.k,
              label: NAMES[c.k],
              value: c.v,
              color: OPACITY[c.k] >= 1 ? a.color : `color-mix(in oklab, ${a.color} ${Math.round(OPACITY[c.k] * 100)}%, var(--surface))`,
              ink: OPACITY[c.k] >= 1 ? "#fff" : "var(--fg)",
              tip: (
                <div>
                  <TipTitle>{a.label}</TipTitle>
                  <TipRow color={a.color} shape="rect" label={`${NAMES[c.k]} contribution`} value={c.v.toFixed(1)} />
                  <TipNote>
                    {c.s == null ? `Component undefined: ${WHY_NULL[c.k]}.` : `Normalized ${NAMES[c.k].toLowerCase()} score ${c.s.toFixed(2)} (1 = best arm in this run).`}
                  </TipNote>
                </div>
              ),
            }));
            return (
              <li key={r.armId} className={cn("grid items-center gap-x-3 gap-y-1", narrow ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[24px_minmax(140px,220px)_1fr_48px]")}>
                <span className="num text-[11px] text-fg-subtle">{r.rank != null ? `#${r.rank}` : "—"}</span>
                <ArmLabel arm={a} className="text-[12.5px] text-fg" />
                {narrow ? <span className="num text-right text-[13px] font-semibold text-fg">{r.score != null ? r.score.toFixed(1) : "—"}</span> : null}
                <div className={cn("min-w-0", narrow && "col-span-3")}>
                  {r.score != null ? (
                    <StackedBar segments={segs} total={100} height={16} ariaLabel={`${a.label}: TejScore ${r.score.toFixed(1)}`} bind={bind} labelFormat={(s) => (s.value >= 6 ? s.value.toFixed(0) : "")} />
                  ) : (
                    <span className="text-[11px] text-fg-subtle">Not defined (no samples)</span>
                  )}
                </div>
                {!narrow ? <span className="num text-right text-[13px] font-semibold text-fg">{r.score != null ? r.score.toFixed(1) : "—"}</span> : null}
              </li>
            );
          })}
        </ol>
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>
    </div>
  );
}

function TejTable({ rows, perArm }: { rows: Row[]; perArm: Map<string, import("@/lib/analysis/types").ArmStats> }) {
  const { arm } = useReportCtx();
  return (
    <DataTable
      caption="TejScore components per arm"
      rows={rows}
      getKey={(r) => r.armId}
      minWidth={640}
      columns={[
        { key: "rank", header: "#", render: (r) => <span className="num">{r.rank ?? "—"}</span>, sort: (r) => r.rank },
        { key: "arm", header: "Arm", render: (r) => <ArmLabel arm={arm(r.armId)} /> },
        { key: "score", header: "Score", align: "right", render: (r) => <Val v={r.score} fmt={(v) => v.toFixed(1)} reason="no samples" />, sort: (r) => r.score },
        ...KEYS.map((k) => ({
          key: k,
          header: `s ${NAMES[k].toLowerCase()}`,
          align: "right" as const,
          render: (r: Row) => <Val v={r.contrib.find((c) => c.k === k)?.s} fmt={(v) => num(v, 2)} reason={WHY_NULL[k]} />,
          sort: (r: Row) => r.contrib.find((c) => c.k === k)?.s ?? null,
        })),
        { key: "acc", header: "Accuracy", align: "right", render: (r) => pct(perArm.get(r.armId)?.accuracy.value) },
        { key: "cost", header: "$/request", align: "right", render: (r) => <Val v={perArm.get(r.armId)?.cost.meanUsd} fmt={usd} reason="no cost reported" /> },
        { key: "lat", header: "p50 latency", align: "right", render: (r) => ms(perArm.get(r.armId)?.latency.p50) },
      ]}
    />
  );
}
