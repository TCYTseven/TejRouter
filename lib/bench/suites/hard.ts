import type { BenchSuite } from "../types";
import { FORMAT, hash32, pick, randInt, rng, shuffle, type Rand, type TaskInput, makeTask } from "./util";

const SUITE = "hard";
const N = FORMAT.number;
const W = FORMAT.word;

/**
 * Tasks a strong model can still get wrong, so a run is not 95% for every router and the
 * report can tell a router that escalates from one that does not. Every answer is computed
 * in code (exact big-number arithmetic, calendar arithmetic, state tracking) or verified by
 * brute force in suites.test.ts (logic grids, code references). Generated tasks use a fixed
 * seed per task id, so the set is the same on every run.
 */

const seeded = (id: string): Rand => rng(hash32(`hard:${id}`));

/** A random integer with exactly `digits` digits, as a string (no leading zero). */
function digitsString(r: Rand, digits: number): string {
  let s = String(randInt(r, 1, 9));
  for (let i = 1; i < digits; i++) s += String(randInt(r, 0, 9));
  return s;
}

function modPowBig(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1);
  let b = base % mod;
  let e = exp;
  const zero = BigInt(0);
  const two = BigInt(2);
  while (e > zero) {
    if (e % two === BigInt(1)) result = (result * b) % mod;
    b = (b * b) % mod;
    e /= two;
  }
  return result;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function randomDate(r: Rand, fromYear: number, toYear: number): { y: number; m: number; d: number } {
  const y = randInt(r, fromYear, toYear);
  const m = randInt(r, 1, 12);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: randInt(r, 1, days) };
}
const fmtDate = (x: { y: number; m: number; d: number }) => `${x.d} ${MONTHS[x.m - 1]} ${x.y}`;
const utc = (x: { y: number; m: number; d: number }) => Date.UTC(x.y, x.m - 1, x.d);

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Exact computation
// ---------------------------------------------------------------------------

function computationTasks(): TaskInput[] {
  const out: TaskInput[] = [];

  {
    const r = seeded("big-mul-9x9");
    const a = digitsString(r, 9);
    const b = digitsString(r, 9);
    out.push({
      id: "big-mul-9x9",
      category: "computation",
      difficulty: 0.75,
      prompt: `Compute ${a} × ${b} exactly. Every digit must be right. ${N}`,
      expected: (BigInt(a) * BigInt(b)).toString(),
      grader: { kind: "exact" },
    });
  }
  {
    const r = seeded("big-mul-14x13");
    const a = digitsString(r, 14);
    const b = digitsString(r, 13);
    out.push({
      id: "big-mul-14x13",
      category: "computation",
      difficulty: 0.92,
      prompt: `Compute ${a} × ${b} exactly. Every digit must be right. ${N}`,
      expected: (BigInt(a) * BigInt(b)).toString(),
      grader: { kind: "exact" },
    });
  }
  {
    const r = seeded("mod-pow-big");
    const base = randInt(r, 123_457, 987_653);
    const exp = randInt(r, 1_000_003, 9_999_991);
    const mod = 1_000_000_007;
    out.push({
      id: "mod-pow-big",
      category: "computation",
      difficulty: 0.88,
      prompt: `Compute ${base}^${exp} mod ${mod}. ${N}`,
      expected: modPowBig(BigInt(base), BigInt(exp), BigInt(mod)).toString(),
      grader: { kind: "exact" },
    });
  }
  {
    const r = seeded("digit-sum-power");
    const base = pick(r, [3, 7, 11, 13]);
    const exp = randInt(r, 90, 140);
    let v = BigInt(1);
    for (let i = 0; i < exp; i++) v *= BigInt(base);
    const sum = v
      .toString()
      .split("")
      .reduce((s, d) => s + Number(d), 0);
    out.push({
      id: "digit-sum-power",
      category: "computation",
      difficulty: 0.9,
      prompt: `What is the sum of the decimal digits of ${base}^${exp}? ${N}`,
      expected: String(sum),
      grader: { kind: "numeric" },
    });
  }
  {
    const r = seeded("primes-in-range");
    const lo = randInt(r, 1_000_000, 9_000_000);
    const hi = lo + 600;
    let c = 0;
    for (let n = lo; n <= hi; n++) if (isPrime(n)) c++;
    out.push({
      id: "primes-in-range",
      category: "computation",
      difficulty: 0.9,
      prompt: `How many prime numbers are there from ${lo} to ${hi}, inclusive? ${N}`,
      expected: String(c),
      grader: { kind: "numeric" },
    });
  }
  {
    const r = seeded("collatz-steps");
    const start = randInt(r, 100_000, 999_999);
    let n = start;
    let steps = 0;
    while (n !== 1) {
      n = n % 2 === 0 ? n / 2 : 3 * n + 1;
      steps++;
    }
    out.push({
      id: "collatz-steps",
      category: "computation",
      difficulty: 0.85,
      prompt: `Start at ${start}. If the number is even, halve it; if it is odd, replace it with 3 times it plus 1. How many of these steps does it take to reach 1? ${N}`,
      expected: String(steps),
      grader: { kind: "numeric" },
    });
  }
  {
    const r = seeded("weekday-old");
    const date = randomDate(r, 1600, 1799);
    out.push({
      id: "weekday-old",
      category: "calendar",
      difficulty: 0.78,
      prompt: `In the proleptic Gregorian calendar, what day of the week was ${fmtDate(date)}? Give the full English name of the day. ${W}`,
      expected: WEEKDAYS[new Date(utc(date)).getUTCDay()],
      grader: { kind: "exact" },
    });
  }
  {
    const r = seeded("weekday-future");
    const date = randomDate(r, 2300, 2599);
    out.push({
      id: "weekday-future",
      category: "calendar",
      difficulty: 0.75,
      prompt: `In the Gregorian calendar, what day of the week will ${fmtDate(date)} be? Give the full English name of the day. ${W}`,
      expected: WEEKDAYS[new Date(utc(date)).getUTCDay()],
      grader: { kind: "exact" },
    });
  }
  {
    const r = seeded("factor-semiprime");
    const prime = (lo: number, hi: number) => {
      for (let n = randInt(r, lo, hi); ; n++) if (isPrime(n)) return n;
    };
    const p = prime(10_000, 30_000);
    const q = prime(40_000, 90_000);
    out.push({
      id: "factor-semiprime",
      category: "computation",
      difficulty: 0.9,
      prompt: `${p * q} is the product of exactly two primes. What is the smaller of the two? ${N}`,
      expected: String(p),
      grader: { kind: "numeric" },
    });
  }
  {
    const r = seeded("base-7");
    const n = randInt(r, 10_000_000_000, 99_999_999_999);
    out.push({
      id: "base-7",
      category: "computation",
      difficulty: 0.85,
      prompt: `Write the decimal number ${n} in base 7. Give only the base-7 digits. ${W}`,
      expected: n.toString(7),
      grader: { kind: "exact" },
    });
  }
  {
    const r = seeded("int-sqrt");
    const n = BigInt(digitsString(r, 22));
    // Integer square root by Newton's method on BigInt.
    let x = n;
    let y = (x + BigInt(1)) / BigInt(2);
    while (y < x) {
      x = y;
      y = (x + n / x) / BigInt(2);
    }
    out.push({
      id: "int-sqrt",
      category: "computation",
      difficulty: 0.92,
      prompt: `What is the largest integer whose square is at most ${n}? ${N}`,
      expected: x.toString(),
      grader: { kind: "exact" },
    });
  }
  {
    const r = seeded("days-between");
    const a = randomDate(r, 1700, 1850);
    const b = randomDate(r, 2050, 2200);
    out.push({
      id: "days-between",
      category: "calendar",
      difficulty: 0.82,
      prompt: `Using the Gregorian calendar throughout, how many days are there from ${fmtDate(a)} to ${fmtDate(b)}? Count ${fmtDate(a)} as day 0, so consecutive dates are 1 day apart. ${N}`,
      expected: String(Math.round((utc(b) - utc(a)) / 86_400_000)),
      grader: { kind: "numeric" },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// State tracking: many small steps, one wrong step and the answer is wrong
// ---------------------------------------------------------------------------

function trackingTasks(): TaskInput[] {
  const out: TaskInput[] = [];

  {
    const r = seeded("list-ops");
    let xs = Array.from({ length: 8 }, () => randInt(r, 1, 50));
    const start = xs.slice();
    const steps: string[] = [];
    for (let i = 0; i < 24; i++) {
      const op = randInt(r, 0, 5);
      if (op === 0) {
        const k = randInt(r, 1, 3);
        xs = xs.slice(k).concat(xs.slice(0, k));
        steps.push(`Rotate the list left by ${k} (the first ${k} element${k === 1 ? "" : "s"} move${k === 1 ? "s" : ""} to the end).`);
      } else if (op === 1) {
        xs.reverse();
        steps.push("Reverse the list.");
      } else if (op === 2 && xs.length > 1) {
        const a = randInt(r, 1, xs.length);
        let b = randInt(r, 1, xs.length);
        if (b === a) b = (a % xs.length) + 1;
        [xs[a - 1], xs[b - 1]] = [xs[b - 1], xs[a - 1]];
        steps.push(`Swap the elements at positions ${a} and ${b}.`);
      } else if (op === 3 && xs.length > 4) {
        const p = randInt(r, 1, xs.length);
        xs.splice(p - 1, 1);
        steps.push(`Remove the element at position ${p}.`);
      } else if (op === 4) {
        const v = randInt(r, 1, 50);
        xs.push(v);
        steps.push(`Append ${v} to the end.`);
      } else {
        const p = randInt(r, 1, xs.length);
        const d = randInt(r, 2, 9);
        xs[p - 1] += d;
        steps.push(`Add ${d} to the element at position ${p}.`);
      }
    }
    out.push({
      id: "list-ops",
      category: "tracking",
      difficulty: 0.85,
      prompt: `Start with the list [${start.join(", ")}]. Positions are numbered from 1 and always refer to the list as it is at that step. Apply these steps in order:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nWhat is the final list? End your reply with a final line of the form \`Answer: <numbers>\` listing the numbers separated by commas with no spaces, e.g. \`Answer: 4,8,15\`.`,
      expected: xs.join(","),
      grader: { kind: "exact" },
    });
  }
  {
    const r = seeded("ledger");
    const names = ["Ava", "Bo", "Cy", "Di"];
    const bal: Record<string, number> = Object.fromEntries(names.map((n) => [n, randInt(r, 20, 60) * 10]));
    const opening = { ...bal };
    const lines: string[] = [];
    for (let i = 0; i < 28; i++) {
      const kind = randInt(r, 0, 3);
      const a = pick(r, names);
      if (kind === 0) {
        const v = randInt(r, 1, 20) * 5;
        bal[a] += v;
        lines.push(`${a} deposits ${v}.`);
      } else if (kind === 1) {
        const v = randInt(r, 1, 10) * 5;
        if (bal[a] >= v) {
          bal[a] -= v;
          lines.push(`${a} withdraws ${v}.`);
        } else {
          lines.push(`${a} tries to withdraw ${v}; if that is more than ${a}'s balance, the bank refuses and nothing changes.`);
        }
      } else if (kind === 2) {
        let b = pick(r, names);
        if (b === a) b = names[(names.indexOf(a) + 1) % names.length];
        const v = Math.min(bal[a], randInt(r, 1, 8) * 10);
        bal[a] -= v;
        bal[b] += v;
        lines.push(`${a} sends ${v} to ${b}.`);
      } else {
        // Interest rounded down to a whole unit: integer arithmetic, no ambiguity.
        const before = bal[a];
        bal[a] = before + Math.floor(before / 10);
        lines.push(`${a} earns 10% interest, rounded down to a whole unit.`);
      }
    }
    const target = pick(r, names);
    out.push({
      id: "ledger",
      category: "tracking",
      difficulty: 0.82,
      prompt: `Four people open bank accounts: ${names.map((n) => `${n} with ${opening[n]}`).join(", ")}. Then, in order:\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n\nWhat is ${target}'s final balance? ${N}`,
      expected: String(bal[target]),
      grader: { kind: "numeric" },
    });
  }
  {
    const r = seeded("string-ops");
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let s = Array.from({ length: 16 }, () => letters[randInt(r, 0, 25)]).join("");
    const start = s;
    const steps: string[] = [];
    for (let i = 0; i < 12; i++) {
      const op = randInt(r, 0, 3);
      if (op === 0) {
        const a = randInt(r, 1, s.length - 2);
        const b = randInt(r, a + 1, Math.min(s.length, a + 6));
        s = s.slice(0, a - 1) + s.slice(a - 1, b).split("").reverse().join("") + s.slice(b);
        steps.push(`Reverse the characters from position ${a} to position ${b}, inclusive.`);
      } else if (op === 1) {
        const k = randInt(r, 1, 5);
        s = s
          .split("")
          .map((c) => letters[(letters.indexOf(c) + k) % 26])
          .join("");
        steps.push(`Shift every letter forward ${k} place${k === 1 ? "" : "s"} in the alphabet, wrapping z around to a.`);
      } else if (op === 2) {
        const p = randInt(r, 1, s.length);
        s = s.slice(0, p - 1) + s.slice(p);
        steps.push(`Delete the character at position ${p}.`);
      } else {
        const k = randInt(r, 1, 4);
        s = s.slice(-k) + s.slice(0, -k);
        steps.push(`Move the last ${k} character${k === 1 ? "" : "s"} to the front, keeping their order.`);
      }
    }
    out.push({
      id: "string-ops",
      category: "tracking",
      difficulty: 0.9,
      prompt: `Start with the string "${start}". Positions are numbered from 1 and always refer to the string as it is at that step. Apply these steps in order:\n${steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nWhat is the final string? ${W}`,
      expected: s,
      grader: { kind: "exact", caseSensitive: true },
    });
  }
  {
    const r = seeded("letter-count");
    const text = Array.from({ length: 360 }, () => "abcdeirst"[randInt(r, 0, 8)]).join("");
    const letter = pick(r, ["r", "s", "t"]);
    const count = text.split("").filter((c) => c === letter).length;
    out.push({
      id: "letter-count",
      category: "tracking",
      difficulty: 0.8,
      prompt: `How many times does the letter "${letter}" appear in the following string?\n\n${text}\n\n${N}`,
      expected: String(count),
      grader: { kind: "numeric" },
    });
  }
  {
    const r = seeded("stack-machine");
    const prog: string[] = [];
    const stack: number[] = [];
    const push = (v: number) => {
      stack.push(v);
      prog.push(`PUSH ${v}`);
    };
    push(randInt(r, 2, 9));
    push(randInt(r, 2, 9));
    for (let i = 0; i < 26; i++) {
      const op = stack.length < 2 ? 0 : randInt(r, 0, 5);
      if (op === 0) push(randInt(r, 1, 9));
      else if (op === 1) {
        const b = stack.pop()!;
        const a = stack.pop()!;
        stack.push(a + b);
        prog.push("ADD");
      } else if (op === 2) {
        const b = stack.pop()!;
        const a = stack.pop()!;
        stack.push(a - b);
        prog.push("SUB");
      } else if (op === 3) {
        const b = stack.pop()!;
        const a = stack.pop()!;
        stack.push(a * b);
        prog.push("MUL");
      } else if (op === 4) {
        const b = stack.pop()!;
        const a = stack.pop()!;
        stack.push(b, a);
        prog.push("SWAP");
      } else {
        stack.push(stack[stack.length - 1]);
        prog.push("DUP");
      }
      if (Math.abs(stack[stack.length - 1]) > 50_000) {
        // Keep numbers small enough that the difficulty is the tracking, not the arithmetic.
        stack.push(stack.pop()! % 97);
        prog.push("MOD97");
      }
    }
    out.push({
      id: "stack-machine",
      category: "tracking",
      difficulty: 0.88,
      prompt: `Run this stack program. PUSH n pushes n. ADD, SUB and MUL pop b (the top), then a, and push a+b, a−b or a×b. SWAP exchanges the top two values. DUP pushes a copy of the top. MOD97 replaces the top value x with the remainder of x divided by 97, keeping the sign of x (as JavaScript's % does).\n\n${prog.join("\n")}\n\nWhat is the sum of every value left on the stack at the end? ${N}`,
      expected: String(stack.reduce((a, b) => a + b, 0)),
      grader: { kind: "numeric" },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Logic grids: unique solutions, every clue needed (generated offline, checked by brute force)
// ---------------------------------------------------------------------------

export type GridClue =
  | { t: "pos" | "notpos"; a: number; v: number; k: number }
  | { t: "same" | "not" | "left" | "next" | "before"; a: number; v: number; b: number; w: number };

export interface GridPuzzle {
  id: string;
  difficulty: number;
  houses: number;
  /** Attribute indexes into ATTRS. */
  attrs: number[];
  clues: GridClue[];
  /** solution[attr][house] = value index. */
  solution: number[][];
  ask: { a: number; v: number; b: number };
}

const ATTRS = [
  { values: ["Ana", "Ben", "Cleo", "Dev", "Eli"], noun: "name" },
  { values: ["red", "green", "blue", "white", "yellow"], noun: "colour" },
  { values: ["cat", "dog", "fish", "parrot", "horse"], noun: "pet" },
  { values: ["tea", "coffee", "milk", "juice", "water"], noun: "drink" },
  { values: ["baker", "pilot", "nurse", "judge", "chef"], noun: "job" },
] as const;

function subject(attr: number, v: number): string {
  const x = ATTRS[attr].values[v];
  return ["", `the person in the ${x} house`, `the ${x} owner`, `the ${x} drinker`, `the ${x}`][attr] || x;
}
function is(attr: number, v: number, negate: boolean): string {
  const x = ATTRS[attr].values[v];
  const n = negate ? " not" : "";
  return [
    `is${n} ${x}`,
    negate ? `does not live in the ${x} house` : `lives in the ${x} house`,
    negate ? `does not own the ${x}` : `owns the ${x}`,
    negate ? `does not drink ${x}` : `drinks ${x}`,
    `is${n} the ${x}`,
  ][attr];
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function clueText(c: GridClue): string {
  const s = cap(subject(c.a, c.v));
  switch (c.t) {
    case "pos":
      return `${s} lives in house ${c.k + 1}.`;
    case "notpos":
      return `${s} does not live in house ${c.k + 1}.`;
    case "same":
      return `${s} ${is(c.b, c.w, false)}.`;
    case "not":
      return `${s} ${is(c.b, c.w, true)}.`;
    case "left":
      return `${s} lives directly to the left of ${subject(c.b, c.w)}.`;
    case "next":
      return `${s} lives next to ${subject(c.b, c.w)}.`;
    case "before":
      return `${s} lives somewhere to the left of ${subject(c.b, c.w)}.`;
  }
}

function clueHolds(c: GridClue, s: number[][]): boolean {
  const h1 = s[c.a].indexOf(c.v);
  if ("k" in c) return c.t === "pos" ? h1 === c.k : h1 !== c.k;
  const h2 = s[c.b].indexOf(c.w);
  if (c.t === "same") return h1 === h2;
  if (c.t === "not") return h1 !== h2;
  if (c.t === "left") return h1 + 1 === h2;
  if (c.t === "next") return Math.abs(h1 - h2) === 1;
  return h1 < h2;
}

function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) {
    for (let i = 0; i <= p.length; i++) {
      const q = p.slice();
      q.splice(i, 0, n - 1);
      out.push(q);
    }
  }
  return out;
}

/** Every assignment consistent with the clues (stops after `limit`). Used by the tests. */
export function solveGrid(p: Pick<GridPuzzle, "houses" | "attrs" | "clues">, limit = 2): number[][][] {
  const perms = permutations(p.houses);
  const A = p.attrs.length;
  const found: number[][][] = [];
  const s: number[][] = [];
  const rec = (a: number) => {
    if (found.length >= limit) return;
    if (a === A) {
      found.push(s.map((x) => x.slice()));
      return;
    }
    for (const perm of perms) {
      s[a] = perm;
      let ok = true;
      for (const c of p.clues) {
        const last = "b" in c ? Math.max(c.a, c.b) : c.a;
        if (last === a && !clueHolds(c, s)) {
          ok = false;
          break;
        }
      }
      if (ok) rec(a + 1);
    }
    s.length = a;
  };
  rec(0);
  return found;
}

export const GRID_PUZZLES: GridPuzzle[] = [
  {
    id: "grid-4x4",
    difficulty: 0.75,
    houses: 4,
    attrs: [0, 1, 2, 3],
    solution: [
      [2, 1, 0, 3],
      [0, 1, 2, 3],
      [1, 3, 2, 0],
      [1, 0, 2, 3],
    ],
    clues: [
      { t: "pos", a: 1, v: 1, k: 1 },
      { t: "same", a: 0, v: 3, b: 3, w: 3 },
      { t: "left", a: 2, v: 3, b: 0, w: 0 },
      { t: "pos", a: 3, v: 2, k: 2 },
      { t: "next", a: 1, v: 1, b: 3, w: 1 },
      { t: "same", a: 1, v: 2, b: 0, w: 0 },
      { t: "pos", a: 0, v: 1, k: 1 },
      { t: "notpos", a: 2, v: 1, k: 2 },
      { t: "left", a: 3, v: 2, b: 2, w: 0 },
      { t: "pos", a: 1, v: 0, k: 0 },
    ],
    // Who owns the dog?
    ask: { a: 2, v: 1, b: 0 },
  },
  {
    id: "grid-5x4",
    difficulty: 0.88,
    houses: 5,
    attrs: [0, 1, 2, 3],
    solution: [
      [2, 4, 1, 0, 3],
      [0, 4, 2, 3, 1],
      [3, 2, 0, 1, 4],
      [2, 0, 4, 1, 3],
    ],
    clues: [
      { t: "not", a: 2, v: 2, b: 3, w: 1 },
      { t: "pos", a: 1, v: 3, k: 3 },
      { t: "left", a: 0, v: 0, b: 3, w: 3 },
      { t: "pos", a: 2, v: 0, k: 2 },
      { t: "same", a: 1, v: 4, b: 0, w: 4 },
      { t: "same", a: 0, v: 3, b: 2, w: 4 },
      { t: "same", a: 2, v: 3, b: 0, w: 2 },
      { t: "left", a: 2, v: 3, b: 1, w: 4 },
      { t: "left", a: 1, v: 2, b: 0, w: 0 },
      { t: "left", a: 3, v: 4, b: 2, w: 1 },
      { t: "same", a: 2, v: 3, b: 1, w: 0 },
      { t: "pos", a: 3, v: 2, k: 0 },
    ],
    // Who owns the fish?
    ask: { a: 2, v: 2, b: 0 },
  },
  {
    id: "grid-5x5",
    difficulty: 0.97,
    houses: 5,
    attrs: [0, 1, 2, 3, 4],
    solution: [
      [0, 4, 1, 3, 2],
      [0, 4, 2, 1, 3],
      [3, 4, 1, 0, 2],
      [3, 4, 2, 0, 1],
      [3, 1, 4, 0, 2],
    ],
    clues: [
      { t: "left", a: 4, v: 1, b: 1, w: 2 },
      { t: "left", a: 0, v: 0, b: 2, w: 4 },
      { t: "same", a: 4, v: 3, b: 2, w: 3 },
      { t: "left", a: 4, v: 4, b: 0, w: 3 },
      { t: "left", a: 4, v: 0, b: 2, w: 2 },
      { t: "next", a: 0, v: 3, b: 4, w: 2 },
      { t: "same", a: 3, v: 1, b: 4, w: 2 },
      { t: "pos", a: 1, v: 4, k: 1 },
      { t: "same", a: 3, v: 1, b: 1, w: 3 },
      { t: "not", a: 1, v: 1, b: 3, w: 3 },
      { t: "next", a: 0, v: 4, b: 4, w: 4 },
      { t: "same", a: 3, v: 0, b: 2, w: 0 },
      { t: "before", a: 3, v: 3, b: 1, w: 2 },
      { t: "left", a: 3, v: 0, b: 4, w: 2 },
      { t: "next", a: 3, v: 4, b: 0, w: 1 },
    ],
    // What does the judge drink?
    ask: { a: 4, v: 3, b: 3 },
  },
];

function gridAnswer(p: GridPuzzle): string {
  const house = p.solution[p.ask.a].indexOf(p.ask.v);
  return ATTRS[p.ask.b].values[p.solution[p.ask.b][house]];
}

function gridTask(p: GridPuzzle): TaskInput {
  const used = p.attrs.map((a) => ATTRS[a]);
  const intro = `${p.houses} houses stand in a row, numbered 1 to ${p.houses} from left to right. Each house has exactly one resident, and each of the following is used exactly once:\n${used
    .map((x) => `- ${cap(x.noun)}: ${x.values.slice(0, p.houses).join(", ")}`)
    .join("\n")}`;
  const q =
    p.ask.b === 0
      ? `Who is ${subject(p.ask.a, p.ask.v)}? Give the name.`
      : `What is the ${ATTRS[p.ask.b].noun} of ${subject(p.ask.a, p.ask.v)}? Give one word.`;
  return {
    id: p.id,
    category: "logic-grid",
    difficulty: p.difficulty,
    prompt: `${intro}\n\nClues:\n${p.clues.map((c, i) => `${i + 1}. ${clueText(c)}`).join("\n")}\n\n${q} ${W}`,
    expected: gridAnswer(p),
    grader: { kind: "exact" },
  };
}

// ---------------------------------------------------------------------------
// Long context with aggregation over distractors
// ---------------------------------------------------------------------------

function longTasks(): TaskInput[] {
  const r = seeded("log-aggregate");
  const users = ["u-ash", "u-birch", "u-cedar", "u-elm", "u-fir", "u-oak", "u-pine", "u-yew"];
  const target = pick(r, users);
  const lines: string[] = [];
  let total = 0;
  for (let i = 1; i <= 220; i++) {
    const u = pick(r, users);
    const amount = randInt(r, 1, 999);
    const status = r() < 0.7 ? "OK" : pick(r, ["FAILED", "REVERSED", "PENDING"]);
    const region = pick(r, ["eu", "us", "ap"]);
    lines.push(`#${String(i).padStart(3, "0")} user=${u} region=${region} amount=${amount} status=${status}`);
    if (u === target && status === "OK" && region !== "ap") total += amount;
  }
  return [
    {
      id: "log-aggregate",
      category: "aggregation",
      difficulty: 0.92,
      prompt: `Below is a transaction log, one transaction per line.\n\n${lines.join("\n")}\n\nWhat is the total amount of the transactions by ${target} whose status is OK and whose region is not ap? ${N}`,
      expected: String(total),
      grader: { kind: "numeric" },
    },
  ];
}

// ---------------------------------------------------------------------------
// Code that is easy to get almost right
// ---------------------------------------------------------------------------

export interface HardCodeTask {
  id: string;
  difficulty: number;
  fn: string;
  signature: string;
  spec: string;
  ref: string;
  tests: { args: unknown[]; expected: unknown }[];
}

export const HARD_CODE: HardCodeTask[] = [
  {
    id: "regex-match",
    difficulty: 0.85,
    fn: "isMatch",
    signature: "isMatch(s, p)",
    spec: "returns true when the pattern p matches the whole string s, where '.' matches any single character and '*' matches zero or more of the element before it. No RegExp objects or regex literals.",
    ref: `function isMatch(s, p) {
  const dp = Array.from({ length: s.length + 1 }, () => Array(p.length + 1).fill(false));
  dp[s.length][p.length] = true;
  for (let i = s.length; i >= 0; i--) {
    for (let j = p.length - 1; j >= 0; j--) {
      const first = i < s.length && (p[j] === s[i] || p[j] === ".");
      if (j + 1 < p.length && p[j + 1] === "*") dp[i][j] = dp[i][j + 2] || (first && dp[i + 1][j]);
      else dp[i][j] = first && dp[i + 1][j + 1];
    }
  }
  return dp[0][0];
}`,
    tests: [
      { args: ["aa", "a"], expected: false },
      { args: ["aa", "a*"], expected: true },
      { args: ["ab", ".*"], expected: true },
      { args: ["aab", "c*a*b"], expected: true },
      { args: ["mississippi", "mis*is*p*."], expected: false },
      { args: ["", "a*b*"], expected: true },
      { args: ["abcd", "d*"], expected: false },
      { args: ["aaa", "ab*a*c*a"], expected: true },
    ],
  },
  {
    id: "longest-valid-parens",
    difficulty: 0.8,
    fn: "longestValid",
    signature: "longestValid(s)",
    spec: "returns the length of the longest contiguous substring of s (made only of '(' and ')') that is a well-formed parentheses string.",
    ref: `function longestValid(s) {
  const st = [-1];
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") st.push(i);
    else {
      st.pop();
      if (!st.length) st.push(i);
      else best = Math.max(best, i - st[st.length - 1]);
    }
  }
  return best;
}`,
    tests: [
      { args: ["(()"], expected: 2 },
      { args: [")()())"], expected: 4 },
      { args: [""], expected: 0 },
      { args: ["()(()"], expected: 2 },
      { args: ["()(())"], expected: 6 },
      { args: ["(()())(("], expected: 6 },
      { args: ["))))"], expected: 0 },
    ],
  },
  {
    id: "distinct-subsequences",
    difficulty: 0.85,
    fn: "numDistinct",
    signature: "numDistinct(s, t)",
    spec: "returns how many distinct ways t can be formed as a subsequence of s (choosing different index sets counts as different ways).",
    ref: `function numDistinct(s, t) {
  const dp = Array(t.length + 1).fill(0);
  dp[0] = 1;
  for (let i = 0; i < s.length; i++) {
    for (let j = t.length; j >= 1; j--) if (s[i] === t[j - 1]) dp[j] += dp[j - 1];
  }
  return dp[t.length];
}`,
    tests: [
      { args: ["rabbbit", "rabbit"], expected: 3 },
      { args: ["babgbag", "bag"], expected: 5 },
      { args: ["abc", ""], expected: 1 },
      { args: ["", "a"], expected: 0 },
      { args: ["aaaa", "aa"], expected: 6 },
      { args: ["abcabc", "abc"], expected: 4 },
    ],
  },
  {
    id: "multiply-strings",
    difficulty: 0.75,
    fn: "multiply",
    signature: "multiply(a, b)",
    spec: "multiplies two non-negative integers given as decimal strings (up to 200 digits each) and returns the exact product as a decimal string with no leading zeros (\"0\" for zero). Do not use BigInt.",
    ref: `function multiply(a, b) {
  if (a === "0" || b === "0") return "0";
  const out = Array(a.length + b.length).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const sum = (a.charCodeAt(i) - 48) * (b.charCodeAt(j) - 48) + out[i + j + 1];
      out[i + j + 1] = sum % 10;
      out[i + j] += Math.floor(sum / 10);
    }
  }
  const s = out.join("").replace(/^0+/, "");
  return s || "0";
}`,
    tests: [
      { args: ["2", "3"], expected: "6" },
      { args: ["123", "456"], expected: "56088" },
      { args: ["0", "98765"], expected: "0" },
      { args: ["99999999999999999999", "99999999999999999999"], expected: "9999999999999999999800000000000000000001" },
      { args: ["123456789012345678901234567890", "987654321098765432109876543210"], expected: "121932631137021795226185032733622923332237463801111263526900" },
    ],
  },
  {
    id: "skyline",
    difficulty: 0.95,
    fn: "skyline",
    signature: "skyline(buildings)",
    spec: "takes an array of buildings [left, right, height] (integers, left < right) and returns the skyline as an array of key points [x, height]: each point is where the outline's height changes, sorted by x, with no two consecutive points of equal height, ending with a point of height 0.",
    ref: `function skyline(buildings) {
  const xs = [...new Set(buildings.flatMap(([l, r]) => [l, r]))].sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const x of xs) {
    let h = 0;
    for (const [l, r, bh] of buildings) if (l <= x && x < r && bh > h) h = bh;
    if (h !== prev) {
      out.push([x, h]);
      prev = h;
    }
  }
  return out;
}`,
    tests: [
      {
        args: [[[2, 9, 10], [3, 7, 15], [5, 12, 12], [15, 20, 10], [19, 24, 8]]],
        expected: [[2, 10], [3, 15], [7, 12], [12, 0], [15, 10], [20, 8], [24, 0]],
      },
      { args: [[[0, 2, 3], [2, 5, 3]]], expected: [[0, 3], [5, 0]] },
      { args: [[]], expected: [] },
      { args: [[[1, 5, 4], [2, 3, 2]]], expected: [[1, 4], [5, 0]] },
      { args: [[[1, 3, 2], [1, 3, 5], [3, 4, 5]]], expected: [[1, 5], [4, 0]] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Instructions with many rules at once
// ---------------------------------------------------------------------------

const STRICT_WRITING: TaskInput[] = [
  {
    id: "strict-lighthouse",
    category: "strict-format",
    difficulty: 0.8,
    prompt:
      "Write a short poem about a lighthouse keeper. Rules, all of which must hold: exactly 6 lines; every letter lowercase; no commas anywhere; include the words \"beacon\" and \"fog\"; never use the word \"light\" on its own (\"lighthouse\" is fine); the last word of the poem is \"home\"; at most 50 words in total. Reply with only the poem: no title, no preamble, no explanation, no quotes around it.",
    expected:
      "the keeper climbs the stair at dusk\nhe trims the wick and lifts the beacon\nthe fog rolls in across the bay\nships turn their bows toward his lamp\nby dawn the sea is calm once more\nand every sailor finds the way home",
    grader: {
      kind: "constraints",
      checks: [
        { type: "exactLines", value: 6 },
        { type: "allLowercase" },
        { type: "noCommas" },
        { type: "includes", value: "beacon" },
        { type: "includes", value: "fog" },
        { type: "excludes", value: "light" },
        { type: "endsWith", value: "home" },
        { type: "maxWords", value: 50 },
      ],
    },
  },
  {
    id: "strict-bullets",
    category: "strict-format",
    difficulty: 0.85,
    prompt:
      "Give exactly 5 tips for studying, as a bulleted list with one tip per line, each line starting with \"- \". Rules, all of which must hold: every letter uppercase; no commas anywhere; no other lines at all (no heading, intro or closing); include the word \"SLEEP\"; never use the words \"TRY\", \"BEST\" or \"REALLY\"; the reply begins with \"- START\"; the reply ends with \"DAILY\"; at most 40 words in total. Reply with only the list.",
    expected: "- START EACH SESSION WITH A CLEAR GOAL\n- PUT YOUR PHONE IN ANOTHER ROOM\n- TEST YOURSELF INSTEAD OF REREADING\n- GET ENOUGH SLEEP BEFORE EXAMS\n- REVIEW OLD MATERIAL DAILY",
    grader: {
      kind: "constraints",
      checks: [
        { type: "bulletCount", value: 5 },
        { type: "exactLines", value: 5 },
        { type: "allUppercase" },
        { type: "noCommas" },
        { type: "includes", value: "SLEEP" },
        { type: "excludes", value: "TRY" },
        { type: "excludes", value: "BEST" },
        { type: "excludes", value: "REALLY" },
        { type: "startsWith", value: "- START" },
        { type: "endsWith", value: "DAILY" },
        { type: "maxWords", value: 40 },
      ],
    },
  },
];

const CODE_INPUTS: TaskInput[] = HARD_CODE.map((t) => ({
  id: t.id,
  category: "hard-code",
  difficulty: t.difficulty,
  prompt: `Write a JavaScript function \`${t.signature}\` that ${t.spec}\n\n${FORMAT.code(t.fn)}`,
  expected: t.ref,
  grader: { kind: "code", language: "javascript", functionName: t.fn, tests: t.tests },
}));

const ALL: TaskInput[] = [
  ...computationTasks(),
  ...trackingTasks(),
  ...GRID_PUZZLES.map(gridTask),
  ...longTasks(),
  ...CODE_INPUTS,
  ...STRICT_WRITING,
];

// Shuffle within the suite once (fixed seed) so a capped Quick run still mixes categories.
export const hardSuite: BenchSuite = {
  id: SUITE,
  name: "Hard",
  description:
    "Tasks strong models still miss: exact big-number and calendar arithmetic, long chains of state changes, logic grids where every clue matters, aggregation over a long log, code that is easy to get almost right, and writing under many rules at once.",
  tasks: shuffle(seeded("order"), ALL).map((t) => makeTask(SUITE, t)),
};
