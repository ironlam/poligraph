import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value, which throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let getHubCandidacyField: typeof import("../hub").getHubCandidacyField;
let getHubMeasureContext: typeof import("../hub").getHubMeasureContext;
let loadHubMeasureContext: typeof import("../hub").loadHubMeasureContext;

const SLUG = "hub-test";

/**
 * The hub field is the public race (every sourced candidacy attached to a PUBLISHED politician,
 * pressenti/envisagé included),
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
    await db.party.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.measureSubtopic.deleteMany({ where: { slug: { startsWith: SLUG } } });
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
      expect(field.some((c) => c.candidateName === "Echo Fixture")).toBe(false);

      const charlie = field.find((c) => c.candidateName === "Charlie Fixture");
      expect(charlie?.status).toBe("ENVISAGE");
      expect(charlie?.sourceUrl).toBe("https://example.org/rumeur");
      expect(charlie?.sourceLabel).toBe("Presse");
    });

    it("associe le logo au nom réel du parti quand partyLabel est absent", async () => {
      const charlie = (await getHubCandidacyField(SLUG)).find(
        (c) => c.candidateName === "Charlie Fixture"
      );

      expect(charlie?.partyLabel).toBe(`PF-${SLUG}`);
      expect(charlie?.partyLogoUrl).toBe("https://example.org/logo-parti-fixture.svg");
    });

    it("n'attribue pas à une candidature une édition appartenant seulement à son parti", async () => {
      const charlie = (await getHubCandidacyField(SLUG)).find(
        (c) => c.candidateName === "Charlie Fixture"
      );

      expect(charlie?.measureCount).toBe(0);
      expect(charlie?.programmeAbsence).toBe("aucun_programme");
    });

    it("trie sur le NOM DE FAMILLE, pas sur le prénom", async () => {
      // Les trois candidatures de la fixture partagent le nom « Fixture », donc leur ordre est le
      // même quel que soit le critère : elles ne peuvent pas attraper une régression de tri. Ces
      // deux-ci se croisent volontairement, prénom contre nom, et c'est le seul cas qui mord.
      const zoe = await db.politician.create({
        data: {
          slug: `${SLUG}-zoe-abbat`,
          firstName: "Zoé",
          lastName: "Abbat",
          fullName: "Zoé Abbat",
          source: "MANUAL",
          publicationStatus: "PUBLISHED",
        },
        select: { id: true },
      });
      const aaron = await db.politician.create({
        data: {
          slug: `${SLUG}-aaron-zurbain`,
          firstName: "Aaron",
          lastName: "Zurbain",
          fullName: "Aaron Zurbain",
          source: "MANUAL",
          publicationStatus: "PUBLISHED",
        },
        select: { id: true },
      });
      const created = [];
      for (const [politicianId, name] of [
        [zoe.id, "Zoé Abbat"],
        [aaron.id, "Aaron Zurbain"],
      ] as const) {
        const c = await db.candidacy.create({
          data: {
            electionId,
            politicianId,
            candidateName: name,
            status: "DECLARE",
            sourceUrl: "https://example.org/declaration",
            sourceLabel: "Déclaration",
          },
          select: { id: true },
        });
        created.push(c.id);
      }

      try {
        const noms = (await getHubCandidacyField(SLUG)).map((c) => c.candidateName);
        // Par nom : Abbat avant Zurbain. Par prénom, l'ordre serait inversé (Aaron avant Zoé).
        expect(noms.indexOf("Zoé Abbat")).toBeLessThan(noms.indexOf("Aaron Zurbain"));
      } finally {
        await db.candidacy.deleteMany({ where: { id: { in: created } } });
        await db.politician.deleteMany({ where: { id: { in: [zoe.id, aaron.id] } } });
      }
    });

    it("utilise uniquement les accents éditoriaux publiés", async () => {
      const field = await getHubCandidacyField(SLUG);

      expect(field.find((c) => c.candidateName === "Alpha Fixture")?.partyColor).toBe("#123456");
      expect(field.find((c) => c.candidateName === "Charlie Fixture")?.partyColor).toBeNull();
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

    it("porte les treize sujets, sans compteur de mesures et avec leur état d'ouverture", async () => {
      const { THEMES_IN_ORDER } = await import("@/lib/presidentielle/themes");
      const context = await loadHubMeasureContext(electionId, SLUG);

      expect(context.themes.map((t) => t.theme)).toEqual(THEMES_IN_ORDER);
      // Aucun compteur ici : l'index des sujets compte les mesures « documentées » (retraits
      // compris) et l'en-tête du hub les mesures défendues. Deux nombres pour un même sujet.
      const premier = context.themes[0];
      expect(premier).toBeDefined();
      expect(Object.keys(premier ?? {})).toEqual(["theme", "label", "slug", "publishable"]);
      expect(context.themes.filter((t) => t.publishable).length).toBe(
        context.publishableSubjectPageCount
      );
    });

    it("met en avant les sous-thèmes validés selon le nombre de candidatures", async () => {
      const context = await loadHubMeasureContext(electionId, SLUG);

      expect(context.featuredSubtopics).toContainEqual({
        slug: `${SLUG}-acces-logement`,
        label: "Accès au logement",
        theme: "LOGEMENT_URBANISME",
        themeLabel: "Logement et urbanisme",
        measureCount: 2,
        candidacyCount: 2,
      });
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
