"use client";

import { useId, useState, type RefObject } from "react";
import type { ProviderStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Textarea } from "@/components/ui/field";
import { IconChevronDown, IconPlus, IconSliders, IconX } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/client/cn";
import { useProviderModels } from "@/lib/client/providers";
import { Popover } from "./popover";
import type { ArmConfig, GenSettings, ProviderMap } from "./types";

const MAX_ROUTERS = 8;

function newKey() {
  return `arm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Prompt box, selected routers, settings and the Send button, in one card. */
export function Composer({
  prompt,
  onPrompt,
  promptRef,
  system,
  onSystem,
  arms,
  onArms,
  providers,
  providerMap,
  settings,
  onSettings,
  running,
  canRun,
  onRun,
  onStop,
}: {
  prompt: string;
  onPrompt: (v: string) => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  system: string;
  onSystem: (v: string) => void;
  arms: ArmConfig[];
  onArms: (arms: ArmConfig[]) => void;
  providers: ProviderStatus[];
  providerMap: ProviderMap;
  settings: GenSettings;
  onSettings: (patch: Partial<GenSettings>) => void;
  running: boolean;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  const id = useId();
  const update = (key: string, patch: Partial<ArmConfig>) => onArms(arms.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  return (
    <section aria-label="Prompt" className="rounded-xl border border-border bg-surface focus-within:border-border-strong">
      <label htmlFor={`${id}-prompt`} className="sr-only">
        Prompt
      </label>
      <textarea
        id={`${id}-prompt`}
        ref={promptRef}
        value={prompt}
        onChange={(e) => onPrompt(e.target.value)}
        rows={5}
        placeholder="Ask something. Every router gets exactly the same request."
        className="block min-h-[140px] w-full resize-y rounded-t-xl bg-transparent px-5 pt-4 pb-3 text-[15px] leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <ul aria-label="Routers to compare" className="flex flex-wrap items-center gap-2">
          {arms.map((a) => (
            <li key={a.key}>
              <RouterChip
                arm={a}
                provider={providerMap[a.providerId]}
                disabled={running}
                onModel={(model) => update(a.key, { model })}
                onRemove={arms.length > 1 ? () => onArms(arms.filter((x) => x.key !== a.key)) : undefined}
              />
            </li>
          ))}
          <li>
            <AddRouter
              providers={providers}
              disabled={running || arms.length >= MAX_ROUTERS}
              onAdd={(providerId) => onArms([...arms, { key: newKey(), providerId, model: "" }])}
            />
          </li>
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <SettingsMenu settings={settings} onSettings={onSettings} system={system} onSystem={onSystem} />
          {running ? (
            <Button variant="secondary" size="md" onClick={onStop}>
              Stop
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="md"
            onClick={onRun}
            disabled={!canRun}
            loading={running}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            title="Send (Ctrl or Cmd + Enter)"
          >
            {running ? "Sending" : "Send"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function RouterChip({
  arm,
  provider,
  disabled,
  onModel,
  onRemove,
}: {
  arm: ArmConfig;
  provider?: ProviderStatus;
  disabled?: boolean;
  onModel: (model: string) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const [wantModels, setWantModels] = useState(false);
  const { models, loading } = useProviderModels(arm.providerId, wantModels);
  const options = Array.from(
    new Set([...(provider?.autoModel ? [provider.autoModel] : []), ...(provider?.suggestedModels ?? []), ...models]),
  );
  const name = provider?.name ?? arm.providerId;
  const missing = provider && !provider.configured;

  return (
    <div
      className={cn(
        "flex h-8 items-center rounded-lg border bg-surface-2 text-sm",
        missing ? "border-warning/40" : "border-border",
      )}
    >
      <Popover
        label={`${name} options`}
        trigger={({ toggle, open, props: aria }) => (
          <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            {...aria}
            className="flex h-full min-w-0 items-center gap-2 rounded-l-lg pr-1.5 pl-2.5 text-fg hover:bg-surface-3 disabled:opacity-60"
          >
            <ProviderDot provider={provider} />
            <span className="max-w-[160px] truncate font-medium">{name}</span>
            {arm.model ? <span className="max-w-[140px] truncate text-fg-muted">{arm.model}</span> : null}
            <span className="sr-only">{open ? "(close options)" : "(change model)"}</span>
          </button>
        )}
      >
        <div className="flex flex-col gap-2 p-4">
          <Label htmlFor={`${id}-model`}>Model</Label>
          <Combobox
            id={`${id}-model`}
            value={arm.model}
            onChange={onModel}
            options={options}
            loading={loading}
            onOpen={() => setWantModels(true)}
            placeholder={provider?.defaultModel ? `Default: ${provider.defaultModel}` : "Let the router choose"}
          />
          <p className="text-[13px] text-fg-muted">Leave empty to let the router choose.</p>
          {missing ? <p className="text-[13px] text-warning">This router has no API key yet, so it will return an error.</p> : null}
        </div>
      </Popover>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${name}`}
          className="flex h-full items-center rounded-r-lg px-1.5 text-fg-subtle hover:bg-surface-3 hover:text-fg disabled:opacity-60"
        >
          <IconX size={14} />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </div>
  );
}

function AddRouter({
  providers,
  onAdd,
  disabled,
}: {
  providers: ProviderStatus[];
  onAdd: (providerId: string) => void;
  disabled?: boolean;
}) {
  const sorted = [...providers].sort((a, b) => rank(a) - rank(b));
  return (
    <Popover
      label="Add a router"
      className="w-[min(300px,calc(100vw-2rem))]"
      trigger={({ toggle, props: aria }) => (
        <Button size="sm" variant="ghost" onClick={toggle} disabled={disabled} leftIcon={<IconPlus size={15} />} {...aria}>
          Add router
        </Button>
      )}
    >
      {(close) => (
        <ul className="max-h-80 overflow-y-auto py-1.5">
          {sorted.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd(p.id);
                  close();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-fg hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              >
                <ProviderDot provider={p} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[13px] text-fg-muted">{p.simulated ? "Practice" : p.configured ? "" : "No key"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

function rank(p: ProviderStatus) {
  if (p.configured && !p.simulated) return 0;
  if (p.simulated) return 1;
  return 2;
}

function SettingsMenu({
  settings,
  onSettings,
  system,
  onSystem,
}: {
  settings: GenSettings;
  onSettings: (patch: Partial<GenSettings>) => void;
  system: string;
  onSystem: (v: string) => void;
}) {
  const id = useId();
  const notes = [settings.blind ? "blind" : null, settings.repeat > 1 ? `${settings.repeat} runs` : null].filter(Boolean);
  return (
    <Popover
      label="Settings"
      align="end"
      className="w-[min(360px,calc(100vw-2rem))] max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:w-auto"
      trigger={({ toggle, open, props: aria }) => (
        <Button size="md" variant="ghost" onClick={toggle} leftIcon={<IconSliders size={15} />} {...aria}>
          Settings
          {notes.length ? <span className="text-fg-muted max-sm:hidden">· {notes.join(", ")}</span> : null}
          <IconChevronDown size={14} className={cn("text-fg-subtle transition-transform", open && "rotate-180")} />
        </Button>
      )}
    >
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-system`}>System prompt</Label>
          <Textarea
            id={`${id}-system`}
            value={system}
            onChange={(e) => onSystem(e.target.value)}
            rows={3}
            placeholder="Optional. For example: You are a concise senior engineer."
          />
        </div>
        <Slider
          id={`${id}-temp`}
          label="Temperature"
          value={settings.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => onSettings({ temperature: v })}
          format={(v) => v.toFixed(2)}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-max`}>Max tokens</Label>
            <Input
              id={`${id}-max`}
              type="number"
              inputMode="numeric"
              min={1}
              max={32000}
              value={settings.maxTokens}
              onChange={(e) => onSettings({ maxTokens: Math.max(1, Math.min(32000, Number(e.target.value) || 1)) })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-seed`}>Seed</Label>
            <Input
              id={`${id}-seed`}
              type="number"
              inputMode="numeric"
              placeholder="Random"
              value={settings.seed ?? ""}
              onChange={(e) => onSettings({ seed: e.target.value === "" ? null : Math.trunc(Number(e.target.value)) })}
            />
          </div>
        </div>
        <Slider
          id={`${id}-repeat`}
          label="Runs per router"
          value={settings.repeat}
          min={1}
          max={10}
          onChange={(v) => onSettings({ repeat: v })}
          format={(v) => (v === 1 ? "1 run" : `${v} runs`)}
        />
        <Toggle
          checked={settings.blind}
          onChange={(v) => onSettings({ blind: v })}
          label="Blind mode"
          description="Shuffle the answers and hide router names until you vote."
        />
      </div>
    </Popover>
  );
}
