import type { BenchArm, BenchSample } from "@/lib/bench/types";
import { IconCheck, IconX, IconAlert } from "@/components/ui/icons";
import { cn } from "@/lib/client/cn";
import { formatMs, formatPercent } from "@/lib/client/format";
import { ArmKey } from "./arm-tiles";
import { ERROR_COLOR, MAX_MODEL_SLOTS, modelColor, type ArmLive } from "./live-stats";

/** Most recent samples, newest first: which arm, which task, what the router served, how it scored. */
export function RoutingFeed({
  samples,
  arms,
  simulated,
  limit = 40,
}: {
  samples: BenchSample[];
  arms: BenchArm[];
  simulated: (providerId: string) => boolean;
  limit?: number;
}) {
  const index = new Map(arms.map((a, i) => [a.id, i]));
  const recent = samples.slice(-limit).reverse();
  if (!recent.length) {
    return <p className="px-1 py-6 text-center text-xs text-fg-subtle">Waiting for the first result…</p>;
  }
  return (
    <ol className="flex max-h-[22rem] flex-col overflow-y-auto overscroll-contain" aria-live="off" aria-label="Most recent samples">
      {recent.map((s, i) => {
        const ai = index.get(s.armId) ?? 0;
        const arm = arms[ai];
        const ok = s.result.ok;
        return (
          <li
            key={`${s.taskId}|${s.armId}|${s.rep}`}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0 border-b border-border px-1 py-1 last:border-b-0 sm:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)_auto_auto]",
              i === 0 && "animate-fade-in",
            )}
          >
            {arm ? <ArmKey arm={arm} index={ai} simulated={simulated(arm.providerId)} /> : <span />}
            <span className="truncate font-mono text-[10.5px] text-fg" title={s.taskId}>
              {s.taskId}
              {s.rep > 0 ? <span className="text-fg-subtle"> #{s.rep + 1}</span> : null}
            </span>
            <span className="col-start-2 row-start-2 truncate font-mono text-[10px] text-fg-muted sm:col-start-auto sm:row-start-auto sm:text-[10.5px]" title={s.result.servedModel ?? ""}>
              → {ok ? (s.result.servedModel ?? "?") : "error"}
            </span>
            <span
              className={cn(
                "num row-span-2 flex w-12 items-center justify-end gap-0.5 text-[10.5px] sm:row-span-1",
                !ok ? "text-danger" : s.grade.correct ? "text-success" : "text-fg-muted",
              )}
            >
              {!ok ? <IconAlert size={11} title="Call failed" /> : s.grade.correct ? <IconCheck size={11} title="Correct" /> : <IconX size={11} title="Wrong" />}
              {s.grade.score === 1 || s.grade.score === 0 ? s.grade.score : s.grade.score.toFixed(2)}
            </span>
            <span className="num hidden w-14 text-right text-[10.5px] text-fg-muted sm:block">{formatMs(s.result.latencyMs)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Running served-model mix per arm as 100% stacked bars. Colors are assigned to models by
 * first appearance (validated categorical slots) and never move; failed calls are a status color.
 */
export function ServedModelBars({
  arms,
  models,
  simulated,
}: {
  arms: ArmLive[];
  models: string[];
  simulated: (providerId: string) => boolean;
}) {
  const slot = new Map(models.slice(0, MAX_MODEL_SLOTS).map((m, i) => [m, i]));
  const hasOther = models.length > MAX_MODEL_SLOTS;
  const hasErrors = arms.some((a) => a.served.has("error"));
  const legend = [
    ...models.slice(0, MAX_MODEL_SLOTS).map((m, i) => ({ key: m, label: m, color: modelColor(i) })),
    ...(hasOther ? [{ key: "__other", label: "other", color: "var(--fg-subtle)" }] : []),
    ...(hasErrors ? [{ key: "error", label: "failed call", color: ERROR_COLOR }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {legend.length ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Served models">
          {legend.map((l) => (
            <li key={l.key} className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-fg-muted">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: l.color }} />
              <span className="truncate font-mono">{l.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="flex flex-col gap-2.5">
        {arms.map((a, i) => {
          const segs = new Map<string, { label: string; color: string; n: number }>();
          for (const [model, n] of a.served) {
            const k = model === "error" ? "error" : slot.has(model) ? model : "__other";
            const prev = segs.get(k);
            if (prev) prev.n += n;
            else
              segs.set(k, {
                label: k === "__other" ? "other" : model === "error" ? "failed call" : model,
                color: k === "error" ? ERROR_COLOR : k === "__other" ? "var(--fg-subtle)" : modelColor(slot.get(model)!),
                n,
              });
          }
          const ordered = [...segs.entries()].sort(([ka], [kb]) => order(ka, slot) - order(kb, slot)).map(([, v]) => v);
          const top = [...ordered].sort((x, y) => y.n - x.n)[0];
          const readout = ordered.map((s) => `${s.label} ${formatPercent(s.n / Math.max(1, a.n), 0)}`).join(", ");
          return (
            <li key={a.arm.id} className="flex flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <ArmKey arm={a.arm} index={i} simulated={simulated(a.arm.providerId)} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-fg-muted" title={a.arm.label}>
                  {a.arm.label}
                </span>
                {top && a.n ? (
                  <span className="num shrink-0 text-[10.5px] text-fg-muted">
                    <span className="font-mono">{top.label}</span> {formatPercent(top.n / a.n, 0)}
                  </span>
                ) : null}
              </div>
              <div className="flex h-2.5 w-full gap-[2px]" role="img" aria-label={a.n ? `${a.arm.label}: ${readout}` : `${a.arm.label}: no samples yet`}>
                {a.n ? (
                  ordered.map((s) => (
                    <span
                      key={s.label}
                      title={`${s.label}: ${s.n} of ${a.n} (${formatPercent(s.n / a.n)})`}
                      className="h-full min-w-[3px] rounded-[2px] transition-[flex-grow] duration-300"
                      style={{ flexGrow: s.n, flexBasis: 0, background: s.color }}
                    />
                  ))
                ) : (
                  <span className="h-full w-full rounded-[2px] bg-surface-3" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function order(key: string, slot: Map<string, number>): number {
  if (key === "error") return 1000;
  if (key === "__other") return 999;
  return slot.get(key) ?? 998;
}
