import { providerStatuses } from "@/lib/providers/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ providers: providerStatuses() });
}
