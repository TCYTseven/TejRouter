import { BenchConfigError, runBenchWith } from "@/lib/bench/engine";
import { codeGrade, codeToRun, gradeWith } from "@/lib/bench/grade-core";
import type { BenchEvent, BenchRunConfig, BenchTask, GradeResult } from "@/lib/bench/types";
import type { CallOptions } from "@/lib/providers/openai";
import { getProviderSpec } from "@/lib/providers/registry";
import { simulateChat } from "@/lib/providers/simulator";
import type { ChatRequest, ChatResult } from "@/lib/types";
import { BenchStartError, importRun } from "./bench";
import { clientFailure, isAbortError, streamChat } from "./chat";
import { runCodeTestsInBrowser } from "./code-runner";
import { browserTarget, callWithBrowserKey, hasBrowserKey } from "./keys";

/**
 * Benchmarks that use a key saved in Settings run here, in the browser, so the key is never
 * saved on TejRouter's server. Routers with a saved key are called directly (or through
 * /api/relay when they block CORS); practice
 * routers run in the page; routers configured in .env.local still go through /api/chat.
 * The finished run (results only, no keys) is then saved through POST /api/runs.
 */

export function runsInBrowser(config: Pick<BenchRunConfig, "arms">): boolean {
  return config.arms.some((a) => hasBrowserKey(a.providerId));
}

async function call(req: ChatRequest, opts: CallOptions): Promise<ChatResult> {
  const target = browserTarget(req.providerId);
  if (target) return callWithBrowserKey(target, req, opts);
  const spec = getProviderSpec(req.providerId);
  if (spec?.simulated) return simulateChat(spec, req, opts.onDelta);
  const startedAt = Date.now();
  const { simulatorHint: _hint, ...clean } = req;
  void _hint;
  try {
    return await streamChat(clean, { signal: opts.signal });
  } catch (e) {
    return clientFailure(req, isAbortError(e) ? "Network error: aborted" : String(e), startedAt);
  }
}

const noCodeRunner = () => {
  throw new Error("code tasks are graded asynchronously");
};

async function grade(task: BenchTask, text: string): Promise<GradeResult> {
  if (task.grader.kind !== "code") return gradeWith(task, text, noCodeRunner);
  const code = codeToRun(task.grader, text);
  if (typeof code !== "string") return code;
  return codeGrade(code, await runCodeTestsInBrowser(code, task.grader.functionName, task.grader.tests));
}

/** Same contract as startBench (lib/client/bench.ts), run in the browser. */
export async function startLocalBench(
  config: BenchRunConfig,
  opts: { onEvent: (e: BenchEvent) => void; signal?: AbortSignal },
): Promise<void> {
  let end: Extract<BenchEvent, { type: "run-end" }> | null = null;
  let run;
  try {
    run = await runBenchWith(
      config,
      (e) => {
        if (e.type === "run-end") end = e;
        else opts.onEvent(e);
      },
      opts.signal,
      { call, grade },
    );
  } catch (e) {
    if (e instanceof BenchConfigError) throw new BenchStartError(e.message, 400);
    throw e;
  }

  let persisted = false;
  let runId = run.id;
  try {
    const saved = await importRun(run);
    persisted = saved.persisted;
    runId = saved.run.id;
    if (!saved.persisted) {
      opts.onEvent({ type: "error", message: `Run finished but could not be saved to disk: ${saved.warning ?? "unknown error"}` });
    }
  } catch (e) {
    opts.onEvent({
      type: "error",
      message: `Run finished but could not be saved: ${e instanceof Error ? e.message : String(e)}. Export it before leaving this page.`,
    });
  }
  const finalEvent = end ?? { type: "run-end" as const, runId, finishedAt: Date.now(), aborted: true };
  opts.onEvent({ ...finalEvent, runId, persisted });
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
}
