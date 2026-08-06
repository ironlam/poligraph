import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: both `@/lib/db` and `../page` throw at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let generateStaticParams: typeof import("../page").generateStaticParams;

describeIfDisposableDb("elections/[slug] generateStaticParams", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ generateStaticParams } = await import("../page"));
    await db.election.create({
      data: {
        slug: "presidentielle-2027",
        type: "PRESIDENTIELLE",
        title: "Présidentielle 2027",
        scope: "NATIONAL",
      },
    });
    await db.election.create({
      data: {
        slug: "sp-test-legislatives",
        type: "LEGISLATIVES",
        title: "Législatives (test)",
        scope: "NATIONAL",
      },
    });
  });

  afterAll(async () => {
    await db.election.deleteMany({
      where: { slug: { in: ["presidentielle-2027", "sp-test-legislatives"] } },
    });
    await db.$disconnect();
  });

  it("excludes presidentielle-2027, keeps other non-municipal elections", async () => {
    const slugs = (await generateStaticParams()).map((p) => p.slug);
    expect(slugs).toContain("sp-test-legislatives");
    expect(slugs).not.toContain("presidentielle-2027");
  });
});
