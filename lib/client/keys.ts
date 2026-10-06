import { useMemo } from "react";
import type { ChatRequest, ChatResult, ProviderStatus } from "@/lib/types";
import { callChatWith, listModelsWith, type CallOptions, type RouterTarget } from "@/lib/providers/openai";
import { getProviderSpec } from "@/lib/providers/registry";
import { readStorage, removeStorage, useStoredValue, writeStorage } from "./storage";

/**
 * API keys the user saves in Settings. They live only in this browser's localStorage.
 * Requests that use one go straight from the browser to the router; nothing in this
 * module talks to TejRouter's own API routes, and no other module may send a key there.
 */

export const KEYS_STORAGE_KEY = "tejrouter:browser-keys:v1";

export interface BrowserKey {
  apiKey: string;
  /** Overrides the router's default base URL (required for self-hosted routers). */
  baseUrl?: string;
  /** Overrides the router's default model. */
  model?: string;
  savedAt: number;
}

export type BrowserKeys = Record<string, BrowserKey>;

const EMPTY: BrowserKeys = {};

function isBrowserKeys(v: unknown): v is BrowserKeys {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (k) =>
      !!k &&
      typeof k === "object" &&
      typeof (k as BrowserKey).apiKey === "string" &&
      ((k as BrowserKey).baseUrl == null || typeof (k as BrowserKey).baseUrl === "string") &&
      ((k as BrowserKey).model == null || typeof (k as BrowserKey).model === "string"),
  );
}

export function readBrowserKeys(): BrowserKeys {
  return readStorage(KEYS_STORAGE_KEY, EMPTY, isBrowserKeys);
}

export function useBrowserKeys(): BrowserKeys {
  return useStoredValue(KEYS_STORAGE_KEY, EMPTY, isBrowserKeys);
}

export function saveBrowserKey(providerId: string, key: Omit<BrowserKey, "savedAt">): boolean {
  const apiKey = key.apiKey.trim();
  if (!apiKey) return false;
  const entry: BrowserKey = { apiKey, savedAt: Date.now() };
  const baseUrl = key.baseUrl?.trim().replace(/\/+$/, "");
  const model = key.model?.trim();
  if (baseUrl) entry.baseUrl = baseUrl;
  if (model) entry.model = model;
  return writeStorage(KEYS_STORAGE_KEY, { ...readBrowserKeys(), [providerId]: entry });
}

export function removeBrowserKey(providerId: string): void {
  const next = { ...readBrowserKeys() };
  delete next[providerId];
  if (Object.keys(next).length) writeStorage(KEYS_STORAGE_KEY, next);
  else removeStorage(KEYS_STORAGE_KEY);
}

export function clearBrowserKeys(): void {
  removeStorage(KEYS_STORAGE_KEY);
}

/** True when this browser holds a key for the provider, so its calls must stay in the browser. */
export function hasBrowserKey(providerId: string): boolean {
  return Boolean(readBrowserKeys()[providerId]?.apiKey);
}

/**
 * Overlay saved browser keys on the server's provider statuses. A browser key wins over
 * a key in .env.local. The result stays in the browser: never send it to an API route.
 */
export function applyBrowserKey(p: ProviderStatus, key: BrowserKey | undefined): ProviderStatus {
  if (!key?.apiKey || p.simulated) return p;
  // Same base URL browserTarget() calls, so what the UI shows is what the browser uses.
  const effectiveBaseUrl = (key.baseUrl || p.baseUrl).replace(/\/+$/, "");
  return {
    ...p,
    effectiveBaseUrl,
    defaultModel: key.model || p.defaultModel,
    configured: Boolean(effectiveBaseUrl),
    keySource: "browser",
    keyHint: key.apiKey.slice(-4),
  };
}

export function useWithBrowserKeys(providers: ProviderStatus[]): ProviderStatus[] {
  const keys = useBrowserKeys();
  return useMemo(
    () => (Object.keys(keys).length ? providers.map((p) => applyBrowserKey(p, keys[p.id])) : providers),
    [providers, keys],
  );
}

export function useWithBrowserKey(p: ProviderStatus): ProviderStatus {
  const keys = useBrowserKeys();
  const key = keys[p.id];
  return useMemo(() => applyBrowserKey(p, key), [p, key]);
}

/** Who the router call goes through: the browser (saved key) or TejRouter's server. */
export function browserTarget(providerId: string): RouterTarget | null {
  const key = readBrowserKeys()[providerId];
  const spec = getProviderSpec(providerId);
  if (!key?.apiKey || !spec || spec.simulated) return null;
  return {
    spec,
    apiKey: key.apiKey,
    baseUrl: (key.baseUrl || spec.baseUrl).replace(/\/+$/, ""),
    defaultModel: key.model || spec.autoModel || spec.suggestedModels[0] || "",
  };
}

const CORS_HINT =
  "your browser could not reach this router. It may not accept requests from web pages (CORS). Check the base URL, or put this key in .env.local instead";

export const BROWSER_CALL_OPTIONS: Pick<CallOptions, "notConfiguredMessage" | "noModelMessage" | "describeNetworkError"> = {
  notConfiguredMessage: "Not configured: add a base URL for this router in Settings",
  noModelMessage: "No model: set a default model in Settings or pick one in the UI",
  describeNetworkError: (msg) => (/failed to fetch|load failed|networkerror|fetch failed/i.test(msg) ? CORS_HINT : msg),
};

/** Call a router directly from the browser with a saved key. */
export function callWithBrowserKey(target: RouterTarget, req: ChatRequest, opts: CallOptions = {}): Promise<ChatResult> {
  const { simulatorHint: _hint, ...clean } = req;
  void _hint;
  return callChatWith(target, clean, { ...BROWSER_CALL_OPTIONS, ...opts });
}

export function listModelsWithBrowserKey(target: RouterTarget) {
  return listModelsWith(target).then((r) =>
    r.error && BROWSER_CALL_OPTIONS.describeNetworkError ? { ...r, error: BROWSER_CALL_OPTIONS.describeNetworkError(r.error) } : r,
  );
}
