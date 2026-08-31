import { describe, expect, it } from "vitest";
import { normalizeReaderGuideTerm, parseReaderGuideDetections } from "./reader-guide-detection";

describe("détection des repères citoyens", () => {
  it("normalise les accents, sigles et tirets pour la correspondance d'alias", () => {
    expect(normalizeReaderGuideTerm("Zones à faibles émissions (ZFE-m)")).toBe(
      "zones a faibles emissions zfe m"
    );
  });

  it("conserve uniquement une détection structurée dont l'extrait figure dans la mesure", () => {
    const result = parseReaderGuideDetections(
      [
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
      "Supprimer les zones à faibles émissions."
    );

    expect(result).toEqual([
      expect.objectContaining({
        term: "zones à faibles émissions",
        evidenceSpan: "Supprimer les zones à faibles émissions",
        confidence: 1,
      }),
    ]);
  });

  it("accepte un extrait probant présent uniquement dans le contexte documenté", () => {
    const result = parseReaderGuideDetections(
      [
        {
          term: "kafala judiciaire",
          canonicalLabel: "Kafala judiciaire",
          evidenceSpan: "recours à la kafala judiciaire",
          needsExplanation: true,
          reason: "Mécanisme juridique non expliqué",
          confidence: 0.91,
        },
      ],
      "Modifier les règles d'adoption. La mesure prévoit un recours à la kafala judiciaire."
    );

    expect(result).toEqual([
      expect.objectContaining({
        term: "kafala judiciaire",
        evidenceSpan: "recours à la kafala judiciaire",
      }),
    ]);
  });

  it("écarte les verbes et formulations génériques rejetés pendant la revue éditoriale", () => {
    const result = parseReaderGuideDetections(
      [
        {
          term: "abroger",
          canonicalLabel: "Abrogation",
          evidenceSpan: "abroger la réforme",
          needsExplanation: true,
          reason: "Terme juridique",
          confidence: 0.9,
        },
        {
          term: "référendum",
          canonicalLabel: "Référendum",
          evidenceSpan: "organiser un référendum",
          needsExplanation: true,
          reason: "Mécanisme institutionnel",
          confidence: 0.9,
        },
      ],
      "Abroger la réforme puis organiser un référendum."
    );

    expect(result.map(({ term }) => term)).toEqual(["référendum"]);
  });
});
