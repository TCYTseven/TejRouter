"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import type { BenchArm } from "@/lib/bench/types";
import { normalizeArms } from "@/lib/bench/arms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { IconCheck, IconInfo, IconPlus, IconX } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { MAX_ARMS } from "@/lib/client/bench";
import { useProviderModels } from "@/lib/client/providers";
import { SIM_BASELINES, draftArmId, newArmKey, type ArmDraft } from "./config";

/** Preview of the arms the server will build: canonical ids, labels and colors. */
export function useNormalizedArms(arms: ArmDraft[]): Map<string, BenchArm> {
  return useMemo(() => {
    const norm = normalizeArms(arms.map((a) => ({ providerId: a.providerId, ...(a.model.trim() ? { model: a.model.trim() } : {}) })));
    return new Map(norm.map((a) => [a.id, a]));
  }, [arms]);
}

export function ArmBuilder({
  arms,
  onChange,
  providers,
  disabled,
}: {
  arms: ArmDraft[];
  onChange: (arms: ArmDraft[]) => void;
  providers: ProviderStatus[];
  disabled?: boolean;
}) {
  const providerMap = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const norm = useNormalizedArms(arms);
  const ids = arms.map(draftArmId);
  const update = (key: string, patch: Partial<ArmDraft>) => onChange(arms.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const remove = (key: string) => onChange(arms.filter((a) => a.key !== key));
  const add = (providerId: string, model = "") => onChange([...arms, { key: newArmKey(), providerId, model }]);
  const missingBaselines = SIM_BASELINES.filter((b) => !ids.includes(draftArmId(b)));
  const full = arms.length >= MAX_ARMS;

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {arms.map((a, i) => {
          const id = ids[i];
          const dupe = ids.indexOf(id) !== i;
          return (
            <ArmCard
              key={a.key}
              index={i}
              arm={a}
              preview={dupe ? undefined : norm.get(id)}
              duplicate={dupe}
              provider={providerMap[a.providerId]}
              providers={providers}
              onProvider={(providerId) => update(a.key, { providerId, model: "" })}
              onModel={(model) => update(a.key, { model })}
              onRemove={arms.length > 1 ? () => remove(a.key) : undefined}
              disabled={disabled}
            />
          );
        })}
        <li>
          <AddArmMenu providers={providers} onAdd={(id) => add(id)} disabled={disabled || full} />
        </li>
      </ul>

      <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface-2/70 p-3 sm:flex-row sm:items-start">
        <IconInfo size={15} className="mt-0.5 shrink-0 text-info" />
        <div className="min-w-0 flex-1 text-xs leading-relaxed text-fg-muted">
          <p>
            <span className="font-medium text-fg">Pinned baselines</span> are arms with a fixed model, for example a cheap
            and a strong model through OpenRouter. They are the yardstick a router is judged against: with at least one
            cheap and one strong pinned arm, the report can build a per-task <em>oracle</em> (the cheapest model that got
            each task right) and measure each router&apos;s <em>regret</em> and how much of the cheap-to-strong quality gap it
            recovers.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          leftIcon={<IconPlus size={13} />}
          disabled={disabled || missingBaselines.length === 0 || arms.length + missingBaselines.length > MAX_ARMS}
          onClick={() => onChange([...arms, ...missingBaselines.map((b) => ({ ...b, key: newArmKey() }))])}
        >
          {missingBaselines.length ? "Add simulator baselines (sim/small, sim/large)" : "Simulator baselines added"}
        </Button>
      </div>
    </div>
  );
}

function ArmCard({
  index,
  arm,
  preview,
  duplicate,
  provider,
  providers,
  onProvider,
  onModel,
  onRemove,
  disabled,
}: {
  index: number;
  arm: ArmDraft;
  preview: BenchArm | undefined;
  duplicate: boolean;
  provider: ProviderStatus | undefined;
  providers: ProviderStatus[];
  onProvider: (id: string) => void;
  onModel: (m: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [wantModels, setWantModels] = useState(false);
  const { models, loading } = useProviderModels(arm.providerId, wantModels);
  const options = Array.from(
    new Set([...(provider?.autoModel ? [provider.autoModel] : []), ...(provider?.suggestedModels ?? []), ...models]),
  );
  const missing = provider && !provider.configured && !provider.simulated;
  const pinned = !!arm.model.trim() && arm.model.trim() !== provider?.autoModel;

  return (
    <li
      className={cn(
        "relative flex min-w-0 flex-col gap-2 rounded-lg border bg-surface p-2.5 transition-colors",
        missing || duplicate ? "border-warning/40" : "border-border hover:border-border-strong",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-5 w-1.5 shrink-0 rounded-full"
          style={{ background: preview?.color ?? provider?.color ?? "var(--fg-subtle)" }}
          aria-hidden="true"
        />
        <div className="relative min-w-0 flex-1">
          <label htmlFor={`${id}-provider`} className="sr-only">
            Router for arm {index + 1}
          </label>
          <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">
            <ProviderDot provider={provider} />
          </span>
          <select
            id={`${id}-provider`}
            value={arm.providerId}
            disabled={disabled}
            onChange={(e) => onProvider(e.target.value)}
            className="h-7 w-full cursor-pointer appearance-none truncate rounded-md border border-transparent bg-transparent pr-2 pl-6 text-[13px] font-medium text-fg hover:border-border hover:bg-surface-2 focus:border-accent-line focus:outline-none disabled:cursor-not-allowed"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.simulated ? " (sim)" : p.configured ? "" : " (missing key)"}
              </option>
            ))}
          </select>
        </div>
        <Badge tone={pinned ? "info" : "outline"} title={pinned ? "Fixed model: a baseline" : "The router chooses the model"}>
          {pinned ? "pinned" : "routed"}
        </Badge>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            aria-label={`Remove arm ${index + 1} (${preview?.label ?? provider?.name ?? arm.providerId})`}
          >
            <IconX size={13} />
          </button>
        ) : null}
      </div>
      <div>
        <label htmlFor={`${id}-model`} className="sr-only">
          Model for arm {index + 1}
        </label>
        <Combobox
          id={`${id}-model`}
          value={arm.model}
          onChange={onModel}
          options={options}
          loading={loading}
          onOpen={() => setWantModels(true)}
          placeholder={`default · ${provider?.defaultModel || provider?.autoModel || "auto"}`}
          footer={
            arm.model ? (
              <button
                type="button"
                className="hover:text-fg"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onModel("");
                }}
              >
                Reset to the router default
              </button>
            ) : (
              "Empty = let the router decide. Pick a model to pin a baseline."
            )
          }
        />
      </div>
      {duplicate ? (
        <p className="text-[10.5px] text-warning">Duplicate of another arm: it will be dropped.</p>
      ) : missing ? (
        <p className="text-[10.5px] text-warning">No key configured: every call on this arm will fail.</p>
      ) : (
        <p className="truncate font-mono text-[10.5px] text-fg-subtle" title={preview?.id}>
          {preview?.id}
        </p>
      )}
    </li>
  );
}

function AddArmMenu({
  providers,
  onAdd,
  disabled,
}: {
  providers: ProviderStatus[];
  onAdd: (providerId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sorted = [...providers].sort((a, b) => Number(b.configured) - Number(a.configured));

  return (
    <div ref={ref} className="relative h-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="flex h-full min-h-[92px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-xs font-medium text-fg-muted transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <IconPlus size={14} /> Add arm
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Add an arm"
          className="absolute top-full left-0 z-40 mt-1 w-64 animate-rise overflow-hidden rounded-md border border-border-strong bg-surface py-1 shadow-lg"
          onKeyDown={(e) => {
            const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
            const i = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              items[(i + 1) % items.length]?.focus();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              items[(i - 1 + items.length) % items.length]?.focus();
            }
          }}
        >
          {sorted.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(p.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-fg-muted hover:bg-surface-3 hover:text-fg focus:bg-surface-3 focus:text-fg focus:outline-none"
            >
              <ProviderDot provider={p} />
              <span className="flex-1 truncate">{p.name}</span>
              {p.simulated ? (
                <span className="text-[10px] text-info">sim</span>
              ) : p.configured ? (
                <IconCheck size={12} className="text-success" />
              ) : (
                <span className="text-[10px] text-warning">no key</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
