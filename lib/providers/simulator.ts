import type { ChatRequest, ChatResult, ProviderSpec } from "@/lib/types";
import { estimateCostUsd } from "@/lib/pricing";

/**
 * Offline routers. They make TejRouter usable with zero keys and give the stats
 * engine a ground truth: we know exactly how each simulator routes, so the
 * dashboard's estimates can be checked against it.
 */

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const MODELS = {
  "sim/small": { baseTtft: 180, tps: 140, skill: 0.92, slope: 0.75 },
  "sim/large": { baseTtft: 520, tps: 55, skill: 0.98, slope: 0.28 },
} as const;
type SimModel = keyof typeof MODELS;

function estimateDifficulty(text: string): number {
  // A crude prior from length and keywords; the hint replaces this in benchmarks.
  const len = Math.min(text.length / 1200, 1);
  const hard = /(prove|derive|optimi[sz]e|step by step|algorithm|regex|edge case)/i.test(text) ? 0.3 : 0;
  return Math.min(1, 0.2 + 0.5 * len + hard);
}

function route(spec: ProviderSpec, requested: string, difficulty: number, rand: () => number): SimModel {
  if (requested === "sim/small" || requested === "sim/large") return requested;
  if (spec.id === "sim-greedy") return rand() < 0.1 ? "sim/large" : "sim/small";
  const noisy = difficulty + 0.15 * gaussian(rand);
  return noisy > 0.45 ? "sim/large" : "sim/small";
}

function wrongAnswer(expected: string, rand: () => number): string {
  const n = Number(expected);
  if (Number.isFinite(n) && expected.trim() !== "") {
    const delta = Math.max(1, Math.round(Math.abs(n) * 0.1 * rand())) * (rand() < 0.5 ? -1 : 1);
    return String(n + delta);
  }
  return ["unsure", "none of the above", expected.split("").reverse().join("")][Math.floor(rand() * 3)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function simulateChat(
  spec: ProviderSpec,
  req: ChatRequest,
  onDelta?: (text: string) => void,
): Promise<ChatResult> {
  const startedAt = Date.now();
  const prompt = req.messages.map((m) => m.content).join("\n");
  const rand = mulberry32(hashString(`${spec.id}|${req.seed ?? 0}|${prompt}`));
  const hint = req.simulatorHint;
  const difficulty = hint?.difficulty ?? estimateDifficulty(prompt);
  const requested = req.model || spec.autoModel || "sim/auto";
  const model = route(spec, requested, difficulty, rand);
  const m = MODELS[model];

  let text: string;
  if (hint) {
    const pCorrect = Math.max(0.02, m.skill - m.slope * difficulty * difficulty);
    const correct = rand() < pCorrect;
    const answer = correct ? hint.expected : wrongAnswer(hint.expected, rand);
    text = `Working through the ${hint.category} task on ${model}.\nAnswer: ${answer}`;
  } else {
    text =
      `[${spec.name}] routed this prompt to ${model} ` +
      `(estimated difficulty ${difficulty.toFixed(2)}). ` +
      `This is a simulated router: add real API keys in .env.local to compare live routers.`;
  }

  const promptTokens = Math.ceil(prompt.length / 4);
  const completionTokens = Math.ceil(text.length / 4) + Math.round(difficulty * 40);
  const ttftMs = Math.max(40, m.baseTtft * Math.exp(0.25 * gaussian(rand)));
  const genMs = (completionTokens / m.tps) * 1000 * Math.exp(0.15 * gaussian(rand));

  if (onDelta) {
    // Stream for real so the playground animates, but quickly.
    await sleep(Math.min(ttftMs, 400));
    const chunks = text.match(/[\s\S]{1,12}/g) ?? [text];
    for (const c of chunks) {
      onDelta(c);
      await sleep(Math.min(25, genMs / chunks.length));
    }
  }

  const usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  return {
    id: `sim-${hashString(prompt + startedAt + rand())}`,
    providerId: spec.id,
    requestedModel: requested,
    servedModel: model,
    servedProvider: "simulator",
    ok: true,
    error: null,
    httpStatus: 200,
    text,
    finishReason: "stop",
    usage,
    costUsd: estimateCostUsd(model, usage),
    costSource: "estimated",
    // Report simulated timings so statistics behave like a real deployment.
    latencyMs: ttftMs + genMs,
    ttftMs,
    outputTps: completionTokens / (genMs / 1000),
    startedAt,
    routingHeaders: { "x-sim-difficulty": difficulty.toFixed(3) },
  };
}
