import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value, which throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let getHubCandidacyField: typeof import("../hub").getHubCandidacyField;
let getHubMeasureContext: typeof import("../hub").getHubMeasureContext;
let loadHubMeasureContext: typeof import("../hub").loadHubMeasureContext;

const SLUG = "hub-test";

/**
 * The hub field is the whole race (every sourced candidacy, pressenti/envisagé included),
 * never routed through `getPublicPresidentialCandidates` — that population is the published
 * fiches, and it would empty the hub at launch. The measure context, by contrast, mirrors the
 * subject-page gate exactly, because it summarizes the same subject pages.
 */
describeIfDisposableDb("hub", () => {
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ getHubCandidacyField, getHubMeasureContext, loadHubMeasureContext } =
      await import("../hub"));
    const { seedHubFixture } = await import("./hub-fixture");
    electionId = await seedHubFixture(db, { electionSlug: SLUG });
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.$disconnect();
  });

  describe("getHubCandidacyField", () => {
    it("rend les candidatures sourcées triées par nom, pressenties sans extension comprises, source incomplète exclue", async () => {
      const field = await getHubCandidacyField(SLUG);

      expect(field.map((c) => c.candidateName)).toEqual([
        "Alpha Fixture",
        "Bravo Fixture",
        "Charlie Fixture",
      ]);
      expect(field.some((c) => c.candidateName === "Delta Fixture")).toBe(false);

      const charlie = field.find((c) => c.candidateName === "Charlie Fixture");
      expect(charlie?.status).toBe("ENVISAGE");
      expect(charlie?.sourceUrl).toBe("https://example.org/rumeur");
      expect(charlie?.sourceLabel).toBe("Presse");
    });
  });

  describe("getHubMeasureContext / loadHubMeasureContext", () => {
    it("est publiable, compte les mesures défendues et porte la date de dernière revue", async () => {
      // Le corps non caché, exactement comme loadThemesIndex/loadSubjectPageData : la frontière
      // "use cache" de getHubMeasureContext lève hors d'un contexte Next.
      const context = await loadHubMeasureContext(electionId, SLUG);

      expect(context.hubPublishable).toBe(true);
      expect(context.publishableSubjectPageCount).toBeGreaterThanOrEqual(1);
      expect(context.verifiedMeasureCount).toBe(2);
      expect(context.lastReviewedAt).not.toBeNull();
    });

    it("rend null pour une élection inconnue (getHubMeasureContext, avant la frontière cache)", async () => {
      const context = await getHubMeasureContext("inconnue");
      expect(context).toBeNull();
    });
  });
});
