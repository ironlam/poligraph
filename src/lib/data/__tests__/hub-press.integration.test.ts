import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value, which throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let loadHubPress: typeof import("../hub-press").loadHubPress;

const SLUG = "hub-press-test";
const NOW = new Date("2027-02-01T12:00:00Z");

/**
 * Reuses the hub fixture: Alpha and Bravo are running, Charlie is ENVISAGE, Echo's politician is
 * DRAFT. Articles are added on top to exercise each gate of the press block.
 */
describeIfDisposableDb("hub-press", () => {
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ loadHubPress } = await import("../hub-press"));
    const { seedHubFixture } = await import("./hub-fixture");
    electionId = await seedHubFixture(db, { electionSlug: SLUG });

    const politician = (name: string) =>
      db.politician.findUniqueOrThrow({ where: { slug: `${SLUG}-${name}` } });
    const alpha = await politician("alpha");
    const bravo = await politician("bravo");

    async function seedArticle(
      key: string,
      data: { feedSource: string; isAffairRelated: boolean | null; publishedAt: Date },
      politicianIds: string[]
    ) {
      await db.pressArticle.create({
        data: {
          feedSource: data.feedSource,
          externalId: `${SLUG}-${key}`,
          title: `Article ${key}`,
          url: `https://example.org/${SLUG}/${key}`,
          publishedAt: data.publishedAt,
          isAffairRelated: data.isAffairRelated,
          mentions: { create: politicianIds.map((politicianId) => ({ politicianId })) },
        },
      });
    }

    const recent = new Date("2027-01-30T08:00:00Z");
    await seedArticle(
      "alpha-1",
      {
        feedSource: "lemonde",
        isAffairRelated: false,
        publishedAt: new Date("2027-01-31T08:00:00Z"),
      },
      [alpha.id]
    );
    await seedArticle(
      "alpha-2",
      { feedSource: "mediapart", isAffairRelated: false, publishedAt: recent },
      [alpha.id]
    );
    await seedArticle(
      "bravo-1",
      {
        feedSource: "liberation",
        isAffairRelated: false,
        publishedAt: new Date("2027-01-29T08:00:00Z"),
      },
      [bravo.id]
    );
    await seedArticle(
      "aggregator",
      { feedSource: "googlenews", isAffairRelated: false, publishedAt: recent },
      [bravo.id]
    );
    await seedArticle(
      "affair",
      { feedSource: "lemonde", isAffairRelated: true, publishedAt: recent },
      [bravo.id]
    );
    await seedArticle(
      "unanalysed",
      { feedSource: "lemonde", isAffairRelated: null, publishedAt: recent },
      [bravo.id]
    );
    await seedArticle(
      "old",
      {
        feedSource: "lemonde",
        isAffairRelated: false,
        publishedAt: new Date("2026-11-01T08:00:00Z"),
      },
      [bravo.id]
    );
  });

  afterAll(async () => {
    await db.pressArticle.deleteMany({ where: { externalId: { startsWith: SLUG } } });
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.party.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.measureSubtopic.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.$disconnect();
  });

  it("garde un article par nouveau candidat, du plus récent au plus ancien", async () => {
    const press = await loadHubPress(electionId, NOW);
    expect(press.map((a) => a.title)).toEqual(["Article alpha-1", "Article bravo-1"]);
    expect(press[0]).toMatchObject({ outlet: "Le Monde" });
  });

  it("écarte agrégateur, article judiciaire, article non analysé et article hors fenêtre", async () => {
    const titles = (await loadHubPress(electionId, NOW)).map((a) => a.title);
    for (const excluded of ["aggregator", "affair", "unanalysed", "old"]) {
      expect(titles).not.toContain(`Article ${excluded}`);
    }
  });
});
