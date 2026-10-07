import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { addMonthsUtc, parisDay } from "../cadence";

vi.mock("@/lib/affairs/monitoring/reconcile", async (orig) => ({
  ...(await orig<typeof import("@/lib/affairs/monitoring/reconcile")>()),
  reconcileAffairMonitoring: async () => {
    throw new Error("boom");
  },
}));

let db: typeof import("@/lib/db").db;
let acceptProposal: typeof import("@/services/affairs/proposal-review").acceptProposal;
let proposeAffairUpdate: typeof import("@/services/affairs/proposals").proposeAffairUpdate;

it("garde le test PostgreSQL derrière le garde de base jetable", () => {
  expect(describeIfDisposableDb).toBeDefined();
});

describeIfDisposableDb("échec de la réconciliation pendant une acceptation", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ acceptProposal } = await import("@/services/affairs/proposal-review"));
    ({ proposeAffairUpdate } = await import("@/services/affairs/proposals"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("annule l'acceptation entière quand le suivi ne peut pas être recalculé", async () => {
    const suffix = crypto.randomUUID();
    const politician = await db.politician.create({
      data: {
        slug: `test-suivi-rollback-${suffix}`,
        firstName: "Test",
        lastName: "Suivi",
        fullName: "Test Suivi",
      },
    });
    const affair = await db.affair.create({
      data: {
        politicianId: politician.id,
        slug: `test-affaire-suivi-rollback-${suffix}`,
        title: "Affaire de test du suivi",
        description: "Donnée de test jetable.",
        status: "PROCES_EN_COURS",
        category: "FAVORITISME",
        involvement: "DIRECT",
        publicationStatus: "PUBLISHED",
      },
    });
    await db.affairMonitoring.create({
      data: {
        affairId: affair.id,
        nextReviewAt: addMonthsUtc(parisDay(new Date()), 1),
        dueReason: "CADENCE",
        dateOrigin: "CADENCE",
        statusAtSchedule: "PROCES_EN_COURS",
      },
    });
    const importRun = await db.importRun.create({
      data: { importer: "test-suivi", status: "COMPLETED", finishedAt: new Date() },
    });
    let proposalId: string | null = null;
    try {
      const proposed = await proposeAffairUpdate({
        affairId: affair.id,
        importer: "test-suivi",
        importRunId: importRun.id,
        patch: { status: "CONDAMNATION_PREMIERE_INSTANCE" },
        source: "PRESSE",
        sourceUrl: `https://www.lemonde.fr/politique/article/test-suivi-rollback-${suffix}.html`,
        confidence: 80,
        rationale: "Test de l'annulation du recalcul du suivi.",
      });
      proposalId = proposed.pendingProposalId;
      expect(proposalId).not.toBeNull();

      await expect(acceptProposal({ proposalId: proposalId!, reviewedBy: "test" })).rejects.toThrow(
        "boom"
      );

      const proposal = await db.affairUpdateProposal.findUniqueOrThrow({
        where: { id: proposalId! },
        select: { status: true },
      });
      expect(proposal.status).toBe("PENDING");
      const live = await db.affair.findUniqueOrThrow({
        where: { id: affair.id },
        select: { status: true },
      });
      expect(live.status).toBe("PROCES_EN_COURS");
      await expect(db.moderationReview.count({ where: { affairId: affair.id } })).resolves.toBe(0);
    } finally {
      await db.auditLog.deleteMany({
        where: { entityId: { in: [affair.id, ...(proposalId ? [proposalId] : [])] } },
      });
      await db.moderationReview.deleteMany({ where: { affairId: affair.id } });
      if (proposalId) await db.affairUpdateProposal.delete({ where: { id: proposalId } });
      await db.importRun.delete({ where: { id: importRun.id } });
      await db.politician.delete({ where: { id: politician.id } });
    }
  });
});
