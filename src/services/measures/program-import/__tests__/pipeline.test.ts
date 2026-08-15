import { describe, expect, it } from "vitest";
import { normalizeForDeduplication, jaccardSimilarity } from "../deduplication";
import {
  normalizedTextAddsInformation,
  prepareExtractedProposal,
  sourceTextIsGrounded,
} from "../extractor";
import { classifyEdition, isAcceptedProposal } from "../policy";
import { extractionSchema, type DocumentSegment, type ExtractedProposal } from "../types";

function proposal(overrides: Partial<ExtractedProposal>): ExtractedProposal {
  return {
    sourceText: "Réduire la TVA sur l'électricité à 5,5 %.",
    normalizedText: "Réduire la TVA sur l'électricité à 5,5 %.",
    classification: "MEASURE",
    theme: "ECONOMIE_BUDGET",
    confidence: 0.9,
    page: 2,
    segmentId: "segment-1",
    warnings: [],
    normalization: "MODEL",
    rationale: "Action chiffrée et vérifiable.",
    ...overrides,
  };
}

const segment: DocumentSegment = {
  id: "segment-1",
  heading: "Travail",
  page: 4,
  text: "Nous créerons un statut pour les travailleuses et travailleurs essentiels.",
};

describe("classification éditoriale", () => {
  it("retient une mesure concrète", () => expect(isAcceptedProposal(proposal({}))).toBe(true));
  it("retient un objectif vérifiable", () =>
    expect(isAcceptedProposal(proposal({ classification: "OBJECTIVE" }))).toBe(true));
  it.each(["VALUE", "DIAGNOSIS", "GENERAL_INTENT", "AMBIGUOUS"] as const)(
    "rejette %s",
    (classification) => {
      expect(isAcceptedProposal(proposal({ classification }))).toBe(false);
    }
  );
  it("rejette une classification à faible confiance", () =>
    expect(isAcceptedProposal(proposal({ confidence: 0.5 }))).toBe(false));
  it("détecte une information ajoutée par la normalisation", () => {
    expect(normalizedTextAddsInformation("Réduire la TVA", "Réduire la TVA à 5,5 %")).toBe(true);
    expect(normalizedTextAddsInformation("Nous voulons réduire la TVA", "Réduire la TVA")).toBe(
      false
    );
  });
});

describe("grounding d'extraction", () => {
  it("retrouve une citation malgré les variantes typographiques", () => {
    expect(
      sourceTextIsGrounded(
        "Nous défendrons l’État social — sans recul.",
        "Nous défendrons l'Etat social - sans recul."
      )
    ).toBe(true);
  });

  it("conserve la classification mais retombe sur la citation exacte si la normalisation ajoute des tokens", () => {
    const result = prepareExtractedProposal(segment, {
      sourceText: segment.text,
      normalizedText: "Créer un statut national pour les travailleurs essentiels.",
      classification: "MEASURE",
      theme: "SOCIAL_TRAVAIL",
      confidence: 0.91,
      rationale: "Engagement explicite.",
    });

    expect(result.classification).toBe("MEASURE");
    expect(result.normalizedText).toBe(segment.text);
    expect(result.normalization).toBe("SOURCE_FALLBACK");
    expect(result.warnings.join(" ")).toContain("citation exacte");
    expect(isAcceptedProposal(result)).toBe(true);
  });

  it("neutralise un thème hors enum sans faire échouer la proposition", () => {
    const parsed = extractionSchema.parse({
      proposals: [
        {
          sourceText: segment.text,
          normalizedText: segment.text,
          classification: "MEASURE",
          theme: "EMPLOI",
          confidence: 0.9,
          rationale: "Engagement explicite.",
        },
      ],
    });
    const result = prepareExtractedProposal(segment, parsed.proposals[0]);

    expect(result.theme).toBeNull();
    expect(result.warnings.join(" ")).toContain("Thème hors enum");
    expect(isAcceptedProposal(result)).toBe(false);
  });

  it("conserve AMBIGUOUS lorsque la citation n'est pas retrouvable", () => {
    const result = prepareExtractedProposal(segment, {
      sourceText: "Nous supprimerons intégralement cette taxe.",
      normalizedText: "Supprimer cette taxe.",
      classification: "MEASURE",
      theme: "ECONOMIE_BUDGET",
      confidence: 0.95,
      rationale: "Engagement explicite.",
    });

    expect(result.classification).toBe("AMBIGUOUS");
    expect(result.normalizedText).toBeNull();
    expect(result.normalization).toBe("NONE");
    expect(isAcceptedProposal(result)).toBe(false);
  });
});

describe("attribution documentaire", () => {
  it("autorise un programme officiel établi positivement", () =>
    expect(
      classifyEdition(
        "CANDIDACY",
        "Programme 2027",
        "Voici notre programme officiel pour l'élection présidentielle de 2027."
      )
    ).toBe("CANDIDATE_PROGRAM_2027"));
  it("classe par défaut un projet comme propositions de candidature", () =>
    expect(classifyEdition("CANDIDACY", "Le projet", "Nos priorités pour la France.")).toBe(
      "CANDIDATE_PROPOSALS_2027"
    ));
  it("ne présente pas des priorités provisoires comme le programme officiel", () => {
    expect(
      classifyEdition(
        "CANDIDACY",
        "Le projet",
        "Le programme officiel pour l'élection présidentielle de 2027 arrive très prochainement."
      )
    ).toBe("CANDIDATE_PROPOSALS_2027");
  });
  it("conserve une plateforme de parti hors attribution personnelle", () =>
    expect(classifyEdition("PARTY", "Notre projet actuel")).toBe("PARTY_PLATFORM_CURRENT"));
  it("identifie une plateforme historique", () =>
    expect(classifyEdition("PARTY", "Programme édition 2022")).toBe("PARTY_PLATFORM_HISTORICAL"));
});

describe("idempotence et doublons", () => {
  it("normalise accents, casse et ponctuation", () => {
    expect(normalizeForDeduplication("Électricité : TVA 5,5 % !")).toBe("electricite tva 5 5");
  });
  it("repère une formulation proche sans la fusionner", () => {
    expect(
      jaccardSimilarity(
        "Réduire la TVA sur l'électricité à 5,5 %",
        "Réduire à 5,5 % la TVA sur l'électricité"
      )
    ).toBeGreaterThan(0.9);
  });
});
