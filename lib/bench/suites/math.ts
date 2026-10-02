import type { BenchSuite } from "../types";
import { FORMAT, binom, factorial, hash32, pick, randInt, rng, type Rand, type TaskInput, makeTask } from "./util";

const SUITE = "math";
const N = FORMAT.number;

/**
 * Math problems whose answers are computed in code from seeded random parameters, so they
 * are correct by construction. Hand-written competition problems are re-verified by brute
 * force in suites.test.ts.
 */

type Gen = (r: Rand) => { prompt: string; answer: number; meta?: string };

interface GenSpec {
  id: string;
  category: string;
  difficulty: number;
  gen: Gen;
  /** Decimal places to print the answer with (default: integer). */
  decimals?: number;
}

const NAMES = ["Maya", "Omar", "Lena", "Diego", "Priya", "Tomás", "Aiko", "Noah", "Zara", "Ivan"];
const ITEMS = ["notebooks", "candles", "jars of honey", "potted plants", "bike lights", "puzzles"];

/** base^exp mod m for small moduli (m² stays far below 2^53). */
function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  base %= mod;
  while (exp > 0) {
    if (exp % 2 === 1) result = (result * base) % mod;
    base = (base * base) % mod;
    exp = Math.floor(exp / 2);
  }
  return result;
}

const GENERATED: GenSpec[] = [
  // ---- arithmetic -------------------------------------------------------
  {
    id: "mul-2x2",
    category: "arithmetic",
    difficulty: 0.08,
    gen: (r) => {
      const a = randInt(r, 12, 99);
      const b = randInt(r, 12, 99);
      return { prompt: `Compute ${a} × ${b}. ${N}`, answer: a * b };
    },
  },
  {
    id: "mul-3x3",
    category: "arithmetic",
    difficulty: 0.2,
    gen: (r) => {
      const a = randInt(r, 234, 987);
      const b = randInt(r, 213, 979);
      return { prompt: `Compute ${a} × ${b}. ${N}`, answer: a * b };
    },
  },
  {
    id: "mul-4x3",
    category: "arithmetic",
    difficulty: 0.3,
    gen: (r) => {
      const a = randInt(r, 2345, 9876);
      const b = randInt(r, 317, 989);
      return { prompt: `Compute ${a} × ${b} exactly. ${N}`, answer: a * b };
    },
  },
  {
    id: "long-division",
    category: "arithmetic",
    difficulty: 0.2,
    gen: (r) => {
      const q = randInt(r, 120, 980);
      const d = randInt(r, 13, 89);
      return { prompt: `Compute ${q * d} ÷ ${d}. ${N}`, answer: q };
    },
  },
  {
    id: "order-of-ops",
    category: "arithmetic",
    difficulty: 0.22,
    gen: (r) => {
      const a = randInt(r, 11, 60);
      const b = randInt(r, 3, 19);
      const c = randInt(r, 3, 12);
      const e = randInt(r, 2, 9);
      const d = e * randInt(r, 4, 30);
      return {
        prompt: `Evaluate (${a} + ${b}) × ${c} − ${d} ÷ ${e}, using the standard order of operations. ${N}`,
        answer: (a + b) * c - d / e,
      };
    },
  },
  {
    id: "percent-of",
    category: "arithmetic",
    difficulty: 0.15,
    gen: (r) => {
      const p = pick(r, [12.5, 15, 35, 45, 62.5, 87.5]);
      const base = 8 * randInt(r, 10, 150);
      return { prompt: `What is ${p}% of ${base}? ${N}`, answer: (p * base) / 100 };
    },
    decimals: 1,
  },
  {
    id: "negative-mixed",
    category: "arithmetic",
    difficulty: 0.25,
    gen: (r) => {
      const a = randInt(r, 20, 90);
      const b = randInt(r, 100, 300);
      const c = randInt(r, 2, 9);
      return { prompt: `Compute ${a} − ${b} × ${c} + ${b}. ${N}`, answer: a - b * c + b };
    },
  },

  // ---- word problems ----------------------------------------------------
  {
    id: "wp-muffins",
    category: "word-problem",
    difficulty: 0.15,
    gen: (r) => {
      const trays = randInt(r, 4, 12);
      const per = randInt(r, 6, 24);
      const total = trays * per;
      const morning = randInt(r, Math.floor(total * 0.2), Math.floor(total * 0.5));
      const afternoon = randInt(r, 1, total - morning - 1);
      return {
        prompt: `A bakery bakes ${trays} trays of muffins with ${per} muffins on each tray. It sells ${morning} muffins in the morning and ${afternoon} in the afternoon. How many muffins are left unsold? ${N}`,
        answer: total - morning - afternoon,
      };
    },
  },
  {
    id: "wp-train",
    category: "word-problem",
    difficulty: 0.2,
    gen: (r) => {
      const v = randInt(r, 6, 14) * 10;
      const h = randInt(r, 2, 5);
      const w = randInt(r, 5, 12) * 10;
      const halfHours = randInt(r, 1, 7);
      const k = halfHours / 2;
      return {
        prompt: `A train travels at ${v} km/h for ${h} hours, then at ${w} km/h for ${k} ${k === 1 ? "hour" : "hours"}. How many kilometers does it travel in total? ${N}`,
        answer: v * h + w * k,
      };
    },
  },
  {
    id: "wp-savings",
    category: "word-problem",
    difficulty: 0.3,
    gen: (r) => {
      const name = pick(r, NAMES);
      const s = randInt(r, 7, 45);
      const have = randInt(r, 10, 120);
      let target = have + randInt(r, 150, 600);
      if ((target - have) % s === 0) target += 1;
      return {
        prompt: `${name} has $${have} saved and adds $${s} every week. What is the smallest number of weeks after which ${name} will have at least $${target}? ${N}`,
        answer: Math.ceil((target - have) / s),
      };
    },
  },
  {
    id: "wp-discount-tax",
    category: "word-problem",
    difficulty: 0.35,
    decimals: 2,
    gen: (r) => {
      for (;;) {
        const price = randInt(r, 20, 400);
        const disc = pick(r, [10, 15, 20, 25, 30, 40]);
        const tax = pick(r, [5, 6, 8, 10, 12]);
        const centsNum = price * (100 - disc) * (100 + tax); // price in cents × 100
        if (centsNum % 100 !== 0) continue;
        const cents = centsNum / 100;
        return {
          prompt: `A jacket costs $${price}. It is discounted by ${disc}%, and then a ${tax}% sales tax is applied to the discounted price. What is the final price in dollars? Give the exact amount with cents. ${N}`,
          answer: cents / 100,
        };
      }
    },
  },
  {
    id: "wp-pipes",
    category: "word-problem",
    difficulty: 0.45,
    gen: (r) => {
      for (;;) {
        const a = randInt(r, 2, 12);
        const b = randInt(r, 2, 12);
        if (a === b) continue;
        const minutes = (60 * a * b) / (a + b);
        if (!Number.isInteger(minutes)) continue;
        return {
          prompt: `Pipe A alone fills a tank in ${a} hours. Pipe B alone fills the same tank in ${b} hours. If both pipes are opened together on the empty tank, how many minutes does it take to fill it? ${N}`,
          answer: minutes,
        };
      }
    },
  },
  {
    id: "wp-ages",
    category: "word-problem",
    difficulty: 0.5,
    gen: (r) => {
      for (;;) {
        const son = randInt(r, 4, 16);
        const n = randInt(r, 2, 20);
        const m = randInt(r, 2, 4);
        const num = m * (son + n) - n;
        if (num % son !== 0) continue;
        const k = num / son;
        if (k <= m || k > 9 || k * son > 70 || (k - 1) * son < 18) continue;
        const name = pick(r, NAMES);
        return {
          prompt: `Today ${name} is ${k} times as old as her son. In ${n} years, she will be exactly ${m} times as old as he will be then. How old is ${name} today? ${N}`,
          answer: k * son,
        };
      }
    },
  },
  {
    id: "wp-mixture",
    category: "word-problem",
    difficulty: 0.5,
    gen: (r) => {
      for (;;) {
        const v = randInt(r, 2, 12) * 10;
        const p1 = pick(r, [10, 20, 25, 30]);
        const p2 = pick(r, [40, 50, 60, 75]);
        const x = (v * (p2 - p1)) / (100 - p2);
        if (!Number.isInteger(x)) continue;
        return {
          prompt: `A tank holds ${v} liters of a solution that is ${p1}% acid. How many liters of pure acid must be added so that the solution becomes ${p2}% acid? ${N}`,
          answer: x,
        };
      }
    },
  },
  {
    id: "wp-shop-profit",
    category: "word-problem",
    difficulty: 0.4,
    gen: (r) => {
      const item = pick(r, ITEMS);
      const qty = randInt(r, 4, 12) * 10;
      const cost = randInt(r, 3, 15);
      const price = cost + randInt(r, 2, 9);
      const unsold = randInt(r, 3, Math.floor(qty / 4));
      const fee = randInt(r, 2, 9) * 10;
      return {
        prompt: `A stall owner buys ${qty} ${item} for $${cost} each. She sells all but ${unsold} of them for $${price} each and pays a $${fee} stall fee. The unsold ones are thrown away. What is her profit in dollars (negative if it is a loss)? ${N}`,
        answer: (qty - unsold) * price - qty * cost - fee,
      };
    },
  },
  {
    id: "wp-paint",
    category: "word-problem",
    difficulty: 0.4,
    gen: (r) => {
      const l = randInt(r, 4, 9);
      const w = randInt(r, 3, 7);
      const h = 3;
      const doorArea = 2;
      const coverage = pick(r, [5, 6, 8]);
      const coats = 2;
      const area = 2 * (l + w) * h - doorArea;
      const cans = Math.ceil((area * coats) / (coverage * 4));
      return {
        prompt: `A room is ${l} m long, ${w} m wide and ${h} m high. You paint all four walls (not the ceiling or floor) except a door of ${doorArea} m², applying ${coats} coats. One liter of paint covers ${coverage} m² per coat, and paint is sold only in 4-liter cans. How many cans must you buy? ${N}`,
        answer: cans,
      };
    },
  },

  // ---- multi-step -------------------------------------------------------
  {
    id: "ms-multiples-3-5",
    category: "multi-step",
    difficulty: 0.4,
    gen: (r) => {
      const n = randInt(r, 200, 999);
      let s = 0;
      for (let i = 1; i < n; i++) if (i % 3 === 0 || i % 5 === 0) s += i;
      return { prompt: `What is the sum of all positive integers less than ${n} that are multiples of 3 or 5? ${N}`, answer: s };
    },
  },
  {
    id: "ms-recurrence",
    category: "multi-step",
    difficulty: 0.35,
    gen: (r) => {
      const a = randInt(r, 4, 9);
      const c = randInt(r, 1, 3);
      let t = a;
      for (let i = 2; i <= 10; i++) t = 2 * t - c;
      return {
        prompt: `A sequence starts with ${a}, and every following term equals twice the previous term minus ${c}. What is the 10th term? ${N}`,
        answer: t,
      };
    },
  },
  {
    id: "ms-rectangle",
    category: "multi-step",
    difficulty: 0.45,
    gen: (r) => {
      const l = randInt(r, 7, 30);
      const w = randInt(r, 2, l - 1);
      return {
        prompt: `A rectangle has perimeter ${2 * (l + w)} and area ${l * w}. What is the square of the length of its diagonal? ${N}`,
        answer: l * l + w * w,
      };
    },
  },
  {
    id: "ms-averages",
    category: "multi-step",
    difficulty: 0.3,
    gen: (r) => {
      for (;;) {
        const m = randInt(r, 20, 80);
        const n = randInt(r, m - 15, m + 10);
        const removed = 5 * m - 4 * n;
        if (removed <= 0) continue;
        return {
          prompt: `The average of five numbers is ${m}. After one number is removed, the average of the remaining four numbers is ${n}. What number was removed? ${N}`,
          answer: removed,
        };
      }
    },
  },
  {
    id: "ms-clock-angle",
    category: "multi-step",
    difficulty: 0.5,
    decimals: 1,
    gen: (r) => {
      const h = randInt(r, 1, 11);
      const mm = randInt(r, 1, 59);
      const raw = Math.abs(30 * h - 5.5 * mm);
      const angle = Math.min(raw, 360 - raw);
      const time = `${h}:${String(mm).padStart(2, "0")}`;
      return {
        prompt: `On an analog clock, what is the smaller angle in degrees between the hour hand and the minute hand at ${time}? ${N}`,
        answer: angle,
      };
    },
  },

  // ---- modular ----------------------------------------------------------
  {
    id: "mod-pow",
    category: "modular",
    difficulty: 0.6,
    gen: (r) => {
      const b = pick(r, [3, 7, 11, 13, 17]);
      const e = randInt(r, 1000, 3000);
      return {
        prompt: `What is the remainder when ${b}^${e} is divided by 1000? ${N}`,
        answer: modPow(b, e, 1000),
      };
    },
  },
  {
    id: "mod-last-two",
    category: "modular",
    difficulty: 0.55,
    gen: (r) => {
      const b = pick(r, [7, 9, 13, 19, 23]);
      const e = randInt(r, 100, 999);
      return {
        prompt: `What are the last two digits of ${b}^${e}? Give them as a number between 0 and 99. ${N}`,
        answer: modPow(b, e, 100),
      };
    },
  },
  {
    id: "mod-inverse",
    category: "modular",
    difficulty: 0.65,
    gen: (r) => {
      const m = pick(r, [37, 41, 43, 47, 53, 59, 61]);
      const a = randInt(r, 3, m - 2);
      const b = randInt(r, 1, m - 1);
      let x = 1;
      while ((a * x - b) % m !== 0) x++;
      return {
        prompt: `Find the smallest positive integer x such that ${a}x ≡ ${b} (mod ${m}). ${N}`,
        answer: x,
      };
    },
  },
  {
    id: "mod-crt",
    category: "modular",
    difficulty: 0.6,
    gen: (r) => {
      const ms = [3, 5, 7, 11, 13];
      for (;;) {
        const a = pick(r, ms);
        const b = pick(r, ms);
        const c = pick(r, ms);
        if (a === b || b === c || a === c) continue;
        const [ra, rb, rc] = [randInt(r, 1, a - 1), randInt(r, 1, b - 1), randInt(r, 1, c - 1)];
        let x = 1;
        while (!(x % a === ra && x % b === rb && x % c === rc)) x++;
        return {
          prompt: `What is the smallest positive integer that leaves remainder ${ra} when divided by ${a}, remainder ${rb} when divided by ${b}, and remainder ${rc} when divided by ${c}? ${N}`,
          answer: x,
        };
      }
    },
  },
  {
    id: "mod-sum-squares",
    category: "modular",
    difficulty: 0.5,
    gen: (r) => {
      const n = randInt(r, 50, 200);
      const k = pick(r, [7, 11, 13, 17]);
      const s = (n * (n + 1) * (2 * n + 1)) / 6;
      return {
        prompt: `What is the remainder when 1² + 2² + 3² + … + ${n}² is divided by ${k}? ${N}`,
        answer: s % k,
      };
    },
  },

  // ---- combinatorics ----------------------------------------------------
  {
    id: "comb-binomial",
    category: "combinatorics",
    difficulty: 0.3,
    gen: (r) => {
      const n = randInt(r, 10, 20);
      const k = randInt(r, 3, 6);
      return { prompt: `In how many ways can a committee of ${k} people be chosen from ${n} people? ${N}`, answer: binom(n, k) };
    },
  },
  {
    id: "comb-anagrams",
    category: "combinatorics",
    difficulty: 0.5,
    gen: (r) => {
      const word = pick(r, ["BANANA", "BALLOON", "SUCCESS", "COMMITTEE", "STATISTICS", "MISSISSIPPI"]);
      const counts = new Map<string, number>();
      for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);
      let ans = factorial(word.length);
      for (const c of counts.values()) ans /= factorial(c);
      return { prompt: `How many distinct arrangements of the letters of the word ${word} are there? ${N}`, answer: ans };
    },
  },
  {
    id: "comb-at-least-one",
    category: "combinatorics",
    difficulty: 0.55,
    gen: (r) => {
      const men = randInt(r, 5, 9);
      const women = randInt(r, 3, 7);
      const k = randInt(r, 3, 5);
      return {
        prompt: `A club has ${men} men and ${women} women. How many ${k}-person committees contain at least one woman? ${N}`,
        answer: binom(men + women, k) - binom(men, k),
      };
    },
  },
  {
    id: "comb-lattice-paths",
    category: "combinatorics",
    difficulty: 0.45,
    gen: (r) => {
      const a = randInt(r, 4, 8);
      const b = randInt(r, 3, 7);
      const ca = randInt(r, 1, a - 1);
      const cb = randInt(r, 1, b - 1);
      return {
        prompt: `On a grid, you walk from (0, 0) to (${a}, ${b}) using only unit steps right (+1 in x) or up (+1 in y). How many such paths pass through the point (${ca}, ${cb})? ${N}`,
        answer: binom(ca + cb, ca) * binom(a - ca + b - cb, a - ca),
      };
    },
  },
  {
    id: "comb-derangements",
    category: "combinatorics",
    difficulty: 0.7,
    gen: (r) => {
      const n = randInt(r, 6, 8);
      const d = [1, 0];
      for (let i = 2; i <= n; i++) d[i] = (i - 1) * (d[i - 1] + d[i - 2]);
      return {
        prompt: `${n} guests each leave a coat at a cloakroom. The coats are handed back at random so that no guest receives their own coat. How many ways can this happen? ${N}`,
        answer: d[n],
      };
    },
  },
  {
    id: "comb-coin-change",
    category: "combinatorics",
    difficulty: 0.7,
    gen: (r) => {
      const n = randInt(r, 40, 99);
      const ways = new Array(n + 1).fill(0);
      ways[0] = 1;
      for (const c of [1, 5, 10, 25]) for (let i = c; i <= n; i++) ways[i] += ways[i - c];
      return {
        prompt: `How many different ways can you make ${n} cents using any number of pennies (1¢), nickels (5¢), dimes (10¢) and quarters (25¢)? The order of coins does not matter. ${N}`,
        answer: ways[n],
      };
    },
  },
];

/** Hand-written competition-style problems; each answer is brute-forced in suites.test.ts. */
export const COMPETITION: TaskInput[] = [
  {
    id: "comp-unit-fractions",
    category: "competition",
    difficulty: 0.85,
    prompt: `How many ordered pairs of positive integers (a, b) satisfy 1/a + 1/b = 1/12? ${N}`,
    expected: "15",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-trailing-zeros",
    category: "competition",
    difficulty: 0.55,
    prompt: `How many trailing zeros does 1000! (1000 factorial) have? ${N}`,
    expected: "249",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-digit-sum",
    category: "competition",
    difficulty: 0.85,
    prompt: `How many integers from 1 to 10000 inclusive have a digit sum equal to 20? ${N}`,
    expected: "633",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-divisor-sum",
    category: "competition",
    difficulty: 0.5,
    prompt: `What is the sum of all positive divisors of 360 (including 1 and 360)? ${N}`,
    expected: "1170",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-lattice-circle",
    category: "competition",
    difficulty: 0.75,
    prompt: `How many points (x, y) with both x and y integers satisfy x² + y² < 100? ${N}`,
    expected: "305",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-fermat",
    category: "competition",
    difficulty: 0.55,
    prompt: `What is the remainder when 2^100 is divided by 101? ${N}`,
    expected: "1",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-n2-plus-1",
    category: "competition",
    difficulty: 0.6,
    prompt: `For how many positive integers n ≤ 1000 is n² + 1 divisible by 5? ${N}`,
    expected: "400",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-24-divisors",
    category: "competition",
    difficulty: 0.75,
    prompt: `What is the smallest positive integer that has exactly 24 positive divisors? ${N}`,
    expected: "360",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-distinct-parts",
    category: "competition",
    difficulty: 0.7,
    prompt: `How many triples of positive integers (a, b, c) with a < b < c satisfy a + b + c = 20? ${N}`,
    expected: "24",
    grader: { kind: "numeric" },
  },
  {
    id: "comp-subset-sums",
    category: "competition",
    difficulty: 0.95,
    prompt: `How many subsets of {1, 2, 3, …, 12} (including the empty set) have a sum of elements divisible by 3? ${N}`,
    expected: "1376",
    grader: { kind: "numeric" },
  },
];

function formatAnswer(x: number, decimals = 0): string {
  if (decimals === 0) {
    if (!Number.isInteger(x)) throw new Error(`math generator produced non-integer ${x}`);
    return String(x);
  }
  // Trim trailing zeros so "12.50" prints as "12.5"; graders compare numerically anyway.
  return String(Number(x.toFixed(decimals)));
}

function buildGenerated(): TaskInput[] {
  const out: TaskInput[] = [];
  for (const spec of GENERATED) {
    const r = rng(hash32(`${SUITE}:${spec.id}:v1`));
    const { prompt, answer } = spec.gen(r);
    out.push({
      id: spec.id,
      category: spec.category,
      difficulty: spec.difficulty,
      prompt,
      expected: formatAnswer(answer, spec.decimals),
      grader: { kind: "numeric", tolerance: spec.decimals ? 0.5 * 10 ** -spec.decimals : undefined },
    });
  }
  return out;
}

export const mathSuite: BenchSuite = {
  id: SUITE,
  name: "Math",
  description:
    "Arithmetic, original word problems, multi-step, modular arithmetic, combinatorics and competition-style problems. Answers are computed in code from seeded parameters.",
  tasks: [...buildGenerated(), ...COMPETITION].map((t) => makeTask(SUITE, t)),
};
