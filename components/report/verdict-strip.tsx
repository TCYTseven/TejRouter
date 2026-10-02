"use client";

import { useMemo } from "react";
import { IconAlert, IconClock, IconCoins, IconEqual, IconInfo, IconRoute, IconTrophy, IconGauge } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { useReportCtx } from "./section";
import { buildVerdicts, type Verdict } from "./verdicts";

const ICONS: Record<Verdict["kind"], typeof IconTrophy> = {
  accuracy: IconTrophy,
  cost: IconCoins,
  tie: IconEqual,
  routing: IconRoute,
  oracle: IconGauge,
  latency: IconClock,
  reliability: IconAlert,
  info: IconInfo,
};

/** Auto-generated headline findings in plain English. */
export function VerdictStrip() {
  const { report, arm } = useReportCtx();
  const verdicts = useMemo(() => buildVerdicts(report), [report]);
  if (!verdicts.length) return null;
  return (
    <section aria-labelledby="verdict-title" className="rounded-lg border border-border bg-surface shadow-sm">
      <h2 id="verdict-title" className="eyebrow border-b border-border px-4 py-2.5">
        Headline findings
      </h2>
      <ul className="grid gap-px bg-border md:grid-cols-2">
        {verdicts.map((v, i) => {
          const Icon = ICONS[v.kind];
          return (
            <li key={v.key} className={cn("flex gap-3 bg-surface px-4 py-3", i === verdicts.length - 1 && verdicts.length % 2 === 1 && "md:col-span-2")}>
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                  v.tone === "positive" && "border-accent-line bg-accent-soft text-accent-text",
                  v.tone === "neutral" && "border-border bg-surface-2 text-fg-muted",
                  v.tone === "caution" && "border-warning/30 bg-warning-soft text-warning",
                )}
                aria-hidden="true"
              >
                <Icon size={13} />
              </span>
              <p className="text-[13px] leading-relaxed text-fg-muted">
                {v.parts.map((p, k) => {
                  if (typeof p === "string") return <span key={k}>{p}</span>;
                  if ("arm" in p) {
                    const a = arm(p.arm);
                    return (
                      <span key={k} className="inline-flex items-baseline gap-1 font-medium text-fg">
                        <ProviderDot color={a.color} simulated={a.simulated} className="relative top-[-1px] self-center" />
                        {a.label}
                      </span>
                    );
                  }
                  return (
                    <strong key={k} className="num font-semibold text-fg">
                      {p.b}
                    </strong>
                  );
                })}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
