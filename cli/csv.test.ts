import { describe, expect, it } from "vitest";
import { runBench } from "@/lib/bench/runner";
import { renderCsv } from "./csv";

const CONFIG = { suiteIds: ["trivial"], arms: [{ providerId: "sim-greedy" }, { providerId: "sim-oracle", model: "sim/large" }], repetitions: 2, concurrency: 4, seed: 2, maxTasksPerSuite: 3 };

describe("renderCsv", () => {
  it("writes a header and one line per call", async () => {
    const run = await runBench(CONFIG, () => {});
    const lines = renderCsv(run).trimEnd().split("\n");
    expect(lines[0]).toBe("router,pinned_model,task,task_set,category,difficulty,repetition,correct,score,served_model,latency_ms,first_token_ms,cost_usd,input_tokens,output_tokens,attempts,why,reply");
    expect(lines).toHaveLength(1 + 3 * 2 * 2);
    expect(lines.filter((l) => l.startsWith("Practice: Smart,sim/large,trivial/")).length).toBe(6);
    expect(lines.filter((l) => l.startsWith("Practice: Budget,,trivial/")).length).toBe(6);
    // Repetitions are numbered from 1.
    expect(new Set(lines.slice(1).map((l) => l.split(",")[6]))).toEqual(new Set(["1", "2"]));
  });

  it("quotes commas and quotes, flattens line breaks and defuses formulas", async () => {
    const run = await runBench({ ...CONFIG, repetitions: 1, maxTasksPerSuite: 2 }, () => {});
    run.samples[0].result.text = 'He said "hi", then\nleft.';
    run.samples[1].result.text = "=SUM(A1:A9)";
    run.samples[2].result = { ...run.samples[2].result, ok: false, error: "HTTP 429", text: "", costUsd: null };
    const lines = renderCsv(run).trimEnd().split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[1].endsWith(',"He said ""hi"", then left."')).toBe(true);
    expect(lines[2].endsWith(",'=SUM(A1:A9)")).toBe(true);
    expect(lines[3].endsWith(",HTTP 429,")).toBe(true);
  });
});
