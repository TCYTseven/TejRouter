import type { BenchSuite } from "../types";
import { FORMAT, makeTask, type TaskInput } from "./util";

const SUITE = "rephrase";

/**
 * Nine questions, each asked three ways. Every phrasing of a question has the same answer
 * and the same difficulty, so a router that is stable should pick the same model and get
 * the same result for all three. Tasks share a `group:<id>` tag.
 */

const GROUPS: { id: string; category: string; difficulty: number; expected: string; format: string; phrasings: string[] }[] = [
  {
    id: "capital-australia",
    category: "fact",
    difficulty: 0.2,
    expected: "Canberra",
    format: FORMAT.word,
    phrasings: [
      "What is the capital city of Australia?",
      "Australia's capital is which city?",
      "Name the city that is the seat of Australia's federal government.",
    ],
  },
  {
    id: "gold-symbol",
    category: "fact",
    difficulty: 0.15,
    expected: "Au",
    format: FORMAT.word,
    phrasings: [
      "What is the chemical symbol for gold?",
      "Which symbol on the periodic table stands for gold?",
      "In chemistry, gold is written with which one- or two-letter symbol?",
    ],
  },
  {
    id: "mul-17-23",
    category: "arithmetic",
    difficulty: 0.3,
    expected: "391",
    format: FORMAT.number,
    phrasings: [
      "What is 17 multiplied by 23?",
      "Compute 17 × 23.",
      "There are 23 boxes with 17 pens in each box. How many pens are there in total?",
    ],
  },
  {
    id: "minutes-week",
    category: "arithmetic",
    difficulty: 0.3,
    expected: "10080",
    format: FORMAT.number,
    phrasings: ["How many minutes are there in a week?", "A week lasts how many minutes?", "Convert one week (7 days) into minutes."],
  },
  {
    id: "shortest",
    category: "logic",
    difficulty: 0.35,
    expected: "Carol",
    format: FORMAT.word,
    phrasings: [
      "Alice is taller than Bob. Bob is taller than Carol. Who is the shortest of the three?",
      "Bob is shorter than Alice, and Carol is shorter than Bob. Which of the three people is the shortest?",
      "Of Alice, Bob and Carol: Alice is taller than Bob, and Carol is shorter than Bob. Give the name of the shortest person.",
    ],
  },
  {
    id: "weekday-30",
    category: "logic",
    difficulty: 0.4,
    expected: "Thursday",
    format: FORMAT.word,
    phrasings: [
      "If today is Tuesday, what day of the week will it be 30 days from now?",
      "Which weekday falls exactly 30 days after a Tuesday?",
      "Start on a Tuesday and count forward 30 days. Which day of the week do you land on?",
    ],
  },
  {
    id: "primes-30",
    category: "arithmetic",
    difficulty: 0.45,
    expected: "10",
    format: FORMAT.number,
    phrasings: [
      "How many prime numbers are less than 30?",
      "Count the primes p with p < 30.",
      "Of the whole numbers from 1 to 29, how many are prime?",
    ],
  },
  {
    id: "train-speed",
    category: "word-problem",
    difficulty: 0.5,
    expected: "80",
    format: FORMAT.number,
    phrasings: [
      "A train travels 180 km in 2 hours and 15 minutes. What is its average speed in km/h?",
      "Covering 180 kilometres takes a train 2.25 hours. Give its average speed in kilometres per hour.",
      "What average speed, in km/h, does a train need to go 180 km in 135 minutes?",
    ],
  },
  {
    id: "hexagon-angles",
    category: "geometry",
    difficulty: 0.6,
    expected: "720",
    format: FORMAT.number,
    phrasings: [
      "What is the sum of the interior angles of a hexagon, in degrees?",
      "Add up all six interior angles of a convex hexagon. How many degrees do you get?",
      "A polygon has six sides. What do its interior angles total, in degrees?",
    ],
  },
];

const TASKS: TaskInput[] = GROUPS.flatMap((g) =>
  g.phrasings.map((p, i) => ({
    id: `${g.id}-${String.fromCharCode(97 + i)}`,
    category: g.category,
    difficulty: g.difficulty,
    prompt: `${p} ${g.format}`,
    expected: g.expected,
    grader: g.format === FORMAT.number ? { kind: "numeric" as const } : { kind: "exact" as const },
    tags: [`group:${g.id}`],
  })),
);

export const rephraseSuite: BenchSuite = {
  id: SUITE,
  name: "Rephrasings",
  description:
    "Nine questions, each asked three different ways. A stable router picks the same model and gets the same answer for every phrasing of a question.",
  optional: true,
  tasks: TASKS.map((t) => makeTask(SUITE, t)),
};
