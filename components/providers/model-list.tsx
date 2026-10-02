"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconSearch } from "@/components/ui/icons";
import { SkeletonText } from "@/components/ui/skeleton";
import { useProviderModels } from "@/lib/client/providers";

/** Searchable list of the router's models. Nothing is fetched until asked. */
export function ModelList({ providerId, providerName }: { providerId: string; providerName: string }) {
  const [enabled, setEnabled] = useState(false);
  const [query, setQuery] = useState("");
  const { models, error, loading, reload } = useProviderModels(providerId, enabled);

  if (!enabled) {
    return (
      <Button size="sm" variant="secondary" className="self-start" onClick={() => setEnabled(true)}>
        Show available models
      </Button>
    );
  }

  const q = query.trim().toLowerCase();
  const list = q ? models.filter((m) => m.toLowerCase().includes(q)) : models;

  return (
    <div className="flex flex-col gap-2" aria-busy={loading}>
      <div className="relative">
        <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={loading ? "Loading models…" : `Search ${models.length} models`}
          aria-label={`Search ${providerName} models`}
          className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm text-fg placeholder:text-fg-subtle hover:border-border-strong focus:border-link focus:ring-2 focus:ring-link/20 focus:outline-none"
        />
      </div>
      {error ? (
        <p className="text-[13px] text-warning">
          Could not load the live model list ({error}).{models.length ? " Showing the built-in list instead." : ""}{" "}
          <button type="button" onClick={reload} className="text-link hover:underline">
            Try again
          </button>
        </p>
      ) : null}
      {loading && !models.length ? (
        <SkeletonText lines={3} />
      ) : list.length ? (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-border">
          {list.map((m) => (
            <li key={m} className="border-b border-border px-3 py-1.5 last:border-b-0">
              <code className="text-[13px] break-all text-fg-muted">{m}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-muted">{q ? "No models match." : "This router did not report any models."}</p>
      )}
    </div>
  );
}
