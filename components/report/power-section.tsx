"use client";

import { DataTable, Meter } from "@/components/charts";
import { StatTile } from "@/components/ui/stat";
import { num, pct, pp } from "./format";
import { ArmLabel, METHOD, NA, ReportSection, Val, useReportCtx } from "./section";

export function PowerSection({ index }: { index: number }) {
  const { report, arm } = useReportCtx();
  const P = report.power;
  const need = P.tasksFor5pp.paired ?? P.tasksFor5pp.unpaired;
  const mde = P.mdePaired ?? P.mdeUnpaired;
  const takeaway = (
    <>
      With {P.nTasks} shared tasks, this run can reliably detect accuracy differences of about <span className="num text-fg">{mde != null ? pp(mde).replace("+", "") : "—"}</span> (paired, 80% power,
      α = {num(P.alpha, 2)}).{" "}
      {need != null ? (
        need <= P.nTasks ? (
          <>That is enough to resolve 5 pp differences.</>
        ) : (
          <>
            Resolving 5 pp needs about <span className="num text-fg">{need.toLocaleString("en-US")}</span> tasks ({Math.ceil(need / Math.max(1, P.nTasks))}× this run).
          </>
        )
      ) : null}
    </>
  );
  const dash = "not estimable: needs at least two arms with shared tasks";
  return (
    <ReportSection id="power" index={index} title="Statistical power and reliability" takeaway={takeaway} method={[METHOD.power, METHOD.consistency]}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label="MDE, paired (McNemar)" value={<Val v={P.mdePaired} fmt={(v) => pp(v).replace("+", "")} reason={dash} />} sub={`discordance ${pct(P.discordance, 0)}`} />
        <StatTile label="MDE, unpaired" value={<Val v={P.mdeUnpaired} fmt={(v) => pp(v).replace("+", "")} reason={dash} />} sub={`at baseline accuracy ${pct(P.baselineAccuracy, 0)}`} />
        <StatTile label="MDE on mean score" value={<Val v={P.mdeMeanScore} fmt={(v) => pp(v).replace("+", "")} reason={dash} />} sub="from paired task-level sd" />
        <StatTile
          label="Tasks for 5 pp"
          value={need != null ? need.toLocaleString("en-US") : <NA reason={dash} />}
          sub={`paired ${P.tasksFor5pp.paired?.toLocaleString("en-US") ?? "—"} · unpaired ${P.tasksFor5pp.unpaired?.toLocaleString("en-US") ?? "—"}`}
        />
      </div>
      {need != null ? (
        <div className="mt-4 max-w-xl">
          <div className="mb-1 flex justify-between text-[11.5px] text-fg-muted">
            <span>Tasks in this run vs tasks needed for 5 pp</span>
            <span className="num text-fg">
              {P.nTasks} / {need.toLocaleString("en-US")}
            </span>
          </div>
          <Meter value={Math.min(1, P.nTasks / need)} ariaLabel="Share of the tasks needed to detect a 5 point difference" valueText={`${pct(P.nTasks / need, 0)} of the tasks needed`} tone={P.nTasks >= need ? "accent" : "neutral"} />
        </div>
      ) : null}
      <p className="mt-3 max-w-3xl text-[11.5px] leading-relaxed text-fg-subtle">{P.note}</p>

      <h3 className="mt-6 mb-2 text-xs font-semibold text-fg">Consistency across repetitions</h3>
      <DataTable
        caption="Consistency and reliability per arm"
        rows={report.consistency}
        getKey={(c) => c.armId}
        minWidth={880}
        columns={[
          { key: "arm", header: "Arm", render: (c) => <ArmLabel arm={arm(c.armId)} /> },
          { key: "reps", header: "Reps", align: "right", render: (c) => c.maxReps },
          { key: "agree", header: "Correctness agreement", align: "right", render: (c) => <Val v={c.correctAgreement} fmt={(v) => pct(v)} reason="needs ≥ 2 repetitions" />, sort: (c) => c.correctAgreement },
          { key: "kappa", header: "Fleiss κ", align: "right", render: (c) => <Val v={c.correctKappa} fmt={(v) => num(v, 2)} reason="needs ≥ 2 repetitions and both outcomes" />, sort: (c) => c.correctKappa },
          { key: "ans", header: "Same answer", align: "right", render: (c) => <Val v={c.answerAgreement} fmt={(v) => pct(v)} reason="no extracted answers to compare" /> },
          { key: "route", header: "Same model", align: "right", render: (c) => <Val v={c.routingAgreement} fmt={(v) => pct(v)} reason="served model not reported" />, sort: (c) => c.routingAgreement },
          { key: "icc", header: "ICC", align: "right", render: (c) => <Val v={c.icc} fmt={(v) => num(v, 2)} reason="needs ≥ 2 repetitions" />, sort: (c) => c.icc },
          { key: "within", header: "Within-task var.", align: "right", render: (c) => <Val v={c.fractionWithin} fmt={(v) => pct(v, 0)} reason="needs ≥ 2 repetitions" /> },
          { key: "deff", header: "Design effect", align: "right", render: (c) => <Val v={c.designEffect} fmt={(v) => num(v, 2)} reason="needs ≥ 2 repetitions" />, sort: (c) => c.designEffect },
        ]}
      />
      <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
        Agreement: share of tasks where every repetition agreed. κ corrects agreement for chance. ICC is the share of score variance between tasks (high = repetitions
        agree, the task decides the outcome). The design effect inflates variances for clustered repetitions; 1 means repetitions behave like independent tasks.
      </p>
    </ReportSection>
  );
}
