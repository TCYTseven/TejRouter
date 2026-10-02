import type { BenchSuite, GraderSpec } from "../types";
import { FORMAT, makeTask, type TaskInput } from "./util";

const SUITE = "knowledge";

interface Fact {
  id: string;
  category: "science" | "geography" | "history" | "arts";
  difficulty: number;
  q: string;
  /** Canonical answer (first alias is used as `expected`). */
  a: string;
  /** Accepted spellings/aliases besides `a`. */
  aliases?: string[];
  /** Phrases that indicate a wrong or hedged answer. */
  none?: string[];
  /** Numeric answers (years, counts) use the numeric grader. */
  numeric?: boolean;
  /** Require every listed phrase instead of any alias. */
  all?: string[];
}

/** Stable, unambiguous facts only: nothing that changes with time or depends on definitions. */
const FACTS: Fact[] = [
  // ---- science ----------------------------------------------------------
  { id: "sci-red-planet", category: "science", difficulty: 0.03, q: "Which planet is known as the Red Planet?", a: "Mars" },
  { id: "sci-gold-symbol", category: "science", difficulty: 0.1, q: "What is the chemical symbol for gold?", a: "Au" },
  { id: "sci-carbon-z", category: "science", difficulty: 0.15, q: "What is the atomic number of carbon?", a: "6", numeric: true },
  {
    id: "sci-photosynthesis-gas",
    category: "science",
    difficulty: 0.1,
    q: "Which gas do plants absorb from the air for photosynthesis?",
    a: "carbon dioxide",
    aliases: ["CO2", "CO₂"],
    none: ["oxygen"],
  },
  { id: "sci-neutral-particle", category: "science", difficulty: 0.1, q: "Which subatomic particle in the nucleus has no electric charge?", a: "neutron" },
  { id: "sci-longest-bone", category: "science", difficulty: 0.2, q: "What is the longest bone in the human body?", a: "femur", aliases: ["thigh bone", "thighbone"] },
  { id: "sci-mohs-10", category: "science", difficulty: 0.2, q: "Which mineral has a hardness of 10 on the Mohs scale?", a: "diamond" },
  { id: "sci-resistance-unit", category: "science", difficulty: 0.25, q: "What is the SI unit of electrical resistance?", a: "ohm", aliases: ["ohms", "Ω"] },
  { id: "sci-chromosomes", category: "science", difficulty: 0.25, q: "How many chromosomes are in a typical human body (somatic) cell?", a: "46", numeric: true },
  { id: "sci-titan", category: "science", difficulty: 0.3, q: "What is the largest moon of Saturn?", a: "Titan" },
  { id: "sci-electronegativity", category: "science", difficulty: 0.4, q: "Which element has the highest electronegativity on the Pauling scale?", a: "fluorine" },
  { id: "sci-sb", category: "science", difficulty: 0.5, q: "Which element has the chemical symbol Sb?", a: "antimony" },
  { id: "sci-xenon", category: "science", difficulty: 0.55, q: "Which noble gas has atomic number 54?", a: "xenon" },
  { id: "sci-helicase", category: "science", difficulty: 0.55, q: "Which enzyme unwinds the DNA double helix during replication?", a: "helicase", aliases: ["DNA helicase"] },
  { id: "sci-weber", category: "science", difficulty: 0.6, q: "What is the SI unit of magnetic flux?", a: "weber", aliases: ["webers", "Wb"], none: ["tesla"] },
  { id: "sci-mitochondria-dna", category: "science", difficulty: 0.45, q: "Besides the nucleus, which organelle in animal cells contains its own DNA?", a: "mitochondrion", aliases: ["mitochondria"] },

  // ---- geography --------------------------------------------------------
  { id: "geo-canada", category: "geography", difficulty: 0.08, q: "What is the capital of Canada?", a: "Ottawa" },
  { id: "geo-australia", category: "geography", difficulty: 0.2, q: "What is the capital of Australia?", a: "Canberra", none: ["Sydney"] },
  { id: "geo-sa-river", category: "geography", difficulty: 0.15, q: "What is the longest river in South America?", a: "Amazon" },
  { id: "geo-indian-ocean", category: "geography", difficulty: 0.15, q: "Which ocean lies between Africa and Australia?", a: "Indian Ocean", aliases: ["Indian"] },
  { id: "geo-kilimanjaro", category: "geography", difficulty: 0.2, q: "What is the highest mountain in Africa?", a: "Kilimanjaro", aliases: ["Kibo"] },
  { id: "geo-gibraltar", category: "geography", difficulty: 0.3, q: "Which strait separates Spain from Morocco and connects the Atlantic Ocean to the Mediterranean Sea?", a: "Strait of Gibraltar", aliases: ["Gibraltar"] },
  { id: "geo-mongolia", category: "geography", difficulty: 0.45, q: "What is the capital of Mongolia?", a: "Ulaanbaatar", aliases: ["Ulan Bator", "Ulan-Bator", "Ulaanbaatar", "Ulanbator"] },
  { id: "geo-lesotho", category: "geography", difficulty: 0.55, q: "Which country is entirely surrounded by South Africa?", a: "Lesotho" },
  { id: "geo-burkina", category: "geography", difficulty: 0.6, q: "What is the capital of Burkina Faso?", a: "Ouagadougou" },
  { id: "geo-tasmania-strait", category: "geography", difficulty: 0.65, q: "Which strait separates the island of Tasmania from mainland Australia?", a: "Bass Strait", aliases: ["Bass"] },

  // ---- history ----------------------------------------------------------
  { id: "his-moon-walk", category: "history", difficulty: 0.05, q: "Who was the first person to walk on the Moon?", a: "Neil Armstrong", aliases: ["Armstrong"] },
  { id: "his-berlin-wall", category: "history", difficulty: 0.2, q: "In what year did the Berlin Wall fall?", a: "1989", numeric: true },
  { id: "his-hastings", category: "history", difficulty: 0.25, q: "In what year was the Battle of Hastings fought?", a: "1066", numeric: true },
  { id: "his-constantinople", category: "history", difficulty: 0.45, q: "In what year did Constantinople fall to the Ottoman Empire?", a: "1453", numeric: true },
  { id: "his-westphalia", category: "history", difficulty: 0.65, q: "In what year was the Peace of Westphalia signed, ending the Thirty Years' War?", a: "1648", numeric: true },
  {
    id: "his-tordesillas",
    category: "history",
    difficulty: 0.5,
    q: "The 1494 Treaty of Tordesillas divided newly discovered lands between which two countries?",
    a: "Spain and Portugal",
    all: ["Spain", "Portugal"],
  },
  { id: "his-pharos", category: "history", difficulty: 0.4, q: "Which of the Seven Wonders of the Ancient World stood in Alexandria?", a: "Lighthouse of Alexandria", aliases: ["Lighthouse", "Pharos"] },
  {
    id: "his-qin",
    category: "history",
    difficulty: 0.6,
    q: "Who was the first emperor of a unified China (founder of the Qin dynasty)?",
    a: "Qin Shi Huang",
    aliases: ["Qin Shihuang", "Shi Huangdi", "Qin Shi Huangdi", "Ying Zheng", "Shihuangdi"],
  },
  { id: "his-magna-carta", category: "history", difficulty: 0.35, q: "In what year was the Magna Carta first sealed by King John?", a: "1215", numeric: true },

  // ---- arts & letters ---------------------------------------------------
  { id: "art-austen", category: "arts", difficulty: 0.1, q: "Who wrote the novel Pride and Prejudice?", a: "Jane Austen", aliases: ["Austen"] },
  { id: "art-marquez", category: "arts", difficulty: 0.35, q: "Who wrote the novel One Hundred Years of Solitude?", a: "Gabriel García Márquez", aliases: ["García Márquez", "Garcia Marquez", "Márquez", "Marquez"] },
  { id: "art-stravinsky", category: "arts", difficulty: 0.45, q: "Which composer wrote the ballet The Rite of Spring?", a: "Igor Stravinsky", aliases: ["Stravinsky"] },
  { id: "art-bosch", category: "arts", difficulty: 0.55, q: "Which painter created the triptych The Garden of Earthly Delights?", a: "Hieronymus Bosch", aliases: ["Bosch"] },
  { id: "sci-godel", category: "science", difficulty: 0.55, q: "Which logician proved the incompleteness theorems in 1931?", a: "Kurt Gödel", aliases: ["Gödel", "Godel", "Goedel"] },
];

function graderFor(f: Fact): GraderSpec {
  if (f.numeric) return { kind: "numeric" };
  if (f.all) return { kind: "contains", all: f.all, ...(f.none ? { none: f.none } : {}) };
  return { kind: "contains", any: [f.a, ...(f.aliases ?? [])], ...(f.none ? { none: f.none } : {}) };
}

const TASKS: TaskInput[] = FACTS.map((f) => ({
  id: f.id,
  category: f.category,
  difficulty: f.difficulty,
  prompt: `${f.q} Answer briefly. ${f.numeric ? FORMAT.number : FORMAT.word}`,
  expected: f.a,
  grader: graderFor(f),
}));

export const knowledgeSuite: BenchSuite = {
  id: SUITE,
  name: "Knowledge",
  description:
    "Stable factual questions in science, geography, history and the arts with short unambiguous answers, from household facts to obscure capitals and dates.",
  tasks: TASKS.map((t) => makeTask(SUITE, t)),
};
