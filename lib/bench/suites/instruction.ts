import type { BenchSuite, ConstraintCheck } from "../types";
import { FORMAT, makeTask, type TaskInput } from "./util";

const SUITE = "instruction";

interface InstructionTask {
  id: string;
  category: string;
  difficulty: number;
  prompt: string;
  checks: ConstraintCheck[];
  /** A reply that satisfies every check (used by the simulators; verified in tests). */
  example: string;
}

/**
 * IFEval-style tasks: every requirement in the prompt maps to a mechanically verifiable
 * check. Score = fraction of checks satisfied; correct = all satisfied.
 */
const TASKS: InstructionTask[] = [
  {
    id: "only-ok",
    category: "format",
    difficulty: 0.05,
    prompt: "Reply with the single word OK and nothing else.",
    checks: [
      { type: "exactLines", value: 1 },
      { type: "maxWords", value: 1 },
      { type: "startsWith", value: "OK" },
    ],
    example: "OK",
  },
  {
    id: "bullets-exercise",
    category: "lists",
    difficulty: 0.2,
    prompt:
      'List exactly 4 benefits of regular exercise as bullet points. Each bullet must start with "- " and be on its own line. Output nothing except the 4 bullets.',
    checks: [
      { type: "bulletCount", value: 4 },
      { type: "exactLines", value: 4 },
    ],
    example: "- Stronger heart and lungs\n- Better sleep\n- Improved mood\n- Healthier body weight",
  },
  {
    id: "five-colors",
    category: "lists",
    difficulty: 0.2,
    prompt: "Write exactly 5 lines. Each line must contain a single word naming a color. Output nothing else.",
    checks: [
      { type: "exactLines", value: 5 },
      { type: "minWords", value: 5 },
      { type: "maxWords", value: 5 },
    ],
    example: "red\norange\nyellow\ngreen\npurple",
  },
  {
    id: "caps-drill",
    category: "case",
    difficulty: 0.2,
    prompt:
      "Write one sentence announcing a fire drill. The entire reply must be in CAPITAL LETTERS, must contain the word DRILL, and must be at least 6 words long.",
    checks: [
      { type: "allUppercase" },
      { type: "includes", value: "drill" },
      { type: "minWords", value: 6 },
      { type: "exactLines", value: 1 },
    ],
    example: "ATTENTION: THE FIRE DRILL STARTS AT NOON TODAY.",
  },
  {
    id: "ocean-short",
    category: "length",
    difficulty: 0.25,
    prompt:
      'Describe the ocean in a single sentence of at most 12 words. The sentence must include the word "waves" and must not use the word "blue".',
    checks: [
      { type: "maxWords", value: 12 },
      { type: "includes", value: "waves" },
      { type: "excludes", value: "blue" },
      { type: "exactLines", value: 1 },
    ],
    example: "Restless waves carry salt and stories across the endless deep.",
  },
  {
    id: "title-brackets",
    category: "format",
    difficulty: 0.25,
    prompt:
      "Write a title for a blog post about saving money. Wrap the title in double angular brackets, like <<my title>>. Output only the title on one line, at most 10 words including the brackets.",
    checks: [
      { type: "startsWith", value: "<<" },
      { type: "endsWith", value: ">>" },
      { type: "exactLines", value: 1 },
      { type: "maxWords", value: 10 },
    ],
    example: "<<Small Habits That Quietly Grow Your Savings>>",
  },
  {
    id: "haiku-lower",
    category: "case",
    difficulty: 0.3,
    prompt:
      'Write a haiku about autumn in exactly 3 lines. Use only lowercase letters, do not use any commas, and include the word "autumn".',
    checks: [
      { type: "exactLines", value: 3 },
      { type: "allLowercase" },
      { type: "noCommas" },
      { type: "includes", value: "autumn" },
    ],
    example: "autumn leaves drifting\ncold wind hums through empty trees\nthe year exhales slow",
  },
  {
    id: "egg-steps",
    category: "lists",
    difficulty: 0.3,
    prompt:
      'Explain how to boil an egg in exactly 3 numbered steps formatted as "1.", "2." and "3.", each on its own line. Use the word "boil" at least once and keep the whole reply under 40 words.',
    checks: [
      { type: "bulletCount", value: 3 },
      { type: "exactLines", value: 3 },
      { type: "includes", value: "boil" },
      { type: "maxWords", value: 39 },
    ],
    example: "1. Place the egg in a pot of cold water.\n2. Bring the water to a boil and cook for nine minutes.\n3. Cool the egg in ice water before peeling.",
  },
  {
    id: "fruits-upper",
    category: "case",
    difficulty: 0.3,
    prompt:
      'List exactly 6 fruits as bullet points starting with "- ", one fruit per line, one word per fruit, written entirely in UPPERCASE. Output nothing else.',
    checks: [
      { type: "bulletCount", value: 6 },
      { type: "exactLines", value: 6 },
      { type: "allUppercase" },
      { type: "maxWords", value: 6 },
    ],
    example: "- APPLE\n- BANANA\n- CHERRY\n- MANGO\n- PEAR\n- KIWI",
  },
  {
    id: "dear-team",
    category: "start-end",
    difficulty: 0.3,
    prompt:
      'Write a short note to your team announcing that the office will close early on Friday. It must start with exactly "Dear team" and end with exactly "Thanks." and be between 10 and 40 words long.',
    checks: [
      { type: "startsWith", value: "Dear team" },
      { type: "endsWith", value: "Thanks." },
      { type: "minWords", value: 10 },
      { type: "maxWords", value: 40 },
    ],
    example: "Dear team, the office will close at 3 pm this Friday so everyone can start the weekend early. Please plan your work accordingly. Thanks.",
  },
  {
    id: "question-answer",
    category: "format",
    difficulty: 0.35,
    prompt:
      'Write exactly 2 lines: the first line is a question about space (ending with "?") and the second line answers it and ends with "!".',
    checks: [
      { type: "exactLines", value: 2 },
      { type: "includes", value: "?" },
      { type: "endsWith", value: "!" },
    ],
    example: "Which planet has the most moons?\nSaturn currently holds that record!",
  },
  {
    id: "cat-lowercase",
    category: "case",
    difficulty: 0.35,
    prompt:
      'Describe a cat in one line of at least 8 words, all in lowercase, without using the words "cute" or "fluffy".',
    checks: [
      { type: "exactLines", value: 1 },
      { type: "minWords", value: 8 },
      { type: "allLowercase" },
      { type: "excludes", value: "cute" },
      { type: "excludes", value: "fluffy" },
    ],
    example: "a sleek grey cat stretches slowly in the warm afternoon light",
  },
  {
    id: "summarize-curie",
    category: "length",
    difficulty: 0.35,
    prompt:
      'Summarize the following text in at most 15 words. Your summary must mention "Marie Curie" by name and use the word "radioactivity".\n\nText: Marie Curie was a physicist and chemist who conducted pioneering research on radioactivity. She was the first woman to win a Nobel Prize, the first person to win Nobel Prizes in two different sciences, and she discovered the elements polonium and radium together with her husband Pierre.',
    checks: [
      { type: "maxWords", value: 15 },
      { type: "includes", value: "Marie Curie" },
      { type: "includes", value: "radioactivity" },
    ],
    example: "Marie Curie pioneered radioactivity research, discovered polonium and radium, and won two Nobel Prizes.",
  },
  {
    id: "decline-meeting",
    category: "start-end",
    difficulty: 0.4,
    prompt:
      'Write a short email declining a meeting invitation. Start with exactly "Hi Sam" and end with exactly "Best, Alex". Use between 20 and 60 words and do not use the word "sorry".',
    checks: [
      { type: "startsWith", value: "Hi Sam" },
      { type: "endsWith", value: "Best, Alex" },
      { type: "minWords", value: 20 },
      { type: "maxWords", value: 60 },
      { type: "excludes", value: "sorry" },
    ],
    example:
      "Hi Sam,\nThank you for the invitation to Thursday's planning meeting. Unfortunately I have a prior commitment at that time and will not be able to attend. Please share the notes afterwards and I will follow up with any questions.\nBest, Alex",
  },
  {
    id: "coffee-tweet",
    category: "start-end",
    difficulty: 0.4,
    prompt:
      "Write a tweet of at most 25 words announcing the opening of a new coffee shop. It must include the hashtag #GrandOpening, end with the hashtag #Coffee, and contain no commas.",
    checks: [
      { type: "maxWords", value: 25 },
      { type: "includes", value: "#GrandOpening" },
      { type: "endsWith", value: "#Coffee" },
      { type: "noCommas" },
    ],
    example: "Fresh beans and friendly faces await you on Main Street starting Saturday morning! #GrandOpening #Coffee",
  },
  {
    id: "photosynthesis-no-sun",
    category: "length",
    difficulty: 0.45,
    prompt:
      'Explain photosynthesis in 20 to 40 words. Mention "chlorophyll", and do not use the words "sun" or "sunlight".',
    checks: [
      { type: "minWords", value: 20 },
      { type: "maxWords", value: 40 },
      { type: "includes", value: "chlorophyll" },
      { type: "excludes", value: "sun" },
      { type: "excludes", value: "sunlight" },
    ],
    example:
      "Plants capture light energy with chlorophyll and use it to turn water and carbon dioxide into glucose while releasing oxygen as a byproduct of the process.",
  },
  {
    id: "repeat-then-answer",
    category: "format",
    difficulty: 0.45,
    prompt:
      'First repeat the question "What is the boiling point of water at sea level?" word for word on its own line, then answer it on a second line using degrees Celsius. Output exactly two lines.',
    checks: [
      { type: "startsWith", value: "What is the boiling point of water at sea level?" },
      { type: "exactLines", value: 2 },
      { type: "includes", value: "100" },
    ],
    example: "What is the boiling point of water at sea level?\nWater boils at 100 degrees Celsius at sea level.",
  },
  {
    id: "no-articles",
    category: "lexical",
    difficulty: 0.55,
    prompt:
      'Write one sentence of at least 15 words about a family tradition. Do not use the words "the", "a", "an" or "and" anywhere.',
    checks: [
      { type: "exactLines", value: 1 },
      { type: "minWords", value: 15 },
      { type: "excludes", value: "the" },
      { type: "excludes", value: "a" },
      { type: "excludes", value: "an" },
      { type: "excludes", value: "and" },
    ],
    example:
      "My grandmother bakes fresh bread every Sunday morning, filling her small kitchen with warm smells that wake everyone up early.",
  },
  {
    id: "water-bottle",
    category: "combined",
    difficulty: 0.6,
    prompt:
      'Write a product description for a water bottle as exactly 3 bullet points, each starting with "* ". Use only lowercase letters, no commas, at most 30 words in total, include the word "leakproof", and do not use the word "plastic".',
    checks: [
      { type: "bulletCount", value: 3 },
      { type: "exactLines", value: 3 },
      { type: "allLowercase" },
      { type: "noCommas" },
      { type: "maxWords", value: 30 },
      { type: "includes", value: "leakproof" },
      { type: "excludes", value: "plastic" },
    ],
    example: "* leakproof lid keeps your bag dry\n* double steel walls hold cold drinks for a full day\n* fits most car cup holders",
  },
  {
    id: "limerick",
    category: "combined",
    difficulty: 0.6,
    prompt:
      'Write a limerick about a programmer in exactly 5 lines. The first line must start with "There once was", the poem must include the word "bug", contain no commas, and use at most 50 words.',
    checks: [
      { type: "exactLines", value: 5 },
      { type: "startsWith", value: "There once was" },
      { type: "includes", value: "bug" },
      { type: "noCommas" },
      { type: "maxWords", value: 50 },
    ],
    example:
      "There once was a coder named Lou\nwho found a strange bug in her queue\nshe patched it at night\nthen it all worked just right\nso she shipped it and went home at two",
  },
  {
    id: "moon-river",
    category: "combined",
    difficulty: 0.7,
    prompt:
      'Write a 4-line poem. Rules: exactly 4 lines, at most 28 words in total, all lowercase, no commas, include both "moon" and "river", never use the word "night", and the final line must end with a question mark.',
    checks: [
      { type: "exactLines", value: 4 },
      { type: "maxWords", value: 28 },
      { type: "allLowercase" },
      { type: "noCommas" },
      { type: "includes", value: "moon" },
      { type: "includes", value: "river" },
      { type: "excludes", value: "night" },
      { type: "endsWith", value: "?" },
    ],
    example: "the moon leans low\nto read the river's silver script\nboth keep moving slowly\nwhere do they go?",
  },
];

export const INSTRUCTION_TASKS = TASKS;

export const instructionSuite: BenchSuite = {
  id: SUITE,
  name: "Instruction following",
  description:
    "IFEval-style verifiable constraints: word and line limits, case, forbidden punctuation and words, required phrases, bullet counts and exact openings/endings. Score is the fraction of constraints met.",
  tasks: TASKS.map(
    (t): TaskInput => ({
      id: t.id,
      category: t.category,
      difficulty: t.difficulty,
      prompt: `${t.prompt}\n\n${FORMAT.freeform}`,
      expected: t.example,
      grader: { kind: "constraints", checks: t.checks },
    }),
  ).map((t) => makeTask(SUITE, t)),
};
