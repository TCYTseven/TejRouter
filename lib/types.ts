// Shared contracts for TejRouter. Everything that crosses the server/client
// boundary or the module boundary between providers, stats, bench and UI lives here.

export type ProviderId = string;

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Static description of a router we can talk to. Never contains secrets. */
export interface ProviderSpec {
  id: ProviderId;
  name: string;
  /** Short tagline shown on cards. */
  tagline: string;
  /** Default OpenAI-compatible base URL (".../v1"). Empty when self-hosted only. */
  baseUrl: string;
  /** Env var that overrides the base URL. */
  baseUrlEnv: string;
  /** Env vars checked (in order) for the API key. */
  keyEnvs: string[];
  /** Env var that overrides the default model. */
  modelEnv: string;
  /** Model id that asks the router to pick for you, when the router has one. */
  autoModel: string | null;
  /** Fallback model list when /models discovery is unavailable. */
  suggestedModels: string[];
  docsUrl: string;
  /** Hex color used for this provider in every chart. */
  color: string;
  /** Extra static headers sent with every request. */
  headers?: Record<string, string>;
  /** Built-in simulator, runs without a network or a key. */
  simulated?: boolean;
  /** Free-form caveats, e.g. "routing model id unverified". */
  notes?: string;
}

/** Spec plus runtime status. Safe to send to the browser. */
export interface ProviderStatus extends ProviderSpec {
  configured: boolean;
  /** Which env var supplied the key (name only), or null. */
  keySource: string | null;
  /** Effective base URL after env overrides. */
  effectiveBaseUrl: string;
  /** Effective default model after env overrides. */
  defaultModel: string;
  /** Last 4 chars of the key, for confirming which key is loaded. */
  keyHint: string | null;
}

export interface ChatRequest {
  providerId: ProviderId;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Seed forwarded to providers that support it (and used by simulators). */
  seed?: number;
  /**
   * Benchmark-only hint for simulators so they can produce gradeable output.
   * Never forwarded to real providers.
   */
  simulatorHint?: SimulatorHint;
}

export interface SimulatorHint {
  expected: string;
  /** 0..1 difficulty of the task; simulators fail more often on hard tasks. */
  difficulty: number;
  category: string;
}

export interface Usage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** Reasoning tokens when the provider reports them. */
  reasoningTokens?: number | null;
}

/** Outcome of one call to one router. */
export interface ChatResult {
  id: string;
  providerId: ProviderId;
  requestedModel: string;
  /** The model the router actually used: its routing decision. */
  servedModel: string | null;
  /** Upstream provider when the router reports it (e.g. OpenRouter "provider"). */
  servedProvider: string | null;
  ok: boolean;
  error: string | null;
  httpStatus: number | null;
  text: string;
  finishReason: string | null;
  usage: Usage;
  /** USD cost as reported by the router, else estimated from pricing table, else null. */
  costUsd: number | null;
  costSource: "reported" | "estimated" | null;
  /** Wall-clock ms from request start to last byte. */
  latencyMs: number;
  /** Time to first content token, ms. */
  ttftMs: number | null;
  /** Completion tokens per second measured after first token. */
  outputTps: number | null;
  startedAt: number;
  /** Selected response headers that reveal routing behaviour. */
  routingHeaders: Record<string, string>;
}

/** Events streamed from /api/chat as NDJSON lines. */
export type ChatStreamEvent =
  | { type: "start"; providerId: ProviderId; requestedModel: string; startedAt: number }
  | { type: "delta"; text: string }
  | { type: "done"; result: ChatResult };
