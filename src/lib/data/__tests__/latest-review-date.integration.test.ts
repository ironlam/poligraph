import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import type { ThemeCategory } from "@/generated/prisma";

// Deferred: both `../measures` and the transitions module import `@/lib/db` as a value, which
// throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let getLatestPublicReviewDate: typeof import("../measures").getLatestPublicReviewDate;
let transitions: typeof import("@/lib/measures/transitions");

const SLUG = "lrd-test";

/**
 * getLatestPublicReviewDate answers hub stat 4.3 ("when was the most recent public measure
 * reviewed"). It reuses PUBLIC_MEASURE_WHERE rather than a hand-rolled predicate, so what is
 * worth testing here is the aggregation on top of it: the result is a real max (not "the
 * first row found"), the theme filter narrows it, an election with nothing public answers
 * null, and a measure whose publishedRevision carries a LATER reviewedAt than any public one
 * still stays invisible once publicationStatus has moved away from PUBLISHED.
 */
describeIfDisposableDb("getLatestPublicReviewDate", () => {
  let mainElectionId: string;
  let emptyElectionId: string;
  let depubElectionId: string;
  let logementReviewedAt: { l1: Date; l2: Date };
  let transportsReviewedAt: Date;
  let depubPublicReviewedAt: Date;
  let depubHiddenReviewedAt: Date;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ getLatestPublicReviewDate } = await import("../measures"));
    transitions = await import("@/lib/measures/transitions");

    async function politician(name: string): Promise<string> {
      const slug = `${SLUG}-${name}`;
      const row = await db.politician.create({
        data: { slug, firstName: name, lastName: "Test", fullName: `${name} Test` },
      });
      return row.id;
    }

    /** Creates, reviews and publishes a measure, then returns its id and revision's real reviewedAt. */
    async function publish(
      politicianId: string,
      electionId: string,
      theme: ThemeCategory,
      text: string
    ): Promise<{ measureId: string; reviewedAt: Date }> {
      const seeded = await transitions.createMeasure({
        politicianId,
        electionId,
        candidacyId: null,
        programEditionId: null,
        attribution: "PERSONAL",
        theme,
        precedingMeasureId: null,
        revision: {
          text,
          precision: "OBJECTIF_SANS_CHIFFRE",
          validFrom: new Date("2027-01-01T00:00:00Z"),
          extractionMethod: "MANUAL",
          extractionConfidence: null,
          extractorVersion: null,
        },
        sources: [
          {
            sourceKind: "DISCOURS_CAMPAGNE",
            tier: "PRIMARY",
            url: "https://example.org/meeting",
            page: null,
            publishedAt: new Date("2027-01-01T00:00:00Z"),
          },
        ],
      });
      await transitions.reviewMeasureRevision({ ...seeded, reviewedBy: "relecteur" });
      await transitions.publishMeasureRevision(seeded);
      const revision = await db.measureRevision.findUniqueOrThrow({
        where: { id: seeded.revisionId },
        select: { reviewedAt: true },
      });
      if (!revision.reviewedAt) throw new Error("La révision publiée devrait porter reviewedAt");
      return { measureId: seeded.measureId, reviewedAt: revision.reviewedAt };
    }

    // --- Main election: two published LOGEMENT_URBANISME measures, one published TRANSPORTS
    // measure, and one never-reviewed draft. SANTE is never touched here, on purpose, so it
    // stays the theme with zero public measures.
    const mainElection = await db.election.create({
      data: { slug: SLUG, type: "PRESIDENTIELLE", scope: "NATIONAL", title: "Élection test" },
    });
    mainElectionId = mainElection.id;

    const l1 = await politician("l1");
    const l1Published = await publish(
      l1,
      mainElectionId,
      "LOGEMENT_URBANISME",
      "Encadrer les loyers dans les zones tendues."
    );
    const l2 = await politician("l2");
    const l2Published = await publish(
      l2,
      mainElectionId,
      "LOGEMENT_URBANISME",
      "Construire 500 000 logements sociaux."
    );
    logementReviewedAt = { l1: l1Published.reviewedAt, l2: l2Published.reviewedAt };

    // A draft that is never reviewed nor published: it must not be able to surface, and
    // PUBLIC_MEASURE_WHERE excludes it via publishedRevisionId alone before reviewedAt or
    // ordering even come into play.
    const draftPolitician = await politician("draft");
    await transitions.createMeasure({
      politicianId: draftPolitician,
      electionId: mainElectionId,
      candidacyId: null,
      programEditionId: null,
      attribution: "PERSONAL",
      theme: "LOGEMENT_URBANISME",
      precedingMeasureId: null,
      revision: {
        text: "Brouillon jamais relu.",
        precision: null,
        validFrom: new Date("2027-01-05T00:00:00Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "ARTICLE_PRESSE",
          tier: "SECONDARY",
          url: "https://example.org/article",
          page: null,
          publishedAt: new Date("2027-01-05T00:00:00Z"),
        },
      ],
    });

    const t1 = await politician("t1");
    transportsReviewedAt = (
      await publish(t1, mainElectionId, "TRANSPORTS", "Rendre gratuits les transports scolaires.")
    ).reviewedAt;

    // --- Empty election: no measure at all.
    const emptyElection = await db.election.create({
      data: {
        slug: `${SLUG}-vide`,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Élection vide",
      },
    });
    emptyElectionId = emptyElection.id;

    // --- Depublication election: one public measure, and one measure published then
    // depublished with a STRICTLY LATER reviewedAt. depublishMeasure() never touches
    // publishedRevisionId, publishedAt, supersededAt or reviewedAt: only publicationStatus
    // moves away from PUBLISHED, so the later date really does stay on the row, and only the
    // publicationStatus condition of PUBLIC_MEASURE_WHERE is what keeps it out.
    const depubElection = await db.election.create({
      data: {
        slug: `${SLUG}-depub`,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Élection dépublication",
      },
    });
    depubElectionId = depubElection.id;

    const p1 = await politician("p1");
    const p1Published = await publish(
      p1,
      depubElectionId,
      "LOGEMENT_URBANISME",
      "Mesure publique de référence."
    );
    depubPublicReviewedAt = p1Published.reviewedAt;

    const p2 = await politician("p2");
    const p2Published = await publish(
      p2,
      depubElectionId,
      "LOGEMENT_URBANISME",
      "Mesure dépubliée après relecture."
    );
    depubHiddenReviewedAt = p2Published.reviewedAt;
    await transitions.depublishMeasure({
      measureId: p2Published.measureId,
      reason: "Vérification en cours, pour le test.",
    });
  });

  afterAll(async () => {
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.$disconnect();
  });

  it("renvoie le max des reviewedAt sur les mesures publiques d'un thème, ignore le brouillon jamais relu", async () => {
    const expected = Math.max(logementReviewedAt.l1.getTime(), logementReviewedAt.l2.getTime());
    const result = await getLatestPublicReviewDate(mainElectionId, "LOGEMENT_URBANISME");
    expect(result).not.toBeNull();
    expect(result?.getTime()).toBe(expected);
  });

  it("agrège tous les thèmes de l'élection quand aucun thème n'est demandé", async () => {
    const expected = Math.max(
      logementReviewedAt.l1.getTime(),
      logementReviewedAt.l2.getTime(),
      transportsReviewedAt.getTime()
    );
    const result = await getLatestPublicReviewDate(mainElectionId);
    expect(result?.getTime()).toBe(expected);
  });

  it("filtre par thème : renvoie la date de la mesure publique de ce thème", async () => {
    const result = await getLatestPublicReviewDate(mainElectionId, "TRANSPORTS");
    expect(result?.getTime()).toBe(transportsReviewedAt.getTime());
  });

  it("filtre par thème : renvoie null si aucune mesure publique n'existe sur ce thème", async () => {
    expect(await getLatestPublicReviewDate(mainElectionId, "SANTE")).toBeNull();
  });

  it("renvoie null sur une élection sans mesure publiée", async () => {
    expect(await getLatestPublicReviewDate(emptyElectionId)).toBeNull();
  });

  it("ignore une mesure dépubliée même si sa révision a été relue plus récemment que la mesure publique", async () => {
    // Guard: if this stops holding, the scenario no longer bites and the assertion below
    // would pass for the wrong reason (there would be nothing later to wrongly ignore).
    expect(depubHiddenReviewedAt.getTime()).toBeGreaterThan(depubPublicReviewedAt.getTime());

    const result = await getLatestPublicReviewDate(depubElectionId, "LOGEMENT_URBANISME");
    expect(result?.getTime()).toBe(depubPublicReviewedAt.getTime());
  });
});
