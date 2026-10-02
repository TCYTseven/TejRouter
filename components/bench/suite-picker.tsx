"use client";

import type { SuiteInfo } from "@/lib/bench/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/client/cn";
import { formatNumber } from "@/lib/client/format";
import { tasksPerSuite } from "@/lib/client/bench";
import { PRESETS, type Preset } from "./config";

const BIN_LABELS = ["0–0.2", "0.2–0.4", "0.4–0.6", "0.6–0.8", "0.8–1"];

/** Five-bin difficulty histogram: one series, so one hue and no legend; values in the label. */
export function DifficultyHistogram({ bins, className }: { bins: number[]; className?: string }) {
  const max = Math.max(1, ...bins);
  const total = bins.reduce((a, b) => a + b, 0);
  const summary = bins.map((n, i) => `${BIN_LABELS[i]}: ${n}`).join(", ");
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex h-7 items-end gap-[2px]" role="img" aria-label={`Difficulty histogram (${total} tasks). ${summary}`}>
        {bins.map((n, i) => (
          <span
            key={i}
            title={`Difficulty ${BIN_LABELS[i]}: ${n} task${n === 1 ? "" : "s"}`}
            className={cn("w-2 rounded-t-[2px]", n ? "bg-accent/80" : "bg-surface-3")}
            style={{ height: n ? `${Math.max(12, (n / max) * 100)}%` : "2px" }}
          />
        ))}
      </div>
      <div className="flex w-[48px] justify-between font-mono text-[8.5px] leading-none text-fg-subtle" aria-hidden="true">
        <span>easy</span>
        <span>hard</span>
      </div>
    </div>
  );
}

export function SuitePicker({
  suites,
  selected,
  onChange,
  maxTasksPerSuite,
  onPreset,
  activePresetId,
  disabled,
}: {
  suites: SuiteInfo[];
  selected: string[];
  onChange: (ids: string[]) => void;
  maxTasksPerSuite: number | null;
  onPreset: (p: Preset) => void;
  activePresetId: string | null;
  disabled?: boolean;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : suites.map((s) => s.id).filter((x) => x === id || selected.includes(x)));
  const totalTasks = suites.filter((s) => selected.includes(s.id)).reduce((n, s) => n + tasksPerSuite(s, maxTasksPerSuite), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Presets</span>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {PRESETS.map((p) => {
            const active = p.id === activePresetId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => onPreset(p)}
                aria-pressed={active}
                className={cn(
                  "flex min-w-0 flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                  active ? "border-accent-line bg-accent-soft" : "border-border bg-surface-2 hover:border-border-strong",
                )}
              >
                <span className="flex w-full items-center justify-between gap-1 text-xs font-medium text-fg">
                  {p.label}
                  {active ? <IconCheck size={12} className="text-accent-text" /> : null}
                </span>
                <span className="line-clamp-2 text-[11px] leading-snug text-fg-muted">{p.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          <span className="num text-fg">{selected.length}</span> of {suites.length} suites ·{" "}
          <span className="num text-fg">{formatNumber(totalTasks)}</span> tasks
          {maxTasksPerSuite ? <span className="text-fg-subtle"> (capped at {maxTasksPerSuite}/suite)</span> : null}
        </p>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" disabled={disabled} onClick={() => onChange(suites.map((s) => s.id))}>
            Select all
          </Button>
          <Button size="xs" variant="ghost" disabled={disabled} onClick={() => onChange([])}>
            None
          </Button>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {suites.map((s) => {
          const on = selected.includes(s.id);
          const used = tasksPerSuite(s, maxTasksPerSuite);
          return (
            <li
              key={s.id}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors",
                on ? "border-accent-line bg-surface" : "border-border bg-surface-2/60 opacity-80 hover:opacity-100",
              )}
            >
              <div className="flex items-start gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={() => toggle(s.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{s.name}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-fg-muted">{s.description}</span>
                  </span>
                </label>
                <DifficultyHistogram bins={s.difficultyHistogram} className="shrink-0" />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Badge tone={on ? "accent" : "neutral"} className="num">
                  {used === s.taskCount ? `${s.taskCount} tasks` : `${used} of ${s.taskCount} tasks`}
                </Badge>
                <Badge tone="outline" className="num" title="Mean human-estimated difficulty, 0 (easy) to 1 (hard)">
                  difficulty {s.meanDifficulty.toFixed(2)}
                </Badge>
                {s.categories.slice(0, 5).map((c) => (
                  <Badge key={c.name} tone="neutral">
                    {c.name} <span className="num text-fg-subtle">{c.count}</span>
                  </Badge>
                ))}
                {s.categories.length > 5 ? <Badge tone="neutral">+{s.categories.length - 5}</Badge> : null}
              </div>
              {s.examples.length ? (
                <Disclosure summary={`Example prompt${s.examples.length > 1 ? "s (easiest and hardest)" : ""}`}>
                  <div className="flex flex-col gap-2">
                    {s.examples.map((ex) => (
                      <div key={ex.id} className="rounded-md border border-border bg-bg-subtle">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border px-2.5 py-1.5 font-mono text-[10.5px] text-fg-subtle">
                          <span className="truncate text-fg-muted">{ex.id}</span>
                          <span>{ex.category}</span>
                          <span>difficulty {ex.difficulty.toFixed(2)}</span>
                        </div>
                        <pre className="max-h-40 overflow-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg">
                          {ex.prompt}
                        </pre>
                        <div className="border-t border-border px-2.5 py-1.5 text-[11px] text-fg-muted">
                          Expected: <span className="font-mono break-all text-fg">{ex.expected}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Disclosure>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
