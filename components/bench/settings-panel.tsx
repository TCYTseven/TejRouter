"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { IconDice, IconX } from "@/components/ui/icons";
import { Slider } from "@/components/ui/slider";
import { MAX_CONCURRENCY, MAX_REPETITIONS, randomSeed } from "@/lib/client/bench";
import type { LauncherConfig } from "./config";

function parsePositiveInt(v: string): number | null {
  const n = Number(v);
  return v.trim() && Number.isInteger(n) && n > 0 ? n : null;
}

export function SettingsPanel({
  config,
  onChange,
  disabled,
}: {
  config: LauncherConfig;
  onChange: (patch: Partial<LauncherConfig>) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <Slider
        id={`${id}-reps`}
        label="Repetitions per task"
        min={1}
        max={MAX_REPETITIONS}
        value={config.repetitions}
        onChange={(repetitions) => onChange({ repetitions })}
        format={(v) => `${v}×`}
        disabled={disabled}
      />
      <Slider
        id={`${id}-conc`}
        label="Concurrency"
        min={1}
        max={MAX_CONCURRENCY}
        value={config.concurrency}
        onChange={(concurrency) => onChange({ concurrency })}
        format={(v) => `${v} parallel`}
        disabled={disabled}
      />
      <Slider
        id={`${id}-temp`}
        label="Temperature"
        min={0}
        max={2}
        step={0.1}
        value={config.temperature}
        onChange={(temperature) => onChange({ temperature: Math.round(temperature * 10) / 10 })}
        format={(v) => (v === 0 ? "0 (deterministic)" : v.toFixed(1))}
        disabled={disabled}
      />
      <Field label="Max tokens" htmlFor={`${id}-max`} hint="Per response. Empty uses each router's default.">
        <Input
          id={`${id}-max`}
          mono
          inputMode="numeric"
          placeholder="router default"
          value={config.maxTokens ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ maxTokens: parsePositiveInt(e.target.value) })}
          aria-describedby={`${id}-max-hint`}
        />
      </Field>
      <Field
        label="Max tasks per suite"
        htmlFor={`${id}-cap`}
        hint="Difficulty-stratified, seeded sample. Empty runs every task."
      >
        <Input
          id={`${id}-cap`}
          mono
          inputMode="numeric"
          placeholder="all tasks"
          value={config.maxTasksPerSuite ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ maxTasksPerSuite: parsePositiveInt(e.target.value) })}
          aria-describedby={`${id}-cap-hint`}
        />
      </Field>
      <Field label="Seed" htmlFor={`${id}-seed`} hint="Fixes task sampling, job order and simulator draws. Empty = random, recorded with the run.">
        <div className="flex gap-1.5">
          <Input
            id={`${id}-seed`}
            mono
            inputMode="numeric"
            placeholder="random"
            value={config.seed ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({ seed: e.target.value.trim() && Number.isInteger(n) && Math.abs(n) <= 2 ** 31 ? n : null });
            }}
            aria-describedby={`${id}-seed-hint`}
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label="Randomize seed"
            title="Randomize seed"
            disabled={disabled}
            onClick={() => onChange({ seed: randomSeed() })}
          >
            <IconDice size={15} />
          </Button>
          {config.seed != null ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear seed"
              title="Clear seed"
              disabled={disabled}
              onClick={() => onChange({ seed: null })}
            >
              <IconX size={14} />
            </Button>
          ) : null}
        </div>
      </Field>
      <Field label="Run name" htmlFor={`${id}-name`} hint="Optional. Defaults to the suites and date." className="sm:col-span-2">
        <Input
          id={`${id}-name`}
          placeholder="e.g. Cyberouter vs OpenRouter, math heavy"
          maxLength={200}
          value={config.name}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-describedby={`${id}-name-hint`}
        />
      </Field>
    </div>
  );
}
