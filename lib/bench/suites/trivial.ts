import type { BenchSuite } from "../types";
import { FORMAT, makeTask, type TaskInput } from "./util";

const SUITE = "trivial";

/**
 * Sanity prompts any model gets right. A good router should send all of these to its
 * cheapest, fastest model, so this suite isolates over-escalation, latency and cost.
 */
const TASKS: TaskInput[] = [
  {
    id: "echo-word",
    category: "echo",
    difficulty: 0,
    prompt: "Repeat the word `pineapple` exactly once. End your reply with the line `Answer: pineapple`.",
    expected: "pineapple",
    grader: { kind: "exact" },
  },
  {
    id: "echo-phrase",
    category: "echo",
    difficulty: 0.02,
    prompt: `Repeat this phrase exactly: "green tea at noon". ${FORMAT.word}`,
    expected: "green tea at noon",
    grader: { kind: "exact" },
  },
  {
    id: "add-7-5",
    category: "arithmetic",
    difficulty: 0.02,
    prompt: `What is 7 + 5? ${FORMAT.number}`,
    expected: "12",
    grader: { kind: "numeric" },
  },
  {
    id: "mul-9-6",
    category: "arithmetic",
    difficulty: 0.03,
    prompt: `What is 9 times 6? ${FORMAT.number}`,
    expected: "54",
    grader: { kind: "numeric" },
  },
  {
    id: "sub-100-37",
    category: "arithmetic",
    difficulty: 0.05,
    prompt: `What is 100 minus 37? ${FORMAT.number}`,
    expected: "63",
    grader: { kind: "numeric" },
  },
  {
    id: "larger-of-two",
    category: "arithmetic",
    difficulty: 0.02,
    prompt: `Which number is larger: 8 or 3? ${FORMAT.number}`,
    expected: "8",
    grader: { kind: "numeric" },
  },
  {
    id: "days-in-week",
    category: "facts",
    difficulty: 0.02,
    prompt: `How many days are in a week? ${FORMAT.number}`,
    expected: "7",
    grader: { kind: "numeric" },
  },
  {
    id: "digits-twelve",
    category: "formatting",
    difficulty: 0.03,
    prompt: `Write the number "twelve" using digits. ${FORMAT.number}`,
    expected: "12",
    grader: { kind: "numeric" },
  },
  {
    id: "uppercase",
    category: "formatting",
    difficulty: 0.05,
    prompt: "Convert `hello world` to uppercase. End your reply with a final line `Answer: <converted text>`.",
    expected: "HELLO WORLD",
    grader: { kind: "exact", caseSensitive: true },
  },
  {
    id: "reverse-word",
    category: "formatting",
    difficulty: 0.08,
    prompt: "Write the letters of the word `stop` in reverse order. End your reply with a final line `Answer: <reversed word>`.",
    expected: "pots",
    grader: { kind: "exact" },
  },
  {
    id: "sort-three",
    category: "formatting",
    difficulty: 0.06,
    prompt:
      "Sort these numbers in ascending order: 3, 1, 2. End your reply with a final line `Answer: <numbers separated by commas>`.",
    expected: "1, 2, 3",
    grader: { kind: "regex", pattern: "^\\[?\\s*1\\s*,\\s*2\\s*,\\s*3\\s*\\]?$" },
  },
  {
    id: "count-words",
    category: "formatting",
    difficulty: 0.06,
    prompt: `How many words are in the sentence "the quick brown fox"? ${FORMAT.number}`,
    expected: "4",
    grader: { kind: "numeric" },
  },
  {
    id: "capital-france",
    category: "facts",
    difficulty: 0.02,
    prompt: `What is the capital of France? ${FORMAT.word}`,
    expected: "Paris",
    grader: { kind: "contains", any: ["Paris"] },
  },
  {
    id: "mix-colors",
    category: "facts",
    difficulty: 0.04,
    prompt: `What color do you get by mixing blue and yellow paint? ${FORMAT.word}`,
    expected: "green",
    grader: { kind: "contains", any: ["green"] },
  },
  {
    id: "translate-hola",
    category: "facts",
    difficulty: 0.05,
    prompt: `Translate the Spanish greeting "hola" into English (one word). ${FORMAT.word}`,
    expected: "hello",
    grader: { kind: "contains", any: ["hello", "hi"] },
  },
  {
    id: "even-yes-no",
    category: "classification",
    difficulty: 0.03,
    prompt: "Is 10 an even number? End your reply with a final line `Answer: yes` or `Answer: no`.",
    expected: "yes",
    grader: { kind: "choice", choices: ["yes", "no"] },
  },
  {
    id: "json-ok",
    category: "formatting",
    difficulty: 0.08,
    prompt: 'Return a JSON object with a single key "ok" whose value is the boolean true. ' + FORMAT.json,
    expected: '{"ok":true}',
    grader: { kind: "json", requiredKeys: ["ok"], expectedValues: { ok: true } },
  },
];

export const trivialSuite: BenchSuite = {
  id: SUITE,
  name: "Trivial",
  description:
    "Sanity prompts any model answers correctly (echo, 7+5, simple formatting). A good router keeps these on the cheapest, fastest model; escalation here is pure waste.",
  tasks: TASKS.map((t) => makeTask(SUITE, t)),
};
