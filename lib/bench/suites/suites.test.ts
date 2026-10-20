import { describe, expect, it } from "vitest";
import { grade, checkConstraint } from "../graders";
import { SUITES, getSuite, suiteInfo } from "./index";
import { COMPETITION } from "./math";
import { HOUSES_PUZZLE, KNIGHTS_PUZZLES, ORDERING_PUZZLES, solveOrdering } from "./reasoning";
import { INSTRUCTION_TASKS } from "./instruction";
import { CODE_TASKS } from "./code";
import { GRID_PUZZLES, HARD_CODE, solveGrid } from "./hard";

const ALL = SUITES.flatMap((s) => s.tasks);

describe("suite catalogue", () => {
  it("has the nine core suites, three optional ones and 150+ tasks", () => {
    expect(SUITES.filter((s) => !s.optional).map((s) => s.id).sort()).toEqual(
      ["code", "extraction", "hard", "instruction", "knowledge", "long-context", "math", "reasoning", "trivial"].sort(),
    );
    expect(SUITES.filter((s) => s.optional).map((s) => s.id).sort()).toEqual(["edge", "multilingual", "rephrase"]);
    expect(ALL.length).toBeGreaterThanOrEqual(150);
  });

  it("has unique task ids prefixed with their suite id", () => {
    const ids = ALL.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SUITES) for (const t of s.tasks) {
      expect(t.suiteId).toBe(s.id);
      expect(t.id.startsWith(`${s.id}/`)).toBe(true);
    }
  });

  it("keeps difficulty in [0, 1] and spreads it within each graded suite", () => {
    for (const t of ALL) {
      expect(t.difficulty).toBeGreaterThanOrEqual(0);
      expect(t.difficulty).toBeLessThanOrEqual(1);
    }
    // Trivial is all easy and Hard is all hard, on purpose.
    for (const s of SUITES.filter((x) => x.id !== "trivial" && x.id !== "hard")) {
      const ds = s.tasks.map((t) => t.difficulty);
      expect(Math.max(...ds) - Math.min(...ds)).toBeGreaterThan(0.4);
    }
    expect(Math.max(...getSuite("trivial")!.tasks.map((t) => t.difficulty))).toBeLessThanOrEqual(0.1);
    expect(Math.min(...getSuite("hard")!.tasks.map((t) => t.difficulty))).toBeGreaterThanOrEqual(0.7);
  });

  it("tells the model how to format the answer in every prompt", () => {
    for (const t of ALL) {
      const prompt = t.messages.map((m) => m.content).join("\n");
      const ok =
        /Answer:/.test(prompt) || /```javascript/.test(prompt) || /Reply with only/.test(prompt);
      expect(ok, t.id).toBe(true);
    }
  });

  it("builds suite metadata", () => {
    for (const s of SUITES) {
      const info = suiteInfo(s);
      expect(info.taskCount).toBe(s.tasks.length);
      expect(info.difficultyHistogram.reduce((a, b) => a + b, 0)).toBe(s.tasks.length);
      expect(info.examples.length).toBe(2);
      expect(info.examples[0].prompt.length).toBeLessThanOrEqual(800);
    }
  });
});

describe.each(SUITES.map((s) => [s.id, s] as const))("suite %s self-consistency", (_id, suite) => {
  it.each(suite.tasks.map((t) => [t.id, t] as const))("%s: expected answers grade 1, wrong answers < 1", (_tid, task) => {
    const bare = grade(task, task.expected);
    expect(bare.score, `bare expected: ${bare.detail}`).toBe(1);
    expect(bare.correct).toBe(true);

    const wrapped = grade(task, `Some reasoning.\nAnswer: ${task.expected}`);
    expect(wrapped.score, `wrapped expected: ${wrapped.detail}`).toBe(1);

    // The exact format the simulators emit.
    const sim = grade(task, `Working through the ${task.category} task on sim/small.\nAnswer: ${task.expected}`);
    expect(sim.score, `simulator format: ${sim.detail}`).toBe(1);

    for (const wrong of ["unsure", "none of the above", "", "Answer: I don't know"]) {
      const g = grade(task, wrong);
      expect(g.score, `wrong answer ${JSON.stringify(wrong)} scored ${g.score}: ${g.detail}`).toBeLessThan(1);
      expect(g.correct).toBe(false);
    }

    // Numeric answers off by one (what the simulators produce when "wrong") must fail.
    const n = Number(task.expected);
    if (task.grader.kind === "numeric" && Number.isFinite(n)) {
      expect(grade(task, `Answer: ${n + 1}`).correct).toBe(false);
      expect(grade(task, `Answer: ${n - 1}`).correct).toBe(false);
    }
    // Reversed answers (the simulators' other failure mode) must fail unless palindromic.
    const rev = task.expected.split("").reverse().join("");
    if (rev !== task.expected && task.grader.kind !== "constraints") {
      expect(grade(task, `Answer: ${rev}`).correct, `reversed ${rev}`).toBe(false);
    }
  });
});

describe("math answers are independently verified", () => {
  const brute: Record<string, () => number> = {
    "comp-unit-fractions": () => {
      let c = 0;
      for (let a = 1; a <= 200; a++) for (let b = 1; b <= 200; b++) if (12 * (a + b) === a * b) c++;
      return c;
    },
    "comp-trailing-zeros": () => {
      // count factors of 5 in 1000!
      let z = 0;
      for (let i = 1; i <= 1000; i++) for (let x = i; x % 5 === 0; x /= 5) z++;
      return z;
    },
    "comp-digit-sum": () => {
      let c = 0;
      for (let n = 1; n <= 10000; n++) if (String(n).split("").reduce((s, d) => s + Number(d), 0) === 20) c++;
      return c;
    },
    "comp-divisor-sum": () => {
      let s = 0;
      for (let d = 1; d <= 360; d++) if (360 % d === 0) s += d;
      return s;
    },
    "comp-lattice-circle": () => {
      let c = 0;
      for (let x = -10; x <= 10; x++) for (let y = -10; y <= 10; y++) if (x * x + y * y < 100) c++;
      return c;
    },
    "comp-fermat": () => {
      let r = 1;
      for (let i = 0; i < 100; i++) r = (r * 2) % 101;
      return r;
    },
    "comp-n2-plus-1": () => {
      let c = 0;
      for (let n = 1; n <= 1000; n++) if ((n * n + 1) % 5 === 0) c++;
      return c;
    },
    "comp-24-divisors": () => {
      for (let n = 1; ; n++) {
        let d = 0;
        for (let i = 1; i <= n; i++) if (n % i === 0) d++;
        if (d === 24) return n;
      }
    },
    "comp-distinct-parts": () => {
      let c = 0;
      for (let a = 1; a <= 20; a++) for (let b = a + 1; b <= 20; b++) for (let cc = b + 1; cc <= 20; cc++) if (a + b + cc === 20) c++;
      return c;
    },
    "comp-subset-sums": () => {
      let c = 0;
      for (let m = 0; m < 1 << 12; m++) {
        let s = 0;
        for (let i = 0; i < 12; i++) if (m & (1 << i)) s += i + 1;
        if (s % 3 === 0) c++;
      }
      return c;
    },
  };

  it.each(COMPETITION.map((t) => [t.id, t] as const))("%s", (id, t) => {
    expect(brute[id], `missing brute-force check for ${id}`).toBeTypeOf("function");
    expect(String(brute[id]())).toBe(t.expected);
  });

  it("re-derives generated word problems from their prompts", () => {
    const math = getSuite("math")!;
    const get = (id: string) => math.tasks.find((t) => t.id === `math/${id}`)!;
    const nums = (id: string) => (get(id).messages[0].content.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

    const [a, b] = nums("mul-2x2");
    expect(Number(get("mul-2x2").expected)).toBe(a * b);
    const [x, y] = nums("mul-4x3");
    expect(Number(get("mul-4x3").expected)).toBe(x * y);
    const [dividend, divisor] = nums("long-division");
    expect(Number(get("long-division").expected)).toBe(dividend / divisor);
    const [trays, per, morning, afternoon] = nums("wp-muffins");
    expect(Number(get("wp-muffins").expected)).toBe(trays * per - morning - afternoon);
    const [pa, pb] = nums("wp-pipes");
    expect(Number(get("wp-pipes").expected)).toBeCloseTo((60 * pa * pb) / (pa + pb), 9);
    const [h, mm] = get("ms-clock-angle").messages[0].content.match(/at (\d+):(\d+)/)!.slice(1).map(Number);
    const raw = Math.abs(30 * h - 5.5 * mm);
    expect(Number(get("ms-clock-angle").expected)).toBe(Math.min(raw, 360 - raw));
    const [base, exp] = get("mod-pow").messages[0].content.match(/(\d+)\^(\d+)/)!.slice(1).map(Number);
    let r = 1;
    for (let i = 0; i < exp; i++) r = (r * base) % 1000; // naive repeated multiplication
    expect(Number(get("mod-pow").expected)).toBe(r);
  });
});

describe("reasoning puzzles are verified by brute force", () => {
  it.each(ORDERING_PUZZLES.map((p) => [p.id, p] as const))("%s has exactly one solution", (_id, p) => {
    expect(solveOrdering(p)).toHaveLength(1);
  });

  it("knights and knaves have the stated unique solutions", () => {
    for (const p of KNIGHTS_PUZZLES) {
      const sols: Record<string, boolean>[] = [];
      for (let m = 0; m < 1 << p.people.length; m++) {
        const k = Object.fromEntries(p.people.map((name, i) => [name, Boolean(m & (1 << i))]));
        const consistent = p.statements.every((st, i) => st === null || st(k) === k[p.people[i]]);
        if (consistent) sols.push(k);
      }
      expect(sols, p.id).toEqual([p.solution]);
    }
  });

  it("the houses puzzle has a unique solution with the fish in the red house", () => {
    const perms = <T,>(xs: T[]): T[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
    const sols: string[] = [];
    for (const c of perms([...HOUSES_PUZZLE.colors]))
      for (const pet of perms([...HOUSES_PUZZLE.pets]))
        for (const d of perms([...HOUSES_PUZZLE.drinks]))
          if (HOUSES_PUZZLE.check(c, pet, d)) sols.push(c[pet.indexOf("fish")]);
    expect(sols).toEqual([HOUSES_PUZZLE.answer]);
  });

  it("the water-jug minimum is 6 steps (BFS)", () => {
    const key = (a: number, b: number) => `${a},${b}`;
    const seen = new Map<string, number>([[key(0, 0), 0]]);
    let frontier: [number, number][] = [[0, 0]];
    let found = -1;
    for (let steps = 0; frontier.length && found < 0; steps++) {
      const next: [number, number][] = [];
      for (const [a, b] of frontier) {
        if (a === 4 || b === 4) {
          found = steps;
          break;
        }
        const pourAB = Math.min(a, 5 - b);
        const pourBA = Math.min(b, 3 - a);
        for (const [na, nb] of [
          [3, b], [a, 5], [0, b], [a, 0], [a - pourAB, b + pourAB], [a + pourBA, b - pourBA],
        ] as [number, number][]) {
          if (!seen.has(key(na, nb))) {
            seen.set(key(na, nb), steps + 1);
            next.push([na, nb]);
          }
        }
      }
      frontier = next;
    }
    expect(found).toBe(6);
  });

  it("other hand-checked answers", () => {
    // Dice: P(sum 7 | at least one 3)
    let withThree = 0;
    let seven = 0;
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++)
        if (a === 3 || b === 3) {
          withThree++;
          if (a + b === 7) seven++;
        }
    expect(seven / withThree).toBeCloseTo(2 / 11, 12);
    // Snail: 3 up, 2 down, 10 m
    let h = 0;
    let day = 0;
    for (;;) {
      day++;
      h += 3;
      if (h >= 10) break;
      h -= 2;
    }
    expect(day).toBe(8);
    // 100 days after Wednesday
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    expect(days[(3 + 100) % 7]).toBe("Friday");
  });
});

describe("instruction examples satisfy their own constraints", () => {
  it.each(INSTRUCTION_TASKS.map((t) => [t.id, t] as const))("%s", (_id, t) => {
    for (const c of t.checks) expect(checkConstraint(c, t.example), `${t.id}: ${JSON.stringify(c)}`).toBe(true);
  });
});

describe("code references pass and trivial stubs fail", () => {
  it.each(CODE_TASKS.map((t) => [t.id, t] as const))("%s", (_id, t) => {
    const task = getSuite("code")!.tasks.find((x) => x.id === `code/${t.id}`)!;
    expect(grade(task, "```javascript\n" + t.ref + "\n```").score).toBe(1);
    const stub = `function ${t.fn}() { return null; }`;
    expect(grade(task, "```js\n" + stub + "\n```").correct).toBe(false);
  });
});

describe("optional suites", () => {
  it("rephrasings come in groups of three with one answer and one difficulty", () => {
    const groups = new Map<string, { expected: Set<string>; difficulty: Set<number>; n: number }>();
    for (const t of getSuite("rephrase")!.tasks) {
      const g = t.tags?.find((x) => x.startsWith("group:"));
      expect(g, t.id).toBeTruthy();
      const e = groups.get(g!) ?? { expected: new Set(), difficulty: new Set(), n: 0 };
      e.expected.add(t.expected);
      e.difficulty.add(t.difficulty);
      e.n++;
      groups.set(g!, e);
    }
    for (const [g, e] of groups) {
      expect(e.n, g).toBe(3);
      expect(e.expected.size, g).toBe(1);
      expect(e.difficulty.size, g).toBe(1);
    }
  });
  it("tags every other-language task with its language and every edge case with its kind", () => {
    for (const t of getSuite("multilingual")!.tasks) expect(t.tags?.some((x) => /^lang:[a-z]{2}$/.test(x)), t.id).toBe(true);
    for (const t of getSuite("edge")!.tasks) expect(t.tags?.some((x) => x.startsWith("edge:")), t.id).toBe(true);
  });
  it("the very long edge case is long", () => {
    const t = getSuite("edge")!.tasks.find((x) => x.id === "edge/very-long")!;
    expect(t.messages[0].content.split(/\s+/).length).toBeGreaterThan(19_000);
  });
});

describe("long-context haystacks", () => {
  const lc = getSuite("long-context")!;
  it("plants each answer in the document and scales length", () => {
    for (const t of lc.tasks) {
      const prompt = t.messages[0].content;
      if (t.grader.kind === "contains") expect(prompt.includes(t.expected), t.id).toBe(true);
    }
    const lengths = lc.tasks.map((t) => t.messages[0].content.split(/\s+/).length);
    expect(Math.max(...lengths)).toBeGreaterThan(7500);
    expect(Math.min(...lengths)).toBeLessThan(800);
  });
  it("gets harder with length", () => {
    const d = (id: string) => lc.tasks.find((t) => t.id === `long-context/${id}`)!.difficulty;
    expect(d("needle-500w-d50")).toBeLessThan(d("needle-1500w-d50"));
    expect(d("needle-1500w-d50")).toBeLessThan(d("needle-6000w-d50-x2"));
  });
});

describe("hard suite", () => {
  it.each(GRID_PUZZLES.map((p) => [p.id, p] as const))("%s has exactly the stated solution", (_id, p) => {
    expect(solveGrid(p)).toEqual([p.solution]);
  }, 60_000);

  it("needs every clue in each logic grid", () => {
    for (const p of GRID_PUZZLES.filter((x) => x.houses * x.attrs.length <= 16)) {
      for (let i = 0; i < p.clues.length; i++) {
        const fewer = { ...p, clues: p.clues.filter((_, j) => j !== i) };
        expect(solveGrid(fewer).length, `${p.id} clue ${i + 1}`).toBeGreaterThan(1);
      }
    }
  });

  it("is 25+ tasks, all at least as hard as the Hard preset's threshold", () => {
    const hard = getSuite("hard")!;
    expect(hard.tasks.length).toBeGreaterThanOrEqual(25);
    expect(suiteInfo(hard).hardTaskCount).toBe(hard.tasks.length);
  });

  it.each(HARD_CODE.map((t) => [t.id, t] as const))("%s reference passes its tests and a stub fails", (_id, t) => {
    const task = getSuite("hard")!.tasks.find((x) => x.id === `hard/${t.id}`)!;
    const g = grade(task, "```javascript\n" + t.ref + "\n```");
    expect(g.score, g.detail).toBe(1);
    expect(grade(task, "```js\nfunction " + t.fn + "() { return null; }\n```").correct).toBe(false);
  });
});
