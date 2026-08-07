import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { themeToSlug } from "@/lib/theme-utils";

// Deferred: these modules import @/lib/db as a value, which throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let loadSubjectPageData: typeof import("@/lib/data/subject-page").loadSubjectPageData;
let transitions: typeof import("@/lib/measures/transitions");
let createMeasureVoteLink: typeof import("@/lib/measures/vote-links").createMeasureVoteLink;

const SLUG = "presidentielle-sujet-test";
const THEME = "LOGEMENT_URBANISME" as const;
// Below the gate throughout this fixture: no measure is ever attached to this theme, other
// than the one draft added below to exercise pendingReviewRevisionCount.
const OTHER_THEME = "SANTE" as const;

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

    // A draft measure on a different theme, never reviewed nor published: exercises
    // pendingReviewRevisionCount on a theme that otherwise carries no measure at all.
    await transitions.createMeasure({
      politicianId: a.politicianId,
      electionId,
      candidacyId: a.candidacyId,
      programEditionId: null,
      attribution: "PERSONAL",
      theme: OTHER_THEME,
      precedingMeasureId: null,
      revision: {
        text: "Brouillon santé non publié.",
        precision: null,
        validFrom: new Date("2027-01-06T00:00:00Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "ARTICLE_PRESSE",
          tier: "SECONDARY",
          url: "https://example.org/article-sante",
          page: null,
          publishedAt: new Date("2027-01-06T00:00:00Z"),
        },
      ],
    });

    // Bruno: one defended measure, so the gate reaches two candidacies.
    bruno = await publishedCandidate("Bruno");
    await publishMeasure(bruno.politicianId, bruno.candidacyId, "Construire 500 000 logements.");

    // A measure published on OTHER_THEME, then depublished for cause (I3): publicationStatus
    // falls back to DRAFT, exactly like a never-published draft, but this is a retraction, not
    // a submission awaiting a first review. pendingReviewRevisionCount must not count it.
    const depublishedSeed = await transitions.createMeasure({
      politicianId: bruno.politicianId,
      electionId,
      candidacyId: bruno.candidacyId,
      programEditionId: null,
      attribution: "PERSONAL",
      theme: OTHER_THEME,
      precedingMeasureId: null,
      revision: {
        text: "Mesure santé publiée puis retirée pour motif factuel.",
        precision: null,
        validFrom: new Date("2027-01-07T00:00:00Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "ARTICLE_PRESSE",
          tier: "SECONDARY",
          url: "https://example.org/article-sante-retiree",
          page: null,
          publishedAt: new Date("2027-01-07T00:00:00Z"),
        },
      ],
    });
    await transitions.reviewMeasureRevision({ ...depublishedSeed, reviewedBy: "relecteur" });
    await transitions.publishMeasureRevision(depublishedSeed);
    await transitions.depublishMeasure({
      measureId: depublishedSeed.measureId,
      reason: "Information inexacte, retirée après vérification.",
    });

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

  it("expose le seuil requis et le total de candidatures sourcées de l'élection", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, THEME);
    expect(data.requiredCandidaciesWithVerifiedMeasure).toBe(2);
    // Alix, Bruno and Chloe are sourced (status + sourceUrl + sourceLabel); Dora (DRAFT
    // extension, no source) is not. The count is election-wide, not scoped to the theme.
    expect(data.totalSourcedCandidacies).toBe(3);
  });

  it("compte les mesures en attente de relecture d'un thème sous le seuil, sans exposer leur texte", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, OTHER_THEME);
    expect(data.candidaciesWithVerifiedMeasure).toBe(0);
    expect(data.publishable).toBe(false);
    expect(data.pendingReviewRevisionCount).toBe(1);
    expect(JSON.stringify(data)).not.toContain("Brouillon santé non publié.");
  });

  it("ne compte pas une mesure publiée puis dépubliée dans pendingReviewRevisionCount", async () => {
    // The draft SANTE measure alone brings the count to 1: depublishMeasure() also leaves
    // publicationStatus at DRAFT, and without depublishedAt in the filter this would read 2.
    const data = await loadSubjectPageData(electionId, SLUG, OTHER_THEME);
    expect(data.pendingReviewRevisionCount).toBe(1);
    expect(JSON.stringify(data)).not.toContain(
      "Mesure santé publiée puis retirée pour motif factuel."
    );
  });

  it("date la dernière revue publique du thème, et jamais relu quand aucune n'existe", async () => {
    const onTheme = await loadSubjectPageData(electionId, SLUG, THEME);
    const brunoRevision = await db.measureRevision.findFirst({
      where: { measure: { candidacyId: bruno.candidacyId } },
      select: { reviewedAt: true },
    });
    expect(onTheme.lastReviewedAt?.getTime()).toBe(brunoRevision?.reviewedAt?.getTime());

    const otherTheme = await loadSubjectPageData(electionId, SLUG, OTHER_THEME);
    expect(otherTheme.lastReviewedAt).toBeNull();
  });

  it("sous le seuil, renvoie un thème publiable différent du thème courant", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, OTHER_THEME);
    expect(data.fallbackPublishableTheme).toEqual({
      slug: themeToSlug(THEME),
      label: THEME_CATEGORY_LABELS[THEME],
    });
  });

  it("au-dessus du seuil, ne propose aucun renvoi quand aucun autre thème n'est publiable", async () => {
    const data = await loadSubjectPageData(electionId, SLUG, THEME);
    expect(data.fallbackPublishableTheme).toBeNull();
  });
});
