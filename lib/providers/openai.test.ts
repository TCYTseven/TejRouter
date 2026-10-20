import { describe, expect, it } from "vitest";
import type { ProviderSpec } from "@/lib/types";
import { callChatWith, responsesBody, routedModel, type RouterTarget } from "./openai";

const spec: ProviderSpec = {
  id: "ramp",
  name: "Ramp Router",
  tagline: "",
  baseUrl: "https://api.router.com/v1",
  baseUrlEnv: "",
  keyEnvs: [],
  modelEnv: "",
  autoModel: null,
  suggestedModels: [],
  docsUrl: "",
  color: "#000",
  api: "responses",
};

function sse(events: unknown[]): Response {
  const body = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "x-router-provider": "openai" } });
}

function target(handler: (url: string, init: RequestInit) => Response | Promise<Response>, calls: { url: string; body: Record<string, unknown> }[] = []): RouterTarget {
  return {
    spec,
    apiKey: "k",
    baseUrl: spec.baseUrl,
    defaultModel: "gpt-5.6-sol",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return handler(url, init ?? {});
    }) as typeof fetch,
  };
}

describe("responsesBody", () => {
  it("moves system messages to instructions and clamps max_output_tokens", () => {
    const b = responsesBody("m", {
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "hi" },
      ],
      temperature: 0,
      maxTokens: 5,
    });
    expect(b).toEqual({ model: "m", input: [{ role: "user", content: "hi" }], stream: true, instructions: "Be brief.", temperature: 0, max_output_tokens: 16 });
  });
});

describe("callChatWith on a Responses API router", () => {
  it("posts to /responses and reads the streamed text, model, usage and cost", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const r = await callChatWith(
      target(
        () =>
          sse([
            { type: "response.created", response: { id: "resp_1", model: "gpt-5.6-sol", status: "in_progress" }, provider: "openai" },
            { type: "response.output_text.delta", delta: "po" },
            { type: "response.output_text.delta", delta: "ng" },
            {
              type: "response.completed",
              provider: "openai",
              response: { id: "resp_1", model: "gpt-5.4-mini", status: "completed", usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, cost: 0.0001 } },
            },
          ]),
        calls,
      ),
      { providerId: "ramp", messages: [{ role: "user", content: "Reply with: pong" }], maxTokens: 5 },
    );
    expect(calls[0].url).toBe("https://api.router.com/v1/responses");
    expect(calls[0].body.max_output_tokens).toBe(16);
    expect(r.ok).toBe(true);
    expect(r.text).toBe("pong");
    expect(r.servedModel).toBe("gpt-5.4-mini");
    expect(r.servedProvider).toBe("openai");
    expect(r.usage.promptTokens).toBe(10);
    expect(r.usage.completionTokens).toBe(2);
    expect(r.costUsd).toBe(0.0001);
    expect(r.costSource).toBe("reported");
    expect(r.finishReason).toBe("stop");
  });

  it("reads a whole JSON response when the router does not stream", async () => {
    const r = await callChatWith(
      target(() =>
        Response.json({
          object: "response",
          model: "claude-haiku-4-5",
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [{ type: "message", content: [{ type: "output_text", text: "Answer: 4" }] }],
          usage: { input_tokens: 3, output_tokens: 16 },
        }),
      ),
      { providerId: "ramp", messages: [{ role: "user", content: "2+2" }] },
    );
    expect(r.ok).toBe(true);
    expect(r.text).toBe("Answer: 4");
    expect(r.servedModel).toBe("claude-haiku-4-5");
    expect(r.finishReason).toBe("length");
  });

  it("retries once without temperature when a reasoning model refuses it", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    let n = 0;
    const r = await callChatWith(
      target(() => {
        n++;
        if (n === 1) return Response.json({ error: { message: "Unsupported parameter: 'temperature'" } }, { status: 400 });
        return sse([{ type: "response.output_text.delta", delta: "ok" }, { type: "response.completed", response: { model: "gpt-5.6-sol", status: "completed" } }]);
      }, calls),
      { providerId: "ramp", messages: [{ role: "user", content: "hi" }], temperature: 0 },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1].body.temperature).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.text).toBe("ok");
  });

  it("reports a failed response as a stream error", async () => {
    const r = await callChatWith(
      target(() => sse([{ type: "response.failed", response: { status: "failed", error: { message: "provider down" } } }])),
      { providerId: "ramp", messages: [{ role: "user", content: "hi" }] },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("provider down");
  });
});

describe("routedModel", () => {
  const spec = { autoModel: "cyberouter/auto", routingModels: ["switchyard"] };
  it("keeps the body's model when it names a real model", () => {
    expect(routedModel("gpt-5.4-mini", "cyberouter/auto", spec, { "x-model": "other" })).toBe("gpt-5.4-mini");
  });
  it("reads a header when the body only echoes the routing alias", () => {
    expect(routedModel("cyberouter/auto", "cyberouter/auto", spec, { "x-routed-model": "claude-haiku-4-5" })).toBe("claude-haiku-4-5");
    expect(routedModel("switchyard", "switchyard", spec, { "x-model": "gpt-5.6-sol" })).toBe("gpt-5.6-sol");
  });
  it("falls back to the alias, or a header, when nothing better is known", () => {
    expect(routedModel("cyberouter/auto", "cyberouter/auto", spec, {})).toBe("cyberouter/auto");
    expect(routedModel(null, "x", spec, { "x-model": "m1" })).toBe("m1");
    expect(routedModel(null, "x", spec, { "x-ratelimit-model-limit": "10" })).toBe(null);
  });
});
