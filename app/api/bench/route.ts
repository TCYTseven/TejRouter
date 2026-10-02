import { BenchConfigError, newRunId, planRun, runBench, type RunPlan } from "@/lib/bench/runner";
import { saveRun } from "@/lib/bench/store";
import type { BenchEvent, BenchRun } from "@/lib/bench/types";

// Long benchmark runs stream for many minutes.
export const maxDuration = 800;

type RunEnd = Extract<BenchEvent, { type: "run-end" }>;

/**
 * Start a benchmark run. Body: BenchRunConfig. Responds with NDJSON BenchEvents:
 * run-start, sample × N, optional error events, and finally run-end (with `persisted`).
 * Invalid configs get a 400 JSON `{ error }` before any streaming starts.
 * Disconnecting the client aborts the run; the partial run is still saved.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  let config: RunPlan["config"];
  try {
    // Resolve defaults (notably the seed) once, so the stored config reproduces the run.
    config = planRun(body).config;
  } catch (e) {
    if (e instanceof BenchConfigError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const runId = newRunId();
  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  request.signal.addEventListener("abort", onClientAbort, { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: BenchEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };

      let end: RunEnd | null = null;
      let run: BenchRun | null = null;
      try {
        run = await runBench(
          config,
          (e) => {
            // Hold run-end until the run is saved so it can report `persisted`.
            if (e.type === "run-end") end = e;
            else send(e);
          },
          abort.signal,
          { runId },
        );
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }

      let persisted = false;
      if (run) {
        const saved = await saveRun(run);
        persisted = saved.persisted;
        if (!saved.persisted) send({ type: "error", message: `Run finished but could not be saved to disk: ${saved.error}` });
      }
      const finalEvent: RunEnd = end ?? { type: "run-end", runId, finishedAt: Date.now(), aborted: true };
      send({ ...finalEvent, persisted });

      request.signal.removeEventListener("abort", onClientAbort);
      if (open) {
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Bench-Run-Id": runId,
    },
  });
}
