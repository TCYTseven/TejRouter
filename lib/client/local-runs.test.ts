import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BenchRun } from "@/lib/bench/types";
import { deleteLocalRun, hasLocalRun, listLocalRuns, loadLocalRun, mergeRunSummaries, saveLocalRun } from "./local-runs";

function run(id: string, createdAt: number, samples = 1): BenchRun {
  return {
    id,
    name: id,
    createdAt,
    finishedAt: createdAt + 1,
    config: { suiteIds: ["s"], arms: [] },
    arms: [{ id: "a", label: "A", color: "#000", providerId: "p" }],
    tasks: [],
    samples: Array.from({ length: samples }, () => ({ runId: id, armId: "a", taskId: "t", result: { ok: true }, grade: { correct: true, score: 1 } })),
  } as unknown as BenchRun;
}

let store: Map<string, string>;
let quota = Infinity;

describe("local runs", () => {
  beforeEach(() => {
    store = new Map();
    quota = Infinity;
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          const used = [...store].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0);
          if (used + v.length > quota) throw new Error("QuotaExceededError");
          store.set(k, v);
        },
        removeItem: (k: string) => void store.delete(k),
      },
      addEventListener() {},
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("saves, lists newest first, loads and deletes", () => {
    expect(saveLocalRun(run("old", 1))).toBe(true);
    expect(saveLocalRun(run("new", 2))).toBe(true);
    expect(listLocalRuns().map((r) => r.id)).toEqual(["new", "old"]);
    expect(loadLocalRun("old")?.id).toBe("old");
    expect(hasLocalRun("new")).toBe(true);
    expect(deleteLocalRun("new")).toBe(true);
    expect(loadLocalRun("new")).toBeNull();
    expect(listLocalRuns().map((r) => r.id)).toEqual(["old"]);
  });

  it("never replaces a fuller copy with a shorter one", () => {
    saveLocalRun(run("r", 1, 5));
    saveLocalRun(run("r", 1, 2));
    expect(loadLocalRun("r")?.samples).toHaveLength(5);
  });

  it("evicts the oldest run when storage is full", () => {
    const one = JSON.stringify(run("a", 1, 20)).length;
    quota = one * 2 + 2000;
    saveLocalRun(run("a", 1, 20));
    saveLocalRun(run("b", 2, 20));
    expect(saveLocalRun(run("c", 3, 20))).toBe(true);
    expect(loadLocalRun("a")).toBeNull();
    expect(listLocalRuns().map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("merges listings, preferring the server's entry", () => {
    const merged = mergeRunSummaries([{ id: "x", name: "server", createdAt: 1 } as never], [
      { id: "x", name: "local", createdAt: 1 } as never,
      { id: "y", name: "local", createdAt: 2 } as never,
    ]);
    expect(merged.map((r) => `${r.id}:${r.name}`)).toEqual(["y:local", "x:server"]);
  });
});
