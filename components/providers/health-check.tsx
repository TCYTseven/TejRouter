"use client";

import { useRef, useState } from "react";
import type { ChatResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { IconActivity, IconCheckCircle, IconXCircle } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { isAbortError, streamChat } from "@/lib/client/chat";
import { formatMs, formatUsd } from "@/lib/client/format";

const PROMPT = "Reply with: pong";

/** Sends a 5-token ping through /api/chat and reports what came back. */
export function HealthCheck({ providerId, disabledReason }: { providerId: string; disabledReason?: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ChatResult | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const toast = useToast();

  const run = async () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setRunning(true);
    try {
      const r = await streamChat(
        { providerId, messages: [{ role: "user", content: PROMPT }], maxTokens: 5, temperature: 0 },
        { signal: c.signal },
      );
      setResult(r);
      if (!r.ok) toast({ title: `Health check failed`, description: r.error ?? undefined, tone: "error" });
    } catch (e) {
      if (!isAbortError(e)) toast({ title: "Health check failed", description: String(e), tone: "error" });
    } finally {
      setRunning(false);
    }
  };

  const headers = result ? Object.entries(result.routingHeaders) : [];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={run}
          loading={running}
          leftIcon={<IconActivity size={13} />}
          title={disabledReason}
        >
          {running ? "Pinging…" : "Health check"}
        </Button>
        <span className="text-[11px] text-fg-subtle">
          sends <span className="font-mono">“{PROMPT}”</span>, max 5 tokens
        </span>
      </div>
      <div aria-live="polite">
        {result ? (
          <div className="animate-rise rounded-md border border-border bg-bg-subtle p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {result.ok ? (
                <Badge tone="success">
                  <IconCheckCircle size={11} /> OK
                </Badge>
              ) : (
                <Badge tone="danger">
                  <IconXCircle size={11} /> Error{result.httpStatus ? ` ${result.httpStatus}` : ""}
                </Badge>
              )}
              {result.ok && result.text ? (
                <span className="truncate font-mono text-[11px] text-fg-muted">“{result.text.trim().slice(0, 40)}”</span>
              ) : null}
            </div>
            {result.error ? <p className="mt-2 text-[11px] break-words text-danger">{result.error}</p> : null}
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
              <div>
                <dt className="text-fg-subtle">TTFT</dt>
                <dd className="num text-fg">{formatMs(result.ttftMs)}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Latency</dt>
                <dd className="num text-fg">{formatMs(result.latencyMs)}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-fg-subtle">Served model</dt>
                <dd className="num truncate text-accent-text">{result.servedModel ?? "—"}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-fg-subtle">Served provider</dt>
                <dd className="num truncate text-fg">{result.servedProvider ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Cost</dt>
                <dd className="num text-fg">{formatUsd(result.costUsd)}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Finish</dt>
                <dd className="num text-fg">{result.finishReason ?? "—"}</dd>
              </div>
            </dl>
            {headers.length ? (
              <Disclosure summary={`Routing headers (${headers.length})`} className="mt-2">
                <dl className="max-h-40 overflow-auto rounded border border-border bg-surface p-2 font-mono text-[10.5px]">
                  {headers.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="shrink-0 text-fg-subtle">{k}:</dt>
                      <dd className="min-w-0 break-all text-fg-muted">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Disclosure>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
