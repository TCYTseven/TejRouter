"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { IconAlert, IconDownload, IconFile, IconRefresh, IconSliders } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { formatDateTime, formatMs } from "@/lib/client/format";
import { downloadJson, type AnalysisResult } from "@/lib/client/report";
import { ArmLabel, KindBadge, useReportCtx } from "./section";
import type { AnalysisSettings } from "./use-run-report";

export function ReportHeader({
  result,
  settings,
  analyzing,
  onReanalyze,
}: {
  result: AnalysisResult;
  settings: AnalysisSettings;
  analyzing: boolean;
  onReanalyze: (s: AnalysisSettings) => void;
}) {
  const { report, run, arms } = useReportCtx();
  const m = report.meta;
  const reps = m.repsObserved.min === m.repsObserved.max ? `${m.repsObserved.max}` : `${m.repsObserved.min}–${m.repsObserved.max}`;
  const warnings = [
    ...(run.aborted ? ["This run was stopped before every job finished; per-arm sample counts may differ."] : []),
    ...(run.error ? [`The run ended with an error: ${run.error}`] : []),
    ...report.warnings,
  ];
  const safeName = (m.name || m.runId).replace(/[^\w.-]+/g, "-").slice(0, 60);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Runs", href: "/runs" }, { label: m.runId }]}
        title={<span className="break-words">{m.name || m.runId}</span>}
        description={
          <span className="num text-[13px]">
            {formatDateTime(m.createdAt)} · took {formatMs(m.durationMs)} · {m.suites.length} suite{m.suites.length === 1 ? "" : "s"} · {m.nTasks.toLocaleString("en-US")} tasks · {m.nSamples.toLocaleString("en-US")} samples · {reps} rep{m.repsObserved.max === 1 ? "" : "s"} per task
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="secondary" leftIcon={<IconDownload size={14} />} onClick={() => downloadJson(`${safeName}.run.json`, run)}>
              Export run JSON
            </Button>
            <Button size="sm" variant="secondary" leftIcon={<IconFile size={14} />} onClick={() => downloadJson(`${safeName}.report.json`, report)}>
              Export report JSON
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {m.suites.map((s) => (
            <Badge key={s} mono tone="outline">
              {s}
            </Badge>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <ul aria-label="Arms in this run" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {m.arms.map((a) => {
            const info = arms[a.id];
            return (
              <li key={a.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
                <ArmLabel arm={info} className="text-[13px] text-fg" />
                <KindBadge arm={info} />
              </li>
            );
          })}
        </ul>
        <AnalysisControls result={result} settings={settings} analyzing={analyzing} onReanalyze={onReanalyze} />
      </div>

      {warnings.length ? (
        <div role="status" className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[13px] text-fg">
          <IconAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="font-medium">
              {warnings.length === 1 ? "1 data warning" : `${warnings.length} data warnings`}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-fg-muted">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {!m.hasBaselines ? (
        <p className="text-[12px] text-fg-muted">
          No fixed-model baselines in this run: routing quality vs an oracle needs at least one arm pinned to a single model.{" "}
          <ButtonLink href="/benchmarks" size="xs" variant="ghost">
            Add baselines
          </ButtonLink>
        </p>
      ) : null}
    </div>
  );
}

const ITERS = [200, 400, 1000, 2000, 5000];

function AnalysisControls({
  result,
  settings,
  analyzing,
  onReanalyze,
}: {
  result: AnalysisResult;
  settings: AnalysisSettings;
  analyzing: boolean;
  onReanalyze: (s: AnalysisSettings) => void;
}) {
  const { report } = useReportCtx();
  const [draft, setDraft] = useState<{ iters: number; level: "0.9" | "0.95" | "0.99"; seed: string }>({
    iters: settings.bootstrapIterations,
    level: String(settings.level) as "0.9" | "0.95" | "0.99",
    seed: settings.seed == null ? "" : String(settings.seed),
  });
  const seedNum = draft.seed.trim() === "" ? null : Number(draft.seed);
  const seedInvalid = seedNum != null && (!Number.isInteger(seedNum) || seedNum < 0);
  const o = report.options;
  return (
    <form
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2.5 lg:w-[360px]"
      aria-label="Analysis settings"
      onSubmit={(e) => {
        e.preventDefault();
        if (seedInvalid) return;
        onReanalyze({ bootstrapIterations: draft.iters, level: Number(draft.level), seed: seedNum });
      }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
        <IconSliders size={12} /> Analysis
        <span className="num ml-auto font-normal">
          {result.engine === "worker" ? "worker" : "main thread"} · {Math.round(result.ms)} ms
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
          Bootstrap
          <Select value={String(draft.iters)} onChange={(e) => setDraft((d) => ({ ...d, iters: Number(e.target.value) }))} aria-label="Bootstrap iterations">
            {ITERS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString("en-US")}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-col gap-1 text-[11px] text-fg-muted">
          <span id="lvl-label">Confidence</span>
          <Segmented
            size="sm"
            label="Confidence level"
            value={draft.level}
            onChange={(v) => setDraft((d) => ({ ...d, level: v }))}
            options={[
              { value: "0.9", label: "90" },
              { value: "0.95", label: "95" },
              { value: "0.99", label: "99" },
            ]}
          />
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
          Seed
          <Input
            mono
            inputMode="numeric"
            placeholder={String(o.seed)}
            value={draft.seed}
            aria-invalid={seedInvalid || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, seed: e.target.value }))}
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="num text-[10.5px] text-fg-subtle">
          B = {o.bootstrapIterations.toLocaleString("en-US")} · {Math.round(o.level * 100)}% · seed {o.seed}
        </span>
        <Button type="submit" size="xs" variant="outline" loading={analyzing} leftIcon={analyzing ? undefined : <IconRefresh size={12} />} disabled={seedInvalid}>
          Re-analyze
        </Button>
      </div>
    </form>
  );
}
