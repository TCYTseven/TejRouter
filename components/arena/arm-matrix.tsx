import type { ReactNode } from "react";
import { ProviderDot } from "@/components/ui/provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/client/cn";
import { armInfo, armLabel } from "./arm-meta";

/**
 * Diverging scale for "share of the row arm": blue = row favored, red = column
 * favored, neutral gray at 50%. Steps are chosen per theme so cell text in the
 * ordinary ink clears 4.5:1 at every intensity.
 */
export const DIVERGING_VARS =
  "[--div-pos:#5598e7] [--div-neg:#e66767] [--div-mid:#efeeea] dark:[--div-pos:#256abf] dark:[--div-neg:#b53a3a] dark:[--div-mid:#2a2b30]";

export function divergingFill(p: number): string {
  const t = Math.min(1, Math.abs(p - 0.5) * 2);
  const pole = p >= 0.5 ? "var(--div-pos)" : "var(--div-neg)";
  return `color-mix(in oklab, ${pole} ${Math.round(t * 100)}%, var(--div-mid))`;
}

export interface MatrixCell {
  /** 0..1 share for the row arm; null = no colour (no data). */
  share: number | null;
  label: ReactNode;
  sub?: ReactNode;
  tip: ReactNode;
  aria: string;
}

/**
 * Square router-by-router matrix rendered as a real table (so it is its own table
 * view). Rows carry full names; columns carry the rank number + identity dot.
 */
export function ArmMatrix({
  armIds,
  ranks,
  caption,
  cell,
}: {
  armIds: string[];
  ranks: Map<string, number>;
  caption: string;
  cell: (row: string, col: string) => MatrixCell;
}) {
  const n = armIds.length;
  return (
    <div className={cn("relative overflow-x-auto", DIVERGING_VARS)}>
      <table className="w-full border-separate border-spacing-[2px] text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 pb-1 text-left text-[13px] font-medium text-fg-muted">
              <span className="sr-only">Row router vs column router</span>
            </th>
            {armIds.map((id) => {
              const a = armInfo(id);
              return (
                <th key={id} scope="col" className="min-w-[60px] px-1 pb-1 text-center align-bottom font-medium" title={armLabel(id)}>
                  <span className="inline-flex flex-col items-center gap-1">
                    <ProviderDot color={a.color} simulated={a.simulated} size={8} />
                    <span className="num text-[13px] text-fg-muted">#{ranks.get(id)}</span>
                  </span>
                  <span className="sr-only">{armLabel(id)}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {armIds.map((row, i) => {
            const r = armInfo(row);
            return (
              <tr key={row}>
                <th scope="row" className="max-w-[140px] pr-3 text-left font-normal sm:max-w-[200px]" title={armLabel(row)}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="num w-6 shrink-0 text-[13px] text-fg-muted">#{ranks.get(row)}</span>
                    <ProviderDot color={r.color} simulated={r.simulated} size={8} />
                    <span className="min-w-0 truncate text-[14px] text-fg">{r.name}</span>
                  </span>
                </th>
                {armIds.map((col) => {
                  if (row === col)
                    return (
                      <td key={col} className="h-12 rounded-[4px] bg-surface-2 text-center text-fg-subtle" aria-label="same router">
                        ·
                      </td>
                    );
                  const c = cell(row, col);
                  return (
                    <td key={col} className="h-12 p-0">
                      <Tooltip
                        className="flex h-full w-full"
                        side={i < n / 2 ? "bottom" : "top"}
                        content={c.tip}
                      >
                        <span
                          tabIndex={0}
                          aria-label={c.aria}
                          className={cn(
                            "flex h-12 w-full min-w-[56px] flex-col items-center justify-center rounded-[4px] text-fg transition-[filter] hover:brightness-110 focus-visible:outline-2",
                            c.share == null && "border border-dashed border-border bg-transparent text-fg-subtle",
                          )}
                          style={c.share != null ? { background: divergingFill(c.share) } : undefined}
                        >
                          <span className="num text-[14px] leading-none font-semibold">{c.label}</span>
                          {c.sub ? <span className="num mt-1 text-[13px] leading-none text-fg/75">{c.sub}</span> : null}
                        </span>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Legend for the diverging scale. */
export function DivergingLegend({ left, right }: { left: string; right: string }) {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((p) => divergingFill(p));
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-[13px] text-fg-muted", DIVERGING_VARS)}>
      <span>{left}</span>
      <span className="flex h-2.5 w-36 overflow-hidden rounded-sm" aria-hidden="true">
        {stops.map((s, i) => (
          <span key={i} className="flex-1" style={{ background: s }} />
        ))}
      </span>
      <span>{right}</span>
    </div>
  );
}
