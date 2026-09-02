import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  electionFind: vi.fn(),
  candidacyFind: vi.fn(),
  editionFindMany: vi.fn(),
  acquireDocument: vi.fn(),
  parseDocument: vi.fn(),
  analyzeDocumentDiscourse: vi.fn(),
  extractEvidenceWindow: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    election: { findUniqueOrThrow: mocks.electionFind },
    candidacy: { findUnique: mocks.candidacyFind },
    programEdition: { findMany: mocks.editionFindMany },
  },
}));

vi.mock("../acquisition", () => ({ acquireDocument: mocks.acquireDocument }));
vi.mock("../parser", async (importActual) => {
  const actual = await importActual<typeof import("../parser")>();
  return { ...actual, parseDocument: mocks.parseDocument };
});
vi.mock("../discourse", async (importActual) => {
  const actual = await importActual<typeof import("../discourse")>();
  return { ...actual, analyzeDocumentDiscourse: mocks.analyzeDocumentDiscourse };
});
vi.mock("../evidence-v6", async (importActual) => {
  const actual = await importActual<typeof import("../evidence-v6")>();
  return { ...actual, extractEvidenceWindow: mocks.extractEvidenceWindow };
});

import type { DocumentBlock, DocumentUnit, SegmentProvenance } from "../types";
import {
  assertV6ShadowReadOnly,
  buildEvidenceWindows,
  classifyV6Duplicate,
  renderV6ShadowMarkdown,
  runV6ShadowImport,
} from "../shadow-v6";
import type { EvidenceExtraction } from "../evidence-v6";

const TRUSTED: SegmentProvenance = {
  status: "TEXT_LAYER_TRUSTED",
  reason: null,
  extractionAllowed: true,
};

function block(
  id: string,
  order: number,
  text: string,
  options: Partial<DocumentBlock> = {}
): DocumentBlock {
  return {
    id,
    order,
    text,
    page: 1,
    kind: "CONTENT",
    heading: null,
    provenance: TRUSTED,
    ...options,
  };
}

function unit(id: string, order: number, text: string, options: Partial<DocumentUnit> = {}) {
  return {
    id,
    blockId: id.replace(/-u\d+$/u, ""),
    order,
    blockOrder: order,
    text,
    page: 1,
    kind: "SENTENCE" as const,
    numbers: [],
    provenance: TRUSTED,
    ...options,
  } satisfies DocumentUnit;
}

describe("V6 shadow READ-ONLY", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.electionFind.mockResolvedValue({ id: "election-2027" });
    mocks.candidacyFind.mockResolvedValue(null);
    mocks.editionFindMany.mockResolvedValue([
      {
        id: "edition-travail",
        label: "Cahier Travail",
        ownerType: "CANDIDACY",
        documentUrl: "https://example.test/travail.pdf",
        publishedAt: new Date("2026-07-01T00:00:00.000Z"),
        candidacyId: "candidacy-ruffin",
        partyId: null,
        candidacy: { candidateName: "François Ruffin" },
        party: null,
      },
    ]);
    mocks.acquireDocument.mockResolvedValue({
      bytes: Buffer.from("document"),
      contentType: "application/pdf",
      hash: "a".repeat(64),
      fromCache: true,
    });
    const units = [
      unit("pdf-1-1-u001", 0, "CRÉER UNE CAISSE PUBLIQUE.", { kind: "HEADING" }),
      unit("pdf-1-2-u001", 1, "Cette caisse financera la formation des salariés."),
    ];
    mocks.parseDocument.mockResolvedValue({
      mediaType: "pdf",
      blocks: [
        block("pdf-1-1", 0, "CRÉER UNE CAISSE PUBLIQUE.", {
          kind: "HEADING",
          heading: "CRÉER UNE CAISSE PUBLIQUE.",
        }),
        block("pdf-1-2", 1, "Cette caisse financera la formation des salariés.", {
          heading: "CRÉER UNE CAISSE PUBLIQUE.",
        }),
      ],
      units,
      segments: [],
      scannedPdf: false,
      pageDiagnostics: [],
    });
    mocks.analyzeDocumentDiscourse.mockResolvedValue({
      units,
      discourseAnnotations: [
        {
          unitId: "pdf-1-1-u001",
          speaker: "DOCUMENT_AUTHOR",
          discourseRole: "COMMITMENT",
          confidence: 0.99,
          reason: "Titre d'action.",
        },
        {
          unitId: "pdf-1-2-u001",
          speaker: "DOCUMENT_AUTHOR",
          discourseRole: "DETAIL",
          confidence: 0.98,
          reason: "Modalité.",
        },
      ],
      cacheKey: "c".repeat(64),
      fromCache: true,
      modelCalls: 0,
    });
    mocks.extractEvidenceWindow.mockResolvedValue([
      {
        evidenceUnitIds: ["pdf-1-1-u001", "pdf-1-2-u001"],
        commitmentAnchorIds: ["pdf-1-1-u001"],
        supportingIds: ["pdf-1-2-u001"],
        attributionBasis: "CANDIDATE_COMMITMENT",
        normalizedText: "Créer une caisse publique pour financer la formation des salariés.",
        classification: "MEASURE",
        theme: "EMPLOI_TRAVAIL",
        confidence: 0.93,
        rationale: "Le titre et le paragraphe établissent l'action.",
        outputGuards: [],
        rawProposalIndex: 0,
      },
    ]);
  });

  it("refuse immédiatement shadow + apply et engine=v6 + apply", () => {
    expect(() => assertV6ShadowReadOnly(["--shadow-v6", "--apply"])).toThrow(
      "--apply est explicitement interdit"
    );
    expect(() => assertV6ShadowReadOnly(["--engine=v6", "--apply"])).toThrow(
      "--apply est explicitement interdit"
    );
  });

  it("utilise uniquement les blocs fiables du parser dans des fenêtres locales", () => {
    const corrupted = unit("pdf-2-1-u001", 2, "Texte corrompu.", {
      page: 2,
      provenance: {
        status: "TEXT_LAYER_CORRUPTED",
        reason: "OVERLAPPING_TEXT_LAYERS",
        extractionAllowed: false,
      },
    });
    const windows = buildEvidenceWindows([
      unit("pdf-1-1-u001", 0, "Bloc fiable numéro un."),
      unit("pdf-1-2-u001", 1, "Bloc fiable numéro deux."),
      corrupted,
      unit("pdf-3-1-u001", 3, "Bloc fiable après la rupture.", { page: 3 }),
    ]);

    expect(windows.flatMap((window) => window.units.map((item) => item.id))).not.toContain(
      corrupted.id
    );
    expect(
      windows.every((window) => window.units.every((item) => item.provenance.extractionAllowed))
    ).toBe(true);
  });

  it("déduplique les certitudes et marque seulement les chevauchements forts comme possibles", () => {
    const candidate = (
      evidenceUnitIds: string[],
      commitmentAnchorIds: string[],
      normalizedText: string
    ): EvidenceExtraction => ({
      evidenceUnitIds,
      commitmentAnchorIds,
      supportingIds: evidenceUnitIds.filter((id) => !commitmentAnchorIds.includes(id)),
      attributionBasis: "CANDIDATE_COMMITMENT",
      normalizedText,
      classification: "MEASURE",
      theme: "INSTITUTIONS",
      confidence: 0.9,
      rationale: "Action explicite.",
      outputGuards: [],
      rawProposalIndex: 0,
    });
    const reference = candidate(
      ["p1-b01", "p1-b02", "p1-b03", "p1-b04"],
      ["p1-b04"],
      "Créer un fonds national public pour financer durablement les associations locales."
    );

    expect(
      classifyV6Duplicate(
        reference,
        candidate(reference.evidenceUnitIds, ["p1-b03"], "Autre formulation")
      )
    ).toBe("SAME_EVIDENCE_SET");
    expect(
      classifyV6Duplicate(
        reference,
        candidate(["p1-b01", "p1-b04"], ["p1-b04"], "Formulation distincte")
      )
    ).toBe("SAME_COMMITMENT_ANCHOR_SET");
    expect(
      classifyV6Duplicate(reference, candidate(["p2-b01"], ["p2-b01"], reference.normalizedText!))
    ).toBe("SAME_NORMALIZED_FORMULATION");
    expect(
      classifyV6Duplicate(
        reference,
        candidate(
          ["p1-b01", "p1-b02", "p1-b03"],
          ["p1-b03"],
          "Créer un fonds national public pour financer les associations locales"
        )
      )
    ).toBe("POSSIBLE_DUPLICATE");
    expect(
      classifyV6Duplicate(
        reference,
        candidate(["p9-b01"], ["p9-b01"], "Créer un registre des nominations publiques.")
      )
    ).toBeNull();
    expect(
      classifyV6Duplicate(
        candidate(["p8-b01", "p8-b02"], ["p8-b02"], ""),
        candidate(["p8-b01", "p8-b03"], ["p8-b03"], "")
      )
    ).toBeNull();
  });

  it("prépare un candidat complet, ne mute pas la DB et écrit les rapports dédiés", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "poligraph-v6-shadow-test-"));
    const report = await runV6ShadowImport({ candidate: "francois-ruffin", reportDir });

    expect(mocks.electionFind).toHaveBeenCalledOnce();
    expect(mocks.editionFindMany).toHaveBeenCalledOnce();
    expect(mocks.extractEvidenceWindow).toHaveBeenCalledOnce();
    expect(report.safety).toEqual({
      apply: false,
      databaseWrites: false,
      draftsCreated: 0,
      publication: false,
      migration: false,
      cutover: false,
      productionModified: false,
    });
    expect(report.extraction).toMatchObject({
      proposed: 1,
      bundlesValid: 1,
      bundlesInvalid: 0,
      measures: 1,
      eligibleForHumanReview: 1,
    });
    expect(report.evidence).toMatchObject({ twoBlocks: 1, averageBundleSize: 2 });
    const proposal = report.editions[0]!.proposals[0]!;
    expect(proposal.preparedCandidate).toMatchObject({
      classification: "MEASURE",
      formulation: "Créer une caisse publique pour financer la formation des salariés.",
      theme: "EMPLOI_TRAVAIL",
      draftContext: {
        candidacyId: "candidacy-ruffin",
        programEditionId: "edition-travail",
        attribution: "PERSONAL",
        extractionMethod: "AI_ASSISTED",
      },
      source: {
        sourceKind: "PROPOSITIONS_CANDIDAT",
        tier: "PRIMARY",
        url: "https://example.test/travail.pdf",
        pages: [1],
      },
      reviewReadiness: "READY_FOR_REVIEW",
      warnings: [],
      blockers: [],
      evidenceSnapshot: { schemaVersion: "evidence-snapshot/v3" },
    });
    expect(proposal.evidence).toMatchObject({
      schemaVersion: "evidence-snapshot/v3",
      programEditionId: "edition-travail",
      documentUrl: "https://example.test/travail.pdf",
      documentHash: "a".repeat(64),
      parserVersion: "program-document-parser/7-units-v1",
      units: [
        {
          unitId: "pdf-1-1-u001",
          blockId: "pdf-1-1",
          page: 1,
          order: 0,
          role: "COMMITMENT_ANCHOR",
          canonicalText: "CRÉER UNE CAISSE PUBLIQUE.",
          provenanceStatus: "TEXT_LAYER_TRUSTED",
        },
        {
          unitId: "pdf-1-2-u001",
          blockId: "pdf-1-2",
          page: 1,
          order: 1,
          role: "SUPPORTING_CONTEXT",
          canonicalText: "Cette caisse financera la formation des salariés.",
          provenanceStatus: "TEXT_LAYER_TRUSTED",
        },
      ],
    });
    expect(
      proposal.evidence?.units.every(
        (item) => item.rawTextHash.length === 64 && item.canonicalTextHash.length === 64
      )
    ).toBe(true);
    expect(proposal.validation).toMatchObject({
      bundleValidity: "VALID",
      formulationValidity: "VALID",
      formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
      policyValidity: "VALID",
      sensitiveContentChecks: "PASSED",
    });

    const json = JSON.parse(
      await readFile(
        path.join(reportDir, "presidentielle-2027-program-import-v6-shadow.json"),
        "utf8"
      )
    ) as typeof report;
    const markdown = await readFile(
      path.join(reportDir, "presidentielle-2027-program-import-v6-shadow.md"),
      "utf8"
    );
    expect(json.safety.databaseWrites).toBe(false);
    expect(markdown).toContain("Mode strictement READ-ONLY");
    expect(markdown).toContain("unité pdf-1-1-u001");
    expect(markdown).toContain("CRÉER UNE CAISSE PUBLIQUE");
    expect(markdown).toContain("DB writes: NO");
    expect(renderV6ShadowMarkdown(report)).toBe(markdown);
  });

  it("attribue un programme de parti uniquement à la candidature explicitement compatible", async () => {
    mocks.candidacyFind.mockResolvedValue({
      id: "candidacy-philippot",
      candidateName: "Florian Philippot",
      electionId: "election-2027",
      partyId: "party-patriotes",
    });
    mocks.editionFindMany.mockResolvedValue([
      {
        id: "edition-patriotes",
        label: "Grandes orientations pour un projet patriote",
        ownerType: "PARTY",
        documentUrl: "https://example.test/projet.pdf",
        publishedAt: new Date("2025-09-07T00:00:00.000Z"),
        candidacyId: null,
        partyId: "party-patriotes",
        candidacy: null,
        party: { name: "Les Patriotes" },
      },
    ]);
    const reportDir = await mkdtemp(path.join(tmpdir(), "poligraph-v6-party-test-"));

    const report = await runV6ShadowImport({
      party: "les-patriotes",
      partyProgramCandidacyId: "candidacy-philippot",
      reportDir,
    });

    expect(report.editions[0]).toMatchObject({ candidate: "Florian Philippot", errors: [] });
    expect(report.editions[0]!.proposals[0]!.preparedCandidate).toMatchObject({
      reviewReadiness: "READY_FOR_REVIEW",
      draftContext: {
        candidacyId: "candidacy-philippot",
        attribution: "PARTY_PROGRAM",
      },
      source: { sourceKind: "PROGRAMME_PARTI", tier: "PRIMARY" },
    });
  });

  it("refuse une candidature dont le parti ne possède pas le programme", async () => {
    mocks.candidacyFind.mockResolvedValue({
      id: "candidacy-other",
      candidateName: "Autre candidature",
      electionId: "election-2027",
      partyId: "party-other",
    });
    mocks.editionFindMany.mockResolvedValue([
      {
        id: "edition-patriotes",
        label: "Grandes orientations pour un projet patriote",
        ownerType: "PARTY",
        documentUrl: "https://example.test/projet.pdf",
        publishedAt: new Date("2025-09-07T00:00:00.000Z"),
        candidacyId: null,
        partyId: "party-patriotes",
        candidacy: null,
        party: { name: "Les Patriotes" },
      },
    ]);
    const reportDir = await mkdtemp(path.join(tmpdir(), "poligraph-v6-party-mismatch-test-"));

    const report = await runV6ShadowImport({
      party: "les-patriotes",
      partyProgramCandidacyId: "candidacy-other",
      reportDir,
    });

    expect(report.documents.parsed).toBe(0);
    expect(report.editions[0]!.errors).toEqual([
      "Plateforme de parti non attribuable automatiquement à une candidature 2027.",
    ]);
  });

  it("isole une réponse de fenêtre mal formée sans interrompre le document", async () => {
    const manyBlocks = Array.from({ length: 13 }, (_, index) =>
      block(
        `pdf-1-${index + 1}`,
        index,
        index === 12
          ? "Créer un fonds public pour la formation."
          : `Diagnostic documentaire suffisamment long numéro ${index + 1}.`
      )
    );
    const manyUnits = manyBlocks.map((item, index) => unit(`${item.id}-u001`, index, item.text));
    mocks.parseDocument.mockResolvedValue({
      mediaType: "pdf",
      blocks: manyBlocks,
      units: manyUnits,
      segments: [],
      scannedPdf: false,
      pageDiagnostics: [],
    });
    mocks.analyzeDocumentDiscourse.mockResolvedValue({
      units: manyUnits,
      discourseAnnotations: manyUnits.map((item, index) => ({
        unitId: item.id,
        speaker: "DOCUMENT_AUTHOR",
        discourseRole: index === 12 ? "COMMITMENT" : "DIAGNOSIS",
        confidence: 0.99,
        reason: "Annotation de fixture.",
      })),
      cacheKey: "d".repeat(64),
      fromCache: false,
      modelCalls: 1,
    });
    mocks.extractEvidenceWindow
      .mockRejectedValueOnce(new Error("JSON de fenêtre invalide"))
      .mockResolvedValueOnce([
        {
          evidenceUnitIds: ["pdf-1-13-u001"],
          commitmentAnchorIds: ["pdf-1-13-u001"],
          supportingIds: [],
          attributionBasis: "CANDIDATE_COMMITMENT",
          normalizedText: "Créer un fonds public pour la formation.",
          classification: "MEASURE",
          theme: "EMPLOI_TRAVAIL",
          confidence: 0.91,
          rationale: "Action explicite.",
          outputGuards: [],
          rawProposalIndex: 0,
        },
      ]);
    const reportDir = await mkdtemp(path.join(tmpdir(), "poligraph-v6-window-error-test-"));

    const report = await runV6ShadowImport({ reportDir });

    expect(report.documents.failed).toBe(0);
    expect(report.extraction.errors).toBe(1);
    expect(report.editions[0]!.errors[0]).toContain("JSON de fenêtre invalide");
    expect(report.editions[0]!.proposals).toHaveLength(1);
  });
});
