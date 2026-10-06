"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatResult } from "@/lib/types";
import { isAbortError, streamChat } from "@/lib/client/chat";
import { formatMs } from "@/lib/client/format";

const PROMPT = "Reply with: pong";

export type HealthState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: ChatResult }
  | { kind: "failed"; error: string };

/** Sends a tiny "pong" request (from the browser when its key is saved here, else via /api/chat) and keeps the outcome. */
export function useHealthCheck(providerId: string) {
  const [state, setState] = useState<HealthState>({ kind: "idle" });
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);

  const run = useCallback(async () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setState({ kind: "running" });
    try {
      const result = await streamChat(
        { providerId, messages: [{ role: "user", content: PROMPT }], maxTokens: 5, temperature: 0 },
        { signal: c.signal },
      );
      setState({ kind: "done", result });
    } catch (e) {
      if (!isAbortError(e)) setState({ kind: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }, [providerId]);

  return { state, run };
}

/** The test outcome in one plain sentence. */
export function HealthResult({ state }: { state: HealthState }) {
  let body: ReactNode = null;
  if (state.kind === "running") body = <span className="text-fg-muted">Testing…</span>;
  else if (state.kind === "failed") body = <span className="text-danger">Not working: {state.error}</span>;
  else if (state.kind === "done") {
    const r = state.result;
    const model = r.servedModel || r.requestedModel;
    body = r.ok ? (
      <span className="text-success">
        Working · answered in {formatMs(r.latencyMs)}
        {model ? ` using ${model}` : ""}
      </span>
    ) : (
      <span className="text-danger">
        Not working{r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}: {r.error ?? "no answer came back"}
      </span>
    );
  }
  return (
    <p className="num min-h-0 text-sm break-words empty:hidden" aria-live="polite">
      {body}
    </p>
  );
}
