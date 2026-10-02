"use client";

import { useMemo, useState } from "react";
import { Legend, StackedBar, TipRow, TipTitle, TipNote, useChartTooltip, ChartTooltip, vizStyles, type Segment } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { IconRefresh } from "@/components/ui/icons";
import { Slider } from "@/components/ui/slider";
import { computeTejScore, DEFAULT_TEJ_WEIGHTS, TEJ_FORMULA } from "@/lib/analysis/tejscore";
import type { TejWeights } from "@/lib/analysis/types";
import { cn } from "@/lib/client/cn";
import { useElementWidth } from "@/components/charts/use-width";
import { ArmLabel, METHOD, Panel, useReportCtx } from "./section";

const KEYS = ["accuracy", "cost", "latency", "reliability"] as const;
type K = (typeof KEYS)[number];
const NAMES: Record<K, string> = { accuracy: "Accuracy", cost: "Low cost", latency: "Speed", reliability: "Reliability" };
const OPACITY: Record<K, number> = { accuracy: 1, cost: 0.7, latency: 0.48, reliability: 0.3 };
const WHY_NULL: Record<K, string> = {
  accuracy: "no samples",
  cost: "no cost reported or estimated for this router; its other parts share the weight",
  latency: "no successful samples with a latency",
  reliability: "no samples",
};

export function WeightedScore() {
  const { report, arm } = useReportCtx();
  const [weights, setWeights] = useState<TejWeights>(DEFAULT_TEJ_WEIGHTS);
  const tej = useMemo(() => computeTejScore(report, weights), [report, weights]);
  const isDefault = KEYS.every((k) => Math.abs(weights[k] - DEFAULT_TEJ_WEIGHTS[k]) < 1e-9);
  const wSum = KEYS.reduce((a, k) => a + weights[k], 0);

  const rows = useMemo(() => {
    return [...tej.rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((r) => {
      const c = r.components;
      const den = KEYS.reduce((a, k) => a + (c[k] != null && weights[k] > 0 ? weights[k] : 0), 0);
      const contrib = KEYS.map((k) => ({ k, s: c[k], v: c[k] != null && den > 0 ? (100 * weights[k] * c[k]!) / den : 0 }));
      return { ...r, contrib };
    });
  }, [tej, weights]);

  const top = rows[0];
  const takeaway = (
    <>
      One 0 to 100 number that blends accuracy, low cost, speed and reliability with weights you choose. Each part is scaled against the routers in this run, so compare scores within this run only.
      {top?.score != null ? (
        <>
          {" "}
          With {isDefault ? "the default" : "your"} weights, <span className="text-fg">{arm(top.armId).label}</span> scores highest ({top.score.toFixed(1)}).
        </>
      ) : null}
    </>
  );

  return (
    <Panel id="weighted" title="Weighted score" takeaway={takeaway} method={METHOD.tejscore}>
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <Leaderboard rows={rows} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">Weights</h3>
            <Button size="sm" variant="ghost" leftIcon={<IconRefresh size={14} />} onClick={() => setWeights(DEFAULT_TEJ_WEIGHTS)} disabled={isDefault}>
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
              format={(v) => `${wSum > 0 ? Math.round((100 * v) / wSum) : 0}%`}
            />
          ))}
          {wSum === 0 ? <p className="text-[13px] text-warning">All weights are zero, so no score can be computed.</p> : null}
          <Disclosure summary="Formula">
            <pre className="rounded-lg border border-border bg-surface-2 p-3 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-fg-muted">{TEJ_FORMULA}</pre>
          </Disclosure>
        </div>
      </div>
    </Panel>
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
        className="mb-4"
        items={KEYS.map((k) => ({ key: k, label: NAMES[k], color: `color-mix(in oklab, var(--fg-muted) ${Math.round(OPACITY[k] * 100)}%, var(--surface))`, shape: "rect" }))}
        label="Score parts"
      />
      <div ref={containerRef} className="relative">
        <ol className="flex flex-col gap-3" aria-label="Weighted score ranking">
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
                    {c.s == null ? `Not available: ${WHY_NULL[c.k]}.` : `${NAMES[c.k]}: ${c.s.toFixed(2)} on a 0 to 1 scale (1 = best router in this run).`}
                  </TipNote>
                </div>
              ),
            }));
            return (
              <li key={r.armId} className={cn("grid items-center gap-x-4 gap-y-1.5", narrow ? "grid-cols-[1fr_auto]" : "grid-cols-[minmax(160px,240px)_1fr_48px]")}>
                <ArmLabel arm={a} className="text-sm text-fg" />
                {narrow ? <span className="num text-right text-[15px] font-semibold text-fg">{r.score != null ? r.score.toFixed(1) : "—"}</span> : null}
                <div className={cn("min-w-0", narrow && "col-span-2")}>
                  {r.score != null ? (
                    <StackedBar segments={segs} total={100} height={20} ariaLabel={`${a.label}: weighted score ${r.score.toFixed(1)}`} bind={bind} labelFormat={(s) => (s.value >= 8 ? s.value.toFixed(0) : "")} />
                  ) : (
                    <span className="text-[13px] text-fg-muted">No score (no answers)</span>
                  )}
                </div>
                {!narrow ? <span className="num text-right text-[15px] font-semibold text-fg">{r.score != null ? r.score.toFixed(1) : "—"}</span> : null}
              </li>
            );
          })}
        </ol>
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>
    </div>
  );
}
