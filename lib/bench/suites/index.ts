import { HARD_MIN_DIFFICULTY, type BenchSuite, type SuiteInfo } from "../types";
import { codeSuite } from "./code";
import { edgeSuite } from "./edge";
import { extractionSuite } from "./extraction";
import { hardSuite } from "./hard";
import { instructionSuite } from "./instruction";
import { knowledgeSuite } from "./knowledge";
import { longContextSuite } from "./long-context";
import { mathSuite } from "./math";
import { multilingualSuite } from "./multilingual";
import { reasoningSuite } from "./reasoning";
import { rephraseSuite } from "./rephrase";
import { trivialSuite } from "./trivial";

/** Every built-in suite, roughly ordered from easiest to hardest to route well. */
export const SUITES: BenchSuite[] = [
  trivialSuite,
  knowledgeSuite,
  mathSuite,
  reasoningSuite,
  codeSuite,
  instructionSuite,
  extractionSuite,
  longContextSuite,
  // Hardest tasks, so accuracy does not sit at 95%+ for every router.
  hardSuite,
  // Off unless picked: they answer the advanced report's questions about languages,
  // stability under rephrasing, and edge cases.
  multilingualSuite,
  rephraseSuite,
  edgeSuite,
];

export function getSuite(id: string): BenchSuite | undefined {
  return SUITES.find((s) => s.id === id);
}

export function getTask(taskId: string) {
  const suiteId = taskId.split("/")[0];
  return getSuite(suiteId)?.tasks.find((t) => t.id === taskId);
}

const EXAMPLE_PROMPT_CHARS = 700;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const head = Math.floor(n * 0.6);
  const tail = n - head;
  return `${s.slice(0, head)}\n[… ${s.length - n} characters omitted …]\n${s.slice(-tail)}`;
}

/** Metadata for the suite picker. Example prompts are truncated (long-context ones are huge). */
export function suiteInfo(suite: BenchSuite): SuiteInfo {
  const cats = new Map<string, number>();
  const hist = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const t of suite.tasks) {
    cats.set(t.category, (cats.get(t.category) ?? 0) + 1);
    hist[Math.min(4, Math.floor(t.difficulty * 5))]++;
    sum += t.difficulty;
  }
  // One easy and one hard example so the picker shows the range.
  const sorted = suite.tasks.slice().sort((a, b) => a.difficulty - b.difficulty);
  const examples = sorted.length > 1 ? [sorted[0], sorted[sorted.length - 1]] : sorted;
  return {
    id: suite.id,
    name: suite.name,
    description: suite.description,
    taskCount: suite.tasks.length,
    ...(suite.optional ? { optional: true } : {}),
    categories: [...cats.entries()].map(([name, count]) => ({ name, count })),
    difficultyHistogram: hist,
    meanDifficulty: suite.tasks.length ? Math.round((sum / suite.tasks.length) * 1000) / 1000 : 0,
    hardTaskCount: suite.tasks.filter((t) => t.difficulty >= HARD_MIN_DIFFICULTY).length,
    examples: examples.map((t) => ({
      id: t.id,
      category: t.category,
      difficulty: t.difficulty,
      prompt: truncate(t.messages.map((m) => m.content).join("\n\n"), EXAMPLE_PROMPT_CHARS),
      expected: truncate(t.expected, 400),
    })),
  };
}
