import { describe, expect, it } from "vitest";
import { simulateChat } from "./simulator";
import { getProviderSpec } from "./registry";

describe("simulator", () => {
  it("is deterministic for the same seed and prompt", async () => {
    const spec = getProviderSpec("sim-oracle")!;
    const req = { providerId: spec.id, messages: [{ role: "user" as const, content: "2+2?" }], seed: 7 };
    const a = await simulateChat(spec, req);
    const b = await simulateChat(spec, req);
    expect(a.servedModel).toBe(b.servedModel);
    expect(a.text).toBe(b.text);
  });

  it("difficulty-aware router escalates hard tasks more than greedy", async () => {
    const count = async (id: string) => {
      const spec = getProviderSpec(id)!;
      let large = 0;
      for (let i = 0; i < 200; i++) {
        const r = await simulateChat(spec, {
          providerId: id,
          seed: i,
          messages: [{ role: "user", content: `task ${i}` }],
          simulatorHint: { expected: "42", difficulty: 0.9, category: "math" },
        });
        if (r.servedModel === "sim/large") large++;
      }
      return large;
    };
    expect(await count("sim-oracle")).toBeGreaterThan(await count("sim-greedy"));
  });
});
