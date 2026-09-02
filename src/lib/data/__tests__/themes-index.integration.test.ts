import { afterAll, beforeAll, expect, it } from "vitest";
import type { ThemeCategory } from "@/generated/prisma";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value, which throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let loadThemesIndex: typeof import("../themes-index").loadThemesIndex;
let loadSubjectPageData: typeof import("@/lib/data/subject-page").loadSubjectPageData;

const SLUG = "themes-index-test";
const THEME_LOGEMENT: ThemeCategory = "LOGEMENT_URBANISME";

/**
 * The whole point of this authority is that it counts publiability on the SAME population as
 * the real subject page: candidacies whose `CandidacyPresidential` extension is PUBLISHED. A
 * measure on a DRAFT-extension candidacy (Charlie) must inflate neither the documented count
 * nor the gate, or `themes-index` would advertise a page as open while the page itself renders
 * a closed state.
 */
describeIfDisposableDb("loadThemesIndex", () => {
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ loadThemesIndex } = await import("../themes-index"));
    ({ loadSubjectPageData } = await import("@/lib/data/subject-page"));
    const { seedThemesIndexFixture } = await import("./themes-index-fixture");
    electionId = await seedThemesIndexFixture(db, { electionSlug: SLUG });
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.$disconnect();
  });

  it("compte la population de porte sur LOGEMENT_URBANISME : Alpha et Bravo, jamais Charlie (extension DRAFT)", async () => {
    const data = await loadThemesIndex(electionId, SLUG);
    const logement = data.themes.find((t) => t.theme === THEME_LOGEMENT);

    expect(logement?.candidaciesWithVerifiedMeasure).toBe(2);
    expect(logement?.publishable).toBe(true);
    // Alpha defended + Alpha withdrawn + Bravo defended = 3. Charlie's measure is excluded
    // because its candidacy is not in the public population.
    expect(logement?.documentedMeasureCount).toBe(3);
    expect(logement?.currentlyDefendedMeasureCount).toBe(2);
    expect(logement?.documentedCandidacyCount).toBe(2);
    expect(logement?.lastReviewedAt).toBeInstanceOf(Date);
  });

  it("est en parité avec loadSubjectPageData sur chaque thème", async () => {
    const data = await loadThemesIndex(electionId, SLUG);

    for (const entry of data.themes) {
      const subjectPage = await loadSubjectPageData(electionId, SLUG, entry.theme);
      expect(entry.publishable).toBe(subjectPage.publishable);
      expect(entry.candidaciesWithVerifiedMeasure).toBe(subjectPage.candidaciesWithVerifiedMeasure);
    }
  });

  it("compte une seule page sujet publiable (LOGEMENT_URBANISME)", async () => {
    const data = await loadThemesIndex(electionId, SLUG);
    expect(data.publishableSubjectPageCount).toBe(1);
  });
});
