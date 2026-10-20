import { importRun, listRuns, RunImportError, summarizeRun } from "@/lib/bench/store";

/** `{ runs: RunSummary[] }`, newest first. */
export async function GET() {
  return Response.json({ runs: await listRuns() }, { headers: { "Cache-Control": "no-store" } });
}

/** Import a BenchRun JSON. Responds 201 `{ run: RunSummary, stored: BenchRun, persisted }`. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be BenchRun JSON." }, { status: 400 });
  }
  try {
    const { run, save } = await importRun(body);
    return Response.json(
      { run: summarizeRun(run), stored: run, persisted: save.persisted, ...(save.error ? { warning: save.error } : {}) },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof RunImportError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
