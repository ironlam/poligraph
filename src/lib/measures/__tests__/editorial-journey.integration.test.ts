import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import {
  deriveModerationState,
  MODERATION_MEASURE_SELECT,
  toModerationMeasureRow,
  type ModerationState,
} from "../moderation-state";
import { draftInput, seedCandidacy, seedElection, seedPolitician } from "./helpers";

let db: typeof import("@/lib/db").db;
let transitions: typeof import("../transitions");
let errors: typeof import("../errors");
let getPublicMeasure: typeof import("@/lib/data/measures").getPublicMeasure;
let auditMeasures: typeof import("../audit").auditMeasures;

/**
 * The whole editorial life of one measure, in the order a reviewer walks it.
 *
 * Each step asserts what the reviewer would see AND what the public would get, because the point of
 * the two-pointer model is that those two answers differ. Step by step rather than one big
 * assertion at the end: a journey that only checks its destination cannot say which step broke it.
 */
describeIfDisposableDb("parcours éditorial complet", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    transitions = await import("../transitions");
    errors = await import("../errors");
    ({ getPublicMeasure } = await import("@/lib/data/measures"));
    ({ auditMeasures } = await import("../audit"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function stateOf(measureId: string): Promise<ModerationState> {
    const row = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: MODERATION_MEASURE_SELECT,
    });
    return deriveModerationState(toModerationMeasureRow(row));
  }

  async function versionOf(measureId: string): Promise<Date> {
    const measure = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: { updatedAt: true },
    });
    return measure.updatedAt;
  }

  it("va de la création au retrait en douze étapes, sans surprise à aucune", async () => {
    const politicianId = await seedPolitician();
    const electionId = await seedElection();
    const candidacyId = await seedCandidacy(politicianId, electionId);

    // 1. Créer.
    const { measureId, revisionId } = await transitions.createMeasure({
      politicianId,
      electionId,
      candidacyId,
      programEditionId: null,
      attribution: "PERSONAL",
      theme: "LOGEMENT_URBANISME",
      precedingMeasureId: null,
      revision: {
        text: "Encadrer les loyers dans les zones tendues.",
        precision: "OBJECTIF_SANS_CHIFFRE",
        validFrom: new Date("2027-01-15T00:00:00Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "PROGRAMME_PARTI",
          tier: "PRIMARY",
          url: "https://example.org/programme.pdf",
          page: "12",
          publishedAt: new Date("2027-01-15T00:00:00Z"),
        },
      ],
    });

    let state = await stateOf(measureId);
    expect(state.publication).toBe("DRAFT");
    expect(state.activeDraft).toEqual({ id: revisionId, reviewed: false });
    expect(state.draftIsCorrection).toBe(false);
    expect(await getPublicMeasure(measureId)).toBeNull();

    // 2. Relire.
    await transitions.reviewMeasureRevision({ measureId, revisionId, reviewedBy: "admin" });
    state = await stateOf(measureId);
    expect(state.publication).toBe("REVIEWED");
    expect(await getPublicMeasure(measureId)).toBeNull();

    // 3. Publier.
    await transitions.publishMeasureRevision({
      measureId,
      revisionId,
      expectedUpdatedAt: await versionOf(measureId),
    });
    state = await stateOf(measureId);
    expect(state.publication).toBe("PUBLISHED");
    expect(state.publiclyVisible).toBe(true);
    expect((await getPublicMeasure(measureId))?.text).toContain("zones tendues");

    // 4. Créer une correction. Le public ne bouge pas : c'est tout l'intérêt des deux pointeurs.
    const { revisionId: correctionId } = await transitions.draftMeasureRevision({
      ...draftInput(measureId, "Encadrer les loyers, périmètre étendu aux communes littorales."),
      expectedUpdatedAt: await versionOf(measureId),
    });
    state = await stateOf(measureId);
    expect(state.publication).toBe("PUBLISHED");
    expect(state.activeDraft).toEqual({ id: correctionId, reviewed: false });
    expect(state.draftIsCorrection).toBe(true);
    expect((await getPublicMeasure(measureId))?.text).toContain("zones tendues");

    // 5. Relire la correction.
    await transitions.reviewMeasureRevision({
      measureId,
      revisionId: correctionId,
      reviewedBy: "admin",
    });
    state = await stateOf(measureId);
    expect(state.activeDraft).toEqual({ id: correctionId, reviewed: true });
    expect((await getPublicMeasure(measureId))?.text).toContain("zones tendues");

    // 6. Publier la correction.
    await transitions.publishMeasureRevision({
      measureId,
      revisionId: correctionId,
      expectedUpdatedAt: await versionOf(measureId),
    });
    state = await stateOf(measureId);
    expect(state.activeDraft).toBeNull();
    expect((await getPublicMeasure(measureId))?.text).toContain("communes littorales");

    // 7. Dépublier depuis un état frais.
    await transitions.depublishMeasure({
      measureId,
      reason: "Vérification d'une source contestée",
      expectedUpdatedAt: await versionOf(measureId),
    });
    state = await stateOf(measureId);
    expect(state.publication).toBe("DEPUBLISHED");
    expect(state.depublication?.reason).toBe("Vérification d'une source contestée");
    expect(await getPublicMeasure(measureId)).toBeNull();

    // 8. Une ancienne page ne peut pas republier.
    const stale = new Date("2027-01-01T00:00:00Z");
    await expect(
      transitions.publishMeasureRevision({
        measureId,
        revisionId: correctionId,
        expectedUpdatedAt: stale,
      })
    ).rejects.toBeInstanceOf(errors.MeasureConcurrencyError);
    expect(await getPublicMeasure(measureId)).toBeNull();

    // 9. Republier depuis l'état rafraîchi.
    await transitions.publishMeasureRevision({
      measureId,
      revisionId: correctionId,
      expectedUpdatedAt: await versionOf(measureId),
    });
    state = await stateOf(measureId);
    expect(state.publication).toBe("PUBLISHED");
    expect(state.depublication).toBeNull();
    expect(await getPublicMeasure(measureId)).not.toBeNull();

    // 10. Enregistrer le retrait du candidat.
    await transitions.withdrawMeasure({
      measureId,
      withdrawnAt: new Date("2027-03-01T00:00:00Z"),
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Conférence de presse du 1er mars 2027",
      expectedUpdatedAt: await versionOf(measureId),
    });

    // 11. La mesure reste publique ET marquée retirée. Les deux à la fois, c'est l'arbitrage.
    state = await stateOf(measureId);
    expect(state.publication).toBe("PUBLISHED");
    expect(state.publiclyVisible).toBe(true);
    expect(state.withdrawal?.sourceLabel).toBe("Conférence de presse du 1er mars 2027");
    const publicMeasure = await getPublicMeasure(measureId);
    expect(publicMeasure).not.toBeNull();
    expect(publicMeasure?.withdrawal?.withdrawnAt).toEqual(new Date("2027-03-01T00:00:00Z"));

    // 12. Aucun invariant violé sur cette mesure.
    const violations = (await auditMeasures()).filter((v) => v.measureId === measureId);
    expect(violations).toEqual([]);
  }, 120_000);

  it("couvre brouillon puis abandon, qui ne s'insère pas dans le parcours nominal", async () => {
    const politicianId = await seedPolitician();
    const electionId = await seedElection();

    const { measureId, revisionId } = await transitions.createMeasure({
      politicianId,
      electionId,
      candidacyId: null,
      programEditionId: null,
      attribution: "PARTY_PROGRAM",
      theme: "TRANSPORTS",
      precedingMeasureId: null,
      revision: {
        text: "Rendre gratuits les transports scolaires.",
        precision: null,
        validFrom: new Date("2027-01-20T00:00:00Z"),
        extractionMethod: "AI_ASSISTED",
        extractionConfidence: 0.4,
        extractorVersion: "demo-1",
      },
      sources: [
        {
          sourceKind: "ARTICLE_PRESSE",
          tier: "SECONDARY",
          url: "https://example.org/article",
          page: null,
          publishedAt: new Date("2027-01-20T00:00:00Z"),
        },
      ],
    });

    await transitions.discardMeasureRevision({ measureId, revisionId });

    const state = await stateOf(measureId);
    // Plus rien à représenter : ni révision publiée, ni brouillon actif.
    expect(state.publication).toBe("EMPTY");
    expect(state.activeDraft).toBeNull();
    expect(state.anomalies).toEqual([]);
    expect(await getPublicMeasure(measureId)).toBeNull();

    // Le document d'index est retiré, et l'audit ne réclame donc rien.
    const document = await db.searchDocument.findUnique({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });
    expect(document).toBeNull();

    const violations = (await auditMeasures()).filter((v) => v.measureId === measureId);
    expect(violations).toEqual([]);
  }, 120_000);
});
