"use client";

import { useId, useMemo, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import type { BenchArm } from "@/lib/bench/types";
import { normalizeArms } from "@/lib/bench/arms";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/field";
import { IconPlus, IconX } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { MAX_ARMS } from "@/lib/client/bench";
import { useProviderModels } from "@/lib/client/providers";
import { SIM_BASELINES, draftArmId, newArmKey, type ArmDraft } from "./config";

/** Preview of the routers the server will build: canonical ids, labels and colors. */
export function useNormalizedArms(arms: ArmDraft[]): Map<string, BenchArm> {
  return useMemo(() => {
    const norm = normalizeArms(arms.map((a) => ({ providerId: a.providerId, ...(a.model.trim() ? { model: a.model.trim() } : {}) })));
    return new Map(norm.map((a) => [a.id, a]));
  }, [arms]);
}

export function RouterList({
  arms,
  onChange,
  providers,
}: {
  arms: ArmDraft[];
  onChange: (arms: ArmDraft[]) => void;
  providers: ProviderStatus[];
}) {
  const providerMap = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const norm = useNormalizedArms(arms);
  const ids = arms.map(draftArmId);
  const missingBaselines = SIM_BASELINES.filter((b) => !ids.includes(draftArmId(b)));
  const full = arms.length >= MAX_ARMS;

  const add = (providerId: string, model: string) => {
    const draft = { providerId, model: model.trim() };
    if (ids.includes(draftArmId(draft))) return false;
    onChange([...arms, { ...draft, key: newArmKey() }]);
    return true;
  };

  return (
    <div className="flex flex-col gap-4">
      {arms.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {arms.map((a, i) => {
            const p = providerMap[a.providerId];
            const arm = norm.get(ids[i]);
            const dupe = ids.indexOf(ids[i]) !== i;
            const noKey = p && !p.configured && !p.simulated;
            const model = a.model.trim();
            return (
              <li key={a.key} className="flex items-center gap-3 px-4 py-2.5">
                <ProviderDot provider={p} color={arm?.color} size={10} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-fg">{p?.name ?? a.providerId}</p>
                  <p className="truncate text-[13px] text-fg-muted">
                    {dupe
                      ? "Listed twice, so this copy will be skipped"
                      : noKey
                        ? "No API key, so its calls will fail"
                        : model
                          ? `Always uses ${model}`
                          : "Picks the model for each task"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${p?.name ?? a.providerId}${model ? ` (${model})` : ""}`}
                  title="Remove"
                  onClick={() => onChange(arms.filter((x) => x.key !== a.key))}
                >
                  <IconX size={15} />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <AddRouter providers={providers} onAdd={add} disabled={full} />

      <p className="text-sm text-fg-muted">
        Adding a fixed model, such as one cheap and one strong model, gives the report a baseline: it can then show how close
        each router gets to the best possible choice.
        {missingBaselines.length && arms.length + missingBaselines.length <= MAX_ARMS ? (
          <>
            {" "}
            <button
              type="button"
              className="font-medium text-link hover:underline"
              onClick={() => onChange([...arms, ...missingBaselines.map((b) => ({ ...b, key: newArmKey() }))])}
            >
              Add practice baselines
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

function AddRouter({
  providers,
  onAdd,
  disabled,
}: {
  providers: ProviderStatus[];
  onAdd: (providerId: string, model: string) => boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const sorted = useMemo(
    () => [...providers].sort((a, b) => Number(b.configured || !!b.simulated) - Number(a.configured || !!a.simulated)),
    [providers],
  );
  const [providerId, setProviderId] = useState(sorted[0]?.id ?? "");
  const [model, setModel] = useState("");
  const [wantModels, setWantModels] = useState(false);
  const [dupe, setDupe] = useState(false);
  const provider = providers.find((p) => p.id === providerId);
  const { models, loading } = useProviderModels(providerId, wantModels);
  const options = Array.from(new Set([...(provider?.suggestedModels ?? []), ...models])).filter((m) => m !== provider?.autoModel);

  const submit = () => {
    if (!providerId) return;
    if (onAdd(providerId, model)) {
      setModel("");
      setDupe(false);
    } else setDupe(true);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={`${id}-provider`} className="sr-only">
          Router to add
        </label>
        <Select
          id={`${id}-provider`}
          value={providerId}
          disabled={disabled}
          className="sm:w-56"
          onChange={(e) => {
            setProviderId(e.target.value);
            setModel("");
            setDupe(false);
          }}
        >
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.simulated || p.configured ? "" : " (no API key)"}
            </option>
          ))}
        </Select>
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-model`} className="sr-only">
            Fixed model (optional)
          </label>
          <Combobox
            id={`${id}-model`}
            value={model}
            onChange={(v) => {
              setModel(v);
              setDupe(false);
            }}
            options={options}
            loading={loading}
            onOpen={() => setWantModels(true)}
            placeholder="Fixed model (optional)"
            footer="Leave empty to let the router choose."
          />
        </div>
        <Button variant="secondary" leftIcon={<IconPlus size={14} />} disabled={disabled || !providerId} onClick={submit}>
          Add router
        </Button>
      </div>
      {dupe ? <p className="text-[13px] text-fg-muted">That router is already in the list.</p> : null}
      {disabled ? <p className="text-[13px] text-fg-muted">You have reached the limit of {MAX_ARMS} routers.</p> : null}
    </div>
  );
}
