import type { BenchRun } from "@/lib/bench/types";

/** Quote a cell only when it needs it; line breaks become spaces so every call stays on one line. */
function cell(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  let s = String(v).replace(/\s*[\r\n]+\s*/g, " ");
  // A reply is untrusted text: keep a spreadsheet from running one that starts like a formula.
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS = [
  "router",
  "pinned_model",
  "task",
  "task_set",
  "category",
  "difficulty",
  "repetition",
  "correct",
  "score",
  "served_model",
  "latency_ms",
  "first_token_ms",
  "cost_usd",
  "input_tokens",
  "output_tokens",
  "attempts",
  "why",
  "reply",
] as const;

/** One row per call, in the order the calls finished: for spreadsheets and notebooks. */
export function renderCsv(run: BenchRun): string {
  const arms = new Map(run.arms.map((a) => [a.id, a]));
  const rows = run.samples.map((s) => {
    const arm = arms.get(s.armId);
    const r = s.result;
    return [
      arm ? arm.label.split(" · ")[0] : s.armId,
      arm?.model ?? "",
      s.taskId,
      s.suiteId,
      s.category,
      s.difficulty,
      s.rep + 1,
      s.grade.correct,
      s.grade.score,
      r.servedModel,
      Math.round(r.latencyMs),
      r.ttftMs == null ? null : Math.round(r.ttftMs),
      r.costUsd == null ? null : Number(r.costUsd.toFixed(8)),
      r.usage.promptTokens,
      r.usage.completionTokens,
      s.attempts ?? 1,
      r.ok ? s.grade.detail : (r.error ?? "the call failed"),
      r.text,
    ];
  });
  return [COLUMNS, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n";
}
