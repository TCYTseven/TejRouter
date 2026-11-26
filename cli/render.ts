import { ms, pct, pval, usd } from "@/components/report/format";
import type { DriftReport } from "@/lib/analysis/advanced";
import type { Gate, Summary } from "./summary";

/** Terminal styles; plain text when `color` is off (pipes, NO_COLOR, files). */
export interface Style {
  bold: (s: string) => string;
  dim: (s: string) => string;
  good: (s: string) => string;
  bad: (s: string) => string;
}

export function style(color: boolean): Style {
  const wrap = (open: number, close: number) => (s: string) => (color ? `\x1b[${open}m${s}\x1b[${close}m` : s);
  return { bold: wrap(1, 22), dim: wrap(2, 22), good: wrap(32, 39), bad: wrap(31, 39) };
}

/** Signed accuracy change in percentage points: 0.031 -> "+3.1 points". */
function points(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  const x = Math.abs(v * 100) < 0.05 ? 0 : v * 100;
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)} points`;
}

type Align = "left" | "right";

/** A padded text table. `emphasis` styles whole cells without breaking the column widths. */
export function textTable(headers: string[], rows: string[][], align: Align[] = [], emphasis?: (row: number, col: number, cell: string) => string): string {
  const widths = headers.map((h, c) => Math.max(h.length, ...rows.map((r) => (r[c] ?? "").length)));
  const pad = (s: string, c: number) => (align[c] === "right" ? s.padStart(widths[c]) : s.padEnd(widths[c]));
  const line = (cells: string[], paint?: (c: number, padded: string) => string) =>
    cells.map((s, c) => (paint ? paint(c, pad(s, c)) : pad(s, c))).join("  ").trimEnd();
  return [line(headers), ...rows.map((r, i) => line(r, emphasis ? (c, padded) => emphasis(i, c, padded) : undefined))].join("\n");
}

function mdTable(headers: string[], rows: string[][], align: Align[] = []): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  return [
    `| ${headers.map(esc).join(" | ")} |`,
    `| ${headers.map((_, c) => (align[c] === "right" ? "---:" : "---")).join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}

const range = (lo: number | null, hi: number | null) => (lo != null && hi != null ? `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%` : "");

function comparison(s: Summary) {
  return {
    headers: ["Router", "Accuracy", "Likely range", "Cost per answer", "Typical time", "Failed calls"],
    align: ["left", "right", "right", "right", "right", "right"] as Align[],
    rows: s.arms.map((a) => [a.label, pct(a.accuracy), range(a.accuracyLo, a.accuracyHi), usd(a.costPerAnswerUsd), ms(a.medianLatencyMs), pct(a.errorRate, 0)]),
  };
}

/** "gpt-4o-mini 82%, claude-sonnet-4.5 18%", capped so one line stays readable. */
function modelMix(models: { model: string; share: number }[], max = 4): string {
  const shown = models.slice(0, max).map((m) => `${m.model} ${pct(m.share, 0)}`);
  return models.length > max ? `${shown.join(", ")}, ${models.length - max} more` : shown.join(", ");
}

function driftTable(d: DriftReport, label: (id: string) => string) {
  const arrow = (a: string | null, b: string | null) => (a === b ? (a ?? "") : `${a ?? "none"} → ${b ?? "none"}`);
  return {
    headers: ["Router", "Before", "Now", "Change", "p", "Most used model", "Cost per answer"],
    align: ["left", "right", "right", "right", "right", "left", "left"] as Align[],
    rows: d.rows.map((r) => [
      label(r.armId),
      pct(r.accuracyThen),
      pct(r.accuracyNow),
      points(r.delta),
      pval(r.pValue),
      arrow(r.topModelThen, r.topModelNow),
      arrow(usd(r.meanCostThen), usd(r.meanCostNow)),
    ]),
  };
}

const driftIntro = (d: DriftReport) =>
  `Compared with "${d.previousName}" (${d.daysApart < 1 ? "earlier today" : `${Math.round(d.daysApart)} day${Math.round(d.daysApart) === 1 ? "" : "s"} earlier`}) on ${d.sharedTasks} shared tasks.`;

export interface RenderInput {
  summary: Summary;
  drift?: DriftReport | null;
  gate?: Gate | null;
}

/** The report as it is printed in a terminal. */
export function renderText({ summary: s, drift, gate }: RenderInput, st: Style = style(false)): string {
  const label = (id: string) => s.arms.find((a) => a.id === id)?.label ?? id;
  const out: string[] = [];
  out.push(st.bold(s.name));
  out.push(st.dim(`${s.tasks} tasks, ${s.arms.length} router${s.arms.length === 1 ? "" : "s"}, ${s.calls} calls`));
  out.push("");
  out.push(st.bold(s.verdict[0]));
  for (const v of s.verdict.slice(1)) out.push(v);

  if (s.arms.length) {
    const t = comparison(s);
    const bestCost = Math.min(...s.arms.map((a) => a.costPerAnswerUsd ?? Infinity));
    const bestTime = Math.min(...s.arms.map((a) => a.medianLatencyMs ?? Infinity));
    const best = (row: number, col: number) =>
      (col === 1 && s.arms[row].accuracy === s.arms[0].accuracy) ||
      (col === 3 && s.arms[row].costPerAnswerUsd === bestCost) ||
      (col === 4 && s.arms[row].medianLatencyMs === bestTime);
    out.push("");
    out.push(textTable(t.headers, t.rows, t.align, (row, col, cell) => (best(row, col) ? st.bold(cell) : cell)));
    out.push("");
    for (const a of s.arms) out.push(`${a.label}: ${a.note}${a.models.length > 1 ? ` (${modelMix(a.models)})` : ""}`);
  }

  if (drift) {
    out.push("");
    out.push(st.bold("Since the baseline"));
    if (drift.reason) out.push(drift.reason);
    else {
      const t = driftTable(drift, label);
      out.push(st.dim(driftIntro(drift)));
      out.push(textTable(t.headers, t.rows, t.align));
    }
  }

  if (s.warnings.length) {
    out.push("");
    out.push(st.bold("Things to know about this data"));
    for (const w of s.warnings) out.push(`- ${w}`);
  }

  if (gate) {
    out.push("");
    if (gate.passed) out.push(st.good("Check passed."));
    else {
      out.push(st.bad("Check failed."));
      for (const f of gate.failures) out.push(`- ${f}`);
    }
  }
  return out.join("\n");
}

/** The fuller report written by --md: the terminal report plus task types and head-to-head tests. */
export function renderMarkdown({ summary: s, drift, gate }: RenderInput): string {
  const label = (id: string) => s.arms.find((a) => a.id === id)?.label ?? id;
  const out: string[] = [`# ${s.name}`, ""];
  out.push(`${s.tasks} tasks, ${s.arms.length} router${s.arms.length === 1 ? "" : "s"}, ${s.calls} calls. Run \`${s.runId}\`, ${new Date(s.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC.`, "");
  if (gate) {
    out.push(gate.passed ? "**Check passed.**" : "**Check failed.**", "");
    for (const f of gate.failures) out.push(`- ${f}`);
    if (gate.failures.length) out.push("");
  }
  out.push(`**${s.verdict[0]}**`, "");
  for (const v of s.verdict.slice(1)) out.push(v, "");

  if (s.arms.length) {
    const t = comparison(s);
    out.push(mdTable([...t.headers, "Note"], t.rows.map((r, i) => [...r, s.arms[i].note]), t.align), "");
    out.push("Accuracy is the share of tasks answered correctly; failed calls count as wrong. The likely range is a 95% interval.", "");

    const routed = s.arms.filter((a) => a.models.length > 0);
    if (routed.length) {
      out.push("## Models served", "");
      for (const a of routed) out.push(`- **${a.label}**: ${modelMix(a.models, 8)}`);
      out.push("");
    }
  }

  if (s.categories.length > 1 && s.arms.length) {
    out.push("## Accuracy by task type", "");
    out.push(
      mdTable(
        ["Task type", "Tasks", ...s.arms.map((a) => a.label)],
        s.categories.map((c) => [c.category, String(c.tasks), ...s.arms.map((a) => pct(c.accuracy[a.id], 0))]),
        ["left", "right", ...s.arms.map(() => "right" as Align)],
      ),
      "",
    );
  }

  if (s.pairwise.length) {
    out.push("## Head to head", "");
    out.push(
      mdTable(
        ["Pair", "Accuracy difference", "Likely range", "p (adjusted)", "Clear difference"],
        s.pairwise.map((p) => [
          `${label(p.a)} vs ${label(p.b)}`,
          points(p.diff),
          p.lo != null && p.hi != null ? `${points(p.lo)} to ${points(p.hi)}` : "",
          pval(p.p),
          p.significant ? "yes" : "no",
        ]),
        ["left", "right", "right", "right", "left"],
      ),
      "",
    );
    out.push("Differences are the first router minus the second on the tasks both answered. The p-value is McNemar's test with Holm's correction.", "");
  }

  if (drift) {
    out.push("## Since the baseline", "");
    if (drift.reason) out.push(drift.reason, "");
    else {
      const t = driftTable(drift, label);
      out.push(driftIntro(drift), "", mdTable(t.headers, t.rows, t.align), "");
    }
  }

  if (s.warnings.length) {
    out.push("## Things to know about this data", "");
    for (const w of s.warnings) out.push(`- ${w}`);
    out.push("");
  }
  out.push("Made with [TejRouter](https://github.com/TCYTseven/TejRouter). Every formula is in its METHODOLOGY.md.", "");
  return out.join("\n");
}
