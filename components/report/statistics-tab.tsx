"use client";

import { useState, type ReactNode } from "react";
import { DataTable, Meter } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import type { RoutingStats } from "@/lib/analysis/types";
import { formatTps } from "@/lib/client/format";
import type { AnalysisResult } from "@/lib/client/report";
import { ci, levelPct, ms, num, pEq, pct, pctNum, pp, pval, usd } from "./format";
import { PairwiseSection } from "./pairwise-section";
import { RatingsSection } from "./ratings-section";
import { ArmLabel, METHOD, Panel, Term, Val, useReportCtx } from "./section";
import type { AnalysisSettings } from "./use-run-report";
import { WeightedScore } from "./weighted-score";

/** Everything for the expert, each block with a one-line plain explanation. */
export function StatisticsTab({
  result,
  settings,
  analyzing,
  onReanalyze,
}: {
  result: AnalysisResult;
  settings: AnalysisSettings;
  analyzing: boolean;
  onReanalyze: (s: AnalysisSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AnalysisSettingsPanel result={result} settings={settings} analyzing={analyzing} onReanalyze={onReanalyze} />
      <PairwiseSection />
      <Details />
      <WeightedScore />
      <RatingsSection />
      <Power />
      <Consistency />
    </div>
  );
}

// ---------------------------------------------------------------- analysis settings

const ITERS = [200, 400, 1000, 2000, 5000];

function AnalysisSettingsPanel({
  result,
  settings,
  analyzing,
  onReanalyze,
}: {
  result: AnalysisResult;
  settings: AnalysisSettings;
  analyzing: boolean;
  onReanalyze: (s: AnalysisSettings) => void;
}) {
  const { report } = useReportCtx();
  const o = report.options;
  const [draft, setDraft] = useState<{ iters: number; level: "0.9" | "0.95" | "0.99"; seed: string }>({
    iters: settings.bootstrapIterations,
    level: String(settings.level) as "0.9" | "0.95" | "0.99",
    seed: settings.seed == null ? "" : String(settings.seed),
  });
  const seedNum = draft.seed.trim() === "" ? null : Number(draft.seed);
  const seedInvalid = seedNum != null && (!Number.isInteger(seedNum) || seedNum < 0);
  return (
    <Panel
      id="settings"
      title="Analysis settings"
      takeaway={
        <>
          Every range on this page is a {levelPct(o.level)} interval from {o.bootstrapIterations.toLocaleString("en-US")} bootstrap resamples of the tasks (seed {o.seed}). Change them and re-run the
          statistics; your data does not change.
        </>
      }
      method={METHOD.bootstrap}
    >
      <form
        className="flex flex-wrap items-end gap-4"
        aria-label="Analysis settings"
        onSubmit={(e) => {
          e.preventDefault();
          if (seedInvalid) return;
          onReanalyze({ bootstrapIterations: draft.iters, level: Number(draft.level), seed: seedNum });
        }}
      >
        <label className="flex w-40 flex-col gap-1.5 text-[13px] text-fg-muted">
          Bootstrap resamples
          <Select value={String(draft.iters)} onChange={(e) => setDraft((d) => ({ ...d, iters: Number(e.target.value) }))}>
            {ITERS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString("en-US")}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
          <span>Confidence level</span>
          <Segmented
            label="Confidence level"
            value={draft.level}
            onChange={(v) => setDraft((d) => ({ ...d, level: v }))}
            options={[
              { value: "0.9", label: "90%" },
              { value: "0.95", label: "95%" },
              { value: "0.99", label: "99%" },
            ]}
          />
        </div>
        <label className="flex w-32 flex-col gap-1.5 text-[13px] text-fg-muted">
          Random seed
          <Input
            inputMode="numeric"
            placeholder={String(o.seed)}
            value={draft.seed}
            aria-invalid={seedInvalid || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, seed: e.target.value }))}
          />
        </label>
        <Button type="submit" variant="secondary" loading={analyzing} disabled={seedInvalid}>
          Re-analyze
        </Button>
        <span className="num pb-2 text-[13px] text-fg-muted">
          Last run took {Math.round(result.ms).toLocaleString("en-US")} ms{result.engine === "main-thread" ? " on the main thread" : ""}
        </span>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------- detailed numbers

type DetailView = "accuracy" | "speed" | "cost" | "routing";

function Details() {
  const { report, arm, level } = useReportCtx();
  const [view, setView] = useState<DetailView>("accuracy");
  const L = levelPct(level);
  const arms = report.perArm.filter((a) => a.n > 0);
  const gain = new Map(report.costQuality.gainOverBaselineHull.map((g) => [g.armId, g.gain]));
  const cq = new Map(report.costQuality.points.map((p) => [p.armId, p]));
  const routerCol = { key: "arm", header: "Router", render: (a: { armId: string }) => <ArmLabel arm={arm(a.armId)} className="max-w-[240px]" /> };
  const explain: Record<DetailView, ReactNode> = {
    accuracy: (
      <>
        Accuracy is the task-weighted mean score with failed calls scored 0; its interval is a cluster bootstrap (BCa) over tasks. The correct rate counts answers marked correct, with a
        Wilson interval.
      </>
    ),
    speed: <>Medians with bootstrap intervals; first token is the wait before the answer starts streaming; p90 and p99 are the times 90% and 99% of answers beat.</>,
    cost: (
      <>
        The frontier is the set of routers no other router beats on both cost and accuracy. AIQ is the area under the cost-accuracy curve ({report.costQuality.aiq != null ? report.costQuality.aiq.toFixed(3) : "not available"} for
        this run).
      </>
    ),
    routing: <>Escalation is picking a pricier model. The slope says how strongly that follows difficulty; NMI and JSD measure how much the model choice depends on task type and difficulty.</>,
  };

  return (
    <Panel
      id="details"
      title="Detailed numbers"
      takeaway={explain[view]}
      actions={
        <Segmented
          label="Detail table"
          value={view}
          onChange={setView}
          options={[
            { value: "accuracy", label: "Accuracy" },
            { value: "speed", label: "Speed" },
            { value: "cost", label: "Cost" },
            { value: "routing", label: "Routing" },
          ]}
        />
      }
    >
      {view === "accuracy" ? (
        <DataTable
          caption="Accuracy by router"
          rows={arms}
          getKey={(a) => a.armId}
          defaultSort={{ key: "acc", dir: "desc" }}
          minWidth={860}
          columns={[
            routerCol,
            { key: "acc", header: "Accuracy", align: "right", render: (a) => pct(a.accuracy.value), sort: (a) => a.accuracy.value },
            { key: "ci", header: `${L} interval`, align: "right", render: (a) => ci(a.accuracy.lo, a.accuracy.hi, (x) => pctNum(x)) || <Val v={null} fmt={String} reason="too few tasks to bootstrap" /> },
            { key: "ok", header: "Successful calls only", align: "right", render: (a) => <Val v={a.accuracyOk} fmt={(v) => pct(v)} reason="no successful calls" />, sort: (a) => a.accuracyOk },
            { key: "cr", header: "Correct rate", align: "right", render: (a) => pct(a.correctRate.value), sort: (a) => a.correctRate.value },
            { key: "wci", header: `Wilson ${L}`, align: "right", render: (a) => ci(a.correctRate.lo, a.correctRate.hi, (x) => pctNum(x)) },
            { key: "err", header: "Failed calls", align: "right", render: (a) => `${pct(a.errorRate.value)} (${a.nErrors})`, sort: (a) => a.errorRate.value },
            { key: "n", header: "Answers", align: "right", render: (a) => a.n.toLocaleString("en-US"), sort: (a) => a.n },
          ]}
        />
      ) : view === "speed" ? (
        <DataTable
          caption="Response time by router"
          rows={arms}
          getKey={(a) => a.armId}
          defaultSort={{ key: "lat", dir: "asc" }}
          minWidth={900}
          columns={[
            routerCol,
            { key: "lat", header: "Median", align: "right", render: (a) => <Val v={a.latency.p50} fmt={ms} reason="no successful calls" />, sort: (a) => a.latency.p50 },
            { key: "latci", header: `${L} interval`, align: "right", render: (a) => ci(a.latencyMedianCI.lo, a.latencyMedianCI.hi, ms) },
            { key: "p90", header: "p90", align: "right", render: (a) => ms(a.latency.p90), sort: (a) => a.latency.p90 },
            { key: "p99", header: "p99", align: "right", render: (a) => ms(a.latency.p99), sort: (a) => a.latency.p99 },
            { key: "ttft", header: "First token", align: "right", render: (a) => <Val v={a.ttft.p50} fmt={ms} reason="no first-token timing" />, sort: (a) => a.ttft.p50 },
            { key: "tps", header: "Output speed", align: "right", render: (a) => <Val v={a.outputTps.p50} fmt={formatTps} reason="not measured" />, sort: (a) => a.outputTps.p50 },
          ]}
        />
      ) : view === "cost" ? (
        <DataTable
          caption="Cost by router"
          rows={arms}
          getKey={(a) => a.armId}
          defaultSort={{ key: "c", dir: "asc" }}
          minWidth={900}
          columns={[
            routerCol,
            { key: "c", header: "Per answer", align: "right", render: (a) => <Val v={a.cost.meanUsd} fmt={usd} reason="no cost reported" />, sort: (a) => a.cost.meanUsd },
            { key: "cci", header: `${L} interval`, align: "right", render: (a) => ci(a.cost.meanUsdCI.lo, a.cost.meanUsdCI.hi, usd) },
            { key: "cpc", header: "Per correct answer", align: "right", render: (a) => <Val v={a.cost.costPerCorrect} fmt={usd} reason="no cost or no correct answers" />, sort: (a) => a.cost.costPerCorrect },
            { key: "tot", header: "Total", align: "right", render: (a) => <Val v={a.cost.totalUsd} fmt={usd} reason="no cost reported" />, sort: (a) => a.cost.totalUsd },
            { key: "f", header: "On frontier", render: (a) => (cq.get(a.armId)?.onFrontier ? "Yes" : "No") },
            {
              key: "g",
              header: "vs single-model curve",
              align: "right",
              render: (a) => <Val v={gain.get(a.armId)} fmt={(v) => pp(v)} reason="only computed for routers inside the single-model routers' cost range" />,
            },
          ]}
        />
      ) : (
        <RoutingTable />
      )}
    </Panel>
  );
}

function RoutingTable() {
  const { report, arm, level } = useReportCtx();
  const L = levelPct(level);
  const routers = report.routing.filter((r) => r.kind === "router");
  if (!routers.length) return <p className="text-sm text-fg-muted">No router in this run picks between models.</p>;
  const why = (r: RoutingStats) => r.escalationReason ?? "not estimable";
  return (
    <DataTable
      caption="Routing statistics"
      rows={routers}
      getKey={(r) => r.armId}
      minWidth={980}
      columns={[
        { key: "arm", header: "Router", render: (r) => <ArmLabel arm={arm(r.armId)} className="max-w-[240px]" /> },
        { key: "m", header: "Models", align: "right", render: (r) => (r.nWithModel ? r.distinctModels : <Val v={null} fmt={String} reason="did not report models" />), sort: (r) => r.distinctModels },
        { key: "esc", header: "Escalated", align: "right", render: (r) => <Val v={r.escalation?.rate} fmt={(v) => pct(v)} reason={why(r)} />, sort: (r) => r.escalation?.rate ?? null },
        {
          key: "slope",
          header: `Slope (${L})`,
          align: "right",
          render: (r) => (
            <span>
              <Val v={r.escalation?.slope} fmt={(v) => num(v, 2)} reason={why(r)} />
              {r.escalation?.slopeLo != null && r.escalation.slopeHi != null ? <span className="ml-1 text-fg-muted">{ci(r.escalation.slopeLo, r.escalation.slopeHi, (v) => num(v, 1))}</span> : null}
            </span>
          ),
          sort: (r) => r.escalation?.slope ?? null,
        },
        { key: "p", header: "Slope p", align: "right", render: (r) => <Val v={r.escalation?.pSlope} fmt={pval} reason={why(r)} />, sort: (r) => r.escalation?.pSlope ?? null },
        { key: "nmic", header: "NMI, task type", align: "right", render: (r) => (r.categoryMI ? `${num(r.categoryMI.nmi, 3)} (${pEq(r.categoryMI.pValue)})` : <Val v={null} fmt={String} reason="no models reported" />) },
        { key: "jsd", header: "Easy vs hard JSD", align: "right", render: (r) => <Val v={r.easyHardJsd?.value} fmt={(v) => num(v, 3)} reason="needs answers at two difficulty levels" /> },
        { key: "h", header: "Entropy", align: "right", render: (r) => <Val v={r.entropyBits} fmt={(v) => `${num(v, 2)} bits`} reason="no models reported" /> },
      ]}
    />
  );
}

// ---------------------------------------------------------------- power

function Power() {
  const { report } = useReportCtx();
  const P = report.power;
  const need = P.tasksFor5pp.paired ?? P.tasksFor5pp.unpaired;
  const mde = P.mdePaired ?? P.mdeUnpaired;
  const points = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)} points`);
  const takeaway =
    mde != null ? (
      <>
        With {P.nTasks} shared tasks, this run can reliably spot accuracy gaps of about {Math.round(mde * 100)} points or more.{" "}
        {need != null ? (need <= P.nTasks ? "That is enough to spot a 5-point gap." : `To spot a 5-point gap you would need about ${need.toLocaleString("en-US")} tasks (${Math.ceil(need / Math.max(1, P.nTasks))}× this run).`) : null}
      </>
    ) : (
      "Needs at least two routers that answered the same tasks."
    );
  return (
    <Panel id="power" title="How many tasks you'd need" takeaway={takeaway} method={METHOD.power}>
      {need != null ? (
        <div className="max-w-xl">
          <div className="mb-1.5 flex justify-between text-[13px] text-fg-muted">
            <span>Tasks in this run, out of those needed for a 5-point gap</span>
            <span className="num text-fg">
              {P.nTasks} of {need.toLocaleString("en-US")}
            </span>
          </div>
          <Meter value={Math.min(1, P.nTasks / need)} ariaLabel="Share of the tasks needed to spot a 5-point gap" valueText={`${pct(P.nTasks / need, 0)} of the tasks needed`} tone="neutral" />
        </div>
      ) : null}
      <dl className="mt-5 grid max-w-3xl gap-x-8 sm:grid-cols-2">
        <Stat label={<Term tip="Minimum detectable effect with paired tasks (McNemar), at 80% power.">Smallest gap, paired (MDE)</Term>} value={points(P.mdePaired)} />
        <Stat label={<Term tip="Minimum detectable effect if the routers had answered different tasks.">Smallest gap, unpaired</Term>} value={points(P.mdeUnpaired)} />
        <Stat label="Smallest gap in mean score" value={points(P.mdeMeanScore)} />
        <Stat label={<Term tip="Share of tasks where two routers disagree on whether the answer is correct.">Discordance</Term>} value={pct(P.discordance, 0)} />
      </dl>
      <p className="mt-3 max-w-3xl text-[13px] text-fg-muted">{P.note}</p>
    </Panel>
  );
}

function Stat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="num text-fg">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- consistency

function Consistency() {
  const { report, arm } = useReportCtx();
  const reps = report.meta.repsObserved.max;
  return (
    <Panel
      id="consistency"
      title="Consistency across repeats"
      takeaway={
        reps > 1 ? (
          <>Each task ran {reps} times. These numbers show how often a router gives the same verdict, answer and model when asked the same thing again.</>
        ) : (
          "Each task ran once, so consistency across repeats cannot be measured. Run each task at least twice to see it."
        )
      }
      method={METHOD.consistency}
    >
      {reps > 1 ? (
        <>
          <DataTable
            caption="Consistency per router"
            rows={report.consistency}
            getKey={(c) => c.armId}
            minWidth={900}
            columns={[
              { key: "arm", header: "Router", render: (c) => <ArmLabel arm={arm(c.armId)} className="max-w-[240px]" /> },
              { key: "agree", header: "Same verdict", align: "right", render: (c) => <Val v={c.correctAgreement} fmt={(v) => pct(v)} reason="needs 2 or more repeats" />, sort: (c) => c.correctAgreement },
              { key: "ans", header: "Same answer", align: "right", render: (c) => <Val v={c.answerAgreement} fmt={(v) => pct(v)} reason="no extracted answers to compare" /> },
              { key: "route", header: "Same model", align: "right", render: (c) => <Val v={c.routingAgreement} fmt={(v) => pct(v)} reason="model not reported" />, sort: (c) => c.routingAgreement },
              { key: "kappa", header: "Fleiss κ", align: "right", render: (c) => <Val v={c.correctKappa} fmt={(v) => num(v, 2)} reason="needs repeats and both outcomes" />, sort: (c) => c.correctKappa },
              { key: "icc", header: "ICC", align: "right", render: (c) => <Val v={c.icc} fmt={(v) => num(v, 2)} reason="needs 2 or more repeats" />, sort: (c) => c.icc },
              { key: "deff", header: "Design effect", align: "right", render: (c) => <Val v={c.designEffect} fmt={(v) => num(v, 2)} reason="needs 2 or more repeats" />, sort: (c) => c.designEffect },
            ]}
          />
          <p className="mt-3 max-w-3xl text-[13px] text-fg-muted">
            κ corrects agreement for chance. ICC is the share of score variation explained by the task itself (high means repeats agree). A design effect of 1 means repeats behave like new tasks.
          </p>
        </>
      ) : null}
    </Panel>
  );
}
