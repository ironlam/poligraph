import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnthropicResponse } from "@/lib/api/anthropic";
import type { MistralResponse } from "@/lib/api/mistral";

// Mock only the network calls; keep the real extract/parse helpers.
vi.mock("@/lib/api/anthropic", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/anthropic")>();
  return { ...actual, callAnthropic: vi.fn() };
});
vi.mock("@/lib/api/mistral", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: vi.fn() };
});

import { callAnthropic } from "@/lib/api/anthropic";
import { callMistral } from "@/lib/api/mistral";
import { classifyTheme } from "@/services/classify-theme";

const anthropicTool = (theme: string): AnthropicResponse => ({
  content: [{ type: "tool_use", name: "classify_theme", input: { theme } }],
});

const mistralJson = (obj: unknown): MistralResponse => ({
  choices: [
    { message: { role: "assistant", content: JSON.stringify(obj) }, finish_reason: "stop" },
  ],
});

describe("classifyTheme, Mistral en premier", () => {
  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
    vi.mocked(callMistral).mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("Mistral OK -> returns theme, Anthropic NOT called", async () => {
    // The Anthropic account runs dry for months at a time: calling it first cost a failed
    // request and a warning on every single classification.
    vi.mocked(callMistral).mockResolvedValue(mistralJson({ theme: "SANTE" }));
    const res = await classifyTheme("Loi hôpital", "réforme des urgences");
    expect(res).toBe("SANTE");
    expect(callAnthropic).not.toHaveBeenCalled();
  });

  it("Mistral returns an alias -> normalized", async () => {
    vi.mocked(callMistral).mockResolvedValue(mistralJson({ theme: "CULTURE_EDUCATION" }));
    const res = await classifyTheme("Loi école");
    expect(res).toBe("EDUCATION_CULTURE");
  });

  it("Mistral returns an invalid theme -> null (not thrown), no second provider", async () => {
    vi.mocked(callMistral).mockResolvedValue(mistralJson({ theme: "PAS_UN_THEME" }));
    const res = await classifyTheme("Texte ambigu");
    expect(res).toBeNull();
    expect(callAnthropic).not.toHaveBeenCalled();
  });

  it("Mistral throws (quota / rate-limit) -> Anthropic called", async () => {
    vi.mocked(callMistral).mockRejectedValue(new Error("Mistral API error 429: rate limit"));
    vi.mocked(callAnthropic).mockResolvedValue(anthropicTool("TRANSPORTS"));
    const res = await classifyTheme("Loi mobilités");
    expect(res).toBe("TRANSPORTS");
    expect(callAnthropic).toHaveBeenCalledTimes(1);
  });

  it("MISTRAL_API_KEY missing -> Anthropic still answers", async () => {
    vi.mocked(callMistral).mockRejectedValue(
      new Error("MISTRAL_API_KEY environment variable is not set")
    );
    vi.mocked(callAnthropic).mockResolvedValue(anthropicTool("SANTE"));
    expect(await classifyTheme("Loi hôpital")).toBe("SANTE");
  });

  it("both providers throw -> error propagated with both causes (not swallowed)", async () => {
    vi.mocked(callMistral).mockRejectedValue(
      new Error("Mistral API error 503: service unavailable")
    );
    vi.mocked(callAnthropic).mockRejectedValue(
      new Error("Anthropic API error 400: credit balance too low")
    );
    await expect(classifyTheme("X")).rejects.toThrow(
      /Theme classification failed.*service unavailable.*credit balance too low/
    );
  });
});
