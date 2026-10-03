// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let resolveProfileTargets: typeof import("../request").resolveProfileTargets;

const PREFIX = "profile-snapshot-request";

async function cleanup() {
  await db.scrutin.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
  await db.legislativeDossier.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
  await db.politician.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

describeIfDisposableDb("ciblage des fiches par scrutin et par dossier", () => {
  const ids: Record<"a" | "b" | "c", string> = { a: "", b: "", c: "" };
  let s1 = "";
  let s2 = "";
  let s3 = "";
  let dossierId = "";

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ resolveProfileTargets } = await import("../request"));
    await cleanup();

    for (const key of ["a", "b", "c"] as const) {
      const p = await db.politician.create({
        data: {
          slug: `${PREFIX}-${key}`,
          firstName: "Prénom",
          lastName: `Fictif ${key}`,
          fullName: `Prénom Fictif ${key}`,
        },
      });
      ids[key] = p.id;
    }
    const scrutin = (n: number) =>
      db.scrutin.create({
        data: {
          externalId: `${PREFIX}-${n}`,
          title: `Scrutin fictif ${n}`,
          votingDate: new Date("2026-01-01T00:00:00.000Z"),
          legislature: 17,
          votesFor: 1,
          votesAgainst: 1,
          votesAbstain: 0,
          result: "ADOPTED",
        },
      });
    s1 = (await scrutin(1)).id;
    s2 = (await scrutin(2)).id;
    s3 = (await scrutin(3)).id;
    const vote = (scrutinId: string, politicianId: string) => ({
      scrutinId,
      politicianId,
      position: "POUR" as const,
      votingDate: new Date("2026-01-01T00:00:00.000Z"),
      chamber: "AN" as const,
    });
    await db.vote.createMany({
      data: [vote(s1, ids.a), vote(s1, ids.b), vote(s2, ids.b), vote(s3, ids.c)],
    });

    const dossier = await db.legislativeDossier.create({
      data: { externalId: `${PREFIX}-d`, title: "Dossier fictif", status: "DEPOSE" },
    });
    dossierId = dossier.id;
    await db.dossierAuthor.createMany({
      data: [
        { dossierId, politicianId: ids.a, role: "AUTEUR" },
        { dossierId, politicianId: ids.a, role: "RAPPORTEUR" },
        { dossierId, politicianId: ids.c, role: "AUTEUR" },
      ],
    });
  });

  afterAll(async () => {
    if (db) await cleanup();
  });

  it("rend chaque votant des scrutins une seule fois, et seulement eux", async () => {
    const out = await resolveProfileTargets({ scrutinIds: [s1, s2] });
    expect(out.sort()).toEqual([ids.a, ids.b].sort());
  });

  it("rend les auteurs du dossier une seule fois, quel que soit leur rôle", async () => {
    const out = await resolveProfileTargets({ dossierId });
    expect(out.sort()).toEqual([ids.a, ids.c].sort());
  });
});
