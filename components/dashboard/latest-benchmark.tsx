"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconArrowRight, IconFlask, IconList } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { SkeletonText } from "@/components/ui/skeleton";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/client/format";

/**
 * Minimal "latest benchmark" panel. GET /api/runs is built by another module
 * and may 404 or be empty; every failure collapses to an empty state.
 * The summary shape is read defensively.
 */
interface RunSummaryLike {
  id: string;
  name?: string;
  createdAt?: number;
  finishedAt?: number | null;
  arms?: Array<{ id?: string; label?: string; color?: string; providerId?: string }> | number;
  armCount?: number;
  sampleCount?: number;
  samples?: number | unknown[];
  totalSamples?: number;
}

type State = { status: "loading" } | { status: "empty" } | { status: "ok"; run: RunSummaryLike; total: number };

export function LatestBenchmark() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/runs", { signal: ctl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { runs?: RunSummaryLike[] };
        const runs = (body.runs ?? []).filter((r) => r && typeof r.id === "string");
        if (!runs.length) return setState({ status: "empty" });
        const latest = [...runs].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
        setState({ status: "ok", run: latest, total: runs.length });
      })
      .catch(() => {
        if (!ctl.signal.aborted) setState({ status: "empty" });
      });
    return () => ctl.abort();
  }, []);

  return (
    <Card as="section" aria-labelledby="latest-bench-title" className="flex flex-col">
      <CardHeader
        title={<span id="latest-bench-title">Latest benchmark</span>}
        icon={<IconFlask size={14} />}
        actions={
          <Link href="/runs" className="text-[11px] text-fg-subtle hover:text-fg">
            All runs
          </Link>
        }
      />
      <div className="flex-1 p-4" aria-live="polite" aria-busy={state.status === "loading"}>
        {state.status === "loading" ? <SkeletonText lines={4} /> : null}
        {state.status === "empty" ? (
          <EmptyState
            compact
            icon={<IconList size={18} />}
            title="No benchmark runs yet"
            description="Run a suite against your routers to see accuracy, latency and cost with confidence intervals."
            action={
              <ButtonLink href="/benchmarks" variant="secondary" size="sm" rightIcon={<IconArrowRight size={13} />}>
                Run a benchmark
              </ButtonLink>
            }
          />
        ) : null}
        {state.status === "ok" ? <RunSummary run={state.run} total={state.total} /> : null}
      </div>
    </Card>
  );
}

function RunSummary({ run, total }: { run: RunSummaryLike; total: number }) {
  const arms = Array.isArray(run.arms) ? run.arms : [];
  const armCount = Array.isArray(run.arms) ? run.arms.length : (run.armCount ?? (typeof run.arms === "number" ? run.arms : null));
  const samples =
    run.sampleCount ?? run.totalSamples ?? (Array.isArray(run.samples) ? run.samples.length : typeof run.samples === "number" ? run.samples : null);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Link href={`/runs/${encodeURIComponent(run.id)}`} className="text-sm font-medium text-fg hover:text-accent-text">
          {run.name || run.id}
        </Link>
        <p className="num mt-0.5 text-[11px] text-fg-subtle" title={formatDateTime(run.createdAt)}>
          {formatDateTime(run.createdAt)} · {formatRelativeTime(run.createdAt)}
          {run.finishedAt === null ? " · in progress" : ""}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
          <dt className="text-[10px] text-fg-subtle">Arms</dt>
          <dd className="num text-sm text-fg">{armCount ?? "—"}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
          <dt className="text-[10px] text-fg-subtle">Samples</dt>
          <dd className="num text-sm text-fg">{samples != null ? formatNumber(samples) : "—"}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
          <dt className="text-[10px] text-fg-subtle">Runs saved</dt>
          <dd className="num text-sm text-fg">{total}</dd>
        </div>
      </dl>
      {arms.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Arms in this run">
          {arms.slice(0, 8).map((a, i) => (
            <li key={a.id ?? i} className="flex items-center gap-1.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
              <ProviderDot color={a.color} size={7} />
              {a.label ?? a.id ?? a.providerId}
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={`/runs/${encodeURIComponent(run.id)}`}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-accent-text hover:underline"
      >
        Open report <IconArrowRight size={12} />
      </Link>
    </div>
  );
}
