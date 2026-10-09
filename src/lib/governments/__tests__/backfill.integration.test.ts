import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import type { BackfillRow } from "../backfill";

let db: typeof import("@/lib/db").db;
let planBackfill: typeof import("../backfill").planBackfill;
let applyBackfill: typeof import("../backfill").applyBackfill;

it("garde le test PostgreSQL derrière le garde de base jetable", () => {
  expect(describeIfDisposableDb).toBeDefined();
});

describeIfDisposableDb("backfill des gouvernements", () => {
  const politicianIds: string[] = [];
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

  async function person(suffix: string) {
    const p = await db.politician.create({
      data: {
        slug: `test-gouv-backfill-${suffix}`,
        firstName: "Test",
        lastName: suffix,
        fullName: `Test ${suffix}`,
      },
    });
    politicianIds.push(p.id);
    return p.id;
  }

  async function fn(
    politicianId: string,
    type: "PREMIER_MINISTRE" | "MINISTRE",
    label: string,
    start: string,
    end: string | null
  ) {
    const mandate = await db.mandate.create({
      data: {
        politicianId,
        type,
        title: type === "PREMIER_MINISTRE" ? "Premier ministre" : "Ministre de test",
        institution: "Gouvernement",
        startDate: d(start),
        endDate: end ? d(end) : null,
        isCurrent: end === null,
        governmentData: { create: { governmentName: label } },
      },
      include: { governmentData: true },
    });
    return mandate.governmentData!.id;
  }

  async function fetchRows(): Promise<BackfillRow[]> {
    const memberships = await db.mandateGovernment.findMany({
      where: { mandate: { politicianId: { in: politicianIds } } },
      select: {
        id: true,
        mandateId: true,
        governmentName: true,
        mandate: { select: { politicianId: true, type: true, startDate: true, endDate: true } },
      },
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      mandateId: m.mandateId,
      politicianId: m.mandate.politicianId,
      governmentName: m.governmentName,
      type: m.mandate.type,
      startDate: m.mandate.startDate,
      endDate: m.mandate.endDate,
    }));
  }

  const ids: Record<string, string> = {};

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ planBackfill, applyBackfill } = await import("../backfill"));

    const castexPm = await person("castex-pm");
    const castexMin = await person("castex-min");
    const vallsPm = await person("valls-pm");
    const vallsMin = await person("valls-min");
    const unknown = await person("inconnu");
    const lecornuPm = await person("lecornu-pm");
    const lecornuMin = await person("lecornu-min");

    ids.castexPm = await fn(
      castexPm,
      "PREMIER_MINISTRE",
      "Gouvernement Jean Castex",
      "2020-07-03",
      "2022-05-16"
    );
    ids.castexMin = await fn(castexMin, "MINISTRE", "Gouvernement Jean Castex", "2020-07-06", null);
    ids.vallsPm = await fn(
      vallsPm,
      "PREMIER_MINISTRE",
      "Gouvernement Manuel Valls",
      "2014-03-31",
      "2014-06-02"
    );
    ids.vallsMin = await fn(
      vallsMin,
      "MINISTRE",
      "Gouvernement Manuel Valls n°1",
      "2014-04-02",
      "2014-06-02"
    );
    ids.unknown = await fn(
      unknown,
      "MINISTRE",
      "Gouvernement Test Inconnu",
      "2000-01-01",
      "2001-01-01"
    );
    ids.lecornuPm1 = await fn(
      lecornuPm,
      "PREMIER_MINISTRE",
      "Gouvernement Sébastien Lecornu",
      "2025-09-09",
      "2025-10-09"
    );
    ids.lecornuPm2 = await fn(
      lecornuPm,
      "PREMIER_MINISTRE",
      "Gouvernement Sébastien Lecornu",
      "2025-10-10",
      null
    );
    ids.lecornuMin = await fn(
      lecornuMin,
      "MINISTRE",
      "Gouvernement Sébastien Lecornu",
      "2025-10-12",
      null
    );
  });

  afterAll(async () => {
    // Les fonctions retiennent les gouvernements (Restrict) : les supprimer d'abord.
    await db.mandate.deleteMany({ where: { politicianId: { in: politicianIds } } });
    await db.government.deleteMany({ where: { primeMinisterId: { in: politicianIds } } });
    await db.politician.deleteMany({ where: { id: { in: politicianIds } } });
    await db.$disconnect();
  });

  const counts = async () => ({
    governments: await db.government.count({ where: { primeMinisterId: { in: politicianIds } } }),
    linked: await db.mandateGovernment.count({ where: { governmentId: { not: null } } }),
  });

  it("planBackfill est déterministe et laisse inconnu et Lecornu non résolus", async () => {
    const rows = await fetchRows();
    const a = planBackfill(rows);
    expect(planBackfill([...rows].reverse())).toEqual(a);
    expect(a.governments.map((g) => g.slug)).toEqual([
      "valls-1",
      "castex",
      "lecornu-1",
      "lecornu-2",
    ]);
    const unknown = a.unresolved.find((u) => u.kind === "unknown-label");
    expect(unknown?.membershipIds).toEqual([ids.unknown]);
    const split = a.unresolved.find((u) => u.kind === "split-manual");
    expect([...(split?.membershipIds ?? [])].sort()).toEqual(
      [ids.lecornuPm1, ids.lecornuPm2, ids.lecornuMin].sort()
    );
  });

  it("le dry-run (apply non appelé) ne change aucun comptage", async () => {
    const before = await counts();
    planBackfill(await fetchRows());
    expect(await counts()).toEqual(before);
    expect(before.governments).toBe(0);
  });

  it("applyBackfill crée et rattache, une seconde passe ne modifie aucune ligne", async () => {
    const plan = planBackfill(await fetchRows());
    const first = await applyBackfill(plan, db);
    expect(first.governments.created).toBe(4);
    expect(first.memberships.updated).toBe(4);

    const castex = await db.government.findUniqueOrThrow({ where: { slug: "castex" } });
    expect(castex.primeMinisterAppointedAt).toEqual(d("2020-07-03"));
    expect(castex.primeMinisterAppointedEvidence).toBe("DERIVED");
    expect(castex.formedAt).toEqual(d("2020-07-03"));
    expect(castex.endedAt).toBeNull(); // une fonction sans fin
    expect(castex.completeness).toBe("PARTIAL");
    expect(castex.publicationStatus).toBe("DRAFT");

    const valls = await db.government.findUniqueOrThrow({ where: { slug: "valls-1" } });
    expect(valls.endedAt).toEqual(d("2014-06-02"));
    expect(valls.endedEvidence).toBe("DERIVED");

    const l1 = await db.government.findUniqueOrThrow({ where: { slug: "lecornu-1" } });
    const l2 = await db.government.findUniqueOrThrow({ where: { slug: "lecornu-2" } });
    expect(l1.endedAt).toEqual(d("2025-10-09"));
    expect(l2.formedAt).toEqual(d("2025-10-10"));
    expect(l2.endedAt).toBeNull();

    const open = await db.mandateGovernment.findUniqueOrThrow({ where: { id: ids.castexMin } });
    expect(open.governmentId).toBe(castex.id);
    expect(open.startEvidence).toBe("DATASET");
    expect(open.endEvidence).toBeNull();
    const closed = await db.mandateGovernment.findUniqueOrThrow({ where: { id: ids.castexPm } });
    expect(closed.endEvidence).toBe("DATASET");

    for (const key of ["unknown", "lecornuPm1", "lecornuPm2", "lecornuMin"]) {
      const m = await db.mandateGovernment.findUniqueOrThrow({ where: { id: ids[key] } });
      expect(m.governmentId).toBeNull();
    }

    const stamps = async () =>
      (
        await db.mandateGovernment.findMany({
          where: { id: { in: Object.values(ids) } },
          orderBy: { id: "asc" },
        })
      )
        .map((m) => m.updatedAt.getTime())
        .concat(
          (await db.government.findMany({ orderBy: { slug: "asc" } })).map((g) =>
            g.updatedAt.getTime()
          )
        );
    const beforeStamps = await stamps();

    const second = await applyBackfill(planBackfill(await fetchRows()), db);
    expect(second.governments).toEqual({ created: 0, updated: 0, unchanged: 4 });
    expect(second.memberships.updated).toBe(0);
    expect(await stamps()).toEqual(beforeStamps);
  });

  it("n'écrase pas une date saisie avec une preuve ACT", async () => {
    await db.government.update({
      where: { slug: "castex" },
      data: { formedAt: d("2020-07-06"), formedEvidence: "ACT" },
    });
    const second = await applyBackfill(planBackfill(await fetchRows()), db);
    expect(second.governments.updated).toBe(0);
    const castex = await db.government.findUniqueOrThrow({ where: { slug: "castex" } });
    expect(castex.formedAt).toEqual(d("2020-07-06"));
  });
});
