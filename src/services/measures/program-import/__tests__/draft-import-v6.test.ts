import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validEvidenceSnapshot } from "@/lib/measures/__tests__/evidence-snapshot-fixture";
import type { DraftablePreparedMeasureCandidate } from "../evidence-v6";
import type { V6ShadowReport } from "../shadow-v6";

const mocks = vi.hoisted(() => ({
  runV6ShadowImport: vi.fn(),
  queryRaw: vi.fn(),
  revisionFindMany: vi.fn(),
  measureFindMany: vi.fn(),
  createMeasure: vi.fn(),
  assertHubMeasureCandidacy: vi.fn(),
}));

vi.mock("../shadow-v6", () => ({ runV6ShadowImport: mocks.runV6ShadowImport }));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    measureRevision: { findMany: mocks.revisionFindMany },
    measure: { findMany: mocks.measureFindMany },
  },
}));
vi.mock("@/lib/measures/transitions", () => ({ createMeasure: mocks.createMeasure }));
vi.mock("@/app/admin/mesures/_data/candidacy-eligibility", () => ({
  assertHubMeasureCandidacy: mocks.assertHubMeasureCandidacy,
}));

import { runV6DraftImport } from "../draft-import-v6";

const REQUIRED_COLUMNS = [
  "evidenceSnapshot",
  "importFingerprint",
  "reviewReadiness",
  "reviewWarnings",
  "rejectedAt",
  "rejectedBy",
  "rejectionReason",
  "rejectionDetail",
].map((column_name) => ({ column_name }));

function candidate(): DraftablePreparedMeasureCandidate {
  return {
    classification: "MEASURE",
    formulation: "Créer une caisse publique de formation.",
    theme: "EMPLOI_TRAVAIL",
    confidence: 0.92,
    evidenceSnapshot: validEvidenceSnapshot(),
    reviewReadiness: "READY_FOR_REVIEW",
    warnings: [],
    blockers: [],
    observations: [],
    importFingerprint: "b".repeat(64),
    draftContext: {
      candidacyId: "candidacy-ruffin",
      programEditionId: "edition-ruffin",
      attribution: "PERSONAL",
      validFrom: "2026-08-17T00:00:00.000Z",
      precision: null,
      extractionMethod: "AI_ASSISTED",
      extractorVersion: "mistral-large-latest/presidential-program-import-7-discourse-grounded-v1",
    },
    source: {
      sourceKind: "PROPOSITIONS_CANDIDAT",
      tier: "PRIMARY",
      url: "https://example.test/ruffin.pdf",
      pages: [12],
      publishedAt: "2026-08-17T00:00:00.000Z",
    },
  };
}

function shadow(prepared = candidate()): V6ShadowReport {
  return {
    editions: [
      {
        proposals: [{ id: "proposal-1", preparedCandidate: prepared }],
      },
    ],
  } as unknown as V6ShadowReport;
}

describe("planificateur DRAFT V6", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runV6ShadowImport.mockResolvedValue(shadow());
    mocks.queryRaw.mockResolvedValue(REQUIRED_COLUMNS);
    mocks.revisionFindMany.mockResolvedValue([]);
    mocks.measureFindMany.mockResolvedValue([]);
    mocks.createMeasure.mockResolvedValue({ measureId: "measure-1", revisionId: "revision-1" });
    mocks.assertHubMeasureCandidacy.mockResolvedValue({
      electionId: "election-1",
      politicianId: "p-1",
    });
  });

  it("planifie un DRAFT sans écrire en dry-run", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "poligraph-v6-draft-test-"));
    const report = await runV6DraftImport({
      apply: false,
      confirmDraftWrite: false,
      candidate: "francois-ruffin",
      reportDir,
    });

    expect(report.counts).toMatchObject({
      readyForReview: 1,
      alreadyExisting: 0,
      wouldCreateDrafts: 1,
      draftsCreated: 0,
    });
    expect(report.safety).toMatchObject({
      automaticPublication: false,
      destructiveUpdates: false,
      productionModified: false,
    });
    expect(mocks.createMeasure).not.toHaveBeenCalled();
  });

  it("rend un rerun idempotent grâce au fingerprint stable", async () => {
    mocks.revisionFindMany.mockResolvedValue([{ importFingerprint: "b".repeat(64) }]);
    const reportDir = await mkdtemp(path.join(tmpdir(), "poligraph-v6-rerun-test-"));
    const report = await runV6DraftImport({
      apply: false,
      confirmDraftWrite: false,
      candidate: "francois-ruffin",
      reportDir,
    });

    expect(report.counts).toMatchObject({ alreadyExisting: 1, wouldCreateDrafts: 0 });
  });

  it("transforme un rapprochement sémantique en warning sans le bloquer", async () => {
    mocks.measureFindMany.mockResolvedValue([
      {
        candidacyId: "candidacy-ruffin",
        theme: "EMPLOI_TRAVAIL",
        latestRevision: { text: "Créer une caisse publique de formation professionnelle." },
      },
    ]);
    const reportDir = await mkdtemp(path.join(tmpdir(), "poligraph-v6-duplicate-test-"));
    const report = await runV6DraftImport({
      apply: false,
      confirmDraftWrite: false,
      candidate: "francois-ruffin",
      reportDir,
    });

    expect(report.counts).toMatchObject({ possibleDuplicates: 1, wouldCreateDrafts: 1 });
    expect(report.items[0]!.candidate).toMatchObject({
      reviewReadiness: "REVIEW_WITH_WARNING",
      warnings: ["POSSIBLE_DUPLICATE"],
    });
  });

  it("refuse tout apply sans confirmation explicite", async () => {
    await expect(
      runV6DraftImport({
        apply: true,
        confirmDraftWrite: false,
        candidate: "francois-ruffin",
      })
    ).rejects.toThrow("--confirm-draft-write");
    expect(mocks.runV6ShadowImport).not.toHaveBeenCalled();
    expect(mocks.createMeasure).not.toHaveBeenCalled();
  });
});
