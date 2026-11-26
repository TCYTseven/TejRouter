import type { BenchRun } from "@/lib/bench/types";

/** One task a router got wrong. */
export interface Miss {
  taskId: string;
  category: string;
  /** How many of the other routers answered it correctly: a high count means this router is the odd one out. */
  othersRight: number;
  others: number;
  model: string | null;
  /** The grader's reason, or the call's error when it failed. */
  why: string;
  reply: string;
}

export interface ArmMisses {
  armId: string;
  label: string;
  tasks: number;
  misses: Miss[];
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The tasks each router got wrong, tasks the other routers got right first. A task counts
 * as wrong when any repetition of it was; the first wrong reply is the one shown.
 */
export function findMisses(run: BenchRun): ArmMisses[] {
  const rightOn = new Map<string, Set<string>>();
  const seen = new Map<string, Set<string>>();
  for (const a of run.arms) {
    rightOn.set(a.id, new Set());
    seen.set(a.id, new Set());
  }
  const wrong = new Map<string, Map<string, BenchRun["samples"][number]>>();
  for (const s of run.samples) {
    seen.get(s.armId)?.add(s.taskId);
    if (s.result.ok && s.grade.correct) continue;
    const m = wrong.get(s.armId) ?? new Map();
    if (!m.has(s.taskId)) m.set(s.taskId, s);
    wrong.set(s.armId, m);
  }
  for (const a of run.arms) for (const t of seen.get(a.id)!) if (!wrong.get(a.id)?.has(t)) rightOn.get(a.id)!.add(t);

  return run.arms.map((a) => {
    const misses: Miss[] = [...(wrong.get(a.id)?.values() ?? [])].map((s) => {
      const others = run.arms.filter((o) => o.id !== a.id && seen.get(o.id)!.has(s.taskId));
      return {
        taskId: s.taskId,
        category: s.category,
        othersRight: others.filter((o) => rightOn.get(o.id)!.has(s.taskId)).length,
        others: others.length,
        model: s.result.servedModel,
        why: oneLine(s.result.ok ? s.grade.detail : `call failed: ${s.result.error ?? "unknown error"}`),
        reply: oneLine(s.result.text),
      };
    });
    misses.sort((x, y) => y.othersRight - x.othersRight || x.taskId.localeCompare(y.taskId));
    return { armId: a.id, label: a.label, tasks: seen.get(a.id)!.size, misses };
  });
}
