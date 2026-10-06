import {
  MAX_CODE_CHARS,
  PER_CALL_TIMEOUT_MS,
  PRELUDE,
  TOTAL_BUDGET_MS,
  deepEqual,
  sanitizeCode,
  type CodeRunResult,
} from "@/lib/bench/grade-core";

/**
 * The browser's version of runCodeTests (lib/bench/graders.ts): runs a model's code in a
 * throwaway Web Worker with networking removed, under the same per-call and total time
 * limits. A test that overruns its limit terminates the worker; that test and any after
 * it fail, where node:vm could carry on with the next one.
 */

/* Runs inside the worker. Kept as a string so no bundler config is needed. */
const WORKER_SOURCE = `
"use strict";
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "BroadcastChannel", "Worker", "SharedWorker"]) {
  try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch (e) {}
}
const post = self.postMessage.bind(self);
self.onmessage = function (ev) {
  const job = ev.data;
  self.onmessage = null;
  let fn;
  try {
    const fname = job.functionName;
    const body = job.prelude + "\\n" + job.code + "\\n;return (typeof " + fname + " === \\"function\\" ? " + fname +
      " : (typeof module.exports === \\"function\\" ? module.exports : (module.exports && typeof module.exports." + fname +
      " === \\"function\\" ? module.exports." + fname + " : null)));";
    fn = new Function(body)();
  } catch (e) {
    let m = "error";
    try { m = String(e && e.message !== undefined ? e.message : e); } catch (e2) {}
    post({ type: "loaded", error: m.slice(0, 200) });
    return;
  }
  if (typeof fn !== "function") { post({ type: "loaded", missing: true }); return; }
  post({ type: "loaded" });
  for (let i = 0; i < job.tests.length; i++) {
    let out;
    try {
      const r = fn.apply(null, JSON.parse(job.tests[i]));
      if (r === undefined) out = "U";
      else { const s = JSON.stringify(r); out = typeof s === "string" ? "R" + s : "N"; }
    } catch (e) {
      let m = "error";
      try { m = String(e && e.message !== undefined ? e.message : e); } catch (e2) {}
      out = "E" + m;
    }
    post({ type: "test", i: i, out: out });
  }
};
`;

/** Allowance for spinning up the worker before the submission's own load timer starts. */
const STARTUP_SLACK_MS = 1500;

let workerUrl: string | null = null;

function workerScriptUrl(): string {
  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  return workerUrl;
}

type WorkerMessage =
  | { type: "loaded"; error?: string; missing?: boolean }
  | { type: "test"; i: number; out: unknown };

export function runCodeTestsInBrowser(
  code: string,
  functionName: string,
  tests: { args: unknown[]; expected: unknown }[],
): Promise<CodeRunResult> {
  const total = tests.length;
  if (!/^[A-Za-z_$][\w$]*$/.test(functionName)) return Promise.resolve({ passed: 0, total, failures: ["bad function name"] });
  if (code.length > MAX_CODE_CHARS) return Promise.resolve({ passed: 0, total, failures: ["code too long"] });
  if (typeof Worker === "undefined") return Promise.resolve({ passed: 0, total, failures: ["load error: Web Workers unavailable"] });

  return new Promise((resolve) => {
    const failures: string[] = [];
    let passed = 0;
    let next = 0;
    let loaded = false;
    let started = 0;
    let settled = false;
    let timer: number | undefined;
    const worker = new Worker(workerScriptUrl());

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.terminate();
      resolve({ passed, total, failures });
    };
    const failRest = (first: string) => {
      if (next < total) failures.push(`test ${next}: ${first}`);
      for (let i = next + 1; i < total; i++) failures.push(`test ${i}: time budget exhausted`);
      next = total;
      finish();
    };
    const arm = () => {
      window.clearTimeout(timer);
      if (!loaded) {
        timer = window.setTimeout(() => {
          failures.length = 0;
          failures.push("load error: Script execution timed out");
          passed = 0;
          finish();
        }, PER_CALL_TIMEOUT_MS + STARTUP_SLACK_MS);
        return;
      }
      const budgetLeft = TOTAL_BUDGET_MS - (Date.now() - started);
      timer = window.setTimeout(
        () => failRest(budgetLeft < PER_CALL_TIMEOUT_MS ? "time budget exhausted" : "timed out"),
        Math.max(0, Math.min(PER_CALL_TIMEOUT_MS, budgetLeft)),
      );
    };

    worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const m = ev.data;
      if (m.type === "loaded") {
        if (m.error != null) {
          failures.push(`load error: ${m.error}`);
          return finish();
        }
        if (m.missing) {
          failures.push(`function ${functionName} not defined`);
          return finish();
        }
        loaded = true;
        started = Date.now();
        if (!total) return finish();
        return arm();
      }
      const i = m.i;
      const out = m.out;
      next = i + 1;
      if (typeof out !== "string" || !out || out[0] === "N") failures.push(`test ${i}: non-serializable result`);
      else if (out[0] === "E") failures.push(`test ${i}: threw ${out.slice(1, 200)}`);
      else {
        let got: unknown;
        try {
          got = out === "U" ? undefined : JSON.parse(out.slice(1));
        } catch {
          failures.push(`test ${i}: non-serializable result`);
          got = Symbol.for("bad");
        }
        if (typeof got !== "symbol") {
          if (deepEqual(got, tests[i].expected)) passed++;
          else failures.push(`test ${i}: expected ${JSON.stringify(tests[i].expected)}, got ${out.slice(1, 200)}`);
        }
      }
      if (next >= total) return finish();
      arm();
    };
    worker.onerror = (ev) => {
      ev.preventDefault();
      if (!loaded) {
        failures.push(`load error: ${ev.message || "error"}`.slice(0, 220));
        return finish();
      }
      failRest(`threw ${ev.message || "error"}`.slice(0, 220));
    };

    arm();
    worker.postMessage({
      prelude: PRELUDE,
      code: sanitizeCode(code),
      functionName,
      tests: tests.map((t) => JSON.stringify(t.args)),
    });
  });
}
