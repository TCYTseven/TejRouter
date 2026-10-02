"use client";

import { useMemo, useState } from "react";
import { DataTable, IntervalPlot, TipNote, TipRow, TipTitle, type IntervalRow } from "@/components/charts";
import { Toggle } from "@/components/ui/toggle";
import { ci, levelPct, pct, pctNum } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, ViewToggle, useReportCtx } from "./section";

export function AccuracySection({ index }: { index: number }) {
  const { report, arm, level } = useReportCtx();
  const [includeErrors, setIncludeErrors] = useState(true);
  const [view, setView] = useState<"chart" | "table">("chart");
  const L = levelPct(level);
  const anyErrors = report.perArm.some((a) => a.nErrors > 0);

  const rows = useMemo<IntervalRow[]>(() => {
    return report.perArm
      .filter((a) => a.n > 0)
      .map((a) => {
        const v = includeErrors ? a.accuracy.value : a.accuracyOk;
        const lo = includeErrors ? a.accuracy.lo : null;
        const hi = includeErrors ? a.accuracy.hi : null;
        const info = arm(a.armId);
        const ciText = ci(lo, hi, (x) => pctNum(x));
        return {
          key: a.armId,
          label: info.label,
          color: info.color,
          hollowSwatch: info.simulated,
          value: v,
          lo,
          hi,
          secondary: includeErrors ? { value: a.correctRate.value, lo: a.correctRate.lo, hi: a.correctRate.hi } : null,
          valueText: `${pct(v)}${ciText ? ` ${ciText}` : ""}`,
          subText: `errors ${pct(a.errorRate.value)} (${a.nErrors}/${a.n})`,
          tip: (
            <div>
              <TipTitle>{info.label}</TipTitle>
              <TipRow color={info.color} label={includeErrors ? `accuracy, ${L} CI (BCa)` : "accuracy, successful calls only"} value={pct(v)} sub={ciText || undefined} />
              {includeErrors ? <TipRow color={info.color} shape="dot" label={`correct rate, ${L} Wilson`} value={pct(a.correctRate.value)} sub={ci(a.correctRate.lo, a.correctRate.hi, (x) => pctNum(x))} /> : null}
              <TipRow label="error rate" value={pct(a.errorRate.value)} sub={`${a.nErrors}/${a.n}`} shape="none" />
              <TipNote>
                {a.nTasks} tasks × {a.n / Math.max(1, a.nTasks) >= 1.5 ? `${(a.n / a.nTasks).toFixed(1)} reps` : "1 rep"}. Mean score is task-weighted; the interval resamples tasks (cluster bootstrap).
              </TipNote>
            </div>
          ),
        } satisfies IntervalRow;
      })
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  }, [report, includeErrors, arm, L]);

  const nSig = report.pairwise.filter((p) => p.significant).length;
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const takeaway =
    best && worst && best !== worst ? (
      <>
        {best.label} leads at <span className="num text-fg">{pct(best.value)}</span> and {worst.label} trails at{" "}
        <span className="num text-fg">{pct(worst.value)}</span>; {nSig} of {report.pairwise.length} pairwise differences are significant after Holm correction.
      </>
    ) : best ? (
      <>
        {best.label} scored <span className="num text-fg">{pct(best.value)}</span>.
      </>
    ) : (
      "No arm has samples."
    );

  const domain = useMemo<[number, number]>(() => {
    const vals = rows.flatMap((r) => [r.lo, r.hi, r.value, r.secondary?.lo, r.secondary?.hi]).filter((x): x is number => x != null);
    if (!vals.length) return [0, 1];
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 0.02) * 20) / 20);
    const hi = Math.min(1, Math.ceil((Math.max(...vals) + 0.02) * 20) / 20);
    return [lo, hi === lo ? Math.min(1, lo + 0.1) : hi];
  }, [rows]);

  return (
    <ReportSection
      id="accuracy"
      index={index}
      title="Accuracy"
      takeaway={takeaway}
      method={[METHOD.accuracy, METHOD.bootstrap, METHOD.wilson, METHOD.errorRate]}
      actions={
        <>
          <Toggle
            size="sm"
            checked={includeErrors}
            onChange={setIncludeErrors}
            label={<span className="text-[11px]">Count errors as wrong</span>}
          />
          <ViewToggle label="Accuracy view" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />
        </>
      }
    >
      {!includeErrors ? (
        <p className="mb-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-fg-muted">
          Showing mean score over successful calls only. This hides failures{anyErrors ? " (some arms have errors)" : ""} and has no interval; use it to separate
          answer quality from reliability, not to rank arms.
        </p>
      ) : null}
      {view === "chart" ? (
        <IntervalPlot
          rows={rows}
          domain={domain}
          format={(v) => `${Math.round(v * 100)}%`}
          axisLabel={includeErrors ? `Accuracy (mean score, errors = 0) · ${L} CI` : "Accuracy among successful calls"}
          ariaLabel="Accuracy by arm with confidence intervals"
          description={rows.map((r) => `${r.label}: ${r.valueText}`).join("; ")}
          secondaryLabel={includeErrors ? `Binary correct rate, ${L} Wilson interval` : undefined}
        />
      ) : (
        <DataTable
          caption="Accuracy by arm"
          rows={report.perArm.filter((a) => a.n > 0)}
          getKey={(a) => a.armId}
          defaultSort={{ key: "acc", dir: "desc" }}
          minWidth={760}
          columns={[
            { key: "arm", header: "Arm", render: (a) => <ArmLabel arm={arm(a.armId)} /> },
            { key: "acc", header: "Accuracy", align: "right", render: (a) => pct(a.accuracy.value), sort: (a) => a.accuracy.value },
            { key: "ci", header: `${L} CI (BCa)`, align: "right", render: (a) => ci(a.accuracy.lo, a.accuracy.hi, (x) => pctNum(x)) || <Val v={null} fmt={String} reason="too few tasks to bootstrap" /> },
            { key: "ok", header: "Acc. (ok only)", align: "right", render: (a) => <Val v={a.accuracyOk} fmt={(v) => pct(v)} reason="no successful calls" />, sort: (a) => a.accuracyOk },
            { key: "cr", header: "Correct rate", align: "right", render: (a) => pct(a.correctRate.value), sort: (a) => a.correctRate.value },
            { key: "wci", header: `${L} Wilson`, align: "right", render: (a) => ci(a.correctRate.lo, a.correctRate.hi, (x) => pctNum(x)) },
            { key: "err", header: "Errors", align: "right", render: (a) => `${pct(a.errorRate.value)} (${a.nErrors})`, sort: (a) => a.errorRate.value },
            { key: "n", header: "Samples", align: "right", render: (a) => a.n.toLocaleString("en-US"), sort: (a) => a.n },
            { key: "t", header: "Tasks", align: "right", render: (a) => a.nTasks, sort: (a) => a.nTasks },
          ]}
        />
      )}
    </ReportSection>
  );
}
