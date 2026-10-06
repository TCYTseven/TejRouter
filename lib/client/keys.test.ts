import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProviderStatus } from "@/lib/types";
import { PROVIDERS } from "@/lib/providers/registry";
import {
  KEYS_STORAGE_KEY,
  applyBrowserKey,
  browserTarget,
  clearBrowserKeys,
  hasBrowserKey,
  readBrowserKeys,
  removeBrowserKey,
  saveBrowserKey,
} from "./keys";

function status(id: string, extra: Partial<ProviderStatus> = {}): ProviderStatus {
  const spec = PROVIDERS.find((p) => p.id === id)!;
  return { ...spec, configured: false, keySource: null, effectiveBaseUrl: spec.baseUrl, defaultModel: spec.autoModel ?? "", keyHint: null, ...extra };
}

describe("browser keys", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      addEventListener() {},
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("saves, trims and removes keys in localStorage", () => {
    expect(saveBrowserKey("openrouter", { apiKey: "  sk-or-1234  ", model: " openrouter/auto " })).toBe(true);
    expect(readBrowserKeys().openrouter).toMatchObject({ apiKey: "sk-or-1234", model: "openrouter/auto" });
    expect(hasBrowserKey("openrouter")).toBe(true);
    expect(saveBrowserKey("requesty", { apiKey: "   " })).toBe(false);
    removeBrowserKey("openrouter");
    expect(hasBrowserKey("openrouter")).toBe(false);
    expect((globalThis as unknown as { window: Window }).window.localStorage.getItem(KEYS_STORAGE_KEY)).toBeNull();
  });

  it("ignores malformed storage", () => {
    (globalThis as unknown as { window: Window }).window.localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify({ openrouter: { apiKey: 5 } }));
    expect(readBrowserKeys()).toEqual({});
    clearBrowserKeys();
  });

  it("builds a direct target only for real routers with a saved key", () => {
    saveBrowserKey("custom", { apiKey: "k-abcd", baseUrl: "https://gw.example.com/v1///" });
    expect(browserTarget("custom")).toMatchObject({ apiKey: "k-abcd", baseUrl: "https://gw.example.com/v1" });
    expect(browserTarget("openrouter")).toBeNull();
    expect(browserTarget("sim-greedy")).toBeNull();
  });

  it("overlays a saved key on a provider status without exposing more than the last four characters", () => {
    const p = applyBrowserKey(status("openrouter"), { apiKey: "sk-or-secret-9f3a", savedAt: 1 });
    expect(p).toMatchObject({ configured: true, keySource: "browser", keyHint: "9f3a" });
    expect(JSON.stringify(p)).not.toContain("secret");
    // A self-hosted router stays unconfigured until it has a base URL.
    expect(applyBrowserKey(status("fastllm"), { apiKey: "k", savedAt: 1 }).configured).toBe(false);
    expect(applyBrowserKey(status("fastllm"), { apiKey: "k", baseUrl: "https://f.example/v1", savedAt: 1 }).configured).toBe(true);
    const sim = status("sim-greedy", { configured: true });
    expect(applyBrowserKey(sim, { apiKey: "k", savedAt: 1 })).toBe(sim);
  });
});
