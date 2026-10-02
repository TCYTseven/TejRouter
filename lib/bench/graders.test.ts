import { describe, expect, it } from "vitest";
import {
  cleanAnswer,
  countWords,
  extractAnswerLine,
  extractCode,
  extractJson,
  findNumbers,
  grade,
  parseNumericAnswer,
  runCodeTests,
  valuesMatch,
} from "./graders";
import type { GraderSpec } from "./types";

const t = (grader: GraderSpec, expected: string) => ({ grader, expected });

describe("answer extraction", () => {
  it("takes the last Answer: line and tolerates markdown", () => {
    expect(extractAnswerLine("Answer: 3\nwait...\nFinal answer: 4")).toBe("4");
    expect(extractAnswerLine("**Answer:** 42")).toBe("42");
    expect(extractAnswerLine("**Answer**: 42")).toBe("42");
    expect(extractAnswerLine("The answer is: 7")).toBe("7");
    expect(extractAnswerLine("Answer:\n\n  12  ")).toBe("12");
    expect(extractAnswerLine("no marker here")).toBeNull();
  });
  it("cleans wrappers", () => {
    expect(cleanAnswer("**Paris**.")).toBe("Paris");
    expect(cleanAnswer("`42`")).toBe("42");
    expect(cleanAnswer('"hello"')).toBe("hello");
    expect(cleanAnswer("$\\boxed{17}$")).toBe("17");
  });
});

describe("numbers", () => {
  it("parses commas, currency, negatives, decimals, units and fractions", () => {
    expect(parseNumericAnswer("1,234")).toBe(1234);
    expect(parseNumericAnswer("$1,245.50")).toBe(1245.5);
    expect(parseNumericAnswer("-630")).toBe(-630);
    expect(parseNumericAnswer("−7")).toBe(-7);
    expect(parseNumericAnswer("3.75 kg")).toBe(3.75);
    expect(parseNumericAnswer("25%")).toBe(25);
    expect(parseNumericAnswer("2/11")).toBeCloseTo(2 / 11, 12);
    expect(parseNumericAnswer("x = -3")).toBe(-3);
    expect(parseNumericAnswer("2^10 = 1024")).toBe(1024);
    expect(parseNumericAnswer(".5")).toBe(0.5);
    expect(parseNumericAnswer("1e3")).toBe(1000);
    expect(parseNumericAnswer("no digits")).toBeNull();
  });
  it("does not treat hyphens inside words as minus signs", () => {
    expect(findNumbers("COVID-19 cases")).toEqual([19]);
  });
  it("keeps comma-separated lists apart", () => {
    expect(findNumbers("3,4 and 12,345")).toEqual([3, 4, 12345]);
  });
});

describe("numeric grader", () => {
  const g = t({ kind: "numeric" }, "1245.5");
  it("accepts equivalent forms", () => {
    expect(grade(g, "Answer: $1,245.50").correct).toBe(true);
    expect(grade(g, "Answer: 1245.50 dollars").correct).toBe(true);
    expect(grade(g, "The total is 1,245.5").correct).toBe(true); // last-number fallback
    expect(grade(g, "So the answer is \\boxed{1245.5}.").correct).toBe(true);
  });
  it("rejects wrong values and prefers the Answer line over other numbers", () => {
    expect(grade(g, "Answer: 1245").correct).toBe(false);
    expect(grade(g, "I first got 1245.5 but\nAnswer: 1300").correct).toBe(false);
    expect(grade(g, "no idea").score).toBe(0);
  });
  it("handles negatives and tolerance", () => {
    expect(grade(t({ kind: "numeric" }, "-56"), "Answer: -56").correct).toBe(true);
    expect(grade(t({ kind: "numeric" }, "-56"), "Answer: 56").correct).toBe(false);
    expect(grade(t({ kind: "numeric", tolerance: 0.0005 }, "2/11"), "Answer: 0.1818").correct).toBe(true);
    expect(grade(t({ kind: "numeric", tolerance: 0.01, relative: true }, "1000"), "Answer: 1009").correct).toBe(true);
    expect(grade(t({ kind: "numeric", tolerance: 0.01, relative: true }, "1000"), "Answer: 1011").correct).toBe(false);
  });
});

describe("exact grader", () => {
  it("is case-insensitive by default and strips wrappers", () => {
    const g = t({ kind: "exact" }, "pots");
    expect(grade(g, "Answer: **Pots**.").correct).toBe(true);
    expect(grade(g, "pots").correct).toBe(true);
    expect(grade(g, "Let me think.\npots").correct).toBe(true);
    expect(grade(g, "Answer: spot").correct).toBe(false);
  });
  it("respects caseSensitive", () => {
    const g = t({ kind: "exact", caseSensitive: true }, "HELLO WORLD");
    expect(grade(g, "Answer: HELLO WORLD").correct).toBe(true);
    expect(grade(g, "Answer: hello world").correct).toBe(false);
  });
});

describe("choice grader", () => {
  const g = t({ kind: "choice", choices: ["A", "B", "C", "D"] }, "C");
  it("accepts common formats", () => {
    for (const r of ["Answer: C", "Answer: (C)", "Answer: C) 97", "Answer: c", "Answer: **C**", "Answer: Option C", "The answer is C.", "C"]) {
      expect(grade(g, r).correct, r).toBe(true);
    }
  });
  it("rejects wrong, missing and hedged answers", () => {
    expect(grade(g, "Answer: B").correct).toBe(false);
    expect(grade(g, "Answer: B or C").correct).toBe(false);
    expect(grade(g, "I am not sure").correct).toBe(false);
  });
  it("supports word choices", () => {
    const yn = t({ kind: "choice", choices: ["yes", "no"] }, "yes");
    expect(grade(yn, "Answer: Yes").correct).toBe(true);
    expect(grade(yn, "Answer: no").correct).toBe(false);
  });
});

describe("regex grader", () => {
  it("matches the answer line", () => {
    const g = t({ kind: "regex", pattern: "^\\W*ben\\W+cara\\W*$", flags: "i" }, "Ben, Cara");
    expect(grade(g, "Answer: Ben, Cara").correct).toBe(true);
    expect(grade(g, "Answer: Cara, Ben").correct).toBe(false);
  });
  it("survives an invalid pattern", () => {
    expect(grade(t({ kind: "regex", pattern: "(" }, "x"), "x").score).toBe(0);
  });
});

describe("contains grader", () => {
  const g = t({ kind: "contains", any: ["Ulaanbaatar", "Ulan Bator"], none: ["Beijing"] }, "Ulaanbaatar");
  it("matches aliases with word boundaries and diacritics folding", () => {
    expect(grade(g, "Answer: Ulan Bator").correct).toBe(true);
    expect(grade(g, "Answer: It is Ulaanbaatar.").correct).toBe(true);
    expect(grade(t({ kind: "contains", any: ["Gödel"] }, "Gödel"), "Answer: Kurt Godel").correct).toBe(true);
    expect(grade(t({ kind: "contains", any: ["Au"] }, "Au"), "Answer: Australia").correct).toBe(false);
  });
  it("gives partial credit and penalizes forbidden phrases", () => {
    const r = grade(g, "Answer: Ulaanbaatar, not Beijing");
    expect(r.score).toBe(0.5);
    expect(r.correct).toBe(false);
    const all = t({ kind: "contains", all: ["Spain", "Portugal"] }, "Spain and Portugal");
    expect(grade(all, "Answer: Spain").score).toBe(0.5);
    expect(grade(all, "Answer: Portugal and Spain").correct).toBe(true);
  });
});

describe("json grader", () => {
  const g = t(
    { kind: "json", requiredKeys: ["total", "due", "missing"], expectedValues: { total: 1245.5, due: "2025-03-03", missing: null } },
    "",
  );
  it("extracts from fences, Answer lines and surrounding prose", () => {
    expect(grade(g, '```json\n{"total": 1245.5, "due": "2025-03-03", "missing": null}\n```').correct).toBe(true);
    expect(grade(g, 'Here you go: {"total": "$1,245.50", "due": "2025-03-03", "missing": null} hope it helps').correct).toBe(true);
    expect(grade(g, 'Answer: {"total":1245.5,"due":"2025-03-03","missing":"N/A"}').correct).toBe(true);
    expect(grade(g, '{"total": 1245.5, "due": "2025-03-03", "missing": null,}').correct).toBe(true); // trailing comma
  });
  it("scores partial matches and missing keys", () => {
    const r = grade(g, '{"total": 1245, "due": "2025-03-03"}');
    // required: total ok, due ok, missing absent (2/3); values: total wrong, due ok, missing null ok (2/3)
    expect(r.score).toBeCloseTo(4 / 6, 9);
    expect(r.correct).toBe(false);
  });
  it("handles malformed JSON", () => {
    expect(grade(g, '{"total": 1245.5, "due": ').score).toBe(0);
    expect(grade(g, "{not json}").detail).toMatch(/malformed/);
    expect(grade(g, "nothing").detail).toMatch(/no JSON/);
    expect(extractJson('text {"a": "b}"} more').value).toEqual({ a: "b}" });
  });
  it("compares arrays order-insensitively and objects by expected keys", () => {
    expect(valuesMatch([{ owner: "Priya" }, { owner: "Marco" }], [{ owner: "marco", task: "x" }, { owner: "Priya" }])).toBe(true);
    expect(valuesMatch([1, 2], [1, 2, 3])).toBe(false);
    expect(valuesMatch(true, "yes")).toBe(true);
    expect(valuesMatch(false, "maybe")).toBe(false);
    expect(valuesMatch("Kenji M.", "kenji m")).toBe(true);
    expect(valuesMatch("5550132277", 5550132277)).toBe(true);
  });
});

describe("code grader", () => {
  const spec: GraderSpec = {
    kind: "code",
    language: "javascript",
    functionName: "add",
    tests: [
      { args: [1, 2], expected: 3 },
      { args: [-1, 1], expected: 0 },
    ],
  };
  const g = t(spec, "function add(a, b) { return a + b; }");

  it("extracts code from fences, Answer blocks or the whole reply", () => {
    expect(grade(g, "Sure!\n```javascript\nfunction add(a, b) { return a + b; }\n```\nDone.").correct).toBe(true);
    expect(grade(g, "```js\nconst add = (a, b) => a + b;\n```").correct).toBe(true);
    expect(grade(g, "Reasoning.\nAnswer: function add(a, b) {\n  return a + b;\n}").correct).toBe(true);
    expect(grade(g, "function add(a, b) { return a + b; }").correct).toBe(true);
    expect(grade(g, "```typescript\nexport function add(a: number, b: number) { return a + b; }\n```").score).toBe(0); // TS syntax is not JS
    expect(extractCode("```\nfunction add(){}\n```", "add")).toBe("function add(){}");
  });
  it("gives partial credit", () => {
    const r = grade(g, "function add(a, b) { return a > 0 ? a + b : 99; }");
    expect(r.score).toBe(0.5);
  });
  it("catches throws, infinite loops and missing functions", () => {
    expect(grade(g, "function add() { throw new Error('boom'); }").score).toBe(0);
    const start = Date.now();
    const loop = grade(g, "function add() { while (true) {} }");
    expect(loop.score).toBe(0);
    expect(loop.detail).toMatch(/timed out/);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(grade(g, "while(true){}").detail).toMatch(/timed out/);
    expect(grade(g, "function plus(a, b) { return a + b; }").detail).toMatch(/not defined/);
    expect(grade(g, "this is not code").score).toBe(0);
  });
  it("has no access to require, process, eval or host globals", () => {
    const probe = (body: string) =>
      runCodeTests(`function add() { ${body} }`, "add", [{ args: [], expected: "safe" }]);
    expect(probe('return typeof require === "undefined" ? "safe" : "leak";').passed).toBe(1);
    expect(probe('return typeof process === "undefined" ? "safe" : "leak";').passed).toBe(1);
    expect(probe('try { return this.constructor.constructor("return process")() ? "leak" : "safe"; } catch (e) { return "safe"; }').passed).toBe(1);
    expect(probe('try { eval("1"); return "leak"; } catch (e) { return "safe"; }').passed).toBe(1);
  });
  it("handles async infinite loops and hostile throws", () => {
    const r = runCodeTests(
      "function add() { const p = { get message() { while (true) {} } }; throw p; }",
      "add",
      [{ args: [], expected: 1 }],
    );
    expect(r.passed).toBe(0);
    const r2 = runCodeTests("function add() { return 1; }\nPromise.resolve().then(function f() { return Promise.resolve().then(f); });", "add", [
      { args: [], expected: 1 },
    ]);
    expect(r2.passed + r2.failures.length).toBe(1);
  });
  it("compares structured results deeply", () => {
    const arr = t(
      { kind: "code", language: "javascript", functionName: "f", tests: [{ args: [[3, 1, 2]], expected: [1, 2, 3] }] },
      "",
    );
    expect(grade(arr, "function f(x) { return x.slice().sort(); }").correct).toBe(true);
    expect(grade(arr, "function f(x) { return x; }").correct).toBe(false);
    expect(grade(arr, "function f(x) { return undefined; }").correct).toBe(false);
  });
});

describe("constraints grader", () => {
  const g = t(
    {
      kind: "constraints",
      checks: [
        { type: "exactLines", value: 3 },
        { type: "allLowercase" },
        { type: "noCommas" },
        { type: "includes", value: "moon" },
        { type: "excludes", value: "night" },
        { type: "maxWords", value: 12 },
      ],
    },
    "",
  );
  it("scores the fraction of satisfied checks", () => {
    expect(grade(g, "the moon is bright\nstars hum softly\nall is calm").score).toBe(1);
    const r = grade(g, "The moon, at night\nstars\nend");
    // fails: allLowercase, noCommas, excludes night => 3/6
    expect(r.score).toBe(0.5);
    expect(r.detail).toMatch(/allLowercase/);
  });
  it("grades only the text after an Answer: marker when present", () => {
    expect(grade(g, "Here is my poem:\nAnswer: the moon is bright\nstars hum softly\nall is calm").score).toBe(1);
  });
  it("counts words, bullets and boundaries sensibly", () => {
    expect(countWords("- one two\n1. three")).toBe(3);
    const b = t({ kind: "constraints", checks: [{ type: "bulletCount", value: 2 }, { type: "startsWith", value: "-" }, { type: "endsWith", value: "!" }] }, "");
    expect(grade(b, "- a\n* b!").score).toBe(1);
    expect(grade(b, "- a\nb!").score).toBeCloseTo(2 / 3, 9);
    const up = t({ kind: "constraints", checks: [{ type: "allUppercase" }, { type: "minWords", value: 2 }] }, "");
    expect(grade(up, "HELLO THERE").correct).toBe(true);
    expect(grade(up, "123 456").score).toBe(0.5); // no letters: not "uppercase"
  });
});

describe("robustness", () => {
  it("never throws on odd input", () => {
    const specs: GraderSpec[] = [
      { kind: "exact" },
      { kind: "numeric" },
      { kind: "choice", choices: ["A"] },
      { kind: "contains" },
      { kind: "json", requiredKeys: [] },
      { kind: "code", language: "javascript", functionName: "f", tests: [] },
      { kind: "constraints", checks: [] },
    ];
    for (const s of specs) {
      for (const text of ["", "Answer:", "```", "{", "\u0000", "Answer: ".repeat(1000)]) {
        const r = grade({ grader: s, expected: "x" }, text);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    }
    expect(grade({ grader: { kind: "exact" }, expected: "x" }, undefined as unknown as string).score).toBe(0);
  });
});

describe("constraints with an Answer: line inside the content", () => {
  it("uses the better of the whole reply and the post-marker block", () => {
    const g = t(
      {
        kind: "constraints",
        checks: [
          { type: "startsWith", value: "What is the boiling point of water at sea level?" },
          { type: "exactLines", value: 2 },
          { type: "includes", value: "100" },
        ],
      },
      "",
    );
    expect(grade(g, "What is the boiling point of water at sea level?\nAnswer: 100 degrees Celsius").score).toBe(1);
  });
});

describe("ordering regex", () => {
  it("accepts numbered or arrowed lists", async () => {
    const { getSuite } = await import("./suites");
    const task = getSuite("reasoning")!.tasks.find((x) => x.id === "reasoning/order-race")!;
    expect(grade(task, "Answer: Ben, Cara, Dev, Ava").correct).toBe(true);
    expect(grade(task, "Answer: 1. Ben 2. Cara 3. Dev 4. Ava").correct).toBe(true);
    expect(grade(task, "Answer: Ben > Cara > Dev > Ava").correct).toBe(true);
    expect(grade(task, "Answer: Ben, Dev, Cara, Ava").correct).toBe(false);
  });
});
