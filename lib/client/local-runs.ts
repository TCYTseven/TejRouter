import { summarizeRun } from "@/lib/bench/summary";
import type { BenchRun, RunSummary } from "@/lib/bench/types";
import { readStorage, removeStorage, writeStorage } from "./storage";

/**
 * A copy of every run this browser finished, imported or opened, kept in localStorage.
 *
 * The server stores runs as files, but on a serverless deployment (Vercel) the filesystem is
 * read-only and the run only lives in one instance's memory, so the report page or the Results
 * list can land on another instance and find nothing. The browser copy is the fallback.
 *
 * Layout: one key per run (`tejrouter:run:<id>`) plus an index of summaries, newest first.
 * When storage is full the oldest runs are evicted until the new one fits.
 */

const INDEX_KEY = "tejrouter:runs-index:v1";
const runKey = (id: string) => `tejrouter:run:${id}`;
const MAX_RUNS = 50;

const isSummaryList = (v: unknown): v is RunSummary[] =>
  Array.isArray(v) && v.every((s) => s && typeof s === "object" && typeof (s as RunSummary).id === "string");

const isRun = (v: unknown): v is BenchRun =>
  !!v &&
  typeof v === "object" &&
  typeof (v as BenchRun).id === "string" &&
  Array.isArray((v as BenchRun).arms) &&
  Array.isArray((v as BenchRun).tasks) &&
  Array.isArray((v as BenchRun).samples);

const EMPTY: RunSummary[] = [];

function readIndex(): RunSummary[] {
  return readStorage(INDEX_KEY, EMPTY, isSummaryList);
}

/** Summaries of the runs kept in this browser, newest first. */
export function listLocalRuns(): RunSummary[] {
  return [...readIndex()].sort((a, b) => b.createdAt - a.createdAt);
}

export function loadLocalRun(id: string): BenchRun | null {
  const run = readStorage<unknown>(runKey(id), null);
  return isRun(run) && run.id === id ? run : null;
}

export function hasLocalRun(id: string): boolean {
  return readIndex().some((s) => s.id === id) && loadLocalRun(id) !== null;
}

/**
 * Keep a copy of `run`. A copy with fewer answers never replaces a fuller one (the server's
 * copy of a stopped run includes calls that finished after the stop). Returns false when the
 * run could not be stored even after evicting every older run.
 */
export function saveLocalRun(run: BenchRun): boolean {
  if (typeof window === "undefined" || !isRun(run)) return false;
  const existing = loadLocalRun(run.id);
  if (existing && existing.samples.length > run.samples.length) return true;

  let index = readIndex().filter((s) => s.id !== run.id);
  const summary = summarizeRun(run);
  for (;;) {
    if (writeStorage(runKey(run.id), run)) break;
    // Full: drop the oldest run and try again.
    const oldest = [...index].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) return false;
    removeStorage(runKey(oldest.id));
    index = index.filter((s) => s.id !== oldest.id);
    writeStorage(INDEX_KEY, index);
  }
  index = [summary, ...index].sort((a, b) => b.createdAt - a.createdAt);
  for (const dropped of index.slice(MAX_RUNS)) removeStorage(runKey(dropped.id));
  writeStorage(INDEX_KEY, index.slice(0, MAX_RUNS));
  return true;
}

/** Returns true when this browser held a copy. */
export function deleteLocalRun(id: string): boolean {
  const index = readIndex();
  const had = index.some((s) => s.id === id) || loadLocalRun(id) !== null;
  removeStorage(runKey(id));
  if (index.some((s) => s.id === id)) writeStorage(INDEX_KEY, index.filter((s) => s.id !== id));
  return had;
}

/** Server and browser listings together: one entry per id, the server's when both have it. */
export function mergeRunSummaries(server: RunSummary[], local: RunSummary[]): RunSummary[] {
  const out = new Map<string, RunSummary>();
  for (const r of local) out.set(r.id, r);
  for (const r of server) out.set(r.id, r);
  return [...out.values()].sort((a, b) => b.createdAt - a.createdAt);
}
