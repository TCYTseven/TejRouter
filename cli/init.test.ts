import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseTasksFile } from "@/lib/bench/custom";
import { grade } from "@/lib/bench/graders";
import { PROVIDERS } from "@/lib/providers/registry";
import { ENV_FILE, STARTER_TASKS, TASKS_FILE, envTemplate, init } from "./init";

const dir = mkdtempSync(path.join(tmpdir(), "tejrouter-init-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the starter tasks", () => {
  const suite = parseTasksFile(STARTER_TASKS);

  it("load, with one task per kind of grading", () => {
    expect(suite.tasks.map((t) => t.grader.kind)).toEqual(["contains", "numeric", "json", "choice", "exact", "constraints"]);
  });

  it("are graded as their answers say", () => {
    const [capital, days, contact, plan, date, summary] = suite.tasks;
    expect(grade(capital, "Paris.").correct).toBe(true);
    expect(grade(days, "30 days").correct).toBe(true);
    expect(grade(contact, '{"name": "Ana", "age": 31}').correct).toBe(true);
    expect(grade(plan, "Answer: B").correct).toBe(true);
    expect(grade(plan, "Answer: C").correct).toBe(false);
    expect(grade(date, "2024-03-05").correct).toBe(true);
    expect(grade(summary, "It sends each prompt to the model best suited to it.").correct).toBe(true);
  });
});

describe("init", () => {
  it("lists every real router's key in the env file", () => {
    const env = envTemplate();
    for (const p of PROVIDERS.filter((x) => !x.simulated)) expect(env).toContain(`${p.keyEnvs[0]}=`);
    expect(env).not.toMatch(/npm run dev/);
  });

  it("writes the missing files and never overwrites one", async () => {
    writeFileSync(path.join(dir, ENV_FILE), "OPENROUTER_API_KEY=mine\n");
    expect(await init(dir)).toEqual({ written: [TASKS_FILE], kept: [ENV_FILE] });
    expect(readFileSync(path.join(dir, ENV_FILE), "utf8")).toBe("OPENROUTER_API_KEY=mine\n");
    expect(readFileSync(path.join(dir, TASKS_FILE), "utf8")).toBe(STARTER_TASKS);
    expect(await init(dir)).toEqual({ written: [], kept: [TASKS_FILE, ENV_FILE] });
  });
});
