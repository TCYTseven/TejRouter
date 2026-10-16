import { describe, expect, it } from "vitest";
import type { BenchArm, BenchRun, BenchSample } from "@/lib/bench/types";
import { getSuite } from "@/lib/bench/suites";
import type { ChatResult } from "@/lib/types";
import { analyzeAdvanced, classifyFailure, compareRuns, normalizeModel, supportedBy } from "./advanced";
import { analyzeRun } from "./analyze";

const ROUTER: BenchArm = { id: "ramp:default", providerId: "ramp", label: "Ramp", color: "#111" };
const PINNED: BenchArm = { id: "openrouter:openai/gpt-4o-mini", providerId: "openrouter", model: "openai/gpt-4o-mini", label: "mini", color: "#222" };

function result(over: Partial<ChatResult> = {}): ChatResult {
  return {
    id: "x",
    providerId: "ramp",
    requestedModel: "",
    servedModel: "gpt-4o-mini",
    servedProvider: null,
    ok: true,
    error: null,
    httpStatus: 200,
    text: "Answer: 1",
    finishReason: "stop",
    usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
    costUsd: 0.001,
    costSource: "reported",
    latencyMs: 1000,
    ttftMs: 300,
    outputTps: null,
    startedAt: 0,
    routingHeaders: {},
    ...over,
  };
}

function sample(arm: BenchArm, taskId: string, over: Partial<BenchSample> & { r?: Partial<ChatResult> } = {}): BenchSample {
  const { r, ...rest } = over;
  const suiteId = taskId.split("/")[0];
  return {
    runId: "run",
    taskId,
    suiteId,
    category: "c",
    difficulty: 0.5,
    armId: arm.id,
    providerId: arm.providerId,
    rep: 0,
    result: result({ providerId: arm.providerId, ...r }),
    grade: { score: 1, correct: true, extracted: "1", detail: "" },
    ...rest,
  };
}

function run(samples: BenchSample[], arms = [ROUTER, PINNED], over: Partial<BenchRun> = {}): BenchRun {
  const tasks = [...new Map(samples.map((s) => [s.taskId, { id: s.taskId, suiteId: s.suiteId, category: s.category, difficulty: s.difficulty }])).values()];
  return {
    id: "run",
    name: "run",
    createdAt: 1_700_000_000_000,
    finishedAt: null,
    config: { suiteIds: [], arms, repetitions: 1, concurrency: 4, seed: 1 },
    arms,
    tasks,
    samples,
    ...over,
  };
}

const advanced = (r: BenchRun) => analyzeAdvanced(r, analyzeRun(r, { bootstrapIterations: 200 }));

describe("helpers", () => {
  it("normalizes model ids across gateways", () => {
    expect(normalizeModel("openai/gpt-4o-mini-2024-07-18")).toBe("gpt-4o-mini");
    expect(normalizeModel("openai:gpt-5.4-mini")).toBe("gpt-5.4-mini");
    expect(normalizeModel("GPT-4o-mini")).toBe("gpt-4o-mini");
    expect(normalizeModel("")).toBeNull();
  });
  it("classifies failures", () => {
    expect(classifyFailure(null, "Network error: Timed out")).toBe("timeout");
    expect(classifyFailure(429, "HTTP 429")).toBe("rate-limit");
    expect(classifyFailure(503, "HTTP 503")).toBe("server");
    expect(classifyFailure(404, "HTTP 404")).toBe("client");
    expect(classifyFailure(null, "Network error: fetch failed")).toBe("network");
    expect(classifyFailure(200, "Stream error: boom")).toBe("stream");
  });
  it("checks answers against the document, JSON leaf by leaf", () => {
    expect(supportedBy("ZX-91", "the code is zx-91 today")).toBe(true);
    expect(supportedBy("QQ-12", "the code is zx-91 today")).toBe(false);
    expect(supportedBy('{"name":"Ada","age":36}', "Ada is 36 years old")).toBe(true);
    expect(supportedBy('{"name":"Bob"}', "Ada is 36 years old")).toBe(false);
  });
});

describe("analyzeAdvanced", () => {
  it("measures router overhead against a pinned call to the same model", () => {
    const tasks = ["trivial/add-7-5", "trivial/mul-9-6", "trivial/sub-100-37", "trivial/larger-of-two", "trivial/echo-word", "trivial/echo-phrase"];
    const samples = tasks.flatMap((t, i) => [
      sample(ROUTER, t, { r: { latencyMs: 1500 + i, ttftMs: 700, servedModel: "gpt-4o-mini" } }),
      sample(PINNED, t, { r: { latencyMs: 1000 + i, ttftMs: 300, servedModel: "openai/gpt-4o-mini-2024-07-18", providerId: "openrouter" } }),
    ]);
    const a = advanced(run(samples));
    expect(a.overhead.available).toBe(true);
    const row = a.overhead.rows.find((r) => r.armId === ROUTER.id)!;
    expect(row.nPairs).toBe(6);
    expect(row.latency.value).toBe(500);
    expect(row.ttft.value).toBe(400);
    expect(row.models).toEqual(["gpt-4o-mini"]);
  });

  it("says why overhead is unavailable without pinned arms", () => {
    const a = advanced(run([sample(ROUTER, "trivial/add-7-5")], [ROUTER]));
    expect(a.overhead.available).toBe(false);
    expect(a.overhead.reason).toMatch(/pin/i);
  });

  it("counts retries, recoveries, failure kinds and empty replies", () => {
    const samples = [
      sample(ROUTER, "trivial/add-7-5", { attempts: 3, attemptLog: [{ httpStatus: 429, error: "HTTP 429", latencyMs: 5 }, { httpStatus: 503, error: "HTTP 503", latencyMs: 5 }] }),
      sample(ROUTER, "trivial/mul-9-6", { r: { ok: false, httpStatus: null, error: "Network error: Timed out", text: "" } }),
      sample(ROUTER, "trivial/sub-100-37", { r: { text: "  " } }),
      sample(ROUTER, "trivial/larger-of-two"),
    ];
    const f = advanced(run(samples, [ROUTER])).failures[0];
    expect(f.totalAttempts).toBe(6);
    expect(f.retried).toBe(1);
    expect(f.recovered).toBe(1);
    expect(f.recoveryRate).toBe(1);
    expect(f.failures).toBe(1);
    expect(f.byClass.timeout).toBe(1);
    expect(f.retriedByClass["rate-limit"]).toBe(1);
    expect(f.retriedByClass.server).toBe(1);
    expect(f.emptyReplies).toBe(1);
    expect(f.attemptsRecorded).toBe(true);
  });

  it("flags a pinned arm served by another model", () => {
    const samples = [sample(PINNED, "trivial/add-7-5", { r: { servedModel: "claude-haiku-4-5" } }), sample(PINNED, "trivial/mul-9-6")];
    const f = advanced(run(samples, [PINNED])).failures[0];
    expect(f.substituted).toBe(1);
  });

  it("counts calls in flight and throttling", () => {
    const samples = Array.from({ length: 12 }, (_, i) =>
      sample(ROUTER, getSuite("trivial")!.tasks[i].id, {
        r: { startedAt: i < 6 ? 0 : 10_000 + i * 2000, latencyMs: i < 6 ? 3000 : 500 },
        ...(i === 0 ? { attempts: 2, attemptLog: [{ httpStatus: 429, error: "HTTP 429", latencyMs: 1 }] } : {}),
      }),
    );
    const l = advanced(run(samples, [ROUTER])).load[0];
    expect(l.peakInFlight).toBe(6);
    expect(l.throttled).toBe(1);
    expect(l.spearman).toBeGreaterThan(0.5);
    expect(l.buckets.find((b) => b.label === "1")!.n).toBe(6);
  });

  it("checks JSON format, instructions and unsupported answers", () => {
    const ext = getSuite("extraction")!.tasks.find((t) => t.grader.kind === "json")!;
    const ins = getSuite("instruction")!.tasks[0];
    const lc = getSuite("long-context")!.tasks[0];
    const samples = [
      sample(ROUTER, ext.id, { r: { text: "Sorry, here you go: name is Ada" }, grade: { score: 0, correct: false, extracted: null, detail: "" } }),
      sample(ROUTER, ins.id, { r: { text: "x" }, grade: { score: 0, correct: false, extracted: null, detail: "" } }),
      sample(ROUTER, lc.id, { r: { text: "Answer: QZ-0000-NOPE" }, grade: { score: 0, correct: false, extracted: "QZ-0000-NOPE", detail: "" } }),
    ];
    const a = advanced(run(samples, [ROUTER]));
    expect(a.format.rows[0].json.n).toBe(1);
    expect(a.format.rows[0].json.parsed).toBe(0);
    expect(a.instructions.rows[0].n).toBe(1);
    expect(a.instructions.rows[0].byType.length).toBeGreaterThan(0);
    const f = a.faithfulness.rows[0];
    expect(f.unsupported).toBe(1);
    expect(f.examples[0].answer).toBe("QZ-0000-NOPE");
  });

  it("slices by language and scores edge cases and rephrasings", () => {
    const ml = getSuite("multilingual")!.tasks;
    const edge = getSuite("edge")!.tasks;
    const rp = getSuite("rephrase")!.tasks.slice(0, 3);
    const samples = [
      sample(ROUTER, "trivial/add-7-5"),
      sample(ROUTER, ml[0].id),
      sample(ROUTER, ml[13].id, { grade: { score: 0, correct: false, extracted: "x", detail: "" } }),
      sample(ROUTER, edge[0].id, { r: { ok: false, httpStatus: 400, error: "HTTP 400: empty", text: "" } }),
      sample(ROUTER, edge[5].id, { r: { ok: false, httpStatus: null, error: "Network error: Timed out", text: "" } }),
      sample(ROUTER, rp[0].id, { r: { servedModel: "a" } }),
      sample(ROUTER, rp[1].id, { r: { servedModel: "a" } }),
      sample(ROUTER, rp[2].id, { r: { servedModel: "b" } }),
    ];
    const a = advanced(run(samples, [ROUTER]));
    expect(a.languages!.slices.map((s) => s.key)).toEqual(["en", "es", "ja"]);
    expect(a.edge!.rows[0].n).toBe(2);
    expect(a.edge!.rows[0].graceful).toBe(1);
    expect(a.hasRephrasings).toBe(true);
    expect(a.stability[0].groups).toBe(1);
    expect(a.stability[0].sameModelAcrossPhrasings).toBe(0);
    expect(a.stability[0].sameOutcomeAcrossPhrasings).toBe(1);
  });

  it("computes cost spread and token inflation", () => {
    const t = ["trivial/add-7-5", "trivial/mul-9-6"];
    const samples = [
      sample(ROUTER, t[0], { r: { costUsd: 0.001, usage: { promptTokens: 10, completionTokens: 40, totalTokens: 50 } } }),
      sample(ROUTER, t[1], { r: { costUsd: 0.003, usage: { promptTokens: 10, completionTokens: 40, totalTokens: 50 } } }),
      sample(PINNED, t[0], { r: { costUsd: 0.001, usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 } } }),
      sample(PINNED, t[1], { r: { costUsd: 0.001, usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 } } }),
    ];
    const a = advanced(run(samples));
    const cs = a.costSpread.find((r) => r.armId === ROUTER.id)!;
    expect(cs.mean).toBeCloseTo(0.002, 9);
    expect(cs.cv).toBeGreaterThan(0.5);
    const tok = a.tokens.find((r) => r.armId === ROUTER.id)!;
    // Median of two arms (40 and 10) is 25, so 40/25 = 1.6.
    expect(tok.inflation).toBeCloseTo(1.6, 9);
  });
});

describe("compareRuns", () => {
  it("reports accuracy and routing drift on shared arms and tasks", () => {
    const tasks = getSuite("trivial")!.tasks.slice(0, 8).map((t) => t.id);
    const then = run(tasks.map((t) => sample(ROUTER, t, { r: { servedModel: "a" } })), [ROUTER], { id: "then", createdAt: 0 });
    const now = run(
      tasks.map((t, i) => sample(ROUTER, t, { r: { servedModel: i < 4 ? "a" : "b" }, grade: i < 6 ? { score: 0, correct: false, extracted: null, detail: "" } : { score: 1, correct: true, extracted: "1", detail: "" } })),
      [ROUTER],
      { createdAt: 7 * 86_400_000 },
    );
    const d = compareRuns(now, then);
    expect(d.daysApart).toBe(7);
    const row = d.rows[0];
    expect(row.nTasks).toBe(8);
    expect(row.delta).toBeCloseTo(-0.75, 9);
    expect(row.b).toBe(6);
    expect(row.pValue).toBeLessThan(0.05);
    expect(row.modelShift).toBeGreaterThan(0);
  });
});

describe("judge helpers", async () => {
  const { agreement, cohenKappa, judgeMessages, parseJudgeReply, pickJudgeSample } = await import("./judge");
  it("parses scores from JSON or loose text", () => {
    expect(parseJudgeReply('{"score": 4, "reason": "ok"}')).toEqual({ score: 4, reason: "ok" });
    expect(parseJudgeReply('Here: ```json\n{"score":2,"reason":"wrong"}\n```')).toEqual({ score: 2, reason: "wrong" });
    expect(parseJudgeReply("Score: 5")).toEqual({ score: 5, reason: "" });
    expect(parseJudgeReply('{"score": 9}')).toBeNull();
    expect(parseJudgeReply("no idea")).toBeNull();
  });
  it("wraps the answer as data", () => {
    const m = judgeMessages("What is 2+2?", "4", "Answer: 4");
    expect(m[0].role).toBe("system");
    expect(m[1].content).toContain("<response>\nAnswer: 4\n</response>");
  });
  it("computes kappa and agreement", () => {
    expect(cohenKappa([true, true, false, false], [true, true, false, false])).toBe(1);
    expect(cohenKappa([true, false, true, false], [true, true, false, false])).toBe(0);
    const a = agreement([5, 4, 2, 1], [5, 3, 2, 1]);
    expect(a.exact).toBe(0.75);
    expect(a.withinOne).toBe(1);
    expect(a.passAgreement).toBe(0.75);
    const g = agreement([5, 1], [true, false]);
    expect(g.passKappa).toBe(1);
    expect(g.exact).toBeNull();
  });
  it("picks the same number of answers from each router", () => {
    const tasks = getSuite("trivial")!.tasks.slice(0, 10).map((t) => t.id);
    const r = run(tasks.flatMap((t) => [sample(ROUTER, t), sample(PINNED, t)]));
    const s = pickJudgeSample(r, 8, () => true);
    expect(s.filter((x) => x.armId === ROUTER.id)).toHaveLength(4);
    expect(s.filter((x) => x.armId === PINNED.id)).toHaveLength(4);
    expect(pickJudgeSample(r, 8, () => true).map((x) => x.taskId)).toEqual(s.map((x) => x.taskId));
  });
});
