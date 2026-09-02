import { describe, it, expect, vi, beforeEach } from "vitest";

// Affaires v2, lot 1: acceptance path. Three properties under test:
// the whole thing is one transaction, the PENDING gate is a compare-and-set so
// two simultaneous acceptances cannot both apply, and drift never writes.

const h = vi.hoisted(() => ({
  db: {
    affair: { findUnique: vi.fn(), update: vi.fn() },
    affairEvent: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    source: { upsert: vi.fn() },
    pressArticleAffair: { upsert: vi.fn(), update: vi.fn() },
    affairPoliticianDecision: { findUnique: vi.fn(), updateMany: vi.fn() },
    affairUpdateProposal: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    moderationReview: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  trackStatusChange: vi.fn(),
  verifyProposalOfficialEvidence: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/services/affairs/status-tracking", () => ({
  trackStatusChange: h.trackStatusChange,
}));
vi.mock("@/lib/affairs/official-decision-verification", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/affairs/official-decision-verification")>();
  return { ...actual, verifyProposalOfficialEvidence: h.verifyProposalOfficialEvidence };
});

import { acceptProposal, rejectProposal } from "@/services/affairs/proposal-review";
import { computeAffairEventIdentity } from "@/services/affairs/proposals";
import { AFFAIR_EVOLUTION_REVELATION_TITLE } from "@/lib/security/schemas/affair-proposal";

const db = h.db;

const LIVE_AFFAIR = {
  id: "aff_1",
  slug: "affaire-test",
  publicId: "AF-000542",
  title: "Affaire de test",
  politician: { slug: "jean-testeur", fullName: "Jean Testeur" },
  status: "APPEL_EN_COURS",
  publicationStatus: "PUBLISHED",
  verdictDate: null,
  court: null,
  sentence: null,
  prisonMonths: null,
  prisonFirmMonths: null,
  ineligibilityFirmMonths: null,
  ineligibilityMonths: null,
  communityService: null,
  otherSentence: null,
  ecli: null,
  pourvoiNumber: null,
  caseNumbers: [],
};

const LEGIFRANCE_URL = "https://www.legifrance.gouv.fr/juri/id/JURITEXT000049774995";

function forbiddenOfficialResponse(): Response {
  return {
    status: 403,
    ok: false,
    url: LEGIFRANCE_URL,
    headers: new Headers(),
    text: vi.fn().mockResolvedValue("Forbidden"),
  } as unknown as Response;
}

function pendingProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "prop_1",
    affairId: "aff_1",
    importer: "judilibre",
    extractorVersion: "judilibre-v1",
    status: "PENDING",
    proposedPatch: { status: "CONDAMNATION_DEFINITIVE", verdictDate: "2026-05-13T00:00:00.000Z" },
    observedValues: { status: "APPEL_EN_COURS", verdictDate: null },
    confidence: 90,
    rationale: "Décision de cassation rapprochée de cette affaire.",
    source: "JUDILIBRE",
    sourceUrl: "https://www.courdecassation.fr/decision/1",
    affair: {
      id: "aff_1",
      slug: "affaire-test",
      status: "APPEL_EN_COURS",
      politician: { slug: "jean-testeur" },
    },
    ...overrides,
  };
}

function pendingEventProposal(overrides: Record<string, unknown> = {}) {
  const date = new Date("2026-08-27T08:00:00.000Z");
  const sourceUrl = "https://www.lemonde.fr/politique/article-test.html";
  const identityKey = computeAffairEventIdentity({
    affairId: "aff_1",
    sourceUrl,
    publishedAt: date,
    pressArticleId: "article_1",
  });
  return pendingProposal({
    importer: "press-analysis",
    extractorVersion: "press-evolution-v1",
    source: "PRESSE",
    sourceUrl,
    sourceExcerpt: "Extrait exact.",
    proposedPatch: {
      addEvent: {
        date: date.toISOString(),
        type: "REVELATION",
        title: AFFAIR_EVOLUTION_REVELATION_TITLE,
        description: null,
        sourceUrl,
        sourceTitle: "Titre original de l’article",
      },
    },
    observedValues: {
      addEvent: {
        identityVersion: "press-revelation-v2",
        identityKey,
        existingEventId: null,
      },
    },
    metadata: {
      eventProposal: {
        version: 1,
        identityVersion: "press-revelation-v2",
        identityKey,
        publisher: "AFP",
        publishedAt: date.toISOString(),
        pressArticleId: "article_1",
        resolverDecisionId: "decision_1",
      },
    },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.affair.findUnique.mockResolvedValue(LIVE_AFFAIR);
  db.affair.update.mockResolvedValue({});
  db.affairEvent.findUnique.mockResolvedValue(null);
  db.affairEvent.findMany.mockResolvedValue([]);
  db.affairEvent.create.mockResolvedValue({ id: "event_1" });
  db.source.upsert.mockResolvedValue({ id: "source_1" });
  db.pressArticleAffair.upsert.mockResolvedValue({ id: "link_1", role: "UPDATE" });
  db.pressArticleAffair.update.mockResolvedValue({});
  db.affairPoliticianDecision.findUnique.mockResolvedValue({ affairId: null });
  db.affairPoliticianDecision.updateMany.mockResolvedValue({ count: 1 });
  db.affairUpdateProposal.update.mockResolvedValue({});
  // Default: the claim succeeds (nobody else took the row).
  db.affairUpdateProposal.updateMany.mockResolvedValue({ count: 1 });
  db.moderationReview.create.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
  db.$queryRaw.mockResolvedValue([{ id: "aff_1" }]);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  h.trackStatusChange.mockResolvedValue(undefined);
  h.verifyProposalOfficialEvidence.mockResolvedValue(null);
});

describe("acceptProposal", () => {
  it("refuse avant la transaction quand la décision officielle ne concorde pas", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());
    h.verifyProposalOfficialEvidence.mockResolvedValue({
      sourceUrl: "https://www.courdecassation.fr/decision/1",
      metadata: {},
      verification: {
        version: 1,
        status: "MISMATCH",
        checkedAt: "2026-08-18T09:00:00.000Z",
        requestedUrl: "https://www.courdecassation.fr/decision/1",
        resolvedUrl: "https://www.courdecassation.fr/decision/1",
        httpStatus: 200,
        contentHash: "a".repeat(64),
        matchedIdentifiers: ["officialId"],
        issues: ["pourvoi_absent_ou_different"],
        indexedProof: null,
      },
    });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({
      ok: false,
      reason: "evidence_unverified",
      verification: { status: "MISMATCH" },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuse une preuve INDEX_VERIFIED déclarative après une revérification HTTP 403", async () => {
    const verifiedAt = new Date().toISOString();
    const indexedProof = {
      version: 1,
      exactUrl: LEGIFRANCE_URL,
      verifiedAt,
      method: "EXACT_OFFICIAL_SEARCH_RESULT",
      title: "Cour de cassation, Chambre criminelle, 19 juin 2024, 23-82.194",
      publisher: "Légifrance",
      pourvoi: "23-82.194",
      ecli: "FR:CCASS:2024:CR00817",
      decisionDate: "2024-06-19",
      officialId: "JURITEXT000049774995",
    };
    db.affairUpdateProposal.findUnique.mockResolvedValue(
      pendingProposal({
        source: "LEGIFRANCE",
        sourceUrl: LEGIFRANCE_URL,
        officialId: "JURITEXT000049774995",
        metadata: {
          courtDecisionCandidate: {
            url: LEGIFRANCE_URL,
            canonicalUrl: LEGIFRANCE_URL,
            pourvoi: "23-82.194",
            ecli: "FR:CCASS:2024:CR00817",
            date: "2024-06-19",
            legifranceId: "JURITEXT000049774995",
            indexedProof,
            verification: {
              version: 1,
              status: "INDEX_VERIFIED",
              checkedAt: verifiedAt,
              requestedUrl: LEGIFRANCE_URL,
              resolvedUrl: LEGIFRANCE_URL,
              httpStatus: 403,
              contentHash: null,
              matchedIdentifiers: ["pourvoi", "ecli", "decisionDate", "officialId"],
              issues: ["http_403", "url_officielle_confirmee_par_index_exact"],
              indexedProof,
            },
          },
        },
      })
    );
    const actual = await vi.importActual<
      typeof import("@/lib/affairs/official-decision-verification")
    >("@/lib/affairs/official-decision-verification");
    const fetchImpl = vi.fn().mockResolvedValue(forbiddenOfficialResponse());
    h.verifyProposalOfficialEvidence.mockImplementation((input) =>
      actual.verifyProposalOfficialEvidence(input, { fetchImpl })
    );

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: false,
      reason: "evidence_unverified",
      verification: { status: "INDEX_VERIFIED", httpStatus: 403 },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.updateMany).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.update).not.toHaveBeenCalled();
    expect(db.moderationReview.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("applique le patch, trace, et renvoie les slugs à invalider", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({
      ok: true,
      affairSlug: "affaire-test",
      politicianSlug: "jean-testeur",
    });

    // The patch reaches Prisma through validatePatch, so the ISO string became a Date.
    const written = db.affair.update.mock.calls[0]![0].data;
    expect(written.status).toBe("CONDAMNATION_DEFINITIVE");
    expect(written.verdictDate).toBeInstanceOf(Date);

    expect(db.moderationReview.create).toHaveBeenCalledTimes(1);
    expect(db.moderationReview.create.mock.calls[0]![0].data.model).toBe(
      "proposal:judilibre@judilibre-v1"
    );
    expect(db.moderationReview.create.mock.calls[0]![0].data.appliedAt).toBeInstanceOf(Date);

    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = db.auditLog.create.mock.calls[0]![0].data;
    expect(audit.entityType).toBe("Affair");
    expect(audit.changes.action).toBe("PROPOSAL_ACCEPTED");
    expect(audit.changes.before).toEqual({ status: "APPEL_EN_COURS", verdictDate: null });
  });

  it("tout tient dans une seule transaction, ouverte par un compare-and-set", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());

    await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(db.$transaction).toHaveBeenCalledTimes(1);

    // The PENDING gate is a conditional update, not a read before the transaction.
    const claim = db.affairUpdateProposal.updateMany.mock.calls[0]![0];
    expect(claim.where).toEqual({ id: "prop_1", status: "PENDING" });
    expect(claim.data.status).toBe("APPROVED");
    expect(claim.data.reviewedBy).toBe("admin");
  });

  it("une acceptation concurrente perdante n'applique rien", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());
    // Someone else claimed the row between our read and our write.
    db.affairUpdateProposal.updateMany.mockResolvedValue({ count: 0 });
    db.affairUpdateProposal.findUnique
      .mockResolvedValueOnce(pendingProposal())
      .mockResolvedValueOnce({ status: "APPROVED" });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({ ok: false, reason: "not_pending" });
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.moderationReview.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("alimente la chronologie quand le statut change", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());

    await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(h.trackStatusChange).toHaveBeenCalledWith(
      "aff_1",
      "APPEL_EN_COURS",
      "CONDAMNATION_DEFINITIVE",
      expect.objectContaining({ type: "JUDILIBRE" })
    );
  });

  it("un échec de chronologie ne fait pas échouer l'acceptation", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());
    h.trackStatusChange.mockRejectedValue(new Error("timeline down"));

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result.ok).toBe(true);
  });

  it("passe en CONFLICT sans rien écrire quand la valeur en base a bougé", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());
    // An editor corrected the status by hand since the proposal was filed.
    db.affair.findUnique.mockResolvedValue({ ...LIVE_AFFAIR, status: "CONDAMNATION_DEFINITIVE" });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.moderationReview.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: expect.objectContaining({ action: "PROPOSAL_CONFLICT" }),
        }),
      })
    );

    const conflictWrite = db.affairUpdateProposal.update.mock.calls[0]![0].data;
    expect(conflictWrite.status).toBe("CONFLICT");
    expect(conflictWrite.appliedAt).toBeNull();
    expect(conflictWrite.conflictDetail).toEqual({
      status: { expected: "APPEL_EN_COURS", actual: "CONDAMNATION_DEFINITIVE" },
    });
  });

  it("ne signale pas de conflit quand seule la représentation diffère", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(
      pendingProposal({
        proposedPatch: { court: "TJ de Paris" },
        observedValues: { verdictDate: "2026-05-13T00:00:00.000Z" },
      })
    );
    db.affair.findUnique.mockResolvedValue({
      ...LIVE_AFFAIR,
      verdictDate: new Date("2026-05-13T00:00:00.000Z"),
    });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result.ok).toBe(true);
  });

  it("refuse une proposition déjà traitée sans ouvrir de transaction", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal({ status: "APPROVED" }));

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toEqual({ ok: false, reason: "not_pending", status: "APPROVED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuse une proposition orpheline : l'affaire a été supprimée", async () => {
    // onDelete: SetNull keeps the review history, but there is nothing to patch.
    db.affairUpdateProposal.findUnique.mockResolvedValue(
      pendingProposal({ affairId: null, affair: null })
    );

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toEqual({ ok: false, reason: "orphaned" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.affair.update).not.toHaveBeenCalled();
  });

  it("annule tout si l'affaire disparaît pendant la transaction", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());
    db.affair.findUnique.mockResolvedValue(null);

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toEqual({ ok: false, reason: "orphaned" });
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.moderationReview.create).not.toHaveBeenCalled();
  });

  it("refuse un patch dont le contenu stocké est invalide, avant toute transaction", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(
      pendingProposal({
        proposedPatch: { publicationStatus: "PUBLISHED" },
        observedValues: { publicationStatus: "DRAFT" },
      })
    );

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({ ok: false, reason: "invalid_patch" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.affair.update).not.toHaveBeenCalled();
  });

  it("renvoie not_found sur un identifiant inconnu", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(null);

    const result = await acceptProposal({ proposalId: "nope", reviewedBy: "admin" });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("applique un événement et ses relations atomiquement sans modifier Affair", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingEventProposal());

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({ ok: true, appliedFields: ["event"] });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.affairEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          affairId: "aff_1",
          identityKey: expect.stringMatching(/^[a-f0-9]{64}$/),
          type: "REVELATION",
          title: AFFAIR_EVOLUTION_REVELATION_TITLE,
          description: null,
        }),
      })
    );
    expect(db.source.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          publisher: "AFP",
          publishedAt: new Date("2026-08-27T08:00:00.000Z"),
        }),
      })
    );
    expect(db.pressArticleAffair.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { articleId: "article_1", affairId: "aff_1", role: "UPDATE" },
      })
    );
    expect(db.affairPoliticianDecision.updateMany).toHaveBeenCalledWith({
      where: { id: "decision_1", affairId: null },
      data: { affairId: "aff_1" },
    });
    expect(h.trackStatusChange).not.toHaveBeenCalled();
  });

  it("passe en conflit si le même événement est apparu après le dépôt", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingEventProposal());
    db.affairEvent.findUnique.mockResolvedValue({ id: "event_existing" });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toEqual({
      ok: false,
      reason: "conflict",
      conflictDetail: { event: { expected: "absent", actual: "event_existing" } },
    });
    expect(db.affairEvent.create).not.toHaveBeenCalled();
    expect(db.source.upsert).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: expect.objectContaining({ action: "PROPOSAL_CONFLICT" }),
        }),
      })
    );
  });

  it("annule l’événement si la décision resolver vise déjà une autre affaire", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingEventProposal());
    db.affairPoliticianDecision.findUnique.mockResolvedValue({ affairId: "aff_other" });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect(db.affairEvent.create).not.toHaveBeenCalled();
    expect(db.source.upsert).not.toHaveBeenCalled();
  });

  it("détecte une course lors du rattachement de la décision resolver", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingEventProposal());
    db.affairPoliticianDecision.findUnique
      .mockResolvedValueOnce({ affairId: null })
      .mockResolvedValueOnce({ affairId: "aff_other" });
    db.affairPoliticianDecision.updateMany.mockResolvedValue({ count: 0 });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect(db.affairEvent.create).not.toHaveBeenCalled();
    expect(db.source.upsert).not.toHaveBeenCalled();
  });

  it("passe en conflit si la cible est devenue archivée", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingEventProposal());
    db.affair.findUnique.mockResolvedValue({ ...LIVE_AFFAIR, publicationStatus: "ARCHIVED" });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect(db.affairEvent.create).not.toHaveBeenCalled();
  });

  it("ne dégrade pas un lien REVELATION existant", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingEventProposal());
    db.pressArticleAffair.upsert.mockResolvedValue({ id: "link_1", role: "REVELATION" });

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result.ok).toBe(true);
    expect(db.pressArticleAffair.update).not.toHaveBeenCalled();
  });
});

describe("rejectProposal", () => {
  it("passe en REJECTED et trace, sans toucher à l'affaire", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue({
      id: "prop_1",
      affairId: "aff_1",
      status: "PENDING",
      importer: "judilibre",
    });

    const result = await rejectProposal({
      proposalId: "prop_1",
      reviewedBy: "admin",
      reviewNotes: "Source insuffisante",
    });

    expect(result).toEqual({ ok: true, affairId: "aff_1" });
    expect(db.affair.update).not.toHaveBeenCalled();

    const claim = db.affairUpdateProposal.updateMany.mock.calls[0]![0];
    expect(claim.where).toEqual({ id: "prop_1", status: "PENDING" });
    expect(claim.data.status).toBe("REJECTED");
    expect(claim.data.reviewedBy).toBe("admin");
    expect(claim.data.reviewNotes).toBe("Source insuffisante");

    expect(db.auditLog.create.mock.calls[0]![0].data.changes.action).toBe("PROPOSAL_REJECTED");
  });

  it("un rejet concurrent perdant ne trace pas deux fois", async () => {
    db.affairUpdateProposal.findUnique
      .mockResolvedValueOnce({
        id: "prop_1",
        affairId: "aff_1",
        status: "PENDING",
        importer: "judilibre",
      })
      .mockResolvedValueOnce({ status: "REJECTED" });
    db.affairUpdateProposal.updateMany.mockResolvedValue({ count: 0 });

    const result = await rejectProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toMatchObject({ ok: false, reason: "not_pending" });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuse une proposition déjà traitée", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue({
      id: "prop_1",
      affairId: "aff_1",
      status: "REJECTED",
      importer: "judilibre",
    });

    const result = await rejectProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toEqual({ ok: false, reason: "not_pending", status: "REJECTED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("accepte de rejeter une proposition orpheline : rien à patcher, mais on trace", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue({
      id: "prop_1",
      affairId: null,
      status: "PENDING",
      importer: "judilibre",
    });

    const result = await rejectProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toEqual({ ok: true, affairId: null });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
