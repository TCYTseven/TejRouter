import { getProviderSpec } from "@/lib/providers/registry";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult } from "@/lib/types";
import { normalizeArms, shade } from "./arms";
import {
  BenchConfigError,
  MAX_JOBS,
  backoffMs,
  isRetryable,
  planRun,
  retryAfterMs,
  runBench,
  selectTasks,
  type RunOptions,
} from "./runner";
import { getSuite } from "./suites";
import type { BenchEvent, BenchRunConfig } from "./types";

const ARMS = [{ providerId: "sim-greedy" }, { providerId: "sim-oracle" }];

function baseConfig(over: Partial<BenchRunConfig> = {}): BenchRunConfig {
  return {
    suiteIds: ["trivial", "math"],
    arms: ARMS,
    repetitions: 2,
    concurrency: 4,
    seed: 7,
    maxTasksPerSuite: 4,
    ...over,
  };
}

async function collect(config: BenchRunConfig, signal?: AbortSignal, opts?: RunOptions) {
  const events: BenchEvent[] = [];
  const run = await runBench(config, (e) => events.push(e), signal, opts);
  return { run, events };
}

function okResult(req: ChatRequest, text: string, extra: Partial<ChatResult> = {}): ChatResult {
  return {
    id: "x",
    providerId: req.providerId,
    requestedModel: req.model ?? "",
    servedModel: "fake",
    servedProvider: null,
    ok: true,
    error: null,
    httpStatus: 200,
    text,
    finishReason: "stop",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    costUsd: 0,
    costSource: null,
    latencyMs: 1,
    ttftMs: 1,
    outputTps: null,
    startedAt: Date.now(),
    routingHeaders: {},
    ...extra,
  };
}

function failResult(req: ChatRequest, status: number | null, error: string, headers: Record<string, string> = {}): ChatResult {
  return { ...okResult(req, ""), ok: false, httpStatus: status, error, routingHeaders: headers };
}

const noSleep: RunOptions["sleep"] = async () => {};

describe("runBench with the simulators", () => {
  it("emits run-start, one sample per job, then run-end", async () => {
    const { run, events } = await collect(baseConfig());
    const total = 8 * 2 * 2;
    expect(events[0].type).toBe("run-start");
    expect(events[events.length - 1].type).toBe("run-end");
    const start = events[0] as Extract<BenchEvent, { type: "run-start" }>;
    expect(start.totalJobs).toBe(total);
    expect(start.run.tasks).toHaveLength(8);
    expect(start.run.arms.map((a) => a.id)).toEqual(["sim-greedy:default", "sim-oracle:default"]);
    expect("samples" in start.run).toBe(false);

    const samples = events.filter((e): e is Extract<BenchEvent, { type: "sample" }> => e.type === "sample");
    expect(samples).toHaveLength(total);
    expect(samples.map((s) => s.completed)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(samples.every((s) => s.totalJobs === total)).toBe(true);
    expect(run.samples).toHaveLength(total);
    expect(run.aborted).toBeUndefined();
    expect(run.finishedAt).not.toBeNull();

    // Every task × arm × rep exactly once.
    const keys = new Set(run.samples.map((s) => `${s.taskId}|${s.armId}|${s.rep}`));
    expect(keys.size).toBe(total);
    for (const s of run.samples) {
      expect(s.runId).toBe(run.id);
      expect(s.attempts).toBe(1);
      expect(s.result.ok).toBe(true);
      expect(s.grade.score).toBeGreaterThanOrEqual(0);
    }
    // Simulators answer easy tasks correctly most of the time.
    const acc = run.samples.filter((s) => s.grade.correct).length / total;
    expect(acc).toBeGreaterThan(0.5);
  });

  it("is deterministic for the same seed", async () => {
    const a = await collect(baseConfig());
    const b = await collect(baseConfig());
    const key = (s: (typeof a.run.samples)[number]) => `${s.taskId}|${s.armId}|${s.rep}`;
    const norm = (r: typeof a.run) =>
      r.samples
        .slice()
        .sort((x, y) => key(x).localeCompare(key(y)))
        .map((s) => [key(s), s.result.text, s.result.servedModel, s.grade.score]);
    expect(norm(a.run)).toEqual(norm(b.run));
    expect(a.run.tasks).toEqual(b.run.tasks);
  });

  it("dispatches jobs in a seeded shuffled order", async () => {
    const order = async (seed: number) => {
      const seen: string[] = [];
      const call: RunOptions["call"] = async (req) => {
        seen.push(`${req.providerId}|${req.messages[0].content.slice(0, 40)}|${req.seed}`);
        return okResult(req, "Answer: 1");
      };
      await collect(baseConfig({ seed, concurrency: 1 }), undefined, { call });
      return seen;
    };
    const a1 = await order(11);
    const a2 = await order(11);
    const b = await order(12);
    expect(a1).toEqual(a2);
    expect(b).not.toEqual(a1);
    // Arms are interleaved, not run back to back.
    const firstHalf = a1.slice(0, a1.length / 2).map((x) => x.split("|")[0]);
    expect(new Set(firstHalf).size).toBe(2);
  });

  it("passes the seed, temperature, maxTokens and simulator hint", async () => {
    const reqs: ChatRequest[] = [];
    const call: RunOptions["call"] = async (req) => {
      reqs.push(req);
      return okResult(req, "Answer: 0");
    };
    await collect(baseConfig({ temperature: 0.2, maxTokens: 300, repetitions: 2 }), undefined, { call });
    expect(reqs.every((r) => r.temperature === 0.2 && r.maxTokens === 300)).toBe(true);
    expect(new Set(reqs.map((r) => r.seed))).toEqual(new Set([7, 8]));
    expect(reqs.every((r) => r.simulatorHint && typeof r.simulatorHint.expected === "string")).toBe(true);
  });

  it("caps per-provider concurrency", async () => {
    const active = new Map<string, number>();
    const peak = new Map<string, number>();
    let globalActive = 0;
    let globalPeak = 0;
    const call: RunOptions["call"] = async (req) => {
      active.set(req.providerId, (active.get(req.providerId) ?? 0) + 1);
      globalActive++;
      peak.set(req.providerId, Math.max(peak.get(req.providerId) ?? 0, active.get(req.providerId)!));
      globalPeak = Math.max(globalPeak, globalActive);
      await new Promise((r) => setTimeout(r, 2));
      active.set(req.providerId, active.get(req.providerId)! - 1);
      globalActive--;
      return okResult(req, "Answer: 1");
    };
    await collect(baseConfig({ concurrency: 4 }), undefined, { call });
    expect(globalPeak).toBeLessThanOrEqual(4);
    expect(Math.max(...peak.values())).toBeLessThanOrEqual(2);
    expect(globalPeak).toBeGreaterThan(1);
  });

  it("stops scheduling on abort and still emits run-end", async () => {
    const ctrl = new AbortController();
    let calls = 0;
    let callsAfterAbort = 0;
    const call: RunOptions["call"] = (req, { signal }) =>
      new Promise((resolve) => {
        calls++;
        if (signal?.aborted) callsAfterAbort++;
        const t = setTimeout(() => resolve(okResult(req, "Answer: 1")), 5);
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          resolve(failResult(req, null, "Network error: This operation was aborted"));
        });
      });
    const events: BenchEvent[] = [];
    const runP = runBench(
      baseConfig({ concurrency: 2 }),
      (e) => {
        events.push(e);
        if (e.type === "sample" && e.completed === 5) ctrl.abort();
      },
      ctrl.signal,
      { call },
    );
    const run = await runP;
    expect(events[events.length - 1]).toMatchObject({ type: "run-end", aborted: true });
    expect(run.aborted).toBe(true);
    expect(run.samples.length).toBeGreaterThanOrEqual(5);
    expect(run.samples.length).toBeLessThan(32);
    expect(callsAfterAbort).toBe(0);
    expect(calls).toBeLessThan(32);
    // Aborted in-flight calls are dropped, not recorded as router failures.
    expect(run.samples.every((s) => s.result.ok)).toBe(true);
  });

  it("handles an already-aborted signal", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { run, events } = await collect(baseConfig(), ctrl.signal);
    expect(events.map((e) => e.type)).toEqual(["run-start", "run-end"]);
    expect(run.samples).toHaveLength(0);
  });
});

describe("retries", () => {
  const one = (): BenchRunConfig => ({
    suiteIds: ["trivial"],
    arms: [{ providerId: "sim-greedy" }],
    repetitions: 1,
    concurrency: 1,
    seed: 1,
    maxTasksPerSuite: 1,
  });

  it("retries 429 and honors Retry-After", async () => {
    let n = 0;
    const waits: number[] = [];
    const call: RunOptions["call"] = async (req) =>
      ++n <= 2 ? failResult(req, 429, "HTTP 429: slow down", { "retry-after": "2" }) : okResult(req, "Answer: x");
    const { run } = await collect(one(), undefined, { call, sleep: async (ms) => void waits.push(ms) });
    expect(run.samples[0].attempts).toBe(3);
    expect(run.samples[0].result.ok).toBe(true);
    expect(run.samples[0].attemptLog?.map((a) => a.httpStatus)).toEqual([429, 429]);
    expect(waits).toHaveLength(2);
    for (const w of waits) expect(w).toBeGreaterThanOrEqual(2000);
  });

  it("gives up after 3 retries on 5xx and records the failure", async () => {
    let n = 0;
    const call: RunOptions["call"] = async (req) => {
      n++;
      return failResult(req, 503, "HTTP 503: unavailable");
    };
    const { run } = await collect(one(), undefined, { call, sleep: noSleep });
    expect(n).toBe(4);
    expect(run.samples[0].attempts).toBe(4);
    expect(run.samples[0].grade).toMatchObject({ score: 0, correct: false });
    expect(run.samples[0].grade.detail).toMatch(/503/);
  });

  it("does not retry client errors and survives a throwing client", async () => {
    let n = 0;
    const call401: RunOptions["call"] = async (req) => {
      n++;
      return failResult(req, 401, "HTTP 401: bad key");
    };
    const { run } = await collect(one(), undefined, { call: call401, sleep: noSleep });
    expect(n).toBe(1);
    expect(run.samples[0].attempts).toBe(1);
    expect(run.samples[0].attemptLog).toBeUndefined();

    const throwing: RunOptions["call"] = async () => {
      throw new Error("kaboom");
    };
    const r2 = await collect(one(), undefined, { call: throwing, sleep: noSleep });
    expect(r2.run.samples[0].result.ok).toBe(false);
    expect(r2.run.samples[0].result.error).toMatch(/kaboom/);
  });

  it("classifies errors and computes backoff", () => {
    const req = { providerId: "x", messages: [] } as ChatRequest;
    expect(isRetryable(failResult(req, 429, "x"))).toBe(true);
    expect(isRetryable(failResult(req, 502, "x"))).toBe(true);
    expect(isRetryable(failResult(req, 400, "x"))).toBe(false);
    expect(isRetryable(failResult(req, null, "Network error: ECONNRESET"))).toBe(true);
    expect(isRetryable(failResult(req, null, "Network error: This operation was aborted"))).toBe(false);
    expect(isRetryable(failResult(req, null, "Not configured: set X"))).toBe(false);
    expect(retryAfterMs({ "Retry-After": "3" })).toBe(3000);
    expect(retryAfterMs({ "x-ratelimit-reset-requests": "1m30s" })).toBe(90_000);
    expect(retryAfterMs({ "x-ratelimit-reset-tokens": "250ms" })).toBe(250);
    expect(retryAfterMs({ "retry-after": new Date(Date.now() + 5000).toUTCString() })).toBeGreaterThan(3000);
    expect(retryAfterMs({})).toBeNull();
    const r = failResult(req, 500, "x");
    expect(backoffMs(1, r, 1000, () => 0.5)).toBe(1000);
    expect(backoffMs(3, r, 1000, () => 0.5)).toBe(4000);
    expect(backoffMs(20, r, 1000, () => 0.99)).toBeLessThanOrEqual(60_000);
  });
});

describe("config validation", () => {
  it("rejects runs above the job cap with a clear error", () => {
    expect(() =>
      planRun({
        suiteIds: ["math", "reasoning", "knowledge", "code"],
        arms: [{ providerId: "sim-greedy" }, { providerId: "sim-oracle" }, { providerId: "sim-greedy", model: "sim/large" }],
        repetitions: 20,
        concurrency: 4,
      }),
    ).toThrow(new RegExp(`limit is ${MAX_JOBS}`));
  });
  it("rejects unknown suites, providers and bad numbers", () => {
    expect(() => planRun({ ...baseConfig(), suiteIds: ["nope"] })).toThrow(BenchConfigError);
    expect(() => planRun({ ...baseConfig(), arms: [{ providerId: "nope" }] })).toThrow(/Unknown provider/);
    expect(() => planRun({ ...baseConfig(), arms: [] })).toThrow(BenchConfigError);
    expect(() => planRun({ ...baseConfig(), repetitions: 0 })).toThrow(BenchConfigError);
    expect(() => planRun({ ...baseConfig(), concurrency: 1.5 })).toThrow(BenchConfigError);
    expect(() => planRun(null)).toThrow(BenchConfigError);
  });
  it("fills defaults and records a seed", () => {
    const p = planRun({ suiteIds: ["trivial"], arms: [{ providerId: "sim-greedy" }] });
    expect(p.config.repetitions).toBe(1);
    expect(p.config.concurrency).toBe(4);
    expect(Number.isInteger(p.config.seed)).toBe(true);
    expect(planRun(p.config).config).toEqual(p.config); // idempotent
  });
});

describe("task selection", () => {
  it("subsamples deterministically across the difficulty range", () => {
    const tasks = getSuite("math")!.tasks;
    const a = selectTasks(tasks, 6, 3);
    expect(a).toHaveLength(6);
    expect(selectTasks(tasks, 6, 3)).toEqual(a);
    expect(new Set(a.map((t) => t.id)).size).toBe(6);
    const ds = a.map((t) => t.difficulty);
    expect(Math.min(...ds)).toBeLessThan(0.35);
    expect(Math.max(...ds)).toBeGreaterThan(0.6);
    expect(selectTasks(tasks, 1000, 3)).toBe(tasks);
  });
});

describe("arms", () => {
  it("normalizes ids, labels and colors and drops duplicates", () => {
    const arms = normalizeArms([
      { providerId: "enclave" },
      { providerId: "enclave", model: "gpt-4o" },
      { providerId: "openrouter", model: "openrouter/auto" },
      { providerId: "enclave" },
    ]);
    expect(arms.map((a) => a.id)).toEqual(["enclave:default", "enclave:gpt-4o", "openrouter:openrouter/auto"]);
    expect(arms[0].label).toBe("Enclave Cyberouter · cyberouter/auto");
    expect(arms[1].label).toBe("Enclave Cyberouter · gpt-4o");
    expect(arms[0].color).toBe(getProviderSpec("enclave")!.color);
    expect(arms[1].color).not.toBe(arms[0].color);
    expect(arms[1].color).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("derives distinct shades", () => {
    const shades = [0, 1, 2, 3, 4].map((i) => shade("#3b82f6", i));
    expect(new Set(shades).size).toBe(5);
  });
});

describe("store", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tejrouter-runs-"));
  process.env.TEJROUTER_RUNS_DIR = path.join(dir, "runs");
  afterAll(() => {
    delete process.env.TEJROUTER_RUNS_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("saves, lists, loads, imports and deletes runs", async () => {
    const store = await import("./store");
    const { run: r1 } = await collect(baseConfig({ repetitions: 1, maxTasksPerSuite: 2 }));
    const { run: r2 } = await collect(baseConfig({ repetitions: 1, maxTasksPerSuite: 2, seed: 9 }));
    r2.createdAt = r1.createdAt + 1000;
    expect(await store.saveRun(r1)).toMatchObject({ persisted: true });
    expect(await store.saveRun(r2)).toMatchObject({ persisted: true });

    const list = await store.listRuns();
    expect(list.map((s) => s.id)).toEqual([r2.id, r1.id]);
    expect(list[0].arms).toHaveLength(2);
    expect(list[0].sampleCount).toBe(8);
    expect(list[0].totalJobs).toBe(8);
    expect(list[0].arms[0].accuracy).toBeGreaterThanOrEqual(0);

    expect((await store.loadRun(r1.id))?.samples).toHaveLength(8);
    expect(await store.loadRun("../etc/passwd")).toBeNull();

    // Import of an existing id gets a fresh id instead of overwriting.
    const imported = await store.importRun(JSON.parse(JSON.stringify(r1)));
    expect(imported.run.id).not.toBe(r1.id);
    expect(imported.run.samples.every((s) => s.runId === imported.run.id)).toBe(true);
    await expect(store.importRun({ nope: true })).rejects.toThrow(store.RunImportError);

    expect(await store.deleteRun(r1.id)).toBe(true);
    expect(await store.loadRun(r1.id)).toBeNull();
    expect(await store.deleteRun(r1.id)).toBe(false);
  });

  it("falls back to memory when the filesystem is not writable", async () => {
    const store = await import("./store");
    const blocker = path.join(dir, "file");
    writeFileSync(blocker, "x");
    process.env.TEJROUTER_RUNS_DIR = path.join(blocker, "runs"); // mkdir under a file fails
    const { run } = await collect(baseConfig({ repetitions: 1, maxTasksPerSuite: 1 }));
    const res = await store.saveRun(run);
    expect(res.persisted).toBe(false);
    expect(res.error).toBeTruthy();
    expect((await store.loadRun(run.id))?.id).toBe(run.id);
    expect((await store.listRuns()).some((s) => s.id === run.id)).toBe(true);
    process.env.TEJROUTER_RUNS_DIR = path.join(dir, "runs");
  });
});

describe("API routes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tejrouter-api-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("POST /api/bench streams NDJSON and persists; /api/runs lists, gets, imports and deletes", async () => {
    process.env.TEJROUTER_RUNS_DIR = path.join(dir, "runs");
    const bench = await import("@/app/api/bench/route");
    const runs = await import("@/app/api/runs/route");
    const runById = await import("@/app/api/runs/[id]/route");
    const suites = await import("@/app/api/bench/suites/route");

    const bad = await bench.POST(new Request("http://x/api/bench", { method: "POST", body: JSON.stringify({ suiteIds: ["nope"], arms: ARMS }) }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/Unknown suite/);
    const notJson = await bench.POST(new Request("http://x/api/bench", { method: "POST", body: "{" }));
    expect(notJson.status).toBe(400);

    const res = await bench.POST(
      new Request("http://x/api/bench", { method: "POST", body: JSON.stringify(baseConfig({ maxTasksPerSuite: 2, repetitions: 1 })) }),
    );
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const runId = res.headers.get("x-bench-run-id")!;
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as BenchEvent);
    expect(lines[0].type).toBe("run-start");
    expect(lines.filter((e) => e.type === "sample")).toHaveLength(8);
    expect(lines[lines.length - 1]).toMatchObject({ type: "run-end", runId, persisted: true });

    const list = await (await runs.GET()).json();
    expect(list.runs.some((r: { id: string }) => r.id === runId)).toBe(true);

    const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/runs/[id]">;
    const full = await (await runById.GET(new Request("http://x"), ctx(runId))).json();
    expect(full.samples).toHaveLength(8);
    expect((await runById.GET(new Request("http://x"), ctx("missing"))).status).toBe(404);
    expect((await runById.GET(new Request("http://x"), ctx("..%2F"))).status).toBe(400);

    const imp = await runs.POST(new Request("http://x/api/runs", { method: "POST", body: JSON.stringify(full) }));
    expect(imp.status).toBe(201);
    const impBody = await imp.json();
    expect(impBody.persisted).toBe(true);
    expect(impBody.run.id).not.toBe(runId);
    expect((await runs.POST(new Request("http://x/api/runs", { method: "POST", body: "[]" }))).status).toBe(400);

    expect((await runById.DELETE(new Request("http://x"), ctx(runId))).status).toBe(200);
    expect((await runById.DELETE(new Request("http://x"), ctx(runId))).status).toBe(404);

    const s = await (await suites.GET()).json();
    expect(s.suites).toHaveLength(11);
    expect(s.suites.filter((x: { optional?: boolean }) => x.optional)).toHaveLength(3);
    expect(s.suites[0]).toHaveProperty("difficultyHistogram");
    delete process.env.TEJROUTER_RUNS_DIR;
  });
});

describe("runBenchWith (the engine the browser runs)", () => {
  it("awaits an async grader and turns a throwing grader into a zero score", async () => {
    const { runBenchWith } = await import("./engine");
    const { grade } = await import("./graders");
    const config = baseConfig({ suiteIds: ["trivial"], arms: [{ providerId: "sim-oracle" }], repetitions: 1 });
    const server = await runBench(config, () => {});
    const async = await runBenchWith(config, () => {}, undefined, {
      call: (req) => import("@/lib/providers/simulator").then((m) => m.simulateChat(getProviderSpec(req.providerId)!, req)),
      grade: async (task, text) => grade(task, text),
    });
    const scores = (r: typeof server) => r.samples.map((s) => [s.taskId, s.grade.score]).sort();
    expect(scores(async)).toEqual(scores(server));

    const broken = await runBenchWith(config, () => {}, undefined, {
      call: (req) => Promise.resolve(okResult(req, "Answer: 1")),
      grade: () => Promise.reject(new Error("worker crashed")),
    });
    expect(broken.samples.every((s) => s.grade.score === 0 && s.grade.detail.includes("worker crashed"))).toBe(true);
  });
});
