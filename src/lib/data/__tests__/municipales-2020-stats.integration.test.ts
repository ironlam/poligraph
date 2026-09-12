import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value.
let db: typeof import("@/lib/db").db;
let getMunicipales2020Stats: typeof import("../elections").getMunicipales2020Stats;

/**
 * The 2020 headline counters, on the shape production actually has: several candidacies per
 * commune, and rows with no commune at all. `totalCommunes` counts distinct communes, not rows,
 * and ignores the null ones.
 */
describeIfDisposableDb("statistiques municipales 2020", () => {
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ getMunicipales2020Stats } = await import("../elections"));

    const election = await db.election.create({
      data: {
        slug: "municipales-2020",
        type: "MUNICIPALES",
        scope: "MUNICIPAL",
        title: "Municipales 2020",
      },
    });
    electionId = election.id;

    await db.commune.createMany({
      data: [
        { id: "01004", name: "Ambérieu", departmentCode: "01", departmentName: "Ain" },
        { id: "01005", name: "Ambronay", departmentCode: "01", departmentName: "Ain" },
      ],
      skipDuplicates: true,
    });

    await db.candidacy.createMany({
      data: [
        { electionId, candidateName: "A", communeId: "01004", listName: "L1" },
        { electionId, candidateName: "B", communeId: "01004", listName: "L1" },
        { electionId, candidateName: "C", communeId: "01004", listName: "L2" },
        { electionId, candidateName: "D", communeId: "01005", listName: "L3" },
        { electionId, candidateName: "E", communeId: null, listName: null },
      ],
    });
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.election.delete({ where: { id: electionId } });
    await db.commune.deleteMany({ where: { id: { in: ["01004", "01005"] } } });
    await db.$disconnect();
  });

  it("compte les communes distinctes, pas les lignes", async () => {
    const stats = await getMunicipales2020Stats();
    expect(stats).not.toBeNull();
    expect(stats!.totalCandidacies).toBe(5);
    expect(stats!.totalCommunes).toBe(2);
  });
});
