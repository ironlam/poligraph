import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MistralResponse } from "@/lib/api/mistral";

vi.mock("@/lib/api/mistral", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: vi.fn() };
});

import { callMistral } from "@/lib/api/mistral";
import {
  extractSegment,
  getNormalizationGroundingFailure,
  normalizedTextAddsInformation,
  sourceTextIsGrounded,
} from "../extractor";
import { RUFFIN_GOLD_SET } from "./fixtures/ruffin-gold-set";

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
    const proposals = await extractSegment(
      {
        id: "p-4",
        heading: "Fiscalité",
        page: 4,
        text: "Réduire la TVA sur l'électricité à 5,5 %.",
      },
      {
        documentContext: {
          documentType: "CANDIDATE_PROPOSALS_2027",
          documentLabel: "Cahier fiscalité",
        },
      }
    );
    expect(proposals[0]).toMatchObject({ classification: "MEASURE", page: 4 });
    expect(callMistral).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        model: "mistral-large-latest",
        responseFormat: { type: "json_object" },
      })
    );
    const messages = vi.mocked(callMistral).mock.calls[0]![0];
    expect(messages[0]!.content).toContain("<document-label>Cahier fiscalité</document-label>");
    expect(messages[0]!.content).toContain("<heading>Fiscalité</heading>");
    expect(messages[0]!.content).toContain("<page>4</page>");
    expect(messages[0]!.content).toContain(
      "<document-source>Réduire la TVA sur l'électricité à 5,5 %.</document-source>"
    );
  });

  it("n'autorise pas le heading à fournir une citation absente du segment", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Porter le SMIC à 1 600 euros net.",
            normalizedText: "Porter le SMIC à 1 600 euros net.",
            classification: "MEASURE",
            theme: "EMPLOI_TRAVAIL",
            confidence: 0.95,
            rationale: "Action chiffrée dans le titre.",
          },
        ],
      })
    );
    const [proposal] = await extractSegment({
      id: "heading-only",
      heading: "Porter le SMIC à 1 600 euros net",
      page: 8,
      text: "Nous voulons améliorer le pouvoir d'achat.",
    });
    expect(proposal).toMatchObject({
      modelClassification: "MEASURE",
      classification: "AMBIGUOUS",
      normalizedText: null,
      extractionGuard: "UNGROUNDED_SOURCE_TEXT",
      rationale: "Citation introuvable dans le segment documentaire source.",
    });
  });

  it("n'autorise pas le contexte à enrichir une normalisation grounded", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Nous augmenterons le SMIC.",
            normalizedText: "Porter le SMIC à 1 600 euros net.",
            classification: "MEASURE",
            theme: "EMPLOI_TRAVAIL",
            confidence: 0.95,
            rationale: "Le titre précise le seuil.",
          },
        ],
      })
    );
    const [proposal] = await extractSegment({
      id: "heading-detail",
      heading: "Un SMIC à 1 600 euros net",
      page: 8,
      text: "Nous augmenterons le SMIC.",
    });
    expect(proposal).toMatchObject({
      modelClassification: "MEASURE",
      classification: "MEASURE",
      normalizedText: "Nous augmenterons le SMIC.",
      extractionGuard: null,
      normalizationFallback: "NUMBER_ADDED",
      rationale: "Normalisation remplacée par la citation source: NUMBER_ADDED.",
    });
  });

  it("remplace une normalisation qui ajoute une donnée par la citation grounded", async () => {
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
    expect(proposal).toMatchObject({
      modelClassification: "MEASURE",
      classification: "MEASURE",
      normalizedText: "Réduire la TVA.",
      extractionGuard: null,
      normalizationFallback: "NUMBER_ADDED",
      exactSourceFallback: true,
    });
  });

  it("utilise la citation exacte grounded quand une action n'a pas de normalisation", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Nous indexerons les salaires sur l’inflation.",
            normalizedText: null,
            classification: "OBJECTIVE",
            theme: "EMPLOI_TRAVAIL",
            confidence: 0.9,
            rationale: "Cible explicite.",
          },
        ],
      })
    );
    const [proposal] = await extractSegment({
      id: "exact-source-fallback",
      heading: null,
      page: 15,
      text: "Nous indexerons les salaires sur l’inflation.",
    });

    expect(proposal).toMatchObject({
      classification: "OBJECTIVE",
      normalizedText: "Nous indexerons les salaires sur l’inflation.",
      exactSourceFallback: true,
      rationale: "Normalisation exacte remplacée par la citation source grounded.",
    });
  });

  it("préserve les propositions valides autour d'un thème hors nomenclature", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Réduire la TVA.",
            normalizedText: "Réduire la TVA.",
            classification: "MEASURE",
            theme: "ECONOMIE_BUDGET",
            confidence: 0.9,
            rationale: "Action valide.",
          },
          {
            sourceText: "Créer un contrôle public.",
            normalizedText: "Créer un contrôle public.",
            classification: "MEASURE",
            theme: "PROBITE",
            confidence: 0.9,
            rationale: "Thème inventé.",
          },
          {
            sourceText: "Augmenter le SMIC.",
            normalizedText: "Augmenter le SMIC.",
            classification: "MEASURE",
            theme: "EMPLOI_TRAVAIL",
            confidence: 0.9,
            rationale: "Action valide.",
          },
        ],
      })
    );
    const proposals = await extractSegment({
      id: "themes",
      heading: null,
      page: 7,
      text: "Réduire la TVA. Créer un contrôle public. Augmenter le SMIC.",
    });

    expect(proposals).toHaveLength(3);
    expect(proposals[0]).toMatchObject({ classification: "MEASURE", theme: "ECONOMIE_BUDGET" });
    expect(proposals[1]).toMatchObject({
      sourceText: "Créer un contrôle public.",
      normalizedText: null,
      modelClassification: "MEASURE",
      classification: "AMBIGUOUS",
      theme: null,
      rationale: "Thème hors nomenclature, proposition conservée en attente de revue.",
      extractionGuard: "INVALID_THEME",
    });
    expect(proposals[2]).toMatchObject({ classification: "MEASURE", theme: "EMPLOI_TRAVAIL" });
  });

  it("préserve les propositions valides autour d'une confiance manquante", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Réduire la TVA.",
            normalizedText: "Réduire la TVA.",
            classification: "MEASURE",
            theme: "ECONOMIE_BUDGET",
            confidence: 0.9,
            rationale: "Action valide.",
          },
          {
            sourceText: "Créer un contrôle public.",
            normalizedText: "Créer un contrôle public.",
            classification: "MEASURE",
            theme: "INSTITUTIONS",
            rationale: "Confiance omise.",
          },
          {
            sourceText: "Augmenter le SMIC.",
            normalizedText: "Augmenter le SMIC.",
            classification: "MEASURE",
            theme: "EMPLOI_TRAVAIL",
            confidence: 0.9,
            rationale: "Action valide.",
          },
        ],
      })
    );
    const proposals = await extractSegment({
      id: "confidence",
      heading: null,
      page: 7,
      text: "Réduire la TVA. Créer un contrôle public. Augmenter le SMIC.",
    });

    expect(proposals).toHaveLength(3);
    expect(proposals[0]).toMatchObject({ classification: "MEASURE", confidence: 0.9 });
    expect(proposals[1]).toMatchObject({
      sourceText: "Créer un contrôle public.",
      normalizedText: null,
      modelClassification: "MEASURE",
      classification: "AMBIGUOUS",
      theme: null,
      confidence: 0,
      rationale: "Confiance invalide, proposition conservée en attente de revue.",
      extractionGuard: "INVALID_CONFIDENCE",
    });
    expect(proposals[2]).toMatchObject({ classification: "MEASURE", confidence: 0.9 });
  });

  it("préserve les propositions valides autour d'une confiance hors limites", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Réduire la TVA.",
            normalizedText: "Réduire la TVA.",
            classification: "MEASURE",
            theme: "ECONOMIE_BUDGET",
            confidence: 0.9,
            rationale: "Action valide.",
          },
          {
            sourceText: "Créer un contrôle public.",
            normalizedText: "Créer un contrôle public.",
            classification: "MEASURE",
            theme: "INSTITUTIONS",
            confidence: 1.4,
            rationale: "Confiance invalide.",
          },
          {
            sourceText: "Augmenter le SMIC.",
            normalizedText: "Augmenter le SMIC.",
            classification: "MEASURE",
            theme: "EMPLOI_TRAVAIL",
            confidence: 0.9,
            rationale: "Action valide.",
          },
        ],
      })
    );
    const proposals = await extractSegment({
      id: "confidence-range",
      heading: null,
      page: 7,
      text: "Réduire la TVA. Créer un contrôle public. Augmenter le SMIC.",
    });

    expect(proposals).toHaveLength(3);
    expect(proposals[0]).toMatchObject({ classification: "MEASURE", confidence: 0.9 });
    expect(proposals[1]).toMatchObject({
      sourceText: "Créer un contrôle public.",
      classification: "AMBIGUOUS",
      normalizedText: null,
      theme: null,
      confidence: 0,
      extractionGuard: "INVALID_CONFIDENCE",
    });
    expect(proposals[2]).toMatchObject({ classification: "MEASURE", confidence: 0.9 });
  });

  it("préserve les propositions valides autour d'une normalisation mal formée", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Réduire la TVA.",
            normalizedText: "Réduire la TVA.",
            classification: "MEASURE",
            theme: "ECONOMIE_BUDGET",
            confidence: 0.9,
            rationale: "Action valide.",
          },
          {
            sourceText: "Créer un contrôle public.",
            normalizedText: { text: "Créer un contrôle public." },
            classification: "MEASURE",
            theme: "INSTITUTIONS",
            confidence: 0.9,
            rationale: "Normalisation invalide.",
          },
          {
            sourceText: "Augmenter le SMIC.",
            normalizedText: "Augmenter le SMIC.",
            classification: "MEASURE",
            theme: "EMPLOI_TRAVAIL",
            confidence: 0.9,
            rationale: "Action valide.",
          },
        ],
      })
    );
    const proposals = await extractSegment({
      id: "normalized-text",
      heading: null,
      page: 7,
      text: "Réduire la TVA. Créer un contrôle public. Augmenter le SMIC.",
    });

    expect(proposals).toHaveLength(3);
    expect(proposals[0]).toMatchObject({ classification: "MEASURE" });
    expect(proposals[1]).toMatchObject({
      sourceText: "Créer un contrôle public.",
      classification: "AMBIGUOUS",
      normalizedText: null,
      theme: null,
      extractionGuard: "INVALID_NORMALIZED_TEXT",
    });
    expect(proposals[2]).toMatchObject({ classification: "MEASURE" });
  });

  it("tolère une normalisation grammaticale fidèle et ses nombres présents", () => {
    expect(
      normalizedTextAddsInformation(
        "Nous porterons le SMIC à 1 600 euros net.",
        "Porter le SMIC à 1 600 euros nets."
      )
    ).toBe(false);
  });

  it.each([
    {
      source: "Nous augmenterons le SMIC.",
      normalized: "Porter le SMIC à 1 600 euros net.",
      failure: "NUMBER_ADDED",
    },
    {
      source: "Nous augmenterons le SMIC.",
      normalized: "Augmenter le SMIC de 10 %.",
      failure: "NUMBER_ADDED",
    },
    {
      source: "Nous renforcerons les contrôles.",
      normalized: "La Haute Autorité renforcera les contrôles.",
      failure: "PROPER_NAME_ADDED",
    },
    {
      source: "Nous renforcerons la transparence.",
      normalized: "Instaurer un registre public des lobbyistes.",
      failure: "PRECISE_CONTENT_ADDED",
    },
    {
      source: "Nous renforcerons les contrôles.",
      normalized: "Renforcer les contrôles à partir du 1er janvier 2028.",
      failure: "NUMBER_ADDED",
    },
  ])("rejette une information factuelle absente: $failure", ({ source, normalized, failure }) => {
    expect(getNormalizationGroundingFailure(source, normalized)).toBe(failure);
  });

  it("accepte les normalisations humaines du gold set Ruffin", () => {
    const rejected = RUFFIN_GOLD_SET.filter(
      (entry) =>
        entry.expectedNormalizedText &&
        normalizedTextAddsInformation(entry.sourceText, entry.expectedNormalizedText)
    ).map((entry) => entry.id);
    expect(rejected).toEqual([]);
  });

  it("tolère les différences typographiques pour retrouver une citation", () => {
    expect(
      sourceTextIsGrounded(
        "L’État veut garantir l’accès aux soins — partout.",
        "L'Etat veut garantir l'accès aux soins - partout."
      )
    ).toBe(true);
  });

  it("retrouve une citation interrompue par une colonne PDF", () => {
    expect(
      sourceTextIsGrounded(
        "Nous indexerons les salaires jusqu’en Article 44 salaires minima 1982.",
        "Nous indexerons les salaires jusqu’en 1982."
      )
    ).toBe(true);
  });

  it("redémarre la recherche après une première occurrence trompeuse", () => {
    expect(
      sourceTextIsGrounded(
        "Nous présentons le constat. Nous indexerons les salaires, sur l’inflation.",
        "Nous indexerons les salaires sur l’inflation."
      )
    ).toBe(true);
    expect(
      sourceTextIsGrounded(
        "Nous présentons le constat. Nous indexerons certains revenus sur l’inflation.",
        "Nous indexerons les salaires sur l’inflation."
      )
    ).toBe(false);
  });

  it("retrouve un mot coupé en fin de ligne PDF sans tolérer un nombre inventé", () => {
    const document = "Conditionner les aides pour éviter une pri-\nvatisation des hébergements.";
    expect(
      sourceTextIsGrounded(
        document,
        "Conditionner les aides pour éviter une privatisation des hébergements."
      )
    ).toBe(true);
    expect(
      sourceTextIsGrounded(
        document,
        "Conditionner 50 % des aides pour éviter une privatisation des hébergements."
      )
    ).toBe(false);
  });

  it("déclasse une citation inventée même si sa normalisation est cohérente", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Porter le SMIC à 2 000 euros.",
            normalizedText: "Porter le SMIC à 2 000 euros.",
            classification: "MEASURE",
            theme: "EMPLOI_TRAVAIL",
            confidence: 0.99,
            rationale: "Action chiffrée.",
          },
        ],
      })
    );
    const [proposal] = await extractSegment({
      id: "x",
      heading: null,
      page: 3,
      text: "Le document parle uniquement de démocratie locale.",
    });
    expect(proposal).toMatchObject({
      modelClassification: "MEASURE",
      classification: "AMBIGUOUS",
      normalizedText: null,
      extractionGuard: "UNGROUNDED_SOURCE_TEXT",
      rationale: "Citation introuvable dans le segment documentaire source.",
    });
  });

  it("conserve le marqueur historique voisin quand la citation du modèle est raccourcie", async () => {
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            sourceText: "Proposition de loi portant mesures d’urgence pour les vacances",
            normalizedText: "Proposition de loi portant mesures d’urgence pour les vacances",
            classification: "MEASURE",
            theme: "EDUCATION_CULTURE",
            confidence: 0.9,
            rationale: "Action législative.",
          },
        ],
      })
    );
    const [proposal] = await extractSegment({
      id: "historical-context",
      heading: null,
      page: 33,
      text: "Proposition de loi portant mesures d’urgence pour les vacances présentée par François Ruffin et ses collègues en juillet 2023.",
    });
    expect(proposal).toMatchObject({
      classification: "MEASURE",
      historicalContext: true,
    });
  });

  it("retente une réponse 429 avant de réussir", async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    vi.mocked(callMistral)
      .mockRejectedValueOnce(new Error("Mistral API error 429: rate limit exceeded"))
      .mockResolvedValueOnce(response({ proposals: [] }));
    const promise = extractSegment(
      { id: "x", heading: null, page: 1, text: "Texte politique." },
      { onRetry }
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual([]);
    expect(callMistral).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith({ attempt: 2, maxAttempts: 5, delayMs: 2_000 });
    vi.useRealTimers();
  });
});
