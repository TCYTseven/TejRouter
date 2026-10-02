import type { BenchArm } from "@/lib/bench/types";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { formatMs, formatNumber, formatPercent, formatUsd } from "@/lib/client/format";
import type { ArmLive } from "./live-stats";

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Letter + color key used by the heatmap, feed and distribution so columns stay compact. */
export function ArmKey({ arm, index, simulated, className }: { arm: BenchArm; index: number; simulated?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <ProviderDot color={arm.color} simulated={simulated} size={8} />
      <span className="num text-[10px] font-semibold text-fg-muted">{LETTERS[index] ?? index + 1}</span>
    </span>
  );
}

/** Accuracy point + Wilson 95% interval on a shared 0–100% scale, so tiles compare at a glance. */
function CiBar({ ci, color }: { ci: ArmLive["ci"]; color: string }) {
  return (
    <div className="relative h-4" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-strong" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <div key={t} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border-strong" style={{ left: `${t * 100}%` }} />
      ))}
      {ci ? (
        <>
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-[left,width] duration-300"
            style={{ left: `${ci.lo * 100}%`, width: `${Math.max(0.5, (ci.hi - ci.lo) * 100)}%`, background: color, opacity: 0.55 }}
          />
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-300"
            style={{ left: `${ci.p * 100}%`, background: color, boxShadow: "0 0 0 2px var(--surface)" }}
          />
        </>
      ) : null}
    </div>
  );
}

export function ArmTiles({ arms, simulated }: { arms: ArmLive[]; simulated: (providerId: string) => boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Per-arm results so far">
      {arms.map((a, i) => {
        const pinned = !!a.arm.model;
        return (
          <li key={a.arm.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex min-w-0 items-center gap-2">
              <ArmKey arm={a.arm} index={i} simulated={simulated(a.arm.providerId)} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg" title={a.arm.label}>
                {a.arm.label}
              </span>
              <span className="text-[10px] text-fg-subtle">{pinned ? "pinned" : "routed"}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold tracking-tight text-fg">{a.ci ? formatPercent(a.ci.p) : "—"}</span>
              <span className="num text-[11px] text-fg-muted">
                {formatNumber(a.n)}
                <span className="text-fg-subtle">/{formatNumber(a.expected)}</span>
              </span>
            </div>
            <div>
              <CiBar ci={a.ci} color={a.arm.color} />
              <p className="num mt-0.5 text-[10.5px] text-fg-subtle">
                {a.ci ? `95% CI ${formatPercent(a.ci.lo)} – ${formatPercent(a.ci.hi)} (Wilson)` : "accuracy, 95% CI"}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[10.5px] text-fg-subtle">Latency</dt>
                <dd className="num text-[11px] text-fg">{formatMs(a.meanLatency)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[10.5px] text-fg-subtle">Cost</dt>
                <dd className="num text-[11px] text-fg">{a.costN ? formatUsd(a.cost) : "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[10.5px] text-fg-subtle">Errors</dt>
                <dd className={cn("num text-[11px]", a.errors ? "text-danger" : "text-fg")}>{formatNumber(a.errors)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[10.5px] text-fg-subtle">Retries</dt>
                <dd className={cn("num text-[11px]", a.retries ? "text-warning" : "text-fg")}>{formatNumber(a.retries)}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
