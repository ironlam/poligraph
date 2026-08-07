import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value, which throws at load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let loadFeaturedElection: typeof import("../elections").loadFeaturedElection;

const PREFIX = "featured-test";

/**
 * `Election.featured` is the single authority for the homepage banner (spec §4.1). Two things have
 * to hold and neither is enforced by the schema: an election whose last round is long past must
 * stop being featured, and two rows at `featured: true` must resolve deterministically rather than
 * letting findFirst arbitrate.
 */
describeIfDisposableDb("loadFeaturedElection", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ loadFeaturedElection } = await import("../elections"));
    // Order independence: the disposable DB is shared across test files, and this suite asserts on
    // WHICH election is featured, including a case that expects none. Any leftover featured row
    // from another fixture would make those assertions depend on file order.
    await db.election.updateMany({ where: { featured: true }, data: { featured: false } });
  });

  afterEach(async () => {
    await db.candidacy.deleteMany({ where: { election: { slug: { startsWith: PREFIX } } } });
    await db.election.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function election(options: {
    suffix: string;
    round1: Date;
    round2: Date | null;
    featured: boolean;
  }) {
    return db.election.create({
      data: {
        slug: `${PREFIX}-${options.suffix}`,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: `Élection de test ${options.suffix}`,
        round1Date: options.round1,
        round2Date: options.round2,
        featured: options.featured,
      },
    });
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const daysAhead = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  it("retourne une élection à venir", async () => {
    await election({
      suffix: "soon",
      round1: daysAhead(100),
      round2: daysAhead(114),
      featured: true,
    });
    const found = await loadFeaturedElection();
    expect(found?.slug).toBe(`${PREFIX}-soon`);
  });

  it("retourne encore une élection dont le second tour est passé de 10 jours", async () => {
    await election({ suffix: "recent", round1: daysAgo(24), round2: daysAgo(10), featured: true });
    const found = await loadFeaturedElection();
    expect(found?.slug).toBe(`${PREFIX}-recent`);
  });

  it("ne retourne plus une élection dont le second tour est passé de 40 jours", async () => {
    await election({ suffix: "old", round1: daysAgo(54), round2: daysAgo(40), featured: true });
    expect(await loadFeaturedElection()).toBeNull();
  });

  it("mesure la fenêtre sur round1Date quand il n'y a pas de second tour", async () => {
    await election({ suffix: "single", round1: daysAgo(40), round2: null, featured: true });
    expect(await loadFeaturedElection()).toBeNull();
  });

  it("départage deux élections à la une sur l'échéance la plus proche", async () => {
    await election({ suffix: "b-far", round1: daysAhead(300), round2: null, featured: true });
    await election({ suffix: "a-near", round1: daysAhead(30), round2: null, featured: true });
    const found = await loadFeaturedElection();
    expect(found?.slug).toBe(`${PREFIX}-a-near`);
  });

  it("compte les candidatures sourcées, pas toutes les candidatures", async () => {
    const e = await election({
      suffix: "counts",
      round1: daysAhead(100),
      round2: daysAhead(114),
      featured: true,
    });
    await db.candidacy.create({
      data: {
        electionId: e.id,
        candidateName: "Sourcée",
        status: "DECLARE",
        sourceUrl: "https://example.org/a",
        sourceLabel: "Source A",
      },
    });
    await db.candidacy.create({
      data: { electionId: e.id, candidateName: "Sans statut ni source" },
    });
    await db.candidacy.create({
      data: {
        electionId: e.id,
        candidateName: "Source incomplète",
        status: "DECLARE",
        sourceUrl: "https://example.org/b",
      },
    });
    const found = await loadFeaturedElection();
    expect(found?.sourcedCandidacyCount).toBe(1);
  });

  it("expose round2Date et dateConfirmed, que le bandeau exigeait sans les recevoir", async () => {
    await election({
      suffix: "fields",
      round1: daysAhead(100),
      round2: daysAhead(114),
      featured: true,
    });
    const found = await loadFeaturedElection();
    expect(found?.round2Date).not.toBeNull();
    expect(found?.dateConfirmed).toBe(false);
  });

  it("porte les scores du premier tour des qualifiés quand ils existent", async () => {
    const e = await election({
      suffix: "scores",
      round1: daysAgo(5),
      round2: daysAhead(9),
      featured: true,
    });
    await db.candidacy.create({
      data: {
        electionId: e.id,
        candidateName: "Qualifiée A",
        status: "DECLARE",
        sourceUrl: "https://example.org/a",
        sourceLabel: "Source A",
        round1Pct: "27.40",
        round1Qualified: true,
      },
    });
    await db.candidacy.create({
      data: {
        electionId: e.id,
        candidateName: "Éliminé B",
        status: "DECLARE",
        sourceUrl: "https://example.org/b",
        sourceLabel: "Source B",
        round1Pct: "9.10",
        round1Qualified: false,
      },
    });
    const found = await loadFeaturedElection();
    expect(found?.round1Scores.map((s) => s.candidateName)).toEqual(["Qualifiée A"]);
    expect(found?.round1Scores[0]?.pct).toBeCloseTo(27.4, 2);
  });
});
