import type { BenchRun, BenchSample, BenchTask, ConstraintCheck } from "@/lib/bench/types";
import { checkConstraint, describeConstraint, extractAnswerBlock, extractCode, extractJson } from "@/lib/bench/grade-core";
import { getTask } from "@/lib/bench/suites";
import { lookupPrice } from "@/lib/pricing";
import { bootstrapMedian, deriveSeed, describe as describeStats, jsDivergenceRecords, mcnemar, median, spearman, wilson } from "@/lib/stats";
import { normalSf } from "@/lib/stats/special";
import type { ArmKind, Estimate, RunReport, Summary } from "./types";

/**
 * The advanced report: tail latency, router overhead, failure and fallback behaviour,
 * behaviour under load, format and instruction compliance, unsupported answers, cost
 * spread, token inflation, slices by input length, language and task set, edge cases,
 * and stability (repetitions, rephrasings, and drift against another run).
 *
 * Pure and deterministic. It reads the saved run plus the built-in task definitions
 * (for graders, tags and prompt text), so it also works on runs saved before it existed.
 * Methodology: docs/METHODOLOGY.md, section 27.
 */

// ---------------------------------------------------------------- types

export interface TailRow {
  armId: string;
  latency: Summary;
  ttft: Summary;
  /** p99 / p50 of total latency. */
  tailRatio: number | null;
  nTimeouts: number;
  timeoutRate: Estimate;
  /** Share of all samples (failed ones included) slower than the run-wide p95. */
  slowerThanRunP95: number | null;
}

export interface OverheadRow {
  armId: string;
  /** Router samples matched to a pinned-model sample of the same served model on the same task. */
  nPairs: number;
  /** nPairs / successful router samples. */
  coverage: number | null;
  /** Router latency minus the direct call's, median over pairs, with a bootstrap interval. */
  latency: Estimate;
  ttft: Estimate;
  /** Median of router latency / direct latency. */
  ratio: number | null;
  models: string[];
}

export interface OverheadReport {
  available: boolean;
  reason: string | null;
  rows: OverheadRow[];
}

export type FailureClass = "timeout" | "rate-limit" | "server" | "client" | "network" | "stream" | "other";
export const FAILURE_CLASSES: FailureClass[] = ["timeout", "rate-limit", "server", "client", "network", "stream", "other"];

export interface FailureRow {
  armId: string;
  n: number;
  /** Whether this run recorded every retried attempt (runs saved before it did not). */
  attemptsRecorded: boolean;
  totalAttempts: number;
  firstTryOk: number;
  retried: number;
  recovered: number;
  /** recovered / retried. */
  recoveryRate: number | null;
  failures: number;
  failureRate: Estimate;
  /** Final failures by kind. */
  byClass: Record<FailureClass, number>;
  /** Failed attempts that were retried, by kind (when recorded). */
  retriedByClass: Record<FailureClass, number>;
  /** Calls that succeeded with an empty reply. */
  emptyReplies: number;
  /** Pinned-model arms: replies served by a different model than the one asked for. */
  substituted: number | null;
  substitutedCorrect: number | null;
}

export interface LoadBucket {
  label: string;
  lo: number;
  hi: number;
  n: number;
  medianLatency: number | null;
  p95Latency: number | null;
  errorRate: number | null;
  throttledRate: number | null;
}

export interface LoadRow {
  armId: string;
  peakInFlight: number;
  /** Spearman correlation of in-flight calls (to the same router) and latency, successful calls only. */
  spearman: number | null;
  pValue: number | null;
  /** Samples that met a 429 on any attempt. */
  throttled: number;
  buckets: LoadBucket[];
}

export interface FormatRow {
  armId: string;
  json: { n: number; parsed: number; allKeys: number; correct: number; parsedRate: Estimate };
  code: { n: number; codeBlock: number; definesFunction: number; passes: number };
}

export interface InstructionRow {
  armId: string;
  n: number;
  checks: number;
  checksPassed: number;
  fullyCompliant: number;
  complianceRate: Estimate;
  byType: { type: string; n: number; passed: number }[];
}

export interface FaithfulnessRow {
  armId: string;
  /** Successful replies to tasks that carry a document. */
  n: number;
  wrong: number;
  /** Wrong answers that appear nowhere in the document. */
  unsupported: number;
  unsupportedRate: Estimate;
  examples: { taskId: string; answer: string }[];
}

export interface CostSpreadRow {
  armId: string;
  n: number;
  mean: number | null;
  sd: number | null;
  /** sd / mean. */
  cv: number | null;
  p50: number | null;
  p90: number | null;
  p99: number | null;
  max: number | null;
  /** p90 / p50. */
  p90ToMedian: number | null;
}

export interface TokenRow {
  armId: string;
  n: number;
  meanCompletion: number | null;
  medianCompletion: number | null;
  meanReasoning: number | null;
  /** Geometric mean over shared tasks of this arm's output tokens / the median arm's. */
  inflation: number | null;
  nTasks: number;
  /** Share of the estimated cost that is output tokens (list prices). */
  outputCostShare: number | null;
}

export interface CostByDifficultyCell {
  n: number;
  nCorrect: number;
  totalCost: number | null;
  costPerCorrect: number | null;
}

export interface SliceCell {
  n: number;
  nTasks: number;
  accuracy: number | null;
  correctRate: Estimate;
  meanCost: number | null;
  medianLatency: number | null;
  topModel: string | null;
}

export interface SliceTable {
  slices: { key: string; label: string; nTasks: number }[];
  rows: { armId: string; cells: SliceCell[] }[];
}

export interface EdgeRow {
  armId: string;
  n: number;
  graceful: number;
  gracefulRate: Estimate;
  correct: number;
  byKind: { kind: string; n: number; graceful: number; correct: number }[];
}

export interface StabilityRow {
  armId: string;
  /** Tasks run at least twice by this arm. */
  repeatedTasks: number;
  sameModelAcrossReps: number | null;
  sameAnswerAcrossReps: number | null;
  /** Rephrasing groups with at least two phrasings answered. */
  groups: number;
  sameModelAcrossPhrasings: number | null;
  sameOutcomeAcrossPhrasings: number | null;
}

export interface AdvancedReport {
  level: number;
  armIds: string[];
  armKinds: Record<string, ArmKind>;
  tail: TailRow[];
  runP95: number | null;
  overhead: OverheadReport;
  failures: FailureRow[];
  load: LoadRow[];
  format: { jsonTasks: number; codeTasks: number; rows: FormatRow[] };
  instructions: { nTasks: number; rows: InstructionRow[] };
  faithfulness: { nTasks: number; rows: FaithfulnessRow[] };
  costSpread: CostSpreadRow[];
  tokens: TokenRow[];
  costByDifficulty: { buckets: { label: string }[]; rows: { armId: string; cells: CostByDifficultyCell[] }[] };
  inputLength: SliceTable & { source: "tokens" | "mixed" };
  languages: SliceTable | null;
  suites: SliceTable;
  edge: { nTasks: number; kinds: string[]; rows: EdgeRow[] } | null;
  stability: StabilityRow[];
  hasRephrasings: boolean;
  hasRepetitions: boolean;
}

// ---------------------------------------------------------------- helpers

function fin(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function summary(xs: number[]): Summary {
  const d = describeStats(xs);
  return { n: d.n, mean: fin(d.mean), sd: fin(d.sd), min: fin(d.min), max: fin(d.max), p50: fin(d.p50), p90: fin(d.p90), p95: fin(d.p95), p99: fin(d.p99) };
}

function rate(k: number, n: number, level: number): Estimate {
  if (n <= 0) return { value: null, lo: null, hi: null, method: "wilson" };
  const w = wilson(k, n, level);
  return { value: k / n, lo: fin(w.lo), hi: fin(w.hi), method: "wilson" };
}

function med(xs: number[]): number | null {
  return xs.length ? fin(median(xs)) : null;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Model ids from different gateways, compared: "openai/gpt-4o-mini-2024-07-18" ≈ "gpt-4o-mini". */
export function normalizeModel(m: string | null | undefined): string | null {
  if (!m) return null;
  let s = m.trim().toLowerCase();
  if (!s) return null;
  s = s.slice(s.lastIndexOf("/") + 1);
  // "openai:gpt-5.4-mini" or "gpt-5.4-mini:flex"
  const parts = s.split(":").filter(Boolean);
  if (parts.length > 1) s = parts.reduce((a, b) => (b.length > a.length ? b : a));
  s = s.replace(/-(\d{4}-\d{2}-\d{2}|\d{8}|latest)$/, "");
  return s || null;
}

/** What kind of failure a call ended with. */
export function classifyFailure(httpStatus: number | null, error: string | null | undefined): FailureClass {
  const e = error ?? "";
  if (httpStatus === 408 || httpStatus === 504 || /timed out|timeout/i.test(e)) return "timeout";
  if (httpStatus === 429) return "rate-limit";
  if (httpStatus != null && httpStatus >= 500) return "server";
  if (httpStatus != null && httpStatus >= 400) return "client";
  if (/^Network error/.test(e)) return "network";
  if (/^Stream error/.test(e)) return "stream";
  return "other";
}

const emptyClasses = (): Record<FailureClass, number> => ({ timeout: 0, "rate-limit": 0, server: 0, client: 0, network: 0, stream: 0, other: 0 });

/** Task definitions by id, looked up once. */
function taskLookup() {
  const cache = new Map<string, BenchTask | null>();
  return (id: string): BenchTask | null => {
    if (!cache.has(id)) cache.set(id, getTask(id) ?? null);
    return cache.get(id)!;
  };
}

function tagValue(task: BenchTask | null, prefix: string): string | null {
  const t = task?.tags?.find((x) => x.startsWith(`${prefix}:`));
  return t ? t.slice(prefix.length + 1) : null;
}

function promptText(task: BenchTask | null): string {
  return task ? task.messages.map((m) => m.content).join("\n") : "";
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function leaves(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) for (const x of v) leaves(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) leaves(x, out);
  return out;
}

/** Is every piece of `answer` found in `doc`? JSON answers are checked leaf by leaf. */
export function supportedBy(answer: string, doc: string): boolean {
  const d = squash(doc);
  let parts: string[] = [answer];
  const t = answer.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      parts = leaves(JSON.parse(t));
    } catch {
      /* not JSON: check as text */
    }
  }
  return parts.map(squash).filter((p) => p.length > 0).every((p) => d.includes(p) || d.includes(p.replace(/,/g, "")));
}

/** Constraint results on the better of the whole reply and its `Answer:` block, as the grader does. */
function constraintOutcome(checks: ConstraintCheck[], text: string): boolean[] {
  const candidates = [text.trim()];
  const block = extractAnswerBlock(text);
  if (block != null && block.trim() !== candidates[0]) candidates.push(block.trim());
  let best: boolean[] | null = null;
  for (const c of candidates) {
    const r = checks.map((k) => checkConstraint(k, c));
    if (!best || r.filter(Boolean).length > best.filter(Boolean).length) best = r;
  }
  return best ?? [];
}

const LOAD_BUCKETS = [
  { label: "1", lo: 1, hi: 1 },
  { label: "2–3", lo: 2, hi: 3 },
  { label: "4–7", lo: 4, hi: 7 },
  { label: "8–15", lo: 8, hi: 15 },
  { label: "16+", lo: 16, hi: Infinity },
];

const LENGTH_BUCKETS = [
  { key: "0", label: "Under 500 tokens", lo: 0, hi: 500 },
  { key: "1", label: "500–2k", lo: 500, hi: 2000 },
  { key: "2", label: "2k–8k", lo: 2000, hi: 8000 },
  { key: "3", label: "8k–32k", lo: 8000, hi: 32000 },
  { key: "4", label: "32k and over", lo: 32000, hi: Infinity },
];

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ja: "Japanese",
  zh: "Chinese",
  hi: "Hindi",
  ar: "Arabic",
};

function isGraceful(s: BenchSample): boolean {
  if (s.result.ok) return true;
  const st = s.result.httpStatus;
  return st != null && st >= 400 && st < 500 && st !== 408 && st !== 429;
}

// ---------------------------------------------------------------- main

export function analyzeAdvanced(run: BenchRun, report: RunReport): AdvancedReport {
  const level = report.options.level;
  const armIds = report.meta.arms.map((a) => a.id);
  const armKinds = Object.fromEntries(report.meta.arms.map((a) => [a.id, a.kind])) as Record<string, ArmKind>;
  const armModel = Object.fromEntries(report.meta.arms.map((a) => [a.id, a.model]));
  const byArm = new Map<string, BenchSample[]>(armIds.map((id) => [id, []]));
  for (const s of run.samples ?? []) byArm.get(s.armId)?.push(s);
  const task = taskLookup();
  const seed = report.options.seed;
  const iters = Math.min(1000, report.options.bootstrapIterations);

  // ---- tail latency
  const okLatencies = (run.samples ?? []).filter((s) => s.result.ok).map((s) => s.result.latencyMs);
  const runP95 = okLatencies.length >= 20 ? fin(describeStats(okLatencies).p95) : null;
  const tail: TailRow[] = armIds.map((id) => {
    const ss = byArm.get(id)!;
    const ok = ss.filter((s) => s.result.ok);
    const lat = summary(ok.map((s) => s.result.latencyMs));
    const ttft = summary(ok.map((s) => s.result.ttftMs).filter((x): x is number => x != null && Number.isFinite(x)));
    const timeouts = ss.filter((s) => !s.result.ok && classifyFailure(s.result.httpStatus, s.result.error) === "timeout").length;
    const slow = runP95 == null ? null : ss.filter((s) => !s.result.ok || s.result.latencyMs > runP95).length;
    return {
      armId: id,
      latency: lat,
      ttft,
      tailRatio: lat.p99 != null && lat.p50 ? lat.p99 / lat.p50 : null,
      nTimeouts: timeouts,
      timeoutRate: rate(timeouts, ss.length, level),
      slowerThanRunP95: slow == null || !ss.length ? null : slow / ss.length,
    };
  });

  // ---- router overhead
  const fixedIds = armIds.filter((id) => armKinds[id] === "fixed");
  const routerIds = armIds.filter((id) => armKinds[id] === "router");
  /** model -> task -> latencies of pinned calls */
  const direct = new Map<string, Map<string, { lat: number[]; ttft: number[] }>>();
  for (const id of fixedIds) {
    for (const s of byArm.get(id)!) {
      if (!s.result.ok) continue;
      const m = normalizeModel(s.result.servedModel ?? armModel[id]);
      if (!m) continue;
      const tm = direct.get(m) ?? new Map();
      const cell = tm.get(s.taskId) ?? { lat: [], ttft: [] };
      cell.lat.push(s.result.latencyMs);
      if (s.result.ttftMs != null) cell.ttft.push(s.result.ttftMs);
      tm.set(s.taskId, cell);
      direct.set(m, tm);
    }
  }
  let overhead: OverheadReport;
  if (!routerIds.length) overhead = { available: false, reason: "This run has no router that picks a model.", rows: [] };
  else if (!fixedIds.length)
    overhead = {
      available: false,
      reason: "Add arms that pin a single model (the models the router picks) to measure what the router adds on top of a direct call.",
      rows: [],
    };
  else {
    const rows: OverheadRow[] = routerIds.map((id, i) => {
      const dl: number[] = [];
      const dt: number[] = [];
      const ratios: number[] = [];
      const models = new Set<string>();
      const ok = byArm.get(id)!.filter((s) => s.result.ok);
      for (const s of ok) {
        const m = normalizeModel(s.result.servedModel);
        const cell = m ? direct.get(m)?.get(s.taskId) : undefined;
        if (!cell || !cell.lat.length) continue;
        const base = median(cell.lat);
        dl.push(s.result.latencyMs - base);
        if (base > 0) ratios.push(s.result.latencyMs / base);
        if (s.result.ttftMs != null && cell.ttft.length) dt.push(s.result.ttftMs - median(cell.ttft));
        models.add(m!);
      }
      const boot = (xs: number[], label: string): Estimate => {
        if (!xs.length) return { value: null, lo: null, hi: null, method: "bootstrap-percentile" };
        if (xs.length < 5) return { value: fin(median(xs)), lo: null, hi: null, method: "bootstrap-percentile" };
        const b = bootstrapMedian(xs, { iterations: iters, alpha: 1 - level, seed: deriveSeed(seed, `overhead:${label}:${i}`) });
        return { value: fin(b.estimate), lo: fin(b.lo), hi: fin(b.hi), method: "bootstrap-percentile" };
      };
      return {
        armId: id,
        nPairs: dl.length,
        coverage: ok.length ? dl.length / ok.length : null,
        latency: boot(dl, "lat"),
        ttft: boot(dt, "ttft"),
        ratio: med(ratios),
        models: [...models].sort(),
      };
    });
    const any = rows.some((r) => r.nPairs > 0);
    overhead = {
      available: any,
      reason: any ? null : "None of the models the routers picked matches a pinned-model arm in this run. Pin the models the router chose and run again.",
      rows,
    };
  }

  // ---- failures, retries, fallbacks
  const failures: FailureRow[] = armIds.map((id) => {
    const ss = byArm.get(id)!;
    const byClass = emptyClasses();
    const retriedByClass = emptyClasses();
    let totalAttempts = 0;
    let firstTryOk = 0;
    let retried = 0;
    let recovered = 0;
    let fails = 0;
    let empty = 0;
    let recorded = ss.length > 0;
    for (const s of ss) {
      const a = s.attempts ?? 1;
      totalAttempts += a;
      if (a > 1) retried++;
      if (s.result.ok && a <= 1) firstTryOk++;
      if (s.result.ok && a > 1) recovered++;
      if (!s.result.ok) {
        fails++;
        byClass[classifyFailure(s.result.httpStatus, s.result.error)]++;
      } else if (!s.result.text.trim()) empty++;
      if (a > 1 && !s.attemptLog) recorded = false;
      for (const at of s.attemptLog ?? []) retriedByClass[classifyFailure(at.httpStatus, at.error)]++;
    }
    let substituted: number | null = null;
    let substitutedCorrect: number | null = null;
    // Any arm that asked for one specific model (even one the main report treats as a
    // router because it was served several).
    const pinned = armModel[id] && !/(^|[/:_-])auto$/i.test(armModel[id]!) ? normalizeModel(armModel[id]) : null;
    if (pinned) {
      substituted = 0;
      substitutedCorrect = 0;
      for (const s of ss) {
        const served = normalizeModel(s.result.servedModel);
        if (s.result.ok && served && served !== pinned && !served.includes(pinned) && !pinned.includes(served)) {
          substituted++;
          if (s.grade.correct) substitutedCorrect++;
        }
      }
    }
    return {
      armId: id,
      n: ss.length,
      attemptsRecorded: recorded,
      totalAttempts,
      firstTryOk,
      retried,
      recovered,
      recoveryRate: retried ? recovered / retried : null,
      failures: fails,
      failureRate: rate(fails, ss.length, level),
      byClass,
      retriedByClass,
      emptyReplies: empty,
      substituted,
      substitutedCorrect,
    };
  });

  // ---- behaviour under load: in-flight calls to the same router when each call started
  const byProvider = new Map<string, BenchSample[]>();
  for (const s of run.samples ?? []) {
    const l = byProvider.get(s.providerId) ?? [];
    l.push(s);
    byProvider.set(s.providerId, l);
  }
  const inFlight = new Map<BenchSample, number>();
  for (const list of byProvider.values()) {
    const sorted = list.slice().sort((a, b) => a.result.startedAt - b.result.startedAt);
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i].result.startedAt;
      let c = 1;
      for (let j = i - 1; j >= 0; j--) if (sorted[j].result.startedAt + Math.max(0, sorted[j].result.latencyMs) > t) c++;
      for (let j = i + 1; j < sorted.length && sorted[j].result.startedAt === t; j++) c++;
      inFlight.set(sorted[i], c);
    }
  }
  const throttledSample = (s: BenchSample) => s.result.httpStatus === 429 || (s.attemptLog ?? []).some((a) => a.httpStatus === 429);
  const load: LoadRow[] = armIds.map((id) => {
    const ss = byArm.get(id)!;
    const ok = ss.filter((s) => s.result.ok);
    const xs = ok.map((s) => inFlight.get(s) ?? 1);
    const ys = ok.map((s) => s.result.latencyMs);
    let rho: number | null = null;
    let p: number | null = null;
    if (ok.length >= 10 && new Set(xs).size > 1) {
      rho = fin(spearman(xs, ys));
      if (rho != null) p = Math.min(1, 2 * normalSf(Math.abs(rho) * Math.sqrt(ok.length - 1)));
    }
    return {
      armId: id,
      peakInFlight: Math.max(0, ...ss.map((s) => inFlight.get(s) ?? 1)),
      spearman: rho,
      pValue: p,
      throttled: ss.filter(throttledSample).length,
      buckets: LOAD_BUCKETS.map((b) => {
        const inB = ss.filter((s) => {
          const f = inFlight.get(s) ?? 1;
          return f >= b.lo && f <= b.hi;
        });
        const lat = inB.filter((s) => s.result.ok).map((s) => s.result.latencyMs);
        const d = lat.length ? describeStats(lat) : null;
        return {
          label: b.label,
          lo: b.lo,
          hi: Number.isFinite(b.hi) ? b.hi : -1,
          n: inB.length,
          medianLatency: d ? fin(d.p50) : null,
          p95Latency: d && lat.length >= 5 ? fin(d.p95) : null,
          errorRate: inB.length ? inB.filter((s) => !s.result.ok).length / inB.length : null,
          throttledRate: inB.length ? inB.filter(throttledSample).length / inB.length : null,
        };
      }),
    };
  });

  // ---- format compliance (JSON and code tasks) and instruction following
  const jsonTasks = new Set<string>();
  const codeTasks = new Set<string>();
  const constraintTasks = new Set<string>();
  const docTasks = new Set<string>();
  for (const t of run.tasks ?? []) {
    const def = task(t.id);
    if (!def) continue;
    if (def.grader.kind === "json") jsonTasks.add(t.id);
    if (def.grader.kind === "code") codeTasks.add(t.id);
    if (def.grader.kind === "constraints") constraintTasks.add(t.id);
    if (def.suiteId === "long-context" || def.suiteId === "extraction") docTasks.add(t.id);
  }
  const format: FormatRow[] = armIds.map((id) => {
    const ok = byArm.get(id)!.filter((s) => s.result.ok);
    let jn = 0, parsed = 0, keys = 0, jc = 0;
    let cn = 0, block = 0, defines = 0, passes = 0;
    for (const s of ok) {
      const def = task(s.taskId);
      if (!def) continue;
      if (jsonTasks.has(s.taskId) && def.grader.kind === "json") {
        jn++;
        const { value } = extractJson(s.result.text);
        if (value) {
          parsed++;
          const g = def.grader;
          if (g.requiredKeys.every((k) => hasPath(value, k))) keys++;
        }
        if (s.grade.correct) jc++;
      } else if (codeTasks.has(s.taskId) && def.grader.kind === "code") {
        cn++;
        if (/```/.test(s.result.text)) block++;
        const fn = def.grader.functionName;
        if (new RegExp(`\\b${fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(extractCode(s.result.text, fn))) defines++;
        if (s.grade.correct) passes++;
      }
    }
    return {
      armId: id,
      json: { n: jn, parsed, allKeys: keys, correct: jc, parsedRate: rate(parsed, jn, level) },
      code: { n: cn, codeBlock: block, definesFunction: defines, passes },
    };
  });

  const instructions: InstructionRow[] = armIds.map((id) => {
    const ok = byArm.get(id)!.filter((s) => s.result.ok && constraintTasks.has(s.taskId));
    let checks = 0, passed = 0, full = 0;
    const types = new Map<string, { n: number; passed: number }>();
    for (const s of ok) {
      const def = task(s.taskId);
      if (!def || def.grader.kind !== "constraints") continue;
      const res = constraintOutcome(def.grader.checks, s.result.text);
      def.grader.checks.forEach((c, i) => {
        const key = typeLabel(c);
        const e = types.get(key) ?? { n: 0, passed: 0 };
        e.n++;
        if (res[i]) e.passed++;
        types.set(key, e);
      });
      checks += res.length;
      passed += res.filter(Boolean).length;
      if (res.every(Boolean)) full++;
    }
    return {
      armId: id,
      n: ok.length,
      checks,
      checksPassed: passed,
      fullyCompliant: full,
      complianceRate: rate(full, ok.length, level),
      byType: [...types.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => a.type.localeCompare(b.type)),
    };
  });

  // ---- unsupported answers on tasks that carry a document
  const faith: FaithfulnessRow[] = armIds.map((id) => {
    const ok = byArm.get(id)!.filter((s) => s.result.ok && docTasks.has(s.taskId));
    let wrong = 0, unsupported = 0;
    const examples: { taskId: string; answer: string }[] = [];
    for (const s of ok) {
      if (s.grade.correct) continue;
      wrong++;
      const ans = (s.grade.extracted ?? "").trim();
      if (!ans) continue;
      if (!supportedBy(ans, promptText(task(s.taskId)))) {
        unsupported++;
        if (examples.length < 5) examples.push({ taskId: s.taskId, answer: ans.slice(0, 160) });
      }
    }
    return { armId: id, n: ok.length, wrong, unsupported, unsupportedRate: rate(unsupported, ok.length, level), examples };
  });

  // ---- cost spread
  const costSpread: CostSpreadRow[] = armIds.map((id) => {
    const xs = byArm.get(id)!.map((s) => s.result.costUsd).filter((c): c is number => c != null && Number.isFinite(c) && c >= 0);
    const d = summary(xs);
    return {
      armId: id,
      n: d.n,
      mean: d.mean,
      sd: d.sd,
      cv: d.mean && d.sd != null ? d.sd / d.mean : null,
      p50: d.p50,
      p90: d.p90,
      p99: d.p99,
      max: d.max,
      p90ToMedian: d.p50 && d.p90 != null ? d.p90 / d.p50 : null,
    };
  });

  // ---- token inflation
  const outByTaskArm = new Map<string, Map<string, number[]>>();
  for (const s of run.samples ?? []) {
    const c = s.result.usage?.completionTokens;
    if (!s.result.ok || c == null || !Number.isFinite(c)) continue;
    const m = outByTaskArm.get(s.taskId) ?? new Map<string, number[]>();
    const l = m.get(s.armId) ?? [];
    l.push(c);
    m.set(s.armId, l);
    outByTaskArm.set(s.taskId, m);
  }
  const tokens: TokenRow[] = armIds.map((id) => {
    const ok = byArm.get(id)!.filter((s) => s.result.ok);
    const comp = ok.map((s) => s.result.usage?.completionTokens).filter((x): x is number => x != null && Number.isFinite(x));
    const reas = ok.map((s) => s.result.usage?.reasoningTokens).filter((x): x is number => x != null && Number.isFinite(x));
    const logs: number[] = [];
    for (const m of outByTaskArm.values()) {
      const mine = m.get(id);
      if (!mine || m.size < 2) continue;
      const means = [...m.values()].map((l) => mean(l)!);
      const ref = median(means);
      const v = mean(mine)!;
      if (ref > 0 && v > 0) logs.push(Math.log(v / ref));
    }
    let outCost = 0, allCost = 0;
    for (const s of ok) {
      const p = lookupPrice(s.result.servedModel ?? s.result.requestedModel);
      const u = s.result.usage;
      if (!p || u?.promptTokens == null || u?.completionTokens == null) continue;
      outCost += u.completionTokens * p.output;
      allCost += u.completionTokens * p.output + u.promptTokens * p.input;
    }
    return {
      armId: id,
      n: comp.length,
      meanCompletion: mean(comp),
      medianCompletion: med(comp),
      meanReasoning: reas.length ? mean(reas) : null,
      inflation: logs.length ? Math.exp(mean(logs)!) : null,
      nTasks: logs.length,
      outputCostShare: allCost > 0 ? outCost / allCost : null,
    };
  });

  // ---- cost per correct answer by difficulty
  const K = report.meta.difficultyBuckets.length;
  const bucketOf = (d: number) => Math.min(K - 1, Math.max(0, Math.floor(Math.min(1, Math.max(0, d)) * K)));
  const costByDifficulty = {
    buckets: report.meta.difficultyBuckets.map((b) => ({ label: b.label })),
    rows: armIds.map((id) => ({
      armId: id,
      cells: report.meta.difficultyBuckets.map((_, k) => {
        const ss = byArm.get(id)!.filter((s) => bucketOf(s.difficulty) === k);
        const priced = ss.filter((s) => s.result.costUsd != null && Number.isFinite(s.result.costUsd));
        const total = priced.reduce((a, s) => a + (s.result.costUsd ?? 0), 0);
        const correct = priced.filter((s) => s.result.ok && s.grade.correct).length;
        return {
          n: ss.length,
          nCorrect: ss.filter((s) => s.result.ok && s.grade.correct).length,
          totalCost: priced.length ? total : null,
          costPerCorrect: priced.length && correct ? total / correct : null,
        };
      }),
    })),
  };

  // ---- slices
  let lengthFromChars = false;
  const promptTokens = (s: BenchSample): number => {
    const t = s.result.usage?.promptTokens;
    if (t != null && Number.isFinite(t)) return t;
    lengthFromChars = true;
    return Math.round(promptText(task(s.taskId)).length / 4);
  };
  const lengthKey = (s: BenchSample) => LENGTH_BUCKETS.find((b) => {
    const t = promptTokens(s);
    return t >= b.lo && t < b.hi;
  })!.key;
  const inputLength = sliceTable(armIds, byArm, LENGTH_BUCKETS.map((b) => ({ key: b.key, label: b.label })), lengthKey, level);
  const langOf = (s: BenchSample) => tagValue(task(s.taskId), "lang") ?? "en";
  const langs = [...new Set((run.samples ?? []).map(langOf))];
  const languages =
    langs.length > 1
      ? sliceTable(
          armIds,
          byArm,
          langs.sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b))).map((k) => ({ key: k, label: LANGUAGE_NAMES[k] ?? k })),
          langOf,
          level,
        )
      : null;
  const suiteIds = [...new Set((run.samples ?? []).map((s) => s.suiteId))].sort();
  const suites = sliceTable(armIds, byArm, suiteIds.map((k) => ({ key: k, label: k })), (s) => s.suiteId, level);

  // ---- edge cases
  const edgeSamples = (run.samples ?? []).filter((s) => s.suiteId === "edge");
  let edge: AdvancedReport["edge"] = null;
  if (edgeSamples.length) {
    const kindOf = (s: BenchSample) => tagValue(task(s.taskId), "edge") ?? s.category;
    const kinds = [...new Set(edgeSamples.map(kindOf))].sort();
    edge = {
      nTasks: new Set(edgeSamples.map((s) => s.taskId)).size,
      kinds,
      rows: armIds.map((id) => {
        const ss = edgeSamples.filter((s) => s.armId === id);
        const graceful = ss.filter(isGraceful).length;
        return {
          armId: id,
          n: ss.length,
          graceful,
          gracefulRate: rate(graceful, ss.length, level),
          correct: ss.filter((s) => s.result.ok && s.grade.correct).length,
          byKind: kinds.map((k) => {
            const kk = ss.filter((s) => kindOf(s) === k);
            return { kind: k, n: kk.length, graceful: kk.filter(isGraceful).length, correct: kk.filter((s) => s.result.ok && s.grade.correct).length };
          }),
        };
      }),
    };
  }

  // ---- stability: repetitions and rephrasings
  let hasRephrasings = false;
  let hasRepetitions = false;
  const stability: StabilityRow[] = armIds.map((id) => {
    const ss = byArm.get(id)!;
    const byTask = new Map<string, BenchSample[]>();
    for (const s of ss) byTask.set(s.taskId, [...(byTask.get(s.taskId) ?? []), s]);
    let repeated = 0, sameModel = 0, sameAnswer = 0;
    for (const list of byTask.values()) {
      const ok = list.filter((s) => s.result.ok);
      if (ok.length < 2) continue;
      repeated++;
      if (new Set(ok.map((s) => normalizeModel(s.result.servedModel) ?? "?")).size === 1) sameModel++;
      if (new Set(ok.map((s) => squash(s.grade.extracted ?? s.result.text))).size === 1) sameAnswer++;
    }
    if (repeated) hasRepetitions = true;
    const groups = new Map<string, BenchSample[]>();
    for (const s of ss) {
      const g = tagValue(task(s.taskId), "group");
      if (g) groups.set(g, [...(groups.get(g) ?? []), s]);
    }
    let ng = 0, gModel = 0, gOutcome = 0;
    for (const list of groups.values()) {
      // One sample per phrasing (the first repetition), so repetitions don't count as rephrasings.
      const firstRep = new Map<string, BenchSample>();
      for (const s of list) if (!firstRep.has(s.taskId) || s.rep < firstRep.get(s.taskId)!.rep) firstRep.set(s.taskId, s);
      const ok = [...firstRep.values()].filter((s) => s.result.ok);
      if (ok.length < 2) continue;
      ng++;
      if (new Set(ok.map((s) => normalizeModel(s.result.servedModel) ?? "?")).size === 1) gModel++;
      if (new Set(ok.map((s) => s.grade.correct)).size === 1) gOutcome++;
    }
    if (ng) hasRephrasings = true;
    return {
      armId: id,
      repeatedTasks: repeated,
      sameModelAcrossReps: repeated ? sameModel / repeated : null,
      sameAnswerAcrossReps: repeated ? sameAnswer / repeated : null,
      groups: ng,
      sameModelAcrossPhrasings: ng ? gModel / ng : null,
      sameOutcomeAcrossPhrasings: ng ? gOutcome / ng : null,
    };
  });

  return {
    level,
    armIds,
    armKinds,
    tail,
    runP95,
    overhead,
    failures,
    load,
    format: { jsonTasks: jsonTasks.size, codeTasks: codeTasks.size, rows: format },
    instructions: { nTasks: constraintTasks.size, rows: instructions },
    faithfulness: { nTasks: docTasks.size, rows: faith },
    costSpread,
    tokens,
    costByDifficulty,
    inputLength: { ...inputLength, source: lengthFromChars ? "mixed" : "tokens" },
    languages,
    suites,
    edge,
    stability,
    hasRephrasings,
    hasRepetitions,
  };
}

function hasPath(obj: Record<string, unknown>, path: string): boolean {
  if (path in obj) return true;
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object" || !(part in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return true;
}

const TYPE_LABEL: Record<ConstraintCheck["type"], string> = {
  maxWords: "Word limit (max)",
  minWords: "Word limit (min)",
  exactLines: "Exact line count",
  startsWith: "Starts with",
  endsWith: "Ends with",
  allLowercase: "All lowercase",
  allUppercase: "All uppercase",
  noCommas: "No commas",
  includes: "Required phrase",
  excludes: "Forbidden word",
  bulletCount: "Bullet count",
};

function typeLabel(c: ConstraintCheck): string {
  return TYPE_LABEL[c.type] ?? describeConstraint(c);
}

function sliceTable(
  armIds: string[],
  byArm: Map<string, BenchSample[]>,
  slices: { key: string; label: string }[],
  keyOf: (s: BenchSample) => string,
  level: number,
): SliceTable {
  const keyCache = new Map<BenchSample, string>();
  const k = (s: BenchSample) => {
    if (!keyCache.has(s)) keyCache.set(s, keyOf(s));
    return keyCache.get(s)!;
  };
  const all = armIds.flatMap((id) => byArm.get(id)!);
  const present = slices
    .map((sl) => ({ ...sl, nTasks: new Set(all.filter((s) => k(s) === sl.key).map((s) => s.taskId)).size }))
    .filter((sl) => sl.nTasks > 0);
  return {
    slices: present,
    rows: armIds.map((id) => ({
      armId: id,
      cells: present.map((sl) => {
        const ss = byArm.get(id)!.filter((s) => k(s) === sl.key);
        const correct = ss.filter((s) => s.result.ok && s.grade.correct).length;
        const scores = ss.map((s) => (s.result.ok ? Math.max(0, Math.min(1, Number(s.grade.score) || 0)) : 0));
        const costs = ss.map((s) => s.result.costUsd).filter((c): c is number => c != null && Number.isFinite(c));
        const lat = ss.filter((s) => s.result.ok).map((s) => s.result.latencyMs);
        const models = new Map<string, number>();
        for (const s of ss) if (s.result.ok && s.result.servedModel) models.set(s.result.servedModel, (models.get(s.result.servedModel) ?? 0) + 1);
        const top = [...models.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          n: ss.length,
          nTasks: new Set(ss.map((s) => s.taskId)).size,
          accuracy: mean(scores),
          correctRate: rate(correct, ss.length, level),
          meanCost: mean(costs),
          medianLatency: med(lat),
          topModel: top ? top[0] : null,
        };
      }),
    })),
  };
}

// ---------------------------------------------------------------- drift between runs

export interface DriftRow {
  armId: string;
  nTasks: number;
  accuracyThen: number | null;
  accuracyNow: number | null;
  delta: number | null;
  /** McNemar on per-task majority correctness: then right & now wrong (b), then wrong & now right (c). */
  b: number;
  c: number;
  pValue: number | null;
  /** Jensen-Shannon divergence (bits, 0–1) between the served-model mixes. */
  modelShift: number | null;
  topModelThen: string | null;
  topModelNow: string | null;
  medianLatencyThen: number | null;
  medianLatencyNow: number | null;
  meanCostThen: number | null;
  meanCostNow: number | null;
}

export interface DriftReport {
  previousRunId: string;
  previousName: string;
  daysApart: number;
  sharedArms: number;
  sharedTasks: number;
  rows: DriftRow[];
  reason: string | null;
}

/** Compare the same arms on the same tasks in two runs. */
export function compareRuns(now: BenchRun, then: BenchRun): DriftReport {
  const days = Math.abs(now.createdAt - then.createdAt) / 86_400_000;
  const nowArms = new Set(now.samples.map((s) => s.armId));
  const thenArms = new Set(then.samples.map((s) => s.armId));
  const shared = (now.arms ?? []).map((a) => a.id).filter((id) => nowArms.has(id) && thenArms.has(id));
  const nowTasks = new Set(now.samples.map((s) => s.taskId));
  const sharedTasks = new Set(then.samples.map((s) => s.taskId).filter((t) => nowTasks.has(t)));
  const base = { previousRunId: then.id, previousName: then.name, daysApart: days, sharedArms: shared.length, sharedTasks: sharedTasks.size };
  if (!shared.length) return { ...base, rows: [], reason: "The two runs have no router (with the same model setting) in common." };
  if (!sharedTasks.size) return { ...base, rows: [], reason: "The two runs have no task in common." };

  const cellsOf = (run: BenchRun, armId: string) => {
    const m = new Map<string, BenchSample[]>();
    for (const s of run.samples) if (s.armId === armId && sharedTasks.has(s.taskId)) m.set(s.taskId, [...(m.get(s.taskId) ?? []), s]);
    return m;
  };
  const summarize = (cells: Map<string, BenchSample[]>, tasks: string[]) => {
    const all = tasks.flatMap((t) => cells.get(t) ?? []);
    const models: Record<string, number> = {};
    for (const s of all) {
      const m = normalizeModel(s.result.servedModel);
      if (s.result.ok && m) models[m] = (models[m] ?? 0) + 1;
    }
    const scores = tasks.map((t) => mean((cells.get(t) ?? []).map((s) => (s.result.ok ? Math.max(0, Math.min(1, Number(s.grade.score) || 0)) : 0))) ?? 0);
    return {
      acc: mean(scores),
      majority: tasks.map((t) => {
        const l = cells.get(t) ?? [];
        return l.filter((s) => s.result.ok && s.grade.correct).length * 2 > l.length;
      }),
      models,
      top: Object.entries(models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      lat: med(all.filter((s) => s.result.ok).map((s) => s.result.latencyMs)),
      cost: mean(all.map((s) => s.result.costUsd).filter((c): c is number => c != null && Number.isFinite(c))),
    };
  };

  const rows: DriftRow[] = shared.map((id) => {
    const a = cellsOf(then, id);
    const b = cellsOf(now, id);
    const tasks = [...sharedTasks].filter((t) => a.has(t) && b.has(t)).sort();
    const s0 = summarize(a, tasks);
    const s1 = summarize(b, tasks);
    let nb = 0, nc = 0;
    tasks.forEach((_, i) => {
      if (s0.majority[i] && !s1.majority[i]) nb++;
      else if (!s0.majority[i] && s1.majority[i]) nc++;
    });
    const mc = mcnemar(nb, nc);
    const hasModels = Object.keys(s0.models).length > 0 && Object.keys(s1.models).length > 0;
    return {
      armId: id,
      nTasks: tasks.length,
      accuracyThen: s0.acc,
      accuracyNow: s1.acc,
      delta: s0.acc != null && s1.acc != null ? s1.acc - s0.acc : null,
      b: nb,
      c: nc,
      pValue: tasks.length ? fin(mc.pExact) : null,
      modelShift: hasModels ? fin(jsDivergenceRecords(s0.models, s1.models)) : null,
      topModelThen: s0.top,
      topModelNow: s1.top,
      medianLatencyThen: s0.lat,
      medianLatencyNow: s1.lat,
      meanCostThen: s0.cost,
      meanCostNow: s1.cost,
    };
  });
  return { ...base, rows, reason: null };
}
