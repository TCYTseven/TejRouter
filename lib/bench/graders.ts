import vm from "node:vm";
import { types } from "node:util";
import type { BenchTask, GradeResult } from "./types";
import {
  MAX_CODE_CHARS,
  PER_CALL_TIMEOUT_MS,
  PRELUDE,
  TOTAL_BUDGET_MS,
  deepEqual,
  gradeWith,
  sanitizeCode,
  type CodeRunResult,
} from "./grade-core";

export * from "./grade-core";

/**
 * Run `code` in a fresh node:vm context and call `functionName` on each test.
 * Only strings cross the realm boundary (arguments go in as a JSON literal and results
 * come back JSON-encoded), so no host objects such as `process` or `require` are reachable.
 */
export function runCodeTests(
  code: string,
  functionName: string,
  tests: { args: unknown[]; expected: unknown }[],
): CodeRunResult {
  const failures: string[] = [];
  if (!/^[A-Za-z_$][\w$]*$/.test(functionName)) return { passed: 0, total: tests.length, failures: ["bad function name"] };
  if (code.length > MAX_CODE_CHARS) return { passed: 0, total: tests.length, failures: ["code too long"] };
  let context: vm.Context;
  try {
    context = vm.createContext(Object.create(null), {
      codeGeneration: { strings: false, wasm: false },
      microtaskMode: "afterEvaluate",
    });
    new vm.Script(PRELUDE).runInContext(context, { timeout: PER_CALL_TIMEOUT_MS });
    const check = new vm.Script(
      `${sanitizeCode(code)}\n;(typeof ${functionName} === "function" ? "ok" : (typeof module.exports === "function" ? (globalThis.${functionName} = module.exports, "ok") : (module.exports && typeof module.exports.${functionName} === "function" ? (globalThis.${functionName} = module.exports.${functionName}, "ok") : "missing")))`,
      { filename: "submission.js" },
    ).runInContext(context, { timeout: PER_CALL_TIMEOUT_MS });
    if (check !== "ok") return { passed: 0, total: tests.length, failures: [`function ${functionName} not defined`] };
  } catch (e) {
    return { passed: 0, total: tests.length, failures: [`load error: ${errMessage(e)}`] };
  }
  const started = Date.now();
  let passed = 0;
  for (const [i, t] of tests.entries()) {
    if (Date.now() - started > TOTAL_BUDGET_MS) {
      failures.push(`test ${i}: time budget exhausted`);
      continue;
    }
    try {
      const argsLiteral = JSON.stringify(JSON.stringify(t.args));
      // Errors are stringified inside the sandbox (under the timeout), so the host only sees strings.
      const out: unknown = new vm.Script(
        `(function () {
          try {
            var __r = ${functionName}.apply(null, JSON.parse(${argsLiteral}));
            if (__r === undefined) return "U";
            var __s = JSON.stringify(__r);
            return typeof __s === "string" ? "R" + __s : "N";
          } catch (__e) {
            var __m = "error";
            try { __m = String(__e && __e.message !== undefined ? __e.message : __e); } catch (__e2) {}
            return "E" + __m;
          }
        })()`,
      ).runInContext(context, { timeout: PER_CALL_TIMEOUT_MS });
      if (typeof out !== "string" || !out) {
        failures.push(`test ${i}: non-serializable result`);
        continue;
      }
      if (out[0] === "E") {
        failures.push(`test ${i}: threw ${out.slice(1, 200)}`);
        continue;
      }
      if (out[0] === "N") {
        failures.push(`test ${i}: non-serializable result`);
        continue;
      }
      const got = out === "U" ? undefined : JSON.parse(out.slice(1));
      if (deepEqual(got, t.expected)) passed++;
      else failures.push(`test ${i}: expected ${JSON.stringify(t.expected)}, got ${out.slice(1, 200)}`);
    } catch (e) {
      failures.push(`test ${i}: ${errMessage(e)}`);
    }
  }
  return { passed, total: tests.length, failures };
}

function errMessage(e: unknown): string {
  // Never touch getters or proxies that sandboxed code may have planted on a thrown value:
  // only read a plain data `message` property off a native Error.
  if (e && typeof e === "object" && types.isNativeError(e)) {
    const d = Object.getOwnPropertyDescriptor(e, "message");
    const msg = d && "value" in d && typeof d.value === "string" ? d.value : "error";
    return /timed out/i.test(msg) ? "timed out" : msg.slice(0, 200);
  }
  if (typeof e === "string" || typeof e === "number") return String(e).slice(0, 200);
  return "exception thrown";
}


/** Score a reply for a task, running code tasks in node:vm. Never throws. */
export function grade(task: Pick<BenchTask, "grader" | "expected">, text: string): GradeResult {
  return gradeWith(task, text, runCodeTests);
}
