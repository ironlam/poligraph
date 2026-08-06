import { afterAll, beforeAll, expect, it } from "vitest";
import { publishSeededMeasure, seedMeasureWithDraft } from "@/lib/measures/__tests__/helpers";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let auditSearchDocuments: typeof import("../maintenance").auditSearchDocuments;
let reindexMeasures: typeof import("../maintenance").reindexMeasures;

/**
 * `search:audit` and `search:reindex`.
 *
 * The audit checks what the substrate can answer ALONE: a document whose entity is gone, and a
 * document of a type nothing indexes. Visibility and staleness need to know what a Measure is, so they
 * stay in `measures:audit`; asserting them here too would be two implementations of one policy.
 */
describeIfDisposableDb("maintenance de l'index de recherche", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ auditSearchDocuments, reindexMeasures } = await import("../maintenance"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("détecte un document dont l'entité n'existe plus", async () => {
    // Écrit directement : la suppression d'une mesure emporte son document par cascade, donc cet état
    // ne vient que d'un import ou d'un script.
    await db.searchDocument.create({
      data: {
        entityType: "MEASURE",
        entityId: "mesure-supprimee-depuis-longtemps",
        visibility: "ADMIN_ONLY",
        title: "Texte orphelin",
        body: "Texte orphelin",
        url: "/admin/mesures/mesure-supprimee-depuis-longtemps",
        sourceRevisionId: "rev-inexistante",
        sourceUpdatedAt: new Date("2027-01-15T00:00:00Z"),
      },
    });

    const violations = await auditSearchDocuments();

    expect(violations).toContainEqual({
      rule: "document_without_entity",
      entityType: "MEASURE",
      entityId: "mesure-supprimee-depuis-longtemps",
    });

    await db.searchDocument.deleteMany({
      where: { entityId: "mesure-supprimee-depuis-longtemps" },
    });
  });

  it("détecte un document dont le type n'est indexé par personne", async () => {
    // QUESTION est déclaré dans l'enum et n'est indexé par rien avant le lot 6 : un type que rien
    // n'énumère ne peut être ni reconstruit ni vérifié, donc il pourrirait en silence. Quand le lot 6
    // arrivera, cette règle l'obligera à s'enregistrer.
    await db.searchDocument.create({
      data: {
        entityType: "QUESTION",
        entityId: "question-non-indexee",
        visibility: "PUBLIC",
        title: "Type non pris en charge",
        body: "Type non pris en charge",
        url: "/questions/question-non-indexee",
        sourceRevisionId: null,
        sourceUpdatedAt: new Date("2027-01-15T00:00:00Z"),
      },
    });

    const violations = await auditSearchDocuments();

    expect(violations).toContainEqual({
      rule: "document_of_unknown_type",
      entityType: "QUESTION",
      entityId: "question-non-indexee",
    });

    await db.searchDocument.deleteMany({ where: { entityId: "question-non-indexee" } });
  });

  it("ne signale rien sur des mesures correctement indexées", async () => {
    const published = await publishSeededMeasure();
    const drafted = await seedMeasureWithDraft();
    const mine = new Set([published.measureId, drafted.measureId]);

    // Filtré sur MES mesures, et ce n'est pas une commodité : le corpus lexical du lot 1B indexe des
    // entités synthétiques (`insert-…`, `loyer-singulier-…`) qui n'ont jamais été des mesures, parce
    // que le substrat est agnostique de l'entité par construction. Elles sont donc de vraies
    // violations pour cette règle, dans une base partagée par tous les fichiers du harnais. Une
    // assertion globale ici dépend de l'ordre d'exécution, ce qu'elle a fait : verte seule, rouge
    // dans la suite complète.
    const violations = (await auditSearchDocuments()).filter((v) => mine.has(v.entityId));

    expect(violations).toEqual([]);
  });

  it("réindexe sans rien changer quand tout est déjà à jour", async () => {
    const { measureId } = await publishSeededMeasure();
    const before = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    const result = await reindexMeasures();

    expect(result.processed).toBeGreaterThanOrEqual(1);
    const after = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });
    expect(after.title).toBe(before.title);
    expect(after.visibility).toBe(before.visibility);
    expect(after.sourceRevisionId).toBe(before.sourceRevisionId);
  });

  it("reconstruit un document supprimé à la main", async () => {
    // Le cas qui justifie la commande : un document perdu par un incident se récupère sans toucher aux
    // mesures elles-mêmes.
    const { measureId } = await publishSeededMeasure();
    await db.searchDocument.deleteMany({
      where: { entityType: "MEASURE", entityId: measureId },
    });

    await reindexMeasures();

    const rebuilt = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });
    expect(rebuilt.visibility).toBe("PUBLIC");
  });
});
