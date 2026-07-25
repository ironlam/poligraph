import { describe, it, expect, vi, beforeEach } from "vitest";

// Affaires v2, lot 1: acceptance path. Order is load-bearing (pending check,
// patch validation, drift check, then one transaction) and the trace must commit
// together with the write.

const h = vi.hoisted(() => ({
  db: {
    affair: { findUnique: vi.fn(), update: vi.fn() },
    affairUpdateProposal: { findUnique: vi.fn(), update: vi.fn() },
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
  status: "APPEL_EN_COURS",
  involvement: "DIRECT",
  category: "PROBITE",
  severity: "GRAVE",
  factsDate: null,
  startDate: null,
  verdictDate: null,
  court: null,
  chamber: null,
  caseNumber: null,
  sentence: null,
  prisonMonths: null,
  prisonSuspended: null,
  fineAmount: null,
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

    // Traceability, in the same transaction as the write.
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

    expect(db.affairUpdateProposal.update.mock.calls[0]![0].data.status).toBe("APPROVED");
  });

  it("l'écriture, la revue, l'audit et le changement d'état sont dans une seule transaction", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal());

    await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
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

    const proposalWrite = db.affairUpdateProposal.update.mock.calls[0]![0].data;
    expect(proposalWrite.status).toBe("CONFLICT");
    expect(proposalWrite.conflictDetail).toEqual({
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

  it("refuse une proposition déjà traitée", async () => {
    db.affairUpdateProposal.findUnique.mockResolvedValue(pendingProposal({ status: "APPROVED" }));

    const result = await acceptProposal({ proposalId: "prop_1", reviewedBy: "admin" });

    expect(result).toEqual({ ok: false, reason: "not_pending", status: "APPROVED" });
    expect(db.$transaction).not.toHaveBeenCalled();
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
    expect(db.affairUpdateProposal.update.mock.calls[0]![0].data.status).toBe("REJECTED");
    expect(db.auditLog.create.mock.calls[0]![0].data.changes.action).toBe("PROPOSAL_REJECTED");
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
  });
});
