import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/api/mistral", () => ({
  callMistral: vi.fn(),
  extractMistralText: vi.fn(),
  parseMistralJSON: vi.fn(),
}));

import { validateAnalysisOutput } from "../scrutin-analysis";

describe("validateAnalysisOutput", () => {
  it("accepts valid structured output", () => {
    const result = validateAnalysisOutput({
      argumentsFor: "Les partisans du texte ont mis en avant la stabilité budgétaire.",
      argumentsAgainst: "Les opposants ont dénoncé l'impact sur les collectivités.",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects output with value-laden adjectives", () => {
    const result = validateAnalysisOutput({
      argumentsFor: "Les défenseurs ont présenté un argument raisonnable.",
      argumentsAgainst: "Opposition courageuse face au texte.",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("neutrality");
  });

  it("rejects output exceeding 4000 chars per argument", () => {
    const result = validateAnalysisOutput({
      argumentsFor: "A".repeat(4001),
      argumentsAgainst: "Short.",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("conciseness");
  });
});
