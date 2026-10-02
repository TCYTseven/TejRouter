"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { IconCheckCircle, IconChevronLeft, IconChevronRight, IconSearch, IconX, IconXCircle } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/markdown";
import type { BenchSample } from "@/lib/bench/types";
import { formatTps } from "@/lib/client/format";
import { ms, num, usd } from "./format";
import { ArmLabel, ReportSection, Val, useReportCtx } from "./section";

type Outcome = "all" | "correct" | "wrong" | "error";

const keyOf = (s: BenchSample) => `${s.armId}|${s.taskId}|${s.rep}`;

export function SamplesSection({ index }: { index: number }) {
  const { run, arm } = useReportCtx();
  const samples = run.samples;
  const [q, setQ] = useState("");
  const [armF, setArmF] = useState("all");
  const [suite, setSuite] = useState("all");
  const [cat, setCat] = useState("all");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [model, setModel] = useState("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const dq = useDeferredValue(q.trim().toLowerCase());

  const opts = useMemo(() => {
    const suites = new Set<string>();
    const cats = new Set<string>();
    const models = new Set<string>();
    for (const s of samples) {
      suites.add(s.suiteId);
      cats.add(s.category);
      models.add(s.result.servedModel ?? "(not reported)");
    }
    return { suites: [...suites].sort(), cats: [...cats].sort(), models: [...models].sort() };
  }, [samples]);

  const filtered = useMemo(
    () =>
      samples.filter((s) => {
        if (armF !== "all" && s.armId !== armF) return false;
        if (suite !== "all" && s.suiteId !== suite) return false;
        if (cat !== "all" && s.category !== cat) return false;
        if (model !== "all" && (s.result.servedModel ?? "(not reported)") !== model) return false;
        if (outcome === "correct" && !(s.result.ok && s.grade.correct)) return false;
        if (outcome === "wrong" && !(s.result.ok && !s.grade.correct)) return false;
        if (outcome === "error" && s.result.ok) return false;
        if (dq && !`${s.taskId} ${s.result.text} ${s.grade.extracted ?? ""} ${s.result.error ?? ""}`.toLowerCase().includes(dq)) return false;
        return true;
      }),
    [samples, armF, suite, cat, model, outcome, dq],
  );

  const nErr = samples.filter((s) => !s.result.ok).length;
  const reset = () => {
    setQ("");
    setArmF("all");
    setSuite("all");
    setCat("all");
    setOutcome("all");
    setModel("all");
    setPage(0);
  };
  const setter = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setPage(0);
  };

  const openIdx = open ? filtered.findIndex((s) => keyOf(s) === open) : -1;
  const openSample = openIdx >= 0 ? filtered[openIdx] : open ? samples.find((s) => keyOf(s) === open) ?? null : null;

  return (
    <ReportSection
      id="samples"
      index={index}
      title="Sample explorer"
      takeaway={
        <>
          Every one of the {samples.length.toLocaleString("en-US")} graded responses{nErr ? `, including ${nErr} failed calls` : ""}. Filter, sort, and open a row for the full response, grade and routing headers.
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-end gap-2" role="search" aria-label="Filter samples">
        <label className="relative flex min-w-[180px] flex-1 flex-col gap-1 text-[11px] text-fg-muted sm:max-w-[260px]">
          Search
          <span className="relative">
            <IconSearch size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
            <Input value={q} onChange={(e) => setter(setQ)(e.target.value)} placeholder="Task id, answer, error…" className="pl-8" />
          </span>
        </label>
        <Filter label="Arm" value={armF} onChange={setter(setArmF)} options={run.arms.map((a) => ({ value: a.id, label: arm(a.id).label }))} />
        <Filter label="Suite" value={suite} onChange={setter(setSuite)} options={opts.suites.map((s) => ({ value: s, label: s }))} />
        <Filter label="Category" value={cat} onChange={setter(setCat)} options={opts.cats.map((s) => ({ value: s, label: s }))} />
        <Filter label="Served model" value={model} onChange={setter(setModel)} options={opts.models.map((s) => ({ value: s, label: s }))} />
        <Filter
          label="Outcome"
          value={outcome}
          onChange={(v) => setter(setOutcome)(v as Outcome)}
          options={[
            { value: "correct", label: "Correct" },
            { value: "wrong", label: "Wrong" },
            { value: "error", label: "Error" },
          ]}
        />
        <Button size="sm" variant="ghost" onClick={reset}>
          Reset
        </Button>
        <span className="num ml-auto self-center text-[11px] text-fg-subtle" aria-live="polite">
          {filtered.length.toLocaleString("en-US")} of {samples.length.toLocaleString("en-US")}
        </span>
      </div>
      <DataTable
        caption="Benchmark samples"
        rows={filtered}
        getKey={keyOf}
        pageSize={25}
        page={page}
        onPageChange={setPage}
        minWidth={1040}
        selectedKey={open}
        onRowClick={(s) => setOpen(keyOf(s))}
        rowLabel={(s) => `Open sample ${s.taskId}, ${arm(s.armId).label}, repetition ${s.rep + 1}`}
        columns={[
          { key: "task", header: "Task", render: (s) => <span className="block max-w-[220px] truncate font-mono text-[11px]" title={s.taskId}>{s.taskId}</span>, sort: (s) => s.taskId },
          { key: "arm", header: "Arm", render: (s) => <ArmLabel arm={arm(s.armId)} className="max-w-[180px]" />, sort: (s) => arm(s.armId).label },
          { key: "rep", header: "Rep", align: "right", render: (s) => s.rep + 1, sort: (s) => s.rep },
          { key: "cat", header: "Category", render: (s) => s.category, sort: (s) => s.category },
          { key: "diff", header: "Diff.", align: "right", render: (s) => num(s.difficulty, 2), sort: (s) => s.difficulty },
          { key: "model", header: "Served model", render: (s) => (s.result.servedModel ? <span className="font-mono text-[11px]">{s.result.servedModel}</span> : <Val v={null} fmt={String} reason="the router did not report a model" />), sort: (s) => s.result.servedModel },
          { key: "score", header: "Score", align: "right", render: (s) => (s.result.ok ? num(s.grade.score, 2) : "—"), sort: (s) => (s.result.ok ? s.grade.score : -1) },
          { key: "ok", header: "Result", align: "center", render: (s) => <Outcome s={s} />, sort: (s) => (!s.result.ok ? 0 : s.grade.correct ? 2 : 1) },
          { key: "lat", header: "Latency", align: "right", render: (s) => ms(s.result.latencyMs), sort: (s) => s.result.latencyMs },
          { key: "ttft", header: "TTFT", align: "right", render: (s) => <Val v={s.result.ttftMs} fmt={ms} reason="no first-token timing" />, sort: (s) => s.result.ttftMs, hideOnMobile: true },
          { key: "cost", header: "Cost", align: "right", render: (s) => <Val v={s.result.costUsd} fmt={usd} reason="no cost reported or estimated" />, sort: (s) => s.result.costUsd },
          { key: "err", header: "Error", render: (s) => (s.result.error ? <span className="line-clamp-1 max-w-[180px] text-danger" title={s.result.error}>{s.result.error}</span> : ""), hideOnMobile: true },
        ]}
      />
      {openSample ? (
        <SampleDrawer
          s={openSample}
          onClose={() => setOpen(null)}
          onPrev={openIdx > 0 ? () => setOpen(keyOf(filtered[openIdx - 1])) : undefined}
          onNext={openIdx >= 0 && openIdx < filtered.length - 1 ? () => setOpen(keyOf(filtered[openIdx + 1])) : undefined}
          position={openIdx >= 0 ? `${openIdx + 1} of ${filtered.length}` : undefined}
        />
      ) : null}
    </ReportSection>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex min-w-[130px] flex-col gap-1 text-[11px] text-fg-muted">
      {label}
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-[200px]">
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

function Outcome({ s }: { s: BenchSample }) {
  if (!s.result.ok) return <Badge tone="danger">error</Badge>;
  return s.grade.correct ? (
    <span className="inline-flex items-center gap-1 text-success">
      <IconCheckCircle size={13} />
      <span className="text-[11px]">correct</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-fg-muted">
      <IconXCircle size={13} />
      <span className="text-[11px]">wrong</span>
    </span>
  );
}

function SampleDrawer({ s, onClose, onPrev, onNext, position }: { s: BenchSample; onClose: () => void; onPrev?: () => void; onNext?: () => void; position?: string }) {
  const { arm } = useReportCtx();
  const ref = useRef<HTMLDivElement>(null);
  const a = arm(s.armId);
  const r = s.result;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev && !(e.target instanceof HTMLInputElement)) onPrev();
      if (e.key === "ArrowRight" && onNext && !(e.target instanceof HTMLInputElement)) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);
  const headers = Object.entries(r.routingHeaders ?? {});
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button type="button" aria-label="Close sample" className="absolute inset-0 bg-overlay animate-fade-in" onClick={onClose} tabIndex={-1} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Sample ${s.taskId} from ${a.label}`}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-[560px] flex-col border-l border-border bg-surface shadow-lg outline-none animate-rise"
      >
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[12px] break-all text-fg">{s.taskId}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-fg-muted">
              <ArmLabel arm={a} />
              <span>· rep {s.rep + 1}</span>
              <Outcome s={s} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            {position ? <span className="num mr-1 text-[10.5px] text-fg-subtle">{position}</span> : null}
            <Button size="icon-sm" variant="ghost" aria-label="Previous sample" disabled={!onPrev} onClick={onPrev}>
              <IconChevronLeft size={14} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Next sample" disabled={!onNext} onClick={onNext}>
              <IconChevronRight size={14} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
              <IconX size={14} />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] sm:grid-cols-3">
            <Kv k="Suite" v={s.suiteId} />
            <Kv k="Category" v={s.category} />
            <Kv k="Difficulty" v={num(s.difficulty, 2)} />
            <Kv k="Requested" v={<span className="font-mono">{r.requestedModel || "—"}</span>} />
            <Kv k="Served model" v={r.servedModel ? <span className="font-mono">{r.servedModel}</span> : <Val v={null} fmt={String} reason="not reported by the router" />} />
            <Kv k="Upstream" v={r.servedProvider ?? "—"} />
            <Kv k="Latency" v={ms(r.latencyMs)} />
            <Kv k="TTFT" v={<Val v={r.ttftMs} fmt={ms} reason="no first-token timing" />} />
            <Kv k="Output speed" v={<Val v={r.outputTps} fmt={formatTps} reason="not measured" />} />
            <Kv k="Cost" v={<Val v={r.costUsd} fmt={usd} reason="not reported or estimated" />} />
            <Kv k="Cost source" v={r.costSource ?? "—"} />
            <Kv k="Tokens in / out" v={`${r.usage.promptTokens ?? "—"} / ${r.usage.completionTokens ?? "—"}`} />
            <Kv k="HTTP" v={r.httpStatus ?? "—"} />
            <Kv k="Finish" v={r.finishReason ?? "—"} />
            <Kv k="Attempts" v={s.attempts ?? 1} />
          </dl>

          <h3 className="eyebrow mt-5 mb-1.5">Grade</h3>
          <div className="rounded-md border border-border bg-surface-2/60 p-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Score <span className="num font-semibold text-fg">{r.ok ? num(s.grade.score, 2) : "0 (error)"}</span>
              </span>
              <Outcome s={s} />
            </div>
            <p className="mt-1.5 text-fg-muted">{s.grade.detail || "—"}</p>
            <p className="mt-1.5 text-fg-muted">
              Extracted answer: <span className="font-mono text-fg">{s.grade.extracted ?? "—"}</span>
            </p>
          </div>

          {r.error ? (
            <>
              <h3 className="eyebrow mt-5 mb-1.5">Error</h3>
              <p className="rounded-md border border-danger/30 bg-danger-soft p-3 font-mono text-[11.5px] break-words text-danger">{r.error}</p>
            </>
          ) : null}

          <h3 className="eyebrow mt-5 mb-1.5">Response</h3>
          <div className="rounded-md border border-border p-3">
            {r.text ? <Markdown text={r.text} /> : <p className="text-[12px] text-fg-subtle">Empty response.</p>}
          </div>

          <h3 className="eyebrow mt-5 mb-1.5">Routing headers</h3>
          {headers.length ? (
            <dl className="rounded-md border border-border font-mono text-[11px]">
              {headers.map(([k, v]) => (
                <div key={k} className="flex gap-3 border-b border-border px-3 py-1.5 last:border-b-0">
                  <dt className="shrink-0 text-fg-subtle">{k}</dt>
                  <dd className="min-w-0 break-all text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[12px] text-fg-subtle">No routing headers were captured for this response.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0 py-0.5">
      <dt className="text-[10.5px] text-fg-subtle">{k}</dt>
      <dd className="num truncate text-fg">{v}</dd>
    </div>
  );
}
