"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DataTable, type Column } from "@/components/charts";
import { Disclosure } from "@/components/ui/disclosure";
import { Select } from "@/components/ui/field";
import { SkeletonText } from "@/components/ui/skeleton";
import type { AdvancedReport, FailureClass, SliceTable } from "@/lib/analysis/advanced";
import type { Estimate } from "@/lib/analysis/types";
import { DriftPanel } from "./advanced-drift";
import { JudgePanel } from "./advanced-judge";
import { ci, levelPct, ms, num, pct, pctNum, pEq, times, usd } from "./format";
import { ArmLabel, Panel, Term, Val, useReportCtx } from "./section";

const ADV_METHOD = "27. Advanced analysis";

/** Everything beyond "which router wins": tails, failures, compliance, cost spread, slices and stability. */
export function AdvancedTab() {
  const { report, run } = useReportCtx();
  const [state, setState] = useState<{ report: typeof report; adv: AdvancedReport } | { report: typeof report; error: string } | null>(null);

  useEffect(() => {
    let live = true;
    import("@/lib/analysis/advanced")
      .then((m) => {
        if (live) setState({ report, adv: m.analyzeAdvanced(run, report) });
      })
      .catch((e: unknown) => {
        if (live) setState({ report, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      live = false;
    };
  }, [report, run]);

  if (!state || state.report !== report) {
    return (
      <div role="status" className="rounded-xl border border-border bg-surface p-6">
        <SkeletonText lines={3} />
      </div>
    );
  }
  if ("error" in state) return <p className="text-sm text-danger">Could not build the advanced analysis: {state.error}</p>;
  const a = state.adv;

  return (
    <div className="flex flex-col">
      <p className="mb-2 max-w-3xl text-[15px] text-fg-muted">
        Each group opens on click. Ranges are {levelPct(a.level)} intervals. Some sections need particular task sets or settings; when one is missing the section says what to add.
      </p>
      <Group title="Speed and reliability" summary={speedSummary(a)}>
        <TailPanel a={a} />
        <OverheadPanel a={a} />
        <FailurePanel a={a} />
        <LoadPanel a={a} />
      </Group>
      <Group title="Answer quality beyond right or wrong" summary={qualitySummary(a)}>
        <FormatPanel a={a} />
        <InstructionPanel a={a} />
        <FaithfulnessPanel a={a} />
        <JudgePanel />
      </Group>
      <Group title="Cost predictability" summary={costSummary(a)}>
        <CostSpreadPanel a={a} />
        <TokenPanel a={a} />
        <CostByDifficultyPanel a={a} />
      </Group>
      <Group title="Coverage and edge cases" summary={coverageSummary(a)}>
        <SlicePanel id="adv-length" title="By input length" table={a.inputLength} takeaway={lengthTakeaway(a)} />
        {a.languages ? (
          <SlicePanel id="adv-lang" title="By language" table={a.languages} takeaway="Accuracy per language. Pick the Other languages task set to add non-English prompts." />
        ) : (
          <MissingPanel id="adv-lang" title="By language" text="Every task in this run is in English. Pick the Other languages task set under Customize when you start a benchmark to see accuracy per language." />
        )}
        <SlicePanel id="adv-suite" title="By task set" table={a.suites} takeaway="Accuracy, cost and speed per task set, with the model each router used most." />
        <EdgePanel a={a} />
      </Group>
      <Group title="Stability" summary={stabilitySummary(a)}>
        <StabilityPanel a={a} />
        <DriftPanel />
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------- layout

function Group({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <Disclosure
      className="border-b border-border"
      summaryClassName="py-4 text-[15px]"
      summary={
        <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <span className="text-lg font-semibold text-fg">{title}</span>
          <span className="text-sm font-normal text-fg-muted">{summary}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-4 pb-6">{children}</div>
    </Disclosure>
  );
}

function MissingPanel({ id, title, text }: { id: string; title: string; text: string }) {
  return (
    <Panel id={id} title={title} className="border-dashed">
      <p className="text-sm text-fg-muted">{text}</p>
    </Panel>
  );
}

function useRouterCol<T extends { armId: string }>(): Column<T> {
  const { arm } = useReportCtx();
  return { key: "arm", header: "Router", render: (r) => <ArmLabel arm={arm(r.armId)} className="max-w-[220px]" /> };
}

function rateCell(e: Estimate, reason = "no answers"): ReactNode {
  if (e.value == null) return <Val v={null} fmt={String} reason={reason} />;
  const range = ci(e.lo, e.hi, (x) => pctNum(x));
  return (
    <span className="num">
      {pct(e.value)}
      {range ? <span className="ml-1.5 text-fg-muted">{range}</span> : null}
    </span>
  );
}

function frac(k: number, n: number): string {
  return n ? `${pct(k / n)} (${k}/${n})` : "—";
}

// ---------------------------------------------------------------- summaries

function speedSummary(a: AdvancedReport): string {
  const worst = [...a.tail].filter((t) => t.tailRatio != null).sort((x, y) => (y.tailRatio ?? 0) - (x.tailRatio ?? 0))[0];
  const fails = a.failures.reduce((n, f) => n + f.failures, 0);
  const parts = [];
  if (worst) parts.push(`Longest tail: p99 is ${times(worst.tailRatio)} the median`);
  parts.push(fails ? `${fails} failed call${fails === 1 ? "" : "s"}` : "No failed calls");
  return parts.join(" · ");
}

function qualitySummary(a: AdvancedReport): string {
  const parts = [];
  if (a.format.jsonTasks) {
    const n = a.format.rows.reduce((s, r) => s + r.json.n, 0);
    const p = a.format.rows.reduce((s, r) => s + r.json.parsed, 0);
    parts.push(`${pct(n ? p / n : null, 0)} of JSON replies parse`);
  }
  if (a.instructions.nTasks) {
    const n = a.instructions.rows.reduce((s, r) => s + r.n, 0);
    const f = a.instructions.rows.reduce((s, r) => s + r.fullyCompliant, 0);
    parts.push(`${pct(n ? f / n : null, 0)} follow every instruction`);
  }
  return parts.join(" · ") || "Format, instructions, unsupported answers and an AI judge";
}

function costSummary(a: AdvancedReport): string {
  const spread = [...a.costSpread].filter((c) => c.cv != null).sort((x, y) => (y.cv ?? 0) - (x.cv ?? 0))[0];
  return spread ? `Widest cost spread: CV ${num(spread.cv)} (standard deviation ÷ average)` : "No cost data in this run";
}

function coverageSummary(a: AdvancedReport): string {
  const parts = [`${a.inputLength.slices.length} input-length band${a.inputLength.slices.length === 1 ? "" : "s"}`];
  if (a.languages) parts.push(`${a.languages.slices.length} languages`);
  if (a.edge) parts.push(`${a.edge.nTasks} edge cases`);
  return parts.join(" · ");
}

function stabilitySummary(a: AdvancedReport): string {
  if (!a.hasRepetitions && !a.hasRephrasings) return "Compare with an earlier run";
  const parts = [];
  if (a.hasRepetitions) parts.push("repeat runs");
  if (a.hasRephrasings) parts.push("rephrasings");
  return `Model choice across ${parts.join(" and ")} · compare with an earlier run`;
}

function lengthTakeaway(a: AdvancedReport): string {
  const src = a.inputLength.source === "tokens" ? "prompt tokens the router reported" : "prompt tokens reported, or characters ÷ 4 where none were";
  return `Accuracy and cost as the prompt grows, by the ${src}. Long inputs are where routers most often pick badly; the Long documents task set covers 500 to 8,000 words.`;
}

// ---------------------------------------------------------------- speed and reliability

function TailPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["tail"][number]>();
  const worst = [...a.tail].filter((t) => t.tailRatio != null).sort((x, y) => (y.tailRatio ?? 0) - (x.tailRatio ?? 0))[0];
  const { arm } = useReportCtx();
  return (
    <Panel
      id="adv-tail"
      title="Tail latency"
      method={ADV_METHOD}
      takeaway={
        <>
          Medians hide the slow calls people notice. p90, p95 and p99 are the times 90%, 95% and 99% of successful answers beat.
          {worst ? (
            <>
              {" "}
              {arm(worst.armId).label} has the longest tail: its p99 is {times(worst.tailRatio)} its median.
            </>
          ) : null}
          {a.runP95 != null ? <> “Slow or failed” counts calls slower than the run-wide p95 ({ms(a.runP95)}) plus failed calls.</> : null}
        </>
      }
    >
      <DataTable
        caption="Tail latency by router"
        rows={a.tail}
        getKey={(r) => r.armId}
        minWidth={980}
        defaultSort={{ key: "p99", dir: "asc" }}
        columns={[
          routerCol,
          { key: "p50", header: "Median", align: "right", render: (r) => ms(r.latency.p50), sort: (r) => r.latency.p50 },
          { key: "p90", header: "p90", align: "right", render: (r) => ms(r.latency.p90), sort: (r) => r.latency.p90 },
          { key: "p95", header: "p95", align: "right", render: (r) => ms(r.latency.p95), sort: (r) => r.latency.p95 },
          { key: "p99", header: "p99", align: "right", render: (r) => ms(r.latency.p99), sort: (r) => r.latency.p99 },
          { key: "max", header: "Slowest", align: "right", render: (r) => ms(r.latency.max), sort: (r) => r.latency.max },
          { key: "ratio", header: "p99 ÷ median", align: "right", render: (r) => times(r.tailRatio), sort: (r) => r.tailRatio },
          { key: "t95", header: "First token p95", align: "right", render: (r) => <Val v={r.ttft.p95} fmt={ms} reason="no first-token timing" />, sort: (r) => r.ttft.p95 },
          { key: "to", header: "Timed out", align: "right", render: (r) => `${pct(r.timeoutRate.value)} (${r.nTimeouts})`, sort: (r) => r.timeoutRate.value },
          { key: "slow", header: "Slow or failed", align: "right", render: (r) => <Val v={r.slowerThanRunP95} fmt={(v) => pct(v)} reason="needs 20+ successful calls" />, sort: (r) => r.slowerThanRunP95 },
        ]}
      />
    </Panel>
  );
}

function OverheadPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["overhead"]["rows"][number]>();
  const L = levelPct(a.level);
  if (!a.overhead.available) return <MissingPanel id="adv-overhead" title="Router overhead" text={a.overhead.reason ?? "Not available."} />;
  return (
    <Panel
      id="adv-overhead"
      title="Router overhead"
      method={ADV_METHOD}
      takeaway={
        <>
          The time a router adds over calling the model it picked directly: each router answer is paired with the pinned-model answers to the same task from the same model, and the
          difference is taken. First-token overhead is the cleaner number, since total time also depends on how long each answer is. Negative means the router was faster.
        </>
      }
    >
      <DataTable
        caption="Router overhead"
        rows={a.overhead.rows}
        getKey={(r) => r.armId}
        minWidth={900}
        columns={[
          routerCol,
          { key: "t", header: "First token, added", align: "right", render: (r) => <Est e={r.ttft} fmt={signedMs} reason="no paired first-token timings" />, sort: (r) => r.ttft.value },
          { key: "l", header: "Total time, added", align: "right", render: (r) => <Est e={r.latency} fmt={signedMs} reason="no answer matched a pinned model" />, sort: (r) => r.latency.value },
          { key: "x", header: "Total ÷ direct", align: "right", render: (r) => times(r.ratio), sort: (r) => r.ratio },
          { key: "n", header: "Pairs", align: "right", render: (r) => `${r.nPairs} (${pct(r.coverage, 0)} of answers)`, sort: (r) => r.nPairs },
          { key: "m", header: "Matched models", render: (r) => <span className="font-mono text-[13px]">{r.models.join(", ") || "—"}</span> },
        ]}
      />
      <p className="mt-3 text-[13px] text-fg-muted">Intervals are {L} bootstrap intervals on the median difference (shown with 5 or more pairs).</p>
    </Panel>
  );
}

function signedMs(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${ms(Math.abs(v))}`;
}

function Est({ e, fmt, reason }: { e: Estimate; fmt: (v: number) => string; reason: string }) {
  if (e.value == null) return <Val v={null} fmt={String} reason={reason} />;
  const range = ci(e.lo, e.hi, fmt);
  return (
    <span className="num">
      {fmt(e.value)}
      {range ? <span className="ml-1.5 text-fg-muted">{range}</span> : null}
    </span>
  );
}

const CLASS_LABEL: Record<FailureClass, string> = {
  timeout: "Timed out",
  "rate-limit": "Rate limited (429)",
  server: "Server error (5xx)",
  client: "Refused (4xx)",
  network: "Network",
  stream: "Broke mid-answer",
  other: "Other",
};

function FailurePanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["failures"][number]>();
  const recorded = a.failures.every((f) => f.attemptsRecorded);
  const anySub = a.failures.some((f) => f.substituted != null);
  return (
    <Panel
      id="adv-failures"
      title="Failures, retries and fallbacks"
      method={ADV_METHOD}
      takeaway={
        <>
          TejRouter retries rate limits, server errors and dropped connections up to three times with backoff. “Recovered” is how many retried calls ended with an answer. “Answered by
          another model” counts pinned-model calls the router served with a different model, which is how a gateway fails over.
          {recorded ? null : " This run was saved before retried attempts were recorded, so the kinds of retried failures are not shown."}
        </>
      }
    >
      <DataTable
        caption="Failures and retries by router"
        rows={a.failures}
        getKey={(r) => r.armId}
        minWidth={1000}
        columns={[
          routerCol,
          { key: "f", header: "Failed", align: "right", render: (r) => rateCell(r.failureRate), sort: (r) => r.failureRate.value },
          { key: "first", header: "Answered first try", align: "right", render: (r) => frac(r.firstTryOk, r.n), sort: (r) => (r.n ? r.firstTryOk / r.n : null) },
          { key: "ret", header: "Retried", align: "right", render: (r) => String(r.retried), sort: (r) => r.retried },
          { key: "rec", header: "Recovered", align: "right", render: (r) => (r.retried ? frac(r.recovered, r.retried) : "—"), sort: (r) => r.recoveryRate },
          { key: "kinds", header: "Final failures by kind", render: (r) => kinds(r.byClass) },
          ...(recorded ? [{ key: "rk", header: "Retried failures by kind", render: (r: AdvancedReport["failures"][number]) => kinds(r.retriedByClass) }] : []),
          { key: "e", header: "Empty replies", align: "right", render: (r) => String(r.emptyReplies), sort: (r) => r.emptyReplies },
          ...(anySub
            ? [
                {
                  key: "sub",
                  header: "Answered by another model",
                  align: "right" as const,
                  render: (r: AdvancedReport["failures"][number]) =>
                    r.substituted == null ? "—" : r.substituted ? `${r.substituted} (${r.substitutedCorrect} correct)` : "0",
                },
              ]
            : []),
        ]}
      />
    </Panel>
  );
}

function kinds(c: Record<FailureClass, number>): ReactNode {
  const e = Object.entries(c).filter(([, n]) => n > 0) as [FailureClass, number][];
  if (!e.length) return <span className="text-fg-muted">None</span>;
  return <span className="text-[13px]">{e.map(([k, n]) => `${CLASS_LABEL[k]} ${n}`).join(", ")}</span>;
}

function LoadPanel({ a }: { a: AdvancedReport }) {
  const { arm, run } = useReportCtx();
  const rows = a.load.filter((l) => l.buckets.some((b) => b.n > 0));
  const practice = a.load.filter((l) => l.simulated);
  const conc = run.config.concurrency;
  const strongest = [...rows].filter((r) => r.spearman != null && (r.pValue ?? 1) < 0.05 && (r.spearman ?? 0) > 0).sort((x, y) => (y.spearman ?? 0) - (x.spearman ?? 0))[0];
  return (
    <Panel
      id="adv-load"
      title="Under load"
      method={ADV_METHOD}
      takeaway={
        <>
          Each call is placed by how many calls to the same router were in flight when it started. A router that slows down, fails or gets rate limited as that number rises will fall over
          under real traffic even if it looks fine one call at a time.
          {strongest ? <> {arm(strongest.armId).label} slows down noticeably as load rises (Spearman {num(strongest.spearman)}, {pEq(strongest.pValue)}).</> : null} This run allowed {conc} calls
          at once; raise “calls at once” when you start a benchmark to push harder.
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {practice.length ? (
          <p className="text-sm text-fg-muted">Practice routers are left out: they report made-up response times, so load has no effect on them.</p>
        ) : null}
        {rows.map((r) => (
          <div key={r.armId}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <ArmLabel arm={arm(r.armId)} className="font-medium text-fg" />
              <span className="num text-fg-muted">
                Peak {r.peakInFlight} in flight · rate limited {r.throttled} time{r.throttled === 1 ? "" : "s"}
                {r.spearman != null ? (
                  <>
                    {" "}
                    · <Term tip="Rank correlation between calls in flight and response time; above 0 means slower under load.">Spearman</Term> {num(r.spearman)} ({pEq(r.pValue)})
                  </>
                ) : null}
              </span>
            </div>
            <DataTable
              caption={`Load for ${arm(r.armId).label}`}
              rows={r.buckets.filter((b) => b.n > 0)}
              getKey={(b) => b.label}
              minWidth={620}
              columns={[
                { key: "b", header: "Calls in flight", render: (b) => b.label },
                { key: "n", header: "Calls", align: "right", render: (b) => String(b.n) },
                { key: "m", header: "Median time", align: "right", render: (b) => ms(b.medianLatency) },
                { key: "p", header: "p95", align: "right", render: (b) => <Val v={b.p95Latency} fmt={ms} reason="fewer than 5 answers" /> },
                { key: "e", header: "Failed", align: "right", render: (b) => pct(b.errorRate) },
                { key: "t", header: "Rate limited", align: "right", render: (b) => pct(b.throttledRate) },
              ]}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- quality

function FormatPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["format"]["rows"][number]>();
  if (!a.format.jsonTasks && !a.format.codeTasks)
    return <MissingPanel id="adv-format" title="Format compliance" text="No task in this run asks for JSON or code. Include the Extraction and Code task sets to measure it." />;
  return (
    <Panel
      id="adv-format"
      title="Format compliance"
      method={ADV_METHOD}
      takeaway="Whether answers come back in the shape a program can use, separately from whether they are right. Cheap models often fail here quietly. Successful calls only."
    >
      <DataTable
        caption="Format compliance by router"
        rows={a.format.rows}
        getKey={(r) => r.armId}
        minWidth={900}
        columns={[
          routerCol,
          ...(a.format.jsonTasks
            ? [
                { key: "jp", header: "JSON parses", align: "right" as const, render: (r: Row) => rateCell(r.json.parsedRate, "no JSON tasks answered"), sort: (r: Row) => r.json.parsedRate.value },
                { key: "jk", header: "Has every field", align: "right" as const, render: (r: Row) => frac(r.json.allKeys, r.json.n) },
                { key: "jc", header: "Values right", align: "right" as const, render: (r: Row) => frac(r.json.correct, r.json.n) },
              ]
            : []),
          ...(a.format.codeTasks
            ? [
                { key: "cb", header: "Code in a block", align: "right" as const, render: (r: Row) => frac(r.code.codeBlock, r.code.n) },
                { key: "cd", header: "Defines the function", align: "right" as const, render: (r: Row) => frac(r.code.definesFunction, r.code.n) },
                { key: "cp", header: "Passes tests", align: "right" as const, render: (r: Row) => frac(r.code.passes, r.code.n) },
              ]
            : []),
        ]}
      />
    </Panel>
  );
}
type Row = AdvancedReport["format"]["rows"][number];

function InstructionPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["instructions"]["rows"][number]>();
  const { arm } = useReportCtx();
  if (!a.instructions.nTasks)
    return <MissingPanel id="adv-instr" title="Instruction following" text="No task in this run sets length, case or wording rules. Include the Instructions task set to measure it." />;
  const types = [...new Set(a.instructions.rows.flatMap((r) => r.byType.map((t) => t.type)))].sort();
  return (
    <Panel
      id="adv-instr"
      title="Instruction following"
      method={ADV_METHOD}
      takeaway="How often each router's answers respect every rule in the prompt (length, case, required and forbidden words, line and bullet counts), and which rules break most. Successful calls only."
    >
      <DataTable
        caption="Instruction following by router"
        rows={a.instructions.rows}
        getKey={(r) => r.armId}
        minWidth={620}
        columns={[
          routerCol,
          { key: "full", header: "Follows every rule", align: "right", render: (r) => rateCell(r.complianceRate, "no instruction tasks answered"), sort: (r) => r.complianceRate.value },
          { key: "checks", header: "Rules met", align: "right", render: (r) => frac(r.checksPassed, r.checks), sort: (r) => (r.checks ? r.checksPassed / r.checks : null) },
          { key: "n", header: "Answers", align: "right", render: (r) => String(r.n) },
        ]}
      />
      <Disclosure summary="By rule" className="mt-4">
        <DataTable
          caption="Rules met, by rule and router"
          rows={types}
          getKey={(t) => t}
          minWidth={200 + 130 * a.instructions.rows.length}
          columns={[
            { key: "t", header: "Rule", render: (t) => t },
            ...a.instructions.rows.map((r) => ({
              key: r.armId,
              header: arm(r.armId).label,
              align: "right" as const,
              render: (t: string) => {
                const x = r.byType.find((b) => b.type === t);
                return x ? frac(x.passed, x.n) : "—";
              },
            })),
          ]}
        />
      </Disclosure>
    </Panel>
  );
}

function FaithfulnessPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["faithfulness"]["rows"][number]>();
  const { arm } = useReportCtx();
  if (!a.faithfulness.nTasks)
    return (
      <MissingPanel
        id="adv-faith"
        title="Unsupported answers"
        text="No task in this run gives the model a document to answer from. Include the Long documents or Extraction task sets to measure it."
      />
    );
  const examples = a.faithfulness.rows.flatMap((r) => r.examples.map((e) => ({ ...e, armId: r.armId })));
  return (
    <Panel
      id="adv-faith"
      title="Unsupported answers"
      method={ADV_METHOD}
      takeaway="On tasks that come with a document, a wrong answer that appears nowhere in the document was made up rather than misread. Answers that decline (“unsure”, “not in the document”) are counted apart. This is a proxy for hallucination: it only catches invented values, not wrong reasoning over real ones."
    >
      <DataTable
        caption="Unsupported answers by router"
        rows={a.faithfulness.rows}
        getKey={(r) => r.armId}
        minWidth={620}
        columns={[
          routerCol,
          { key: "u", header: "Not in the document", align: "right", render: (r) => rateCell(r.unsupportedRate, "no document tasks answered"), sort: (r) => r.unsupportedRate.value },
          { key: "w", header: "Wrong answers", align: "right", render: (r) => frac(r.wrong, r.n), sort: (r) => (r.n ? r.wrong / r.n : null) },
          { key: "d", header: "Declined to answer", align: "right", render: (r) => String(r.declined), sort: (r) => r.declined },
          { key: "n", header: "Answers", align: "right", render: (r) => String(r.n) },
        ]}
      />
      {examples.length ? (
        <Disclosure summary={`Examples (${examples.length})`} className="mt-4">
          <ul className="flex flex-col gap-1.5 text-sm">
            {examples.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <ArmLabel arm={arm(e.armId)} className="text-fg-muted" />
                <span className="font-mono text-[13px] text-fg-muted">{e.taskId}</span>
                <span className="font-mono text-[13px]">{e.answer}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------- cost

function CostSpreadPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["costSpread"][number]>();
  if (!a.costSpread.some((c) => c.n > 0)) return <MissingPanel id="adv-cost" title="Cost per request: spread" text="No router reported a cost in this run, and none of the served models is in the price table." />;
  return (
    <Panel
      id="adv-cost"
      title="Cost per request: spread"
      method={ADV_METHOD}
      takeaway="Two routers with the same average can differ a lot in how much a single request costs. CV is the standard deviation divided by the average; p90 ÷ median says how much a costly request runs over a typical one."
    >
      <DataTable
        caption="Cost spread by router"
        rows={a.costSpread}
        getKey={(r) => r.armId}
        minWidth={900}
        columns={[
          routerCol,
          { key: "m", header: "Average", align: "right", render: (r) => usd(r.mean), sort: (r) => r.mean },
          { key: "p50", header: "Median", align: "right", render: (r) => usd(r.p50), sort: (r) => r.p50 },
          { key: "p90", header: "p90", align: "right", render: (r) => usd(r.p90), sort: (r) => r.p90 },
          { key: "p99", header: "p99", align: "right", render: (r) => usd(r.p99), sort: (r) => r.p99 },
          { key: "max", header: "Most expensive", align: "right", render: (r) => usd(r.max), sort: (r) => r.max },
          { key: "cv", header: "CV", align: "right", render: (r) => num(r.cv), sort: (r) => r.cv },
          { key: "r", header: "p90 ÷ median", align: "right", render: (r) => times(r.p90ToMedian), sort: (r) => r.p90ToMedian },
          { key: "n", header: "Priced calls", align: "right", render: (r) => String(r.n) },
        ]}
      />
    </Panel>
  );
}

function TokenPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["tokens"][number]>();
  return (
    <Panel
      id="adv-tokens"
      title="Output tokens"
      method={ADV_METHOD}
      takeaway="Output tokens usually cost the most. Inflation compares each router's output length with the typical router on the same tasks (1.0× = typical, 2.0× = twice as long), as a geometric mean over shared tasks."
    >
      <DataTable
        caption="Output tokens by router"
        rows={a.tokens}
        getKey={(r) => r.armId}
        minWidth={860}
        columns={[
          routerCol,
          { key: "inf", header: "Inflation", align: "right", render: (r) => <Val v={r.inflation} fmt={times} reason="needs at least two routers with token counts on the same tasks" />, sort: (r) => r.inflation },
          { key: "mean", header: "Average output", align: "right", render: (r) => num(r.meanCompletion, 0), sort: (r) => r.meanCompletion },
          { key: "med", header: "Median output", align: "right", render: (r) => num(r.medianCompletion, 0), sort: (r) => r.medianCompletion },
          { key: "rea", header: "Reasoning tokens", align: "right", render: (r) => <Val v={r.meanReasoning} fmt={(v) => num(v, 0)} reason="not reported" />, sort: (r) => r.meanReasoning },
          { key: "share", header: "Output share of cost", align: "right", render: (r) => <Val v={r.outputCostShare} fmt={(v) => pct(v, 0)} reason="served models not in the price table" />, sort: (r) => r.outputCostShare },
          { key: "n", header: "Tasks compared", align: "right", render: (r) => String(r.nTasks) },
        ]}
      />
    </Panel>
  );
}

function CostByDifficultyPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["costByDifficulty"]["rows"][number]>();
  return (
    <Panel
      id="adv-cost-diff"
      title="Cost per correct answer, by difficulty"
      method={ADV_METHOD}
      takeaway="Total spend divided by correct answers in each difficulty band. A router that overspends on easy tasks shows a high number in the first column."
    >
      <DataTable
        caption="Cost per correct answer by difficulty"
        rows={a.costByDifficulty.rows}
        getKey={(r) => r.armId}
        minWidth={240 + 140 * a.costByDifficulty.buckets.length}
        columns={[
          routerCol,
          ...a.costByDifficulty.buckets.map((b, i) => ({
            key: `b${i}`,
            header: b.label,
            align: "right" as const,
            render: (r: AdvancedReport["costByDifficulty"]["rows"][number]) => {
              const c = r.cells[i];
              if (!c.n) return "—";
              return (
                <span className="num">
                  <Val v={c.costPerCorrect} fmt={usd} reason={c.totalCost == null ? "no cost data" : "no correct answers"} />
                  <span className="ml-1.5 text-fg-muted">
                    {c.nCorrect}/{c.n}
                  </span>
                </span>
              );
            },
            sort: (r: AdvancedReport["costByDifficulty"]["rows"][number]) => r.cells[i].costPerCorrect,
          })),
        ]}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------- coverage

function SlicePanel({ id, title, table, takeaway }: { id: string; title: string; table: SliceTable; takeaway: string }) {
  const { arm } = useReportCtx();
  const [metric, setMetric] = useState<"acc" | "cost" | "lat" | "model">("acc");
  if (!table.slices.length) return <MissingPanel id={id} title={title} text="No answers in this run." />;
  type R = SliceTable["rows"][number];
  const cell = (r: R, i: number): ReactNode => {
    const c = r.cells[i];
    if (!c.n) return "—";
    if (metric === "acc") return `${pct(c.accuracy)} (${c.n})`;
    if (metric === "cost") return usd(c.meanCost);
    if (metric === "lat") return ms(c.medianLatency);
    return <span className="font-mono text-[13px]">{c.topModel ?? "—"}</span>;
  };
  return (
    <Panel
      id={id}
      title={title}
      takeaway={takeaway}
      method={ADV_METHOD}
      actions={
        <Select aria-label="Show" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} className="w-48">
          <option value="acc">Accuracy (answers)</option>
          <option value="cost">Cost per answer</option>
          <option value="lat">Median time</option>
          <option value="model">Most-used model</option>
        </Select>
      }
    >
      <DataTable
        caption={title}
        rows={table.rows}
        getKey={(r) => r.armId}
        minWidth={240 + 150 * table.slices.length}
        columns={[
          { key: "arm", header: "Router", render: (r: R) => <ArmLabel arm={arm(r.armId)} className="max-w-[220px]" /> },
          ...table.slices.map((s, i) => ({
            key: s.key,
            header: (
              <span>
                {s.label} <span className="font-normal text-fg-muted">· {s.nTasks}</span>
              </span>
            ),
            title: s.label,
            align: "right" as const,
            render: (r: R) => cell(r, i),
            sort: (r: R) => (metric === "acc" ? r.cells[i].accuracy : metric === "cost" ? r.cells[i].meanCost : metric === "lat" ? r.cells[i].medianLatency : r.cells[i].topModel),
          })),
        ]}
      />
      <p className="mt-3 text-[13px] text-fg-muted">The number beside each heading is how many tasks fall in it.</p>
    </Panel>
  );
}

const EDGE_LABEL: Record<string, string> = {
  empty: "Empty or blank",
  malformed: "Noise and broken markup",
  "very-long": "Very long prompt",
  "prompt-injection": "Prompt injection",
  "benign-trigger": "Harmless but alarming words",
};

function EdgePanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<NonNullable<AdvancedReport["edge"]>["rows"][number]>();
  if (!a.edge)
    return (
      <MissingPanel
        id="adv-edge"
        title="Edge cases"
        text="Pick the Edge cases task set under Customize to test empty and blank messages, noise, a 20,000-word prompt, prompt injection and harmless questions with alarming words."
      />
    );
  const e = a.edge;
  return (
    <Panel
      id="adv-edge"
      title="Edge cases"
      method={ADV_METHOD}
      takeaway="Graceful means the router answered, or refused with a clear 4xx error. Timeouts, server errors and dropped connections are not graceful. Correct means it also gave the expected answer: for prompt injection, that it ignored the injected instruction; for alarming words, that it did not refuse."
    >
      <DataTable
        caption="Edge cases by router"
        rows={e.rows}
        getKey={(r) => r.armId}
        minWidth={300 + 150 * e.kinds.length}
        columns={[
          routerCol,
          { key: "g", header: "Graceful", align: "right", render: (r) => rateCell(r.gracefulRate), sort: (r) => r.gracefulRate.value },
          ...e.kinds.map((k) => ({
            key: k,
            header: EDGE_LABEL[k] ?? k,
            align: "right" as const,
            render: (r: (typeof e.rows)[number]) => {
              const x = r.byKind.find((b) => b.kind === k);
              return x && x.n ? `${x.correct}/${x.n} correct${x.graceful < x.n ? `, ${x.n - x.graceful} not graceful` : ""}` : "—";
            },
          })),
        ]}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------- stability

function StabilityPanel({ a }: { a: AdvancedReport }) {
  const routerCol = useRouterCol<AdvancedReport["stability"][number]>();
  if (!a.hasRepetitions && !a.hasRephrasings)
    return (
      <MissingPanel
        id="adv-stable"
        title="Routing determinism"
        text="Run each task more than once (the Thorough preset, or “Times to run each task” under Customize), or pick the Rephrasings task set, to see whether a router makes the same choice for the same or a reworded prompt."
      />
    );
  return (
    <Panel
      id="adv-stable"
      title="Routing determinism"
      method={ADV_METHOD}
      takeaway="Whether a router makes the same choice for the same prompt sent again, and for the same question worded differently (the Rephrasings task set). A router whose choice flips on small rewordings is hard to predict and to budget."
    >
      <DataTable
        caption="Routing determinism by router"
        rows={a.stability}
        getKey={(r) => r.armId}
        minWidth={860}
        columns={[
          routerCol,
          ...(a.hasRepetitions
            ? [
                { key: "rm", header: "Same model, repeat runs", align: "right" as const, render: (r: S) => <Val v={r.sameModelAcrossReps} fmt={(v) => pct(v, 0)} reason="no task ran twice" />, sort: (r: S) => r.sameModelAcrossReps },
                { key: "ra", header: "Same answer, repeat runs", align: "right" as const, render: (r: S) => <Val v={r.sameAnswerAcrossReps} fmt={(v) => pct(v, 0)} reason="no task ran twice" />, sort: (r: S) => r.sameAnswerAcrossReps },
              ]
            : []),
          ...(a.hasRephrasings
            ? [
                { key: "pm", header: "Same model, rephrased", align: "right" as const, render: (r: S) => <Val v={r.sameModelAcrossPhrasings} fmt={(v) => pct(v, 0)} reason="no rephrasing group answered" />, sort: (r: S) => r.sameModelAcrossPhrasings },
                { key: "po", header: "Same result, rephrased", align: "right" as const, render: (r: S) => <Val v={r.sameOutcomeAcrossPhrasings} fmt={(v) => pct(v, 0)} reason="no rephrasing group answered" />, sort: (r: S) => r.sameOutcomeAcrossPhrasings },
                { key: "g", header: "Questions", align: "right" as const, render: (r: S) => String(r.groups) },
              ]
            : []),
        ]}
      />
    </Panel>
  );
}
type S = AdvancedReport["stability"][number];
