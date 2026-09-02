import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { normalizeForDeduplication, jaccardSimilarity } from "../deduplication";
import { normalizedTextAddsInformation } from "../extractor";
import {
  canonicalizeProgramImportReport,
  filterExtractableSegments,
  formatProgramImportProgress,
  PRIMARY_SHARE_UNAVAILABLE_REASON,
  renderMarkdownReport,
  type ProgramImportReport,
} from "../pipeline";
import {
  ACCEPTANCE_POLICY_VERSION,
  classifyEdition,
  evaluateProposalAutonomy,
  finalizeProposalForReview,
  getProposalAcceptanceGuard,
  isAcceptedProposal,
  isHistoricalStatement,
} from "../policy";
import type { ExtractedProposal } from "../types";

function proposal(overrides: Partial<ExtractedProposal>): ExtractedProposal {
  return {
    sourceText: "Réduire la TVA sur l'électricité à 5,5 %.",
    normalizedText: "Réduire la TVA sur l'électricité à 5,5 %.",
    modelClassification: "MEASURE",
    classification: "MEASURE",
    theme: "ECONOMIE_BUDGET",
    confidence: 0.9,
    page: 2,
    rationale: "Action chiffrée et vérifiable.",
    extractionGuard: null,
    normalizationFallback: null,
    exactSourceFallback: false,
    historicalContext: false,
    ...overrides,
  };
}

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
  it("rejette une action historique même si le modèle la classe comme mesure", () => {
    const historical = proposal({
      sourceText: "Macron a supprimé les contrats aidés en 2017.",
      normalizedText: "Supprimer les contrats aidés en 2017.",
    });
    expect(isHistoricalStatement(historical.sourceText)).toBe(true);
    expect(isAcceptedProposal(historical)).toBe(false);
  });
  it("conserve un engagement futur qui se réfère à une décision passée", () => {
    const commitment = proposal({
      sourceText: "Nous rétablirons les contrats aidés supprimés en 2017.",
      normalizedText: "Rétablir les contrats aidés supprimés en 2017.",
    });
    expect(isHistoricalStatement(commitment.sourceText)).toBe(false);
    expect(isAcceptedProposal(commitment)).toBe(true);
  });
  it("rejette une citation raccourcie dont le contexte immédiat est historique", () => {
    const historical = proposal({
      sourceText: "Proposition de loi portant mesures d’urgence pour les vacances",
      normalizedText: "Proposition de loi portant mesures d’urgence pour les vacances",
      historicalContext: true,
    });
    expect(isAcceptedProposal(historical)).toBe(false);
  });
  it.each([
    ["POUR UNE RÉPUBLIQUE TRANSPARENTE", "TITLE_OR_NOMINAL_LABEL"],
    ["Nous défendons le principe du pollueur-payeur.", "SLOGAN_OR_PRINCIPLE"],
    ["Ces entreprises doivent payer au prix fort.", "SLOGAN_OR_PRINCIPLE"],
    ["Le président fixe lui-même sa rémunération.", "DESCRIPTIVE_EXISTING_POLICY"],
    ["Il faudrait mieux prendre en compte les horaires.", "INSUFFICIENT_ATTRIBUTION"],
    ["On demande une heure de plus pour faire le travail.", "INSUFFICIENT_ATTRIBUTION"],
    ["Nous voulons des loisirs pour toutes et tous.", "GENERAL_INTENT_FORMULATION"],
    ["Pas des chartes. Mais des sanctions qui dissuadent.", "RHETORICAL_FORMULATION"],
    [
      "Investir dans les loisirs, ce n’est pas un luxe : c’est agir pour la société.",
      "RHETORICAL_FORMULATION",
    ],
    [
      "Il est urgent de mettre fin à cette trahison de l’intérêt général.",
      "RHETORICAL_FORMULATION",
    ],
    ["Cette règle devra valoir pour tous les secteurs.", "MISSING_REFERENT"],
    ["Ce plan s’accompagnera de soutiens au fonctionnement.", "MISSING_REFERENT"],
    ["les rassurer, les stabiliser, leur donner de la visibilité", "DEPENDENT_FRAGMENT"],
    ["Ceci dans le cadre d’une cogestion publique.", "DEPENDENT_FRAGMENT"],
    ["et en généralisant les conventions pluriannuelles.", "DEPENDENT_FRAGMENT"],
    ["ainsi qu’en créant un fonds dédié.", "DEPENDENT_FRAGMENT"],
    ["Nous en proposons une refonte.", "MISSING_REFERENT"],
    ["Nous y consacrerons une part du budget.", "MISSING_REFERENT"],
    ["Diplôme pour devenir animateur.", "TITLE_OR_NOMINAL_LABEL"],
    ["que chaque citoyen puisse accéder au service.", "DEPENDENT_FRAGMENT"],
    ["Nous abrogerons cette possibilité laissée aux acteurs concernés.", "MISSING_REFERENT"],
    ["Cette autorité disposera de moyens supplémentaires.", "MISSING_REFERENT"],
    ["Nous lui donnerons des pouvoirs de sanction.", "MISSING_REFERENT"],
    ["Ces emplois aidés seront fléchés vers les associations.", "MISSING_REFERENT"],
    ["C’est cette hiérarchie que nous voulons remettre en cause.", "GENERAL_INTENT_FORMULATION"],
    [
      "Il importe qu’un ministre ne puisse pas donner le sentiment d’être influencé.",
      "GENERAL_INTENT_FORMULATION",
    ],
    [
      "Finie pour Entreprise Exemple la possibilité d’agir sans rendre de comptes.",
      "RHETORICAL_FORMULATION",
    ],
    ["Texte cassé provenant d’une autre colonne).", "CORRUPTED_SOURCE_TEXT"],
  ] as const)("rejette une non-action autonome: %s", (sourceText, expectedGuard) => {
    expect(getProposalAcceptanceGuard(proposal({ sourceText, normalizedText: sourceText }))).toBe(
      expectedGuard
    );
  });
  it("conserve une action courte avec un moyen identifiable", () => {
    const explicitAction = proposal({
      sourceText: "Encadrer le recours à l'intérim et aux CDD.",
      normalizedText: "Encadrer le recours à l'intérim et aux CDD.",
    });
    expect(getProposalAcceptanceGuard(explicitAction)).toBeNull();
  });
  it.each([
    "Supprimer la CJIP.",
    "Rénover les maisons du peuple et les salles des fêtes.",
    "Redonner des moyens aux associations.",
    "Mieux payer celles et ceux qui prennent soin.",
    "Création d’une Haute Autorité indépendante.",
    "Cette loi de séparation de l’État et de l’argent sera présentée au Parlement.",
    "Ce plan de formation national créera des places supplémentaires.",
    "Réformer ce dispositif de retraite anticipée.",
    "Cette taxe sur les logements vacants sera supprimée.",
    "Cette Haute Autorité à la probité publiera ses recommandations.",
    "Finie la possibilité pour les ministres de cumuler leurs fonctions exécutives.",
    "Réduire de moitié le nombre de logements vacants.",
    "Mettre fin aux temps partiels subis.",
  ])("conserve une action ou un objectif autonome: %s", (sourceText) => {
    expect(getProposalAcceptanceGuard(proposal({ sourceText, normalizedText: sourceText }))).toBe(
      null
    );
  });
  it("applique la même garde d’autonomie aux mesures et aux objectifs", () => {
    const sourceText = "Cette possibilité doit disparaître.";
    expect(evaluateProposalAutonomy(proposal({ sourceText, normalizedText: sourceText }))).toBe(
      "MISSING_REFERENT"
    );
    expect(
      evaluateProposalAutonomy(
        proposal({ sourceText, normalizedText: sourceText, classification: "OBJECTIVE" })
      )
    ).toBe("MISSING_REFERENT");
  });
  it("rejette toute proposition issue d'une couche PDF non fiable", () => {
    expect(
      getProposalAcceptanceGuard(
        proposal({
          sourceText: "Créer un fonds public.",
          normalizedText: "Créer un fonds public.",
          segmentProvenance: "TEXT_LAYER_CORRUPTED",
          provenanceReason: "OVERLAPPING_TEXT_LAYERS",
        })
      )
    ).toBe("CORRUPTED_SOURCE_TEXT");
  });
  it("rejette une action passée sans année explicite", () => {
    const historical = proposal({
      sourceText: "La réforme n’a fait qu’entamer les privilèges existants.",
      normalizedText: "La réforme n’a fait qu’entamer les privilèges existants.",
    });
    expect(isHistoricalStatement(historical.sourceText)).toBe(true);
    expect(isAcceptedProposal(historical)).toBe(false);
  });
  it("détecte une information ajoutée par la normalisation", () => {
    expect(normalizedTextAddsInformation("Réduire la TVA", "Réduire la TVA à 5,5 %")).toBe(true);
    expect(normalizedTextAddsInformation("Nous voulons réduire la TVA", "Réduire la TVA")).toBe(
      false
    );
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

describe("rapport d'import", () => {
  it("ne transmet jamais au modèle un segment dont la provenance est bloquée", () => {
    const segments = [
      {
        id: "pdf-1-1",
        heading: null,
        page: 1,
        text: "Texte visible.",
        provenance: {
          status: "TEXT_LAYER_TRUSTED" as const,
          reason: null,
          extractionAllowed: true,
        },
      },
      {
        id: "pdf-2-1",
        heading: null,
        page: 2,
        text: "Texte issu de couches superposées.",
        provenance: {
          status: "TEXT_LAYER_CORRUPTED" as const,
          reason: "OVERLAPPING_TEXT_LAYERS" as const,
          extractionAllowed: false,
        },
      },
    ];

    expect(filterExtractableSegments(segments).map((segment) => segment.id)).toEqual(["pdf-1-1"]);
  });

  it("rend chaque proposition traçable jusqu'à son édition et son document", () => {
    const report: ProgramImportReport = {
      generatedAt: "2026-08-15T10:00:00.000Z",
      mode: "dry-run",
      decisionPolicyVersion: ACCEPTANCE_POLICY_VERSION,
      documents: {
        known: 1,
        fetched: 1,
        parsed: 1,
        failed: 0,
        scannedPdf: 0,
        suspectPages: 1,
        blockedSegments: 2,
      },
      propositions: {
        detected: 1,
        measures: 1,
        objectives: 0,
        rejected: 0,
        ambiguous: 0,
        duplicates: 0,
      },
      database: { draftsCreated: 0, alreadyPresent: 0, publishedUnchanged: 0 },
      candidates: [
        {
          candidate: "François Ruffin",
          sources: ["https://example.test/cahier.pdf"],
          sourceTypes: ["CANDIDATE_PROPOSALS_2027"],
          documentsAnalyzed: 1,
          detected: 1,
          draftsExisting: 0,
          draftsAdded: 0,
          published: 0,
          primaryShare: null,
          primaryShareReason: PRIMARY_SHARE_UNAVAILABLE_REASON,
          themes: ["EMPLOI_TRAVAIL"],
          proposals: [
            {
              programEditionId: "edition-1",
              documentUrl: "https://example.test/cahier.pdf",
              documentType: "CANDIDATE_PROPOSALS_2027",
              sourceTier: "PRIMARY",
              segmentId: "pdf-15-2",
              segmentProvenance: "TEXT_LAYER_REORDERED",
              provenanceReason: "STABLE_TWO_COLUMN_GUTTER",
              sourceText: "Nous indexerons les salaires sur l'inflation.",
              normalizedText: "Indexer les salaires sur l'inflation.",
              modelClassification: "MEASURE",
              classification: "MEASURE",
              theme: "EMPLOI_TRAVAIL",
              confidence: 0.95,
              page: 15,
              rationale: "Action explicite.",
              extractionGuard: null,
              normalizationFallback: null,
              exactSourceFallback: false,
              historicalContext: false,
              acceptanceGuard: null,
              accepted: true,
            },
          ],
          errors: [],
          blockers: [],
          provenanceIssues: [],
          status: "READY_FOR_REVIEW",
        },
      ],
    };
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain("https://example.test/cahier.pdf");
    expect(markdown).toContain("édition edition-1");
    expect(markdown).toContain("segment pdf-15-2");
    expect(markdown).toContain("Source: Nous indexerons les salaires");
    expect(markdown).toContain("Garde acceptation: -");
    expect(markdown).toContain("Pages PDF suspectes ou corrompues: 1");
    expect(markdown).toContain("Segments bloqués pour provenance: 2");
    expect(markdown).toContain("Provenance segment: TEXT_LAYER_REORDERED");
    expect(markdown).toContain("Raison provenance: STABLE_TWO_COLUMN_GUTTER");
    expect(markdown).toContain("Citation exacte utilisée: non");
    expect(markdown).toContain("READY_FOR_REVIEW signifie uniquement");
    expect(markdown).toContain("| François Ruffin | 1 | 1 | 1 | 0 | n/a |");
    expect(markdown).toContain("Part primaire");
    expect(markdown).toContain(PRIMARY_SHARE_UNAVAILABLE_REASON);
  });

  it("réconcilie le rapport avec l'unique décision canonique", () => {
    const staleAccepted = {
      ...proposal({
        sourceText: "POUR UNE RÉPUBLIQUE TRANSPARENTE",
        normalizedText: "POUR UNE RÉPUBLIQUE TRANSPARENTE",
      }),
      programEditionId: "edition-1",
      documentUrl: "https://example.test/cahier.pdf",
      documentType: "CANDIDATE_PROPOSALS_2027" as const,
      sourceTier: "PRIMARY" as const,
      segmentId: "pdf-1-1",
      acceptanceGuard: null,
      accepted: true,
    };
    const exactFallback = {
      ...proposal({
        sourceText: "Nous indexerons les salaires sur l'inflation.",
        normalizedText: null,
        classification: "OBJECTIVE",
      }),
      programEditionId: "edition-1",
      documentUrl: "https://example.test/cahier.pdf",
      documentType: "CANDIDATE_PROPOSALS_2027" as const,
      sourceTier: "PRIMARY" as const,
      segmentId: "pdf-2-1",
      acceptanceGuard: "MISSING_NORMALIZED_TEXT" as const,
      accepted: false,
    };
    const report = canonicalizeProgramImportReport({
      generatedAt: "2026-08-15T10:00:00.000Z",
      mode: "dry-run",
      decisionPolicyVersion: "stale",
      documents: { known: 1, fetched: 1, parsed: 1, failed: 0, scannedPdf: 0 },
      propositions: {
        detected: 2,
        measures: 1,
        objectives: 1,
        rejected: 0,
        ambiguous: 0,
        duplicates: 0,
      },
      database: { draftsCreated: 0, alreadyPresent: 0, publishedUnchanged: 0 },
      candidates: [
        {
          candidate: "François Ruffin",
          sources: ["https://example.test/cahier.pdf"],
          sourceTypes: ["CANDIDATE_PROPOSALS_2027"],
          documentsAnalyzed: 1,
          detected: 2,
          draftsExisting: 0,
          draftsAdded: 0,
          published: 0,
          primaryShare: 100,
          themes: [],
          proposals: [staleAccepted, exactFallback],
          errors: [],
          blockers: [],
          status: "READY_FOR_REVIEW",
        },
      ],
    });

    expect(report.decisionPolicyVersion).toBe(ACCEPTANCE_POLICY_VERSION);
    expect(report.candidates[0]!.proposals).toMatchObject([
      { acceptanceGuard: "TITLE_OR_NOMINAL_LABEL", accepted: false },
      {
        normalizedText: "Nous indexerons les salaires sur l'inflation.",
        exactSourceFallback: true,
        acceptanceGuard: null,
        accepted: true,
      },
    ]);
    for (const reported of report.candidates[0]!.proposals) {
      expect(reported.accepted).toBe(finalizeProposalForReview(reported).accepted);
      expect(reported.accepted).toBe(isAcceptedProposal(reported));
    }
    expect(report.candidates[0]!.status).toBe("READY_FOR_REVIEW");
    expect(report.candidates[0]!.primaryShare).toBeNull();
    expect(report.candidates[0]!.primaryShareReason).toBe(PRIMARY_SHARE_UNAVAILABLE_REASON);
  });

  it("ne marque pas READY_FOR_REVIEW quand toutes les propositions sont écartées", () => {
    const rejected = finalizeProposalForReview(
      proposal({ classification: "DIAGNOSIS", normalizedText: null })
    );
    const report = canonicalizeProgramImportReport({
      generatedAt: "2026-08-15T10:00:00.000Z",
      mode: "dry-run",
      decisionPolicyVersion: ACCEPTANCE_POLICY_VERSION,
      documents: { known: 1, fetched: 1, parsed: 1, failed: 0, scannedPdf: 0 },
      propositions: {
        detected: 1,
        measures: 0,
        objectives: 0,
        rejected: 1,
        ambiguous: 0,
        duplicates: 0,
      },
      database: { draftsCreated: 0, alreadyPresent: 0, publishedUnchanged: 0 },
      candidates: [
        {
          candidate: "François Ruffin",
          sources: ["https://example.test/cahier.pdf"],
          sourceTypes: ["CANDIDATE_PROPOSALS_2027"],
          documentsAnalyzed: 1,
          detected: 1,
          draftsExisting: 0,
          draftsAdded: 0,
          published: 0,
          primaryShare: null,
          primaryShareReason: PRIMARY_SHARE_UNAVAILABLE_REASON,
          themes: [],
          proposals: [
            {
              ...rejected,
              programEditionId: "edition-1",
              documentUrl: "https://example.test/cahier.pdf",
              documentType: "CANDIDATE_PROPOSALS_2027",
              sourceTier: "PRIMARY",
              segmentId: "pdf-1-1",
            },
          ],
          errors: [],
          blockers: [],
          status: "READY_FOR_REVIEW",
        },
      ],
    });
    expect(report.candidates[0]!.status).toBe("PARTIAL");
  });

  it("limite les messages de progression des segments", () => {
    expect(
      formatProgramImportProgress({
        type: "segment",
        documentIndex: 1,
        documentTotal: 3,
        segmentIndex: 2,
        segmentTotal: 21,
        segmentId: "pdf-1-2",
      })
    ).toBeNull();
    expect(
      formatProgramImportProgress({
        type: "segment",
        documentIndex: 1,
        documentTotal: 3,
        segmentIndex: 5,
        segmentTotal: 21,
        segmentId: "pdf-2-1",
      })
    ).toBe("  segment 5/21");
    expect(
      formatProgramImportProgress({
        type: "retry",
        documentIndex: 1,
        documentTotal: 3,
        segmentIndex: 5,
        segmentTotal: 21,
        attempt: 2,
        maxAttempts: 5,
        delayMs: 2_000,
      })
    ).toContain("retry 2/5");
  });
});
