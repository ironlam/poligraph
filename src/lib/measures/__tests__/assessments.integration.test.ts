import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { seedMeasureWithDraft } from "./helpers";

// Deferred: `../assessments` imports `@/lib/db` as a value, which throws at module load
// without DATABASE_URL, so a static import fails the file instead of skipping.
let db: typeof import("@/lib/db").db;
let createQualification: typeof import("../assessments").createQualification;
let createSimilarityAssessment: typeof import("../assessments").createSimilarityAssessment;

describeIfDisposableDb("createSimilarityAssessment", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ createSimilarityAssessment } = await import("../assessments"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses EQUIVALENT_FOUND with no equivalent identified", async () => {
    const { revisionId } = await seedMeasureWithDraft();

    // An EQUIVALENT_FOUND conclusion with no matches is neither usable nor auditable: the
    // interface would state that an equivalent exists without being able to show it.
    await expect(
      createSimilarityAssessment({
        measureRevisionId: revisionId,
        comparedCorpusVersion: "2027-01",
        conclusion: "EQUIVALENT_FOUND",
        rationale: "Formulation proche.",
        assessedBy: "relecteur",
        equivalentRevisionIds: [],
      })
    ).rejects.toThrow(/équivalent/i);
  });

  it("refuses NO_EQUIVALENT_FOUND with equivalents attached", async () => {
    const { revisionId } = await seedMeasureWithDraft();
    const other = await seedMeasureWithDraft();

    await expect(
      createSimilarityAssessment({
        measureRevisionId: revisionId,
        comparedCorpusVersion: "2027-01",
        conclusion: "NO_EQUIVALENT_FOUND",
        rationale: "Aucun équivalent.",
        assessedBy: "relecteur",
        equivalentRevisionIds: [other.revisionId],
      })
    ).rejects.toThrow(/équivalent/i);
  });

  it("leaves no assessment behind when the matches cannot be written", async () => {
    const { revisionId } = await seedMeasureWithDraft();

    // The conclusion and its matches are one editorial statement, so they are written in
    // one transaction. A dangling EQUIVALENT_FOUND with no match is exactly the state the
    // first guard refuses at the door: this proves the door is not the only lock, because
    // an unknown revision id fails at the foreign key, after the assessment row.
    await expect(
      createSimilarityAssessment({
        measureRevisionId: revisionId,
        comparedCorpusVersion: "2027-01",
        conclusion: "EQUIVALENT_FOUND",
        rationale: "Équivalent supposé.",
        assessedBy: "relecteur",
        equivalentRevisionIds: ["revision-inexistante"],
      })
    ).rejects.toThrow();

    const assessments = await db.measureSimilarityAssessment.findMany({
      where: { measureRevisionId: revisionId },
    });
    expect(assessments).toHaveLength(0);
  });

  it("stores the corpus version and the date with the conclusion", async () => {
    const { revisionId } = await seedMeasureWithDraft();
    const other = await seedMeasureWithDraft();

    await createSimilarityAssessment({
      measureRevisionId: revisionId,
      comparedCorpusVersion: "2027-01",
      conclusion: "EQUIVALENT_FOUND",
      rationale: "Même objet, formulation différente.",
      assessedBy: "relecteur",
      equivalentRevisionIds: [other.revisionId],
    });

    const assessment = await db.measureSimilarityAssessment.findFirstOrThrow({
      where: { measureRevisionId: revisionId },
      include: { matches: true },
    });

    // The interface only ever displays "no equivalent found" with the date of the
    // assessment: without the date and the corpus version, the conclusion is a claim about
    // the present that was true in the past.
    expect(assessment.comparedCorpusVersion).toBe("2027-01");
    expect(assessment.assessedAt).not.toBeNull();
    expect(assessment.matches).toHaveLength(1);
  });
});

describeIfDisposableDb("createQualification", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ createQualification } = await import("../assessments"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses a source url without its label, and the reverse", async () => {
    const { revisionId } = await seedMeasureWithDraft();
    const base = {
      measureRevisionId: revisionId,
      kind: "DEJA_TENTEE" as const,
      label: "Déjà tentée en 2018",
      rationale: "Un dispositif comparable a été adopté puis abrogé.",
      assessedBy: "relecteur",
    };

    await expect(
      createQualification({ ...base, sourceUrl: "https://example.org/2018", sourceLabel: null })
    ).rejects.toThrow(/source/i);
    await expect(
      createQualification({ ...base, sourceUrl: null, sourceLabel: "Le Monde" })
    ).rejects.toThrow(/source/i);
  });

  it("refuses an empty rationale", async () => {
    const { revisionId } = await seedMeasureWithDraft();

    // A qualification is an editorial conclusion. Without a rationale it is an unexplained
    // judgement on a candidate's proposal.
    await expect(
      createQualification({
        measureRevisionId: revisionId,
        kind: "FINANCEMENT_NON_PRECISE",
        label: "Financement non précisé",
        rationale: "   ",
        sourceUrl: null,
        sourceLabel: null,
        assessedBy: "relecteur",
      })
    ).rejects.toThrow(/justification/i);
  });

  it("records the author and the date of the judgement", async () => {
    const { revisionId } = await seedMeasureWithDraft();

    await createQualification({
      measureRevisionId: revisionId,
      kind: "FINANCEMENT_NON_PRECISE",
      label: "Financement non précisé",
      rationale: "Le programme ne chiffre ni le coût ni la recette associée.",
      sourceUrl: null,
      sourceLabel: null,
      assessedBy: "relecteur",
    });

    const qualification = await db.measureQualification.findFirstOrThrow({
      where: { measureRevisionId: revisionId },
    });

    // A qualification without its date and its author is a judgement nobody signs, on a
    // formulation nobody can situate in time. It is attached to the REVISION, not to the
    // measure, so a reformulation does not silently inherit the conclusion.
    expect(qualification.assessedBy).toBe("relecteur");
    expect(qualification.assessedAt).not.toBeNull();
    expect(qualification.measureRevisionId).toBe(revisionId);
  });
});
