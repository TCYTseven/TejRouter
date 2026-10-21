"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import { Tooltip } from "@/components/ui/tooltip";
import type { ArmStats } from "@/lib/analysis/types";
import { cn } from "@/lib/client/cn";
import { levelPct, ms, pct, usd } from "./format";
import { ArmLabel, Term, useReportCtx } from "./section";
import { armNote, buildHeadline, fin, rankedArms } from "./verdicts";

/**
 * The answer to "Which router should I use, and how sure is that?": one
 * sentence naming the most accurate router with its cost and how clearly it
 * wins, then a compact comparison table (one row per router).
 */
export function Verdict() {
  const { report, run, arm } = useReportCtx();
  const headline = useMemo(() => buildHeadline(report), [report]);
  const rows = useMemo(() => rankedArms(report), [report]);
  const warnings = [
    ...(run.aborted ? ["This run was stopped before every task finished, so routers may have answered different numbers of tasks."] : []),
    ...(run.error ? [`The run ended with an error: ${run.error}`] : []),
    ...report.warnings,
  ];

  const name = (id: string) => <span className="font-medium text-fg">{arm(id).label}</span>;
  const list = (ids: string[]) =>
    ids.map((id, i) => (
      <Fragment key={id}>
        {i > 0 ? (i === ids.length - 1 ? " and " : ", ") : null}
        {name(id)}
      </Fragment>
    ));

  let sentence: ReactNode = "No router produced a graded answer in this run.";
  let followUp: ReactNode = null;
  if (headline) {
    const { best, clearlyBetterThan: win, sameAs: tie, alternative } = headline;
    const others = rows.length - 1;
    const cost = fin(best.cost.meanUsd) ? <> at {usd(best.cost.meanUsd)} per answer</> : null;
    const confidence =
      others === 0 ? (
        <>. Add a second router to compare.</>
      ) : tie.length === 0 ? (
        <>, clearly better than {others === 1 ? name(win[0]) : `the other ${spell(others)}`}.</>
      ) : win.length === 0 ? (
        <>, but it is about the same as {tie.length === others && others > 2 ? `the other ${spell(others)}` : list(tie)}: this run cannot separate them.</>
      ) : (
        <>
          , clearly better than {list(win)} and about the same as {list(tie)}.
        </>
      );
    sentence = (
      <>
        {name(best.armId)} {win.length || others === 0 ? "is the most accurate" : "has the highest accuracy"}: {pct(best.accuracy.value)} correct{cost}
        {confidence}
      </>
    );
    if (alternative && fin(alternative.arm.accuracy.value)) {
      followUp = (
        <>
          If cost matters, {name(alternative.arm.armId)} gets {pct(alternative.arm.accuracy.value)} for {alternative.saving} per answer.
        </>
      );
    }
  }

  // Vals AI Router Index check: is any router beaten on both accuracy and cost by one single model?
  const rq = report.routingQuality;
  const beatenRouters = rq.available ? rq.routers.filter((r) => r.dominatedBy.length > 0) : [];
  const singleModelNote: ReactNode =
    rq.available && rq.routers.length > 0 ? (
      beatenRouters.length === 0 ? (
        <>No single model in this run beats {rq.routers.length === 1 ? name(rq.routers[0].armId) : "any router"} on both accuracy and cost.</>
      ) : (
        <>
          {beatenRouters.map((r, i) => (
            <Fragment key={r.armId}>
              {i > 0 ? " " : null}
              Always using {name(r.dominatedBy[0].armId)} beats {name(r.armId)} on both accuracy and cost.
            </Fragment>
          ))}
        </>
      )
    ) : null;

  return (
    <section aria-labelledby="verdict-title" className="rounded-xl border border-border bg-surface p-6 max-sm:p-5">
      <h2 id="verdict-title" className="sr-only">
        Verdict
      </h2>
      <p className="max-w-4xl text-lg leading-relaxed text-fg-muted">{sentence}</p>
      {followUp ? <p className="mt-2 max-w-4xl text-[15px] text-fg-muted">{followUp}</p> : null}
      {singleModelNote ? <p className="mt-2 max-w-4xl text-[15px] text-fg-muted">{singleModelNote}</p> : null}
      {rows.length ? <Comparison rows={rows} /> : null}
      {warnings.length ? (
        <Disclosure className="mt-5" summary={warnings.length === 1 ? "1 thing to know about this data" : `${warnings.length} things to know about this data`}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </section>
  );
}

function spell(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? String(n);
}

function Comparison({ rows }: { rows: ArmStats[] }) {
  const { report, arm, level } = useReportCtx();
  const L = levelPct(level);
  const bestAcc = Math.max(...rows.map((r) => r.accuracy.value ?? -1));
  const costs = rows.map((r) => r.cost.meanUsd).filter(fin);
  const lats = rows.map((r) => r.latency.p50).filter(fin);
  const bestCost = costs.length ? Math.min(...costs) : null;
  const bestLat = lats.length ? Math.min(...lats) : null;
  const ends = rows.flatMap((r) => [r.accuracy.lo ?? r.accuracy.value, r.accuracy.hi ?? r.accuracy.value]).filter(fin);
  const lo = Math.max(0, Math.min(...ends) - 0.02);
  const hi = Math.min(1, Math.max(...ends) + 0.02);
  const domain: [number, number] = hi > lo ? [lo, hi] : [0, 1];
  const strong = (on: boolean) => (on ? "font-semibold text-fg" : "text-fg");

  const accTip = `Share of tasks answered correctly; failed calls count as wrong. The bar shows the ${L} range the true value likely falls in.`;
  const latTip = "Median time from sending the request to receiving the full answer: half of the answers were faster than this.";
  const costTip = "Average cost of one request, as reported by the router or estimated from token usage.";

  return (
    <>
      {/* Desktop and tablet: a table */}
      <table className="mt-6 hidden w-full text-left text-[15px] sm:table">
        <caption className="sr-only">Routers compared on accuracy, cost and response time. The best value in each column is in bold.</caption>
        <thead className="text-[13px] text-fg-muted">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-4 font-medium">
              Router
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              <Term tip={accTip}>Accuracy</Term>
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              <Term tip={costTip}>Cost per answer</Term>
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              <Term tip={latTip} align="end">
                Typical response time
              </Term>
            </th>
            <th scope="col" className="hidden py-2 font-medium lg:table-cell">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const a = arm(r.armId);
            const note = armNote(report, r.armId);
            return (
              <tr key={r.armId} className="border-b border-border last:border-b-0">
                <th scope="row" className="max-w-[18rem] py-3 pr-4 font-normal">
                  <ArmLabel arm={a} className="max-w-full text-fg" />
                  <span className="mt-0.5 block text-[13px] text-fg-muted lg:hidden">{note}</span>
                </th>
                <td className="py-3 pr-4">
                  <span className="flex items-center gap-3">
                    <span className={cn("num w-14", strong(r.accuracy.value === bestAcc))}>{pct(r.accuracy.value)}</span>
                    <IntervalBar v={r.accuracy.value} lo={r.accuracy.lo} hi={r.accuracy.hi} domain={domain} label={L} />
                  </span>
                </td>
                <td className={cn("num py-3 pr-4 text-right", strong(r.cost.meanUsd != null && r.cost.meanUsd === bestCost))}>{usd(r.cost.meanUsd)}</td>
                <td className={cn("num py-3 pr-4 text-right", strong(r.latency.p50 != null && r.latency.p50 === bestLat))}>{ms(r.latency.p50)}</td>
                <td className="hidden py-3 text-sm text-fg-muted lg:table-cell">{note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Phones: one block per router */}
      <ul className="mt-5 divide-y divide-border sm:hidden" aria-label="Routers compared">
        {rows.map((r) => {
          const a = arm(r.armId);
          return (
            <li key={r.armId} className="py-3 first:pt-0 last:pb-0">
              <ArmLabel arm={a} className="max-w-full text-[15px] text-fg" />
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <MobileStat label="Accuracy" value={pct(r.accuracy.value)} best={r.accuracy.value === bestAcc} />
                <MobileStat label="Per answer" value={usd(r.cost.meanUsd)} best={r.cost.meanUsd != null && r.cost.meanUsd === bestCost} />
                <MobileStat label="Typical time" value={ms(r.latency.p50)} best={r.latency.p50 != null && r.latency.p50 === bestLat} />
              </dl>
              <p className="mt-1.5 text-[13px] text-fg-muted">{armNote(report, r.armId)}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function MobileStat({ label, value, best }: { label: string; value: string; best: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className={cn("num text-[15px]", best ? "font-semibold text-fg" : "text-fg")}>{value}</dd>
    </div>
  );
}

/** Thin interval bar: the likely range as a line, the estimate as a dot. */
function IntervalBar({ v, lo, hi, domain, label }: { v: number | null; lo: number | null; hi: number | null; domain: [number, number]; label: string }) {
  if (!fin(v)) return null;
  const pos = (x: number) => `${((Math.min(domain[1], Math.max(domain[0], x)) - domain[0]) / (domain[1] - domain[0])) * 100}%`;
  const text = fin(lo) && fin(hi) ? `Likely between ${pct(lo)} and ${pct(hi)} (${label} interval)` : "Too few tasks to estimate a range";
  return (
    <Tooltip content={text}>
      <span tabIndex={0} aria-label={text} className="relative block h-4 w-28 shrink-0 outline-none max-md:w-20">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {fin(lo) && fin(hi) ? (
          <span aria-hidden="true" className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-fg-muted" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
        ) : null}
        <span aria-hidden="true" className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg" style={{ left: pos(v) }} />
      </span>
    </Tooltip>
  );
}
