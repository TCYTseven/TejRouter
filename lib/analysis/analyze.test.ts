import { describe, expect, it } from "vitest";
import type { BenchArm, BenchRun, BenchSample, BenchTaskMeta } from "@/lib/bench/types";
import type { ChatResult } from "@/lib/types";
import { simulateChat } from "@/lib/providers/simulator";
import { getProviderSpec } from "@/lib/providers/registry";
import { mulberry32 } from "@/lib/stats";
import { analyzeRun, arenaLeaderboard, computeTejScore, type ArenaVote } from "./index";

const CATS = [
  { name: "lookup", lo: 0.0 },
  { name: "arith", lo: 0.25 },
  { name: "logic", lo: 0.5 },
  { name: "proof", lo: 0.75 },
];

function makeTasks(perCat: number): BenchTaskMeta[] {
  const rand = mulberry32(123);
  return CATS.flatMap((c) =>
    Array.from({ length: perCat }, (_, i) => ({
      id: `${c.name}-${i}`,
      suiteId: "synthetic",
      category: c.name,
      difficulty: Math.min(1, c.lo + 0.25 * rand()),
    })),
  );
}

async function buildSimRun(perCat = 30, reps = 3): Promise<BenchRun> {
  const arms: BenchArm[] = [
    { id: "sim-oracle:default", providerId: "sim-oracle", label: "Oracle sim", color: "#111111" },
    { id: "sim-greedy:default", providerId: "sim-greedy", label: "Greedy sim", color: "#222222" },
    { id: "sim-oracle:sim/small", providerId: "sim-oracle", model: "sim/small", label: "sim/small", color: "#333333" },
    { id: "sim-oracle:sim/large", providerId: "sim-oracle", model: "sim/large", label: "sim/large", color: "#444444" },
  ];
  const tasks = makeTasks(perCat);
  const samples: BenchSample[] = [];
  for (const arm of arms) {
    const spec = getProviderSpec(arm.providerId)!;
    for (const t of tasks) {
      const expected = String(100 + t.id.length * 7);
      for (let rep = 0; rep < reps; rep++) {
        const result = await simulateChat(spec, {
          providerId: spec.id,
          model: arm.model,
          seed: rep,
          messages: [{ role: "user", content: `Task ${t.id}: compute it.` }],
          simulatorHint: { expected, difficulty: t.difficulty, category: t.category },
        });
        const correct = result.text.includes(`Answer: ${expected}`);
        samples.push({
          runId: "r1",
          taskId: t.id,
          suiteId: t.suiteId,
          category: t.category,
          difficulty: t.difficulty,
          armId: arm.id,
          providerId: arm.providerId,
          rep,
          result,
          grade: { score: correct ? 1 : 0, correct, extracted: result.text.split("Answer: ")[1] ?? null, detail: "" },
        });
      }
    }
  }
  return {
    id: "r1",
    name: "synthetic sim run",
    createdAt: 1_700_000_000_000,
    finishedAt: 1_700_000_060_000,
    config: { suiteIds: ["synthetic"], arms, repetitions: reps, concurrency: 4, seed: 42 },
    arms,
    tasks,
    samples,
  };
}

function assertFiniteOrNull(v: unknown, path = "report"): void {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`non-finite number at ${path}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => assertFiniteOrNull(x, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) assertFiniteOrNull(x, `${path}.${k}`);
}

function fakeResult(over: Partial<ChatResult> = {}): ChatResult {
  return {
    id: "x",
    providerId: "p",
    requestedModel: "m",
    servedModel: "gpt-4o-mini",
    servedProvider: null,
    ok: true,
    error: null,
    httpStatus: 200,
    text: "",
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    costUsd: 0.001,
    costSource: "reported",
    latencyMs: 500,
    ttftMs: 100,
    outputTps: 50,
    startedAt: 0,
    routingHeaders: {},
    ...over,
  };
}

describe("analyzeRun end-to-end on simulators", async () => {
  const run = await buildSimRun();
  const t0 = Date.now();
  const report = analyzeRun(run, { bootstrapIterations: 400, now: 0 });
  const elapsed = Date.now() - t0;

  const routing = (id: string) => report.routing.find((r) => r.armId === id)!;

  it("is JSON-safe (no NaN/Infinity) and deterministic", () => {
    assertFiniteOrNull(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(analyzeRun(run, { bootstrapIterations: 400, now: 0 })).toEqual(report);
    expect(elapsed).toBeLessThan(10000);
  });

  it("classifies routers and fixed baselines", () => {
    const kinds = Object.fromEntries(report.meta.arms.map((a) => [a.id, a.kind]));
    expect(kinds).toEqual({
      "sim-oracle:default": "router",
      "sim-greedy:default": "router",
      "sim-oracle:sim/small": "fixed",
      "sim-oracle:sim/large": "fixed",
    });
    expect(report.meta.nSamples).toBe(4 * 120 * 3);
    expect(report.meta.categories.map((c) => c.name)).toEqual(["arith", "logic", "lookup", "proof"]);
    expect(report.meta.durationMs).toBe(60000);
  });

  it("sim-oracle routes adaptively, sim-greedy does not", () => {
    const o = routing("sim-oracle:default");
    const g = routing("sim-greedy:default");
    expect(o.adaptivity).not.toBeNull();
    expect(g.adaptivity).not.toBeNull();
    expect(o.adaptivity!).toBeGreaterThan(3);
    expect(o.adaptivity!).toBeGreaterThan(g.adaptivity! + 2);
    expect(o.categoryMI!.nmi).toBeGreaterThan(g.categoryMI!.nmi);
    expect(o.categoryMI!.nmi).toBeGreaterThan(0.3);
    expect(o.categoryMI!.pValue).toBeLessThan(1e-6);
    expect(o.difficultyMI!.mi).toBeGreaterThan(g.difficultyMI!.mi);
    expect(o.easyHardJsd!.value).toBeGreaterThan(g.easyHardJsd!.value);
    expect(o.escalation!.curve.length).toBe(21);
    // fixed arms serve one model, so escalation is not estimable
    expect(routing("sim-oracle:sim/small").escalation).toBeNull();
    expect(routing("sim-oracle:sim/small").entropyBits).toBe(0);
  });

  it("populates the oracle / regret section", () => {
    const rq = report.routingQuality;
    expect(rq.available).toBe(true);
    expect(rq.baselineArmIds.sort()).toEqual(["sim-oracle:sim/large", "sim-oracle:sim/small"]);
    expect(rq.nTasks).toBe(120);
    expect(rq.oracle!.accuracy!).toBeGreaterThanOrEqual(rq.bestFixed!.accuracy!);
    expect(rq.bestFixed!.armId).toBe("sim-oracle:sim/large");
    expect(rq.cheapestFixed!.armId).toBe("sim-oracle:sim/small");
    expect(rq.routers.map((r) => r.armId).sort()).toEqual(["sim-greedy:default", "sim-oracle:default"]);
    const o = rq.routers.find((r) => r.armId === "sim-oracle:default")!;
    const g = rq.routers.find((r) => r.armId === "sim-greedy:default")!;
    expect(o.accuracyGapToOracle!).toBeGreaterThanOrEqual(0);
    expect(o.regretVsBestFixed.value!).toBeLessThan(g.regretVsBestFixed.value!);
    expect(o.costSavingsVsBestFixed!).toBeGreaterThan(0);
    expect(o.headroomCaptured!).toBeGreaterThan(g.headroomCaptured!);
    expect(o.gainOverBaselineHull).not.toBeNull();
  });

  it("compares each router with hindsight choices at its own spend", () => {
    const rq = report.routingQuality;
    for (const r of rq.routers) {
      for (const h of [r.fixedPerCategoryAtBudget!, r.perTaskAtBudget!]) {
        expect(h).not.toBeNull();
        expect(h.pool).toBe("router-models");
        expect(h.meanCostUsd!).toBeLessThanOrEqual(r.meanCostUsd! + 1e-9);
        expect(h.gainOverRouter!).toBeCloseTo(h.accuracy! - r.accuracy!, 6);
      }
      // Choosing per task can only do at least as well as one model per category.
      expect(r.perTaskAtBudget!.accuracy!).toBeGreaterThanOrEqual(r.fixedPerCategoryAtBudget!.accuracy! - 1e-9);
      expect(r.fixedPerCategoryAtBudget!.picks.map((p) => p.category)).toEqual(["arith", "logic", "lookup", "proof"]);
      for (const d of r.dominatedBy) {
        expect(d.accuracy).toBeGreaterThanOrEqual(r.accuracy!);
        expect(d.meanCostUsd).toBeLessThanOrEqual(r.meanCostUsd!);
      }
    }
  });

  it("per-arm stats are sane", () => {
    for (const a of report.perArm) {
      expect(a.n).toBe(360);
      expect(a.nTasks).toBe(120);
      expect(a.accuracy.lo!).toBeLessThanOrEqual(a.accuracy.value!);
      expect(a.accuracy.hi!).toBeGreaterThanOrEqual(a.accuracy.value!);
      expect(a.correctRate.value).toBeCloseTo(a.accuracy.value!, 10);
      expect(a.cost.nEstimated).toBe(360);
      expect(a.cost.nReported).toBe(0);
      expect(a.latencyEcdf.at(-1)!.y).toBe(1);
      expect(a.latencyMedianCI.lo!).toBeLessThanOrEqual(a.latency.p50!);
      expect(a.accuracyPosterior.effectiveN!).toBeLessThanOrEqual(360);
    }
    const large = report.perArm.find((a) => a.armId === "sim-oracle:sim/large")!;
    const small = report.perArm.find((a) => a.armId === "sim-oracle:sim/small")!;
    expect(large.accuracy.value!).toBeGreaterThan(small.accuracy.value!);
    expect(large.cost.meanUsd!).toBeGreaterThan(5 * small.cost.meanUsd!);
    expect(large.latency.p50!).toBeGreaterThan(small.latency.p50!);
  });

  it("difficulty curves slope downward, steeper for the small model", () => {
    const curve = (id: string) => report.difficultyCurves.find((c) => c.armId === id)!;
    expect(curve("sim-oracle:sim/small").slope!).toBeLessThan(0);
    expect(curve("sim-oracle:sim/small").slope!).toBeLessThan(curve("sim-oracle:sim/large").slope!);
    expect(report.perArmDifficultyBucket.filter((b) => b.armId === "sim-oracle:sim/small").length).toBe(4);
    expect(report.perArmCategory.length).toBe(16);
  });

  it("pairwise comparisons with multiplicity control", () => {
    expect(report.pairwise.length).toBe(6);
    for (const p of report.pairwise) {
      expect(p.nSharedTasks).toBe(120);
      expect(p.wins + p.ties + p.losses).toBe(120);
      expect(p.pAdjusted.mcnemarHolm!).toBeGreaterThanOrEqual(p.mcnemar.pExact! - 1e-15);
      expect(p.pAGreaterB!).toBeGreaterThanOrEqual(0);
      expect(p.pAGreaterB!).toBeLessThanOrEqual(1);
    }
    const ls = report.pairwise.find((p) => p.a === "sim-oracle:sim/small" && p.b === "sim-oracle:sim/large")!;
    expect(ls.meanDiff.value!).toBeLessThan(0);
    expect(ls.latency.cliffsDelta!).toBeLessThan(-0.5); // small is much faster
    expect(ls.latency.wilcoxonP!).toBeLessThan(1e-6);
  });

  it("ratings, cost-quality, TejScore, power, consistency", () => {
    expect(report.ratings.rows.length).toBe(4);
    expect(report.ratings.rows[0].armId).not.toBe("sim-oracle:sim/small");
    const small = report.ratings.rows.find((r) => r.armId === "sim-oracle:sim/small")!;
    expect(small.rank).toBe(4);
    expect(report.costQuality.frontier.length).toBeGreaterThanOrEqual(2);
    expect(report.costQuality.aiq!).toBeGreaterThan(0);
    expect(report.costQuality.aiq!).toBeLessThanOrEqual(1);
    expect(report.costQuality.baselineHull.length).toBeGreaterThanOrEqual(1);
    for (const r of report.tejScore.rows) {
      expect(r.score!).toBeGreaterThanOrEqual(0);
      expect(r.score!).toBeLessThanOrEqual(100);
    }
    const accOnly = computeTejScore(report, { accuracy: 1, cost: 0, latency: 0, reliability: 0 });
    const accs = report.perArm.map((a) => a.accuracy.value!);
    const [lo, hi] = [Math.min(...accs), Math.max(...accs)];
    for (const r of accOnly.rows) {
      const acc = report.perArm.find((a) => a.armId === r.armId)!.accuracy.value!;
      expect(r.score!).toBeCloseTo((100 * (acc - lo)) / (hi - lo), 10);
      expect(r.components.accuracyRaw).toBe(acc);
    }
    const comps = report.tejScore.rows.map((r) => r.components.accuracy!);
    expect(Math.max(...comps)).toBe(1);
    expect(Math.min(...comps)).toBe(0);
    expect(report.tejScore.rows.find((r) => r.armId === "sim-oracle:sim/large")!.components.cost).toBe(0);
    const costOnly = computeTejScore(report, { accuracy: 0, cost: 1, latency: 0, reliability: 0 });
    expect(costOnly.rows.find((r) => r.armId === "sim-oracle:sim/small")!.score).toBeCloseTo(100, 10);
    expect(report.power.nTasks).toBe(120);
    expect(report.power.mdePaired!).toBeGreaterThan(0);
    expect(report.power.tasksFor5pp.paired!).toBeGreaterThan(120);
    const c = report.consistency.find((x) => x.armId === "sim-oracle:sim/small")!;
    expect(c.maxReps).toBe(3);
    expect(c.routingAgreement).toBe(1);
    expect(c.correctAgreement!).toBeGreaterThan(0);
    expect(c.icc).not.toBeNull();
  });
});

describe("analyzeRun robustness", () => {
  const baseArm = (id: string, model?: string): BenchArm => ({ id, providerId: "openrouter", model, label: id, color: "#000" });
  const sample = (armId: string, taskId: string, rep: number, over: Partial<ChatResult>, correct: boolean, difficulty = 0.5): BenchSample => ({
    runId: "x",
    taskId,
    suiteId: "s",
    category: "c",
    difficulty,
    armId,
    providerId: "openrouter",
    rep,
    result: fakeResult(over),
    grade: { score: correct ? 1 : 0, correct, extracted: null, detail: "" },
  });
  const mkRun = (arms: BenchArm[], samples: BenchSample[]): BenchRun => ({
    id: "x",
    name: "x",
    createdAt: 0,
    finishedAt: null,
    config: { suiteIds: ["s"], arms, repetitions: 1, concurrency: 1 },
    arms,
    tasks: [...new Set(samples.map((s) => s.taskId))].map((id) => ({ id, suiteId: "s", category: "c", difficulty: samples.find((s) => s.taskId === id)!.difficulty })),
    samples,
  });

  it("empty run", () => {
    const r = analyzeRun(mkRun([], []), { now: 0 });
    assertFiniteOrNull(r);
    expect(r.perArm).toEqual([]);
    expect(r.pairwise).toEqual([]);
    expect(r.routingQuality.available).toBe(false);
  });

  it("single arm, one rep, missing cost and usage", () => {
    const arm = baseArm("a");
    const samples = Array.from({ length: 10 }, (_, i) =>
      sample("a", `t${i}`, 0, { costUsd: null, costSource: null, usage: { promptTokens: null, completionTokens: null, totalTokens: null }, servedModel: null }, i % 2 === 0, i / 10),
    );
    const r = analyzeRun(mkRun([arm], samples), { now: 0, bootstrapIterations: 100 });
    assertFiniteOrNull(r);
    expect(r.perArm[0].cost.meanUsd).toBeNull();
    expect(r.perArm[0].cost.costPerCorrect).toBeNull();
    expect(r.perArm[0].tokens.promptTotal).toBeNull();
    expect(r.pairwise).toEqual([]);
    expect(r.ratings.rows[0].rating).toBe(1000);
    expect(r.consistency[0].icc).toBeNull();
    expect(r.routing[0].escalation).toBeNull();
    expect(r.tejScore.rows[0].components.cost).toBeNull();
    expect(r.tejScore.rows[0].score).not.toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("arm with zero successful samples and an arm with no samples", () => {
    const arms = [baseArm("good"), baseArm("bad"), baseArm("empty")];
    const samples = [
      ...Array.from({ length: 6 }, (_, i) => sample("good", `t${i}`, 0, {}, true)),
      ...Array.from({ length: 6 }, (_, i) => sample("bad", `t${i}`, 0, { ok: false, error: "500", servedModel: null, costUsd: null, ttftMs: null, outputTps: null }, false)),
    ];
    const r = analyzeRun(mkRun(arms, samples), { now: 0, bootstrapIterations: 100 });
    assertFiniteOrNull(r);
    const bad = r.perArm.find((a) => a.armId === "bad")!;
    expect(bad.nOk).toBe(0);
    expect(bad.errorRate.value).toBe(1);
    expect(bad.accuracy.value).toBe(0);
    expect(bad.latency.n).toBe(0);
    expect(bad.latency.p50).toBeNull();
    const empty = r.perArm.find((a) => a.armId === "empty")!;
    expect(empty.n).toBe(0);
    expect(empty.accuracy.value).toBeNull();
    expect(r.tejScore.rows.find((x) => x.armId === "empty")!.score).toBeNull();
    const pair = r.pairwise.find((p) => p.a === "good" && p.b === "bad")!;
    expect(pair.mcnemar.b).toBe(6);
    expect(pair.mcnemar.pExact).toBeCloseTo(2 / 64, 12);
    expect(pair.latency.nPairs).toBe(0);
    expect(r.pairwise.find((p) => p.b === "empty")!.nSharedTasks).toBe(0);
    expect(r.ratings.rows.find((x) => x.armId === "empty")!.rating).toBeNull();
    expect(r.ratings.rows[0].armId).toBe("good");
    expect(r.routingQuality.available).toBe(false);
  });

  it("handles ~10k samples quickly", () => {
    const arms = Array.from({ length: 5 }, (_, i) => baseArm(`arm${i}`, i === 4 ? "gpt-4o" : undefined));
    const rand = mulberry32(1);
    const samples: BenchSample[] = [];
    for (const a of arms)
      for (let t = 0; t < 500; t++)
        for (let rep = 0; rep < 4; rep++) {
          const d = t / 500;
          samples.push(
            sample(a.id, `t${t}`, rep, { latencyMs: 200 + 800 * rand(), servedModel: rand() < d ? "gpt-4o" : "gpt-4o-mini", costUsd: 0.001 * (1 + rand()) }, rand() < 0.9 - 0.5 * d, d),
          );
        }
    const t0 = Date.now();
    const r = analyzeRun(mkRun(arms, samples), { now: 0 });
    const ms = Date.now() - t0;
    assertFiniteOrNull(r);
    expect(r.meta.nSamples).toBe(10000);
    expect(ms).toBeLessThan(15000);
  });
});

describe("arenaLeaderboard", () => {
  it("ranks a dominant arm first and handles ties / all-bad / invalid votes", () => {
    const votes: ArenaVote[] = [];
    const rand = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const u = rand();
      const winner = u < 0.6 ? "A" : u < 0.75 ? "B" : u < 0.85 ? "C" : u < 0.95 ? "tie" : "all-bad";
      votes.push({ id: `v${i}`, at: i, prompt: "p", armIds: ["A", "B", "C"], winner });
    }
    votes.push({ id: "bad", at: 0, prompt: "p", armIds: ["A", "B"], winner: "Z" });
    const lb = arenaLeaderboard(votes, { bootstrapIterations: 200 });
    assertFiniteOrNull(lb);
    expect(lb.invalidVotes).toBe(1);
    expect(lb.validVotes).toBe(300);
    expect(lb.arms[0].armId).toBe("A");
    expect(lb.arms[0].rank).toBe(1);
    const a = lb.arms[0];
    expect(a.votes).toBe(300);
    expect(a.wins + a.losses + a.ties + a.allBad).toBe(300);
    expect(a.lo!).toBeLessThan(a.rating!);
    expect(a.hi!).toBeGreaterThan(a.rating!);
    expect(lb.winProbability.matrix[0][1]).toBeGreaterThan(0.5);
    const h = lb.headToHead;
    const ia = h.armIds.indexOf("A");
    const ib = h.armIds.indexOf("B");
    expect(h.score[ia][ib] + h.score[ib][ia]).toBe(h.games[ia][ib]);
  });

  it("empty input", () => {
    const lb = arenaLeaderboard([]);
    expect(lb.arms).toEqual([]);
    expect(lb.totalVotes).toBe(0);
  });
});

