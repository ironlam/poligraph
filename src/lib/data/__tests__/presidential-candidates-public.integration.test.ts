import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred so the file skips cleanly without the container: @/lib/db throws at module load when
// DATABASE_URL is unset, and describe.skip does not undo a static import.
let db: typeof import("@/lib/db").db;
let getPublicPresidentialCandidates: typeof import("@/lib/data/presidential-candidates-public").getPublicPresidentialCandidates;

const SLUG = "presidentielle-test-cand-public";

/**
 * The sensitive invariant of this authority: a candidacy whose presidential extension is missing or
 * DRAFT never surfaces publicly. The test builds the violation (a DRAFT candidacy and one with no
 * extension both exist alongside a published one) and asserts only the published one comes back.
 */
describeIfDisposableDb("autorité de lecture publique des candidatures présidentielles", () => {
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ getPublicPresidentialCandidates } =
      await import("@/lib/data/presidential-candidates-public"));

    const election = await db.election.create({
      data: {
        slug: SLUG,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Test candidatures publiques",
      },
    });
    electionId = election.id;

    const polPub = await db.politician.create({
      data: { slug: `${SLUG}-a`, firstName: "Alix", lastName: "Publiee", fullName: "Alix Publiee" },
    });
    const polDraft = await db.politician.create({
      data: { slug: `${SLUG}-b`, firstName: "Bo", lastName: "Brouillon", fullName: "Bo Brouillon" },
    });
    const polNoExt = await db.politician.create({
      data: { slug: `${SLUG}-c`, firstName: "Cam", lastName: "Sansext", fullName: "Cam Sansext" },
    });

    const candPub = await db.candidacy.create({
      data: {
        electionId,
        politicianId: polPub.id,
        candidateName: "Alix Publiee",
        status: "DECLARE",
        sourceUrl: "https://example.org/a",
        sourceLabel: "Source A",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candPub.id, publicationStatus: "PUBLISHED", slogan: "Slogan A" },
    });

    const candDraft = await db.candidacy.create({
      data: {
        electionId,
        politicianId: polDraft.id,
        candidateName: "Bo Brouillon",
        status: "DECLARE",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candDraft.id, publicationStatus: "DRAFT" },
    });

    // Une candidature sans extension éditoriale du tout : elle ne doit jamais sortir non plus.
    await db.candidacy.create({
      data: {
        electionId,
        politicianId: polNoExt.id,
        candidateName: "Cam Sansext",
        status: "DECLARE",
      },
    });
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.$disconnect();
  });

  it("ne renvoie que les candidatures dont l'extension est PUBLISHED", async () => {
    const result = await getPublicPresidentialCandidates(SLUG);
    expect(result.map((c) => c.candidateName)).toEqual(["Alix Publiee"]);
  });

  it("expose slogan et source, jamais un brouillon ni une candidature sans extension", async () => {
    const result = await getPublicPresidentialCandidates(SLUG);
    expect(result).toHaveLength(1);
    expect(result[0]?.slogan).toBe("Slogan A");
    expect(result[0]?.sourceLabel).toBe("Source A");
    expect(result[0]?.status).toBe("DECLARE");
  });
});
