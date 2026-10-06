import type { BenchTask, ConstraintCheck, GradeResult, GraderSpec } from "./types";

/**
 * Graders turn a model reply into a score in [0, 1]. This module has no Node imports so
 * the browser can grade runs it makes with its own keys; running submitted code is the
 * one platform-specific step, injected as a CodeRunner (node:vm in ./graders.ts, a Web
 * Worker in lib/client/code-runner.ts).
 *
 * Every prompt in the suites asks for a final `Answer: ...` line (or, for code and
 * free-form tasks, a fenced block / the bare reply), so extraction always tries the
 * `Answer:` marker first and only then falls back to heuristics.
 */

// ---------------------------------------------------------------------------
// Answer extraction
// ---------------------------------------------------------------------------

/** Matches an "Answer:" marker at the start of a line, tolerating markdown and "Final answer". */
const ANSWER_MARKER =
  /^[ \t>*_#-]*(?:the\s+)?(?:final\s+)?answer(?:\s+is)?[ \t]*(?:\*\*|__)?[ \t]*[:：][ \t]*(?:\*\*|__)?[ \t]*/gim;

function markerMatches(text: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  ANSWER_MARKER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANSWER_MARKER.exec(text))) {
    out.push(m);
    if (m[0].length === 0) ANSWER_MARKER.lastIndex++;
  }
  return out;
}

/** The single-line answer after the LAST `Answer:` marker (or the next non-empty line). */
export function extractAnswerLine(text: string): string | null {
  const ms = markerMatches(text);
  if (!ms.length) return null;
  const m = ms[ms.length - 1];
  const rest = text.slice(m.index + m[0].length);
  const lines = rest.split(/\r?\n/);
  const first = lines[0].trim();
  if (first) return first;
  const next = lines.slice(1).find((l) => l.trim());
  return next ? next.trim() : "";
}

/** Everything after the FIRST `Answer:` marker, for multi-line answers (code, prose, JSON). */
export function extractAnswerBlock(text: string): string | null {
  const ms = markerMatches(text);
  if (!ms.length) return null;
  const m = ms[0];
  return text.slice(m.index + m[0].length).replace(/^\s*\n/, "").trim();
}

/** Strip markdown emphasis, quotes, LaTeX wrappers and trailing punctuation from a short answer. */
export function cleanAnswer(s: string): string {
  let t = s.trim();
  const boxed = t.match(/\\boxed\{([^{}]*)\}/);
  if (boxed) t = boxed[1];
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t.replace(/^[*_]+|[*_]+$/g, "").trim();
    t = t.replace(/^`+([\s\S]*?)`+$/, "$1").replace(/^\$+([\s\S]*?)\$+$/, "$1");
    t = t.replace(/^["'“”‘’«]([\s\S]*)["'“”‘’»]$/, "$1");
    t = t.replace(/[.!。;]+$/, "").trim();
    if (t === before) break;
  }
  return t.replace(/\s+/g, " ").trim();
}

/** Lowercase, strip diacritics and collapse whitespace for lenient text comparison. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case/diacritic-insensitive containment with word boundaries on alphanumeric edges. */
export function containsPhrase(haystack: string, needle: string): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n) return true;
  const left = /^[a-z0-9]/.test(n) ? "(?<![a-z0-9])" : "";
  const right = /[a-z0-9]$/.test(n) ? "(?![a-z0-9])" : "";
  return new RegExp(left + escapeRegex(n) + right).test(h);
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const NUMBER_RE = /[-−–]?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][-+]?\d+)?(?:\s?\/\s?\d+(?:\.\d+)?)?|[-−]?\.\d+/g;

function toNumber(raw: string): number | null {
  let s = raw.replace(/[−–]/g, "-").replace(/[\s$]/g, "").replace(/,/g, "");
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d === 0 ? null : Number(frac[1]) / d;
  }
  if (s.startsWith("-.")) s = "-0" + s.slice(1);
  else if (s.startsWith(".")) s = "0" + s;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** All numbers in a string, understanding thousands separators, $, unicode minus and simple fractions. */
export function findNumbers(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(NUMBER_RE)) {
    // Ignore a minus that is really a hyphen joining words ("COVID-19", "x-3").
    let raw = m[0];
    const idx = m.index ?? 0;
    if (/^[-−–]/.test(raw) && idx > 0 && /[A-Za-z0-9]/.test(s[idx - 1])) raw = raw.slice(1);
    const n = toNumber(raw);
    if (n != null) out.push(n);
  }
  return out;
}

/** Parse the number a short answer states: prefers the value after the last "=", else the first number. */
export function parseNumericAnswer(s: string): number | null {
  const cleaned = cleanAnswer(s);
  const target = cleaned.includes("=") ? cleaned.slice(cleaned.lastIndexOf("=") + 1) : cleaned;
  const nums = findNumbers(target);
  if (nums.length) return nums[0];
  const all = findNumbers(cleaned);
  return all.length ? all[all.length - 1] : null;
}

function extractNumber(text: string): { value: number | null; raw: string | null; via: string } {
  const line = extractAnswerLine(text);
  if (line != null) {
    const v = parseNumericAnswer(line);
    if (v != null) return { value: v, raw: line, via: "answer line" };
  }
  const boxed = [...text.matchAll(/\\boxed\{([^{}]*)\}/g)];
  if (boxed.length) {
    const raw = boxed[boxed.length - 1][1];
    const v = parseNumericAnswer(raw);
    if (v != null) return { value: v, raw, via: "boxed" };
  }
  const phrase = [...text.matchAll(/answer\s+is\s*:?\s*([^\n]+)/gi)];
  if (phrase.length) {
    const raw = phrase[phrase.length - 1][1];
    const v = parseNumericAnswer(raw);
    if (v != null) return { value: v, raw, via: "answer phrase" };
  }
  const all = findNumbers(text);
  if (all.length) return { value: all[all.length - 1], raw: String(all[all.length - 1]), via: "last number" };
  return { value: null, raw: null, via: "none" };
}

function numbersClose(a: number, e: number, tolerance?: number, relative?: boolean): boolean {
  if (Object.is(a, e) || a === e) return true;
  const tol = tolerance ?? 1e-6;
  const bound = relative ? tol * Math.abs(e) : Math.max(tol, 1e-9 * Math.abs(e));
  return Math.abs(a - e) <= bound;
}

// ---------------------------------------------------------------------------
// Individual graders
// ---------------------------------------------------------------------------

export function result(score: number, extracted: string | null, detail: string): GradeResult {
  const s = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  return { score: s, correct: s >= 1 - 1e-9, extracted, detail };
}

function gradeExact(spec: Extract<GraderSpec, { kind: "exact" }>, expected: string, text: string): GradeResult {
  const eq = (a: string, b: string) =>
    spec.caseSensitive ? cleanAnswer(a) === cleanAnswer(b) : normalizeText(cleanAnswer(a)) === normalizeText(cleanAnswer(b));
  const line = extractAnswerLine(text);
  if (line != null) {
    return result(eq(line, expected) ? 1 : 0, cleanAnswer(line), "answer line");
  }
  const whole = text.trim();
  if (eq(whole, expected)) return result(1, cleanAnswer(whole), "whole reply");
  const last = lastNonEmptyLine(text);
  return result(eq(last, expected) ? 1 : 0, cleanAnswer(last), "last line (no Answer: line)");
}

function gradeNumeric(
  spec: Extract<GraderSpec, { kind: "numeric" }>,
  expected: string,
  text: string,
): GradeResult {
  const e = parseNumericAnswer(expected);
  if (e == null) return result(0, null, `grader misconfigured: expected "${expected}" is not a number`);
  const { value, via } = extractNumber(text);
  if (value == null) return result(0, null, "no number found");
  const ok = numbersClose(value, e, spec.tolerance, spec.relative);
  return result(ok ? 1 : 0, String(value), `${via}: ${value} vs ${e}`);
}

function findChoices(s: string, choices: string[]): string[] {
  const found: string[] = [];
  for (const c of choices) {
    const single = c.length === 1;
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(c)}(?![A-Za-z0-9])`, single ? "" : "i");
    if (re.test(s)) found.push(c);
  }
  return found;
}

function gradeChoice(spec: Extract<GraderSpec, { kind: "choice" }>, expected: string, text: string): GradeResult {
  const { choices } = spec;
  const match = (cand: string): string | null => {
    const c = cleanAnswer(cand).replace(/^\(?(.*?)\)?[.:]?$/, "$1").trim();
    const exact = choices.find((x) => x.toLowerCase() === c.toLowerCase());
    if (exact) return exact;
    // "B) 42", "(B) 42", "Option B", "B. 42"
    const lead = c.match(/^(?:option\s+|choice\s+)?\(?([A-Za-z0-9]+)\)?(?:[.):]|\s|$)/i);
    if (lead) {
      const hit = choices.find((x) => x === lead[1] || (x.length > 1 && x.toLowerCase() === lead[1].toLowerCase()));
      if (hit) return hit;
      if (lead[1].length === 1) {
        const ci = choices.find((x) => x.length === 1 && x.toLowerCase() === lead[1].toLowerCase());
        if (ci && /^(?:option\s+|choice\s+)?\(/i.test(c)) return ci;
      }
    }
    const found = findChoices(c, choices);
    return found.length === 1 ? found[0] : null;
  };
  const line = extractAnswerLine(text);
  let picked: string | null = null;
  let via = "answer line";
  if (line != null) picked = match(line);
  if (picked == null) {
    via = "fallback";
    const phrases = [...text.matchAll(/(?:answer|option|choice)\s+(?:is\s+)?:?\s*\(?\**([A-Za-z0-9]+)\**\)?/gi)];
    for (let i = phrases.length - 1; i >= 0 && picked == null; i--) {
      const hit = choices.find((x) => x === phrases[i][1]);
      if (hit) picked = hit;
    }
    if (picked == null) picked = match(lastNonEmptyLine(text));
    if (picked == null && line == null) picked = match(text);
  }
  if (picked == null) return result(0, line != null ? cleanAnswer(line) : null, "no unambiguous choice found");
  const ok = picked.toLowerCase() === cleanAnswer(expected).toLowerCase();
  return result(ok ? 1 : 0, picked, `${via}: picked ${picked}, expected ${expected}`);
}

function gradeRegex(spec: Extract<GraderSpec, { kind: "regex" }>, text: string): GradeResult {
  let re: RegExp;
  try {
    re = new RegExp(spec.pattern, spec.flags);
  } catch (e) {
    return result(0, null, `invalid pattern: ${(e as Error).message}`);
  }
  const line = extractAnswerLine(text);
  const target = line != null ? cleanAnswer(line) : text;
  const m = target.match(re);
  return result(m ? 1 : 0, m ? m[0] : line != null ? cleanAnswer(line) : null, m ? "matched" : "no match");
}

function gradeContains(spec: Extract<GraderSpec, { kind: "contains" }>, text: string): GradeResult {
  const line = extractAnswerLine(text);
  const target = line != null && line !== "" ? line : text;
  const failures: string[] = [];
  let total = 0;
  let passed = 0;
  for (const a of spec.all ?? []) {
    total++;
    if (containsPhrase(target, a)) passed++;
    else failures.push(`missing "${a}"`);
  }
  if (spec.any?.length) {
    total++;
    if (spec.any.some((a) => containsPhrase(target, a))) passed++;
    else failures.push(`none of ${spec.any.map((a) => `"${a}"`).join(", ")}`);
  }
  if (spec.none?.length) {
    total++;
    const bad = spec.none.filter((a) => containsPhrase(target, a));
    if (!bad.length) passed++;
    else failures.push(`contains forbidden ${bad.map((a) => `"${a}"`).join(", ")}`);
  }
  if (total === 0) return result(0, null, "grader misconfigured: no checks");
  return result(passed / total, line != null ? cleanAnswer(line) : null, failures.join("; ") || "all checks passed");
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/** Find the first balanced {...} (or [...]) in s, respecting strings. */
function balancedSlices(s: string): string[] {
  const out: string[] = [];
  for (let start = 0; start < s.length && out.length < 5; start++) {
    const open = s[start];
    if (open !== "{") continue;
    let depth = 0;
    let inStr: string | null = null;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"') inStr = ch;
      else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) {
          out.push(s.slice(start, i + 1));
          start = i;
          break;
        }
      }
    }
    if (depth !== 0) break;
  }
  return out;
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // Lenient pass: trailing commas and smart quotes are common model slips.
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"'));
    } catch {
      return undefined;
    }
  }
}

export function extractJson(text: string): { value: Record<string, unknown> | null; error: string | null } {
  const candidates: string[] = [];
  for (const m of text.matchAll(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/g)) candidates.push(m[1]);
  const block = extractAnswerBlock(text);
  if (block != null) candidates.push(block);
  const line = extractAnswerLine(text);
  if (line != null) candidates.push(line);
  candidates.push(text);
  let sawBraces = false;
  for (const c of candidates) {
    const direct = tryParse(c.trim());
    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      return { value: direct as Record<string, unknown>, error: null };
    }
    for (const slice of balancedSlices(c)) {
      sawBraces = true;
      const v = tryParse(slice);
      if (v && typeof v === "object" && !Array.isArray(v)) return { value: v as Record<string, unknown>, error: null };
    }
  }
  return { value: null, error: sawBraces || /[{}]/.test(text) ? "malformed JSON" : "no JSON object found" };
}

function looseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[−–]/g, "-");
  if (!/^[-+]?\s?[$€£]?\s?[-+]?[\d,]*\.?\d+(?:[eE][-+]?\d+)?\s?(?:%|[A-Za-z]{1,5})?$/.test(s)) return null;
  const nums = findNumbers(s.replace(/[€£]/g, ""));
  return nums.length === 1 ? nums[0] : null;
}

function isNullish(v: unknown): boolean {
  if (v == null) return true;
  return typeof v === "string" && ["", "null", "none", "n/a", "na", "unknown"].includes(v.trim().toLowerCase());
}

/** Lenient structural comparison used for extraction tasks. */
export function valuesMatch(expected: unknown, actual: unknown): boolean {
  if (expected === null) return isNullish(actual);
  if (typeof expected === "number") {
    const a = looseNumber(actual);
    return a != null && numbersClose(a, expected, 1e-6, false);
  }
  if (typeof expected === "boolean") {
    if (typeof actual === "boolean") return actual === expected;
    if (typeof actual === "string") return ["true", "yes"].includes(actual.trim().toLowerCase()) === expected &&
      ["true", "yes", "false", "no"].includes(actual.trim().toLowerCase());
    return false;
  }
  if (typeof expected === "string") {
    if (typeof actual === "number") return normalizeText(expected) === String(actual);
    if (typeof actual !== "string") return false;
    const norm = (s: string) => normalizeText(s).replace(/[.]+$/, "");
    return norm(expected) === norm(actual);
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    const used = new Set<number>();
    return expected.every((e) => {
      const idx = actual.findIndex((a, i) => !used.has(i) && valuesMatch(e, a));
      if (idx < 0) return false;
      used.add(idx);
      return true;
    });
  }
  if (typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
    const a = actual as Record<string, unknown>;
    return Object.entries(expected as Record<string, unknown>).every(([k, v]) => valuesMatch(v, a[k]));
  }
  return false;
}

function getPath(obj: Record<string, unknown>, path: string): { present: boolean; value: unknown } {
  if (path in obj) return { present: true, value: obj[path] };
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object" || !(part in (cur as Record<string, unknown>))) {
      return { present: false, value: undefined };
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return { present: true, value: cur };
}

function gradeJson(spec: Extract<GraderSpec, { kind: "json" }>, text: string): GradeResult {
  const { value, error } = extractJson(text);
  if (!value) return result(0, null, error ?? "no JSON");
  const extracted = JSON.stringify(value);
  const failures: string[] = [];
  let total = 0;
  let passed = 0;
  for (const k of spec.requiredKeys) {
    total++;
    if (getPath(value, k).present) passed++;
    else failures.push(`missing key "${k}"`);
  }
  for (const [k, exp] of Object.entries(spec.expectedValues ?? {})) {
    total++;
    const got = getPath(value, k);
    if (valuesMatch(exp, got.value)) passed++;
    else failures.push(`${k}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(got.value) ?? "undefined"}`);
  }
  if (total === 0) return result(1, extracted, "parsed JSON object");
  return result(passed / total, extracted.slice(0, 2000), failures.join("; ") || "all fields match");
}

// ---------------------------------------------------------------------------
// Code execution
// ---------------------------------------------------------------------------

export const MAX_CODE_CHARS = 20_000;
export const PER_CALL_TIMEOUT_MS = 1000;
export const TOTAL_BUDGET_MS = 4000;

export function extractCode(text: string, functionName: string): string {
  const fences = [...text.matchAll(/```[ \t]*([A-Za-z0-9_+-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g)].map((m) => ({
    lang: m[1].toLowerCase(),
    body: m[2],
  }));
  const defines = new RegExp(`\\b${escapeRegex(functionName)}\\b`);
  const js = fences.filter((f) => ["js", "javascript", "jsx", "mjs", "node", "ts", "typescript", ""].includes(f.lang));
  const pick = js.find((f) => defines.test(f.body)) ?? js[js.length - 1] ?? fences.find((f) => defines.test(f.body));
  if (pick) return pick.body.trim();
  const block = extractAnswerBlock(text);
  if (block != null && block.trim()) return block.trim();
  return text.trim();
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  }
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export const PRELUDE = `
var console = { log() {}, error() {}, warn() {}, info() {}, debug() {} };
var module = { exports: {} };
var exports = module.exports;
`;

export function sanitizeCode(code: string): string {
  return code
    .replace(/^\s*import\s.+$/gm, "")
    .replace(/^(\s*)export\s+default\s+(?=function|class|async)/gm, "$1")
    .replace(/^(\s*)export\s+(?=function|const|let|var|class|async)/gm, "$1");
}

export interface CodeRunResult {
  passed: number;
  total: number;
  failures: string[];
}

export type CodeRunner = (
  code: string,
  functionName: string,
  tests: { args: unknown[]; expected: unknown }[],
) => CodeRunResult;

/** The code to run for a code task, or a final GradeResult when there is nothing to run. */
export function codeToRun(spec: Extract<GraderSpec, { kind: "code" }>, text: string): string | GradeResult {
  if (!spec.tests.length) return result(0, null, "grader misconfigured: no tests");
  const code = extractCode(text, spec.functionName);
  if (!code) return result(0, null, "no code found");
  return code;
}

export function codeGrade(code: string, r: CodeRunResult): GradeResult {
  return result(r.passed / r.total, code.slice(0, 4000), `${r.passed}/${r.total} tests passed${r.failures.length ? `; ${r.failures.slice(0, 3).join("; ")}` : ""}`);
}

function gradeCode(spec: Extract<GraderSpec, { kind: "code" }>, text: string, runCode: CodeRunner): GradeResult {
  const code = codeToRun(spec, text);
  if (typeof code !== "string") return code;
  return codeGrade(code, runCode(code, spec.functionName, spec.tests));
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

/** Whitespace-separated tokens containing a letter or digit; list markers ("-", "1.") are not words. */
export function countWords(s: string): number {
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, ""))
    .join(" ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function nonEmptyLines(s: string): string[] {
  return s.split(/\r?\n/).filter((l) => l.trim());
}

const BULLET = /^\s*(?:[-*•+]|\d+[.)])\s+\S/;

export function checkConstraint(c: ConstraintCheck, s: string): boolean {
  switch (c.type) {
    case "maxWords":
      return countWords(s) <= c.value;
    case "minWords":
      return countWords(s) >= c.value;
    case "exactLines":
      return nonEmptyLines(s).length === c.value;
    case "startsWith":
      return s.trimStart().startsWith(c.value);
    case "endsWith":
      return s.trimEnd().endsWith(c.value);
    case "allLowercase":
      return /\p{L}/u.test(s) && s === s.toLowerCase();
    case "allUppercase":
      return /\p{L}/u.test(s) && s === s.toUpperCase();
    case "noCommas":
      return !/[,，]/.test(s);
    case "includes":
      return containsPhrase(s, c.value);
    case "excludes":
      return !containsPhrase(s, c.value);
    case "bulletCount":
      return nonEmptyLines(s).filter((l) => BULLET.test(l)).length === c.value;
  }
}

export function describeConstraint(c: ConstraintCheck): string {
  return "value" in c ? `${c.type}(${JSON.stringify(c.value)})` : c.type;
}

function gradeConstraints(spec: Extract<GraderSpec, { kind: "constraints" }>, text: string): GradeResult {
  if (!spec.checks.length) return result(0, null, "grader misconfigured: no checks");
  // Grade the whole reply, and also the part after an `Answer:` marker (simulators and some
  // models prefix their reply with reasoning); the better of the two counts.
  const candidates = [text.trim()];
  const block = extractAnswerBlock(text);
  if (block != null && block.trim() !== candidates[0]) candidates.push(block.trim());
  let best: { target: string; failed: ConstraintCheck[] } | null = null;
  for (const target of candidates) {
    const failed = spec.checks.filter((c) => !checkConstraint(c, target));
    if (!best || failed.length < best.failed.length) best = { target, failed };
  }
  const { target, failed } = best!;
  const passed = spec.checks.length - failed.length;
  return result(
    passed / spec.checks.length,
    target.slice(0, 2000),
    failed.length ? `failed: ${failed.map(describeConstraint).join(", ")}` : "all constraints satisfied",
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Score a reply for a task, running code tasks with `runCode`. Never throws. */
export function gradeWith(task: Pick<BenchTask, "grader" | "expected">, text: string, runCode: CodeRunner): GradeResult {
  const reply = typeof text === "string" ? text : "";
  try {
    const g = task.grader;
    switch (g.kind) {
      case "exact":
        return gradeExact(g, task.expected, reply);
      case "numeric":
        return gradeNumeric(g, task.expected, reply);
      case "choice":
        return gradeChoice(g, task.expected, reply);
      case "regex":
        return gradeRegex(g, reply);
      case "contains":
        return gradeContains(g, reply);
      case "json":
        return gradeJson(g, reply);
      case "code":
        return gradeCode(g, reply, runCode);
      case "constraints":
        return gradeConstraints(g, reply);
      default:
        return result(0, null, `unknown grader kind ${(g as { kind: string }).kind}`);
    }
  } catch (e) {
    return result(0, null, `grader error: ${e instanceof Error ? e.message.slice(0, 200) : "exception thrown"}`);
  }
}
