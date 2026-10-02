import type { BenchSuite } from "../types";
import { FORMAT, makeTask, type TaskInput } from "./util";

const SUITE = "reasoning";
const N = FORMAT.number;
const ABC = FORMAT.choice("A, B or C");
const ABCD = FORMAT.choice("A, B, C or D");

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  const out: T[][] = [];
  xs.forEach((x, i) => {
    for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...p]);
  });
  return out;
}

/**
 * Ordering puzzle: the clue texts and the `check` predicate must say the same thing.
 * The answer is derived by brute force and suites.test.ts asserts it is unique.
 */
export interface OrderingPuzzle {
  id: string;
  difficulty: number;
  intro: string;
  items: string[];
  clues: string[];
  question: string;
  check: (pos: Record<string, number>) => boolean;
}

export const ORDERING_PUZZLES: OrderingPuzzle[] = [
  {
    id: "order-race",
    difficulty: 0.35,
    intro: "Four runners (Ava, Ben, Cara and Dev) finished a race with no ties.",
    items: ["Ava", "Ben", "Cara", "Dev"],
    clues: [
      "Ben finished ahead of Cara.",
      "Ava finished immediately after Dev.",
      "Cara did not finish last.",
      "Dev did not finish first.",
    ],
    question: "List the runners from first to last.",
    check: (p) => p.Ben < p.Cara && p.Ava === p.Dev + 1 && p.Cara !== 3 && p.Dev !== 0,
  },
  {
    id: "order-books",
    difficulty: 0.5,
    intro: "Five books (red, blue, green, yellow and white) stand on a shelf in a single row, positions 1 to 5 from left to right.",
    items: ["red", "blue", "green", "yellow", "white"],
    clues: [
      "The green book is immediately to the right of the red book.",
      "The blue book is somewhere to the left of the red book.",
      "The white book is not at the right end.",
      "The yellow book is not at the left end.",
      "The white book is next to the blue book.",
      "The yellow book is somewhere to the right of the white book.",
      "The blue book is not at the left end.",
      "The yellow book is not next to the blue book.",
    ],
    question: "List the book colors from left to right.",
    check: (p) =>
      p.green === p.red + 1 &&
      p.blue < p.red &&
      p.white !== 4 &&
      p.yellow !== 0 &&
      Math.abs(p.white - p.blue) === 1 &&
      p.yellow > p.white &&
      p.blue !== 0 &&
      Math.abs(p.yellow - p.blue) !== 1,
  },
  {
    id: "order-meetings",
    difficulty: 0.5,
    intro:
      "Five team meetings (Legal, Sales, HR, IT and Design) are scheduled one per day, Monday through Friday.",
    items: ["Legal", "Sales", "HR", "IT", "Design"],
    clues: [
      "HR meets on an earlier day than IT.",
      "Sales meets on Wednesday.",
      "Legal and Design do not meet on consecutive days.",
      "Design meets later in the week than Sales.",
      "IT does not meet on Friday.",
      "Legal does not meet on Monday.",
    ],
    question: "List the meetings from Monday to Friday.",
    check: (p) =>
      p.HR < p.IT && p.Sales === 2 && Math.abs(p.Legal - p.Design) !== 1 && p.Design > p.Sales && p.IT !== 4 && p.Legal !== 0,
  },
  {
    id: "order-queue",
    difficulty: 0.75,
    intro: "Six people (Fay, Gus, Hal, Ida, Jon and Kim) stand in a single-file queue, positions 1 (front) to 6 (back).",
    items: ["Fay", "Gus", "Hal", "Ida", "Jon", "Kim"],
    clues: [
      "Gus is somewhere in front of Fay.",
      "Hal is exactly two places behind Ida.",
      "Kim is neither at the front nor at the back.",
      "Jon is directly in front of Kim.",
      "Fay is not at the back.",
      "Ida is not at the front.",
      "Exactly one person stands between Gus and Jon.",
    ],
    question: "List the people from the front of the queue to the back.",
    check: (p) =>
      p.Gus < p.Fay &&
      p.Hal === p.Ida + 2 &&
      p.Kim !== 0 &&
      p.Kim !== 5 &&
      p.Kim === p.Jon + 1 &&
      p.Fay !== 5 &&
      p.Ida !== 0 &&
      Math.abs(p.Gus - p.Jon) === 2,
  },
];

export function solveOrdering(p: OrderingPuzzle): string[][] {
  return permutations(p.items).filter((order) => p.check(Object.fromEntries(order.map((n, i) => [n, i]))));
}

function orderingTask(p: OrderingPuzzle): TaskInput {
  const sols = solveOrdering(p);
  const answer = sols[0] ?? [];
  return {
    id: p.id,
    category: "ordering",
    difficulty: p.difficulty,
    prompt: `${p.intro}\n\n${p.clues.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\n${p.question} End your reply with a final line of the form \`Answer: <names in order, separated by commas>\`.`,
    expected: answer.join(", "),
    // Names in order, separated by anything that is not a letter (commas, arrows, "1." ...).
    grader: { kind: "regex", pattern: `^[^A-Za-z]*${answer.join("[^A-Za-z]+")}[^A-Za-z]*$`, flags: "i" },
  };
}

/** Knights always tell the truth; knaves always lie. Verified by brute force in tests. */
export const KNIGHTS_PUZZLES = [
  {
    id: "knights-two",
    people: ["Rosa", "Theo"],
    // statements as predicates over the assignment (true = knight)
    statements: [
      (k: Record<string, boolean>) => !k.Theo, // Rosa: "Theo is a knave."
      (k: Record<string, boolean>) => k.Rosa && k.Theo, // Theo: "Rosa and I are both knights."
    ],
    solution: { Rosa: true, Theo: false },
  },
  {
    id: "knights-three",
    people: ["Rosa", "Theo", "Uma"],
    statements: [
      (k: Record<string, boolean>) => !k.Rosa && !k.Theo && !k.Uma, // Rosa: "All three of us are knaves."
      (k: Record<string, boolean>) => [k.Rosa, k.Theo, k.Uma].filter(Boolean).length === 1, // Theo: "Exactly one of us is a knight."
      null, // Uma says nothing
    ],
    solution: { Rosa: false, Theo: true, Uma: false },
  },
] as const;

/** 3-house puzzle verified by brute force in tests. */
export const HOUSES_PUZZLE = {
  colors: ["red", "green", "blue"],
  pets: ["cat", "dog", "fish"],
  drinks: ["tea", "coffee", "milk"],
  check: (c: string[], pet: string[], d: string[]) =>
    c.indexOf("green") === c.indexOf("red") + 1 &&
    d.indexOf("coffee") === c.indexOf("green") &&
    d[1] === "milk" &&
    pet.indexOf("dog") !== c.indexOf("red") &&
    pet.indexOf("cat") === d.indexOf("tea"),
  answer: "red",
};

const TASKS: TaskInput[] = [
  // ---- syllogisms -------------------------------------------------------
  {
    id: "syl-transitive",
    category: "syllogism",
    difficulty: 0.12,
    prompt: `All bloops are razzies. All razzies are lazzies. Are all bloops definitely lazzies?\nA) Yes\nB) No\nC) Cannot be determined\n${ABC}`,
    expected: "A",
    grader: { kind: "choice", choices: ["A", "B", "C"] },
  },
  {
    id: "syl-some-some",
    category: "syllogism",
    difficulty: 0.35,
    prompt: `Some cats are black. Some black things are cars. Based only on these statements, is it true that some cats are cars?\nA) Yes, necessarily\nB) No, it is definitely false\nC) Cannot be determined\n${ABC}`,
    expected: "C",
    grader: { kind: "choice", choices: ["A", "B", "C"] },
  },
  {
    id: "syl-no-fish",
    category: "syllogism",
    difficulty: 0.25,
    prompt: `No fish are mammals. All whales are mammals. Which conclusion follows?\nA) No whales are fish\nB) Some whales are fish\nC) All fish are whales\nD) Nothing follows\n${ABCD}`,
    expected: "A",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },
  {
    id: "syl-undistributed",
    category: "syllogism",
    difficulty: 0.4,
    prompt: `All roses are flowers. Some flowers fade quickly. Does it follow that some roses fade quickly?\nA) Yes, necessarily\nB) No, it does not necessarily follow\nC) Only if the roses are red\n${ABC}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C"] },
  },
  {
    id: "syl-affirm-consequent",
    category: "syllogism",
    difficulty: 0.35,
    prompt: `If it rains, the street gets wet. The street is wet. Did it necessarily rain?\nA) Yes\nB) No, not necessarily\nC) It definitely did not rain\n${ABC}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C"] },
  },
  {
    id: "syl-modus-tollens",
    category: "syllogism",
    difficulty: 0.3,
    prompt: `If the alarm is armed, the panel light is red. The panel light is not red. What can you conclude?\nA) The alarm is armed\nB) The alarm is not armed\nC) Nothing can be concluded\n${ABC}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C"] },
  },

  // ---- logic puzzles ----------------------------------------------------
  {
    id: "knights-two",
    category: "logic",
    difficulty: 0.45,
    prompt: `On an island, knights always tell the truth and knaves always lie. Rosa says: "Theo is a knave." Theo says: "Rosa and I are both knights." What are they?\nA) Both are knights\nB) Rosa is a knight, Theo is a knave\nC) Rosa is a knave, Theo is a knight\nD) Both are knaves\n${ABCD}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },
  {
    id: "knights-three",
    category: "logic",
    difficulty: 0.65,
    prompt: `On an island, knights always tell the truth and knaves always lie. You meet Rosa, Theo and Uma. Rosa says: "All three of us are knaves." Theo says: "Exactly one of us is a knight." Uma says nothing. Who is a knight?\nA) Only Rosa\nB) Only Theo\nC) Only Uma\nD) Theo and Uma\n${ABCD}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },
  {
    id: "houses-fish",
    category: "logic",
    difficulty: 0.7,
    prompt: `Three houses stand in a row (left, middle, right). Each is painted a different color (red, green, blue), each owner keeps a different pet (cat, dog, fish) and drinks a different drink (tea, coffee, milk).\n1. The red house is immediately to the left of the green house.\n2. The owner of the green house drinks coffee.\n3. The owner of the middle house drinks milk.\n4. The dog does not live in the red house.\n5. The cat owner drinks tea.\nWhat color is the house where the fish lives? End your reply with a final line of the form \`Answer: <color>\`.`,
    expected: "red",
    grader: { kind: "contains", any: ["red"], none: ["green", "blue"] },
  },

  // ---- tricky / cognitive-reflection -----------------------------------
  {
    id: "trick-bat-ball",
    category: "tricky",
    difficulty: 0.3,
    prompt: `A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How many cents does the ball cost? ${N}`,
    expected: "5",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-widgets",
    category: "tricky",
    difficulty: 0.3,
    prompt: `If 5 machines take 5 minutes to make 5 widgets, how many minutes would 100 machines take to make 100 widgets? ${N}`,
    expected: "5",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-lily-pads",
    category: "tricky",
    difficulty: 0.3,
    prompt: `A patch of lily pads doubles in size every day. It takes 48 days to cover the whole lake. On which day was the lake half covered? ${N}`,
    expected: "47",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-sheep",
    category: "tricky",
    difficulty: 0.25,
    prompt: `A farmer has 17 sheep. All but 9 run away. How many sheep does the farmer have left? ${N}`,
    expected: "9",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-daughters",
    category: "tricky",
    difficulty: 0.3,
    prompt: `Mary's father has five daughters. Four of them are named Nana, Nene, Nini and Nono. What is the name of the fifth daughter? End your reply with a final line of the form \`Answer: <name>\`.`,
    expected: "Mary",
    grader: { kind: "contains", any: ["Mary"], none: ["Nunu"] },
  },
  {
    id: "trick-sisters",
    category: "tricky",
    difficulty: 0.45,
    prompt: `Sally (a girl) has 3 brothers. Each of her brothers has 2 sisters. How many sisters does Sally have? ${N}`,
    expected: "1",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-clock-strikes",
    category: "tricky",
    difficulty: 0.5,
    prompt: `A clock takes 5 seconds to strike 6 o'clock (6 strikes, evenly spaced, timed from the first strike to the last). How many seconds does it take to strike 12 o'clock? ${N}`,
    expected: "11",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-weighings",
    category: "tricky",
    difficulty: 0.5,
    prompt: `You have 9 identical-looking coins; one is slightly heavier than the others. Using a two-pan balance scale, what is the minimum number of weighings that guarantees you find the heavy coin? ${N}`,
    expected: "2",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-water-jugs",
    category: "tricky",
    difficulty: 0.75,
    prompt: `You have an unlimited water supply, an empty 3-liter jug and an empty 5-liter jug, with no markings. Each of these counts as one step: filling a jug completely, emptying a jug completely, or pouring from one jug into the other until the source is empty or the target is full. What is the minimum number of steps needed until one of the jugs contains exactly 4 liters? ${N}`,
    expected: "6",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-hen-and-a-half",
    category: "tricky",
    difficulty: 0.6,
    prompt: `If a hen and a half lays an egg and a half in a day and a half, how many eggs does one hen lay in 6 days (at the same rate)? ${N}`,
    expected: "4",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-snail",
    category: "tricky",
    difficulty: 0.5,
    prompt: `A snail is at the bottom of a 10-meter well. Each day it climbs up 3 meters, and each night it slides back down 2 meters. On which day does it first reach the top? ${N}`,
    expected: "8",
    grader: { kind: "numeric" },
  },
  {
    id: "trick-two-coins",
    category: "tricky",
    difficulty: 0.6,
    prompt: `I have two US coins that total 30 cents, and one of them is not a nickel. What are the two coins? End your reply with a final line of the form \`Answer: <coin> and <coin>\`.`,
    expected: "a quarter and a nickel",
    grader: { kind: "contains", all: ["quarter", "nickel"], none: ["dime", "penny"] },
  },
  {
    id: "trick-dice-conditional",
    category: "tricky",
    difficulty: 0.65,
    prompt: `Two fair six-sided dice are rolled. Given that at least one die shows a 3, what is the probability that the sum is 7? Give the answer as a fraction a/b in lowest terms or as a decimal rounded to 4 places. End your reply with a final line of the form \`Answer: <probability>\`.`,
    expected: "2/11",
    grader: { kind: "numeric", tolerance: 0.0005 },
  },
  {
    id: "trick-days-before-tomorrow",
    category: "tricky",
    difficulty: 0.55,
    prompt: `If three days before tomorrow was Monday, what day of the week is it today? End your reply with a final line of the form \`Answer: <day>\`.`,
    expected: "Wednesday",
    grader: {
      kind: "contains",
      any: ["Wednesday"],
      none: ["Monday", "Tuesday", "Thursday", "Friday", "Saturday", "Sunday"],
    },
  },

  // ---- multiple choice with distractors --------------------------------
  {
    id: "mc-prime",
    category: "multiple-choice",
    difficulty: 0.3,
    prompt: `Which of these numbers is prime?\nA) 91\nB) 87\nC) 97\nD) 51\n${ABCD}`,
    expected: "C",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },
  {
    id: "mc-overtake",
    category: "multiple-choice",
    difficulty: 0.3,
    prompt: `In a race, you overtake the person in second place. What position are you in now?\nA) First\nB) Second\nC) Third\nD) It depends on the race length\n${ABCD}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },
  {
    id: "mc-pills",
    category: "multiple-choice",
    difficulty: 0.4,
    prompt: `A doctor gives you 3 pills and tells you to take one every half hour, starting now. How long will the pills last?\nA) 30 minutes\nB) 60 minutes\nC) 90 minutes\nD) 120 minutes\n${ABCD}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },
  {
    id: "mc-monty-hall",
    category: "multiple-choice",
    difficulty: 0.4,
    prompt: `In the Monty Hall game, you pick one of three doors. The host, who knows where the car is, always opens a different door revealing a goat and offers you a switch. If you always switch, what is your probability of winning the car?\nA) 1/3\nB) 1/2\nC) 2/3\nD) 1\n${ABCD}`,
    expected: "C",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },
  {
    id: "mc-analogy",
    category: "multiple-choice",
    difficulty: 0.1,
    prompt: `Glove is to hand as sock is to:\nA) shoe\nB) foot\nC) knee\nD) leg\n${ABCD}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },
  {
    id: "mc-necessary-sufficient",
    category: "multiple-choice",
    difficulty: 0.55,
    prompt: `"You can vote only if you are registered." Which statement must be true?\nA) Everyone who is registered can vote\nB) Anyone who can vote is registered\nC) Anyone who is not able to vote is unregistered\nD) Registration guarantees voting\n${ABCD}`,
    expected: "B",
    grader: { kind: "choice", choices: ["A", "B", "C", "D"] },
  },

  // ---- sequences and calendars -----------------------------------------
  {
    id: "seq-fibonacci",
    category: "sequence",
    difficulty: 0.12,
    prompt: `What is the next number in the sequence 1, 1, 2, 3, 5, 8, 13, ...? ${N}`,
    expected: "21",
    grader: { kind: "numeric" },
  },
  {
    id: "seq-pronic",
    category: "sequence",
    difficulty: 0.3,
    prompt: `What is the next number in the sequence 2, 6, 12, 20, 30, ...? ${N}`,
    expected: "42",
    grader: { kind: "numeric" },
  },
  {
    id: "seq-doubling-minus",
    category: "sequence",
    difficulty: 0.35,
    prompt: `What is the next number in the sequence 3, 5, 9, 17, 33, ...? ${N}`,
    expected: "65",
    grader: { kind: "numeric" },
  },
  {
    id: "cal-100-days",
    category: "calendar",
    difficulty: 0.35,
    prompt: `Today is Wednesday. What day of the week will it be 100 days from today? End your reply with a final line of the form \`Answer: <day>\`.`,
    expected: "Friday",
    grader: {
      kind: "contains",
      any: ["Friday"],
      none: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday"],
    },
  },
];

export const reasoningSuite: BenchSuite = {
  id: SUITE,
  name: "Reasoning",
  description:
    "Syllogisms, knights-and-knaves, constraint-ordering puzzles (brute-force verified), cognitive-reflection traps and multiple choice with plausible distractors.",
  tasks: [...TASKS, ...ORDERING_PUZZLES.map(orderingTask)].map((t) => makeTask(SUITE, t)),
};
