import type { BenchTask, GraderSpec } from "../types";

/** FNV-1a 32-bit hash; stable across runs and platforms. */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

/** Integer in [lo, hi], inclusive. */
export function randInt(r: Rand, lo: number, hi: number): number {
  return lo + Math.floor(r() * (hi - lo + 1));
}

export function pick<T>(r: Rand, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

export function shuffle<T>(r: Rand, xs: readonly T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Standard answer-format instructions so graders can extract reliably. */
export const FORMAT = {
  number: "End your reply with a final line of the form `Answer: <number>` (just the number, no units or commas).",
  word: "End your reply with a final line of the form `Answer: <answer>`.",
  choice: (letters: string) => `End your reply with a final line of the form \`Answer: <letter>\` where <letter> is one of ${letters}.`,
  json: "Reply with only a single JSON object (no prose). If you add anything else, put the JSON object on a final line starting with `Answer: `.",
  code: (name: string) =>
    `Reply with a single \`\`\`javascript code block that defines the function \`${name}\`. Plain JavaScript only: no require, import, or I/O.`,
  freeform: "Reply with only the requested text: no preamble, no explanation, no quotes around it.",
} as const;

export interface TaskInput {
  id: string;
  category: string;
  difficulty: number;
  prompt: string;
  expected: string;
  grader: GraderSpec;
  tags?: string[];
  system?: string;
}

export function makeTask(suiteId: string, t: TaskInput): BenchTask {
  const messages: BenchTask["messages"] = [];
  if (t.system) messages.push({ role: "system", content: t.system });
  messages.push({ role: "user", content: t.prompt });
  return {
    id: `${suiteId}/${t.id}`,
    suiteId,
    category: t.category,
    difficulty: Math.round(Math.max(0, Math.min(1, t.difficulty)) * 100) / 100,
    messages,
    expected: t.expected,
    grader: t.grader,
    ...(t.tags ? { tags: t.tags } : {}),
  };
}
