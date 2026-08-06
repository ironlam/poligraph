import { beforeAll, afterAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { publishSeededMeasure, seedMeasureWithDraft, uniqueSlug } from "./helpers";

// Deferred: vote-links.ts imports @/lib/db as a value, which throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let createMeasureVoteLink: typeof import("../vote-links").createMeasureVoteLink;
let getPublicMeasureVoteRelation: typeof import("../vote-links").getPublicMeasureVoteRelation;

const base = {
  rationale: "Le scrutin portait sur le même objet que la mesure.",
  checkedAt: new Date("2026-08-04T00:00:00Z"),
  institutionScope: ["AN" as const],
  legislatureScope: ["17"],
  searchMethod: "Recherche par dossier législatif",
  reviewedBy: "admin",
};

describeIfDisposableDb("MeasureVoteLink : contraintes d'écriture et lecture publique", () => {
  let scrutinId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ createMeasureVoteLink, getPublicMeasureVoteRelation } = await import("../vote-links"));

    const scrutin = await db.scrutin.create({
      data: {
        externalId: uniqueSlug("scrutin"),
        title: "Scrutin de test",
        votingDate: new Date("2026-03-01T00:00:00Z"),
        legislature: 17,
        votesFor: 200,
        votesAgainst: 150,
        votesAbstain: 10,
        result: "ADOPTED",
      },
    });
    scrutinId = scrutin.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("contrainte 1 : refuse un lien dont la révision appartient à une autre mesure", async () => {
    const a = await publishSeededMeasure();
    const b = await seedMeasureWithDraft();
    await expect(
      createMeasureVoteLink({
        ...base,
        measureId: a.measureId,
        applicableRevisionId: b.revisionId,
        scrutinId,
        linkKind: "SAME_OBJECT",
        relation: "FAVORABLE",
      })
    ).rejects.toThrow(/n'appartient pas à cette mesure/);
  });

  it("contrainte 3 : refuse un NO_VOTE_IDENTIFIED porteur d'un scrutin", async () => {
    const m = await publishSeededMeasure();
    await expect(
      createMeasureVoteLink({
        ...base,
        measureId: m.measureId,
        applicableRevisionId: m.revisionId,
        scrutinId,
        linkKind: "NO_VOTE_IDENTIFIED",
      })
    ).rejects.toThrow(/aucun vote identifié/);
  });

  it("relation : exige une relation sur un lien SAME_OBJECT rattaché à un scrutin", async () => {
    const m = await publishSeededMeasure();
    await expect(
      createMeasureVoteLink({
        ...base,
        measureId: m.measureId,
        applicableRevisionId: m.revisionId,
        scrutinId,
        linkKind: "SAME_OBJECT",
        relation: null,
      })
    ).rejects.toThrow(/doit porter la relation/);
  });

  it("relation : refuse une relation sur un lien BROADER_TEXT", async () => {
    const m = await publishSeededMeasure();
    await expect(
      createMeasureVoteLink({
        ...base,
        measureId: m.measureId,
        applicableRevisionId: m.revisionId,
        scrutinId,
        linkKind: "BROADER_TEXT",
        relation: "FAVORABLE",
      })
    ).rejects.toThrow(/Seul un lien sur le même objet/);
  });

  it("contrainte 2 : refuse isReference sur un lien sans scrutin", async () => {
    const m = await publishSeededMeasure();
    await expect(
      createMeasureVoteLink({
        ...base,
        measureId: m.measureId,
        applicableRevisionId: m.revisionId,
        scrutinId: null,
        linkKind: "SAME_OBJECT",
        isReference: true,
      })
    ).rejects.toThrow(/peut être la référence/);
  });

  it("contrainte 4 : refuse une seconde référence sur la même révision applicable", async () => {
    const m = await publishSeededMeasure();
    await createMeasureVoteLink({
      ...base,
      measureId: m.measureId,
      applicableRevisionId: m.revisionId,
      scrutinId,
      linkKind: "SAME_OBJECT",
      relation: "FAVORABLE",
      isReference: true,
    });
    await expect(
      createMeasureVoteLink({
        ...base,
        measureId: m.measureId,
        applicableRevisionId: m.revisionId,
        scrutinId,
        linkKind: "SAME_OBJECT",
        relation: "DEFAVORABLE",
        isReference: true,
      })
    ).rejects.toThrow(/référence existe déjà/);
  });

  it("cas nominal : crée un lien de référence favorable", async () => {
    const m = await publishSeededMeasure();
    const link = await createMeasureVoteLink({
      ...base,
      measureId: m.measureId,
      applicableRevisionId: m.revisionId,
      scrutinId,
      linkKind: "SAME_OBJECT",
      relation: "FAVORABLE",
      isReference: true,
    });
    expect(link.isReference).toBe(true);
    expect(link.relation).toBe("FAVORABLE");
  });

  it("lecture publique : un lien de référence favorable donne FAVORABLE_SAME_OBJECT et sa base sourcée", async () => {
    const m = await publishSeededMeasure();
    await createMeasureVoteLink({
      ...base,
      measureId: m.measureId,
      applicableRevisionId: m.revisionId,
      scrutinId,
      linkKind: "SAME_OBJECT",
      relation: "FAVORABLE",
      isReference: true,
    });

    const result = await getPublicMeasureVoteRelation(m.measureId, m.revisionId);
    expect(result.relation).toBe("FAVORABLE_SAME_OBJECT");
    expect(result.reference?.scrutinId).toBe(scrutinId);
    expect(result.reference?.legislatureScope).toEqual(["17"]);
    // Draft-leak invariant: the public shape never carries the internal judgment.
    expect(result.reference && "rationale" in result.reference).toBeFalsy();
    expect(result.reference && "reviewedBy" in result.reference).toBeFalsy();
  });

  it("lecture publique : un lien hors de la révision publiée ne donne jamais de position", async () => {
    const m = await publishSeededMeasure();
    await createMeasureVoteLink({
      ...base,
      measureId: m.measureId,
      applicableRevisionId: m.revisionId,
      scrutinId,
      linkKind: "SAME_OBJECT",
      relation: "FAVORABLE",
      isReference: true,
    });

    // Une reformulation a fait bouger la révision publiée : le lien porte sur l'ancienne.
    const result = await getPublicMeasureVoteRelation(m.measureId, "une-autre-revision-publiee");
    expect(result.relation).toBe("NOT_RECHECKED_SINCE_REFORMULATION");
    expect(result.reference).toBeNull();
  });
});
