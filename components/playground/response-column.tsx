"use client";

import { useState } from "react";
import type { ChatResult, ProviderStatus } from "@/lib/types";
import { Disclosure } from "@/components/ui/disclosure";
import { Markdown } from "@/components/ui/markdown";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { formatMeanSd, formatMs, formatTokens, formatTps, formatUsd } from "@/lib/client/format";
import { armSummary, metricDef } from "./metrics";
import { currentRep, okResults, type ArmRound, type RepRun } from "./types";

/** Did the router serve something other than what was asked for? */
export function rerouted(r: ChatResult): boolean {
  if (!r.servedModel || !r.requestedModel) return false;
  const norm = (s: string) => s.toLowerCase().replace(/^[^/]+\//, "");
  return r.servedModel !== r.requestedModel && norm(r.servedModel) !== norm(r.requestedModel);
}

export function armLabel(arm: ArmRound, provider: ProviderStatus | undefined, hidden: boolean): string {
  return hidden ? `Router ${arm.letter}` : (provider?.name ?? arm.providerId);
}

/** One router's answer: name, streamed text, a one-line footer and a Details disclosure. */
export function ResponseColumn({
  arm,
  provider,
  hidden,
  winner,
  latencyMax,
}: {
  arm: ArmRound;
  provider?: ProviderStatus;
  /** Blind mode before voting: hide identity. */
  hidden: boolean;
  winner?: boolean;
  /** Shared axis max for the repeat-run dot plot, so columns are comparable. */
  latencyMax: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const live = currentRep(arm);
  const rep: RepRun = picked != null ? (arm.reps[picked] ?? live) : live;
  const r = rep.result;
  const streaming = rep.status === "streaming";
  const name = armLabel(arm, provider, hidden);

  return (
    <article
      aria-labelledby={`col-${arm.key}-title`}
      aria-busy={streaming}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-surface",
        winner ? "border-fg/40" : "border-border",
      )}
    >
      <header className="flex items-center justify-between gap-3 px-5 pt-4">
        <h3 id={`col-${arm.key}-title`} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-fg">
          {hidden ? null : <ProviderDot provider={provider} size={10} />}
          <span className="truncate">{name}</span>
        </h3>
        <span className="shrink-0 text-[13px] text-fg-muted" aria-live="polite">
          {winner ? "Your pick" : statusWord(rep)}
        </span>
      </header>

      <div className="max-h-[520px] min-h-[120px] flex-1 overflow-y-auto px-5 py-3">
        {rep.text ? (
          <Markdown text={rep.text} streaming={streaming} />
        ) : rep.status === "pending" || rep.status === "streaming" ? (
          <p className="text-sm text-fg-muted">{rep.status === "pending" ? "Waiting to start…" : "Waiting for the first words…"}</p>
        ) : rep.status === "aborted" ? (
          <p className="text-sm text-fg-muted">Stopped before any answer arrived.</p>
        ) : null}
        {r && !r.ok ? (
          <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm break-words text-danger">
            This router returned an error{r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}: {r.error}
          </p>
        ) : null}
      </div>

      <footer className="flex flex-col gap-2 border-t border-border px-5 py-3">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          <FooterLine result={r} hidden={hidden} />
        </p>
        {r || arm.reps.length > 1 ? (
          <Disclosure summary="Details" summaryClassName="text-[13px]">
            <div className="flex flex-col gap-3 text-[13px] text-fg-muted">
              {arm.reps.length > 1 ? (
                <RepeatDetails arm={arm} shown={rep.rep} onPick={(i) => setPicked(i === picked ? null : i)} max={latencyMax} />
              ) : null}
              {r ? <ResultDetails result={r} hidden={hidden} /> : null}
            </div>
          </Disclosure>
        ) : null}
      </footer>
    </article>
  );
}

function statusWord(rep: RepRun): string {
  switch (rep.status) {
    case "streaming":
      return "Writing…";
    case "pending":
      return "Queued";
    case "error":
      return "Failed";
    case "aborted":
      return "Stopped";
    default:
      return "";
  }
}

function FooterLine({ result: r, hidden }: { result: ChatResult | null; hidden: boolean }) {
  if (!r) return <>Timing and cost appear when the answer finishes.</>;
  const model = hidden ? "Model hidden until you vote" : r.servedModel ? `Used ${r.servedModel}` : "Model not reported";
  const parts = [
    model,
    `first words in ${formatMs(r.ttftMs)}`,
    `done in ${formatMs(r.latencyMs)}`,
    r.costUsd != null ? `cost ${formatUsd(r.costUsd)}` : "cost not reported",
  ];
  return <span className="num">{parts.join(" · ")}</span>;
}

function ResultDetails({ result: r, hidden }: { result: ChatResult; hidden: boolean }) {
  const headers = Object.entries(r.routingHeaders);
  const rows: [string, string][] = [];
  if (!hidden) {
    rows.push(["Asked for", r.requestedModel || "the router's default"]);
    if (r.servedModel) rows.push(["Answered with", `${r.servedModel}${rerouted(r) ? " (the router switched models)" : ""}`]);
    if (r.servedProvider) rows.push(["Served by", r.servedProvider]);
  }
  rows.push(
    ["Prompt tokens", formatTokens(r.usage.promptTokens)],
    ["Answer tokens", formatTokens(r.usage.completionTokens)],
  );
  if (r.usage.reasoningTokens) rows.push(["Reasoning tokens", formatTokens(r.usage.reasoningTokens)]);
  rows.push(["Speed", r.outputTps != null ? formatTps(r.outputTps).replace("tok/s", "tokens per second") : "not reported"]);
  if (r.costUsd != null) rows.push(["Cost source", r.costSource === "reported" ? "Reported by the router" : "Estimated from token prices"]);
  if (r.finishReason) rows.push(["Stopped because", r.finishReason]);

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="num min-w-0 break-words text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      {!hidden && headers.length ? (
        <div>
          <p className="mb-1">Routing headers</p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all text-fg-muted">
            {headers.map(([k, v]) => `${k}: ${v}`).join("\n")}
          </pre>
        </div>
      ) : null}
    </>
  );
}

/** Repeat runs: pick which answer to show, mean ± sd, and a dot per run on a shared time axis. */
function RepeatDetails({ arm, shown, onPick, max }: { arm: ArmRound; shown: number; onPick: (i: number) => void; max: number }) {
  const latency = armSummary(arm, metricDef("latency"));
  const cost = armSummary(arm, metricDef("cost"));
  const ok = okResults(arm).length;
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="flex flex-col gap-2">
      <p>
        {ok} of {arm.reps.length} runs answered. Total time {formatMeanSd(latency.mean, latency.sd, formatMs)}
        {cost.mean != null ? `, cost ${formatMeanSd(cost.mean, cost.sd, formatUsd)}` : ""} (average ± spread).
      </p>
      <div
        className="relative h-6"
        role="img"
        aria-label={`Total time per run: ${latency.values.map((v) => formatMs(v)).join(", ") || "no data"}`}
      >
        <div aria-hidden="true" className="absolute top-1/2 right-0 left-0 h-px bg-border" />
        {latency.values.map((v, i) =>
          v == null ? null : (
            <span
              key={i}
              aria-hidden="true"
              title={`Run ${i + 1}: ${formatMs(v)}`}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-muted"
              style={{ left: pos(v), boxShadow: "0 0 0 2px var(--surface)" }}
            />
          ),
        )}
      </div>
      <div className="num flex justify-between" aria-hidden="true">
        <span>0 s</span>
        <span>{formatMs(max)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show the answer from run">
        <span className="mr-1">Show run</span>
        {arm.reps.map((x) => (
          <button
            key={x.rep}
            type="button"
            onClick={() => onPick(x.rep)}
            aria-pressed={shown === x.rep}
            className={cn(
              "num h-7 min-w-7 rounded-md px-2 text-[13px]",
              shown === x.rep ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              x.status === "error" && "text-danger",
            )}
          >
            {x.rep + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
