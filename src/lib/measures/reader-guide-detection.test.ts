import { beforeEach, describe, expect, it, vi } from "vitest";
import { callMistral } from "@/lib/api/mistral";
import { detectReaderGuideTerms, normalizeReaderGuideTerm } from "./reader-guide-detection";

vi.mock("@/lib/api/mistral", () => ({
  callMistral: vi.fn(),
  extractMistralText: (response: { content: string }) => response.content,
  parseMistralJSON: (value: string) => JSON.parse(value),
}));

describe("détection des repères citoyens", () => {
  beforeEach(() => vi.mocked(callMistral).mockReset());

  it("normalise les accents, sigles et tirets pour la correspondance d'alias", () => {
    expect(normalizeReaderGuideTerm("Zones à faibles émissions (ZFE-m)")).toBe(
      "zones a faibles emissions zfe m"
    );
  });

  it("conserve uniquement une détection structurée dont l'extrait figure dans la mesure", async () => {
    vi.mocked(callMistral).mockResolvedValue({
      content: JSON.stringify({
        detections: [
          {
            term: "zones à faibles émissions",
            canonicalLabel: "Zone à faibles émissions",
            evidenceSpan: "Supprimer les zones à faibles émissions",
            needsExplanation: true,
            reason: "Dispositif réglementaire non expliqué",
            confidence: 1.4,
          },
          {
            term: "péage urbain",
            canonicalLabel: "Péage urbain",
            evidenceSpan: "Extrait absent",
            needsExplanation: true,
            reason: "Terme technique",
            confidence: 0.8,
          },
        ],
      }),
    } as never);

    const result = await detectReaderGuideTerms({
      text: "Supprimer les zones à faibles émissions.",
      details: null,
      knownLabels: ["Zone à faibles émissions (ZFE)"],
    });

    expect(result).toEqual([
      expect.objectContaining({
        term: "zones à faibles émissions",
        evidenceSpan: "Supprimer les zones à faibles émissions",
        confidence: 1,
      }),
    ]);
    const prompt = vi.mocked(callMistral).mock.calls[0]![0][0]!.content;
    expect(prompt).toContain("ne rédige aucune définition");
    expect(prompt).toContain("<mesure>Supprimer les zones à faibles émissions.</mesure>");
  });

  it("accepte un extrait probant présent uniquement dans le contexte documenté", async () => {
    vi.mocked(callMistral).mockResolvedValue({
      content: JSON.stringify({
        detections: [
          {
            term: "kafala judiciaire",
            canonicalLabel: "Kafala judiciaire",
            evidenceSpan: "recours à la kafala judiciaire",
            needsExplanation: true,
            reason: "Mécanisme juridique non expliqué",
            confidence: 0.91,
          },
        ],
      }),
    } as never);

    const result = await detectReaderGuideTerms({
      text: "Modifier les règles d'adoption.",
      details: "La mesure prévoit un recours à la kafala judiciaire.",
      knownLabels: [],
    });

    expect(result).toEqual([
      expect.objectContaining({
        term: "kafala judiciaire",
        evidenceSpan: "recours à la kafala judiciaire",
      }),
    ]);
  });
});
