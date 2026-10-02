"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { IconRefresh, IconSearch } from "@/components/ui/icons";
import { SkeletonText } from "@/components/ui/skeleton";
import { useProviderModels } from "@/lib/client/providers";

/** Lazily discovered model list with search. Nothing is fetched until opened. */
export function ModelList({ providerId, suggested }: { providerId: string; suggested: string[] }) {
  const [enabled, setEnabled] = useState(false);
  const [query, setQuery] = useState("");
  const { models, error, loading, reload } = useProviderModels(providerId, enabled);

  if (!enabled) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" leftIcon={<IconSearch size={13} />} onClick={() => setEnabled(true)}>
          Discover models
        </Button>
        {suggested.length ? (
          <span className="text-[11px] text-fg-subtle">
            Suggested: <span className="font-mono text-fg-muted">{suggested.join(", ")}</span>
          </span>
        ) : null}
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const list = q ? models.filter((m) => m.toLowerCase().includes(q)) : models;

  return (
    <div className="flex flex-col gap-2" aria-busy={loading}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <IconSearch size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={loading ? "Loading…" : `Search ${models.length} models`}
            aria-label={`Search models for ${providerId}`}
            className="h-7 w-full rounded-md border border-border bg-surface-2 pr-2 pl-7 font-mono text-[12px] text-fg placeholder:font-sans placeholder:text-fg-subtle focus:border-accent-line focus:ring-2 focus:ring-accent-soft focus:outline-none"
          />
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Refresh model list" title="Refresh" onClick={reload} loading={loading}>
          {loading ? null : <IconRefresh size={13} />}
        </Button>
      </div>
      {error ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-2.5 py-1.5 text-[11px] text-warning">
          Discovery failed: {error}
          {models.length ? " (showing fallback list)" : ""}
        </p>
      ) : null}
      {loading && !models.length ? (
        <SkeletonText lines={3} />
      ) : list.length ? (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border bg-bg-subtle">
          {list.map((m) => (
            <li key={m} className="group flex items-center justify-between gap-2 px-2.5 py-1">
              <span className="truncate font-mono text-[11.5px] text-fg-muted">{m}</span>
              <CopyButton text={m} iconOnly label={`Copy ${m}`} size="xs" toastTitle="Model id copied" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-fg-subtle">{q ? "No models match." : "No models reported."}</p>
      )}
      <p className="num text-[10px] text-fg-subtle">
        {list.length}
        {q ? ` of ${models.length}` : ""} models
      </p>
    </div>
  );
}
