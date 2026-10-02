"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import type { RunArmSummary, RunSummary } from "@/lib/bench/types";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import {
  IconArrowRight,
  IconDownload,
  IconFile,
  IconFlask,
  IconList,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { ProviderDot } from "@/components/ui/provider";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/client/cn";
import { formatDateTime, formatMs, formatNumber, formatPercent, formatRelativeTime, formatUsd } from "@/lib/client/format";
import { deleteRun, exportRun, fetchRuns, importRun } from "@/lib/client/bench";

export function RunsList({ initialRuns, now, simulatedIds }: { initialRuns: RunSummary[]; now: number; simulatedIds: string[] }) {
  const sims = useMemo(() => new Set(simulatedIds), [simulatedIds]);
  const toast = useToast();
  const [runs, setRuns] = useState(initialRuns);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | "delete" | "import" | "refresh">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.suiteIds.some((s) => s.includes(q)) ||
        r.arms.some((a) => a.label.toLowerCase().includes(q)),
    );
  }, [runs, query]);

  const visibleSelected = filtered.filter((r) => selected.has(r.id));
  const allChecked = filtered.length > 0 && visibleSelected.length === filtered.length;

  const refresh = async () => {
    setBusy("refresh");
    try {
      const next = await fetchRuns();
      setRuns(next);
      setSelected((s) => new Set([...s].filter((id) => next.some((r) => r.id === id))));
    } catch (e) {
      toast({ title: "Could not load runs", description: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulkDelete = async () => {
    const ids = visibleSelected.map((r) => r.id);
    setBusy("delete");
    const results = await Promise.allSettled(ids.map((id) => deleteRun(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    const ok = ids.filter((_, i) => results[i].status === "fulfilled");
    setRuns((rs) => rs.filter((r) => !ok.includes(r.id)));
    setSelected(new Set());
    setConfirming(false);
    setBusy(null);
    toast(
      failed
        ? { title: `Deleted ${ok.length}, ${failed} failed`, tone: "error" }
        : { title: `Deleted ${ok.length} run${ok.length === 1 ? "" : "s"}`, tone: "success" },
    );
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy("import");
    try {
      const res = await importRun(file);
      setRuns((rs) => [res.run, ...rs.filter((r) => r.id !== res.run.id)].sort((a, b) => b.createdAt - a.createdAt));
      toast({
        title: `Imported “${res.run.name}”`,
        description: res.warning ? `Not saved to disk: ${res.warning}` : `${formatNumber(res.run.sampleCount)} samples`,
        tone: res.persisted ? "success" : "info",
      });
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onExport = async (id: string) => {
    try {
      await exportRun(id);
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : String(e), tone: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Runs"
        icon={<IconList size={16} />}
        breadcrumbs={[{ label: "TejRouter", href: "/dashboard" }, { label: "Runs" }]}
        description="Every saved benchmark run. Open one for the full report: significance tests, cost-quality frontier, routing analysis."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => onImport(e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" leftIcon={<IconFile size={13} />} loading={busy === "import"} onClick={() => fileRef.current?.click()}>
              Import JSON
            </Button>
            <ButtonLink href="/benchmarks" variant="accent" size="sm" leftIcon={<IconFlask size={13} />}>
              New benchmark
            </ButtonLink>
          </>
        }
      />

      {runs.length === 0 ? (
        <EmptyState
          icon={<IconFlask size={18} />}
          title="No runs yet"
          description="Run a benchmark (the offline simulators work with no keys) or import a run JSON exported from another TejRouter."
          action={
            <>
              <ButtonLink href="/benchmarks" variant="accent" size="sm" rightIcon={<IconArrowRight size={13} />}>
                Run a benchmark
              </ButtonLink>
              <Button variant="secondary" size="sm" leftIcon={<IconFile size={13} />} onClick={() => fileRef.current?.click()}>
                Import JSON
              </Button>
            </>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = visibleSelected.length > 0 && !allChecked;
                  }}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)))}
                />
                {visibleSelected.length ? `${visibleSelected.length} selected` : "Select all"}
              </label>
              {visibleSelected.length && !confirming ? (
                <Button variant="danger" size="sm" leftIcon={<IconTrash size={13} />} onClick={() => setConfirming(true)}>
                  Delete
                </Button>
              ) : null}
              <span className="num text-[11px] text-fg-subtle">
                {filtered.length === runs.length ? `${runs.length} runs` : `${filtered.length} of ${runs.length}`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative w-full sm:w-64">
                <label htmlFor={searchId} className="sr-only">
                  Filter runs
                </label>
                <IconSearch size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
                <Input id={searchId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name, suite, arm…" className="pl-7" />
              </div>
              <Button variant="ghost" size="icon" aria-label="Refresh runs" title="Refresh" loading={busy === "refresh"} onClick={refresh}>
                <IconRefresh size={14} />
              </Button>
            </div>
          </div>

          {confirming && visibleSelected.length ? (
            <div role="alertdialog" aria-labelledby="confirm-del" className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p id="confirm-del" className="text-sm text-fg">
                Delete {visibleSelected.length} run{visibleSelected.length === 1 ? "" : "s"} permanently? Export first if you may need {visibleSelected.length === 1 ? "it" : "them"}.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} autoFocus>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" leftIcon={<IconTrash size={13} />} loading={busy === "delete"} onClick={bulkDelete}>
                  Delete {visibleSelected.length}
                </Button>
              </div>
            </div>
          ) : null}

          {filtered.length ? (
            <ul className="flex flex-col gap-3">
              {filtered.map((r) => (
                <RunCard key={r.id} run={r} now={now} sims={sims} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} onExport={() => onExport(r.id)} />
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No runs match" description={`Nothing matches “${query}”.`} />
          )}
        </>
      )}
    </div>
  );
}

function RunCard({
  run,
  now,
  sims,
  checked,
  onToggle,
  onExport,
}: {
  run: RunSummary;
  now: number;
  sims: Set<string>;
  checked: boolean;
  onToggle: () => void;
  onExport: () => void;
}) {
  const href = `/runs/${encodeURIComponent(run.id)}`;
  const maxLat = Math.max(0, ...run.arms.map((a) => a.meanLatencyMs ?? 0));
  const maxCost = Math.max(0, ...run.arms.map((a) => a.totalCostUsd ?? 0));
  const incomplete = run.sampleCount < run.totalJobs;
  const best = run.arms.length > 1 ? Math.max(...run.arms.map((a) => a.accuracy)) : null;

  return (
    <li className={cn("min-w-0 rounded-lg border bg-surface shadow-sm transition-colors", checked ? "border-accent-line" : "border-border hover:border-border-strong")}>
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${run.name}`}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={href} className="min-w-0 truncate text-sm font-medium text-fg hover:text-accent-text">
              {run.name}
            </Link>
            {run.aborted ? <Badge tone="warning">aborted</Badge> : null}
            {!run.aborted && incomplete ? <Badge tone="warning">incomplete</Badge> : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fg-subtle">
            <time dateTime={new Date(run.createdAt).toISOString()} title={formatDateTime(run.createdAt)}>
              {formatRelativeTime(run.createdAt, now)}
            </time>
            <span aria-hidden="true">·</span>
            <span className="num">{formatNumber(run.taskCount)} tasks</span>
            <span aria-hidden="true">·</span>
            <span className="num">
              {formatNumber(run.sampleCount)}
              {incomplete ? `/${formatNumber(run.totalJobs)}` : ""} samples
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate font-mono">{run.id}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {run.suiteIds.map((s) => (
              <Badge key={s} tone="neutral">
                {s}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Export ${run.name} as JSON`} title="Export JSON" onClick={onExport}>
            <IconDownload size={14} />
          </Button>
          <span className="hidden sm:inline-flex">
            <ButtonLink href={href} variant="secondary" size="sm" rightIcon={<IconArrowRight size={12} />}>
              Report
            </ButtonLink>
          </span>
        </div>
      </div>

      {run.arms.length ? (
        <div className="border-t border-border px-4 py-2.5">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] gap-x-4 pb-1 text-[10px] text-fg-subtle md:grid">
            <span>arm</span>
            <span>accuracy</span>
            <span>mean latency</span>
            <span>total cost</span>
          </div>
          <ul className="flex flex-col gap-2 md:gap-1">
            {run.arms.map((a) => (
              <ArmRow key={a.armId} arm={a} maxLat={maxLat} maxCost={maxCost} best={best} simulated={sims.has(a.providerId)} />
            ))}
          </ul>
        </div>
      ) : null}
      <Link href={href} className="flex items-center justify-center gap-1 border-t border-border py-2 text-xs font-medium text-accent-text sm:hidden">
        Open report <IconArrowRight size={12} />
      </Link>
    </li>
  );
}

function MiniBar({ frac, color, value, label }: { frac: number | null; color: string; value: string; label: string }) {
  const bar = (
    <div className="h-1.5 w-full min-w-6 shrink-0 rounded-full bg-surface-3 md:w-auto md:flex-1" aria-hidden="true">
      {frac != null ? (
        <div className="h-full rounded-full" style={{ width: `${Math.max(frac > 0 ? 3 : 0, Math.min(1, frac) * 100)}%`, background: color }} />
      ) : null}
    </div>
  );
  return (
    <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:gap-2">
      <div className="flex items-baseline justify-between gap-1 md:contents">
        <span className="text-[10px] text-fg-subtle md:hidden">{label}</span>
        <span className="num shrink-0 text-right text-[11px] text-fg md:order-last md:w-14">{value}</span>
      </div>
      {bar}
    </div>
  );
}

function ArmRow({ arm, maxLat, maxCost, best, simulated }: { arm: RunArmSummary; maxLat: number; maxCost: number; best: number | null; simulated: boolean }) {
  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] md:items-center">
      <div className="flex min-w-0 items-center gap-1.5">
        <ProviderDot color={arm.color} simulated={simulated} size={8} />
        <span className="truncate text-xs text-fg-muted" title={arm.label}>
          {arm.label}
        </span>
        {best != null && arm.accuracy === best && arm.samples > 0 ? <span className="text-[10px] text-fg-subtle">top</span> : null}
        {arm.errors ? (
          <span className="num shrink-0 text-[10px] text-danger" title={`${arm.errors} failed calls`}>
            {arm.errors} err
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-x-3 md:contents">
        <MiniBar label="accuracy" frac={arm.samples ? arm.accuracy : null} color={arm.color} value={arm.samples ? formatPercent(arm.accuracy) : "—"} />
        <MiniBar
          label="latency"
          frac={arm.meanLatencyMs != null && maxLat ? arm.meanLatencyMs / maxLat : null}
          color={arm.color}
          value={formatMs(arm.meanLatencyMs)}
        />
        <MiniBar
          label="cost"
          frac={arm.totalCostUsd != null && maxCost ? arm.totalCostUsd / maxCost : null}
          color={arm.color}
          value={arm.totalCostUsd != null ? formatUsd(arm.totalCostUsd) : "—"}
        />
      </div>
    </li>
  );
}
