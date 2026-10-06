import "server-only";
import { callChat } from "@/lib/providers/client";
import type { BenchEvent, BenchRun, BenchRunConfig } from "./types";
import { runBenchWith, type EngineOptions } from "./engine";
import { grade } from "./graders";

export * from "./engine";

export type RunOptions = Partial<EngineOptions>;

/** Run a benchmark on the server with the keys in .env.local. See runBenchWith. */
export function runBench(
  configInput: BenchRunConfig,
  emit: (e: BenchEvent) => void,
  signal?: AbortSignal,
  opts: RunOptions = {},
): Promise<BenchRun> {
  return runBenchWith(configInput, emit, signal, { call: callChat, grade, ...opts });
}
