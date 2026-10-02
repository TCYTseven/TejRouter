"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/client/cn";
import { armSummary, METRICS, type MetricDef } from "./metrics";
import type { ArmRound, ProviderMap } from "./types";

interface Row {
  arm: ArmRound;
  label: string;
  color: string;
  mean: number | null;
  n: number;
}

/**
 * Ranks finished arms on TTFT, latency, cost, output tokens and speed with
 * thin horizontal bars in provider colors. Every bar is direct-labeled (arm
 * letter + name) and valued at its tip, so color is never the only channel;
 * a table view carries the same numbers.
 */
export function ComparisonStrip({
  arms,
  providers,
  hidden,
}: {
  arms: ArmRound[];
  providers: ProviderMap;
  hidden: boolean;
}) {
  const [view, setView] = useState<"bars" | "table">("bars");
  const label = (a: ArmRound) => (hidden ? `Router ${a.letter}` : (providers[a.providerId]?.name ?? a.providerId));
  const color = (a: ArmRound) => (hidden ? "var(--fg-subtle)" : (providers[a.providerId]?.color ?? "var(--fg-subtle)"));

  return (
    <section aria-labelledby="compare-title" className="animate-rise rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 id="compare-title" className="text-sm font-semibold text-fg">
            Comparison
          </h2>
          <p className="text-[11px] text-fg-subtle">
            Ranked best first{arms[0]?.reps.length > 1 ? `; mean of successful runs` : ""}. Hover a bar for detail.
          </p>
        </div>
        <Segmented
          label="Comparison view"
          size="xs"
          value={view}
          onChange={setView}
          options={[
            { value: "bars", label: "Bars" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {view === "bars" ? (
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
          {METRICS.map((m) => (
            <MetricBars
              key={m.key}
              metric={m}
              rows={arms.map((a) => {
                const s = armSummary(a, m);
                return { arm: a, label: label(a), color: color(a), mean: s.mean, n: s.n };
              })}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <caption className="sr-only">Arm comparison table</caption>
            <thead className="text-[11px] text-fg-subtle">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-2 font-medium">Arm</th>
                {METRICS.map((m) => (
                  <th key={m.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {arms.map((a) => (
                <tr key={a.key}>
                  <th scope="row" className="px-4 py-2 font-medium text-fg">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: color(a) }} aria-hidden="true" />
                      <span className="num text-fg-subtle">{a.letter}</span> {label(a)}
                    </span>
                  </th>
                  {METRICS.map((m) => (
                    <td key={m.key} className="num px-3 py-2 text-right text-fg-muted">
                      {m.fmt(armSummary(a, m).mean)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MetricBars({ metric, rows }: { metric: MetricDef; rows: Row[] }) {
  const valued = rows.filter((r) => r.mean != null) as (Row & { mean: number })[];
  const missing = rows.filter((r) => r.mean == null);
  const sorted = [...valued].sort((a, b) => (metric.better === "higher" ? b.mean - a.mean : a.mean - b.mean));
  const max = Math.max(0, ...valued.map((r) => r.mean));
  const bestKey = metric.better && sorted.length > 1 ? sorted[0].arm.key : null;

  return (
    <div className="bg-surface px-4 py-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-fg">{metric.label}</h3>
        <span className="text-[10px] text-fg-subtle">
          {metric.better === "lower" ? "lower is better" : metric.better === "higher" ? "higher is better" : "descriptive"}
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {sorted.map((r, i) => {
          const pct = max > 0 ? (r.mean / max) * 100 : 0;
          const value = metric.fmt(r.mean);
          return (
            <li key={r.arm.key}>
              <Tooltip
                className="w-full"
                align="start"
                content={
                  <span className="flex flex-col gap-0.5">
                    <span className="num text-[12px] font-semibold text-fg">{value}</span>
                    <span className="flex items-center gap-1.5 text-fg-muted">
                      <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />
                      {r.arm.letter} · {r.label}
                    </span>
                    <span className="text-fg-subtle">
                      rank {i + 1} of {sorted.length}
                      {r.n > 1 ? ` · mean of ${r.n} runs` : ""}
                    </span>
                  </span>
                }
              >
                <div
                  tabIndex={0}
                  aria-label={`${r.arm.letter}, ${r.label}: ${value}, rank ${i + 1} of ${sorted.length}`}
                  className="group/bar w-full rounded-sm focus-visible:outline-offset-1"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px]">
                    <span className="num text-fg-subtle">{r.arm.letter}</span>
                    <span className={cn("truncate", r.arm.key === bestKey ? "font-medium text-fg" : "text-fg-muted")}>{r.label}</span>
                    {r.arm.key === bestKey ? <span className="rounded bg-accent-soft px-1 text-[9px] font-medium text-accent-text">best</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative h-2 flex-1">
                      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-border-strong" />
                      <div
                        aria-hidden="true"
                        className="h-2 origin-left rounded-r-[4px] transition-[filter] group-hover/bar:brightness-110 motion-safe:animate-[bar-grow_600ms_cubic-bezier(.2,.8,.2,1)_both]"
                        style={{ width: `max(2px, ${pct}%)`, background: r.color, animationDelay: `${i * 60}ms` }}
                      />
                    </div>
                    <span className="num w-[78px] shrink-0 text-right text-[11px] whitespace-nowrap text-fg">{value}</span>
                  </div>
                </div>
              </Tooltip>
            </li>
          );
        })}
        {missing.map((r) => (
          <li key={r.arm.key} className="flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
            <span className="truncate">
              <span className="num">{r.arm.letter}</span> {r.label}
            </span>
            <span>not reported</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
