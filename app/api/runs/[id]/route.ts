import { deleteRun, isValidRunId, loadRun } from "@/lib/bench/store";

/** The full BenchRun, or 404 `{ error }`. */
export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  if (!isValidRunId(id)) return Response.json({ error: "Invalid run id" }, { status: 400 });
  const run = await loadRun(id);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}

/** `{ deleted: true }`, or 404 `{ error }`. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  if (!isValidRunId(id)) return Response.json({ error: "Invalid run id" }, { status: 400 });
  const ok = await deleteRun(id);
  if (!ok) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json({ deleted: true, id });
}
