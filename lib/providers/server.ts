import "server-only";
import { PROVIDERS, getProviderSpec } from "./registry";
import type { ProviderSpec, ProviderStatus } from "@/lib/types";

function readEnv(name: string): string | undefined {
  if (!name) return undefined;
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export interface ResolvedProvider {
  spec: ProviderSpec;
  apiKey: string | null;
  keySource: string | null;
  baseUrl: string;
  defaultModel: string;
}

export function resolveProvider(id: string): ResolvedProvider | null {
  const spec = getProviderSpec(id);
  if (!spec) return null;
  let apiKey: string | null = null;
  let keySource: string | null = null;
  for (const env of spec.keyEnvs) {
    const v = readEnv(env);
    if (v) {
      apiKey = v;
      keySource = env;
      break;
    }
  }
  const baseUrl = (readEnv(spec.baseUrlEnv) ?? spec.baseUrl).replace(/\/+$/, "");
  const defaultModel =
    readEnv(spec.modelEnv) ?? spec.autoModel ?? spec.suggestedModels[0] ?? "";
  return { spec, apiKey, keySource, baseUrl, defaultModel };
}

export function isConfigured(r: ResolvedProvider): boolean {
  if (r.spec.simulated) return true;
  return Boolean(r.apiKey && r.baseUrl && r.defaultModel !== undefined);
}

export function providerStatuses(): ProviderStatus[] {
  return PROVIDERS.map((spec) => {
    const r = resolveProvider(spec.id)!;
    return {
      ...spec,
      configured: isConfigured(r),
      keySource: r.keySource,
      effectiveBaseUrl: r.baseUrl,
      defaultModel: r.defaultModel,
      keyHint: r.apiKey ? r.apiKey.slice(-4) : null,
    };
  });
}
