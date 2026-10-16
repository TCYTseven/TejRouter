import type { ChatRequest, ChatResult, ProviderSpec, Usage } from "@/lib/types";
import { estimateCostUsd } from "@/lib/pricing";
import { simulateChat } from "./simulator";

/**
 * The OpenAI-compatible chat client. It has no server-only imports, so the same code
 * runs on the server (keys from .env.local) and in the browser (keys saved in
 * Settings, which call the router directly, or through /api/relay when it blocks CORS).
 */

const ROUTING_HEADER = /^(x-|openrouter|cf-ray$|server$|via$)|model|provider|route|cost|ratelimit/i;
const SECRET_HEADER = /(authorization|cookie|api[-_]?key|token)/i;

function pickRoutingHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    if (ROUTING_HEADER.test(key) && !SECRET_HEADER.test(key)) out[key] = value.slice(0, 200);
  });
  return out;
}

/**
 * Routers disagree on shapes: some send `provider` or `model` as an object
 * ({ name, slug, ... }) instead of a string. Everything shown in the UI must be text.
 */
export function asText(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    for (const k of ["name", "slug", "id", "model", "message"]) {
      const inner = asText((v as Record<string, unknown>)[k]);
      if (inner) return inner;
    }
    try {
      return JSON.stringify(v).slice(0, 200);
    } catch {
      return null;
    }
  }
  return null;
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

export function chatFailure(
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

/** Chat Completions request body. */
function chatBody(model: string, req: ChatRequest, providerId: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.maxTokens != null) body.max_tokens = req.maxTokens;
  if (req.seed != null) body.seed = req.seed;
  if (providerId === "openrouter") body.usage = { include: true };
  return body;
}

/** The Responses API refuses max_output_tokens below 16. */
export const MIN_RESPONSES_OUTPUT_TOKENS = 16;

/**
 * Responses API request body: system messages become `instructions`, the rest `input`.
 * It has no `seed`, and it takes `max_output_tokens` instead of `max_tokens`.
 */
export function responsesBody(model: string, req: Pick<ChatRequest, "messages" | "temperature" | "maxTokens">): Record<string, unknown> {
  const system = req.messages.filter((m) => m.role === "system").map((m) => m.content);
  const input = req.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  const body: Record<string, unknown> = { model, input, stream: true };
  if (system.length) body.instructions = system.join("\n\n");
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.maxTokens != null) body.max_output_tokens = Math.max(MIN_RESPONSES_OUTPUT_TOKENS, req.maxTokens);
  return body;
}

/** Text of a non-streamed Responses API object. */
function responseText(r: any): string {
  if (typeof r.output_text === "string") return r.output_text;
  const parts: string[] = [];
  for (const item of Array.isArray(r.output) ? r.output : []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c.text === "string") parts.push(c.text);
      else if (c?.type === "refusal" && typeof c.refusal === "string") parts.push(c.refusal);
    }
  }
  return parts.join("");
}

export interface CallOptions {
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  timeoutMs?: number;
  /** Error text when the key or base URL is missing (differs between .env.local and browser keys). */
  notConfiguredMessage?: string;
  noModelMessage?: string;
  /** Rewrites a transport error (the browser reports CORS refusals as a bare TypeError). */
  describeNetworkError?: (message: string) => string;
}

/** Everything needed to call one router. Built from env vars on the server or from a browser key. */
export interface RouterTarget {
  spec: ProviderSpec;
  apiKey: string | null;
  baseUrl: string;
  defaultModel: string;
  /** Transport for router requests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/**
 * Call one router's OpenAI-compatible chat completions endpoint with streaming,
 * measuring TTFT, throughput, the model the router chose and the cost.
 */
export async function callChatWith(
  resolved: RouterTarget,
  req: ChatRequest,
  opts: CallOptions = {},
): Promise<ChatResult> {
  const startedAt = Date.now();
  const requestedModel = req.model || resolved.defaultModel || "";
  const base = { providerId: req.providerId, requestedModel, startedAt };

  if (resolved.spec.simulated) return simulateChat(resolved.spec, req, opts.onDelta);
  if (!resolved.apiKey || !resolved.baseUrl) {
    return chatFailure(base, opts.notConfiguredMessage ?? "Not configured: add an API key and base URL", null);
  }
  if (!requestedModel) {
    return chatFailure(base, opts.noModelMessage ?? "No model: pick one in the UI", null);
  }

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 120_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const responsesApi = resolved.spec.api === "responses";
  const body = responsesApi ? responsesBody(requestedModel, req) : chatBody(requestedModel, req, resolved.spec.id);
  const url = `${resolved.baseUrl}/${responsesApi ? "responses" : "chat/completions"}`;
  const send = (b: Record<string, unknown>) =>
    (resolved.fetch ?? fetch)(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${resolved.apiKey}`,
        ...resolved.spec.headers,
      },
      body: JSON.stringify(b),
      signal,
    });

  let res: Response;
  try {
    res = await send(body);
    // Reasoning models behind a Responses gateway refuse sampling parameters with a 400.
    // Retry once without them rather than failing the call.
    if (responsesApi && res.status === 400 && body.temperature != null) {
      const detail = await res.clone().text().catch(() => "");
      if (/temperature|unsupported|not supported/i.test(detail)) {
        await res.body?.cancel().catch(() => {});
        const { temperature: _t, ...rest } = body;
        void _t;
        res = await send(rest);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "TimeoutError" ? "Timed out" : e.message) : String(e);
    return chatFailure(base, `Network error: ${opts.describeNetworkError ? opts.describeNetworkError(msg) : msg}`, null);
  }

  const routingHeaders = pickRoutingHeaders(res.headers);
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    return chatFailure(base, `HTTP ${res.status}: ${detail || res.statusText}`, res.status, routingHeaders);
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

  const onText = (delta: string) => {
    if (!delta) return;
    if (firstTokenAt == null) {
      firstTokenAt = Date.now();
      ttftMs = firstTokenAt - startedAt;
    }
    text += delta;
    opts.onDelta?.(delta);
  };
  const takeUsage = (u: any) => {
    if (!u) return;
    const r = readUsage(u);
    usage = r.usage;
    reportedCost = r.cost ?? reportedCost;
  };

  const handleChat = (json: any) => {
    if (json.error) throw new Error(asText(json.error) ?? "stream error");
    id ||= typeof json.id === "string" ? json.id : "";
    servedModel = asText(json.model) ?? servedModel;
    servedProvider = asText(json.provider) ?? servedProvider;
    const choice = json.choices?.[0];
    const content = choice?.delta?.content ?? choice?.message?.content;
    if (typeof content === "string") onText(content);
    if (choice?.finish_reason) finishReason = asText(choice.finish_reason);
    if (json.usage) takeUsage(json.usage);
  };

  // Responses API: SSE events ({ type: "response.output_text.delta", delta }, ...) or, without
  // streaming, one response object. The final response names the model that served it.
  const takeResponse = (r: any) => {
    if (!r || typeof r !== "object") return;
    id ||= typeof r.id === "string" ? r.id : "";
    servedModel = asText(r.model) ?? servedModel;
    servedProvider = asText(r.provider) ?? servedProvider;
    if (r.usage) takeUsage(r.usage);
    if (r.status === "failed") throw new Error(asText(r.error) ?? "the router reported a failed response");
    if (r.status === "completed") finishReason = "stop";
    if (r.status === "incomplete") {
      const why = asText(r.incomplete_details?.reason) ?? "incomplete";
      finishReason = why === "max_output_tokens" ? "length" : why;
    }
  };
  const handleResponses = (json: any) => {
    const type: string = typeof json.type === "string" ? json.type : "";
    servedProvider = asText(json.provider) ?? servedProvider;
    if (type === "error") throw new Error(asText(json.error) ?? asText(json.message) ?? "stream error");
    if (type === "response.output_text.delta" || type === "response.refusal.delta") {
      if (typeof json.delta === "string") onText(json.delta);
      return;
    }
    if (type.startsWith("response.")) {
      if (json.response) takeResponse(json.response);
      return;
    }
    if (json.error && !json.output) throw new Error(asText(json.error) ?? "stream error");
    // A whole response object (the router ignored stream: true).
    if (json.object === "response" || Array.isArray(json.output)) {
      if (!text) onText(responseText(json));
      takeResponse(json);
    }
  };
  const handle = responsesApi ? handleResponses : handleChat;

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
    const r = chatFailure(base, `Stream error: ${e instanceof Error ? e.message : String(e)}`, res.status, routingHeaders);
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
export async function listModelsWith(r: RouterTarget): Promise<{ models: string[]; error: string | null }> {
  if (r.spec.simulated) return { models: r.spec.suggestedModels, error: null };
  if (!r.apiKey || !r.baseUrl) return { models: r.spec.suggestedModels, error: "Not configured" };
  try {
    const res = await (r.fetch ?? fetch)(`${r.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${r.apiKey}`, ...r.spec.headers },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { models: r.spec.suggestedModels, error: `HTTP ${res.status}` };
    const json: any = await res.json();
    const ids: string[] = (json.data ?? json.models ?? [])
      .map((m: any) => asText(typeof m === "string" ? m : m?.id ?? m?.slug ?? m?.name))
      .filter((m: string | null): m is string => Boolean(m));
    const merged = Array.from(new Set([...(r.spec.autoModel ? [r.spec.autoModel] : []), ...ids]));
    return { models: merged.length ? merged : r.spec.suggestedModels, error: null };
  } catch (e) {
    return { models: r.spec.suggestedModels, error: e instanceof Error ? e.message : String(e) };
  }
}
