import type { ChatResult } from "@/lib/types";
import { formatMs, formatTokens, formatTps, formatUsd } from "@/lib/client/format";
import { summarize, type Summary } from "@/lib/client/stats";
import { okResults, type ArmRound } from "./types";

export type MetricKey = "ttft" | "latency" | "cost" | "tokens" | "tps";

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Which direction wins. null = no winner (descriptive only). */
  better: "lower" | "higher" | null;
  fmt: (n: number | null | undefined) => string;
  pick: (r: ChatResult) => number | null;
}

export const METRICS: MetricDef[] = [
  { key: "ttft", label: "Time to first token", better: "lower", fmt: formatMs, pick: (r) => r.ttftMs },
  { key: "latency", label: "Total latency", better: "lower", fmt: formatMs, pick: (r) => r.latencyMs },
  { key: "cost", label: "Cost per call", better: "lower", fmt: formatUsd, pick: (r) => r.costUsd },
  { key: "tokens", label: "Output tokens", better: null, fmt: formatTokens, pick: (r) => r.usage.completionTokens },
  { key: "tps", label: "Output speed", better: "higher", fmt: formatTps, pick: (r) => r.outputTps },
];

export function metricDef(key: MetricKey): MetricDef {
  return METRICS.find((m) => m.key === key)!;
}

export function armSummary(arm: ArmRound, m: MetricDef): Summary & { values: (number | null)[] } {
  const values = okResults(arm).map(m.pick);
  return { ...summarize(values), values };
}

/** Round a max up to a clean axis value: 1, 2, 2.5, 5 x 10^k. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const s of [1, 2, 2.5, 5, 10]) if (s * base >= max) return s * base;
  return 10 * base;
}
