import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MistralResponse } from "@/lib/api/mistral";

vi.mock("@/lib/api/mistral", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: vi.fn() };
});

import { callMistral } from "@/lib/api/mistral";
import { extractSegment } from "../extractor";

function response(value: unknown): MistralResponse {
  return {
    choices: [
      {
        message: { role: "assistant", content: JSON.stringify(value) },
        finish_reason: "stop",
      },
    ],
  };
}

describe("extracteur Mistral", () => {
  beforeEach(() => vi.mocked(callMistral).mockReset());

  it("valide la sortie structurée et conserve la page", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Réduire la TVA sur l'électricité à 5,5 %.",
            normalizedText: "Réduire la TVA sur l'électricité à 5,5 %.",
            classification: "MEASURE",
            theme: "ECONOMIE_BUDGET",
            confidence: 0.95,
            rationale: "Action chiffrée.",
          },
        ],
      })
    );
    const proposals = await extractSegment({
      id: "p-4",
      heading: "Fiscalité",
      page: 4,
      text: "Réduire la TVA sur l'électricité à 5,5 %.",
    });
    expect(proposals[0]).toMatchObject({ classification: "MEASURE", page: 4 });
    expect(callMistral).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        model: "mistral-large-latest",
        responseFormat: { type: "json_object" },
      })
    );
  });

  it("déclasse en ambigu une normalisation qui ajoute une donnée", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Réduire la TVA.",
            normalizedText: "Réduire la TVA à 5,5 %.",
            classification: "MEASURE",
            theme: "ECONOMIE_BUDGET",
            confidence: 0.9,
            rationale: "Action annoncée.",
          },
        ],
      })
    );
    const [proposal] = await extractSegment({
      id: "x",
      heading: null,
      page: null,
      text: "Réduire la TVA.",
    });
    expect(proposal).toMatchObject({ classification: "AMBIGUOUS", normalizedText: null });
  });
});
