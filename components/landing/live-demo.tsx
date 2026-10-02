"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ChatResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { IconPlay, IconRefresh, IconRoute } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { isAbortError, streamChat } from "@/lib/client/chat";
import { formatMs, formatUsd } from "@/lib/client/format";

const PROMPT = "In two sentences: why would a team put an LLM router in front of their models?";

const LANES = [
  { id: "sim-greedy", name: "Sim: Greedy", color: "#94a3b8", note: "mostly picks the cheap model" },
  { id: "sim-oracle", name: "Sim: Difficulty-aware", color: "#64748b", note: "routes by estimated difficulty" },
];

interface Lane {
  text: string;
  result: ChatResult | null;
  status: "idle" | "running" | "done" | "error";
  startedAt: number;
}

const IDLE: Lane = { text: "", result: null, status: "idle", startedAt: 0 };

/**
 * Runs a canned prompt against the two offline simulators through the real
 * /api/chat pipeline, so the landing page shows genuine streaming + metrics.
 */
export function LiveDemo() {
  const [lanes, setLanes] = useState<Lane[]>(LANES.map(() => IDLE));
  const [now, setNow] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const started = useRef(false);
  const running = lanes.some((l) => l.status === "running");

  const run = () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    const t0 = Date.now();
    // A fresh seed per run, so "Run again" shows real run-to-run variance.
    const seed = Math.floor(Math.random() * 1_000_000);
    setLanes(LANES.map(() => ({ ...IDLE, status: "running", startedAt: t0 })));
    LANES.forEach((lane, i) => {
      streamChat(
        { providerId: lane.id, messages: [{ role: "user", content: PROMPT }], temperature: 0.7, maxTokens: 160, seed },
        {
          signal: c.signal,
          onDelta: (_d, full) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, text: full } : l))),
        },
      )
        .then((result) =>
          setLanes((ls) =>
            ls.map((l, j) => (j === i ? { ...l, result, text: result.text || l.text, status: result.ok ? "done" : "error" } : l)),
          ),
        )
        .catch((e) => {
          if (!isAbortError(e)) setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, status: "error" } : l)));
        });
    });
  };

  const onVisible = useEffectEvent(() => {
    if (started.current) return;
    started.current = true;
    run();
  });

  // Auto-run once when the demo scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onVisible();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      ctl.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(t);
  }, [running]);

  const maxLatency = Math.max(1, ...lanes.map((l) => l.result?.latencyMs ?? (l.status === "running" ? Math.max(0, now - l.startedAt) : 0)));

  return (
    <div ref={ref} className="overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="min-w-0 font-mono text-xs text-fg-muted">
          <span className="text-accent-text">›</span> {PROMPT}
        </p>
        <Button
          size="sm"
          variant={running ? "secondary" : "accent"}
          onClick={run}
          loading={running}
          leftIcon={running ? undefined : lanes[0].status === "idle" ? <IconPlay size={12} /> : <IconRefresh size={12} />}
        >
          {running ? "Racing" : lanes[0].status === "idle" ? "Run demo" : "Run again"}
        </Button>
      </div>
      <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0" aria-live="polite">
        {LANES.map((lane, i) => {
          const l = lanes[i];
          const r = l.result;
          const elapsed = r?.latencyMs ?? (l.status === "running" ? Math.max(0, now - l.startedAt) : 0);
          return (
            <div key={lane.id} className="flex min-w-0 flex-col gap-3 p-4" aria-busy={l.status === "running"}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                  <ProviderDot color={lane.color} simulated size={9} />
                  <span className="truncate">{lane.name}</span>
                </span>
                <span className="text-[11px] text-fg-subtle">{lane.note}</span>
              </div>
              <p className="min-h-[84px] text-[13px] leading-relaxed text-fg-muted">
                {l.text || (l.status === "running" ? <span className="text-fg-subtle">waiting for first token…</span> : <span className="text-fg-subtle">Press run to race the simulators.</span>)}
                {l.status === "running" && l.text ? (
                  <span aria-hidden="true" className="ml-0.5 inline-block h-3 w-1 translate-y-0.5 bg-accent motion-safe:animate-caret" />
                ) : null}
              </p>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-fg-subtle">
                  <span>latency</span>
                  <span className="num text-fg">{l.status === "idle" ? "—" : formatMs(elapsed)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-r-[3px] bg-surface-3">
                  <div
                    className={cn("h-full rounded-r-[3px] transition-[width] duration-100 ease-linear")}
                    style={{ width: `${(elapsed / maxLatency) * 100}%`, background: lane.color }}
                  />
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <dt className="text-fg-subtle">TTFT</dt>
                  <dd className="num text-fg">{formatMs(r?.ttftMs)}</dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">Cost</dt>
                  <dd className="num text-fg">{formatUsd(r?.costUsd)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="flex items-center gap-1 text-fg-subtle">
                    <IconRoute size={10} /> Served
                  </dt>
                  <dd className="num truncate text-accent-text">{r?.servedModel ?? "—"}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
