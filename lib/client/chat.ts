import type { ChatRequest, ChatResult, ChatStreamEvent } from "@/lib/types";
import { readNdjson } from "./ndjson";

export interface StreamChatOptions {
  signal?: AbortSignal;
  onStart?: (event: Extract<ChatStreamEvent, { type: "start" }>) => void;
  /** Called for every delta with the new chunk and the accumulated text. */
  onDelta?: (delta: string, fullText: string) => void;
}

export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

/** Build a failed ChatResult on the client (HTTP error, broken stream...). */
export function clientFailure(
  req: Pick<ChatRequest, "providerId" | "model">,
  error: string,
  startedAt: number,
  extra: Partial<ChatResult> = {},
): ChatResult {
  return {
    id: `client-err-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    providerId: req.providerId,
    requestedModel: req.model ?? "",
    servedModel: null,
    servedProvider: null,
    ok: false,
    error,
    httpStatus: null,
    text: "",
    finishReason: null,
    usage: { promptTokens: null, completionTokens: null, totalTokens: null },
    costUsd: null,
    costSource: null,
    latencyMs: Date.now() - startedAt,
    ttftMs: null,
    outputTps: null,
    startedAt,
    routingHeaders: {},
    ...extra,
  };
}

/**
 * POST a ChatRequest to /api/chat and consume the NDJSON stream.
 * Resolves with the final ChatResult (ok or not). Rejects only on abort
 * (check with isAbortError).
 */
export async function streamChat(req: ChatRequest, opts: StreamChatOptions = {}): Promise<ChatResult> {
  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: opts.signal,
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    return clientFailure(req, `Network error: ${e instanceof Error ? e.message : String(e)}`, startedAt);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = `${msg}: ${body.error}`;
    } catch {
      /* not json */
    }
    return clientFailure(req, msg, startedAt, { httpStatus: res.status });
  }

  let text = "";
  let result: ChatResult | null = null;
  try {
    await readNdjson<ChatStreamEvent>(
      res,
      (e) => {
        if (e.type === "start") opts.onStart?.(e);
        else if (e.type === "delta") {
          text += e.text;
          opts.onDelta?.(e.text, text);
        } else if (e.type === "done") result = e.result;
      },
      { signal: opts.signal },
    );
  } catch (e) {
    if (isAbortError(e) || opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return clientFailure(req, `Stream error: ${e instanceof Error ? e.message : String(e)}`, startedAt, { text });
  }
  if (!result) return clientFailure(req, "Stream ended before the router finished", startedAt, { text });
  return result;
}
