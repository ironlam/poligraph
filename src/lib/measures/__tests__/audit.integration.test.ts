import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { publishSeededMeasure, seedElection, seedMeasureWithDraft, seedParty } from "./helpers";

// Deferred: both `../audit` and `../transitions` import `@/lib/db` as a value, which throws
// at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let auditMeasures: typeof import("../audit").auditMeasures;
let discardMeasureRevision: typeof import("../transitions").discardMeasureRevision;

/**
 * One rule, one constructed violation. A rule with no test is not verified, it is assumed.
 *
 * EVERY case in this file writes directly to the database, and that is the nature of the
 * exercise: these violations are no longer reachable through the public functions, since the
 * transitions prevent them. The audit exists for the states produced by a past import, a
 * script, or a manual correction in the database.
 */
async function violationsFor(measureId: string): Promise<string[]> {
  const all = await auditMeasures();
  return all.filter((v) => v.measureId === measureId).map((v) => v.rule);
}

async function allRules(): Promise<string[]> {
  return (await auditMeasures()).map((v) => v.rule);
}

describeIfDisposableDb("auditMeasures", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ auditMeasures } = await import("../audit"));
    ({ discardMeasureRevision } = await import("../transitions"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("reports nothing on a correctly published measure", async () => {
    const { measureId } = await publishSeededMeasure();

    expect(await violationsFor(measureId)).toEqual([]);
  });

  it("detects a published revision belonging to another measure", async () => {
    const { measureId } = await publishSeededMeasure();
    const other = await seedMeasureWithDraft();
    await db.measure.update({
      where: { id: measureId },
      data: { publishedRevisionId: other.revisionId },
    });

    expect(await violationsFor(measureId)).toContain("published_revision_foreign");
  });

  it("detects two published non-superseded revisions", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.measureRevision.create({
      data: {
        measureId,
        text: "Deuxième version publiée par erreur.",
        validFrom: new Date("2027-02-01T00:00:00Z"),
        extractionMethod: "MANUAL",
        reviewedAt: new Date(),
        reviewedBy: "relecteur",
        publishedAt: new Date(),
      },
    });

    // The state two concurrent publications produce without FOR UPDATE.
    expect(await violationsFor(measureId)).toContain("multiple_published_revisions");
  });

  it("detects publishedRevisionId pointing at an unreviewed revision", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await db.measureRevision.update({
      where: { id: revisionId },
      data: { reviewedAt: null, reviewedBy: null },
    });

    expect(await violationsFor(measureId)).toContain("published_revision_unreviewed");
  });

  it("detects publishedRevisionId pointing at a superseded revision", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await db.measureRevision.update({
      where: { id: revisionId },
      data: { supersededAt: new Date() },
    });

    expect(await violationsFor(measureId)).toContain("published_revision_superseded");
  });

  it("detects publishedRevisionId pointing at a revision with no publishedAt", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await db.measureRevision.update({ where: { id: revisionId }, data: { publishedAt: null } });

    expect(await violationsFor(measureId)).toContain("published_revision_unpublished");
  });

  it("detects latestRevisionId pointing at another measure's revision", async () => {
    const { measureId } = await publishSeededMeasure();
    const other = await seedMeasureWithDraft();

    // latestRevisionId is @unique, so the foreign revision has to be released first. That is
    // exactly what makes this state reachable: the constraint stops two measures from
    // sharing a pointer, it does not stop one from pointing at a foreign revision.
    await db.measure.update({ where: { id: other.measureId }, data: { latestRevisionId: null } });
    await db.measure.update({
      where: { id: measureId },
      data: { latestRevisionId: other.revisionId },
    });

    expect(await violationsFor(measureId)).toContain("latest_revision_foreign");
  });

  it("detects an active draft that latestRevisionId does not designate", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.measureRevision.create({
      data: {
        measureId,
        text: "Brouillon orphelin.",
        validFrom: new Date("2027-02-01T00:00:00Z"),
        extractionMethod: "MANUAL",
      },
    });

    expect(await violationsFor(measureId)).toContain("orphan_active_draft");
  });

  it("detects latestRevisionId on a discarded draft", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await db.measureRevision.update({
      where: { id: revisionId },
      data: { discardedAt: new Date() },
    });

    expect(await violationsFor(measureId)).toContain("latest_revision_discarded");
  });

  it("detects a candidacy that belongs to another politician", async () => {
    const { measureId } = await publishSeededMeasure();
    const other = await seedMeasureWithDraft();
    const otherMeasure = await db.measure.findUniqueOrThrow({ where: { id: other.measureId } });
    const foreign = await db.candidacy.create({
      data: {
        electionId: otherMeasure.electionId,
        politicianId: otherMeasure.politicianId,
        candidateName: "Autre candidat",
      },
    });
    await db.measure.update({ where: { id: measureId }, data: { candidacyId: foreign.id } });

    expect(await violationsFor(measureId)).toContain("candidacy_politician_mismatch");
  });

  it("detects a program edition attached to another election", async () => {
    const { measureId } = await publishSeededMeasure();
    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    // Seeded here rather than looked up: the plan wrote findFirstOrThrow on Party and
    // Election, which relies on rows left behind by other test files. The fixtures never
    // create a Party, so this file failed when run alone, and would have kept failing
    // depending on execution order.
    const otherElectionId = await seedElection();
    const partyId = await seedParty();
    expect(otherElectionId).not.toBe(measure.electionId);
    const edition = await db.programEdition.create({
      data: {
        electionId: otherElectionId,
        ownerType: "PARTY",
        partyId,
        label: "Programme d'une autre élection",
        version: 99,
        publishedAt: new Date(),
        documentUrl: "https://example.org/autre.pdf",
      },
    });
    await db.measure.update({ where: { id: measureId }, data: { programEditionId: edition.id } });

    expect(await violationsFor(measureId)).toContain("program_edition_election_mismatch");
  });

  it("detects a withdrawn measure with no withdrawal source", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.measure.update({ where: { id: measureId }, data: { withdrawnAt: new Date() } });

    expect(await violationsFor(measureId)).toContain("withdrawn_without_source");
  });

  it("detects withdrawal fields set with no withdrawnAt", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.measure.update({
      where: { id: measureId },
      data: {
        withdrawnSourceUrl: "https://example.org/retrait",
        withdrawnSourceLabel: "Le Monde",
      },
    });

    expect(await violationsFor(measureId)).toContain("withdrawal_source_without_date");
  });

  it("detects a published revision with no source", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await db.measureSource.deleteMany({ where: { measureRevisionId: revisionId } });

    expect(await violationsFor(measureId)).toContain("published_revision_without_source");
  });

  it("detects a measure with a reference revision and no search document at all", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.searchDocument.deleteMany({ where: { entityType: "MEASURE", entityId: measureId } });

    // The two visibility and staleness rules are both guarded by "if a document exists", so
    // without this rule a measure that was never indexed passes silently: invisible in
    // search, and reported as healthy.
    expect(await violationsFor(measureId)).toContain("search_document_missing");
  });

  it("does not demand a document for a measure with no reference revision", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await discardMeasureRevision({ measureId, revisionId });

    // No published revision and no active draft: there is nothing to index, and
    // syncSearchDocument removed the row on purpose.
    const rules = await violationsFor(measureId);
    expect(rules).not.toContain("search_document_missing");
    expect(rules).not.toContain("search_document_stale");
  });

  it("detects a PUBLIC search document whose measure is no longer published", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.measure.update({ where: { id: measureId }, data: { publicationStatus: "DRAFT" } });

    expect(await violationsFor(measureId)).toContain("search_document_visibility_mismatch");
  });

  it("detects a search document aligned on the wrong revision", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.searchDocument.update({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
      data: { sourceRevisionId: "revision-inexistante" },
    });

    expect(await violationsFor(measureId)).toContain("search_document_stale");
  });

  it("detects a search document outside its measure's election scope", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.searchDocument.update({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
      data: { electionId: null },
    });

    expect(await violationsFor(measureId)).toContain("search_document_election_mismatch");
  });

  // The last three rules carry no measureId, so they are checked on the whole result.

  it("detects an EQUIVALENT_FOUND assessment with no match", async () => {
    const { revisionId } = await seedMeasureWithDraft();
    await db.measureSimilarityAssessment.create({
      data: {
        measureRevisionId: revisionId,
        comparedCorpusVersion: "2027-01",
        assessedAt: new Date(),
        assessedBy: "relecteur",
        conclusion: "EQUIVALENT_FOUND",
        rationale: "Écrit directement en base pour construire la violation.",
      },
    });

    expect(await allRules()).toContain("similarity_conclusion_mismatch");
  });

  it("detects a qualification with half a source", async () => {
    const { revisionId } = await seedMeasureWithDraft();
    await db.measureQualification.create({
      data: {
        measureRevisionId: revisionId,
        kind: "DEJA_TENTEE",
        label: "Déjà tentée",
        rationale: "Écrit directement en base.",
        sourceUrl: "https://example.org/2018",
        assessedAt: new Date(),
        assessedBy: "relecteur",
      },
    });

    expect(await allRules()).toContain("qualification_half_source");
  });

  it("detects a program edition with zero or two owners", async () => {
    const electionId = await seedElection();
    await db.programEdition.create({
      data: {
        electionId,
        ownerType: "PARTY",
        label: "Édition sans propriétaire",
        version: 98,
        publishedAt: new Date(),
        documentUrl: "https://example.org/orphan.pdf",
      },
    });

    expect(await allRules()).toContain("program_edition_owner_count");
  });
  // Les trois règles ajoutées par #649 : des états invisibles du public que l'audit déclarait sains.

  it("detects a published revision that was discarded", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    // Le pointeur de brouillon vise ailleurs, sinon latest_revision_discarded couvrirait le cas et la
    // règle ne prouverait rien.
    const other = await seedMeasureWithDraft();
    await db.measure.update({ where: { id: other.measureId }, data: { latestRevisionId: null } });
    await db.measure.update({
      where: { id: measureId },
      data: { latestRevisionId: other.revisionId },
    });
    await db.measureRevision.update({
      where: { id: revisionId },
      data: { discardedAt: new Date() },
    });

    expect(await violationsFor(measureId)).toContain("published_revision_discarded");
  });

  it("detects a PUBLISHED status with no revision designated", async () => {
    const { measureId } = await seedMeasureWithDraft();
    await db.measure.update({
      where: { id: measureId },
      data: { publicationStatus: "PUBLISHED", publishedRevisionId: null },
    });

    expect(await violationsFor(measureId)).toContain("published_without_revision");
  });

  it("detects a depublication with no reason", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.measure.update({
      where: { id: measureId },
      data: { publicationStatus: "DRAFT", depublishedAt: new Date() },
    });

    expect(await violationsFor(measureId)).toContain("depublished_without_reason");
  });
});
