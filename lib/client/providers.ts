import { useCallback, useEffect, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { browserTarget, listModelsWithBrowserKey, useBrowserKeys } from "./keys";

/** Browser-side access to /api/providers and /api/providers/[id]/models. */

export async function fetchProviders(signal?: AbortSignal): Promise<ProviderStatus[]> {
  const res = await fetch("/api/providers", { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/providers failed: HTTP ${res.status}`);
  const body = (await res.json()) as { providers?: ProviderStatus[] };
  return body.providers ?? [];
}

export interface ModelList {
  models: string[];
  error: string | null;
}

const modelCache = new Map<string, Promise<ModelList>>();

/**
 * Discovered models for a provider. Cached per page load; pass force to refetch. With a
 * key saved in Settings the browser asks the router directly.
 */
export function fetchModels(providerId: string, force = false): Promise<ModelList> {
  const target = browserTarget(providerId);
  const cacheKey = target ? `${providerId}\u0000${target.baseUrl}\u0000${(target.apiKey ?? "").slice(-4)}` : providerId;
  if (!force) {
    const hit = modelCache.get(cacheKey);
    if (hit) return hit;
  }
  const p = target
    ? listModelsWithBrowserKey(target)
    : fetch(`/api/providers/${encodeURIComponent(providerId)}/models`, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return { models: [], error: `HTTP ${res.status}` };
      const body = (await res.json()) as Partial<ModelList>;
      return { models: Array.isArray(body.models) ? body.models : [], error: body.error ?? null };
    })
    .catch((e: unknown) => ({ models: [], error: e instanceof Error ? e.message : String(e) }));
  modelCache.set(cacheKey, p);
  // Do not cache failures forever: allow a retry on next call.
  p.then((r) => {
    if (r.error && !r.models.length) modelCache.delete(cacheKey);
  });
  return p;
}

/**
 * Provider statuses. Pass `initial` (from a Server Component) to skip the
 * first fetch entirely.
 */
export function useProviders(initial?: ProviderStatus[]) {
  const [state, setState] = useState<{ providers: ProviderStatus[] | null; error: string | null; refreshing: boolean }>({
    providers: initial ?? null,
    error: null,
    refreshing: false,
  });
  const [nonce, setNonce] = useState(initial ? 0 : 1);

  useEffect(() => {
    if (nonce === 0) return;
    const ctl = new AbortController();
    fetchProviders(ctl.signal)
      .then((providers) => setState({ providers, error: null, refreshing: false }))
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setState((s) => ({ ...s, refreshing: false, error: e instanceof Error ? e.message : String(e) }));
      });
    return () => ctl.abort();
  }, [nonce]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, refreshing: true }));
    setNonce((n) => n + 1);
  }, []);
  return {
    providers: state.providers,
    error: state.error,
    /** First load (no data yet). */
    loading: state.providers == null && state.error == null,
    /** A reload() is in flight. */
    refreshing: state.refreshing,
    reload,
  };
}

/**
 * Lazily discovered models for one provider. Does nothing until `enabled`.
 * `loading` is derived so no state is set synchronously inside effects.
 */
export function useProviderModels(providerId: string, enabled = true) {
  const [state, setState] = useState<{ id: string; nonce: number; list: ModelList } | null>(null);
  const [nonce, setNonce] = useState(0);
  // Refetch when a key for this router is saved, changed or removed in Settings.
  const key = useBrowserKeys()[providerId];
  const id = key ? `${providerId}\u0000${key.baseUrl ?? ""}\u0000${key.savedAt}` : providerId;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchModels(providerId, nonce > 0).then((list) => {
      if (live) setState({ id, nonce, list });
    });
    return () => {
      live = false;
    };
  }, [providerId, id, enabled, nonce]);

  const current = state && state.id === id ? state : null;
  return {
    models: current?.list.models ?? [],
    error: current?.list.error ?? null,
    loading: enabled && (!current || current.nonce !== nonce),
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}

/** Real (non-simulated) providers that have a key configured (call with browser keys applied). */
export function configuredRealProviders(providers: ProviderStatus[]): ProviderStatus[] {
  return providers.filter((p) => p.configured && !p.simulated);
}
