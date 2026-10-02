import type { BenchSuite } from "../types";
import { FORMAT, hash32, makeTask, pick, randInt, rng, shuffle, type Rand, type TaskInput } from "./util";

const SUITE = "long-context";

/**
 * Needle-in-a-haystack tasks generated deterministically from a seed. Filler is bland,
 * digit-free prose so the planted facts are the only numbers/codes in the document.
 * Difficulty grows with haystack length, needle depth, distractors and multi-hop needs.
 */

const SUBJECTS = [
  "The village council",
  "A group of local farmers",
  "The harbor authority",
  "Several historians",
  "The regional weather service",
  "The museum volunteers",
  "A committee of teachers",
  "The railway workers",
  "The botanical society",
  "Residents of the eastern quarter",
  "The town choir",
  "A visiting delegation",
  "The maintenance crew",
  "The fishing cooperative",
  "Students from the college",
  "The parish newsletter",
];

const VERBS = [
  "discussed",
  "reviewed",
  "documented",
  "postponed",
  "celebrated",
  "examined",
  "reorganized",
  "described",
  "questioned",
  "photographed",
  "debated",
  "summarized",
  "planned",
  "praised",
];

const OBJECTS = [
  "the seasonal migration of geese over the marshes",
  "plans for a wooden footbridge across the river",
  "the history of the old textile mills",
  "changes to the weekend bus timetable",
  "the slow restoration of the clock tower",
  "a proposal to plant more chestnut trees",
  "the quality of the spring harvest",
  "the drainage problems near the market square",
  "an exhibition of watercolor landscapes",
  "the condition of the coastal paths",
  "new lighting for the narrow lanes",
  "the annual lantern procession",
  "a shortage of volunteers for the library",
  "the habits of the herons nesting by the lake",
  "the cost of repairing the stone walls",
  "a collection of letters from former sailors",
];

const TAILS = [
  "during a long afternoon meeting.",
  "after weeks of careful preparation.",
  "with mixed results.",
  "despite heavy rain throughout the day.",
  "in considerable detail.",
  "to the surprise of many residents.",
  "while the bells rang in the distance.",
  "and promised to return to the topic later.",
  "without reaching any firm conclusion.",
  "in a report that few people read.",
  "over cups of strong tea.",
  "before the light began to fade.",
];

const CONNECTORS = ["Meanwhile,", "Later that season,", "In the same week,", "Elsewhere,", "Not long after,", "As usual,"];

const PLACES = [
  "Lisbon",
  "Oslo",
  "Quito",
  "Hanoi",
  "Nairobi",
  "Tbilisi",
  "Perth",
  "Calgary",
  "Valencia",
  "Krakow",
  "Osaka",
  "Dakar",
  "Tallinn",
  "Cusco",
];

const PEOPLE = ["Ingrid Halvorsen", "Mateo Ruiz", "Amara Okoye", "Yuki Tanaka", "Felix Brandt", "Selin Kaya", "Ravi Menon"];

function sentence(r: Rand): string {
  const s = `${pick(r, SUBJECTS)} ${pick(r, VERBS)} ${pick(r, OBJECTS)} ${pick(r, TAILS)}`;
  return r() < 0.2 ? `${pick(r, CONNECTORS)} ${s.charAt(0).toLowerCase()}${s.slice(1)}` : s;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Filler sentences totalling at least `words` words. */
function filler(r: Rand, words: number): string[] {
  const out: string[] = [];
  let n = 0;
  while (n < words) {
    const s = sentence(r);
    out.push(s);
    n += wordCount(s);
  }
  return out;
}

/** Insert needle sentences at relative depths (0..1) and group into paragraphs. */
function plant(r: Rand, words: number, needles: { depth: number; text: string }[]): string {
  const sents = filler(r, words);
  const sorted = needles.slice().sort((a, b) => b.depth - a.depth);
  for (const nd of sorted) {
    const idx = Math.max(0, Math.min(sents.length, Math.round(nd.depth * sents.length)));
    sents.splice(idx, 0, nd.text);
  }
  const paras: string[] = [];
  for (let i = 0; i < sents.length; ) {
    const len = randInt(r, 4, 8);
    paras.push(sents.slice(i, i + len).join(" "));
    i += len;
  }
  return paras.join("\n\n");
}

function code(r: Rand, used: Set<string>): string {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (;;) {
    const c = `${randInt(r, 1000, 9999)}-${L[randInt(r, 0, L.length - 1)]}${L[randInt(r, 0, L.length - 1)]}`;
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
  }
}

function wrap(doc: string, question: string, format: string): string {
  return `Below is a long document. Read it carefully and answer the question that follows it.\n\n<document>\n${doc}\n</document>\n\nQuestion: ${question}\n${format}`;
}

function sizeDifficulty(words: number): number {
  // 500 words -> ~0.15, 8000 words -> ~0.6
  return 0.15 + 0.45 * Math.min(1, Math.log(words / 500) / Math.log(16));
}

function depthPenalty(depth: number): number {
  // Middle-of-context needles are the classic failure mode ("lost in the middle").
  return 0.08 * (1 - Math.abs(depth - 0.5) * 2);
}

const CODE_FORMAT = "End your reply with a final line of the form `Answer: <code>` (for example `Answer: 1234-AB`).";

function singleNeedle(words: number, depth: number, distractors: number): TaskInput {
  const id = `needle-${words}w-d${Math.round(depth * 100)}${distractors ? `-x${distractors}` : ""}`;
  const r = rng(hash32(`${SUITE}:${id}`));
  const used = new Set<string>();
  const places = shuffle(r, PLACES);
  const target = places[0];
  const answer = code(r, used);
  const needles = [{ depth, text: `The access code for the ${target} archive is ${answer}.` }];
  const decoys: string[] = [];
  for (let i = 0; i < distractors; i++) {
    const c = code(r, used);
    decoys.push(c);
    needles.push({ depth: (depth + 0.3 + 0.35 * i) % 1, text: `The access code for the ${places[i + 1]} archive is ${c}.` });
  }
  const doc = plant(r, words, needles);
  return {
    id,
    category: distractors ? "needle-distractors" : "needle",
    difficulty: sizeDifficulty(words) + depthPenalty(depth) + 0.1 * Math.min(distractors, 2),
    prompt: wrap(doc, `What is the access code for the ${target} archive?`, CODE_FORMAT),
    expected: answer,
    grader: { kind: "contains", any: [answer], ...(decoys.length ? { none: decoys } : {}) },
    tags: [`words:${words}`, `depth:${depth}`],
  };
}

function sumNeedles(words: number): TaskInput {
  const id = `sum-${words}w`;
  const r = rng(hash32(`${SUITE}:${id}`));
  const [a, b, c] = shuffle(r, ["north", "south", "east", "west", "river", "hill"]);
  const na = randInt(r, 120, 980);
  const nb = randInt(r, 120, 980);
  const nc = randInt(r, 120, 980);
  const doc = plant(r, words, [
    { depth: 0.15, text: `The ${a} warehouse currently holds ${na} crates of salt.` },
    { depth: 0.5, text: `The ${c} warehouse currently holds ${nc} crates of salt.` },
    { depth: 0.85, text: `The ${b} warehouse currently holds ${nb} crates of salt.` },
  ]);
  return {
    id,
    category: "multi-needle",
    difficulty: sizeDifficulty(words) + 0.2,
    prompt: wrap(doc, `How many crates of salt do the ${a} warehouse and the ${b} warehouse hold in total?`, FORMAT.number),
    expected: String(na + nb),
    grader: { kind: "numeric" },
    tags: [`words:${words}`],
  };
}

function updatedNeedle(words: number): TaskInput {
  const id = `update-${words}w`;
  const r = rng(hash32(`${SUITE}:${id}`));
  const used = new Set<string>();
  const place = pick(r, PLACES);
  const oldCode = code(r, used);
  const newCode = code(r, used);
  const doc = plant(r, words, [
    { depth: 0.2, text: `The access code for the ${place} archive is ${oldCode}.` },
    { depth: 0.75, text: `Correction: the access code for the ${place} archive has been changed to ${newCode}, and the old code no longer works.` },
  ]);
  return {
    id,
    category: "needle-update",
    difficulty: sizeDifficulty(words) + 0.2,
    prompt: wrap(doc, `What is the current access code for the ${place} archive?`, CODE_FORMAT),
    expected: newCode,
    grader: { kind: "contains", any: [newCode], none: [oldCode] },
    tags: [`words:${words}`],
  };
}

function multiHop(words: number): TaskInput {
  const id = `hop-${words}w`;
  const r = rng(hash32(`${SUITE}:${id}`));
  const [place, otherPlace] = shuffle(r, PLACES);
  const [keeper, other] = shuffle(r, PEOPLE);
  const badge = randInt(r, 100, 999);
  let otherBadge = randInt(r, 100, 999);
  if (otherBadge === badge) otherBadge = badge + 1;
  const doc = plant(r, words, [
    { depth: 0.1, text: `${other} holds badge number ${otherBadge}.` },
    { depth: 0.3, text: `The key to the ${place} archive is kept by ${keeper}.` },
    { depth: 0.55, text: `The key to the ${otherPlace} archive is kept by ${other}.` },
    { depth: 0.8, text: `${keeper} holds badge number ${badge}.` },
  ]);
  return {
    id,
    category: "multi-hop",
    difficulty: sizeDifficulty(words) + 0.3,
    prompt: wrap(doc, `What is the badge number of the person who keeps the key to the ${place} archive?`, FORMAT.number),
    expected: String(badge),
    grader: { kind: "numeric" },
    tags: [`words:${words}`],
  };
}

function build(): TaskInput[] {
  const tasks: TaskInput[] = [];
  for (const words of [500, 1500, 3000, 6000]) {
    for (const depth of [0.1, 0.5, 0.9]) tasks.push(singleNeedle(words, depth, words >= 3000 ? 2 : 0));
  }
  tasks.push(singleNeedle(1500, 0.5, 2));
  for (const words of [1500, 4000, 7000]) tasks.push(sumNeedles(words));
  for (const words of [2000, 5000, 8000]) tasks.push(updatedNeedle(words));
  for (const words of [3000, 6000]) tasks.push(multiHop(words));
  return tasks;
}

export const longContextSuite: BenchSuite = {
  id: SUITE,
  name: "Long context",
  description:
    "Seeded needle-in-a-haystack: planted facts at varying depths in 500–8000 words of filler, with distractor needles, superseded values, multi-needle sums and two-hop lookups.",
  tasks: build().map((t) => makeTask(SUITE, t)),
};
