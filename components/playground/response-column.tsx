"use client";

import { useState } from "react";
import type { ChatResult, ProviderStatus } from "@/lib/types";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { IconAlert, IconRoute, IconTrophy } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/markdown";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { formatMs, formatTokens, formatTps, formatUsd } from "@/lib/client/format";
import { currentRep, type ArmRound, type RepRun } from "./types";

export function isAutoModel(model: string, provider?: ProviderStatus): boolean {
  return !model || model === provider?.autoModel || /(^|\/)auto$/.test(model);
}

/** Did the router serve something other than what was asked for? */
export function rerouted(r: ChatResult): boolean {
  if (!r.servedModel || !r.requestedModel) return false;
  const norm = (s: string) => s.toLowerCase().replace(/^[^/]+\//, "");
  return r.servedModel !== r.requestedModel && norm(r.servedModel) !== norm(r.requestedModel);
}

/** One streaming response column with its metrics. */
export function ResponseColumn({
  arm,
  provider,
  hidden,
  winner,
}: {
  arm: ArmRound;
  provider?: ProviderStatus;
  /** Blind mode before voting: hide identity. */
  hidden: boolean;
  winner?: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const live = currentRep(arm);
  const rep: RepRun = picked != null ? (arm.reps[picked] ?? live) : live;
  const r = rep.result;
  const streaming = rep.status === "streaming";
  const name = hidden ? `Router ${arm.letter}` : (provider?.name ?? arm.providerId);
  const requested = r?.requestedModel || arm.model || provider?.defaultModel || "default";

  return (
    <article
      aria-labelledby={`col-${arm.key}-title`}
      aria-busy={streaming}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border bg-surface transition-[border-color,box-shadow] duration-300",
        winner ? "border-accent-line shadow-glow" : streaming ? "border-border-strong" : "border-border",
      )}
    >
      {/* identity strip */}
      <div
        aria-hidden="true"
        className="h-0.5 w-full"
        style={{ background: hidden ? "var(--border-strong)" : (provider?.color ?? "var(--border-strong)") }}
      />
      <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h3 id={`col-${arm.key}-title`} className="flex items-center gap-2 text-sm font-semibold text-fg">
            <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border-strong bg-surface-2 text-[10px] text-fg-muted">
              {arm.letter}
            </span>
            {hidden ? null : <ProviderDot provider={provider} />}
            <span className="truncate">{name}</span>
            {winner ? (
              <Badge tone="accent">
                <IconTrophy size={11} /> Your pick
              </Badge>
            ) : null}
          </h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">{hidden ? "model hidden until you vote" : requested}</p>
        </div>
        <RepStatusBadge rep={rep} />
      </header>

      {arm.reps.length > 1 ? (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-1.5" role="group" aria-label={`Repetitions for ${name}`}>
          <span className="mr-1 text-[10px] text-fg-subtle">run</span>
          {arm.reps.map((x) => (
            <button
              key={x.rep}
              type="button"
              onClick={() => setPicked(picked === x.rep ? null : x.rep)}
              aria-pressed={rep.rep === x.rep}
              className={cn(
                "num flex h-5 min-w-5 items-center justify-center gap-1 rounded px-1 text-[10px] transition-colors",
                rep.rep === x.rep ? "bg-surface-3 text-fg ring-1 ring-border-strong" : "text-fg-subtle hover:text-fg",
              )}
            >
              <span
                className={cn(
                  "h-1 w-1 rounded-full",
                  x.status === "done" && "bg-success",
                  x.status === "error" && "bg-danger",
                  x.status === "streaming" && "bg-accent motion-safe:animate-pulse-dot",
                  (x.status === "pending" || x.status === "aborted") && "bg-fg-subtle/50",
                )}
              />
              {x.rep + 1}
            </button>
          ))}
        </div>
      ) : null}

      {/* response body */}
      <div className="relative max-h-[460px] min-h-[140px] flex-1 overflow-y-auto px-3 py-3">
        {rep.text ? (
          <>
            <Markdown text={rep.text} streaming={streaming} />
            {streaming ? <span aria-hidden="true" className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-accent motion-safe:animate-caret" /> : null}
          </>
        ) : rep.status === "pending" || rep.status === "streaming" ? (
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <StatusDot status="live" pulse />
            {rep.status === "pending" ? "Queued…" : "Waiting for first token…"}
          </div>
        ) : rep.status === "aborted" ? (
          <p className="text-xs text-fg-subtle">Stopped before any output.</p>
        ) : null}
        {r && !r.ok ? (
          <div role="alert" className="mt-2 flex gap-2 rounded-md border border-danger/30 bg-danger-soft p-2.5 text-xs text-danger">
            <IconAlert size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">
                Request failed{r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}
              </p>
              <p className="mt-0.5 break-words text-[11px] opacity-90">{r.error}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* metrics */}
      <footer className="border-t border-border bg-bg-subtle/60 px-3 py-2.5">
        <RoutingDecision result={r} hidden={hidden} />
        <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-2">
          <Metric label="TTFT" value={formatMs(r?.ttftMs)} />
          <Metric label="Latency" value={formatMs(r?.latencyMs ?? null)} />
          <Metric label="Speed" value={formatTps(r?.outputTps)} />
          <Metric label="Prompt tok" value={formatTokens(r?.usage.promptTokens)} />
          <Metric label="Output tok" value={formatTokens(r?.usage.completionTokens)} />
          <Metric
            label="Cost"
            value={formatUsd(r?.costUsd)}
            note={r?.costSource ? (r.costSource === "reported" ? "reported" : "estimated") : undefined}
          />
          <Metric label="Finish" value={r?.finishReason ?? "—"} />
          {r?.usage.reasoningTokens ? <Metric label="Reasoning tok" value={formatTokens(r.usage.reasoningTokens)} /> : null}
        </dl>
        {r && !hidden && Object.keys(r.routingHeaders).length ? (
          <Disclosure summary={`Routing headers (${Object.keys(r.routingHeaders).length})`} className="mt-2.5" summaryClassName="text-[11px]">
            <dl className="max-h-36 overflow-auto rounded border border-border bg-surface p-2 font-mono text-[10.5px]">
              {Object.entries(r.routingHeaders).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="shrink-0 text-fg-subtle">{k}:</dt>
                  <dd className="min-w-0 break-all text-fg-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        ) : null}
      </footer>
    </article>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-fg-subtle">{label}</dt>
      <dd className="num truncate text-xs text-fg" title={value}>
        {value}
      </dd>
      {note ? <dd className={cn("text-[9.5px] leading-none", note === "reported" ? "text-success" : "text-fg-subtle")}>{note}</dd> : null}
    </div>
  );
}

function RoutingDecision({ result, hidden }: { result: ChatResult | null; hidden: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-accent-line/60 bg-accent-soft px-2 py-1.5">
      <IconRoute size={14} className="shrink-0 text-accent-text" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-fg-subtle">Served model{result?.servedProvider && !hidden ? ` · via ${result.servedProvider}` : ""}</div>
        <div className="num truncate text-[12.5px] font-medium text-fg" title={hidden ? undefined : (result?.servedModel ?? undefined)}>
          {hidden ? "hidden until you vote" : (result?.servedModel ?? (result ? "not reported" : "—"))}
        </div>
      </div>
      {result && !hidden && rerouted(result) ? (
        <Badge tone="accent" title={`Requested ${result.requestedModel}`}>
          routed
        </Badge>
      ) : null}
    </div>
  );
}

function RepStatusBadge({ rep }: { rep: RepRun }) {
  switch (rep.status) {
    case "streaming":
      return (
        <Badge tone="accent">
          <StatusDot status="live" pulse /> live
        </Badge>
      );
    case "done":
      return <Badge tone="success">done</Badge>;
    case "error":
      return <Badge tone="danger">error</Badge>;
    case "aborted":
      return <Badge tone="neutral">stopped</Badge>;
    default:
      return <Badge tone="outline">queued</Badge>;
  }
}
