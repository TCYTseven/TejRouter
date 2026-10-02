"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RunSummary } from "@/lib/bench/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ProviderDot } from "@/components/ui/provider";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatNumber } from "@/lib/client/format";
import { deleteRun, exportRun, importRun } from "@/lib/client/bench";
import { armName } from "./config";

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago", then a date. */
function timeAgo(ts: number, now: number): string {
  const d = Math.max(0, now - ts);
  const unit = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"} ago`;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return unit(Math.round(d / 60_000), "minute");
  if (d < 86_400_000) return unit(Math.round(d / 3_600_000), "hour");
  if (d < 7 * 86_400_000) return unit(Math.round(d / 86_400_000), "day");
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function leader(run: RunSummary): { prefix: string; name: string; score: string } | null {
  const scored = run.arms.filter((a) => a.samples > 0);
  if (!scored.length) return null;
  const best = scored.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
  return { prefix: scored.length > 1 ? "Leader: " : "", name: armName(best), score: `${Math.round(best.accuracy * 100)}%` };
}

/** "Leader: Enclave · 84%", truncating the name but never the score. */
function Leader({ run, className }: { run: RunSummary; className?: string }) {
  const l = leader(run);
  if (!l) return <span className={className}>No answers yet</span>;
  return (
    <span className={`flex min-w-0 items-baseline ${className ?? ""}`} title={`${l.prefix}${l.name} · ${l.score}`}>
      <span className="truncate">
        {l.prefix}
        {l.name}
      </span>
      <span className="num shrink-0">&nbsp;· {l.score}</span>
    </span>
  );
}

export function RunsList({ initialRuns, now, simulatedIds }: { initialRuns: RunSummary[]; now: number; simulatedIds: string[] }) {
  const sims = new Set(simulatedIds);
  const toast = useToast();
  const [runs, setRuns] = useState(initialRuns);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await importRun(file);
      setRuns((rs) => [res.run, ...rs.filter((r) => r.id !== res.run.id)].sort((a, b) => b.createdAt - a.createdAt));
      toast({
        title: `Imported “${res.run.name}”`,
        description: res.warning ? `It could not be saved to disk: ${res.warning}` : undefined,
        tone: res.persisted ? "success" : "info",
      });
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDownload = async (id: string) => {
    try {
      await exportRun(id);
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : String(e), tone: "error" });
    }
  };

  const onDelete = async (run: RunSummary) => {
    try {
      await deleteRun(run.id);
      setRuns((rs) => rs.filter((r) => r.id !== run.id));
      toast({ title: `Deleted “${run.name}”`, tone: "success" });
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : String(e), tone: "error" });
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onImport(e.target.files?.[0])}
      />
      <PageHeader
        title="Results"
        description="Every benchmark you have run. Open one to see the full report."
        actions={
          <Button variant="secondary" size="sm" loading={importing} onClick={() => fileRef.current?.click()}>
            Import
          </Button>
        }
      />

      {runs.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border-strong px-6 py-14 text-center">
          <p className="text-[15px] text-fg-muted">Your benchmark results will appear here.</p>
          <ButtonLink href="/benchmarks" variant="primary">
            Run a benchmark
          </ButtonLink>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.1fr)_7.5rem_6rem_3.5rem_minmax(0,1fr)_2.5rem] gap-4 border-b border-border px-5 py-2.5 text-[13px] text-fg-muted md:grid">
            <span>Name</span>
            <span>Date</span>
            <span>Routers</span>
            <span className="text-right">Tasks</span>
            <span>Result</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                now={now}
                sims={sims}
                onDownload={() => onDownload(r.id)}
                onDelete={() => onDelete(r)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RunRow({
  run,
  now,
  sims,
  onDownload,
  onDelete,
}: {
  run: RunSummary;
  now: number;
  sims: Set<string>;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const href = `/runs/${encodeURIComponent(run.id)}`;
  const incomplete = run.aborted || run.sampleCount < run.totalJobs;
  const names = run.arms.map(armName).join(", ");
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-surface-2 md:grid-cols-[minmax(0,1.1fr)_7.5rem_6rem_3.5rem_minmax(0,1fr)_2.5rem]">
      <div className="min-w-0">
        <Link
          href={href}
          className="block truncate text-[15px] font-medium text-fg after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-ring"
        >
          {run.name}
        </Link>
        {incomplete ? <p className="text-[13px] text-warning">Stopped before the end</p> : null}
        {/* Phone: the other columns collapse into one line. */}
        <div className="text-sm text-fg-muted md:hidden">
          <p className="num">
            {timeAgo(run.createdAt, now)} · {formatNumber(run.taskCount)} tasks
          </p>
          <Leader run={run} className="text-fg" />
        </div>
      </div>
      <time
        dateTime={new Date(run.createdAt).toISOString()}
        title={formatDateTime(run.createdAt)}
        className="hidden text-sm text-fg-muted md:block"
      >
        {timeAgo(run.createdAt, now)}
      </time>
      <span className="hidden items-center gap-1.5 md:flex" title={names}>
        {run.arms.slice(0, 6).map((a) => (
          <ProviderDot key={a.armId} color={a.color} simulated={sims.has(a.providerId)} size={10} />
        ))}
        {run.arms.length > 6 ? <span className="num text-[13px] text-fg-muted">+{run.arms.length - 6}</span> : null}
        <span className="sr-only">{names}</span>
      </span>
      <span className="num hidden text-right text-sm text-fg-muted md:block">{formatNumber(run.taskCount)}</span>
      <Leader run={run} className="text-sm text-fg max-md:hidden" />
      <div className="col-start-2 row-span-full row-start-1 md:col-start-auto md:row-span-1 md:row-start-auto">
        <RowMenu name={run.name} onDownload={onDownload} onDelete={onDelete} />
      </div>
    </li>
  );
}

function RowMenu({ name, onDownload, onDelete }: { name: string; onDownload: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-surface-2 focus:bg-surface-2 focus:outline-none";
  return (
    <div ref={ref} className="relative z-10">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setConfirming(false);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label={`Actions for ${name}`}
          className="absolute top-full right-0 z-40 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {confirming ? (
            <div className="flex flex-col gap-2 px-3 py-2">
              <p className="text-sm text-fg">Delete this run for good?</p>
              <div className="flex gap-2">
                <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button
                  size="xs"
                  variant="danger"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className={`${item} text-fg`}
                onClick={() => {
                  setOpen(false);
                  onDownload();
                }}
              >
                Download data
              </button>
              <button type="button" role="menuitem" className={`${item} text-danger`} onClick={() => setConfirming(true)}>
                Delete…
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
