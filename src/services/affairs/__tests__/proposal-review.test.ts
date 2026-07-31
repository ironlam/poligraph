import { describe, it, expect, vi, beforeEach } from "vitest";

// Affaires v2, lot 1: acceptance path. Three properties under test:
// the whole thing is one transaction, the PENDING gate is a compare-and-set so
// two simultaneous acceptances cannot both apply, and drift never writes.

const h = vi.hoisted(() => ({
  db: {
    affair: { findUnique: vi.fn(), update: vi.fn() },
    affairUpdateProposal: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    moderationReview: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  trackStatusChange: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/services/affairs/status-tracking", () => ({
  trackStatusChange: h.trackStatusChange,
}));

import { acceptProposal, rejectProposal } from "@/services/affairs/proposal-review";

const db = h.db;

const LIVE_AFFAIR = {
  id: "aff_1",
  slug: "affaire-test",
  publicId: "AF-000542",
  title: "Affaire de test",
  politician: { slug: "jean-testeur", fullName: "Jean Testeur" },
  status: "APPEL_EN_COURS",
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

beforeEach(() => {
  vi.clearAllMocks();
  db.affair.findUnique.mockResolvedValue(LIVE_AFFAIR);
  db.affair.update.mockResolvedValue({});
  db.affairUpdateProposal.update.mockResolvedValue({});
  // Default: the claim succeeds (nobody else took the row).
  db.affairUpdateProposal.updateMany.mockResolvedValue({ count: 1 });
  db.moderationReview.create.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  h.trackStatusChange.mockResolvedValue(undefined);
});

describe("acceptProposal", () => {
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
    expect(db.auditLog.create).not.toHaveBeenCalled();

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
