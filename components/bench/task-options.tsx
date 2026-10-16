"use client";

import { useId } from "react";
import type { SuiteInfo } from "@/lib/bench/types";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/client/cn";
import { formatNumber } from "@/lib/client/format";
import { MAX_CONCURRENCY, MAX_REPETITIONS, tasksPerSuite } from "@/lib/client/bench";
import { PRESETS, type LauncherConfig, type Preset } from "./config";

function firstSentence(s: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  return (m ? m[1] : s).replace(/\s*\(.*?\)/g, "");
}

function int(v: string, min: number, max: number): number | null {
  const n = Number(v);
  return v.trim() && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : null;
}

export function TaskOptions({
  suites,
  selected,
  config,
  onChange,
  presetHint,
}: {
  suites: SuiteInfo[];
  selected: string[];
  config: LauncherConfig;
  onChange: (patch: Partial<LauncherConfig>) => void;
  /** Time estimate for a preset with the current routers, e.g. "about 1 minute". */
  presetHint: (p: Preset) => string;
}) {
  const id = useId();
  const chosen = suites.filter((s) => selected.includes(s.id));
  const count = (cap: number | null) => chosen.reduce((n, s) => n + tasksPerSuite(s, cap), 0);
  const active = PRESETS.find((p) => (p.maxTasksPerSuite ?? null) === (config.maxTasksPerSuite ?? null) && p.repetitions === config.repetitions);
  const describe = (p: Preset) => {
    const n = formatNumber(count(p.maxTasksPerSuite));
    const what =
      p.id === "quick" ? `About ${n} tasks` : p.repetitions > 1 ? `All ${n} tasks, ${p.repetitions} times each` : `All ${n} tasks`;
    return `${what}, ${presetHint(p)}`;
  };
  const toggle = (sid: string) =>
    onChange({
      suiteIds: selected.includes(sid) ? selected.filter((x) => x !== sid) : suites.map((s) => s.id).filter((x) => x === sid || selected.includes(x)),
    });

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="How many tasks" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PRESETS.map((p) => {
          const on = active?.id === p.id;
          return (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors",
                on ? "border-fg/60 bg-surface-2" : "border-border hover:border-border-strong",
              )}
            >
              <input
                type="radio"
                name={`${id}-preset`}
                checked={on}
                onChange={() => onChange({ maxTasksPerSuite: p.maxTasksPerSuite, repetitions: p.repetitions })}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--fg)]"
              />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-fg">{p.label}</span>
                <span className="block text-sm text-fg-muted">{describe(p)}</span>
              </span>
            </label>
          );
        })}
      </div>

      <Disclosure summary={active ? "Customize" : "Customize (custom settings in use)"}>
        <div className="flex flex-col gap-6 pt-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-medium text-fg">
              <span>Task sets</span>
              <span className="flex gap-1">
                <Button size="xs" variant="ghost" onClick={() => onChange({ suiteIds: suites.map((s) => s.id) })}>
                  All
                </Button>
                <Button size="xs" variant="ghost" onClick={() => onChange({ suiteIds: [] })}>
                  None
                </Button>
              </span>
            </legend>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {suites.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--fg)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px] text-fg">
                          {s.name}
                          {s.optional ? <span className="ml-2 text-[13px] text-fg-muted">Off unless picked</span> : null}
                        </span>
                        <span className="num shrink-0 text-[13px] text-fg-muted">{s.taskCount} tasks</span>
                      </span>
                      <span className="block truncate text-sm text-fg-muted" title={s.description}>
                        {firstSentence(s.description)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Times to run each task" htmlFor={`${id}-reps`} hint="More runs show how consistent each router is.">
              <Input
                id={`${id}-reps`}
                type="number"
                min={1}
                max={MAX_REPETITIONS}
                value={config.repetitions}
                onChange={(e) => onChange({ repetitions: int(e.target.value, 1, MAX_REPETITIONS) ?? 1 })}
                aria-describedby={`${id}-reps-hint`}
              />
            </Field>
            <Field label="Tasks per set" htmlFor={`${id}-cap`} hint="Leave empty to use every task.">
              <Input
                id={`${id}-cap`}
                type="number"
                min={1}
                placeholder="All"
                value={config.maxTasksPerSuite ?? ""}
                onChange={(e) => onChange({ maxTasksPerSuite: int(e.target.value, 1, 10_000) })}
                aria-describedby={`${id}-cap-hint`}
              />
            </Field>
            <Field label="Calls at once" htmlFor={`${id}-conc`} hint="Lower this if a router rate-limits you.">
              <Input
                id={`${id}-conc`}
                type="number"
                min={1}
                max={MAX_CONCURRENCY}
                value={config.concurrency}
                onChange={(e) => onChange({ concurrency: int(e.target.value, 1, MAX_CONCURRENCY) ?? 1 })}
                aria-describedby={`${id}-conc-hint`}
              />
            </Field>
            <Field label="Temperature" htmlFor={`${id}-temp`} hint="0 gives the most repeatable answers.">
              <Input
                id={`${id}-temp`}
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={config.temperature}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange({ temperature: Number.isFinite(n) ? Math.min(2, Math.max(0, Math.round(n * 10) / 10)) : 0 });
                }}
                aria-describedby={`${id}-temp-hint`}
              />
            </Field>
            <Field label="Max answer length (tokens)" htmlFor={`${id}-max`} hint="Leave empty for each router's default.">
              <Input
                id={`${id}-max`}
                type="number"
                min={1}
                placeholder="Router default"
                value={config.maxTokens ?? ""}
                onChange={(e) => onChange({ maxTokens: int(e.target.value, 1, 200_000) })}
                aria-describedby={`${id}-max-hint`}
              />
            </Field>
            <Field label="Seed" htmlFor={`${id}-seed`} hint="Set a number to repeat the exact same run later.">
              <Input
                id={`${id}-seed`}
                type="number"
                placeholder="Random"
                value={config.seed ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange({ seed: e.target.value.trim() && Number.isInteger(n) && Math.abs(n) <= 2 ** 31 ? n : null });
                }}
                aria-describedby={`${id}-seed-hint`}
              />
            </Field>
            <Field label="Name" htmlFor={`${id}-name`} hint="Optional. Shown in Results." className="sm:col-span-2">
              <Input
                id={`${id}-name`}
                placeholder="e.g. Enclave vs OpenRouter, math heavy"
                maxLength={200}
                value={config.name}
                onChange={(e) => onChange({ name: e.target.value })}
                aria-describedby={`${id}-name-hint`}
              />
            </Field>
          </div>
        </div>
      </Disclosure>
    </div>
  );
}
