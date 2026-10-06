import "server-only";
import type { ChatRequest, ChatResult } from "@/lib/types";
import { callChatWith, chatFailure, listModelsWith, type CallOptions } from "./openai";
import { resolveProvider } from "./server";

export type { CallOptions } from "./openai";

/**
 * Call one router with the key from .env.local, measuring TTFT, throughput, the model
 * the router chose and the cost.
 */
export async function callChat(req: ChatRequest, opts: CallOptions = {}): Promise<ChatResult> {
  const resolved = resolveProvider(req.providerId);
  if (!resolved) {
    const base = { providerId: req.providerId, requestedModel: req.model ?? "", startedAt: Date.now() };
    return chatFailure(base, `Unknown provider "${req.providerId}"`, null);
  }
  const need = [!resolved.apiKey && resolved.spec.keyEnvs[0], !resolved.baseUrl && resolved.spec.baseUrlEnv]
    .filter(Boolean)
    .join(" and ");
  return callChatWith(resolved, req, {
    notConfiguredMessage: `Not configured: set ${need} in .env.local, or add a key in Settings`,
    noModelMessage: `No model: set ${resolved.spec.modelEnv} or pick one in the UI`,
    ...opts,
  });
}

/** List models from a router's /models endpoint. */
export async function listModels(providerId: string): Promise<{ models: string[]; error: string | null }> {
  const r = resolveProvider(providerId);
  if (!r) return { models: [], error: "Unknown provider" };
  return listModelsWith(r);
}
