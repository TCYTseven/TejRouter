"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Input, Select } from "@/components/ui/field";
import { IconAlert, IconCheckCircle, IconChevronLeft, IconChevronRight, IconSearch, IconX, IconXCircle } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/markdown";
import type { BenchSample } from "@/lib/bench/types";
import { formatTps } from "@/lib/client/format";
import { ms, num, usd } from "./format";
import { ArmLabel, Panel, Val, useReportCtx } from "./section";

type Outcome = "all" | "correct" | "wrong" | "error";

const keyOf = (s: BenchSample) => `${s.armId}|${s.taskId}|${s.rep}`;

export function SamplesTab() {
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
    <Panel
      id="answers"
      title="Every answer"
      takeaway={
        <>
          All {samples.length.toLocaleString("en-US")} graded answers{nErr ? `, including ${nErr} failed calls` : ""}. Open a row to read the full answer and how it was graded.
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3" role="search" aria-label="Filter answers">
        <label className="relative flex min-w-[180px] flex-1 flex-col gap-1 text-[13px] text-fg-muted sm:max-w-[260px]">
          Search
          <span className="relative">
            <IconSearch size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
            <Input value={q} onChange={(e) => setter(setQ)(e.target.value)} placeholder="Task, answer or error" className="pl-8" />
          </span>
        </label>
        <Filter label="Router" value={armF} onChange={setter(setArmF)} options={run.arms.map((a) => ({ value: a.id, label: arm(a.id).label }))} />
        <Filter label="Test set" value={suite} onChange={setter(setSuite)} options={opts.suites.map((s) => ({ value: s, label: s }))} />
        <Filter label="Task type" value={cat} onChange={setter(setCat)} options={opts.cats.map((s) => ({ value: s, label: s }))} />
        <Filter label="Model used" value={model} onChange={setter(setModel)} options={opts.models.map((s) => ({ value: s, label: s }))} />
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
        <span className="num ml-auto self-center text-[13px] text-fg-muted" aria-live="polite">
          {filtered.length.toLocaleString("en-US")} of {samples.length.toLocaleString("en-US")}
        </span>
      </div>
      <DataTable
        caption="Graded answers"
        rows={filtered}
        getKey={keyOf}
        pageSize={25}
        page={page}
        onPageChange={setPage}
        minWidth={900}
        selectedKey={open}
        onRowClick={(s) => setOpen(keyOf(s))}
        rowLabel={(s) => `Open answer to ${s.taskId} from ${arm(s.armId).label}, run ${s.rep + 1}`}
        columns={[
          { key: "task", header: "Task", render: (s) => <span className="inline-block max-w-[220px] truncate align-middle" title={s.taskId}>{s.taskId}</span>, sort: (s) => s.taskId },
          { key: "arm", header: "Router", render: (s) => <ArmLabel arm={arm(s.armId)} className="max-w-[200px]" />, sort: (s) => arm(s.armId).label },
          { key: "cat", header: "Task type", render: (s) => s.category, sort: (s) => s.category, hideOnMobile: true },
          { key: "model", header: "Model used", render: (s) => (s.result.servedModel ? <span className="font-mono text-[13px]">{s.result.servedModel}</span> : <Val v={null} fmt={String} reason="the router did not say which model answered" />), sort: (s) => s.result.servedModel },
          { key: "ok", header: "Result", render: (s) => <Outcome s={s} />, sort: (s) => (!s.result.ok ? 0 : s.grade.correct ? 2 : 1) },
          { key: "lat", header: "Time", align: "right", render: (s) => ms(s.result.latencyMs), sort: (s) => s.result.latencyMs },
          { key: "cost", header: "Cost", align: "right", render: (s) => <Val v={s.result.costUsd} fmt={usd} reason="no cost reported or estimated" />, sort: (s) => s.result.costUsd },
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
    </Panel>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex min-w-[140px] flex-col gap-1 text-[13px] text-fg-muted">
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
  if (!s.result.ok)
    return (
      <span className="inline-flex items-center gap-1.5 text-danger">
        <IconAlert size={14} />
        <span className="text-[13px]">Failed</span>
      </span>
    );
  return s.grade.correct ? (
    <span className="inline-flex items-center gap-1.5 text-success">
      <IconCheckCircle size={14} />
      <span className="text-[13px]">Correct</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-fg-muted">
      <IconXCircle size={14} />
      <span className="text-[13px]">Wrong</span>
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
        aria-label={`Answer to ${s.taskId} from ${a.label}`}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-[600px] flex-col border-l border-border bg-surface shadow-lg outline-none animate-rise"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4 max-sm:px-5">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold break-all text-fg">{s.taskId}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
              <ArmLabel arm={a} />
              <span>Run {s.rep + 1}</span>
              <Outcome s={s} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            {position ? <span className="num mr-1 text-[13px] text-fg-muted">{position}</span> : null}
            <Button size="icon-sm" variant="ghost" aria-label="Previous answer" disabled={!onPrev} onClick={onPrev}>
              <IconChevronLeft size={14} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Next answer" disabled={!onNext} onClick={onNext}>
              <IconChevronRight size={14} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
              <IconX size={14} />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 max-sm:px-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Kv k="Model used" v={r.servedModel ?? <Val v={null} fmt={String} reason="not reported by the router" />} />
            <Kv k="Time" v={ms(r.latencyMs)} />
            <Kv k="Cost" v={<Val v={r.costUsd} fmt={usd} reason="not reported or estimated" />} />
            <Kv k="Task type" v={s.category} />
            <Kv k="Difficulty" v={num(s.difficulty, 2)} />
            <Kv k="Test set" v={s.suiteId} />
          </dl>
          <Disclosure className="mt-4" summary="Technical details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 pt-1 sm:grid-cols-3">
              <Kv k="Requested model" v={r.requestedModel || "—"} />
              <Kv k="Upstream" v={r.servedProvider ?? "—"} />
              <Kv k="First token" v={<Val v={r.ttftMs} fmt={ms} reason="no first-token timing" />} />
              <Kv k="Output speed" v={<Val v={r.outputTps} fmt={formatTps} reason="not measured" />} />
              <Kv k="Cost source" v={r.costSource ?? "—"} />
              <Kv k="Tokens in / out" v={`${r.usage.promptTokens ?? "—"} / ${r.usage.completionTokens ?? "—"}`} />
              <Kv k="HTTP status" v={r.httpStatus ?? "—"} />
              <Kv k="Finish reason" v={r.finishReason ?? "—"} />
              <Kv k="Attempts" v={s.attempts ?? 1} />
            </dl>
          </Disclosure>

          <h3 className="mt-6 mb-2 text-[15px] font-semibold text-fg">Grade</h3>
          <div className="rounded-lg border border-border bg-surface-2/60 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Score <span className="num font-semibold text-fg">{r.ok ? num(s.grade.score, 2) : "0 (error)"}</span>
              </span>
              <Outcome s={s} />
            </div>
            <p className="mt-1.5 text-fg-muted">{s.grade.detail || "—"}</p>
            <p className="mt-1.5 text-fg-muted">
              Answer found: <code className="text-fg">{s.grade.extracted ?? "—"}</code>
            </p>
          </div>

          {r.error ? (
            <>
              <h3 className="mt-6 mb-2 text-[15px] font-semibold text-fg">Error</h3>
              <pre className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-[13px] break-words whitespace-pre-wrap text-danger">{r.error}</pre>
            </>
          ) : null}

          <h3 className="mt-6 mb-2 text-[15px] font-semibold text-fg">Answer</h3>
          <div className="rounded-lg border border-border p-4">
            {r.text ? <Markdown text={r.text} /> : <p className="text-sm text-fg-muted">Empty answer.</p>}
          </div>

          <h3 className="mt-6 mb-2 text-[15px] font-semibold text-fg">Routing headers</h3>
          {headers.length ? (
            <dl className="rounded-lg border border-border text-[13px]">
              {headers.map(([k, v]) => (
                <div key={k} className="flex gap-3 border-b border-border px-3 py-1.5 last:border-b-0">
                  <dt className="shrink-0 text-fg-muted"><code>{k}</code></dt>
                  <dd className="min-w-0 break-all text-fg"><code>{v}</code></dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-fg-muted">No routing headers were captured for this answer.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0 py-0.5">
      <dt className="text-[13px] text-fg-muted">{k}</dt>
      <dd className="num truncate text-sm text-fg">{v}</dd>
    </div>
  );
}
