import { describe, expect, it } from "vitest";
import { runBench } from "@/lib/bench/runner";
import { findMisses } from "./failures";

describe("findMisses", () => {
  it("lists each router's wrong tasks, the ones others got right first", async () => {
    const run = await runBench(
      { suiteIds: ["math", "reasoning"], arms: [{ providerId: "sim-greedy", model: "sim/small" }, { providerId: "sim-oracle" }], repetitions: 2, concurrency: 8, seed: 5 },
      () => {},
    );
    const all = findMisses(run);
    expect(all.map((a) => a.armId)).toEqual(run.arms.map((a) => a.id));
    for (const arm of all) {
      const wrongTasks = new Set(run.samples.filter((s) => s.armId === arm.armId && !s.grade.correct).map((s) => s.taskId));
      expect(arm.tasks).toBe(run.tasks.length);
      expect(new Set(arm.misses.map((m) => m.taskId))).toEqual(wrongTasks);
      expect(arm.misses.every((m) => m.others === 1 && m.why.length > 0 && !/\n/.test(m.reply))).toBe(true);
      const order = arm.misses.map((m) => m.othersRight);
      expect([...order].sort((a, b) => b - a)).toEqual(order);
    }
    expect(all[0].misses.length).toBeGreaterThan(0);
  });

  it("reports a failed call with its error", () => {
    const run = {
      arms: [{ id: "a:default", label: "A", providerId: "a", color: "#000" }],
      samples: [{ armId: "a:default", taskId: "t/1", category: "c", result: { ok: false, error: "HTTP 500", text: "", servedModel: null }, grade: { correct: false, detail: "request failed" } }],
    } as unknown as Parameters<typeof findMisses>[0];
    expect(findMisses(run)[0].misses[0]).toMatchObject({ taskId: "t/1", why: "call failed: HTTP 500", others: 0 });
  });
});
