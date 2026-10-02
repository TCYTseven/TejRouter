import "server-only";
import type { ChatRequest, ChatResult, Usage } from "@/lib/types";
import { estimateCostUsd } from "@/lib/pricing";
import { resolveProvider, isConfigured } from "./server";
import { simulateChat } from "./simulator";

const ROUTING_HEADER = /^(x-|openrouter|cf-ray$|server$|via$)|model|provider|route|cost|ratelimit/i;
const SECRET_HEADER = /(authorization|cookie|api[-_]?key|token)/i;

function pickRoutingHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    if (ROUTING_HEADER.test(key) && !SECRET_HEADER.test(key)) out[key] = value.slice(0, 200);
  });
  return out;
}

function emptyUsage(): Usage {
  return { promptTokens: null, completionTokens: null, totalTokens: null };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function readUsage(u: any): { usage: Usage; cost: number | null } {
  if (!u) return { usage: emptyUsage(), cost: null };
  const usage: Usage = {
    promptTokens: u.prompt_tokens ?? u.input_tokens ?? null,
    completionTokens: u.completion_tokens ?? u.output_tokens ?? null,
    totalTokens: u.total_tokens ?? null,
    reasoningTokens:
      u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.reasoning_tokens ?? null,
  };
  if (usage.totalTokens == null && usage.promptTokens != null && usage.completionTokens != null) {
    usage.totalTokens = usage.promptTokens + usage.completionTokens;
  }
  const cost = typeof u.cost === "number" ? u.cost : typeof u.total_cost === "number" ? u.total_cost : null;
  return { usage, cost };
}

function failure(
  partial: Pick<ChatResult, "providerId" | "requestedModel" | "startedAt">,
  error: string,
  httpStatus: number | null,
  routingHeaders: Record<string, string> = {},
): ChatResult {
  return {
    id: `err-${partial.startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    ...partial,
    servedModel: null,
    servedProvider: null,
    ok: false,
    error,
    httpStatus,
    text: "",
    finishReason: null,
    usage: emptyUsage(),
    costUsd: null,
    costSource: null,
    latencyMs: Date.now() - partial.startedAt,
    ttftMs: null,
    outputTps: null,
    routingHeaders,
  };
}

export interface CallOptions {
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  timeoutMs?: number;
}

/**
 * Call one router's OpenAI-compatible chat completions endpoint with streaming,
 * measuring TTFT, throughput, the model the router chose and the cost.
 */
export async function callChat(req: ChatRequest, opts: CallOptions = {}): Promise<ChatResult> {
  const resolved = resolveProvider(req.providerId);
  const startedAt = Date.now();
  const requestedModel = req.model || resolved?.defaultModel || "";
  const base = { providerId: req.providerId, requestedModel, startedAt };

  if (!resolved) return failure(base, `Unknown provider "${req.providerId}"`, null);
  if (resolved.spec.simulated) return simulateChat(resolved.spec, req, opts.onDelta);
  if (!isConfigured(resolved)) {
    const need = [!resolved.apiKey && resolved.spec.keyEnvs[0], !resolved.baseUrl && resolved.spec.baseUrlEnv]
      .filter(Boolean)
      .join(" and ");
    return failure(base, `Not configured: set ${need} in .env.local`, null);
  }
  if (!requestedModel) {
    return failure(base, `No model: set ${resolved.spec.modelEnv} or pick one in the UI`, null);
  }

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 120_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const body: Record<string, unknown> = {
    model: requestedModel,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.maxTokens != null) body.max_tokens = req.maxTokens;
  if (req.seed != null) body.seed = req.seed;
  if (resolved.spec.id === "openrouter") body.usage = { include: true };

  let res: Response;
  try {
    res = await fetch(`${resolved.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${resolved.apiKey}`,
        ...resolved.spec.headers,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "TimeoutError" ? "Timed out" : e.message) : String(e);
    return failure(base, `Network error: ${msg}`, null);
  }

  const routingHeaders = pickRoutingHeaders(res.headers);
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    return failure(base, `HTTP ${res.status}: ${detail || res.statusText}`, res.status, routingHeaders);
  }

  let text = "";
  let servedModel: string | null = null;
  let servedProvider: string | null = null;
  let finishReason: string | null = null;
  let id = "";
  let usage = emptyUsage();
  let reportedCost: number | null = null;
  let ttftMs: number | null = null;
  let firstTokenAt: number | null = null;

  const handle = (json: any) => {
    if (json.error) throw new Error(typeof json.error === "string" ? json.error : json.error.message ?? "stream error");
    id ||= json.id ?? "";
    if (json.model) servedModel = json.model;
    if (json.provider) servedProvider = json.provider;
    const choice = json.choices?.[0];
    const delta: string | undefined = choice?.delta?.content ?? choice?.message?.content;
    if (delta) {
      if (firstTokenAt == null) {
        firstTokenAt = Date.now();
        ttftMs = firstTokenAt - startedAt;
      }
      text += delta;
      opts.onDelta?.(delta);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (json.usage) {
      const r = readUsage(json.usage);
      usage = r.usage;
      reportedCost = r.cost ?? reportedCost;
    }
  };

  try {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("event-stream")) {
      // Some gateways ignore stream=true and answer with one JSON body.
      handle(await res.json());
    } else {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            handle(JSON.parse(data));
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    }
  } catch (e) {
    const r = failure(base, `Stream error: ${e instanceof Error ? e.message : String(e)}`, res.status, routingHeaders);
    r.text = text;
    return r;
  }

  const end = Date.now();
  const latencyMs = end - startedAt;
  const genSeconds = firstTokenAt != null ? (end - firstTokenAt) / 1000 : 0;
  const outputTps =
    usage.completionTokens != null && genSeconds > 0.05 ? usage.completionTokens / genSeconds : null;
  const estimated = estimateCostUsd(servedModel ?? requestedModel, usage);
  const costUsd = reportedCost ?? estimated;

  return {
    id: id || `res-${startedAt}`,
    ...base,
    servedModel: servedModel ?? routingHeaders["x-model"] ?? null,
    servedProvider: servedProvider ?? routingHeaders["x-provider"] ?? null,
    ok: true,
    error: null,
    httpStatus: res.status,
    text,
    finishReason,
    usage,
    costUsd,
    costSource: reportedCost != null ? "reported" : estimated != null ? "estimated" : null,
    latencyMs,
    ttftMs,
    outputTps,
    routingHeaders,
  };
}

/** List models from a router's /models endpoint. */
export async function listModels(providerId: string): Promise<{ models: string[]; error: string | null }> {
  const r = resolveProvider(providerId);
  if (!r) return { models: [], error: "Unknown provider" };
  if (r.spec.simulated) return { models: r.spec.suggestedModels, error: null };
  if (!isConfigured(r)) return { models: r.spec.suggestedModels, error: "Not configured" };
  try {
    const res = await fetch(`${r.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${r.apiKey}`, ...r.spec.headers },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { models: r.spec.suggestedModels, error: `HTTP ${res.status}` };
    const json: any = await res.json();
    const ids: string[] = (json.data ?? json.models ?? [])
      .map((m: any) => (typeof m === "string" ? m : m.id ?? m.slug ?? m.name))
      .filter(Boolean);
    const merged = Array.from(new Set([...(r.spec.autoModel ? [r.spec.autoModel] : []), ...ids]));
    return { models: merged.length ? merged : r.spec.suggestedModels, error: null };
  } catch (e) {
    return { models: r.spec.suggestedModels, error: e instanceof Error ? e.message : String(e) };
  }
}
