import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value, which throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let loadSubjectPageData: typeof import("@/lib/data/subject-page").loadSubjectPageData;
let transitions: typeof import("@/lib/measures/transitions");
let createMeasureVoteLink: typeof import("@/lib/measures/vote-links").createMeasureVoteLink;

const SLUG = "presidentielle-sujet-test";
const THEME = "LOGEMENT_URBANISME" as const;

/**
 * The subject page reads only through public authorities. The violation is built first: a DRAFT-extension
 * candidacy and an unpublished (draft) measure both exist, and neither may surface. Alongside them, two
 * candidacies with a defended published measure clear the gate, one candidacy has none (a qualified
 * absence), and a withdrawn measure stays visible.
 */
describeIfDisposableDb("page sujet publique : agrégation des données", () => {
  let electionId: string;
  const alix = { candidacyId: "", politicianId: "", defendedMeasureId: "", defendedRevisionId: "" };
  let bruno = { candidacyId: "", politicianId: "" };

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ loadSubjectPageData } = await import("@/lib/data/subject-page"));
    transitions = await import("@/lib/measures/transitions");
    ({ createMeasureVoteLink } = await import("@/lib/measures/vote-links"));

    const election = await db.election.create({
      data: { slug: SLUG, type: "PRESIDENTIELLE", scope: "NATIONAL", title: "Sujet test" },
    });
    electionId = election.id;

    async function publishedCandidate(name: string) {
      const slug = `${SLUG}-${name.toLowerCase()}`;
      const politician = await db.politician.create({
        data: { slug, firstName: name, lastName: "Test", fullName: `${name} Test` },
      });
      const candidacy = await db.candidacy.create({
        data: {
          electionId,
          politicianId: politician.id,
          candidateName: `${name} Test`,
          status: "DECLARE",
          sourceUrl: "https://example.org/source",
          sourceLabel: "Source",
        },
      });
      await db.candidacyPresidential.create({
        data: { candidacyId: candidacy.id, publicationStatus: "PUBLISHED" },
      });
      return { candidacyId: candidacy.id, politicianId: politician.id };
    }

    async function publishMeasure(politicianId: string, candidacyId: string, text: string) {
      const seeded = await transitions.createMeasure({
        politicianId,
        electionId,
        candidacyId,
        programEditionId: null,
        attribution: "PERSONAL",
        theme: THEME,
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
      return seeded;
    }

    // Alix: a defended measure (with a NO_VOTE_IDENTIFIED link) AND a withdrawn one AND a draft one.
    const a = await publishedCandidate("Alix");
    alix.candidacyId = a.candidacyId;
    alix.politicianId = a.politicianId;
    const defended = await publishMeasure(a.politicianId, a.candidacyId, "Encadrer les loyers.");
    alix.defendedMeasureId = defended.measureId;
    alix.defendedRevisionId = defended.revisionId;
    await createMeasureVoteLink({
      measureId: defended.measureId,
      applicableRevisionId: defended.revisionId,
      linkKind: "NO_VOTE_IDENTIFIED",
      scrutinId: null,
      relation: null,
      isReference: false,
      rationale: "Aucun scrutin pertinent dans le périmètre.",
      checkedAt: new Date("2027-02-01T00:00:00Z"),
      institutionScope: ["AN"],
      legislatureScope: ["17"],
      searchMethod: "Filtre par thème",
      reviewedBy: "relecteur",
    });

    const withdrawn = await publishMeasure(
      a.politicianId,
      a.candidacyId,
      "Geler les loyers un an."
    );
    const before = await db.measure.findUniqueOrThrow({
      where: { id: withdrawn.measureId },
      select: { updatedAt: true },
    });
    await transitions.withdrawMeasure({
      measureId: withdrawn.measureId,
      withdrawnAt: new Date("2027-03-01T00:00:00Z"),
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Communiqué de retrait",
      expectedUpdatedAt: before.updatedAt,
    });

    // A draft measure that is never reviewed nor published: it must not surface.
    await transitions.createMeasure({
      politicianId: a.politicianId,
      electionId,
      candidacyId: a.candidacyId,
      programEditionId: null,
      attribution: "PERSONAL",
      theme: THEME,
      precedingMeasureId: null,
      revision: {
        text: "Brouillon non publié.",
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

    // Bruno: one defended measure, so the gate reaches two candidacies.
    bruno = await publishedCandidate("Bruno");
    await publishMeasure(bruno.politicianId, bruno.candidacyId, "Construire 500 000 logements.");

    // Chloe: a published candidacy with no measure on the theme, so a qualified absence.
    await publishedCandidate("Chloe");

    // Dora: a DRAFT-extension candidacy. The authority must never surface it.
    const doraSlug = `${SLUG}-dora`;
    const dora = await db.politician.create({
      data: { slug: doraSlug, firstName: "Dora", lastName: "Test", fullName: "Dora Test" },
    });
    const doraCandidacy = await db.candidacy.create({
      data: { electionId, politicianId: dora.id, candidateName: "Dora Test", status: "DECLARE" },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: doraCandidacy.id, publicationStatus: "DRAFT" },
    });
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.$disconnect();
  });

  it("ne renvoie que les candidatures publiées, en ordre alphabétique, sans le brouillon Dora", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, THEME);
    expect(data.candidates.map((c) => c.candidate.candidateName)).toEqual([
      "Alix Test",
      "Bruno Test",
      "Chloe Test",
    ]);
  });

  it("rend une absence (aucune mesure) plutôt qu'un candidat silencieux", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, THEME);
    const chloe = data.candidates.find((c) => c.candidate.candidateName === "Chloe Test");
    expect(chloe?.measures).toEqual([]);
  });

  it("garde une mesure retirée visible, et exclut le brouillon non publié", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, THEME);
    const alixEntry = data.candidates.find((c) => c.candidate.candidateName === "Alix Test");
    // Two public measures (defended + withdrawn), never the draft.
    expect(alixEntry?.measures).toHaveLength(2);
    expect(alixEntry?.measures.some((m) => m.measure.withdrawal !== null)).toBe(true);
    expect(alixEntry?.measures.some((m) => m.measure.text === "Brouillon non publié.")).toBe(false);
  });

  it("dérive la relation aux votes par mesure, sans jamais exposer de rationale", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, THEME);
    const alixEntry = data.candidates.find((c) => c.candidate.candidateName === "Alix Test");
    const defended = alixEntry?.measures.find((m) => m.measure.id === alix.defendedMeasureId);
    // A NO_VOTE_IDENTIFIED link is a dated constat, never "search not done".
    expect(defended?.voteRelation).toBe("NO_VOTE_IN_SCOPE");
    expect(defended?.voteReference).toBeNull();
    // The public shape carries no editorial rationale field at all.
    expect(defended && "rationale" in defended).toBe(false);

    const bruno = data.candidates.find((c) => c.candidate.candidateName === "Bruno Test");
    // No link at all is the only path to "search not done".
    expect(bruno?.measures[0]?.voteRelation).toBe("SEARCH_NOT_DONE");
  });

  it("compte deux candidatures avec mesure défendue et ouvre le seuil de page sujet", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, THEME);
    // Alix and Bruno each defend a measure; Chloe has none; the withdrawn one does not count.
    expect(data.candidaciesWithVerifiedMeasure).toBe(2);
    expect(data.publishable).toBe(true);
  });
});
