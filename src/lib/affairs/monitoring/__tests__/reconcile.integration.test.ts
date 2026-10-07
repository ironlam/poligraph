import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import type { AffairStatus, PublicationStatus } from "@/generated/prisma";
import { addMonthsUtc, parisDay } from "../cadence";

let db: typeof import("@/lib/db").db;
let acceptProposal: typeof import("@/services/affairs/proposal-review").acceptProposal;
let proposeAffairUpdate: typeof import("@/services/affairs/proposals").proposeAffairUpdate;
let assertPublishable: typeof import("@/lib/affairs/publish-guard").assertPublishable;
let reconcileAffairMonitoring: typeof import("../reconcile").reconcileAffairMonitoring;
let reconcileAllAffairMonitoring: typeof import("../reconcile").reconcileAllAffairMonitoring;

const DAY_MS = 24 * 60 * 60 * 1000;

it("garde le test PostgreSQL derrière le garde de base jetable", () => {
  expect(describeIfDisposableDb).toBeDefined();
});

describeIfDisposableDb("réconciliation du suivi des affaires", () => {
  const politicianIds: string[] = [];

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ acceptProposal } = await import("@/services/affairs/proposal-review"));
    ({ proposeAffairUpdate } = await import("@/services/affairs/proposals"));
    ({ assertPublishable } = await import("@/lib/affairs/publish-guard"));
    ({ reconcileAffairMonitoring, reconcileAllAffairMonitoring } = await import("../reconcile"));
  });

  afterAll(async () => {
    // Cascade removes affairs, sources and monitoring rows.
    await db.politician.deleteMany({ where: { id: { in: politicianIds } } });
    await db.$disconnect();
  });

  async function createAffair(
    suffix: string,
    status: AffairStatus,
    publicationStatus: PublicationStatus
  ) {
    const politician = await db.politician.create({
      data: {
        slug: `test-suivi-${suffix}`,
        firstName: "Test",
        lastName: "Suivi",
        fullName: "Test Suivi",
      },
    });
    politicianIds.push(politician.id);
    return db.affair.create({
      data: {
        politicianId: politician.id,
        slug: `test-affaire-suivi-${suffix}`,
        title: "Affaire de test du suivi",
        description: "Donnée de test jetable.",
        status,
        category: "FAVORITISME",
        involvement: "DIRECT",
        publicationStatus,
        sources: {
          create: {
            url: `https://www.lemonde.fr/politique/article/test-suivi-${suffix}.html`,
            title: "Article de test du suivi",
            publisher: "Le Monde",
            publishedAt: new Date("2026-08-27T08:00:00.000Z"),
          },
        },
      },
    });
  }

  it("recalcule le suivi dans la transaction d'acceptation d'une proposition", async () => {
    const suffix = crypto.randomUUID();
    const today = parisDay(new Date());
    const affair = await createAffair(suffix, "PROCES_EN_COURS", "PUBLISHED");
    await db.affairMonitoring.create({
      data: {
        affairId: affair.id,
        nextReviewAt: addMonthsUtc(today, 1),
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
        sourceUrl: `https://www.lemonde.fr/politique/article/test-suivi-verdict-${suffix}.html`,
        confidence: 80,
        rationale: "Test du recalcul du suivi.",
      });
      proposalId = proposed.pendingProposalId;
      expect(proposalId).not.toBeNull();

      const result = await acceptProposal({ proposalId: proposalId!, reviewedBy: "test" });
      expect(result.ok).toBe(true);

      const monitoring = await db.affairMonitoring.findUniqueOrThrow({
        where: { affairId: affair.id },
      });
      expect(monitoring.statusAtSchedule).toBe("CONDAMNATION_PREMIERE_INSTANCE");
      expect(monitoring.nextReviewAt).toEqual(addMonthsUtc(today, 3));
      expect(monitoring.version).toBe(1);
    } finally {
      const affairIds = [affair.id];
      await db.auditLog.deleteMany({
        where: { entityId: { in: [...affairIds, ...(proposalId ? [proposalId] : [])] } },
      });
      await db.moderationReview.deleteMany({ where: { affairId: affair.id } });
      if (proposalId) await db.affairUpdateProposal.delete({ where: { id: proposalId } });
      await db.importRun.delete({ where: { id: importRun.id } });
    }
  });

  it("réactive à la publication un suivi inactif à date HUMAN sans toucher la date", async () => {
    const suffix = crypto.randomUUID();
    const humanDate = new Date(parisDay(new Date()).getTime() + 30 * DAY_MS);
    const affair = await createAffair(suffix, "MISE_EN_EXAMEN", "DRAFT");
    await db.affairMonitoring.create({
      data: {
        affairId: affair.id,
        active: false,
        nextReviewAt: humanDate,
        dueReason: "MANUEL",
        dateOrigin: "HUMAN",
        statusAtSchedule: "MISE_EN_EXAMEN",
      },
    });

    await assertPublishable(affair.id, { verifiedBy: "test" });

    const monitoring = await db.affairMonitoring.findUniqueOrThrow({
      where: { affairId: affair.id },
    });
    expect(monitoring.active).toBe(true);
    expect(monitoring.nextReviewAt).toEqual(humanDate);
    expect(monitoring.dateOrigin).toBe("HUMAN");
    expect(monitoring.version).toBe(1);
  });

  it("rattrape au balayage les écritures hors des quatre portes", async () => {
    const now = new Date();
    const unmonitored = await createAffair(crypto.randomUUID(), "INSTRUCTION", "PUBLISHED");

    const statusChanged = await createAffair(crypto.randomUUID(), "INSTRUCTION", "PUBLISHED");
    await expect(reconcileAffairMonitoring(db, statusChanged.id, now)).resolves.toBe("create");
    await db.affair.update({
      where: { id: statusChanged.id },
      data: { status: "PROCES_EN_COURS" },
    });

    const unpublished = await createAffair(crypto.randomUUID(), "INSTRUCTION", "PUBLISHED");
    await expect(reconcileAffairMonitoring(db, unpublished.id, now)).resolves.toBe("create");
    await db.affair.update({ where: { id: unpublished.id }, data: { publicationStatus: "DRAFT" } });

    await expect(reconcileAllAffairMonitoring(now)).resolves.toEqual({
      created: 1,
      updated: 1,
      deactivated: 1,
    });

    const rows = await db.affairMonitoring.findMany({
      where: { affairId: { in: [unmonitored.id, statusChanged.id, unpublished.id] } },
      select: { affairId: true, active: true, statusAtSchedule: true, nextReviewAt: true },
    });
    const byAffair = new Map(rows.map((row) => [row.affairId, row]));
    expect(byAffair.get(unmonitored.id)?.active).toBe(true);
    expect(byAffair.get(statusChanged.id)?.statusAtSchedule).toBe("PROCES_EN_COURS");
    expect(byAffair.get(statusChanged.id)?.nextReviewAt).toEqual(addMonthsUtc(parisDay(now), 1));
    expect(byAffair.get(unpublished.id)?.active).toBe(false);

    await expect(reconcileAllAffairMonitoring(now)).resolves.toEqual({
      created: 0,
      updated: 0,
      deactivated: 0,
    });
  });
});
