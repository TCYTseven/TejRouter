import type { Usage } from "@/lib/types";

/**
 * Approximate list prices in USD per 1M tokens, used only when a router does not
 * report cost itself. Matched by substring against the served model id, longest
 * match first. These are estimates: results computed from them are labelled
 * "estimated" in the UI.
 */
export const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "sim/small": { input: 0.15, output: 0.6 },
  "sim/large": { input: 3, output: 15 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5": { input: 1.25, output: 10 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "o3": { input: 2, output: 8 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "claude-haiku-4": { input: 1, output: 5 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-opus-4": { input: 15, output: 75 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "llama-3.3-70b": { input: 0.6, output: 0.6 },
  "llama-3.1-8b": { input: 0.05, output: 0.08 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-r1": { input: 0.55, output: 2.19 },
  "mistral-small": { input: 0.1, output: 0.3 },
  "mistral-large": { input: 2, output: 6 },
  "qwen": { input: 0.4, output: 1.2 },
};

const KEYS_BY_LENGTH = Object.keys(PRICE_TABLE).sort((a, b) => b.length - a.length);

export function lookupPrice(model: string | null | undefined) {
  if (!model) return null;
  const m = model.toLowerCase();
  const key = KEYS_BY_LENGTH.find((k) => m.includes(k));
  return key ? { key, ...PRICE_TABLE[key] } : null;
}

export function estimateCostUsd(model: string | null | undefined, usage: Usage): number | null {
  const price = lookupPrice(model);
  if (!price || usage.promptTokens == null || usage.completionTokens == null) return null;
  return (usage.promptTokens * price.input + usage.completionTokens * price.output) / 1e6;
}
