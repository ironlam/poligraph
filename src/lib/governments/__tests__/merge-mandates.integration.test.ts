import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let mergeMandates: typeof import("../merge-mandates").mergeMandates;
let resolvePublicId: typeof import("@/lib/public-ids/resolver").resolvePublicId;

it("garde le test PostgreSQL derrière le garde de base jetable", () => {
  expect(describeIfDisposableDb).toBeDefined();
});

describeIfDisposableDb("fusion de mandats", () => {
  const politicianIds: string[] = [];
  const publicIds: string[] = [];
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  let seq = 9_100_000;

  async function person(suffix: string) {
    const p = await db.politician.create({
      data: {
        slug: `test-merge-mandates-${suffix}`,
        firstName: "Test",
        lastName: suffix,
        fullName: `Test ${suffix}`,
      },
    });
    politicianIds.push(p.id);
    return p.id;
  }

  async function mandate(
    politicianId: string,
    opts: { type?: "PREMIER_MINISTRE" | "MINISTRE"; withPublicId?: boolean; label?: string } = {}
  ) {
    const publicId = opts.withPublicId === false ? null : `MA-${++seq}`;
    if (publicId) publicIds.push(publicId);
    const m = await db.mandate.create({
      data: {
        publicId,
        politicianId,
        type: opts.type ?? "PREMIER_MINISTRE",
        title: "Premier ministre",
        institution: "Gouvernement",
        startDate: d("2020-07-03"),
        endDate: d("2022-05-16"),
        isCurrent: false,
        governmentData: { create: { governmentName: opts.label ?? "Gouvernement Test" } },
      },
      include: { governmentData: true },
    });
    // Le client étendu attribue un identifiant à la création : on l'efface pour simuler un mandat sans.
    if (!publicId) await db.mandate.updateMany({ where: { id: m.id }, data: { publicId: null } });
    return { id: m.id, publicId, membershipId: m.governmentData!.id };
  }

  async function counts() {
    const [mandates, memberships, redirects, audits] = await Promise.all([
      db.mandate.count({ where: { politicianId: { in: politicianIds } } }),
      db.mandateGovernment.count({ where: { mandate: { politicianId: { in: politicianIds } } } }),
      db.publicIdRedirect.count({ where: { fromPublicId: { in: publicIds } } }),
      db.auditLog.count({ where: { entityType: "Mandate", action: "MERGE" } }),
    ]);
    return { mandates, memberships, redirects, audits };
  }

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ mergeMandates } = await import("../merge-mandates"));
    ({ resolvePublicId } = await import("@/lib/public-ids/resolver"));
  });

  afterAll(async () => {
    if (!db) return;
    await db.publicIdRedirect.deleteMany({ where: { fromPublicId: { in: publicIds } } });
    const ids = (
      await db.mandate.findMany({
        where: { politicianId: { in: politicianIds } },
        select: { id: true },
      })
    ).map((m) => m.id);
    await db.auditLog.deleteMany({
      where: { entityType: "Mandate", action: "MERGE", entityId: { in: ids } },
    });
    // Les mandats absorbés n'existent plus : on nettoie les journaux par motif de test.
    await db.auditLog.deleteMany({
      where: {
        entityType: "Mandate",
        action: "MERGE",
        changes: { path: ["reason"], string_starts_with: "test-merge" },
      },
    });
    await db.mandateGovernment.updateMany({
      where: { mandate: { politicianId: { in: politicianIds } } },
      data: { predecessorId: null },
    });
    await db.politician.deleteMany({ where: { id: { in: politicianIds } } });
    await db.$disconnect();
  });

  it("écrit la redirection, résout l'ancien identifiant et supprime l'absorbé", async () => {
    const p = await person("nominal");
    const keep = await mandate(p);
    const a1 = await mandate(p);
    const a2 = await mandate(p, { withPublicId: false });

    const res = await mergeMandates(db, keep.id, [a1.id, a2.id], "test-merge nominal");

    expect(res).toEqual({ redirects: 1 });
    const redirect = await db.publicIdRedirect.findUnique({
      where: { fromPublicId: a1.publicId! },
    });
    expect(redirect).toMatchObject({
      toPublicId: keep.publicId,
      entityType: "mandate",
      reason: "merged",
    });
    const resolved = await resolvePublicId(a1.publicId!);
    expect(resolved).toMatchObject({ isRedirect: true, redirectedFrom: a1.publicId });
    expect(resolved?.publicId).toBe(keep.publicId);

    expect(await db.mandate.findMany({ where: { id: { in: [a1.id, a2.id] } } })).toHaveLength(0);
    expect(
      await db.mandateGovernment.findMany({
        where: { id: { in: [a1.membershipId, a2.membershipId] } },
      })
    ).toHaveLength(0);
    const kept = await db.mandate.findUnique({
      where: { id: keep.id },
      include: { governmentData: true },
    });
    expect(kept?.publicId).toBe(keep.publicId);
    expect(kept?.governmentData?.id).toBe(keep.membershipId);
  });

  it("journalise l'état complet de l'absorbé dans AuditLog", async () => {
    const p = await person("audit");
    const keep = await mandate(p);
    const a = await mandate(p, { label: "Gouvernement Audit" });

    await mergeMandates(db, keep.id, [a.id], "test-merge audit");

    const log = await db.auditLog.findFirst({ where: { entityType: "Mandate", entityId: a.id } });
    expect(log?.action).toBe("MERGE");
    const changes = log?.changes as {
      keptMandateId: string;
      keptPublicId: string;
      reason: string;
      absorbed: {
        id: string;
        publicId: string;
        title: string;
        governmentData: { governmentName: string };
      };
    };
    expect(changes.keptMandateId).toBe(keep.id);
    expect(changes.keptPublicId).toBe(keep.publicId);
    expect(changes.reason).toBe("test-merge audit");
    expect(changes.absorbed.id).toBe(a.id);
    expect(changes.absorbed.publicId).toBe(a.publicId);
    expect(changes.absorbed.title).toBe("Premier ministre");
    expect(changes.absorbed.governmentData.governmentName).toBe("Gouvernement Audit");
  });

  it("refuse un mandat d'une autre personne sans rien écrire", async () => {
    const p1 = await person("autre-1");
    const p2 = await person("autre-2");
    const keep = await mandate(p1);
    const other = await mandate(p2);
    const before = await counts();

    await expect(mergeMandates(db, keep.id, [other.id], "test-merge x")).rejects.toThrow();

    expect(await counts()).toEqual(before);
  });

  it("refuse un mandat d'un autre type", async () => {
    const p = await person("type");
    const keep = await mandate(p);
    const other = await mandate(p, { type: "MINISTRE" });
    const before = await counts();

    await expect(mergeMandates(db, keep.id, [other.id], "test-merge x")).rejects.toThrow(/type/);

    expect(await counts()).toEqual(before);
  });

  it("refuse l'identifiant conservé dans la liste des absorbés", async () => {
    const p = await person("keep-in-list");
    const keep = await mandate(p);
    const a = await mandate(p);
    const before = await counts();

    await expect(mergeMandates(db, keep.id, [a.id, keep.id], "test-merge x")).rejects.toThrow();

    expect(await counts()).toEqual(before);
  });

  it("refuse un mandat absorbé inexistant", async () => {
    const p = await person("inexistant");
    const keep = await mandate(p);
    const before = await counts();

    await expect(mergeMandates(db, keep.id, ["nope"], "test-merge x")).rejects.toThrow();

    expect(await counts()).toEqual(before);
  });

  it("refuse un mandat absorbé dont la fonction est le prédécesseur d'une autre", async () => {
    const p = await person("pred");
    const q = await person("pred-succ");
    const keep = await mandate(p);
    const a = await mandate(p);
    const successor = await mandate(q);
    await db.mandateGovernment.update({
      where: { id: successor.membershipId },
      data: { predecessorId: a.membershipId },
    });
    const before = await counts();

    await expect(mergeMandates(db, keep.id, [a.id], "test-merge x")).rejects.toThrow(
      /prédécesseur/
    );

    expect(await counts()).toEqual(before);
    expect(await db.mandate.findUnique({ where: { id: a.id } })).not.toBeNull();
  });

  it("n'écrit rien quand le second absorbé est refusé après un premier valide", async () => {
    const p = await person("milieu");
    const other = await person("milieu-autre");
    const keep = await mandate(p);
    const good = await mandate(p);
    const bad = await mandate(other);
    const before = await counts();

    await expect(
      mergeMandates(db, keep.id, [good.id, bad.id], "test-merge milieu")
    ).rejects.toThrow();

    expect(await counts()).toEqual(before);
    expect(
      await db.publicIdRedirect.findUnique({ where: { fromPublicId: good.publicId! } })
    ).toBeNull();
    expect(await db.mandate.findUnique({ where: { id: good.id } })).not.toBeNull();
  });
});
