import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { main } from "./main";

const dir = mkdtempSync(path.join(tmpdir(), "tejrouter-main-"));
const file = (name: string) => path.join(dir, name);
const SIMS = ["--routers", "sim-greedy,sim-oracle"];

beforeAll(() => {
  process.env.TEJROUTER_RUNS_DIR = file("runs");
});
afterAll(() => {
  delete process.env.TEJROUTER_RUNS_DIR;
  rmSync(dir, { recursive: true, force: true });
});
afterEach(() => vi.restoreAllMocks());

/** Run the command and collect what it printed. */
async function tejrouter(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => void err.push(a.join(" ")));
  const code = await main(argv);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("tejrouter", () => {
  it("prints help with no command, and the version", async () => {
    const help = await tejrouter();
    expect(help.code).toBe(0);
    expect(help.out).toContain("tejrouter bench [options]");
    expect((await tejrouter("--version")).out).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("rejects what it does not know with exit code 2", async () => {
    expect(await tejrouter("frobnicate")).toMatchObject({ code: 2, err: expect.stringContaining('Unknown command "frobnicate"') });
    expect(await tejrouter("bench", "--frobnicate")).toMatchObject({ code: 2, err: expect.stringContaining("Unknown option '--frobnicate'") });
    expect(await tejrouter("bench", "--routers", "nope")).toMatchObject({ code: 2, err: expect.stringContaining('Unknown router "nope"') });
    expect(await tejrouter("bench", ...SIMS, "--preset", "huge")).toMatchObject({ code: 2, err: expect.stringContaining('Unknown preset "huge"') });
    expect(await tejrouter("bench", ...SIMS, "--reps", "0")).toMatchObject({ code: 2, err: expect.stringContaining("--reps must be a whole number of at least 1") });
    expect(await tejrouter("bench", ...SIMS, "--tasks", file("missing.jsonl"))).toMatchObject({ code: 2, err: expect.stringContaining("Could not read the tasks file") });
  });

  it("rejects a bad check before running anything", async () => {
    const bad = await tejrouter("bench", ...SIMS, "--fail-under", "abc");
    expect(bad).toMatchObject({ code: 2, err: expect.stringContaining("--fail-under must be a percentage") });
    expect(bad.err).not.toMatch(/calls/);
    expect(await tejrouter("bench", ...SIMS, "--max-drop", "5")).toMatchObject({ code: 2, err: expect.stringContaining("needs --baseline") });
  });

  it("lists the task sets and the routers", async () => {
    expect((await tejrouter("suites")).out).toMatch(/^Id\s+Tasks\s+Hard/);
    const routers = JSON.parse((await tejrouter("routers", "--json")).out) as { id: string; simulated: boolean }[];
    expect(routers.filter((r) => r.simulated).map((r) => r.id)).toEqual(expect.arrayContaining(["sim-greedy", "sim-oracle"]));
  });
});

describe("tejrouter bench", () => {
  const quick = ["bench", ...SIMS, "--suites", "trivial,math", "--max-tasks", "4", "--seed", "5"];

  it("says there is nothing to report before the first run", async () => {
    expect((await tejrouter("runs")).out).toMatch(/No saved runs yet/);
    expect(await tejrouter("report")).toMatchObject({ code: 2, err: expect.stringContaining("There are no saved runs yet") });
  });

  it("runs, prints the verdict, saves the run and writes the files asked for", async () => {
    const r = await tejrouter(...quick, "--md", file("report.md"), "--out", file("run.json"));
    expect(r.code).toBe(0);
    expect(r.err).toContain("8 tasks × 2 routers = 16 calls (seed 5)");
    expect(r.out).toMatch(/% correct/);
    expect(r.out).toContain("Practice: Budget");
    expect(r.out).toContain("Run saved to");
    expect(readFileSync(file("report.md"), "utf8")).toMatch(/^# Practice: Budget vs Practice: Smart, quick/);
    expect(JSON.parse(readFileSync(file("run.json"), "utf8")).samples).toHaveLength(16);
  });

  it("reports, lists and explains the saved run", async () => {
    const report = JSON.parse((await tejrouter("report", "--json")).out);
    expect(report.calls).toBe(16);
    expect(report.arms).toHaveLength(2);
    const runs = await tejrouter("runs");
    expect(runs.out).toContain(report.runId);
    expect((await tejrouter("report", report.runId)).code).toBe(0);
    expect((await tejrouter("failures")).out).toMatch(/got \d+ of 8 tasks wrong/);
    expect(await tejrouter("report", "no-such-run")).toMatchObject({ code: 2, err: expect.stringContaining('No run "no-such-run"') });
  });

  it("passes against itself as a baseline and reuses the baseline's seed", async () => {
    const r = await tejrouter("bench", ...SIMS, "--suites", "trivial,math", "--max-tasks", "4", "--baseline", file("run.json"));
    expect(r.code).toBe(0);
    expect(r.err).toContain("(seed 5)");
    expect(r.out).toContain("Since the baseline");
    expect(r.out).toContain("Check passed.");
  });

  it("exits 1 when a check fails", async () => {
    const r = await tejrouter("report", file("run.json"), "--fail-under", "101%");
    expect(r.code).toBe(2);
    const strict = await tejrouter("report", file("run.json"), "--fail-under", "100");
    expect(strict.code).toBe(1);
    expect(strict.out).toContain("Check failed.");
    expect((await tejrouter("compare", file("run.json"), file("run.json"))).code).toBe(0);
    expect((await tejrouter("compare", file("run.json"))).code).toBe(2);
  });

  it("runs your own tasks and names the run after the file", async () => {
    writeFileSync(file("mine.jsonl"), '{"prompt": "What is 2+2?", "expected": 4}\n{"prompt": "Capital of France?", "expected": "Paris"}\n');
    const r = await tejrouter("bench", ...SIMS, "--tasks", file("mine.jsonl"), "--json");
    expect(r.code).toBe(0);
    const summary = JSON.parse(r.out);
    expect(summary).toMatchObject({ name: "Practice: Budget vs Practice: Smart on mine.jsonl", tasks: 2, calls: 4 });
    writeFileSync(file("bad.jsonl"), '{"prompt": "no answer"}\n');
    expect(await tejrouter("bench", ...SIMS, "--tasks", file("bad.jsonl"))).toMatchObject({ code: 2, err: expect.stringContaining('line 1: needs an "expected" answer') });
  });

  it("refuses a file that is not a run", async () => {
    writeFileSync(file("other.json"), '{"hello": 1}');
    expect(await tejrouter("report", file("other.json"))).toMatchObject({ code: 2, err: expect.stringContaining("is not a saved run") });
  });
});
