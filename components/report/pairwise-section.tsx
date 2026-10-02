"use client";

import { useMemo, useState } from "react";
import { DataTable, HeatmapTable, ScaleLegend, StackedBar, TipNote, TipRow, TipTitle, divergingFill, divergingInk } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import type { PairwiseStats } from "@/lib/analysis/types";
import { ci, levelPct, ms, num, pEq, pct, pctNum, pp, pval, usd } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, useReportCtx } from "./section";
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

export function PairwiseSection({ index }: { index: number }) {
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
      {sig.length} of {report.pairwise.length} pairs differ significantly in accuracy after Holm correction (McNemar on per-task majority correctness, α ={" "}
      {num(report.options.alpha, 2)})
      {sig.length ? (
        <>
          :{" "}
          {sig
            .map((p) => {
              const [w, l] = (p.meanDiff.value ?? 0) >= 0 ? [p.a, p.b] : [p.b, p.a];
              return `${arm(w).label} > ${arm(l).label}`;
            })
            .join("; ")}
        </>
      ) : null}
      . Click a cell for every statistic.
    </>
  ) : (
    "Pairwise comparisons need at least two arms with shared tasks."
  );

  return (
    <ReportSection
      id="pairwise"
      index={index}
      title="Pairwise comparisons"
      takeaway={takeaway}
      method={[METHOD.pairwise, METHOD.mcnemar, METHOD.multiple, METHOD.effect]}
      actions={report.pairwise.length ? <Segmented size="xs" label="Pairwise view" value={view} onChange={setView} options={[{ value: "chart", label: "Matrix" }, { value: "table", label: "Table" }]} /> : undefined}
    >
      {!report.pairwise.length ? null : view === "chart" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <HeatmapTable
              caption={`Mean accuracy difference, row minus column, in percentage points. * = significant after Holm correction.`}
              rowHeader="Row − column"
              rows={ids.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
              cols={ids.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
              rowHeaderWidth={170}
              cellMinWidth={72}
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
                  ariaLabel: `${arm(row).label} minus ${arm(col).label}: ${pp(o.diff)}${pr.p.significant ? ", significant" : ", not significant"}. Open details.`,
                  tip: (
                    <div>
                      <TipTitle>
                        {arm(row).label} − {arm(col).label}
                      </TipTitle>
                      <TipRow label={`accuracy difference ${ci(o.lo, o.hi, (v) => pctNum(v))}`} value={pp(o.diff)} shape="none" />
                      <TipRow label="Holm-adjusted McNemar" value={pval(pr.p.pAdjusted.mcnemarHolm)} shape="none" />
                      <TipNote>{pr.p.significant ? "Significant after Holm correction." : "Not significant after Holm correction."} Click for details.</TipNote>
                    </div>
                  ),
                };
              }}
              legend={
                <div className="flex flex-col gap-1">
                  <ScaleLegend label="Row − column (pp)" stops={[divergingFill(-1), divergingFill(0), divergingFill(1)]} left={`−${(maxAbs * 100).toFixed(0)}`} right={`+${(maxAbs * 100).toFixed(0)}`} middle="0" />
                  <span className="text-[11px] text-fg-subtle">Blue: row arm more accurate. Red: row arm less accurate. * significant after Holm correction.</span>
                </div>
              }
            />
          </div>
          <div className="min-w-0">{selected ? <PairDetail o={orient(selected.p, selected.sign)} /> : <p className="text-[12px] text-fg-subtle">Select a cell to see the full comparison.</p>}</div>
        </div>
      ) : (
        <DataTable
          caption="All pairwise comparisons"
          rows={report.pairwise}
          getKey={(p) => `${p.a}|${p.b}`}
          minWidth={1080}
          defaultSort={{ key: "holm", dir: "asc" }}
          columns={[
            { key: "a", header: "A", render: (p) => <ArmLabel arm={arm(p.a)} className="max-w-[180px]" /> },
            { key: "b", header: "B", render: (p) => <ArmLabel arm={arm(p.b)} className="max-w-[180px]" /> },
            { key: "d", header: "A − B", align: "right", render: (p) => pp(p.meanDiff.value), sort: (p) => p.meanDiff.value },
            { key: "ci", header: `${L} CI`, align: "right", render: (p) => ci(p.meanDiff.lo, p.meanDiff.hi, (v) => pctNum(v)) },
            { key: "bc", header: "b / c", align: "right", render: (p) => `${p.mcnemar.b} / ${p.mcnemar.c}` },
            { key: "pe", header: "McNemar p", align: "right", render: (p) => pval(p.mcnemar.pExact), sort: (p) => p.mcnemar.pExact },
            { key: "holm", header: "Holm p", align: "right", render: (p) => pval(p.pAdjusted.mcnemarHolm), sort: (p) => p.pAdjusted.mcnemarHolm },
            { key: "perm", header: "Perm. p", align: "right", render: (p) => pval(p.permutationP), sort: (p) => p.permutationP },
            { key: "pab", header: "P(A>B)", align: "right", render: (p) => pct(p.pAGreaterB, 0), sort: (p) => p.pAGreaterB },
            { key: "wtl", header: "W / T / L", align: "right", render: (p) => `${p.wins} / ${p.ties} / ${p.losses}` },
            { key: "lat", header: "Latency Holm p", align: "right", render: (p) => pval(p.pAdjusted.latencyHolm), sort: (p) => p.pAdjusted.latencyHolm },
            { key: "sig", header: "Sig.", align: "center", render: (p) => (p.significant ? "yes" : "no") },
          ]}
        />
      )}
    </ReportSection>
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
    <section aria-label={`${A.label} versus ${B.label}`} className="rounded-md border border-border bg-surface-2/40 p-3.5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-fg">
        <ArmLabel arm={A} />
        <span className="text-fg-subtle">vs</span>
        <ArmLabel arm={B} />
        <Badge tone={p.significant ? "accent" : "neutral"} className="ml-auto">
          {p.significant ? "significant (Holm)" : "not significant"}
        </Badge>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
        On {p.nSharedTasks} shared tasks, {A.label} is <span className="num text-fg">{pp(o.diff)}</span> {o.diff != null && o.diff < 0 ? "behind" : "ahead"} ({L} CI {ci(o.lo, o.hi, (v) => pctNum(v)) || "—"}).{" "}
        {p.significant ? "The difference survives Holm correction across all pairs." : "That difference is within what chance could produce once every pair is tested."}
      </p>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-fg-subtle">
          <span>
            {A.label} better on <span className="num text-fg">{o.wins}</span>
          </span>
          <span>
            tie <span className="num text-fg">{o.ties}</span>
          </span>
          <span>
            {B.label} better on <span className="num text-fg">{o.losses}</span>
          </span>
        </div>
        <StackedBar
          height={12}
          ariaLabel={`Per-task outcomes: ${o.wins} wins, ${o.ties} ties, ${o.losses} losses for ${A.label}`}
          segments={[
            { key: "w", label: "wins", value: o.wins, color: A.color },
            { key: "t", label: "ties", value: o.ties, color: "var(--viz-other)" },
            { key: "l", label: "losses", value: o.losses, color: B.color },
          ]}
          total={total || 1}
        />
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Group title="Accuracy">
          <Row label="Mean diff (A − B)" value={`${pp(o.diff)} ${ci(o.lo, o.hi, (v) => pctNum(v))}`} hint={o.method} />
          <Row label="Permutation p" value={pval(p.permutationP)} hint={`Holm ${pval(p.pAdjusted.permutationHolm)}`} />
          <Row label="P(A > B), Bayesian" value={pct(o.pAB, 1)} />
          <Row label="Credible diff" value={`${pp(o.cred.mean)} ${ci(o.cred.lo, o.cred.hi, (v) => pctNum(v))}`} />
        </Group>
        <Group title="McNemar (per-task majority)">
          <Row label="b: A right, B wrong" value={String(o.mcB)} />
          <Row label="c: A wrong, B right" value={String(o.mcC)} />
          <Row label="Exact p / mid-p" value={`${pval(p.mcnemar.pExact)} / ${pval(p.mcnemar.pMid)}`} />
          <Row label="Holm / BH adjusted" value={`${pval(p.pAdjusted.mcnemarHolm)} / ${pval(p.pAdjusted.mcnemarBH)}`} />
        </Group>
        <Group title="Latency">
          <Row label="Median paired diff" value={o.latMedian == null ? "—" : `${o.latMedian > 0 ? "+" : ""}${ms(o.latMedian)}`} hint={o.latMedian != null ? (o.latMedian < 0 ? "A faster" : "A slower") : undefined} />
          <Row label="Wilcoxon p" value={pval(p.latency.wilcoxonP)} hint={`Holm ${pval(p.pAdjusted.latencyHolm)}`} />
          <Row label="Cliff's δ" value={`${num(o.cliffs, 2)} ${ci(o.cliffsLo, o.cliffsHi, (v) => num(v, 2))}`} hint={p.latency.magnitude} />
          <Row label="Paired tasks" value={String(p.latency.nPairs)} />
        </Group>
        <Group title="Cost">
          <Row
            label="Mean cost diff / request"
            value={o.costDiff == null ? <Val v={null} fmt={usd} reason="cost missing for one of the arms" /> : `${o.costDiff > 0 ? "+" : o.costDiff < 0 ? "−" : ""}${usd(Math.abs(o.costDiff))}`}
            hint={o.costDiff != null ? (o.costDiff < 0 ? "A cheaper" : o.costDiff > 0 ? "A dearer" : "same") : undefined}
          />
          <Row label="Significance level" value={`α = ${num(report.options.alpha, 2)}`} />
          <Row label="Decision rule" value="Holm McNemar" />
          <Row label="Accuracy test" value={pEq(p.pAdjusted.mcnemarHolm)} />
        </Group>
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="eyebrow mb-1">{title}</h4>
      <dl>{children}</dl>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 text-[11.5px]">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="num text-right text-fg">
        {value}
        {hint ? <span className="ml-1.5 text-[10.5px] text-fg-subtle">{hint}</span> : null}
      </dd>
    </div>
  );
}
