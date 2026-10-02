import type { BenchArm, BenchSample } from "@/lib/bench/types";
import { wilson } from "@/lib/client/bench";

export interface ArmLive {
  arm: BenchArm;
  /** Samples this arm will produce in total. */
  expected: number;
  n: number;
  correct: number;
  scoreSum: number;
  errors: number;
  retries: number;
  latSum: number;
  latN: number;
  cost: number;
  costN: number;
  served: Map<string, number>;
  ci: { p: number; lo: number; hi: number } | null;
  meanLatency: number | null;
}

export interface CellLive {
  n: number;
  scoreSum: number;
  errors: number;
  last: BenchSample;
  served: Set<string>;
}

export interface LiveAggregate {
  arms: ArmLive[];
  cells: Map<string, CellLive>;
  /** Served models in order of first appearance (color assignment is stable). */
  models: string[];
}

export const cellKey = (taskId: string, armId: string) => `${taskId}\u0000${armId}`;

export function aggregate(arms: BenchArm[], samples: BenchSample[], perArmExpected: number): LiveAggregate {
  const byArm = new Map<string, ArmLive>(
    arms.map((arm) => [
      arm.id,
      {
        arm,
        expected: perArmExpected,
        n: 0,
        correct: 0,
        scoreSum: 0,
        errors: 0,
        retries: 0,
        latSum: 0,
        latN: 0,
        cost: 0,
        costN: 0,
        served: new Map(),
        ci: null,
        meanLatency: null,
      },
    ]),
  );
  const cells = new Map<string, CellLive>();
  const models: string[] = [];
  const seenModels = new Set<string>();
  for (const s of samples) {
    const a = byArm.get(s.armId);
    if (a) {
      a.n++;
      if (s.grade.correct) a.correct++;
      a.scoreSum += s.grade.score;
      if (!s.result.ok) a.errors++;
      a.retries += Math.max(0, (s.attempts ?? 1) - 1);
      if (s.result.ok && Number.isFinite(s.result.latencyMs)) {
        a.latSum += s.result.latencyMs;
        a.latN++;
      }
      if (typeof s.result.costUsd === "number") {
        a.cost += s.result.costUsd;
        a.costN++;
      }
      const model = s.result.ok ? s.result.servedModel || s.result.requestedModel || "unknown" : "error";
      a.served.set(model, (a.served.get(model) ?? 0) + 1);
      if (model !== "error" && !seenModels.has(model)) {
        seenModels.add(model);
        models.push(model);
      }
    }
    const k = cellKey(s.taskId, s.armId);
    const c = cells.get(k);
    if (c) {
      c.n++;
      c.scoreSum += s.grade.score;
      if (!s.result.ok) c.errors++;
      c.last = s;
      if (s.result.servedModel) c.served.add(s.result.servedModel);
    } else {
      cells.set(k, {
        n: 1,
        scoreSum: s.grade.score,
        errors: s.result.ok ? 0 : 1,
        last: s,
        served: new Set(s.result.servedModel ? [s.result.servedModel] : []),
      });
    }
  }
  for (const a of byArm.values()) {
    a.ci = wilson(a.correct, a.n);
    a.meanLatency = a.latN ? a.latSum / a.latN : null;
  }
  return { arms: [...byArm.values()], cells, models };
}

/**
 * Categorical slots for served models (validated reference palette, light/dark steps).
 * Assigned by first appearance and never re-assigned; past 7 models the tail folds into "Other".
 */
const SLOTS: [string, string][] = [
  ["#2a78d6", "#3987e5"],
  ["#eb6834", "#d95926"],
  ["#1baf7a", "#199e70"],
  ["#eda100", "#c98500"],
  ["#e87ba4", "#d55181"],
  ["#008300", "#008300"],
  ["#4a3aa7", "#9085e9"],
];
export const MAX_MODEL_SLOTS = SLOTS.length;

export function modelColor(index: number): string {
  if (index < 0 || index >= SLOTS.length) return "var(--fg-subtle)";
  const [light, dark] = SLOTS[index];
  return `light-dark(${light}, ${dark})`;
}

export const ERROR_COLOR = "var(--danger)";
