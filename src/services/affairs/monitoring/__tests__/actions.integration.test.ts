import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import type { AffairStatus, PublicationStatus } from "@/generated/prisma";
import { addMonthsUtc, parisDay } from "@/lib/affairs/monitoring/cadence";

let db: typeof import("@/lib/db").db;
let markReviewedNoChange: typeof import("../actions").markReviewedNoChange;
let deferReview: typeof import("../actions").deferReview;

const DAY_MS = 24 * 60 * 60 * 1000;

it("garde le test PostgreSQL derrière le garde de base jetable", () => {
  expect(describeIfDisposableDb).toBeDefined();
});

describeIfDisposableDb("actions humaines du suivi des affaires", () => {
  const politicianIds: string[] = [];

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ markReviewedNoChange, deferReview } = await import("../actions"));
  });

  afterAll(async () => {
    await db.politician.deleteMany({ where: { id: { in: politicianIds } } });
    await db.$disconnect();
  });

  async function createAffair(
    status: AffairStatus,
    publicationStatus: PublicationStatus = "PUBLISHED"
  ) {
    const suffix = crypto.randomUUID();
    const politician = await db.politician.create({
      data: {
        slug: `test-actions-${suffix}`,
        firstName: "Test",
        lastName: "Actions",
        fullName: "Test Actions",
      },
    });
    politicianIds.push(politician.id);
    return db.affair.create({
      data: {
        politicianId: politician.id,
        slug: `test-affaire-actions-${suffix}`,
        title: "Affaire de test des actions",
        description: "Donnée de test jetable.",
        status,
        category: "FAVORITISME",
        involvement: "DIRECT",
        publicationStatus,
      },
    });
  }

  function createMonitoring(
    affairId: string,
    status: AffairStatus,
    extra: Partial<{
      dueReason: "CADENCE" | "DELAI_RECOURS";
      flaggedReason: "SIGNAL" | "GARDE_FOU";
      consecutiveAutoDeferrals: number;
    }> = {}
  ) {
    return db.affairMonitoring.create({
      data: {
        affairId,
        nextReviewAt: parisDay(new Date(Date.now() - DAY_MS)),
        dueReason: extra.dueReason ?? "CADENCE",
        dateOrigin: "CADENCE",
        statusAtSchedule: status,
        flaggedReason: extra.flaggedReason,
        consecutiveAutoDeferrals: extra.consecutiveAutoDeferrals ?? 0,
      },
    });
  }

  it("dédoublonne deux revues avec la même clé : un check, version +1 une fois", async () => {
    const affair = await createAffair("PROCES_EN_COURS");
    await createMonitoring(affair.id, "PROCES_EN_COURS");
    const input = { affairId: affair.id, requestKey: crypto.randomUUID(), actorId: "admin" };

    const first = await markReviewedNoChange(input);
    const second = await markReviewedNoChange(input);

    expect(first).toEqual({ ok: true, deduped: false });
    expect(second).toEqual({ ok: true, deduped: true });
    const m = await db.affairMonitoring.findUniqueOrThrow({
      where: { affairId: affair.id },
      include: { checks: true },
    });
    expect(m.checks).toHaveLength(1);
    expect(m.checks[0]).toMatchObject({ actor: "HUMAN", actorId: "admin", outcome: "NO_CHANGE" });
    expect(m.version).toBe(1);
    expect(m.nextReviewAt.getTime()).toBeGreaterThan(parisDay(new Date()).getTime());
  });

  it("efface le signal et remet le compteur à zéro", async () => {
    const affair = await createAffair("PROCES_EN_COURS");
    await createMonitoring(affair.id, "PROCES_EN_COURS", {
      flaggedReason: "SIGNAL",
      consecutiveAutoDeferrals: 3,
    });

    await markReviewedNoChange({
      affairId: affair.id,
      requestKey: crypto.randomUUID(),
      actorId: "admin",
    });

    const m = await db.affairMonitoring.findUniqueOrThrow({ where: { affairId: affair.id } });
    expect(m.flaggedReason).toBeNull();
    expect(m.consecutiveAutoDeferrals).toBe(0);
    expect(m.dateOrigin).toBe("CADENCE");
    expect(m.lastCheckedAt).not.toBeNull();
    expect(m.nextReviewAt.getTime()).toBeGreaterThan(parisDay(new Date()).getTime());
  });

  it("désactive le suivi d'un délai de recours sur statut terminal", async () => {
    const affair = await createAffair("RELAXE");
    await createMonitoring(affair.id, "RELAXE", { dueReason: "DELAI_RECOURS" });

    const res = await markReviewedNoChange({
      affairId: affair.id,
      requestKey: crypto.randomUUID(),
      actorId: "admin",
    });

    expect(res).toEqual({ ok: true, deduped: false });
    const m = await db.affairMonitoring.findUniqueOrThrow({
      where: { affairId: affair.id },
      include: { checks: true },
    });
    expect(m.active).toBe(false);
    expect(m.checks[0]?.nextReviewAtAfter).toBeNull();
  });

  it("refuse la revue sans suivi et sur affaire inconnue", async () => {
    const affair = await createAffair("PROCES_EN_COURS");
    expect(
      await markReviewedNoChange({
        affairId: affair.id,
        requestKey: crypto.randomUUID(),
        actorId: "admin",
      })
    ).toEqual({ ok: false, reason: "no_monitoring" });
    expect(
      await markReviewedNoChange({
        affairId: "inconnue",
        requestKey: crypto.randomUUID(),
        actorId: "admin",
      })
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("refuse un report à la date du jour, sans aucune écriture", async () => {
    const affair = await createAffair("PROCES_EN_COURS");
    await createMonitoring(affair.id, "PROCES_EN_COURS");

    const res = await deferReview({
      affairId: affair.id,
      requestKey: crypto.randomUUID(),
      actorId: "admin",
      nextReviewAt: parisDay(new Date()),
      dueReason: "MANUEL",
    });

    expect(res).toEqual({ ok: false, reason: "date_not_future" });
    const m = await db.affairMonitoring.findUniqueOrThrow({
      where: { affairId: affair.id },
      include: { checks: true },
    });
    expect(m.checks).toHaveLength(0);
    expect(m.version).toBe(0);
  });

  it("crée le suivi inactif d'un brouillon reporté (cas délibéré à J+56)", async () => {
    const affair = await createAffair("PROCES_EN_COURS", "DRAFT");
    const target = new Date(parisDay(new Date()).getTime() + 56 * DAY_MS);

    const res = await deferReview({
      affairId: affair.id,
      requestKey: crypto.randomUUID(),
      actorId: "admin",
      nextReviewAt: target,
      dueReason: "DELIBERE",
      dueNote: "Délibéré annoncé",
    });

    expect(res).toEqual({ ok: true, deduped: false });
    const m = await db.affairMonitoring.findUniqueOrThrow({
      where: { affairId: affair.id },
      include: { checks: true },
    });
    expect(m.active).toBe(false);
    expect(m.dateOrigin).toBe("HUMAN");
    expect(m.dueReason).toBe("DELIBERE");
    expect(m.dueNote).toBe("Délibéré annoncé");
    expect(m.nextReviewAt).toEqual(target);
    expect(m.statusAtSchedule).toBe("PROCES_EN_COURS");
    expect(m.checks).toHaveLength(1);
    expect(m.checks[0]?.nextReviewAtAfter).toEqual(target);
    expect(m.checks[0]).toMatchObject({ outcome: "DEFERRED", note: "Délibéré annoncé" });
  });

  it("reporte un suivi existant et dédoublonne la même clé", async () => {
    const affair = await createAffair("PROCES_EN_COURS");
    await createMonitoring(affair.id, "PROCES_EN_COURS", {
      flaggedReason: "GARDE_FOU",
      consecutiveAutoDeferrals: 2,
    });
    const target = addMonthsUtc(parisDay(new Date()), 3);
    const input = {
      affairId: affair.id,
      requestKey: crypto.randomUUID(),
      actorId: "admin",
      nextReviewAt: target,
      dueReason: "AUDIENCE" as const,
    };

    expect(await deferReview(input)).toEqual({ ok: true, deduped: false });
    expect(await deferReview(input)).toEqual({ ok: true, deduped: true });

    const m = await db.affairMonitoring.findUniqueOrThrow({
      where: { affairId: affair.id },
      include: { checks: true },
    });
    expect(m.checks).toHaveLength(1);
    expect(m.version).toBe(1);
    expect(m.flaggedReason).toBeNull();
    expect(m.consecutiveAutoDeferrals).toBe(0);
    expect(m.dateOrigin).toBe("HUMAN");
    expect(m.nextReviewAt).toEqual(target);
    expect(m.checks[0]).toMatchObject({ outcome: "DEFERRED", note: null });
  });

  it("refuse une clé déjà utilisée sur une autre affaire, sans rien écrire", async () => {
    const a = await createAffair("PROCES_EN_COURS");
    const b = await createAffair("PROCES_EN_COURS");
    await createMonitoring(a.id, "PROCES_EN_COURS");
    await createMonitoring(b.id, "PROCES_EN_COURS");
    const requestKey = crypto.randomUUID();

    expect(await markReviewedNoChange({ affairId: a.id, requestKey, actorId: "admin" })).toEqual({
      ok: true,
      deduped: false,
    });
    const res = await markReviewedNoChange({ affairId: b.id, requestKey, actorId: "admin" });

    expect(res).toEqual({ ok: false, reason: "key_conflict" });
    const m = await db.affairMonitoring.findUniqueOrThrow({
      where: { affairId: b.id },
      include: { checks: true },
    });
    expect(m.checks).toHaveLength(0);
    expect(m.version).toBe(0);
    expect(m.lastCheckedAt).toBeNull();
  });

  it("réactive un suivi désactivé quand un humain reporte la revue", async () => {
    const affair = await createAffair("RELAXE");
    await db.affairMonitoring.create({
      data: {
        affairId: affair.id,
        active: false,
        nextReviewAt: parisDay(new Date(Date.now() - DAY_MS)),
        dueReason: "DELAI_RECOURS",
        dateOrigin: "CADENCE",
        statusAtSchedule: "RELAXE",
      },
    });
    const target = new Date(parisDay(new Date()).getTime() + 30 * DAY_MS);

    const res = await deferReview({
      affairId: affair.id,
      requestKey: crypto.randomUUID(),
      actorId: "admin",
      nextReviewAt: target,
      dueReason: "AUDIENCE",
    });

    expect(res).toEqual({ ok: true, deduped: false });
    const m = await db.affairMonitoring.findUniqueOrThrow({ where: { affairId: affair.id } });
    expect(m.active).toBe(true);
    expect(m.dateOrigin).toBe("HUMAN");
    expect(m.nextReviewAt).toEqual(target);
  });
});
