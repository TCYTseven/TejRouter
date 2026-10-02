import { listModels } from "@/lib/providers/client";

export async function GET(_req: Request, ctx: RouteContext<"/api/providers/[id]/models">) {
  const { id } = await ctx.params;
  return Response.json(await listModels(id));
}
