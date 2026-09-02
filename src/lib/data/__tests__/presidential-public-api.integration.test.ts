import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let getPublicPresidentialCandidacyField: typeof import("../presidential-candidacy-field").getPublicPresidentialCandidacyField;
let hasPublicTrackedPresidentialCandidacy: typeof import("../presidential-candidacy-field").hasPublicTrackedPresidentialCandidacy;
let listPublicPresidentialMeasures: typeof import("../measures").listPublicPresidentialMeasures;
let transitions: typeof import("@/lib/measures/transitions");

const SLUG = "presidential-public-api-test";

describeIfDisposableDb("autorités publiques de campagne présidentielle", () => {
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ getPublicPresidentialCandidacyField, hasPublicTrackedPresidentialCandidacy } =
      await import("../presidential-candidacy-field"));
    ({ listPublicPresidentialMeasures } = await import("../measures"));
    transitions = await import("@/lib/measures/transitions");
    const { seedHubFixture } = await import("./hub-fixture");
    electionId = await seedHubFixture(db, { electionSlug: SLUG });
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.party.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.$disconnect();
  });

  it("expose le champ sourcé sans exiger une extension présidentielle publiée", async () => {
    const field = await getPublicPresidentialCandidacyField(SLUG);

    expect(field?.election).toEqual(
      expect.objectContaining({ slug: SLUG, type: "PRESIDENTIELLE" })
    );
    expect(field?.candidacies.map((candidate) => candidate.candidateName)).toEqual([
      "Alpha Fixture",
      "Bravo Fixture",
      "Charlie Fixture",
    ]);
    expect(
      field?.candidacies.some((candidate) => candidate.candidateName === "Delta Fixture")
    ).toBe(false);
    expect(field?.candidacies.some((candidate) => candidate.candidateName === "Echo Fixture")).toBe(
      false
    );

    const charlie = field?.candidacies.find(
      (candidate) => candidate.candidateName === "Charlie Fixture"
    );
    expect(charlie).toEqual(
      expect.objectContaining({
        status: "ENVISAGE",
        sourceUrl: "https://example.org/rumeur",
        sourceLabel: "Presse",
        measureCount: 0,
        themesCoveredCount: 0,
        programmeAbsence: "aucun_programme",
      })
    );

    expect(await hasPublicTrackedPresidentialCandidacy(electionId, `${SLUG}-charlie`)).toBe(true);
    const charlieMeasures = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      candidateSlug: `${SLUG}-charlie`,
      page: 1,
      limit: 20,
    });
    expect(charlieMeasures).toEqual({ total: 0, data: [] });
  });

  it("distingue les trois états de programme sans attribuer l'édition du parti", async () => {
    const initial = await getPublicPresidentialCandidacyField(SLUG);
    expect(
      initial?.candidacies.find((candidate) => candidate.candidateName === "Alpha Fixture")
        ?.programmeAbsence
    ).toBeNull();
    expect(
      initial?.candidacies.find((candidate) => candidate.candidateName === "Charlie Fixture")
        ?.programmeAbsence
    ).toBe("aucun_programme");

    const charlie = await db.candidacy.findFirstOrThrow({
      where: { electionId, candidateName: "Charlie Fixture" },
      select: { id: true },
    });
    const edition = await db.programEdition.create({
      data: {
        electionId,
        ownerType: "CANDIDACY",
        candidacyId: charlie.id,
        label: "Programme propre à Charlie",
        version: 1,
        publishedAt: new Date("2027-02-01T00:00:00Z"),
        documentUrl: "https://example.org/programme-charlie",
        publicationStatus: "PUBLISHED",
      },
    });

    try {
      const updated = await getPublicPresidentialCandidacyField(SLUG);
      expect(
        updated?.candidacies.find((candidate) => candidate.candidateName === "Charlie Fixture")
          ?.programmeAbsence
      ).toBe("non_depouille");
    } finally {
      await db.programEdition.delete({ where: { id: edition.id } });
    }
  });

  it("cumule les verrous mesure, révision, source et extension présidentielle", async () => {
    const alpha = await db.candidacy.findFirstOrThrow({
      where: { electionId, candidateName: "Alpha Fixture" },
      select: { id: true, politicianId: true },
    });
    expect(alpha.politicianId).not.toBeNull();

    async function invalidMeasure(
      text: string,
      invalidation: "UNREVIEWED" | "NO_SOURCE" | "SUPERSEDED" | "DISCARDED" | "REJECTED"
    ) {
      const seeded = await transitions.createMeasure({
        politicianId: alpha.politicianId!,
        electionId,
        candidacyId: alpha.id,
        programEditionId: null,
        attribution: "PERSONAL",
        theme: "SANTE",
        precedingMeasureId: null,
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
            url: "https://example.org/source-invalide",
            page: null,
            publishedAt: new Date("2027-02-01T00:00:00Z"),
          },
        ],
      });

      const commonRevision = {
        reviewedAt: new Date("2027-02-02T00:00:00Z"),
        reviewedBy: "fixture",
        publishedAt: new Date("2027-02-02T00:00:00Z"),
      };
      if (invalidation !== "UNREVIEWED") {
        await db.measureRevision.update({
          where: { id: seeded.revisionId },
          data: {
            ...commonRevision,
            ...(invalidation === "SUPERSEDED" ? { supersededAt: new Date() } : {}),
            ...(invalidation === "DISCARDED" ? { discardedAt: new Date() } : {}),
            ...(invalidation === "REJECTED"
              ? { rejectedAt: new Date(), rejectedBy: "fixture", rejectionReason: "OTHER" }
              : {}),
          },
        });
      }
      if (invalidation === "NO_SOURCE") {
        await db.measureSource.deleteMany({ where: { measureRevisionId: seeded.revisionId } });
      }
      await db.measure.update({
        where: { id: seeded.measureId },
        data: { publicationStatus: "PUBLISHED", publishedRevisionId: seeded.revisionId },
      });
      return seeded.measureId;
    }

    const invalidIds = await Promise.all([
      invalidMeasure("Révision non relue.", "UNREVIEWED"),
      invalidMeasure("Révision sans source.", "NO_SOURCE"),
      invalidMeasure("Révision supplantée.", "SUPERSEDED"),
      invalidMeasure("Révision écartée.", "DISCARDED"),
      invalidMeasure("Révision rejetée.", "REJECTED"),
    ]);
    const result = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      page: 1,
      limit: 100,
    });

    expect(result.total).toBe(2);
    expect(result.data.map((measure) => measure.measureId)).not.toEqual(
      expect.arrayContaining(invalidIds)
    );
    expect(result.data.map((measure) => measure.text)).not.toContain(
      "Mesure logement rattachée à une candidature non publiée."
    );
  });

  it("exclut une personnalité DRAFT même si son extension présidentielle est publiée", async () => {
    const echo = await db.candidacy.findFirstOrThrow({
      where: { electionId, candidateName: "Echo Fixture" },
      select: { id: true, politicianId: true },
    });
    expect(echo.politicianId).not.toBeNull();
    await db.candidacyPresidential.create({
      data: { candidacyId: echo.id, publicationStatus: "PUBLISHED" },
    });
    const seeded = await transitions.createMeasure({
      politicianId: echo.politicianId!,
      electionId,
      candidacyId: echo.id,
      programEditionId: null,
      attribution: "PERSONAL",
      theme: "SANTE",
      precedingMeasureId: null,
      revision: {
        text: "Mesure d'une personnalité non publiée.",
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
          url: "https://example.org/source-echo",
          page: null,
          publishedAt: new Date("2027-02-01T00:00:00Z"),
        },
      ],
    });
    await transitions.reviewMeasureRevision({ ...seeded, reviewedBy: "fixture" });
    await transitions.publishMeasureRevision(seeded);

    const result = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      page: 1,
      limit: 100,
    });
    expect(result.data.map((measure) => measure.measureId)).not.toContain(seeded.measureId);
  });

  it("pagine en base, filtre par candidature et thème, et ne sérialise qu'un DTO public", async () => {
    const page = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      theme: "LOGEMENT_URBANISME",
      page: 1,
      limit: 1,
    });
    expect(page.total).toBe(2);
    expect(page.data).toHaveLength(1);

    const candidateSlug = page.data[0]?.candidacy.politicianSlug;
    expect(candidateSlug).toBeTruthy();
    const candidatePage = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      candidateSlug: candidateSlug!,
      page: 1,
      limit: 100,
    });
    expect(candidatePage.total).toBe(1);
    expect(candidatePage.data[0]?.candidacy.politicianSlug).toBe(candidateSlug);

    expect(Object.keys(page.data[0] ?? {}).sort()).toEqual([
      "attribution",
      "candidacy",
      "measureId",
      "precision",
      "publishedRevisionId",
      "sources",
      "text",
      "theme",
      "withdrawal",
    ]);
    expect(page.data[0]?.withdrawal).toBeNull();
    expect(page.data[0]).not.toHaveProperty("withdrawn");
    expect(JSON.stringify(page.data)).not.toMatch(
      /reviewedBy|evidenceSnapshot|publicationStatus|depublicationReason|notes|moderation/i
    );

    const revisionId = page.data[0]!.publishedRevisionId;
    const existingSource = await db.measureSource.findFirstOrThrow({
      where: { measureRevisionId: revisionId },
      select: { url: true, publishedAt: true },
    });
    await db.measureSource.createMany({
      data: [
        {
          id: `0-${SLUG}`,
          measureRevisionId: revisionId,
          sourceKind: "DISCOURS_CAMPAGNE",
          tier: "PRIMARY",
          url: "https://example.org/source-ordre-a",
          publishedAt: existingSource.publishedAt,
        },
        {
          id: `z-${SLUG}`,
          measureRevisionId: revisionId,
          sourceKind: "DISCOURS_CAMPAGNE",
          tier: "PRIMARY",
          url: "https://example.org/source-ordre-z",
          publishedAt: existingSource.publishedAt,
        },
      ],
    });
    const ordered = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      theme: "LOGEMENT_URBANISME",
      page: 1,
      limit: 1,
    });
    expect(ordered.data[0]?.sources.map((source) => source.url)).toEqual([
      "https://example.org/source-ordre-a",
      existingSource.url,
      "https://example.org/source-ordre-z",
    ]);
  });

  it("exclut les retraits par défaut et conserve chaque forme de provenance partielle", async () => {
    const urlOnlyMeasure = await db.measure.findFirstOrThrow({
      where: { electionId, candidacy: { candidateName: "Alpha Fixture" } },
      select: { id: true },
    });
    const labelOnlyMeasure = await db.measure.findFirstOrThrow({
      where: { electionId, candidacy: { candidateName: "Bravo Fixture" } },
      select: { id: true },
    });
    const alpha = await db.candidacy.findFirstOrThrow({
      where: { electionId, candidateName: "Alpha Fixture" },
      select: { id: true, politicianId: true },
    });
    expect(alpha.politicianId).not.toBeNull();

    const noSourceMeasure = await transitions.createMeasure({
      politicianId: alpha.politicianId!,
      electionId,
      candidacyId: alpha.id,
      programEditionId: null,
      attribution: "PERSONAL",
      theme: "SANTE",
      precedingMeasureId: null,
      revision: {
        text: "Mesure retirée sans provenance historique disponible.",
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
          url: "https://example.org/source-retrait-sans-provenance",
          page: null,
          publishedAt: new Date("2027-02-01T00:00:00Z"),
        },
      ],
    });
    await transitions.reviewMeasureRevision({ ...noSourceMeasure, reviewedBy: "fixture" });
    await transitions.publishMeasureRevision(noSourceMeasure);

    const active = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      page: 1,
      limit: 100,
    });
    expect(active.data.find((item) => item.measureId === urlOnlyMeasure.id)?.withdrawal).toBeNull();
    expect(active.data.find((item) => item.measureId === urlOnlyMeasure.id)).not.toHaveProperty(
      "withdrawn"
    );

    await transitions.withdrawMeasure({
      measureId: urlOnlyMeasure.id,
      withdrawnAt: new Date("2027-03-01T00:00:00Z"),
      sourceUrl: "https://example.org/retrait-alpha",
      sourceLabel: "Source du retrait",
    });
    await transitions.withdrawMeasure({
      measureId: labelOnlyMeasure.id,
      withdrawnAt: new Date("2027-03-02T00:00:00Z"),
      sourceUrl: "https://example.org/retrait-bravo",
      sourceLabel: "Source du retrait Bravo",
    });
    await transitions.withdrawMeasure({
      measureId: noSourceMeasure.measureId,
      withdrawnAt: new Date("2027-03-03T00:00:00Z"),
      sourceUrl: "https://example.org/retrait-sans-provenance",
      sourceLabel: "Source temporaire",
    });
    await db.measure.update({
      where: { id: urlOnlyMeasure.id },
      data: { withdrawnSourceLabel: null },
    });
    await db.measure.update({
      where: { id: labelOnlyMeasure.id },
      data: { withdrawnSourceUrl: null },
    });
    await db.measure.update({
      where: { id: noSourceMeasure.measureId },
      data: { withdrawnSourceUrl: null, withdrawnSourceLabel: null },
    });

    const current = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      page: 1,
      limit: 100,
    });
    expect(current.data.map((item) => item.measureId)).not.toEqual(
      expect.arrayContaining([urlOnlyMeasure.id, labelOnlyMeasure.id, noSourceMeasure.measureId])
    );

    const history = await listPublicPresidentialMeasures({
      electionId,
      electionSlug: SLUG,
      includeWithdrawn: true,
      page: 1,
      limit: 100,
    });
    const urlOnly = history.data.find((item) => item.measureId === urlOnlyMeasure.id);
    expect(urlOnly?.withdrawal).toEqual({
      withdrawnAt: new Date("2027-03-01T00:00:00Z"),
      sourceUrl: "https://example.org/retrait-alpha",
      sourceLabel: null,
    });
    expect(urlOnly).not.toHaveProperty("withdrawn");
    expect(urlOnly?.withdrawal).not.toHaveProperty("source");

    const labelOnly = history.data.find((item) => item.measureId === labelOnlyMeasure.id);
    expect(labelOnly?.withdrawal).toEqual({
      withdrawnAt: new Date("2027-03-02T00:00:00Z"),
      sourceUrl: null,
      sourceLabel: "Source du retrait Bravo",
    });
    expect(labelOnly).not.toHaveProperty("withdrawn");
    expect(labelOnly?.withdrawal).not.toHaveProperty("source");

    const noSource = history.data.find((item) => item.measureId === noSourceMeasure.measureId);
    expect(noSource?.withdrawal).toEqual({
      withdrawnAt: new Date("2027-03-03T00:00:00Z"),
      sourceUrl: null,
      sourceLabel: null,
    });
    expect(noSource).not.toHaveProperty("withdrawn");
    expect(noSource?.withdrawal).not.toHaveProperty("source");
  });
});
