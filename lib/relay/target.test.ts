import { describe, expect, it } from "vitest";
import { asText } from "@/lib/providers/openai";
import { checkTargetUrl, isPrivateAddress } from "./target";

describe("relay target", () => {
  it("allows public https chat and model calls", () => {
    expect(checkTargetUrl("https://api.router.com/v1/chat/completions", false).ok).toBe(true);
    expect(checkTargetUrl("https://openrouter.ai/api/v1/models", false).ok).toBe(true);
  });

  it("refuses everything else in production", () => {
    for (const url of [
      null,
      "not a url",
      "http://api.router.com/v1/chat/completions",
      "https://api.router.com/v1/files",
      "https://user:pw@api.router.com/v1/models",
      "https://localhost/v1/models",
      "https://127.0.0.1/v1/models",
      "https://[::1]/v1/models",
      "https://169.254.169.254/v1/models",
      "https://10.0.0.5/v1/chat/completions",
    ]) {
      expect(checkTargetUrl(url, false).ok, String(url)).toBe(false);
    }
  });

  it("allows local http routers in development", () => {
    expect(checkTargetUrl("http://localhost:8000/v1/chat/completions", true).ok).toBe(true);
  });

  it("classifies addresses", () => {
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });
});

describe("asText", () => {
  it("turns router objects into text", () => {
    expect(asText({ name: "Anthropic", slug: "anthropic" })).toBe("Anthropic");
    expect(asText({ message: "rate limited", code: 429 })).toBe("rate limited");
    expect(asText("gpt-4o")).toBe("gpt-4o");
    expect(asText(null)).toBeNull();
    expect(asText({ weird: 1 })).toBe('{"weird":1}');
  });
});
