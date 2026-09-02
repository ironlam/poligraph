import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MistralResponse } from "@/lib/api/mistral";

vi.mock("@/lib/api/mistral", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: vi.fn() };
});

import { callMistral } from "@/lib/api/mistral";
import {
  createEvidenceSnapshot,
  deserializeEvidenceSnapshot,
  evaluateEvidenceExtraction as evaluateWithDiscourse,
  extractEvidenceWindow as extractWithDiscourse,
  parseEvidenceExtractionPayload,
  prepareMeasureCandidate,
  renderEvidenceProposalMarkdown,
  serializeEvidenceSnapshot,
  type EvidenceDocumentContext,
  type EvidenceExtraction,
} from "../evidence-v6";
import type { DiscourseAnnotation } from "../discourse";
import type { DocumentUnit, SegmentProvenance } from "../types";

const TRUSTED: SegmentProvenance = {
  status: "TEXT_LAYER_TRUSTED",
  reason: null,
  extractionAllowed: true,
};

const CONTEXT: EvidenceDocumentContext = {
  programEditionId: "ruffin-loisirs-2027",
  documentUrl: "https://nouspresident.fr/document.pdf",
  documentLabel: "Cahier officiel",
  documentType: "CANDIDATE_PROPOSALS_2027",
};

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

function unit(
  id: string,
  order: number,
  text: string,
  options: Partial<Pick<DocumentUnit, "page" | "kind" | "provenance" | "numbers">> = {}
): DocumentUnit {
  return {
    id,
    blockId: id.replace(/-u\d+$/u, ""),
    order,
    blockOrder: order,
    text,
    page: options.page ?? 1,
    kind: options.kind ?? "SENTENCE",
    numbers:
      options.numbers ??
      [...text.matchAll(/\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d+)?/g)].map((match) => ({
        raw: match[0],
        normalized: match[0].replace(/[ \u00a0\u202f]/g, "").replace(",", "."),
        role: "CONTENT" as const,
      })),
    provenance: options.provenance ?? TRUSTED,
  };
}

function annotationsFor(
  units: DocumentUnit[],
  proposal?: EvidenceExtraction
): DiscourseAnnotation[] {
  const anchors = new Set(proposal?.commitmentAnchorIds ?? units.map((item) => item.id));
  return units.map((item) => ({
    unitId: item.id,
    speaker: "DOCUMENT_AUTHOR",
    discourseRole: anchors.has(item.id)
      ? proposal?.attributionBasis === "EXPLICIT_ENDORSEMENT"
        ? "EXPLICIT_ENDORSEMENT"
        : proposal?.classification === "OBJECTIVE"
          ? "OBJECTIVE"
          : "COMMITMENT"
      : "DETAIL",
    confidence: 0.99,
    reason: "Annotation de fixture.",
  }));
}

function evaluate(
  units: DocumentUnit[],
  proposal: EvidenceExtraction,
  context: EvidenceDocumentContext,
  annotations = annotationsFor(units, proposal)
) {
  return evaluateWithDiscourse(units, annotations, proposal, context);
}

function extractWindow(units: DocumentUnit[], context: EvidenceDocumentContext) {
  return extractWithDiscourse(units, annotationsFor(units), context);
}

function extraction(
  evidenceUnitIds: string[],
  normalizedText: string,
  overrides: Partial<EvidenceExtraction> = {}
): EvidenceExtraction {
  const value: EvidenceExtraction = {
    evidenceUnitIds,
    commitmentAnchorIds: evidenceUnitIds.slice(-1),
    supportingIds: evidenceUnitIds.slice(0, -1),
    attributionBasis: "CANDIDATE_COMMITMENT",
    normalizedText,
    classification: "MEASURE",
    theme: "INSTITUTIONS",
    confidence: 0.9,
    rationale: "Preuve explicite.",
    outputGuards: [],
    rawProposalIndex: 0,
    ...overrides,
  };
  if (overrides.attributionBasis === undefined && value.classification === "OBJECTIVE") {
    value.attributionBasis = "CANDIDATE_OBJECTIVE";
  }
  return value;
}

const REGRESSION_EVIDENCE: Record<string, { page: number; sourceText: string }> = {
  "blind-v2-12": {
    page: 11,
    sourceText:
      "On n’est pas des bêtes. On n’est pas des boniches. On veut juste être reconnues pour ce qu’on fait.",
  },
  "blind-v3-1": {
    page: 21,
    sourceText:
      "nous voulons contrôler et menacer de pénalités les entreprises (surtout dans l’industrie) qui renouvellent incessamment les contrats d’intérim de 3x6 mois",
  },
  "blind-v3-12": {
    page: 18,
    sourceText:
      "nous voulons limiter les possibilités de dérogations conventionnelles à la durée minimale du travail",
  },
  "blind-v3-13": {
    page: 21,
    sourceText:
      "créer une obligation légale de faveur, visant à appliquer le régime le plus favorable entre le régime de l’entreprise sous-traitante ou le régime de l’entreprise donneuse d’ordre",
  },
  "blind-v3-20": {
    page: 12,
    sourceText:
      "Elisabeth Borne avait commandé, dès 2020, un rapport visant à reconnaître les travailleurs essentiels, et les conclusions sur les conditions de travail de ces salariés sont limpides. Mais qu’a-t-elle fait de ce rapport ? Renvoyer tout à la négociation et s’en laver les mains !",
  },
  "blind-v3-22": {
    page: 27,
    sourceText:
      "Nous créerons des équipements polyvalents dans les zones qui en sont aujourd’hui dépourvues, en priorisant les territoires sans aucun lieu de réunion culturel, associatif ou festif.",
  },
  "blind-v3-27": {
    page: 38,
    sourceText:
      "Nous voulons que cet espace public réponde à ce besoin, en réunissant en un seul lieu : des contenus d’auto-formation gratuits, un annuaire des associations et écoles d’enseignement artistique à proximité, les lieux disponibles pour pratiquer en autonomie, et des ressources pour se produire ou exposer son travail.",
  },
  "blind-v3-40": {
    page: 13,
    sourceText:
      "L’une des conditions impératives de ce projet est de protéger le temps libéré des travailleuses et des travailleurs",
  },
  "blind-v3-50": {
    page: 42,
    sourceText:
      "Nous lui donnerons un pouvoir d’enquête renforcé sur les activités réellement réalisées par les anciens ministres et élus, qu’ils créent leur propre cabinet ou qu’ils soient recrutés au sein d’entreprises.",
  },
  "blind-v3-56": {
    page: 48,
    sourceText:
      "Nous étendrons le champ des responsables publics concernés au Président de la République, aux membres du Conseil constitutionnel, du Conseil d’État et de la Cour de cassation, aujourd’hui hors du dispositif",
  },
};

function regressionEvidence(id: string) {
  const fixture = REGRESSION_EVIDENCE[id];
  if (!fixture) throw new Error(`Cas de régression inconnu : ${id}`);
  return fixture;
}

function prepare(units: DocumentUnit[], proposal: EvidenceExtraction) {
  return prepareMeasureCandidate(evaluate(units, proposal, CONTEXT), "a".repeat(64), {
    candidacyId: "candidacy-ruffin",
    documentType: CONTEXT.documentType,
    publishedAt: new Date("2026-08-17T00:00:00.000Z"),
  });
}

describe("frontière de préparation éditoriale V6", () => {
  it("prépare READY avec un snapshot V3 valide", () => {
    const source = unit("p1-b01", 0, "Nous créerons une caisse publique de formation.");
    const candidate = prepare(
      [source],
      extraction([source.id], "Créer une caisse publique de formation.", {
        theme: "EMPLOI_TRAVAIL",
      })
    );

    expect(candidate).toMatchObject({
      reviewReadiness: "READY_FOR_REVIEW",
      warnings: [],
      blockers: [],
      evidenceSnapshot: { schemaVersion: "evidence-snapshot/v3" },
    });
    expect(candidate.importFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("prépare un programme de parti actuel avec une attribution explicite", () => {
    const source = unit("p1-b01-party", 0, "Nous créerons une caisse publique de formation.");
    const evaluated = evaluate(
      [source],
      extraction([source.id], "Créer une caisse publique de formation.", {
        theme: "EMPLOI_TRAVAIL",
      }),
      { ...CONTEXT, documentType: "PARTY_PLATFORM_CURRENT" }
    );

    const candidate = prepareMeasureCandidate(evaluated, "a".repeat(64), {
      candidacyId: "candidacy-party",
      documentType: "PARTY_PLATFORM_CURRENT",
      publishedAt: new Date("2025-09-07T00:00:00.000Z"),
      attribution: "PARTY_PROGRAM",
    });

    expect(candidate).toMatchObject({
      reviewReadiness: "READY_FOR_REVIEW",
      blockers: [],
      draftContext: { attribution: "PARTY_PROGRAM" },
      source: { sourceKind: "PROGRAMME_PARTI", tier: "PRIMARY" },
    });
  });

  it("prépare WARNING quand l'attribution ressemble à un diagnostic", () => {
    const source = unit("p2-b01", 0, "Nous devons réduire les inégalités territoriales.");
    const candidate = prepare(
      [source],
      extraction([source.id], "Réduire les inégalités territoriales.", {
        attributionBasis: "DIAGNOSIS",
      })
    );

    expect(candidate).toMatchObject({
      reviewReadiness: "REVIEW_WITH_WARNING",
      warnings: ["POSSIBLE_DIAGNOSIS_AS_ACTION"],
      blockers: [],
    });
  });

  it("laisse un diagnostic discursif attribuable arriver en revue avec warning", () => {
    const source = unit("p2-b02", 0, "Nous devons réduire les inégalités territoriales.");
    const proposal = extraction([source.id], "Réduire les inégalités territoriales.");
    const evaluated = evaluate([source], proposal, CONTEXT, [
      {
        unitId: source.id,
        speaker: "DOCUMENT_AUTHOR",
        discourseRole: "DIAGNOSIS",
        confidence: 0.8,
        reason: "Le passage ressemble à un diagnostic.",
      },
    ]);
    const candidate = prepareMeasureCandidate(evaluated, "a".repeat(64), {
      candidacyId: "candidacy-ruffin",
      documentType: CONTEXT.documentType,
      publishedAt: new Date("2026-08-17T00:00:00.000Z"),
    });

    expect(evaluated.evidenceGuard).toBe("INVALID_COMMITMENT_ANCHOR_ROLE");
    expect(candidate).toMatchObject({
      reviewReadiness: "REVIEW_WITH_WARNING",
      warnings: ["POSSIBLE_DIAGNOSIS_AS_ACTION"],
      blockers: [],
    });
  });

  it("bloque techniquement une preuve absente ou de provenance corrompue", () => {
    const source = unit("p3-b01", 0, "Créer un fonds public.", {
      provenance: {
        status: "TEXT_LAYER_CORRUPTED",
        reason: "OVERLAPPING_TEXT_LAYERS",
        extractionAllowed: false,
      },
    });
    const candidate = prepare([source], extraction([source.id], "Créer un fonds public."));

    expect(candidate.reviewReadiness).toBe("TECHNICALLY_BLOCKED");
    expect(candidate.blockers).toEqual(
      expect.arrayContaining(["MISSING_EVIDENCE", "INVALID_EVIDENCE_BUNDLE"])
    );
  });

  it("bloque une attribution à un tiers même avec un bundle réel", () => {
    const source = unit("p4-b01", 0, "Une association propose de créer un fonds public.");
    const candidate = prepare(
      [source],
      extraction([source.id], "Créer un fonds public.", { attributionBasis: "THIRD_PARTY" })
    );

    expect(candidate).toMatchObject({
      reviewReadiness: "TECHNICALLY_BLOCKED",
      blockers: expect.arrayContaining(["UNDEFENDABLE_ATTRIBUTION"]),
    });
  });
});

describe("vertical slice V6 fondé sur les blocs de preuve", () => {
  beforeEach(() => vi.mocked(callMistral).mockReset());

  it("1. accepte une mesure autonome et ne laisse pas le modèle fournir sourceText", async () => {
    const fixture = regressionEvidence("blind-v3-22");
    const blocks = [unit("p27-b01", 0, fixture.sourceText, { page: fixture.page })];
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            evidenceUnitIds: ["p27-b01"],
            commitmentAnchorIds: ["p27-b01"],
            supportingIds: [],
            attributionBasis: "CANDIDATE_COMMITMENT",
            sourceText: "Texte forgé par le modèle.",
            normalizedText:
              "Créer des équipements polyvalents dans les zones qui en sont dépourvues.",
            classification: "MEASURE",
            theme: "EDUCATION_CULTURE",
            confidence: 0.94,
            rationale: "Action explicite.",
          },
        ],
      })
    );

    const [modelOutput] = await extractWindow(blocks, CONTEXT);
    expect(modelOutput).not.toHaveProperty("sourceText");
    const prompt = vi.mocked(callMistral).mock.calls[0]![0][0]!.content;
    expect(prompt).toContain('id="p27-b01"');
    expect(prompt).toContain(fixture.sourceText);

    const result = evaluate(blocks, modelOutput!, CONTEXT);
    expect(result).toMatchObject({ accepted: true, evidenceGuard: null, policyGuard: null });
    expect(result.evidence?.exactText).toBe(fixture.sourceText);
  });

  it("2. résout un référent grâce au bloc précédent inclus", () => {
    const dependent = regressionEvidence("blind-v3-50");
    const blocks = [
      unit(
        "p41-b03",
        0,
        "L’ensemble de ces organes sera fusionné pour former la Haute Autorité à la Probité.",
        { page: 41 }
      ),
      unit("p42-b01", 1, dependent.sourceText, { page: 42 }),
    ];
    const result = evaluate(
      blocks,
      extraction(
        ["p41-b03", "p42-b01"],
        "Donner à la Haute Autorité à la Probité un pouvoir d’enquête renforcé sur les activités des anciens ministres et élus."
      ),
      CONTEXT
    );

    expect(result).toMatchObject({ accepted: true, evidenceGuard: null, policyGuard: null });
    expect(result.evidence?.units.map((item) => item.id)).toEqual(["p41-b03", "p42-b01"]);
  });

  it("3. accepte un objectif établi par plusieurs blocs", () => {
    const objective = regressionEvidence("blind-v3-40");
    const blocks = [
      unit("p12-b01", 0, "NOTRE PROJET : UNE VIE LARGE, HORS DU RÈGNE DE LA MARCHANDISE.", {
        page: 12,
        kind: "HEADING",
      }),
      unit("p13-b01", 1, objective.sourceText, { page: 13 }),
      unit(
        "p13-b02",
        2,
        "et d’assurer une stabilité du temps de travail, pour que chacune et chacun puisse organiser sa vie.",
        { page: 13 }
      ),
    ];
    const result = evaluate(
      blocks,
      extraction(
        ["p12-b01", "p13-b01", "p13-b02"],
        "Protéger le temps libéré des travailleuses et des travailleurs et assurer une stabilité du temps de travail.",
        { classification: "OBJECTIVE", theme: "EMPLOI_TRAVAIL" }
      ),
      CONTEXT
    );

    expect(result).toMatchObject({ accepted: true, policyGuard: null });
  });

  it("4. conserve une mesure voisine d’un diagnostic sans transformer le diagnostic", () => {
    const measure = regressionEvidence("blind-v3-1");
    const blocks = [
      unit(
        "p21-b01",
        0,
        "De plus en plus souvent, l’intérim est utilisé par les entreprises pour des activités permanentes.",
        { page: 21 }
      ),
      unit("p21-b02", 1, measure.sourceText, { page: 21 }),
    ];
    const result = evaluate(
      blocks,
      extraction(
        ["p21-b01", "p21-b02"],
        "Contrôler et menacer de pénalités les entreprises qui renouvellent les contrats d’intérim de 3x6 mois.",
        { theme: "EMPLOI_TRAVAIL" }
      ),
      CONTEXT
    );

    expect(result.accepted).toBe(true);
    expect(result.evidence?.exactText).toContain(measure.sourceText);
  });

  it("5. rejette toujours le témoignage d’un tiers", () => {
    const thirdParty = regressionEvidence("blind-v2-12");
    const blocks = [
      unit(
        "p11-b01",
        0,
        `Témoignage de travailleuse\nNATHALIE\nAuxiliaire de vie sociale\n${thirdParty.sourceText}`,
        { page: thirdParty.page }
      ),
    ];
    const result = evaluate(
      blocks,
      extraction(["p11-b01"], thirdParty.sourceText, {
        theme: "EMPLOI_TRAVAIL",
        attributionBasis: "THIRD_PARTY",
      }),
      CONTEXT
    );

    expect(result).toMatchObject({
      accepted: false,
      policyGuard: "ACTION_NOT_SUPPORTED_BY_COMMITMENT",
    });
  });

  it("6. rejette toujours une référence historique", () => {
    const historical = regressionEvidence("blind-v3-20");
    const blocks = [unit("p12-b01", 0, historical.sourceText, { page: historical.page })];
    const result = evaluate(
      blocks,
      extraction(["p12-b01"], historical.sourceText, {
        theme: "EMPLOI_TRAVAIL",
        attributionBasis: "HISTORICAL",
      }),
      CONTEXT
    );

    expect(result).toMatchObject({
      accepted: false,
      policyGuard: "ACTION_NOT_SUPPORTED_BY_COMMITMENT",
    });
  });

  it("7. rend inutilisable une page de provenance corrompue", () => {
    const corrupted = unit("p15-b01", 0, "Créer un fonds public pour la transparence.", {
      page: 15,
      provenance: {
        status: "TEXT_LAYER_CORRUPTED",
        reason: "OVERLAPPING_TEXT_LAYERS",
        extractionAllowed: false,
      },
    });
    const result = evaluate([corrupted], extraction(["p15-b01"], corrupted.text), CONTEXT);

    expect(result).toMatchObject({ accepted: false, evidenceGuard: "BLOCKED_PROVENANCE" });
    expect(result.evidence).toBeNull();
  });

  it("8. accepte un titre documentaire avec ses détails sourcés", () => {
    const blocks = [
      unit("p41-b01", 0, "CRÉER LA HAUTE AUTORITÉ À LA PROBITÉ.", {
        page: 41,
        kind: "HEADING",
      }),
      unit(
        "p41-b02",
        1,
        "L’ensemble des organes existants de l’éthique de la vie publique sera fusionné pour former cette autorité.",
        { page: 41 }
      ),
    ];
    const result = evaluate(
      blocks,
      extraction(
        ["p41-b01", "p41-b02"],
        "Créer la Haute Autorité à la Probité en fusionnant les organes existants de l’éthique de la vie publique."
      ),
      CONTEXT
    );

    expect(result).toMatchObject({ accepted: true, policyGuard: null });
    expect(result.evidence?.relation).toBe("HEADING_SCOPE");

    const genericHeading = unit("p40-b01", 0, "POUR UNE RÉPUBLIQUE TRANSPARENTE.", {
      page: 40,
      kind: "HEADING",
    });
    const headingOnly = evaluate(
      [genericHeading],
      extraction(["p40-b01"], "Pour une République transparente."),
      CONTEXT
    );
    expect(headingOnly).toMatchObject({
      accepted: false,
      policyGuard: "TITLE_OR_NOMINAL_LABEL",
    });
  });

  it("9. vérifie les nombres contre tout le bundle et bloque un nombre absent", () => {
    const blocks = [
      unit("p8-b01", 0, "Nous créerons un dispositif avec une durée minimale.", { page: 8 }),
      unit("p8-b02", 1, "Cette durée sera de 24 mois.", { page: 8 }),
    ];
    const supported = evaluate(
      blocks,
      extraction(["p8-b01", "p8-b02"], "Créer un dispositif avec une durée minimale de 24 mois."),
      CONTEXT
    );
    const invented = evaluate(
      blocks,
      extraction(["p8-b01", "p8-b02"], "Créer un dispositif avec une durée minimale de 36 mois."),
      CONTEXT
    );
    const inventedDevice = evaluate(
      blocks,
      extraction(
        ["p8-b01", "p8-b02"],
        "Créer un registre public avec une durée minimale de 24 mois."
      ),
      CONTEXT
    );

    expect(supported.accepted).toBe(true);
    expect(invented).toMatchObject({ accepted: false, formulationGuard: "NUMBER_ADDED" });
    expect(inventedDevice).toMatchObject({
      accepted: false,
      formulationGuard: "SENSITIVE_TERM_ADDED",
    });
  });

  it("ne laisse pas Proposition 2 soutenir une durée de deux heures", () => {
    const heading = unit("p17-b07-u001", 0, "Proposition 2\nRÉDUIRE LES COUPURES.", {
      kind: "HEADING",
      numbers: [{ raw: "2", normalized: "2", role: "STRUCTURAL" }],
    });
    const proposal = extraction([heading.id], "Rémunérer les coupures de plus de 2 heures.", {
      theme: "EMPLOI_TRAVAIL",
    });

    expect(evaluate([heading], proposal, CONTEXT)).toMatchObject({
      accepted: false,
      formulationGuard: "NUMBER_ADDED",
    });
  });

  it("10. rejette un ID inventé sans reconstruire de preuve", () => {
    const blocks = [unit("p1-b01", 0, "Créer une commission indépendante.")];
    const result = evaluate(
      blocks,
      extraction(["p1-b99"], "Créer une commission indépendante."),
      CONTEXT
    );

    expect(result).toMatchObject({ accepted: false, evidenceGuard: "UNKNOWN_BLOCK_ID" });
    expect(result.evidence).toBeNull();
    expect(renderEvidenceProposalMarkdown(result)).toContain(
      "Preuve invalide, aucun texte reconstruit."
    );
  });

  it("rapporte les cardinalités hors contrat sans perdre les propositions voisines", async () => {
    const blocks = Array.from({ length: 9 }, (_, index) =>
      unit(`p1-b0${index + 1}`, index, `Créer le dispositif public numéro ${index + 1}.`)
    );
    vi.mocked(callMistral).mockResolvedValue(
      response({
        proposals: [
          {
            evidenceUnitIds: [blocks[0]!.id],
            commitmentAnchorIds: [blocks[0]!.id],
            supportingIds: [],
            attributionBasis: "CANDIDATE_COMMITMENT",
            normalizedText: "Créer le premier dispositif public.",
            classification: "MEASURE",
            theme: "INSTITUTIONS",
            confidence: 0.9,
            rationale: "Proposition valide avant les rejets.",
          },
          {
            evidenceUnitIds: [],
            commitmentAnchorIds: [],
            supportingIds: [],
            attributionBasis: "CANDIDATE_COMMITMENT",
            normalizedText: "Créer un dispositif public.",
            classification: "MEASURE",
            theme: "INSTITUTIONS",
            confidence: 0.8,
            rationale: "Aucune preuve sélectionnée.",
          },
          {
            evidenceUnitIds: blocks.map((item) => item.id),
            commitmentAnchorIds: [blocks.at(-1)!.id],
            supportingIds: blocks.slice(0, -1).map((item) => item.id),
            attributionBasis: "CANDIDATE_COMMITMENT",
            normalizedText: "Créer neuf dispositifs publics.",
            classification: "MEASURE",
            theme: "INSTITUTIONS",
            confidence: 0.8,
            rationale: "Trop de blocs sélectionnés.",
          },
          {
            evidenceUnitIds: [blocks[1]!.id],
            commitmentAnchorIds: [blocks[1]!.id],
            supportingIds: [],
            attributionBasis: "CANDIDATE_COMMITMENT",
            normalizedText: "Créer le deuxième dispositif public.",
            classification: "MEASURE",
            theme: "INSTITUTIONS",
            confidence: 0.9,
            rationale: "Proposition valide après les rejets.",
          },
        ],
      })
    );

    const extracted = await extractWindow(blocks, CONTEXT);
    expect(extracted).toHaveLength(4);
    expect(evaluate(blocks, extracted[0]!, CONTEXT).accepted).toBe(true);
    expect(evaluate(blocks, extracted[1]!, CONTEXT)).toMatchObject({
      accepted: false,
      evidenceGuard: "EMPTY_EVIDENCE",
    });
    expect(evaluate(blocks, extracted[2]!, CONTEXT)).toMatchObject({
      accepted: false,
      evidenceGuard: "TOO_MANY_BLOCKS",
    });
    expect(evaluate(blocks, extracted[3]!, CONTEXT).accepted).toBe(true);
  });

  it.each([
    ["IDs de preuve", { evidenceUnitIds: ["id mal formé"] }, "INVALID_EVIDENCE_BLOCK_IDS"],
    ["IDs d'anchor", { commitmentAnchorIds: "p1-b01" }, "INVALID_COMMITMENT_ANCHOR_IDS"],
    ["IDs de contexte", { supportingIds: "p1-b02" }, "INVALID_SUPPORTING_BLOCK_IDS"],
    ["classification", { classification: "ACTION" }, "INVALID_CLASSIFICATION"],
    ["thème", { theme: "THEME_INCONNU" }, "INVALID_THEME"],
    ["confiance absente", { confidence: undefined }, "INVALID_CONFIDENCE"],
    ["confiance hors limites", { confidence: 1.2 }, "INVALID_CONFIDENCE"],
    ["formulation", { normalizedText: 42 }, "INVALID_NORMALIZED_TEXT"],
  ])("isole une entrée avec %s dans une séquence valid/invalid/valid", (_, mutation, guard) => {
    const valid = {
      evidenceUnitIds: ["p1-b01"],
      commitmentAnchorIds: ["p1-b01"],
      supportingIds: [],
      attributionBasis: "CANDIDATE_COMMITMENT",
      normalizedText: "Créer un fonds public.",
      classification: "MEASURE",
      theme: "INSTITUTIONS",
      confidence: 0.9,
      rationale: "Action explicite.",
    };
    const parsed = parseEvidenceExtractionPayload({
      proposals: [
        valid,
        { ...valid, ...mutation },
        { ...valid, normalizedText: "Créer un fonds." },
      ],
    });

    expect(parsed).toHaveLength(3);
    expect(parsed[0]!.outputGuards).toEqual([]);
    expect(parsed[1]!.outputGuards).toContain(guard);
    expect(parsed[2]!.outputGuards).toEqual([]);
  });

  it("exige un anchor pour une action issue d'un diagnostic, d'une politique existante ou d'une citation juridique", () => {
    const cases = [
      ["DIAGNOSIS", "Les hauts fonctionnaires passent régulièrement du public au privé."],
      ["EXISTING_POLICY", "La ville X applique déjà un tarif social pour les loisirs."],
      ["HISTORICAL", "Le préambule de 1946 garantit l'accès aux loisirs et à la culture."],
    ] as const;
    for (const [attributionBasis, text] of cases) {
      const blocks = [unit("p1-b01", 0, text)];
      const result = evaluate(
        blocks,
        extraction(["p1-b01"], `Généraliser l'action décrite dans le document.`, {
          commitmentAnchorIds: [],
          supportingIds: ["p1-b01"],
          attributionBasis,
        }),
        CONTEXT
      );
      expect(result).toMatchObject({
        accepted: false,
        policyGuard: "MISSING_COMMITMENT_ANCHOR",
      });
    }
  });

  it("accepte une reprise explicite avec la politique existante en contexte", () => {
    const blocks = [
      unit("p1-b01", 0, "La ville X applique déjà un tarif social pour les loisirs."),
      unit(
        "p1-b02",
        1,
        "Nous proposons d'étendre explicitement ce tarif social à l'ensemble du pays."
      ),
    ];
    const result = evaluate(
      blocks,
      extraction(
        ["p1-b01", "p1-b02"],
        "Étendre le tarif social pour les loisirs à l'ensemble du pays.",
        {
          commitmentAnchorIds: ["p1-b02"],
          supportingIds: ["p1-b01"],
          attributionBasis: "EXPLICIT_ENDORSEMENT",
        }
      ),
      CONTEXT
    );
    expect(result).toMatchObject({ accepted: true, policyGuard: null });
  });

  it.each([
    ["témoignage", "QUOTED_THIRD_PARTY", "TESTIMONY"],
    ["diagnostic", "DOCUMENT_AUTHOR", "DIAGNOSIS"],
    ["politique existante", "DOCUMENT_AUTHOR", "EXISTING_POLICY"],
    ["citation juridique", "LEGAL_OR_INSTITUTIONAL_SOURCE", "LEGAL_REFERENCE"],
  ] as const)("rejette un anchor fondé uniquement sur un %s", (_, speaker, discourseRole) => {
    const evidenceUnit = unit(
      "p1-b01-u001",
      0,
      "Il faut garantir l'accès de toutes et tous aux loisirs."
    );
    const proposal = extraction(
      [evidenceUnit.id],
      "Garantir l'accès de toutes et tous aux loisirs.",
      { theme: "EDUCATION_CULTURE" }
    );
    const annotations: DiscourseAnnotation[] = [
      {
        unitId: evidenceUnit.id,
        speaker,
        discourseRole,
        confidence: 0.99,
        reason: "Rôle non admissible de fixture.",
      },
    ];

    expect(evaluate([evidenceUnit], proposal, CONTEXT, annotations)).toMatchObject({
      accepted: false,
      evidenceGuard: "INVALID_COMMITMENT_ANCHOR_ROLE",
    });
  });

  it("rejette une partition de preuve dont l'anchor sort du bundle", () => {
    const blocks = [unit("p1-b01", 0, "Nous créerons une autorité indépendante.")];
    const result = evaluate(
      blocks,
      extraction(["p1-b01"], "Créer une autorité indépendante.", {
        commitmentAnchorIds: ["p1-b02"],
        supportingIds: ["p1-b01"],
      }),
      CONTEXT
    );
    expect(result).toMatchObject({
      accepted: false,
      evidenceGuard: "COMMITMENT_ANCHOR_OUTSIDE_EVIDENCE",
    });
  });

  it("rejette les huit transformations injustifiées observées lors du premier shadow run", () => {
    const regressions = [
      {
        evidence:
          "Des hauts fonctionnaires dirigent des entreprises privatisées puis retournent dans le public.",
        formulation:
          "Interdire aux hauts fonctionnaires de diriger ces entreprises après leur passage dans le privé.",
        basis: "DIAGNOSIS" as const,
        expected: "MISSING_COMMITMENT_ANCHOR",
      },
      {
        evidence:
          "Plus de 5 000 nominations sont directement effectuées par le Président de la République.",
        formulation: "Réformer le processus de nomination présidentiel.",
        basis: "DIAGNOSIS" as const,
        expected: "MISSING_COMMITMENT_ANCHOR",
      },
      {
        evidence:
          "Des institutions culturelles pratiquent déjà le faire avec auprès des écoliers et des habitants.",
        formulation: "Intégrer systématiquement le faire avec dans les politiques culturelles.",
        basis: "EXISTING_POLICY" as const,
        expected: "MISSING_COMMITMENT_ANCHOR",
      },
      {
        evidence: "Le préambule de 1946 garantit l'égal accès aux loisirs et à la culture.",
        formulation: "Garantir l'accès aux loisirs et à la culture.",
        basis: "HISTORICAL" as const,
        expected: "MISSING_COMMITMENT_ANCHOR",
      },
      {
        evidence:
          "La fermeture des bibliothèques et des clubs de sport fragilise les liens entre habitants.",
        formulation: "Préserver tous les lieux de loisirs et de culture.",
        basis: "DIAGNOSIS" as const,
        expected: "MISSING_COMMITMENT_ANCHOR",
      },
      {
        evidence:
          "Une politique ambitieuse des loisirs et de la culture constitue aussi une politique de création d'emplois.",
        formulation: "Développer une politique ambitieuse des loisirs et de la culture.",
        basis: "DIAGNOSIS" as const,
        expected: "MISSING_COMMITMENT_ANCHOR",
      },
      {
        evidence:
          "Il est urgent de se doter des moyens pour pratiquer collectivement nos sports et notre art.",
        formulation:
          "Doter la collectivité de moyens financiers pour pratiquer les sports et les arts.",
        basis: "CANDIDATE_OBJECTIVE" as const,
        anchor: true,
        expected: "SENSITIVE_TERM_ADDED",
      },
      {
        evidence: "Selon ce témoignage, il faut mettre fin à l'intérim dans les entreprises.",
        formulation: "Mettre fin à l'intérim dans les entreprises.",
        basis: "THIRD_PARTY" as const,
        expected: "MISSING_COMMITMENT_ANCHOR",
      },
    ];

    expect(regressions).toHaveLength(8);
    for (const [index, regression] of regressions.entries()) {
      const id = `p1-b${String(index + 1).padStart(2, "0")}`;
      const result = evaluate(
        [unit(id, 0, regression.evidence)],
        extraction([id], regression.formulation, {
          classification: regression.basis === "CANDIDATE_OBJECTIVE" ? "OBJECTIVE" : "MEASURE",
          commitmentAnchorIds: regression.anchor ? [id] : [],
          supportingIds: regression.anchor ? [] : [id],
          attributionBasis: regression.basis,
        }),
        CONTEXT
      );
      expect(result.accepted).toBe(false);
      expect(result.policyGuard ?? result.formulationGuard).toBe(regression.expected);
    }
  });

  it("conserve représentables les sept récupérations légitimes des régressions consommées", () => {
    const cases = [
      {
        id: "blind-v3-27",
        context: "Nous créerons un espace public numérique consacré aux pratiques culturelles.",
      },
      {
        id: "blind-v3-50",
        context: "Nous créerons une Haute Autorité à la Probité.",
      },
      {
        id: "blind-v3-56",
        context: "Nous renforcerons le contrôle de la Haute Autorité sur les responsables publics.",
      },
      { id: "blind-v3-1" },
      { id: "blind-v3-12" },
      { id: "blind-v3-13" },
      { id: "blind-v3-22" },
    ];
    expect(cases).toHaveLength(7);

    for (const item of cases) {
      const fixture = regressionEvidence(item.id);
      const blocks = item.context
        ? [unit("p1-b01", 0, item.context), unit("p1-b02", 1, fixture.sourceText)]
        : [unit("p1-b01", 0, fixture.sourceText)];
      const ids = blocks.map((item) => item.id);
      const result = evaluate(
        blocks,
        extraction(ids, fixture.sourceText, {
          commitmentAnchorIds: [ids.at(-1)!],
          supportingIds: ids.slice(0, -1),
          attributionBasis: "CANDIDATE_COMMITMENT",
          theme: "EMPLOI_TRAVAIL",
        }),
        CONTEXT
      );
      expect(result.accepted, item.id).toBe(true);
    }
  });

  it("sérialise et désérialise un EvidenceSnapshot v3 avec discours et versions séparées", () => {
    const blocks = [
      unit("p1-b01", 0, "Nous créerons un fonds public.", {
        provenance: TRUSTED,
      }),
    ];
    const proposal = extraction(["p1-b01"], "Créer un fonds public.");
    const evaluated = evaluate(blocks, proposal, CONTEXT);
    const snapshot = createEvidenceSnapshot(evaluated.evidence!, "a".repeat(64), proposal);
    const restored = deserializeEvidenceSnapshot(serializeEvidenceSnapshot(snapshot));

    expect(restored).toEqual(snapshot);
    expect(restored).toMatchObject({
      schemaVersion: "evidence-snapshot/v3",
      commitmentAnchorIds: ["p1-b01"],
      supportingIds: [],
      attributionBasis: "CANDIDATE_COMMITMENT",
      discourseExtractorVersion: "mistral-large-latest/presidential-program-discourse-1-units-v2",
      measureExtractorVersion:
        "mistral-large-latest/presidential-program-import-7-discourse-grounded-v1",
      units: [
        {
          role: "COMMITMENT_ANCHOR",
          rawExactText: "Nous créerons un fonds public.",
          canonicalText: "Nous créerons un fonds public.",
          speaker: "DOCUMENT_AUTHOR",
          discourseRole: "COMMITMENT",
        },
      ],
    });
    expect(() =>
      deserializeEvidenceSnapshot(
        JSON.stringify({ ...snapshot, canonicalEvidenceHash: "0".repeat(64) })
      )
    ).toThrow("Empreinte de la preuve agrégée invalide");
  });

  it("rend un rapport qui relie formulation, édition, pages et texte exact", () => {
    const blocks = [unit("p41-b03", 0, "Créer une Haute Autorité à la Probité.", { page: 41 })];
    const result = evaluate(
      blocks,
      extraction(["p41-b03"], "Créer une Haute Autorité à la Probité."),
      CONTEXT
    );
    const report = renderEvidenceProposalMarkdown(result);

    expect(report).toContain("Formulation:");
    expect(report).toContain("p. 41 / unit p41-b03");
    expect(report).toContain("édition ruffin-loisirs-2027");
    expect(report).toContain("eligible for human review");
  });
});
