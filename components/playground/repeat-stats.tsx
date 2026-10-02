"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { formatMeanSd } from "@/lib/client/format";
import { armSummary, metricDef, niceMax, type MetricKey } from "./metrics";
import type { ArmRound, ProviderMap } from "./types";

/**
 * Repeat-run statistics: mean ± sd per arm and a dot plot of every run on one
 * shared axis. Dots carry a 2px surface ring and a 24px hover target.
 */
export function RepeatStats({ arms, providers, hidden }: { arms: ArmRound[]; providers: ProviderMap; hidden: boolean }) {
  const [key, setKey] = useState<MetricKey>("latency");
  const m = metricDef(key);
  const rows = arms.map((a) => ({
    arm: a,
    label: hidden ? `Router ${a.letter}` : (providers[a.providerId]?.name ?? a.providerId),
    color: hidden ? "var(--fg-subtle)" : (providers[a.providerId]?.color ?? "var(--fg-subtle)"),
    s: armSummary(a, m),
  }));
  const max = niceMax(Math.max(0, ...rows.flatMap((r) => r.s.values.filter((v): v is number => v != null))));
  const ticks = [0, max / 2, max];
  const pos = (v: number) => `${(v / max) * 100}%`;

  return (
    <section aria-labelledby="repeat-title" className="animate-rise rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 id="repeat-title" className="text-sm font-semibold text-fg">
            Repeat statistics
          </h2>
          <p className="text-[11px] text-fg-subtle">
            {arms[0]?.reps.length ?? 0} runs per arm · mean ± sample sd · one dot per successful run
          </p>
        </div>
        <Segmented
          label="Metric"
          size="xs"
          value={key}
          onChange={setKey}
          options={[
            { value: "latency", label: "Latency" },
            { value: "ttft", label: "TTFT" },
            { value: "cost", label: "Cost" },
          ]}
        />
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-[minmax(140px,200px)_1fr]">
          {rows.map((r) => (
            <div key={r.arm.key} className="contents">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.color }} aria-hidden="true" />
                  <span className="num text-fg-subtle">{r.arm.letter}</span>
                  <span className="truncate text-fg">{r.label}</span>
                </div>
                <div className="num mt-0.5 text-[11px] text-fg-muted">
                  {formatMeanSd(r.s.mean, r.s.sd, m.fmt)}
                  <span className="text-fg-subtle"> · n={r.s.n}</span>
                </div>
              </div>
              <div className="relative h-8 self-center" role="img" aria-label={`${r.label} ${m.label} per run: ${r.s.values.map((v) => m.fmt(v)).join(", ") || "no data"}`}>
                {ticks.map((t) => (
                  <div key={t} aria-hidden="true" className="absolute inset-y-0 w-px bg-border" style={{ left: pos(t) }} />
                ))}
                {r.s.mean != null && r.s.sd != null ? (
                  <div
                    aria-hidden="true"
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm opacity-15"
                    style={{
                      left: pos(Math.max(0, r.s.mean - r.s.sd)),
                      width: `${(Math.min(max, r.s.mean + r.s.sd) - Math.max(0, r.s.mean - r.s.sd)) / max * 100}%`,
                      background: r.color,
                    }}
                  />
                ) : null}
                {r.s.mean != null ? (
                  <div aria-hidden="true" className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-fg" style={{ left: pos(r.s.mean) }} />
                ) : null}
                {r.s.values.map((v, i) =>
                  v == null ? null : (
                    <span key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: pos(v) }}>
                      <Tooltip content={<span className="num">run {i + 1}: {m.fmt(v)}</span>}>
                        <span className="flex h-6 w-6 items-center justify-center">
                          <span
                            className="h-2 w-2 rounded-full transition-transform hover:scale-125"
                            style={{ background: r.color, boxShadow: "0 0 0 2px var(--surface)" }}
                          />
                        </span>
                      </Tooltip>
                    </span>
                  ),
                )}
              </div>
            </div>
          ))}
          <div className="hidden md:block" />
          <div className="num relative h-4 text-[10px] text-fg-subtle" aria-hidden="true">
            {ticks.map((t, i) => (
              <span
                key={t}
                className="absolute top-0 whitespace-nowrap"
                style={{ left: pos(t), transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
              >
                {m.fmt(t)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
