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
 * subject-page gate exactly, because it summarizes the same subject pages: Charlie's
 * DRAFT-extension candidacy carries a published measure that must surface in the field but
 * never in `verifiedMeasureCount` (I7).
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

    it("ne compte pas la mesure de Charlie, dont l'extension CandidacyPresidential est DRAFT (I7)", async () => {
      // The measure genuinely exists and is PUBLISHED: this is not a fixture that forgot to
      // create it, it is one whose owning candidacy never clears the extension gate.
      const charlieMeasure = await db.measure.findFirst({
        where: { election: { slug: SLUG }, candidacy: { candidateName: "Charlie Fixture" } },
        select: { publicationStatus: true },
      });
      expect(charlieMeasure?.publicationStatus).toBe("PUBLISHED");

      // Alpha and Bravo each defend one measure; Charlie's is unreachable from any subject
      // page, so the context reports 2, never 3.
      const context = await loadHubMeasureContext(electionId, SLUG);
      expect(context.verifiedMeasureCount).toBe(2);
    });

    it("rend null pour une élection inconnue (getHubMeasureContext, avant la frontière cache)", async () => {
      const context = await getHubMeasureContext("inconnue");
      expect(context).toBeNull();
    });

    it("remonte round2Date, dateConfirmed et electionDescription", async () => {
      const round2Date = new Date("2027-04-25T00:00:00Z");
      await db.election.update({
        where: { id: electionId },
        data: {
          round2Date,
          dateConfirmed: true,
          description: "Élection de test (hub) pour le second tour.",
        },
      });

      const context = await loadHubMeasureContext(electionId, SLUG);

      expect(context.round2Date).toEqual(round2Date);
      expect(context.dateConfirmed).toBe(true);
      expect(context.electionDescription).toBe("Élection de test (hub) pour le second tour.");
    });
  });
});
