import { callChat } from "@/lib/providers/client";
import type { ChatRequest, ChatStreamEvent } from "@/lib/types";

export const maxDuration = 300;

/** Stream one router call as NDJSON ChatStreamEvents. */
export async function POST(request: Request) {
  const req = (await request.json()) as ChatRequest;
  if (!req?.providerId || !Array.isArray(req.messages)) {
    return Response.json({ error: "providerId and messages are required" }, { status: 400 });
  }
  delete req.simulatorHint;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      send({ type: "start", providerId: req.providerId, requestedModel: req.model ?? "", startedAt: Date.now() });
      const result = await callChat(req, {
        signal: request.signal,
        onDelta: (text) => send({ type: "delta", text }),
      });
      send({ type: "done", result });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
