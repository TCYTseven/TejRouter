import { describe, expect, it } from "vitest";
import { CUSTOM_SUITE_ID, parseTasksFile, TasksFileError } from "./custom";
import { grade } from "./graders";
import { planRun, runBench } from "./runner";

const JSONL = `
{"prompt": "What is the capital of France?", "expected": "Paris"}
# a comment
{"id": "refund days", "system": "You are a support agent.", "prompt": "How many days?", "expected": 30, "category": "policy", "difficulty": 0.2}
{"question": "Is 17 prime?", "answer": "yes", "grader": "exact"}
{"prompt": "Largest of A) 3 B) 9", "expected": "B", "choices": ["A", "B"]}
{"prompt": "Extract the fields.", "expected": {"name": "Ana", "age": 31}}
{"prompt": "Give a date.", "expected": "2024-03-0?5", "grader": "regex"}
{"messages": [{"role": "user", "content": "Say hi."}], "grader": {"kind": "constraints", "checks": [{"type": "maxWords", "value": 3}]}}
`;

describe("parseTasksFile", () => {
  const suite = parseTasksFile(JSONL, "mine.jsonl");
  const [capital, refund, prime, choice, json, regex, constraints] = suite.tasks;

  it("reads JSONL, skipping blank lines and comments", () => {
    expect(suite.id).toBe(CUSTOM_SUITE_ID);
    expect(suite.name).toBe("mine.jsonl");
    expect(suite.tasks).toHaveLength(7);
    expect(suite.tasks.every((t) => t.suiteId === CUSTOM_SUITE_ID && t.id.startsWith("custom/"))).toBe(true);
  });

  it("fills in ids, category and difficulty", () => {
    expect(capital).toMatchObject({ id: "custom/1", category: "custom", difficulty: 0.5 });
    expect(refund).toMatchObject({ id: "custom/refund-days", category: "policy", difficulty: 0.2 });
    expect(refund.messages).toEqual([
      { role: "system", content: "You are a support agent." },
      { role: "user", content: "How many days?" },
    ]);
  });

  it("picks a grader from the answer when none is named", () => {
    expect(capital.grader).toEqual({ kind: "contains", all: ["Paris"] });
    expect(refund.grader).toEqual({ kind: "numeric" });
    expect(choice.grader).toEqual({ kind: "choice", choices: ["A", "B"] });
    expect(json.grader).toEqual({ kind: "json", requiredKeys: [], expectedValues: { name: "Ana", age: 31 } });
  });

  it("accepts question/answer field names, grader names and grader objects", () => {
    expect(prime.messages[0].content).toBe("Is 17 prime?");
    expect(prime.grader).toEqual({ kind: "exact" });
    expect(regex.grader).toEqual({ kind: "regex", pattern: "2024-03-0?5", flags: "i" });
    expect(constraints.grader.kind).toBe("constraints");
  });

  it("produces tasks the graders score as expected", () => {
    expect(grade(capital, "The capital of France is Paris.").correct).toBe(true);
    expect(grade(capital, "I think it is Lyon.").correct).toBe(false);
    expect(grade(refund, "Customers have 30 days.").correct).toBe(true);
    expect(grade(json, '{"name": "Ana", "age": 31}').correct).toBe(true);
    expect(grade(json, '{"name": "Ana", "age": 13}').correct).toBe(false);
    expect(grade(regex, "2024-03-05").correct).toBe(true);
    expect(grade(constraints, "Hi there").correct).toBe(true);
  });

  it("reads a JSON array and a { tasks } object", () => {
    const tasks = [{ prompt: "2+2?", expected: 4 }];
    expect(parseTasksFile(JSON.stringify(tasks)).tasks).toHaveLength(1);
    expect(parseTasksFile(JSON.stringify({ tasks })).tasks[0].expected).toBe("4");
  });

  it("names the line that is wrong", () => {
    const bad = (text: string) => {
      try {
        parseTasksFile(text);
      } catch (e) {
        expect(e).toBeInstanceOf(TasksFileError);
        return (e as Error).message;
      }
      throw new Error("expected a TasksFileError");
    };
    expect(bad("")).toMatch(/empty/);
    expect(bad('{"prompt": "a", "expected": "b"}\n{oops')).toMatch(/^line 2 is not valid JSON/);
    expect(bad('{"expected": "b"}')).toMatch(/^line 1: needs a "prompt"/);
    expect(bad('{"prompt": "a"}')).toMatch(/^line 1: needs an "expected" answer/);
    expect(bad('{"prompt": "a", "expected": "(", "grader": "regex"}')).toMatch(/not a valid regular expression/);
    expect(bad('{"prompt": "a", "expected": "b", "grader": "vibes"}')).toMatch(/unknown grader "vibes"/);
    expect(bad('{"prompt": "a", "expected": "b", "grader": {"kind": "vibes"}}')).toMatch(/unknown grader kind/);
    expect(bad('{"id": "x", "prompt": "a", "expected": "b"}\n{"id": "x", "prompt": "a", "expected": "b"}')).toMatch(/^line 2: the id "x" is used twice/);
  });
});

describe("running your own tasks", () => {
  const suite = parseTasksFile(JSONL);
  const config = { suiteIds: [CUSTOM_SUITE_ID], arms: [{ providerId: "sim-greedy" }, { providerId: "sim-oracle" }], repetitions: 1, concurrency: 4, seed: 3 };

  it("is rejected unless the task set is passed in", () => {
    expect(() => planRun(config)).toThrow(/Unknown suite "custom"/);
    expect(planRun(config, [suite]).tasks).toHaveLength(7);
  });

  it("runs through the engine", async () => {
    const run = await runBench(config, () => {}, undefined, { suites: [suite] });
    expect(run.samples).toHaveLength(14);
    expect(run.aborted).toBeUndefined();
    expect(run.tasks.map((t) => t.id)).toContain("custom/refund-days");
  });
});
