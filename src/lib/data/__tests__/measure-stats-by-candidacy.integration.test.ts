import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let getPublicMeasureStatsByCandidacy: typeof import("../measures").getPublicMeasureStatsByCandidacy;
let getPublicMeasureRollupsByElection: typeof import("../measures").getPublicMeasureRollupsByElection;
let getMeasureReadinessByCandidacies: typeof import("../measures").getMeasureReadinessByCandidacies;

const SLUG = "stats-by-candidacy";

/**
 * These counters feed a PUBLICATION GATE (`isFicheCandidatPublishable`), so the two ways they could
 * be wrong both open a public surface that nothing justifies:
 *
 * - counting a measure carried by a DRAFT-extension candidacy, which no public page renders;
 * - counting a PRIMARY source that belongs to an unpublished draft revision rather than to the
 *   revision the public actually sees.
 */
describeIfDisposableDb("getPublicMeasureStatsByCandidacy", () => {
  let publishedCandidacyId: string;
  let draftExtensionCandidacyId: string;
  let secondarySourceCandidacyId: string;
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({
      getPublicMeasureStatsByCandidacy,
      getPublicMeasureRollupsByElection,
      getMeasureReadinessByCandidacies,
    } = await import("../measures"));
    const { createMeasure, reviewMeasureRevision, publishMeasureRevision, draftMeasureRevision } =
      await import("@/lib/measures/transitions");

    const election = await db.election.create({
      data: {
        slug: SLUG,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Élection de test (compteurs)",
      },
    });
    electionId = election.id;

    async function candidacy(name: string, publicationStatus: "PUBLISHED" | "DRAFT") {
      const pol = await db.politician.create({
        data: {
          slug: `${SLUG}-${name}`,
          firstName: name,
          lastName: "Fixture",
          fullName: `${name} Fixture`,
        },
      });
      const c = await db.candidacy.create({
        data: {
          electionId: election.id,
          politicianId: pol.id,
          candidateName: `${name} Fixture`,
          status: "DECLARE",
          sourceUrl: "https://example.org/source",
          sourceLabel: "Source",
        },
      });
      await db.candidacyPresidential.create({
        data: { candidacyId: c.id, publicationStatus },
      });
      return { candidacyId: c.id, politicianId: pol.id };
    }

    async function publishOne(options: {
      candidacyId: string;
      politicianId: string;
      theme: "LOGEMENT_URBANISME" | "SANTE";
      tier: "PRIMARY" | "SECONDARY";
      text: string;
    }) {
      const { measureId, revisionId } = await createMeasure({
        politicianId: options.politicianId,
        electionId: election.id,
        candidacyId: options.candidacyId,
        programEditionId: null,
        attribution: "PERSONAL",
        theme: options.theme,
        precedingMeasureId: null,
        revision: {
          text: `Mesure de test ${options.text}`,
          precision: null,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          extractionMethod: "MANUAL",
          extractionConfidence: null,
          extractorVersion: null,
        },
        sources: [
          {
            sourceKind: "PROGRAMME_PARTI",
            tier: options.tier,
            url: `https://example.org/${options.text}`,
            page: null,
            publishedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      });
      await reviewMeasureRevision({ measureId, revisionId, reviewedBy: "test" });
      await publishMeasureRevision({ measureId, revisionId });
      return measureId;
    }

    const published = await candidacy("published", "PUBLISHED");
    publishedCandidacyId = published.candidacyId;
    await publishOne({ ...published, theme: "LOGEMENT_URBANISME", tier: "PRIMARY", text: "a" });
    await publishOne({ ...published, theme: "SANTE", tier: "SECONDARY", text: "b" });

    const draftExt = await candidacy("draft-ext", "DRAFT");
    draftExtensionCandidacyId = draftExt.candidacyId;
    await publishOne({ ...draftExt, theme: "LOGEMENT_URBANISME", tier: "PRIMARY", text: "c" });

    // The revision trap: published revision carries a SECONDARY source, an unpublished draft
    // carries a PRIMARY one.
    const secondary = await candidacy("secondary", "PUBLISHED");
    secondarySourceCandidacyId = secondary.candidacyId;
    const measureId = await publishOne({
      ...secondary,
      theme: "LOGEMENT_URBANISME",
      tier: "SECONDARY",
      text: "d",
    });
    await draftMeasureRevision({
      measureId,
      revision: {
        text: "Version brouillon avec une source primaire",
        precision: null,
        validFrom: new Date("2026-02-01T00:00:00.000Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "PROGRAMME_PARTI",
          tier: "PRIMARY",
          url: "https://example.org/draft-primary",
          page: null,
          publishedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    await db.measure.deleteMany({ where: { electionId } });
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.$disconnect();
  });

  it("compte les mesures publiées et les sujets couverts", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
    expect(stats.measureCount).toBe(2);
    expect(stats.themesCoveredCount).toBe(2);
  });

  it("agrège le même corpus public pour toute l'élection", async () => {
    const rollups = await getPublicMeasureRollupsByElection(electionId);
    const publishedStats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
    const secondaryStats = await getPublicMeasureStatsByCandidacy(secondarySourceCandidacyId);

    expect(rollups.get(publishedCandidacyId)).toEqual({
      measureCount: publishedStats.measureCount,
      themesCoveredCount: publishedStats.themesCoveredCount,
    });
    expect(rollups.get(secondarySourceCandidacyId)).toEqual({
      measureCount: secondaryStats.measureCount,
      themesCoveredCount: secondaryStats.themesCoveredCount,
    });
    expect(rollups.has(draftExtensionCandidacyId)).toBe(false);
  });

  it("ignore les mesures retirées dans les deux lectures publiques", async () => {
    const measure = await db.measure.findFirstOrThrow({
      where: { candidacyId: publishedCandidacyId },
      select: { id: true },
    });
    await db.measure.update({ where: { id: measure.id }, data: { withdrawnAt: new Date() } });

    try {
      const rollups = await getPublicMeasureRollupsByElection(electionId);
      const stats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
      expect(rollups.get(publishedCandidacyId)).toEqual({
        measureCount: stats.measureCount,
        themesCoveredCount: stats.themesCoveredCount,
      });
    } finally {
      await db.measure.update({ where: { id: measure.id }, data: { withdrawnAt: null } });
    }
  });

  it("compte une seule mesure à source primaire quand l'autre est secondaire", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
    expect(stats.primarySourceMeasureCount).toBe(1);
  });

  it("rend une date de dernière revue", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
    expect(stats.lastReviewedAt).toBeInstanceOf(Date);
  });

  // Sert à dater le programme lui-même, pas la dernière retouche : c'est ce qui permet de savoir
  // si une synthèse écrite tel jour l'a été sur une candidature encore vide.
  it("rend la date de publication de la plus ancienne mesure visible", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
    expect(stats.firstPublishedAt).toBeInstanceOf(Date);

    const publications = await db.measureRevision.findMany({
      where: { publishedOf: { candidacyId: publishedCandidacyId } },
      select: { publishedAt: true },
    });
    const earliest = Math.min(...publications.map((r) => r.publishedAt!.getTime()));
    expect(stats.firstPublishedAt!.getTime()).toBe(earliest);
  });

  it("ne compte rien pour une candidature à extension DRAFT", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(draftExtensionCandidacyId);
    expect(stats.measureCount).toBe(0);
    expect(stats.primarySourceMeasureCount).toBe(0);
    expect(stats.lastReviewedAt).toBeNull();
    expect(stats.firstPublishedAt).toBeNull();
  });

  it("ignore une source primaire portée par un brouillon non publié", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(secondarySourceCandidacyId);
    expect(stats.measureCount).toBe(1);
    expect(stats.primarySourceMeasureCount).toBe(0);
  });

  // La lecture d'administration répond à l'autre question : ce que la publication de l'extension
  // rendrait visible. C'est le cas Guedj, 26 mesures relues, publiées et sourcées, comptées zéro
  // par les surfaces publiques parce que l'extension est restée en brouillon.
  it("compte pour l'admin les mesures qu'une extension DRAFT retient", async () => {
    const readiness = await getMeasureReadinessByCandidacies([draftExtensionCandidacyId]);

    expect(readiness.get(draftExtensionCandidacyId)).toMatchObject({
      measureCount: 1,
      themesCoveredCount: 1,
      primarySourceMeasureCount: 1,
    });
    // Datée alors même que la lecture publique compte zéro : c'est ce qui permet à l'écran d'admin
    // de dire si la synthèse survivra à la publication de l'extension.
    expect(readiness.get(draftExtensionCandidacyId)?.firstPublishedAt).toBeInstanceOf(Date);
  });

  it("agrège plusieurs candidatures en une lecture", async () => {
    const readiness = await getMeasureReadinessByCandidacies([
      publishedCandidacyId,
      draftExtensionCandidacyId,
      secondarySourceCandidacyId,
    ]);

    expect(readiness.get(publishedCandidacyId)).toMatchObject({
      measureCount: 2,
      themesCoveredCount: 2,
      primarySourceMeasureCount: 1,
    });
    // Même piège de révision que la lecture publique : la source primaire du brouillon ne compte pas.
    expect(readiness.get(secondarySourceCandidacyId)).toMatchObject({
      measureCount: 1,
      themesCoveredCount: 1,
      primarySourceMeasureCount: 0,
    });
  });

  it("ne lance aucune requête sans candidature", async () => {
    const readiness = await getMeasureReadinessByCandidacies([]);
    expect(readiness.size).toBe(0);
  });
});
