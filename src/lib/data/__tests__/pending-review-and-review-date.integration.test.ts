import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ThemeCategory } from "@/generated/prisma";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value, which throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let transitions: typeof import("@/lib/measures/transitions");
let loadSubjectPageData: typeof import("../subject-page").loadSubjectPageData;
let loadHubMeasureContext: typeof import("../hub").loadHubMeasureContext;

const SLUG = "pending-review-test";
const THEME: ThemeCategory = "LOGEMENT_URBANISME";

/**
 * Two invariants of the lot 4-5 debt, on the same fixture because they share it.
 *
 * `pendingReviewRevisionCount` must describe the ACTIVE REVISION, not the measure's publication
 * status: a published measure carrying an unreviewed correction is awaiting review, and a draft
 * whose revision was already reviewed is not.
 *
 * `lastReviewedAt` on the hub must come from the population the subject pages can render. A
 * measure behind a DRAFT extension, or attached to no candidacy, is unreachable there and must not
 * move the date the hub displays next to a count derived from that same population.
 */
describeIfDisposableDb("pendingReviewRevisionCount et lastReviewedAt", () => {
  let electionId: string;
  let publicCandidacyId: string;
  let publicPoliticianId: string;
  let draftCandidacyId: string;
  let draftPoliticianId: string;

  async function seedMeasure(
    politicianId: string,
    candidacyId: string | null,
    text: string,
    theme: ThemeCategory = THEME
  ) {
    return transitions.createMeasure({
      politicianId,
      electionId,
      candidacyId,
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
  }

  async function reviewAndPublish(seed: { measureId: string; revisionId: string }) {
    await transitions.reviewMeasureRevision({ ...seed, reviewedBy: "relecteur" });
    await transitions.publishMeasureRevision(seed);
  }

  async function newDraftOn(measureId: string, text: string) {
    return transitions.draftMeasureRevision({
      measureId,
      revision: {
        text,
        precision: "OBJECTIF_SANS_CHIFFRE",
        validFrom: new Date("2027-02-01T00:00:00Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "DISCOURS_CAMPAGNE",
          tier: "PRIMARY",
          url: "https://example.org/correction",
          page: null,
          publishedAt: new Date("2027-02-01T00:00:00Z"),
        },
      ],
    });
  }

  async function candidacy(name: string, extension: "PUBLISHED" | "DRAFT") {
    const pol = await db.politician.create({
      data: {
        slug: `${SLUG}-${name.toLowerCase()}`,
        firstName: name,
        lastName: "Fixture",
        fullName: `${name} Fixture`,
        source: "MANUAL",
      },
      select: { id: true },
    });
    const cand = await db.candidacy.create({
      data: {
        electionId,
        politicianId: pol.id,
        candidateName: `${name} Fixture`,
        status: "DECLARE",
        sourceUrl: "https://example.org/source",
        sourceLabel: "Source",
      },
      select: { id: true },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: cand.id, publicationStatus: extension },
    });
    return { politicianId: pol.id, candidacyId: cand.id };
  }

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    transitions = await import("@/lib/measures/transitions");
    ({ loadSubjectPageData } = await import("../subject-page"));
    ({ loadHubMeasureContext } = await import("../hub"));

    const election = await db.election.create({
      data: {
        slug: SLUG,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Élection de test (relecture)",
      },
      select: { id: true },
    });
    electionId = election.id;

    ({ politicianId: publicPoliticianId, candidacyId: publicCandidacyId } = await candidacy(
      "Publique",
      "PUBLISHED"
    ));
    ({ politicianId: draftPoliticianId, candidacyId: draftCandidacyId } = await candidacy(
      "Brouillon",
      "DRAFT"
    ));
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.$disconnect();
  });

  describe("pendingReviewRevisionCount", () => {
    async function pending(): Promise<number> {
      const data = await loadSubjectPageData(electionId, SLUG, THEME);
      return data.pendingReviewRevisionCount;
    }

    it("compte une mesure publiée dont la nouvelle révision n'est pas relue", async () => {
      // Le cas que l'ancien prédicat manquait entièrement : la mesure reste PUBLISHED, donc
      // publicationStatus vaut PUBLISHED, et pourtant une correction attend bien une relecture.
      const avant = await pending();
      const seed = await seedMeasure(publicPoliticianId, publicCandidacyId, "Encadrer les loyers.");
      await reviewAndPublish(seed);
      expect(await pending()).toBe(avant); // relue et publiée : rien en attente

      await newDraftOn(seed.measureId, "Encadrer les loyers dans les zones tendues.");
      expect(await pending()).toBe(avant + 1);

      await db.measure.delete({ where: { id: seed.measureId } });
    });

    it("ne compte pas une mesure dépubliée dont la révision est relue", async () => {
      const avant = await pending();
      const seed = await seedMeasure(publicPoliticianId, publicCandidacyId, "Mesure dépubliée.");
      await reviewAndPublish(seed);
      await transitions.depublishMeasure({ measureId: seed.measureId, reason: "Erreur de source" });

      expect(await pending()).toBe(avant);

      await db.measure.delete({ where: { id: seed.measureId } });
    });

    it("ne compte pas une mesure dépubliée même quand sa révision active n'est pas relue", async () => {
      // C'est ce cas qui justifie de garder `depublishedAt: null` à côté du prédicat de révision :
      // le seul prédicat de révision ferait rentrer cette mesure, retirée pour cause.
      const avant = await pending();
      const seed = await seedMeasure(publicPoliticianId, publicCandidacyId, "Mesure retirée.");
      await reviewAndPublish(seed);
      await transitions.depublishMeasure({ measureId: seed.measureId, reason: "Motif juridique" });
      await newDraftOn(seed.measureId, "Reformulation non relue.");

      expect(await pending()).toBe(avant);

      await db.measure.delete({ where: { id: seed.measureId } });
    });

    it("ne compte pas une révision abandonnée", async () => {
      const avant = await pending();
      const seed = await seedMeasure(publicPoliticianId, publicCandidacyId, "Brouillon abandonné.");
      expect(await pending()).toBe(avant + 1); // brouillon actif, non relu

      await transitions.discardMeasureRevision(seed);
      expect(await pending()).toBe(avant);

      await db.measure.delete({ where: { id: seed.measureId } });
    });

    it("ne compte pas une révision remplacée par une révision relue", async () => {
      const avant = await pending();
      const seed = await seedMeasure(publicPoliticianId, publicCandidacyId, "Première version.");
      await reviewAndPublish(seed);

      const suivante = await newDraftOn(seed.measureId, "Seconde version.");
      await reviewAndPublish({ measureId: seed.measureId, revisionId: suivante.revisionId });

      // La première révision porte désormais supersededAt, mais ce n'est plus la révision active :
      // la mesure ne doit pas être comptée pour autant.
      const premiere = await db.measureRevision.findUniqueOrThrow({
        where: { id: seed.revisionId },
        select: { supersededAt: true },
      });
      expect(premiere.supersededAt).not.toBeNull();
      expect(await pending()).toBe(avant);

      await db.measure.delete({ where: { id: seed.measureId } });
    });
  });

  describe("lastReviewedAt du hub", () => {
    it("ignore une mesure publique plus récente portée par une extension DRAFT", async () => {
      const ancienne = await seedMeasure(
        publicPoliticianId,
        publicCandidacyId,
        "Mesure de la candidature publiée."
      );
      await reviewAndPublish(ancienne);
      const reference = (await loadHubMeasureContext(electionId, SLUG)).lastReviewedAt;
      expect(reference).not.toBeNull();

      // Relue APRÈS, donc elle gagnerait sur la date si la population n'était pas filtrée.
      const cachee = await seedMeasure(
        draftPoliticianId,
        draftCandidacyId,
        "Mesure derrière une extension DRAFT."
      );
      await reviewAndPublish(cachee);

      const apres = await loadHubMeasureContext(electionId, SLUG);
      expect(apres.lastReviewedAt).toEqual(reference);

      await db.measure.deleteMany({
        where: { id: { in: [ancienne.measureId, cachee.measureId] } },
      });
    });

    it("ignore une mesure publique plus récente rattachée à aucune candidature", async () => {
      const ancienne = await seedMeasure(
        publicPoliticianId,
        publicCandidacyId,
        "Mesure rattachée à une candidature."
      );
      await reviewAndPublish(ancienne);
      const reference = (await loadHubMeasureContext(electionId, SLUG)).lastReviewedAt;

      const orpheline = await seedMeasure(publicPoliticianId, null, "Mesure sans candidature.");
      await reviewAndPublish(orpheline);

      const apres = await loadHubMeasureContext(electionId, SLUG);
      expect(apres.lastReviewedAt).toEqual(reference);

      await db.measure.deleteMany({
        where: { id: { in: [ancienne.measureId, orpheline.measureId] } },
      });
    });
  });
});
