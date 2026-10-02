"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DataTable, HeatmapTable, ScaleLegend, StackedBar, TipNote, TipRow, TipTitle, divergingFill, divergingInk } from "@/components/charts";
import { Segmented } from "@/components/ui/segmented";
import type { PairwiseStats } from "@/lib/analysis/types";
import { ci, levelPct, ms, num, pEq, pct, pctNum, pp, pval, usd } from "./format";
import { ArmLabel, METHOD, Panel, Val, useReportCtx } from "./section";
import { pairOf } from "./verdicts";

/** Pairwise stats oriented as row − column. */
interface Oriented {
  a: string;
  b: string;
  raw: PairwiseStats;
  diff: number | null;
  lo: number | null;
  hi: number | null;
  method: string;
  mcB: number;
  mcC: number;
  wins: number;
  ties: number;
  losses: number;
  pAB: number | null;
  cred: { mean: number | null; lo: number | null; hi: number | null };
  latMedian: number | null;
  cliffs: number | null;
  cliffsLo: number | null;
  cliffsHi: number | null;
  costDiff: number | null;
}

const neg = (v: number | null) => (v == null ? null : -v);

function orient(p: PairwiseStats, sign: 1 | -1): Oriented {
  if (sign === 1)
    return {
      a: p.a,
      b: p.b,
      raw: p,
      diff: p.meanDiff.value,
      lo: p.meanDiff.lo,
      hi: p.meanDiff.hi,
      method: p.meanDiff.method,
      mcB: p.mcnemar.b,
      mcC: p.mcnemar.c,
      wins: p.wins,
      ties: p.ties,
      losses: p.losses,
      pAB: p.pAGreaterB,
      cred: p.diffCredible,
      latMedian: p.latency.medianDiffMs,
      cliffs: p.latency.cliffsDelta,
      cliffsLo: p.latency.cliffsLo,
      cliffsHi: p.latency.cliffsHi,
      costDiff: p.meanCostDiffUsd,
    };
  return {
    a: p.b,
    b: p.a,
    raw: p,
    diff: neg(p.meanDiff.value),
    lo: neg(p.meanDiff.hi),
    hi: neg(p.meanDiff.lo),
    method: p.meanDiff.method,
    mcB: p.mcnemar.c,
    mcC: p.mcnemar.b,
    wins: p.losses,
    ties: p.ties,
    losses: p.wins,
    pAB: p.pAGreaterB == null ? null : 1 - p.pAGreaterB,
    cred: { mean: neg(p.diffCredible.mean), lo: neg(p.diffCredible.hi), hi: neg(p.diffCredible.lo) },
    latMedian: neg(p.latency.medianDiffMs),
    cliffs: neg(p.latency.cliffsDelta),
    cliffsLo: neg(p.latency.cliffsHi),
    cliffsHi: neg(p.latency.cliffsLo),
    costDiff: neg(p.meanCostDiffUsd),
  };
}

export function PairwiseSection() {
  const { report, arm, level } = useReportCtx();
  const [view, setView] = useState<"chart" | "table">("chart");
  const L = levelPct(level);
  const ids = report.meta.arms.map((a) => a.id).filter((id) => report.pairwise.some((p) => p.a === id || p.b === id));
  const initial = useMemo(() => {
    const p = [...report.pairwise].sort((x, y) => (x.pAdjusted.mcnemarHolm ?? 1) - (y.pAdjusted.mcnemarHolm ?? 1))[0];
    if (!p) return null;
    const d = p.meanDiff.value ?? 0;
    return d >= 0 ? { row: p.a, col: p.b } : { row: p.b, col: p.a };
  }, [report]);
  const [sel, setSel] = useState<{ row: string; col: string } | null>(initial);
  const maxAbs = Math.max(0.05, ...report.pairwise.map((p) => Math.abs(p.meanDiff.value ?? 0)));
  const sig = report.pairwise.filter((p) => p.significant);
  const selected = sel ? pairOf(report, sel.row, sel.col) : null;

  const takeaway = report.pairwise.length ? (
    <>
      Which accuracy gaps are real, not luck. {sig.length} of {report.pairwise.length} pairs differ clearly (McNemar test on each task, Holm-corrected for testing many pairs, α = {num(report.options.alpha, 2)}).
      Select a cell for every number.
    </>
  ) : (
    "Needs at least two routers that answered the same tasks."
  );

  return (
    <Panel
      id="pairwise"
      title="Pairwise significance"
      takeaway={takeaway}
      method={METHOD.pairwise}
      actions={
        report.pairwise.length ? (
          <Segmented label="Pairwise view" value={view} onChange={setView} options={[{ value: "chart", label: "Matrix" }, { value: "table", label: "Table" }]} />
        ) : undefined
      }
    >
      {!report.pairwise.length ? null : view === "chart" ? (
        <div className="flex flex-col gap-6">
          <HeatmapTable
            caption="Accuracy difference in points, row minus column. A star marks a clear (significant) difference."
            rowHeader="Row minus column"
            rows={ids.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
            cols={ids.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
            rowHeaderWidth={220}
            cellMinWidth={96}
            selected={sel}
            onSelect={(row, col) => setSel({ row, col })}
            cell={(row, col) => {
              if (row === col) return { value: null, display: "", blank: true };
              const pr = pairOf(report, row, col);
              if (!pr) return { value: null, display: "—", tip: "No shared tasks." };
              const o = orient(pr.p, pr.sign);
              const t = (o.diff ?? 0) / maxAbs;
              return {
                value: o.diff,
                display: o.diff == null ? "—" : `${o.diff > 0 ? "+" : o.diff < 0 ? "−" : ""}${Math.abs(o.diff * 100).toFixed(1)}`,
                marker: pr.p.significant ? "*" : undefined,
                fill: divergingFill(t),
                ink: divergingInk(t),
                ariaLabel: `${arm(row).label} minus ${arm(col).label}: ${pp(o.diff)}${pr.p.significant ? ", clear difference" : ", no clear difference"}. Show details.`,
                tip: (
                  <div>
                    <TipTitle>
                      {arm(row).label} minus {arm(col).label}
                    </TipTitle>
                    <TipRow label={`accuracy difference ${ci(o.lo, o.hi, (v) => pctNum(v))}`} value={pp(o.diff)} shape="none" />
                    <TipRow label="Holm-adjusted McNemar p" value={pval(pr.p.pAdjusted.mcnemarHolm)} shape="none" />
                    <TipNote>{pr.p.significant ? "A clear difference." : "Could be chance."} Select for details.</TipNote>
                  </div>
                ),
              };
            }}
            legend={
              <ScaleLegend
                label="Row minus column, points"
                stops={[divergingFill(-1), divergingFill(0), divergingFill(1)]}
                left={`−${(maxAbs * 100).toFixed(0)}`}
                right={`+${(maxAbs * 100).toFixed(0)}`}
                middle="0"
              />
            }
          />
          {selected ? <PairDetail o={orient(selected.p, selected.sign)} /> : null}
        </div>
      ) : (
        <DataTable
          caption="All pairwise comparisons"
          rows={report.pairwise}
          getKey={(p) => `${p.a}|${p.b}`}
          minWidth={1080}
          defaultSort={{ key: "holm", dir: "asc" }}
          columns={[
            { key: "a", header: "A", render: (p) => <ArmLabel arm={arm(p.a)} className="max-w-[200px]" /> },
            { key: "b", header: "B", render: (p) => <ArmLabel arm={arm(p.b)} className="max-w-[200px]" /> },
            { key: "d", header: "A − B", align: "right", render: (p) => pp(p.meanDiff.value), sort: (p) => p.meanDiff.value },
            { key: "ci", header: `${L} CI`, align: "right", render: (p) => ci(p.meanDiff.lo, p.meanDiff.hi, (v) => pctNum(v)) },
            { key: "pe", header: "McNemar p", align: "right", render: (p) => pval(p.mcnemar.pExact), sort: (p) => p.mcnemar.pExact },
            { key: "holm", header: "Holm p", align: "right", render: (p) => pval(p.pAdjusted.mcnemarHolm), sort: (p) => p.pAdjusted.mcnemarHolm },
            { key: "perm", header: "Permutation p", align: "right", render: (p) => pval(p.permutationP), sort: (p) => p.permutationP },
            { key: "pab", header: "P(A > B)", align: "right", render: (p) => pct(p.pAGreaterB, 0), sort: (p) => p.pAGreaterB },
            { key: "wtl", header: "Win / tie / loss", align: "right", render: (p) => `${p.wins} / ${p.ties} / ${p.losses}` },
            { key: "sig", header: "Clear?", render: (p) => (p.significant ? "Yes" : "No") },
          ]}
        />
      )}
    </Panel>
  );
}

function PairDetail({ o }: { o: Oriented }) {
  const { arm, level, report } = useReportCtx();
  const L = levelPct(level);
  const A = arm(o.a);
  const B = arm(o.b);
  const p = o.raw;
  const total = o.wins + o.ties + o.losses;
  return (
    <section aria-label={`${A.label} versus ${B.label}`} className="border-t border-border pt-5" aria-live="polite">
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-fg">
        <ArmLabel arm={A} />
        <span className="font-normal text-fg-muted">vs</span>
        <ArmLabel arm={B} />
      </h3>
      <p className="mt-1 text-[15px] text-fg-muted">
        On {p.nSharedTasks} shared tasks, {A.label} is {pp(o.diff).replace(" pp", " points").replace(/^[+−]/, "")} {o.diff != null && o.diff < 0 ? "behind" : "ahead"} ({L} interval {ci(o.lo, o.hi, (v) => pctNum(v)) || "—"}).{" "}
        {p.significant ? "That is a clear difference, even after correcting for testing every pair." : "That gap could be chance once every pair is tested."}
      </p>

      <div className="mt-4 max-w-2xl">
        <div className="mb-1.5 flex flex-wrap justify-between gap-x-4 text-[13px] text-fg-muted">
          <span>
            {A.label} better on <span className="num text-fg">{o.wins}</span>
          </span>
          <span>
            Tie <span className="num text-fg">{o.ties}</span>
          </span>
          <span>
            {B.label} better on <span className="num text-fg">{o.losses}</span>
          </span>
        </div>
        <StackedBar
          height={12}
          ariaLabel={`Per-task outcomes: ${A.label} better on ${o.wins}, ties ${o.ties}, ${B.label} better on ${o.losses}`}
          segments={[
            { key: "w", label: "wins", value: o.wins, color: A.color },
            { key: "t", label: "ties", value: o.ties, color: "var(--viz-other)" },
            { key: "l", label: "losses", value: o.losses, color: B.color },
          ]}
          total={total || 1}
        />
      </div>

      <div className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">
        <Group title="Accuracy">
          <Row label="Mean difference (A − B)" value={`${pp(o.diff)} ${ci(o.lo, o.hi, (v) => pctNum(v))}`} />
          <Row label="Permutation p" value={pval(p.permutationP)} hint={`Holm ${pval(p.pAdjusted.permutationHolm)}`} />
          <Row label="P(A > B), Bayesian" value={probText(o.pAB)} />
          <Row label="Credible difference" value={`${pp(o.cred.mean)} ${ci(o.cred.lo, o.cred.hi, (v) => pctNum(v))}`} />
        </Group>
        <Group title="McNemar (per-task majority)">
          <Row label="A right, B wrong" value={String(o.mcB)} />
          <Row label="A wrong, B right" value={String(o.mcC)} />
          <Row label="Exact p / mid-p" value={`${pval(p.mcnemar.pExact)} / ${pval(p.mcnemar.pMid)}`} />
          <Row label="Holm / BH adjusted" value={`${pval(p.pAdjusted.mcnemarHolm)} / ${pval(p.pAdjusted.mcnemarBH)}`} />
        </Group>
        <Group title="Response time">
          <Row label="Median paired difference" value={o.latMedian == null ? "—" : `${o.latMedian > 0 ? "+" : ""}${ms(o.latMedian)}`} hint={o.latMedian != null ? (o.latMedian < 0 ? "A faster" : "A slower") : undefined} />
          <Row label="Wilcoxon p" value={pval(p.latency.wilcoxonP)} hint={`Holm ${pval(p.pAdjusted.latencyHolm)}`} />
          <Row label="Cliff's δ" value={`${num(o.cliffs, 2)} ${ci(o.cliffsLo, o.cliffsHi, (v) => num(v, 2))}`} hint={p.latency.magnitude} />
        </Group>
        <Group title="Cost and decision">
          <Row
            label="Cost difference per answer"
            value={o.costDiff == null ? <Val v={null} fmt={usd} reason="cost missing for one of the routers" /> : `${o.costDiff > 0 ? "+" : o.costDiff < 0 ? "−" : ""}${usd(Math.abs(o.costDiff))}`}
          />
          <Row label="McNemar χ² p" value={pval(p.mcnemar.pChiSquare)} />
          <Row label={`Decision at α = ${num(report.options.alpha, 2)}`} value={p.significant ? "Different" : "No evidence"} hint={pEq(p.pAdjusted.mcnemarHolm)} />
        </Group>
      </div>
    </section>
  );
}

function probText(p: number | null): string {
  if (p == null) return "—";
  if (p > 0.999) return "> 99.9%";
  if (p < 0.001) return "< 0.1%";
  return pct(p, 1);
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-fg">{title}</h4>
      <dl>{children}</dl>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-sm last:border-b-0">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="num text-right text-fg">
        {value}
        {hint ? <span className="ml-1.5 text-[13px] text-fg-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}
