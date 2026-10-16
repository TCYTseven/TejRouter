"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Input, Select } from "@/components/ui/field";
import type { Agreement } from "@/lib/analysis/judge";
import type { BenchSample, BenchTask } from "@/lib/bench/types";
import { isAbortError, streamChat } from "@/lib/client/chat";
import { useWithBrowserKeys } from "@/lib/client/keys";
import { useProviders } from "@/lib/client/providers";
import { readStorage, writeStorage } from "@/lib/client/storage";
import { num, pct } from "./format";
import { ArmLabel, Panel, Term, useReportCtx } from "./section";

/**
 * LLM-as-judge with a fixed rubric, and a hand-graded sample to check the judge.
 * Runs from this browser with a router you pick; results are kept in this browser only.
 */

interface JudgeItem {
  score: number | null;
  reason: string;
  error?: string;
}

interface Stored {
  v: 1;
  judge: { providerId: string; model: string } | null;
  keys: string[];
  items: Record<string, JudgeItem>;
  human: Record<string, number>;
}

const EMPTY: Stored = { v: 1, judge: null, keys: [], items: {}, human: {} };
const storageKey = (runId: string) => `tejrouter:judge:v1:${runId}`;
const isStored = (v: unknown): v is Stored => !!v && typeof v === "object" && (v as Stored).v === 1 && Array.isArray((v as Stored).keys);

type Lib = typeof import("@/lib/analysis/judge") & { getTask: (id: string) => BenchTask | undefined };

export function JudgePanel() {
  const { run, arm } = useReportCtx();
  const { providers } = useProviders();
  const withKeys = useWithBrowserKeys(providers ?? []);
  const judges = useMemo(() => withKeys.filter((p) => p.configured && !p.simulated), [withKeys]);
  const [stored, setStored] = useState<Stored>(() => readStorage(storageKey(run.id), EMPTY, isStored));
  const [providerId, setProviderId] = useState(stored.judge?.providerId ?? "");
  const [model, setModel] = useState(stored.judge?.model ?? "");
  const [size, setSize] = useState(24);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lib, setLib] = useState<Lib | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([import("@/lib/analysis/judge"), import("@/lib/bench/suites")]).then(([j, s]) => {
      if (live) setLib({ ...j, getTask: s.getTask });
    });
    return () => {
      live = false;
      ctl.current?.abort();
    };
  }, []);

  const save = useCallback(
    (f: (s: Stored) => Stored) =>
      setStored((prev) => {
        const next = f(prev);
        writeStorage(storageKey(run.id), next);
        return next;
      }),
    [run.id],
  );

  const judgeId = providerId || judges[0]?.id || "";
  const judgeSpec = judges.find((p) => p.id === judgeId);
  const bySample = useMemo(() => new Map(run.samples.map((s) => [`${s.armId}|${s.taskId}|${s.rep}`, s])), [run.samples]);
  type Judged = { key: string; sample: BenchSample; item: JudgeItem | undefined };
  const judged: Judged[] = stored.keys.flatMap((k) => {
    const sample = bySample.get(k);
    return sample ? [{ key: k, sample, item: stored.items[k] as JudgeItem | undefined }] : [];
  });

  const start = async () => {
    if (!lib || !judgeSpec) return;
    setError(null);
    const sample = lib.pickJudgeSample(run, size, (id) => !!lib.getTask(id));
    if (!sample.length) {
      setError("No successful answers to judge in this run.");
      return;
    }
    const keys = sample.map(lib.sampleKey);
    const judgeModel = model.trim() || judgeSpec.defaultModel;
    const same = stored.judge?.providerId === judgeSpec.id && stored.judge?.model === judgeModel;
    save((s) => ({ ...s, judge: { providerId: judgeSpec.id, model: judgeModel }, keys, items: same ? s.items : {} }));
    const todo = sample.filter((s) => !(same && stored.items[lib.sampleKey(s)]?.score != null));
    const c = new AbortController();
    ctl.current = c;
    let done = sample.length - todo.length;
    setBusy({ done, total: sample.length });
    const queue = [...todo];
    const worker = async () => {
      for (let s = queue.shift(); s && !c.signal.aborted; s = queue.shift()) {
        const task = lib.getTask(s.taskId)!;
        const prompt = task.messages.map((m) => (m.role === "system" ? `[system] ${m.content}` : m.content)).join("\n\n");
        let item: JudgeItem;
        try {
          const r = await streamChat(
            { providerId: judgeSpec.id, model: judgeModel, messages: lib.judgeMessages(prompt, task.expected, s.result.text), temperature: 0, maxTokens: 1024 },
            { signal: c.signal },
          );
          const parsed = r.ok ? lib.parseJudgeReply(r.text) : null;
          item = parsed ? { score: parsed.score, reason: parsed.reason } : { score: null, reason: "", error: r.ok ? "The judge's reply had no score." : (r.error ?? "The call failed.") };
        } catch (e) {
          if (isAbortError(e)) return;
          item = { score: null, reason: "", error: e instanceof Error ? e.message : String(e) };
        }
        const key = lib.sampleKey(s);
        save((st) => ({ ...st, items: { ...st.items, [key]: item } }));
        done++;
        setBusy({ done, total: sample.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(null);
  };

  const stop = () => {
    ctl.current?.abort();
    setBusy(null);
  };

  // ---- summaries
  const scored = judged.filter((x) => x.item?.score != null);
  const byArm = new Map<string, number[]>();
  for (const x of scored) byArm.set(x.sample.armId, [...(byArm.get(x.sample.armId) ?? []), x.item!.score!]);
  const perArm = [...byArm.entries()].map(([armId, xs]) => ({
    armId,
    n: xs.length,
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    pass: xs.filter((x) => x >= 4).length / xs.length,
  }));
  const vsGrader: Agreement | null = lib && scored.length ? lib.agreement(scored.map((x) => x.item!.score!), scored.map((x) => x.sample.grade.correct)) : null;
  const humanPairs = scored.filter((x) => stored.human[x.key] != null);
  const vsHuman: Agreement | null = lib && humanPairs.length ? lib.agreement(humanPairs.map((x) => x.item!.score!), humanPairs.map((x) => stored.human[x.key])) : null;
  const failed = judged.filter((x) => x.item?.error).length;

  return (
    <Panel
      id="adv-judge"
      title="AI judge, checked by you"
      method="27. Advanced analysis"
      takeaway={
        <>
          A second model grades a fixed sample of answers from 1 to 5 against the reference answer, using the rubric below. Before trusting it, check it twice: against TejRouter&apos;s automatic
          grader on the same answers, and against your own grades on a few of them. Calls go through the router you pick and cost a little; results stay in this browser.
        </>
      }
    >
      {!judges.length ? (
        <p className="text-sm text-fg-muted">Connect a real router (Routers page or Settings) to use as the judge.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-52 flex-col gap-1.5 text-[13px] text-fg-muted">
            Judge router
            <Select value={judgeId} onChange={(e) => setProviderId(e.target.value)} disabled={!!busy}>
              {judges.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex w-56 flex-col gap-1.5 text-[13px] text-fg-muted">
            Judge model
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={judgeSpec?.defaultModel || "model id"} disabled={!!busy} />
          </label>
          <label className="flex w-32 flex-col gap-1.5 text-[13px] text-fg-muted">
            Answers
            <Select value={String(size)} onChange={(e) => setSize(Number(e.target.value))} disabled={!!busy}>
              {[12, 24, 48, 96].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          {busy ? (
            <Button variant="secondary" onClick={stop}>
              Stop ({busy.done}/{busy.total})
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void start()} disabled={!lib || !judgeSpec}>
              {stored.keys.length ? "Judge again" : "Judge answers"}
            </Button>
          )}
        </div>
      )}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Disclosure summary="Rubric" className="mt-4">
        <ol className="flex flex-col gap-1 text-sm text-fg-muted">
          {(lib?.RUBRIC ?? []).map((r) => (
            <li key={r.score}>
              <span className="num font-medium text-fg">{r.score}</span> {r.text}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[13px] text-fg-muted">4 or 5 counts as a pass when compared with right/wrong grades.</p>
      </Disclosure>

      {scored.length ? (
        <div className="mt-5 flex flex-col gap-5">
          <p className="text-sm text-fg-muted">
            {stored.judge ? (
              <>
                Judged by <span className="font-mono text-[13px]">{stored.judge.model}</span> on {judges.find((p) => p.id === stored.judge!.providerId)?.name ?? stored.judge.providerId}.{" "}
              </>
            ) : null}
            {scored.length} of {judged.length} answers scored{failed ? `, ${failed} could not be` : ""}.
          </p>
          <DataTable
            caption="Judge scores by router"
            rows={perArm}
            getKey={(r) => r.armId}
            minWidth={520}
            defaultSort={{ key: "m", dir: "desc" }}
            columns={[
              { key: "arm", header: "Router", render: (r) => <ArmLabel arm={arm(r.armId)} className="max-w-[220px]" /> },
              { key: "m", header: "Average score", align: "right", render: (r) => num(r.mean), sort: (r) => r.mean },
              { key: "p", header: "Scored 4 or 5", align: "right", render: (r) => pct(r.pass), sort: (r) => r.pass },
              { key: "n", header: "Answers", align: "right", render: (r) => String(r.n) },
            ]}
          />
          <AgreementTable vsGrader={vsGrader} vsHuman={vsHuman} />
          <HumanGrading
            items={scored.slice(0, 24)}
            lib={lib}
            human={stored.human}
            onGrade={(key, score) => save((s) => ({ ...s, human: { ...s.human, [key]: score } }))}
          />
        </div>
      ) : null}
    </Panel>
  );
}

function AgreementTable({ vsGrader, vsHuman }: { vsGrader: Agreement | null; vsHuman: Agreement | null }) {
  const rows = [
    { key: "grader", label: "Automatic grader", a: vsGrader },
    { key: "human", label: "You", a: vsHuman },
  ].filter((r): r is { key: string; label: string; a: Agreement } => !!r.a);
  const kappaTip = "Cohen's kappa: agreement beyond what chance would give. Above 0.6 is substantial, above 0.8 is near-perfect, under 0.4 means do not trust the judge for this.";
  return (
    <div>
      <h3 className="mb-2 text-[15px] font-semibold text-fg">How far to trust the judge</h3>
      <DataTable
        caption="Judge agreement"
        rows={rows}
        getKey={(r) => r.key}
        minWidth={700}
        columns={[
          { key: "w", header: "Judge vs", render: (r) => r.label },
          { key: "n", header: "Answers", align: "right", render: (r) => String(r.a.n) },
          { key: "pa", header: "Same pass/fail", align: "right", render: (r) => pct(r.a.passAgreement) },
          { key: "k", header: <Term tip={kappaTip}>Kappa</Term>, title: "Kappa", align: "right", render: (r) => num(r.a.passKappa) },
          { key: "ex", header: "Same score", align: "right", render: (r) => pct(r.a.exact) },
          { key: "w1", header: "Within one point", align: "right", render: (r) => pct(r.a.withinOne) },
          { key: "rho", header: <Term tip="Spearman rank correlation between the judge's scores and yours.">Spearman</Term>, title: "Spearman", align: "right", render: (r) => num(r.a.spearman) },
        ]}
      />
      {!vsHuman ? <p className="mt-2 text-[13px] text-fg-muted">Grade a few answers below to see how the judge agrees with you.</p> : null}
    </div>
  );
}

function HumanGrading({
  items,
  lib,
  human,
  onGrade,
}: {
  items: { key: string; sample: BenchSample; item: JudgeItem | undefined }[];
  lib: Lib | null;
  human: Record<string, number>;
  onGrade: (key: string, score: number) => void;
}) {
  const { arm } = useReportCtx();
  const graded = items.filter((x) => human[x.key] != null).length;
  return (
    <Disclosure summary={`Grade answers yourself (${graded} of ${items.length} graded)`}>
      <p className="mb-3 text-sm text-fg-muted">The router and the judge&apos;s score stay hidden until you grade, so they cannot sway you.</p>
      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {items.map((x, i) => {
          const task = lib?.getTask(x.sample.taskId);
          const mine = human[x.key];
          const prompt = task ? task.messages.map((m) => m.content).join("\n\n") : "";
          return (
            <li key={x.key} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-fg-muted">
                <span className="num">
                  {i + 1}. <span className="font-mono">{x.sample.taskId}</span>
                </span>
                {mine != null ? (
                  <span className="flex items-center gap-2">
                    <ArmLabel arm={arm(x.sample.armId)} />
                    <span className="num">· judge {x.item?.score ?? "—"}, you {mine}</span>
                  </span>
                ) : null}
              </div>
              <Disclosure summary="Prompt">
                <pre className="max-h-48 overflow-auto rounded-md bg-surface-2 p-3 text-[13px] whitespace-pre-wrap">{prompt.length > 3000 ? `${prompt.slice(0, 3000)}…` : prompt}</pre>
              </Disclosure>
              <p className="text-sm">
                <span className="text-fg-muted">Reference: </span>
                <span className="font-mono text-[13px]">{task?.expected.slice(0, 300)}</span>
              </p>
              <pre className="max-h-48 overflow-auto rounded-md bg-surface-2 p-3 text-[13px] whitespace-pre-wrap">{x.sample.result.text.slice(0, 3000) || "(empty)"}</pre>
              <div role="radiogroup" aria-label={`Your score for answer ${i + 1}`} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[13px] text-fg-muted">Your score</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button key={n} size="xs" variant={mine === n ? "primary" : "outline"} role="radio" aria-checked={mine === n} onClick={() => onGrade(x.key, n)}>
                    {n}
                  </Button>
                ))}
                {mine != null && x.item?.reason ? <span className="ml-2 text-[13px] text-fg-muted">Judge: {x.item.reason}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Disclosure>
  );
}
