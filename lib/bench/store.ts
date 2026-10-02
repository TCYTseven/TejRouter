import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeArms } from "./arms";
import type { BenchRun, RunArmSummary, RunSummary } from "./types";

/**
 * Runs are stored as JSON files under `data/runs/<id>.json` (relative to process.cwd()).
 * On read-only filesystems (e.g. serverless deployments) writes fail softly: the run is kept
 * in this process's memory and callers get `persisted: false`.
 */

/** Resolved per call so tests (and deployments) can point it elsewhere via TEJROUTER_RUNS_DIR. */
export function runsDir(): string {
  // The runs directory holds user data, not app code: keep it out of output file tracing.
  return path.resolve(/*turbopackIgnore: true*/ process.env.TEJROUTER_RUNS_DIR || path.join(process.cwd(), "data", "runs"));
}
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

const memory = new Map<string, BenchRun>();
const MEMORY_LIMIT = 20;
const summaryCache = new Map<string, { mtimeMs: number; summary: RunSummary }>();

export function isValidRunId(id: string): boolean {
  return ID_RE.test(id) && !id.includes("..");
}

function fileFor(id: string): string {
  if (!isValidRunId(id)) throw new Error(`Invalid run id "${id}"`);
  return path.join(runsDir(), `${id}.json`);
}

export interface SaveResult {
  persisted: boolean;
  path?: string;
  error?: string;
}

export async function saveRun(run: BenchRun): Promise<SaveResult> {
  summaryCache.delete(run.id);
  try {
    const file = fileFor(run.id);
    await fs.mkdir(runsDir(), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(run), "utf8");
    await fs.rename(tmp, file);
    memory.delete(run.id);
    return { persisted: true, path: path.relative(process.cwd(), file) };
  } catch (e) {
    // Keep it in this process so the UI can still open it (bounded to avoid unbounded growth).
    memory.set(run.id, run);
    if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value as string);
    return { persisted: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function loadRun(id: string): Promise<BenchRun | null> {
  if (!isValidRunId(id)) return null;
  try {
    const raw = await fs.readFile(fileFor(id), "utf8");
    return JSON.parse(raw) as BenchRun;
  } catch {
    return memory.get(id) ?? null;
  }
}

export async function deleteRun(id: string): Promise<boolean> {
  if (!isValidRunId(id)) return false;
  const inMemory = memory.delete(id);
  summaryCache.delete(id);
  try {
    await fs.unlink(fileFor(id));
    return true;
  } catch {
    return inMemory;
  }
}

/** Aggregate a run into a lightweight listing entry. */
export function summarizeRun(run: BenchRun): RunSummary {
  const by = new Map<string, { n: number; errors: number; correct: number; score: number; cost: number; costN: number; lat: number; latN: number }>();
  for (const s of run.samples ?? []) {
    const a = by.get(s.armId) ?? { n: 0, errors: 0, correct: 0, score: 0, cost: 0, costN: 0, lat: 0, latN: 0 };
    a.n++;
    if (!s.result?.ok) a.errors++;
    if (s.grade?.correct) a.correct++;
    a.score += s.grade?.score ?? 0;
    if (typeof s.result?.costUsd === "number") {
      a.cost += s.result.costUsd;
      a.costN++;
    }
    if (s.result?.ok && typeof s.result.latencyMs === "number") {
      a.lat += s.result.latencyMs;
      a.latN++;
    }
    by.set(s.armId, a);
  }
  const arms: RunArmSummary[] = (run.arms ?? []).map((arm) => {
    const a = by.get(arm.id);
    return {
      armId: arm.id,
      label: arm.label,
      color: arm.color,
      providerId: arm.providerId,
      ...(arm.model ? { model: arm.model } : {}),
      samples: a?.n ?? 0,
      errors: a?.errors ?? 0,
      accuracy: a && a.n ? a.correct / a.n : 0,
      meanScore: a && a.n ? a.score / a.n : 0,
      totalCostUsd: a && a.costN ? a.cost : null,
      meanLatencyMs: a && a.latN ? a.lat / a.latN : null,
    };
  });
  const reps = run.config?.repetitions ?? 1;
  return {
    id: run.id,
    name: run.name,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt ?? null,
    aborted: Boolean(run.aborted),
    suiteIds: run.config?.suiteIds ?? [],
    taskCount: run.tasks?.length ?? 0,
    sampleCount: run.samples?.length ?? 0,
    totalJobs: (run.tasks?.length ?? 0) * (run.arms?.length ?? 0) * reps,
    arms,
  };
}

/** All stored runs (disk + memory), newest first. */
export async function listRuns(): Promise<RunSummary[]> {
  const out = new Map<string, RunSummary>();
  let files: string[] = [];
  try {
    files = (await fs.readdir(runsDir())).filter((f) => f.endsWith(".json"));
  } catch {
    // directory missing or unreadable: fall back to memory only
  }
  await Promise.all(
    files.map(async (f) => {
      const id = f.slice(0, -5);
      if (!isValidRunId(id)) return;
      const file = path.join(runsDir(), f);
      try {
        const st = await fs.stat(file);
        const cached = summaryCache.get(id);
        if (cached && cached.mtimeMs === st.mtimeMs) {
          out.set(id, cached.summary);
          return;
        }
        const run = JSON.parse(await fs.readFile(file, "utf8")) as BenchRun;
        const summary = summarizeRun({ ...run, id });
        summaryCache.set(id, { mtimeMs: st.mtimeMs, summary });
        out.set(id, summary);
      } catch {
        // skip corrupt files
      }
    }),
  );
  for (const [id, run] of memory) if (!out.has(id)) out.set(id, summarizeRun(run));
  return [...out.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export class RunImportError extends Error {}

/**
 * Validate an uploaded BenchRun. Assigns a fresh id when missing, invalid or already taken,
 * so importing never overwrites an existing run.
 */
export async function importRun(input: unknown): Promise<{ run: BenchRun; save: SaveResult }> {
  if (!input || typeof input !== "object") throw new RunImportError("Body must be a BenchRun JSON object.");
  const r = input as Partial<BenchRun>;
  if (!Array.isArray(r.arms) || !Array.isArray(r.samples) || !Array.isArray(r.tasks)) {
    throw new RunImportError("A BenchRun needs arms, tasks and samples arrays.");
  }
  if (!r.config || typeof r.config !== "object" || !Array.isArray(r.config.suiteIds)) {
    throw new RunImportError("A BenchRun needs a config with suiteIds.");
  }
  for (const s of r.samples) {
    if (!s || typeof s !== "object" || typeof s.armId !== "string" || typeof s.taskId !== "string" || !s.result || !s.grade) {
      throw new RunImportError("Every sample needs armId, taskId, result and grade.");
    }
  }
  const arms = r.arms.every((a) => a && typeof a.id === "string" && typeof a.label === "string" && typeof a.color === "string")
    ? r.arms
    : normalizeArms(r.arms);
  let id = typeof r.id === "string" && isValidRunId(r.id) ? r.id : "";
  if (!id || (await loadRun(id))) id = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = typeof r.createdAt === "number" ? r.createdAt : Date.now();
  const run: BenchRun = {
    id,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 200) : `Imported run ${new Date(createdAt).toISOString().slice(0, 16)}`,
    createdAt,
    finishedAt: typeof r.finishedAt === "number" ? r.finishedAt : null,
    config: r.config,
    arms,
    tasks: r.tasks,
    samples: r.samples.map((s) => ({ ...s, runId: id })),
    ...(r.aborted ? { aborted: true } : {}),
    ...(typeof r.error === "string" ? { error: r.error } : {}),
  };
  const save = await saveRun(run);
  return { run, save };
}
