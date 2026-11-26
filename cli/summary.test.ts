import { beforeAll, describe, expect, it } from "vitest";
import { analyzeRun } from "@/lib/analysis";
import { compareRuns } from "@/lib/analysis/advanced";
import { runBench } from "@/lib/bench/runner";
import type { BenchRun } from "@/lib/bench/types";
import { renderMarkdown, renderText, textTable } from "./render";
import { checkGate, summarize, type Summary } from "./summary";

const CONFIG = {
  suiteIds: ["trivial", "math", "reasoning"],
  arms: [{ providerId: "sim-oracle" }, { providerId: "sim-greedy", model: "sim/small" }, { providerId: "sim-greedy", model: "sim/large" }],
  repetitions: 1,
  concurrency: 8,
  seed: 11,
};

let run: BenchRun;
let summary: Summary;

beforeAll(async () => {
  run = await runBench(CONFIG, () => {});
  summary = summarize(run, analyzeRun(run, { bootstrapIterations: 200 }));
});

/** The same run with every answer from one arm marked wrong. */
function broken(armId: string): BenchRun {
  return {
    ...run,
    id: "broken",
    samples: run.samples.map((s) => (s.armId === armId ? { ...s, grade: { ...s.grade, score: 0, correct: false } } : s)),
  };
}

describe("summarize", () => {
  it("ranks arms by accuracy and keeps what each router served", () => {
    expect(summary.arms).toHaveLength(3);
    const acc = summary.arms.map((a) => a.accuracy!);
    expect([...acc].sort((a, b) => b - a)).toEqual(acc);
    const router = summary.arms.find((a) => a.id === "sim-oracle:default")!;
    expect(router.kind).toBe("router");
    expect(router.models.length).toBeGreaterThan(1);
    expect(router.models.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1);
    expect(summary.calls).toBe(run.samples.length);
  });

  it("writes the verdict as plain sentences", () => {
    expect(summary.verdict[0]).toContain(summary.arms[0].label);
    expect(summary.verdict[0]).toMatch(/% correct/);
    // Pinned models are present, so the single-model check has an answer.
    expect(summary.verdict.some((v) => /on both accuracy and cost/.test(v))).toBe(true);
  });
});

describe("checkGate", () => {
  it("passes with no checks and applies --fail-under to every arm", () => {
    expect(checkGate(summary, null, {})).toEqual({ passed: true, failures: [] });
    expect(checkGate(summary, null, { failUnder: 0 }).passed).toBe(true);
    const strict = checkGate(summary, null, { failUnder: 1.01 });
    expect(strict.passed).toBe(false);
    expect(strict.failures).toHaveLength(3);
  });

  it("passes when a run is compared with itself", () => {
    expect(checkGate(summary, compareRuns(run, run), {}).passed).toBe(true);
  });

  it("fails on a clear drop since the baseline, and names the router", () => {
    const now = broken("sim-oracle:default");
    const s = summarize(now, analyzeRun(now, { bootstrapIterations: 200 }));
    const gate = checkGate(s, compareRuns(now, run), {});
    expect(gate.passed).toBe(false);
    expect(gate.failures).toHaveLength(1);
    expect(gate.failures[0]).toMatch(/^Practice: Smart .* fell from .* to 0\.0% on \d+ shared tasks \(p = 0\.000\)\.$/);
    // An improvement is never a failure.
    expect(checkGate(summary, compareRuns(run, now), {}).passed).toBe(true);
  });

  it("fails when the runs cannot be compared", () => {
    const other = { ...run, samples: run.samples.map((s) => ({ ...s, taskId: `x/${s.taskId}` })) };
    const gate = checkGate(summary, compareRuns(run, other), {});
    expect(gate.failures[0]).toMatch(/no task in common/);
  });

  it("applies --max-drop to drops too small to be statistically clear", () => {
    const drift = compareRuns(run, run);
    drift.rows[0] = { ...drift.rows[0], accuracyThen: 0.9, accuracyNow: 0.86, delta: -0.04, pValue: 0.4 };
    expect(checkGate(summary, drift, {}).passed).toBe(true);
    expect(checkGate(summary, drift, { maxDrop: 0.05 }).passed).toBe(true);
    expect(checkGate(summary, drift, { maxDrop: 0.03 }).failures[0]).toMatch(/more than the allowed 3\.0 points/);
  });
});

describe("checkGate on cost", () => {
  it("fails when cost per answer rose past --max-cost-increase", () => {
    const drift = compareRuns(run, run);
    drift.rows[0] = { ...drift.rows[0], meanCostThen: 0.001, meanCostNow: 0.0013 };
    expect(checkGate(summary, drift, {}).passed).toBe(true);
    expect(checkGate(summary, drift, { maxCostIncrease: 0.5 }).passed).toBe(true);
    const gate = checkGate(summary, drift, { maxCostIncrease: 0.2 });
    expect(gate.failures).toHaveLength(1);
    expect(gate.failures[0]).toMatch(/now costs \$0\.0013 per answer, up 30% from \$0\.001, more than the allowed 20%\.$/);
  });

  it("ignores a cost that fell or is unknown", () => {
    const drift = compareRuns(run, run);
    drift.rows[0] = { ...drift.rows[0], meanCostThen: 0.002, meanCostNow: 0.001 };
    drift.rows[1] = { ...drift.rows[1], meanCostThen: null, meanCostNow: 0.5 };
    expect(checkGate(summary, drift, { maxCostIncrease: 0 }).passed).toBe(true);
  });
});

describe("rendering", () => {
  it("prints the verdict, a row per arm and the check result", () => {
    const now = broken("sim-oracle:default");
    const s = summarize(now, analyzeRun(now, { bootstrapIterations: 200 }));
    const drift = compareRuns(now, run);
    const text = renderText({ summary: s, drift, gate: checkGate(s, drift, {}) });
    expect(text).toContain(s.verdict[0]);
    for (const a of s.arms) expect(text).toContain(a.label);
    expect(text).toContain("Since the baseline");
    expect(text).toContain("Check failed.");
    expect(text).not.toMatch(/\x1b\[/);
  });

  it("writes Markdown tables with one row per arm", () => {
    const md = renderMarkdown({ summary, drift: null, gate: null });
    expect(md.startsWith(`# ${summary.name}`)).toBe(true);
    expect(md).toContain("## Accuracy by task type");
    expect(md).toContain("## Head to head");
    expect(md).not.toContain("Check ");
    const firstTable = md.split("\n").filter((l) => l.startsWith("| "));
    expect(firstTable.slice(2, 5).every((l, i) => l.startsWith(`| ${summary.arms[i].label} |`))).toBe(true);
  });

  it("pads table columns to a common width", () => {
    expect(textTable(["A", "Count"], [["long name", "7"], ["b", "12"]], ["left", "right"])).toBe(["A          Count", "long name      7", "b             12"].join("\n"));
  });
});
