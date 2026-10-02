"use client";

import { useState } from "react";
import { formatMs, formatTokens, formatUsd } from "@/lib/client/format";
import { armSummary, metricDef } from "./metrics";
import { armLabel } from "./response-column";
import { okResults, type ArmRound, type ProviderMap } from "./types";

interface Row {
  arm: ArmRound;
  label: string;
  ttft: number | null;
  latency: number | null;
  cost: number | null;
  tokens: number | null;
  ok: boolean;
}

function rowsFor(arms: ArmRound[], providers: ProviderMap, hidden: boolean): Row[] {
  return arms.map((a) => ({
    arm: a,
    label: armLabel(a, providers[a.providerId], hidden),
    ttft: armSummary(a, metricDef("ttft")).mean,
    latency: armSummary(a, metricDef("latency")).mean,
    cost: armSummary(a, metricDef("cost")).mean,
    tokens: armSummary(a, metricDef("tokens")).mean,
    ok: okResults(a).length > 0,
  }));
}

function minBy(rows: Row[], pick: (r: Row) => number | null): Row | null {
  let best: Row | null = null;
  for (const r of rows) {
    const v = pick(r);
    if (v == null) continue;
    if (!best || v < (pick(best) as number)) best = r;
  }
  return best;
}

/** One plain sentence: who was fastest, who was cheapest, who failed. */
export function summarySentence(rows: Row[], repeated: boolean): string {
  const ok = rows.filter((r) => r.ok);
  const failed = rows.filter((r) => !r.ok);
  const parts: string[] = [];
  const avg = repeated ? " on average" : "";

  if (ok.length === 1) parts.push(`Only ${ok[0].label} answered.`);
  if (ok.length >= 2) {
    const fast = minBy(ok, (r) => r.latency);
    const costs = ok.map((r) => r.cost).filter((c): c is number => c != null);
    const allSameCost = costs.length > 0 && costs.every((c) => c === costs[0]);
    const cheap = costs.length >= 2 && !allSameCost ? minBy(ok, (r) => r.cost) : null;
    if (fast && cheap && fast === cheap) {
      parts.push(`${fast.label} was both fastest (${formatMs(fast.latency)}) and cheapest (${formatUsd(cheap.cost)})${avg}.`);
    } else {
      if (fast) parts.push(`${fast.label} answered fastest${avg} (${formatMs(fast.latency)}).`);
      if (cheap) parts.push(`${cheap.label} was cheapest${avg} (${formatUsd(cheap.cost)}).`);
      else if (allSameCost && costs.length === ok.length) parts.push(`They all cost the same (${formatUsd(costs[0])}).`);
    }
  }
  if (failed.length) parts.push(`${failed.map((r) => r.label).join(" and ")} returned an error.`);
  if (!parts.length) parts.push("No router answered.");
  return parts.join(" ");
}

/** Summary sentence above the columns, with an optional numbers table. */
export function RoundSummary({ arms, providers, hidden }: { arms: ArmRound[]; providers: ProviderMap; hidden: boolean }) {
  const [table, setTable] = useState(false);
  const rows = rowsFor(arms, providers, hidden);
  const repeated = arms.some((a) => a.reps.length > 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[15px] text-fg" role="status">
          {summarySentence(rows, repeated)}
        </p>
        <button type="button" onClick={() => setTable((t) => !t)} aria-expanded={table} className="text-sm text-link hover:underline">
          {table ? "Hide table" : "Show as table"}
        </button>
      </div>
      {table ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Timing and cost per router{repeated ? ", averaged over runs" : ""}</caption>
            <thead className="text-[13px] text-fg-muted">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-2.5 font-medium">Router</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">First words</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Total time</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Cost</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Answer tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.arm.key}>
                  <th scope="row" className="px-4 py-2.5 font-medium text-fg">{r.label}</th>
                  <td className="num px-4 py-2.5 text-right text-fg-muted">{formatMs(r.ttft)}</td>
                  <td className="num px-4 py-2.5 text-right text-fg-muted">{formatMs(r.latency)}</td>
                  <td className="num px-4 py-2.5 text-right text-fg-muted">{formatUsd(r.cost)}</td>
                  <td className="num px-4 py-2.5 text-right text-fg-muted">{formatTokens(r.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
