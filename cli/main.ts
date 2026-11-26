import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeRun } from "@/lib/analysis";
import { compareRuns } from "@/lib/analysis/advanced";
import { parseTasksFile, TasksFileError } from "@/lib/bench/custom";
import { BenchConfigError, planRun, runBench } from "@/lib/bench/runner";
import { listRuns, loadRun, saveRun } from "@/lib/bench/store";
import { SUITES } from "@/lib/bench/suites";
import { HARD_MIN_DIFFICULTY, type BenchRun, type BenchRunConfig, type BenchSuite } from "@/lib/bench/types";
import { callChat } from "@/lib/providers/client";
import { getProviderSpec } from "@/lib/providers/registry";
import { isConfigured, providerStatuses, resolveProvider } from "@/lib/providers/server";
import { ms, pct } from "@/components/report/format";
import pkg from "../package.json";
import { findMisses } from "./failures";
import { ENV_FILE, TASKS_FILE, init } from "./init";
import { renderMarkdown, renderText, style, textTable } from "./render";
import { checkGate, summarize, type Gate, type GateOptions } from "./summary";

/**
 * The tejrouter command. It runs the same engine, graders and statistics as the web app,
 * with keys from .env.local, and prints a verdict instead of opening a dashboard.
 * Exit codes: 0 done, 1 a check failed, 2 the command or its input was wrong.
 */

const HELP = `tejrouter ${pkg.version}: benchmark LLM routers from the terminal

Usage
  tejrouter init                    Write a starter prompts.jsonl and .env.local here
  tejrouter bench [options]         Run a benchmark and print which router to use
  tejrouter report [run]            Print the report for a saved run (default: latest)
  tejrouter compare <before> <now>  Compare two saved runs of the same routers
  tejrouter failures [run]          List the tasks each router got wrong (default: latest)
  tejrouter routers [--test]        List routers and whether each has a key
  tejrouter suites                  List the built-in task sets
  tejrouter runs                    List saved runs

Bench options
  --routers <list>     Routers to compare, comma separated. Add =model to pin a model:
                       openrouter,openrouter=openai/gpt-4o-mini
                       Default: every router with a key, or the two offline practice routers
  --tasks <file>       Your own prompts and expected answers (JSONL or JSON, see README)
  --suites <list>      Built-in task sets to run (see: tejrouter suites)
  --preset <name>      quick (10 tasks per set), standard (all), thorough (all, 3 times),
                       hard (only the hardest). Default: quick, or standard with --tasks
  --reps <n>           Times each task is sent to each router
  --max-tasks <n>      Cap on tasks per set (0 for no cap)
  --seed <n>           Seed for task sampling and order
  --concurrency <n>    Calls in flight at once (default 8)
  --max-tokens <n>     Reply length limit (default 1024)
  --temperature <t>    Sampling temperature (default 0)
  --name <text>        Name for the run

Checks (exit code 1 when one fails; work with bench, report and compare)
  --baseline <run>     Compare with an earlier run and fail on a clear accuracy drop
  --max-drop <points>  Also fail when accuracy fell by more than this many points
  --max-cost-increase <pct>
                       Also fail when cost per answer rose by more than this, e.g. 20
  --fail-under <pct>   Fail when any router's accuracy is below this, e.g. 80

Output
  --md <file>          Write the full report as Markdown
  --out <file>         Write the run (every call and answer) as JSON
  --json               Print the summary as JSON instead of text
  --limit <n>          failures: tasks to list per router (default 10, 0 for all)

A run is "latest", a run id from "tejrouter runs", or a path to a run's JSON file.
Keys are read from .env.local in the current directory (see .env.example).`;

class UsageError extends Error {}

const OPTIONS = {
  routers: { type: "string" },
  tasks: { type: "string" },
  suites: { type: "string" },
  preset: { type: "string" },
  reps: { type: "string" },
  "max-tasks": { type: "string" },
  seed: { type: "string" },
  concurrency: { type: "string" },
  "max-tokens": { type: "string" },
  temperature: { type: "string" },
  name: { type: "string" },
  baseline: { type: "string" },
  "max-drop": { type: "string" },
  "fail-under": { type: "string" },
  "max-cost-increase": { type: "string" },
  md: { type: "string" },
  out: { type: "string" },
  json: { type: "boolean" },
  limit: { type: "string" },
  test: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

type Flags = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>["values"];

const PRESETS: Record<string, { maxTasksPerSuite?: number; repetitions: number; minDifficulty?: number }> = {
  quick: { maxTasksPerSuite: 10, repetitions: 1 },
  standard: { repetitions: 1 },
  thorough: { repetitions: 3 },
  hard: { repetitions: 1, minDifficulty: HARD_MIN_DIFFICULTY },
};

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function number(flags: Flags, name: keyof Flags & string, opts: { int?: boolean; min?: number } = {}): number | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (typeof raw !== "string" || !raw.trim() || !Number.isFinite(n) || (opts.int && !Number.isInteger(n)) || (opts.min != null && n < opts.min)) {
    throw new UsageError(`--${name} must be ${opts.int ? "a whole number" : "a number"}${opts.min != null ? ` of at least ${opts.min}` : ""}, got "${String(raw)}".`);
  }
  return n;
}

/** "80", "80%" and "0.8" all mean 80%. */
function fraction(flags: Flags, name: "fail-under" | "max-drop"): number | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const n = Number(raw.trim().replace(/%$/, ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new UsageError(`--${name} must be a percentage from 0 to 100, got "${raw}".`);
  return n > 1 || raw.includes("%") ? n / 100 : n;
}

/** Load .env.local, then .env, without overriding variables that are already set. */
function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    try {
      process.loadEnvFile(f);
    } catch (e) {
      console.error(`Could not read ${f}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function resolveRun(ref: string): Promise<BenchRun> {
  if (ref === "latest") {
    const [newest] = await listRuns();
    if (!newest) throw new UsageError("There are no saved runs yet. Run `tejrouter bench` first.");
    ref = newest.id;
  }
  if (existsSync(ref)) {
    try {
      const run = JSON.parse(await fs.readFile(ref, "utf8")) as BenchRun;
      if (!Array.isArray(run.samples) || !Array.isArray(run.arms)) throw new Error("it has no arms or samples");
      return run;
    } catch (e) {
      throw new UsageError(`${ref} is not a saved run: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const run = await loadRun(ref);
  if (!run) throw new UsageError(`No run "${ref}". Use "latest", an id from \`tejrouter runs\`, or a path to a run's JSON file.`);
  return run;
}

function parseArms(flags: Flags): BenchRunConfig["arms"] {
  const statuses = providerStatuses();
  const ids = statuses.map((p) => p.id).join(", ");
  if (!flags.routers) {
    const real = statuses.filter((p) => p.configured && !p.simulated);
    const pick = real.length ? real : statuses.filter((p) => p.simulated);
    if (!real.length) console.error("No router has a key yet, so this run uses the two offline practice routers. Add keys to .env.local to test real ones.\n");
    return pick.map((p) => ({ providerId: p.id }));
  }
  return list(flags.routers).map((entry) => {
    const eq = entry.indexOf("=");
    const providerId = eq < 0 ? entry : entry.slice(0, eq).trim();
    const model = eq < 0 ? "" : entry.slice(eq + 1).trim();
    const r = resolveProvider(providerId);
    if (!r) throw new UsageError(`Unknown router "${providerId}". Routers: ${ids}.`);
    if (!isConfigured(r)) {
      const need = [!r.apiKey && r.spec.keyEnvs[0], !r.baseUrl && r.spec.baseUrlEnv].filter(Boolean).join(" and ");
      throw new UsageError(`${r.spec.name} is not set up: add ${need} to .env.local.`);
    }
    if (!model && !r.defaultModel) throw new UsageError(`${r.spec.name} has no default model: set ${r.spec.modelEnv} or use ${providerId}=<model>.`);
    return { providerId, ...(model ? { model } : {}) };
  });
}

function gateOptions(flags: Flags, hasBaseline: boolean): GateOptions {
  // A cost can more than double, so this one is always read as a percentage: 150 is 150%.
  const rise = number(flags, "max-cost-increase", { min: 0 });
  for (const name of ["max-drop", "max-cost-increase"] as const) {
    if (flags[name] !== undefined && !hasBaseline) throw new UsageError(`--${name} compares with an earlier run, so it needs --baseline <run>.`);
  }
  return { failUnder: fraction(flags, "fail-under"), maxDrop: fraction(flags, "max-drop"), ...(rise != null ? { maxCostIncrease: rise / 100 } : {}) };
}

/** Analyse a run, apply the checks, print and write the outputs. Returns the exit code. */
async function finish(run: BenchRun, flags: Flags, baseline: BenchRun | null, savedTo?: string): Promise<number> {
  const summary = summarize(run, analyzeRun(run));
  const drift = baseline ? compareRuns(run, baseline) : null;
  const opts = gateOptions(flags, Boolean(baseline));
  const gate: Gate | null = baseline || opts.failUnder != null ? checkGate(summary, drift, opts) : null;

  if (flags.md) await fs.writeFile(flags.md, renderMarkdown({ summary, drift, gate }), "utf8");
  if (flags.out) await fs.writeFile(flags.out, JSON.stringify(run), "utf8");

  if (flags.json) {
    console.log(JSON.stringify({ ...summary, drift, gate, savedTo: savedTo ?? null }, null, 2));
  } else {
    console.log(renderText({ summary, drift, gate }, style(colorOn(process.stdout))));
    const files = [savedTo && `Run saved to ${savedTo}`, flags.md && `Report written to ${flags.md}`, flags.out && `Run written to ${flags.out}`].filter(Boolean);
    if (files.length) console.log(`\n${files.join("\n")}`);
  }
  return gate && !gate.passed ? 1 : 0;
}

function colorOn(stream: NodeJS.WriteStream): boolean {
  return Boolean(stream.isTTY) && !process.env.NO_COLOR;
}

/** Progress on stderr: one line redrawn in a terminal, a line every tenth of the run elsewhere. */
function progressReporter(total: number) {
  const tty = Boolean(process.stderr.isTTY);
  const started = Date.now();
  let failed = 0;
  let lastTenth = 0;
  return {
    sample(completed: number, ok: boolean) {
      if (!ok) failed++;
      const left = completed > 0 ? ((Date.now() - started) / completed) * (total - completed) : 0;
      const text = `${completed}/${total} calls${failed ? `, ${failed} failed` : ""}${completed < total ? `, about ${ms(left)} left` : ""}`;
      if (tty) {
        const width = 24;
        const filled = Math.round((completed / total) * width);
        process.stderr.write(`\r\x1b[2K[${"#".repeat(filled)}${".".repeat(width - filled)}] ${text}`);
      } else {
        const tenth = Math.floor((completed / total) * 10);
        if (tenth > lastTenth || completed === total) console.error(text);
        lastTenth = tenth;
      }
    },
    done() {
      if (tty) process.stderr.write("\r\x1b[2K");
    },
  };
}

async function bench(flags: Flags): Promise<number> {
  gateOptions(flags, Boolean(flags.baseline)); // reject a bad check before spending anything
  let custom: BenchSuite | null = null;
  if (flags.tasks) {
    let text: string;
    try {
      text = await fs.readFile(flags.tasks, "utf8");
    } catch {
      throw new UsageError(`Could not read the tasks file ${flags.tasks}.`);
    }
    custom = parseTasksFile(text, path.basename(flags.tasks));
  }

  const presetName = flags.preset ?? (custom ? "standard" : "quick");
  const preset = PRESETS[presetName];
  if (!preset) throw new UsageError(`Unknown preset "${presetName}". Presets: ${Object.keys(PRESETS).join(", ")}.`);
  const builtIn = flags.suites ? list(flags.suites) : custom ? [] : SUITES.filter((s) => !s.optional).map((s) => s.id);
  const maxTasks = number(flags, "max-tasks", { int: true, min: 0 }) ?? preset.maxTasksPerSuite;

  // Load the baseline before spending anything, and reuse its seed so both runs sample the same tasks.
  const baseline = flags.baseline ? await resolveRun(flags.baseline) : null;
  const seed = number(flags, "seed", { int: true }) ?? baseline?.config.seed;

  const arms = parseArms(flags);
  const config: BenchRunConfig = {
    suiteIds: [...(custom ? [custom.id] : []), ...builtIn],
    arms,
    repetitions: number(flags, "reps", { int: true, min: 1 }) ?? preset.repetitions,
    concurrency: number(flags, "concurrency", { int: true, min: 1 }) ?? 8,
    temperature: number(flags, "temperature", { min: 0 }) ?? 0,
    maxTokens: number(flags, "max-tokens", { int: true, min: 1 }) ?? 1024,
    ...(seed != null ? { seed } : {}),
    ...(maxTasks ? { maxTasksPerSuite: maxTasks } : {}),
    ...(preset.minDifficulty ? { minDifficulty: preset.minDifficulty } : {}),
    name: flags.name ?? "",
  };
  const extra = custom ? [custom] : [];
  // Resolve defaults (notably the seed) once, so the stored config reproduces the run.
  const plan = planRun(config, extra);
  if (!flags.name) {
    // "OpenRouter vs Requesty, quick", or "... on prompts.jsonl" for your own tasks.
    const names = [...new Set(plan.arms.map((a) => (a.model ? a.label : a.label.split(" · ")[0])))];
    const who = names.length <= 3 ? names.join(" vs ") : `${names.length} routers`;
    plan.config.name = custom && !builtIn.length ? `${who} on ${custom.name}` : `${who}, ${presetName}`;
  }
  const reps = plan.config.repetitions;
  console.error(
    `${plan.tasks.length} tasks × ${plan.arms.length} router${plan.arms.length === 1 ? "" : "s"}${reps > 1 ? ` × ${reps} repetitions` : ""} = ${plan.totalJobs} calls (seed ${plan.config.seed})`,
  );

  const abort = new AbortController();
  const onInterrupt = () => {
    if (abort.signal.aborted) process.exit(130);
    console.error("\nStopping: waiting for calls in flight, then saving what finished. Press Ctrl-C again to quit now.");
    abort.abort();
  };
  process.on("SIGINT", onInterrupt);

  const progress = progressReporter(plan.totalJobs);
  const run = await runBench(
    plan.config,
    (e) => {
      if (e.type === "sample") progress.sample(e.completed, e.sample.result.ok);
      else if (e.type === "error") console.error(`\n${e.message}`);
    },
    abort.signal,
    { suites: extra },
  );
  progress.done();
  process.off("SIGINT", onInterrupt);

  const saved = await saveRun(run);
  if (!saved.persisted) console.error(`The run could not be saved: ${saved.error}`);
  if (!run.samples.length) {
    console.error("No call finished, so there is nothing to report.");
    return 130;
  }
  const code = await finish(run, flags, baseline, saved.path);
  return run.aborted && abort.signal.aborted ? 130 : code;
}

async function report(flags: Flags, positionals: string[]): Promise<number> {
  const run = await resolveRun(positionals[0] ?? "latest");
  const baseline = flags.baseline ? await resolveRun(flags.baseline) : null;
  return finish(run, flags, baseline);
}

async function compare(flags: Flags, positionals: string[]): Promise<number> {
  if (positionals.length !== 2) throw new UsageError("compare needs two runs: tejrouter compare <before> <now>");
  const [before, now] = await Promise.all(positionals.map(resolveRun));
  return finish(now, flags, before);
}

async function failures(flags: Flags, positionals: string[]): Promise<number> {
  const run = await resolveRun(positionals[0] ?? "latest");
  const limit = number(flags, "limit", { int: true, min: 0 }) ?? 10;
  const all = findMisses(run);
  if (flags.json) {
    console.log(JSON.stringify(all, null, 2));
    return 0;
  }
  const st = style(colorOn(process.stdout));
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  all.forEach((arm, i) => {
    if (i) console.log("");
    console.log(st.bold(`${arm.label} got ${arm.misses.length} of ${arm.tasks} tasks wrong`));
    const shown = limit ? arm.misses.slice(0, limit) : arm.misses;
    if (!shown.length) return;
    const many = run.arms.length > 1;
    console.log(
      textTable(
        ["Task", ...(many ? ["Others right"] : []), "Model", "Why", "Reply"],
        shown.map((m) => [m.taskId, ...(many ? [`${m.othersRight} of ${m.others}`] : []), m.model ?? "", clip(m.why, 60), clip(m.reply, 60)]),
      ),
    );
    if (shown.length < arm.misses.length) console.log(st.dim(`${arm.misses.length - shown.length} more. Use --limit 0 to list every one.`));
  });
  return 0;
}

async function initFiles(): Promise<number> {
  const { written, kept } = await init();
  for (const f of written) console.log(`Wrote ${f}`);
  for (const f of kept) console.log(`Kept your ${f}`);
  console.log(
    [
      "",
      "Next:",
      `  1. Put a key for each router you use in ${ENV_FILE} (keep that file out of git).`,
      `  2. Replace the examples in ${TASKS_FILE} with your own prompts and expected answers.`,
      `  3. tejrouter bench --tasks ${TASKS_FILE}`,
      "",
      "With no keys, step 3 runs on the two offline practice routers.",
    ].join("\n"),
  );
  return 0;
}

async function routers(flags: Flags): Promise<number> {
  const statuses = providerStatuses();
  const state = (p: (typeof statuses)[number]) =>
    p.simulated ? "offline practice router" : p.configured ? `ready (${p.keySource})` : `needs ${[!p.keyHint && p.keyEnvs[0], !p.effectiveBaseUrl && p.baseUrlEnv].filter(Boolean).join(" and ")}`;
  if (flags.json && !flags.test) {
    console.log(JSON.stringify(statuses.map((p) => ({ id: p.id, name: p.name, configured: p.configured, simulated: Boolean(p.simulated), defaultModel: p.defaultModel })), null, 2));
    return 0;
  }
  console.log(textTable(["Id", "Router", "Status", "Default model"], statuses.map((p) => [p.id, p.name, state(p), p.defaultModel || "(set a model)"])));
  if (!flags.test) return 0;

  const ready = statuses.filter((p) => p.configured && !p.simulated);
  if (!ready.length) {
    console.log("\nNo router has a key to test. Add keys to .env.local.");
    return 0;
  }
  console.log("\nSending one short prompt to each router with a key:");
  const results = await Promise.all(
    ready.map(async (p) => ({
      p,
      r: await callChat({ providerId: p.id, messages: [{ role: "user", content: "Reply with the single word OK." }], maxTokens: 32, temperature: 0 }),
    })),
  );
  for (const { p, r } of results) {
    console.log(r.ok ? `  ${p.name}: ok, answered by ${r.servedModel ?? "an unnamed model"} in ${ms(r.latencyMs)}` : `  ${p.name}: failed, ${r.error}`);
  }
  return results.every((x) => x.r.ok) ? 0 : 1;
}

function suites(): number {
  console.log(
    textTable(
      ["Id", "Tasks", "Hard", "", "What it tests"],
      SUITES.map((s) => [
        s.id,
        String(s.tasks.length),
        String(s.tasks.filter((t) => t.difficulty >= HARD_MIN_DIFFICULTY).length),
        s.optional ? "opt-in" : "",
        s.description.length > 90 ? `${s.description.slice(0, 89)}…` : s.description,
      ]),
      ["left", "right", "right"],
    ),
  );
  return 0;
}

async function runs(flags: Flags): Promise<number> {
  const all = await listRuns();
  if (flags.json) {
    console.log(JSON.stringify(all, null, 2));
    return 0;
  }
  if (!all.length) {
    console.log("No saved runs yet. Run `tejrouter bench` first.");
    return 0;
  }
  console.log(
    textTable(
      ["Id", "When (UTC)", "Tasks", "Routers and accuracy"],
      all.map((r) => [
        r.id,
        new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " "),
        String(r.taskCount),
        r.arms.map((a) => `${getProviderSpec(a.providerId)?.name ?? a.providerId}${a.model ? ` ${a.model}` : ""} ${pct(a.accuracy, 0)}`).join(", "),
      ]),
      ["left", "left", "right"],
    ),
  );
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (e) {
    // parseArgs appends advice about positional arguments; the first sentence is the error.
    console.error(`${(e instanceof Error ? e.message : String(e)).split(". ")[0].replace(/\.$/, "")}. Run \`tejrouter --help\` for the options.`);
    return 2;
  }
  const { values: flags, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (flags.version) {
    console.log(pkg.version);
    return 0;
  }
  if (flags.help || !command || command === "help") {
    console.log(HELP);
    return 0;
  }
  loadEnv();
  try {
    switch (command) {
      case "init":
        return await initFiles();
      case "bench":
        return await bench(flags);
      case "report":
        return await report(flags, rest);
      case "compare":
        return await compare(flags, rest);
      case "failures":
        return await failures(flags, rest);
      case "routers":
        return await routers(flags);
      case "suites":
        return suites();
      case "runs":
        return await runs(flags);
      default:
        throw new UsageError(`Unknown command "${command}". Run \`tejrouter --help\`.`);
    }
  } catch (e) {
    if (e instanceof UsageError || e instanceof BenchConfigError || e instanceof TasksFileError) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
}
