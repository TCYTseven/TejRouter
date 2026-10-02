"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { IconCheck, IconPlus, IconX } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { useProviderModels } from "@/lib/client/providers";
import { LETTERS, type ArmConfig, type ProviderMap } from "./types";

/** Grid of arm cards (provider + optional pinned model) with an add menu. */
export function ArmPicker({
  arms,
  onChange,
  providers,
  providerMap,
  disabled,
  blind,
}: {
  arms: ArmConfig[];
  onChange: (arms: ArmConfig[]) => void;
  providers: ProviderStatus[];
  providerMap: ProviderMap;
  disabled?: boolean;
  blind?: boolean;
}) {
  const update = (key: string, patch: Partial<ArmConfig>) =>
    onChange(arms.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const remove = (key: string) => onChange(arms.filter((a) => a.key !== key));
  const add = (providerId: string) =>
    onChange([...arms, { key: `arm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, providerId, model: "" }]);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {arms.map((a, i) => {
        const p = providerMap[a.providerId];
        return (
          <ArmCard
            key={a.key}
            index={i}
            arm={a}
            provider={p}
            providers={providers}
            onProvider={(providerId) => update(a.key, { providerId, model: "" })}
            onModel={(model) => update(a.key, { model })}
            onRemove={arms.length > 1 ? () => remove(a.key) : undefined}
            disabled={disabled}
            blind={blind}
          />
        );
      })}
      <AddArmMenu providers={providers} onAdd={add} disabled={disabled || arms.length >= 8} />
    </div>
  );
}

function ArmCard({
  index,
  arm,
  provider,
  providers,
  onProvider,
  onModel,
  onRemove,
  disabled,
  blind,
}: {
  index: number;
  arm: ArmConfig;
  provider: ProviderStatus | undefined;
  providers: ProviderStatus[];
  onProvider: (id: string) => void;
  onModel: (m: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
  blind?: boolean;
}) {
  const id = useId();
  const [wantModels, setWantModels] = useState(false);
  const { models, loading } = useProviderModels(arm.providerId, wantModels);
  const options = Array.from(new Set([...(provider?.autoModel ? [provider.autoModel] : []), ...(provider?.suggestedModels ?? []), ...models]));
  const missing = provider && !provider.configured;

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-2 rounded-lg border bg-surface p-2.5 transition-colors",
        missing ? "border-warning/40" : "border-border hover:border-border-strong",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border-strong bg-surface-2 text-[10px] font-semibold text-fg-muted">
          {blind ? "?" : (LETTERS[index] ?? index + 1)}
        </span>
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
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            aria-label={`Remove arm ${index + 1} (${provider?.name ?? arm.providerId})`}
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
          placeholder={`default · ${provider?.defaultModel || "auto"}`}
          footer={arm.model ? <button type="button" className="hover:text-fg" onMouseDown={(e) => { e.preventDefault(); onModel(""); }}>Reset to default</button> : "Leave empty to let the router decide"}
        />
      </div>
      {missing ? <p className="text-[10.5px] text-warning">No key configured: this arm will return an error.</p> : null}
    </div>
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
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="flex h-full min-h-[86px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-xs font-medium text-fg-muted transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <IconPlus size={14} /> Add router
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Add a router arm"
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
