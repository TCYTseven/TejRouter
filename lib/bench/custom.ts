import type { ChatMessage } from "@/lib/types";
import type { BenchSuite, BenchTask, GraderSpec } from "./types";

/**
 * Your own prompts as a task set. A tasks file is JSONL (one task per line) or a JSON
 * array. The smallest task is a prompt and the answer you expect:
 *
 *   {"prompt": "What is the capital of France?", "expected": "Paris"}
 *
 * Optional fields: id, system, messages (instead of prompt), category, difficulty (0 to 1),
 * choices, and grader: a name ("contains", "exact", "numeric", "regex", "choice", "json")
 * or a full GraderSpec object. Without a grader one is picked from the answer: a number is
 * compared numerically, an object field by field, anything else must appear in the reply.
 */

export const CUSTOM_SUITE_ID = "custom";

export class TasksFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TasksFileError";
  }
}

const GRADER_KINDS = ["exact", "numeric", "choice", "regex", "contains", "json", "code", "constraints"] as const;
const ROLES = ["system", "user", "assistant"];

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

/** First field that is set, so `question`/`answer` style files load without renaming. */
function field(o: Raw, names: string[]): unknown {
  for (const n of names) if (o[n] !== undefined && o[n] !== null) return o[n];
  return undefined;
}

function parseEntries(text: string): { entry: unknown; where: string }[] {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) throw new TasksFileError("The tasks file is empty.");
  if (trimmed[0] === "[" || (trimmed[0] === "{" && /^\{\s*"tasks"\s*:/.test(trimmed))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw new TasksFileError(`The tasks file is not valid JSON: ${(e as Error).message}`);
    }
    const list = Array.isArray(parsed) ? parsed : (parsed as Raw).tasks;
    if (!Array.isArray(list)) throw new TasksFileError('"tasks" must be an array.');
    return list.map((entry, i) => ({ entry, where: `task ${i + 1}` }));
  }
  const out: { entry: unknown; where: string }[] = [];
  trimmed.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith("//") || l.startsWith("#")) return;
    try {
      out.push({ entry: JSON.parse(l), where: `line ${i + 1}` });
    } catch (e) {
      throw new TasksFileError(`line ${i + 1} is not valid JSON: ${(e as Error).message}`);
    }
  });
  return out;
}

function messagesOf(o: Raw, where: string): ChatMessage[] {
  if (Array.isArray(o.messages)) {
    const ms = o.messages.map((m) => {
      if (!isObject(m) || typeof m.content !== "string" || !ROLES.includes(m.role as string)) {
        throw new TasksFileError(`${where}: each message needs a role (system, user or assistant) and a text content.`);
      }
      return { role: m.role as ChatMessage["role"], content: m.content };
    });
    if (!ms.some((m) => m.role === "user")) throw new TasksFileError(`${where}: messages need at least one user message.`);
    return ms;
  }
  const prompt = field(o, ["prompt", "input", "question"]);
  if (typeof prompt !== "string" || !prompt.trim()) throw new TasksFileError(`${where}: needs a "prompt" (or "messages").`);
  const system = field(o, ["system"]);
  return [...(typeof system === "string" && system.trim() ? [{ role: "system" as const, content: system }] : []), { role: "user" as const, content: prompt }];
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map((x) => String(x));

function graderOf(o: Raw, answer: unknown, where: string): { grader: GraderSpec; expected: string } {
  const text = (v: unknown) => (isObject(v) || Array.isArray(v) ? JSON.stringify(v) : String(v));
  const expected = answer === undefined ? "" : Array.isArray(answer) ? answer.map(String).join(", ") : text(answer);
  const needAnswer = (kind: string) => {
    if (answer !== undefined) return;
    throw new TasksFileError(o.grader === undefined ? `${where}: needs an "expected" answer to grade replies against.` : `${where}: the "${kind}" grader needs an "expected" answer.`);
  };
  const g = o.grader;

  if (isObject(g)) {
    if (!GRADER_KINDS.includes(g.kind as (typeof GRADER_KINDS)[number])) {
      throw new TasksFileError(`${where}: unknown grader kind "${String(g.kind)}". Use one of ${GRADER_KINDS.join(", ")}.`);
    }
    if (g.kind === "exact" || g.kind === "numeric" || g.kind === "choice") needAnswer(g.kind);
    return { grader: g as GraderSpec, expected };
  }
  if (g !== undefined && typeof g !== "string") throw new TasksFileError(`${where}: "grader" must be a name or an object.`);

  const choices = Array.isArray(o.choices) ? o.choices.map(String) : null;
  const numeric = typeof answer === "number" || (typeof answer === "string" && /^-?[\d,]*\.?\d+$/.test(answer.trim()));
  const kind = g ?? (choices ? "choice" : isObject(answer) ? "json" : numeric ? "numeric" : "contains");

  switch (kind) {
    case "exact":
    case "numeric":
      needAnswer(kind);
      return { grader: { kind }, expected };
    case "choice":
      needAnswer(kind);
      if (!choices?.length) throw new TasksFileError(`${where}: the "choice" grader needs a "choices" array.`);
      return { grader: { kind, choices }, expected };
    case "contains":
      needAnswer(kind);
      return { grader: { kind, all: asStrings(answer) }, expected };
    case "regex": {
      needAnswer(kind);
      const pattern = String(answer);
      try {
        new RegExp(pattern, "i");
      } catch (e) {
        throw new TasksFileError(`${where}: "expected" is not a valid regular expression: ${(e as Error).message}`);
      }
      return { grader: { kind, pattern, flags: "i" }, expected };
    }
    case "json":
      if (!isObject(answer)) throw new TasksFileError(`${where}: the "json" grader needs "expected" to be an object of field values.`);
      return { grader: { kind, requiredKeys: [], expectedValues: answer }, expected };
    default:
      throw new TasksFileError(`${where}: unknown grader "${kind}". Use contains, exact, numeric, regex, choice or json, or a grader object.`);
  }
}

/** Parse a tasks file into a task set the runner can use. Throws TasksFileError naming the bad line. */
export function parseTasksFile(text: string, name = "Your tasks"): BenchSuite {
  const entries = parseEntries(text);
  if (!entries.length) throw new TasksFileError("The tasks file has no tasks.");
  const seen = new Set<string>();
  const tasks: BenchTask[] = entries.map(({ entry, where }, i) => {
    if (!isObject(entry)) throw new TasksFileError(`${where}: each task must be a JSON object.`);
    const messages = messagesOf(entry, where);
    const { grader, expected } = graderOf(entry, field(entry, ["expected", "answer", "ideal", "output"]), where);
    const slug = String(entry.id ?? i + 1).trim().replace(/[^\w.-]+/g, "-") || String(i + 1);
    if (seen.has(slug)) throw new TasksFileError(`${where}: the id "${slug}" is used twice.`);
    seen.add(slug);
    const d = Number(entry.difficulty);
    return {
      id: `${CUSTOM_SUITE_ID}/${slug}`,
      suiteId: CUSTOM_SUITE_ID,
      category: typeof entry.category === "string" && entry.category.trim() ? entry.category.trim() : "custom",
      difficulty: entry.difficulty != null && Number.isFinite(d) ? Math.max(0, Math.min(1, d)) : 0.5,
      messages,
      expected,
      grader,
      ...(Array.isArray(entry.tags) ? { tags: entry.tags.map(String) } : {}),
    };
  });
  return { id: CUSTOM_SUITE_ID, name, description: "Tasks loaded from a file.", tasks };
}
