import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { seedCandidacy, seedElection, seedPolitician, uniqueSlug } from "./helpers";

let db: typeof import("@/lib/db").db;
let migratePromisesToMeasures: typeof import("../promise-migration").migratePromisesToMeasures;

/**
 * The `Promise` migration.
 *
 * Built violation first, and here the violations are the rows that CANNOT be represented: a politician
 * who is not a candidate in the target election, a source with no URL, a source kind with no honest
 * equivalent. Each has to come out as a named reject, because a migration that loses rows silently is
 * worse than one that refuses them.
 */
describeIfDisposableDb("migratePromisesToMeasures", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ migratePromisesToMeasures } = await import("../promise-migration"));
    // Les autres fichiers ne créent pas de Promise ; on part quand même d'une table vide pour que les
    // comptes du rapport soient les nôtres.
    await db.promise.deleteMany({});
  });

  afterAll(async () => {
    await db.promise.deleteMany({});
    await db.$disconnect();
  });

  async function seedPromise(over: Record<string, unknown> = {}): Promise<string> {
    const politicianId = (over.politicianId as string | undefined) ?? (await seedPolitician());
    const row = await db.promise.create({
      data: {
        politicianId,
        text: `Encadrer les loyers ${uniqueSlug("p")}`,
        theme: "LOGEMENT_URBANISME",
        sourceKind: "ARTICLE_PRESSE",
        sourceUrl: "https://example.org/article-legacy",
        publishedAt: new Date("2026-11-02T00:00:00Z"),
        extractionStatus: "EXTRACTED",
        extractionMethod: "haiku",
        extractionConfidence: 0.62,
        ...over,
      },
    });
    return row.id;
  }

  it("refuse un politicien qui n'est pas candidat à l'élection visée", async () => {
    // `Promise` ne porte aucune élection : le rattachement ne peut pas être devinné.
    const electionId = await seedElection();
    const promiseId = await seedPromise();

    const report = await migratePromisesToMeasures({ electionId, dryRun: true });

    expect(report.rejects).toContainEqual({
      promiseId,
      reason: "le politicien n'est pas candidat à cette élection",
    });
    expect(report.migrated).toBe(0);
  });

  it("refuse une source sans URL", async () => {
    // MeasureSource.url est obligatoire. Inventer une URL serait pire que perdre la ligne : une mesure
    // dont la source ne peut pas être vérifiée est exactement ce qu'on refuse de publier.
    const electionId = await seedElection();
    const politicianId = await seedPolitician();
    await seedCandidacy(politicianId, electionId);
    const promiseId = await seedPromise({ politicianId, sourceUrl: null });

    const report = await migratePromisesToMeasures({ electionId, dryRun: true });

    expect(report.rejects).toContainEqual({
      promiseId,
      reason: "aucune URL de source, or une source de mesure en exige une",
    });
  });

  it("refuse une nature de source sans équivalent honnête", async () => {
    // L'enum des mesures reste fermé, sans valeur AUTRE : le seuil de 60 % de sources primaires ne
    // serait plus auditable si n'importe quoi pouvait y entrer.
    const electionId = await seedElection();
    const politicianId = await seedPolitician();
    await seedCandidacy(politicianId, electionId);
    const promiseId = await seedPromise({ politicianId, sourceKind: "AUTRE" });

    const report = await migratePromisesToMeasures({ electionId, dryRun: true });

    expect(report.rejects).toContainEqual({
      promiseId,
      reason: "nature de source AUTRE sans équivalent dans l'enum des mesures",
    });
  });

  it("n'écrit rien en essai à blanc", async () => {
    const electionId = await seedElection();
    const politicianId = await seedPolitician();
    await seedCandidacy(politicianId, electionId);
    await seedPromise({ politicianId });

    const report = await migratePromisesToMeasures({ electionId, dryRun: true });

    expect(report.migrated).toBe(1);
    expect(await db.measure.count({ where: { electionId } })).toBe(0);
  });

  it("migre en mesure, révision et source lorsque la ligne est représentable", async () => {
    const electionId = await seedElection();
    const politicianId = await seedPolitician();
    const candidacyId = await seedCandidacy(politicianId, electionId);
    await seedPromise({ politicianId, text: "Migrer : encadrer les loyers." });

    const report = await migratePromisesToMeasures({ electionId, dryRun: false });

    expect(report.migrated).toBe(1);
    const measure = await db.measure.findFirstOrThrow({
      where: { electionId, politicianId },
      include: { revisions: { include: { sources: true } } },
    });
    expect(measure.candidacyId).toBe(candidacyId);
    expect(measure.attribution).toBe("PERSONAL");
    // Rien n'est publié : la migration produit du brouillon, la relecture reste humaine.
    expect(measure.publicationStatus).toBe("DRAFT");
    expect(measure.publishedRevisionId).toBeNull();

    const revision = measure.revisions[0];
    expect(revision?.text).toBe("Migrer : encadrer les loyers.");
    expect(revision?.extractionMethod).toBe("IMPORTED");
    // La méthode d'origine est conservée en version d'extracteur, pas jetée.
    expect(revision?.extractorVersion).toBe("haiku");
    expect(revision?.precision).toBeNull();
    expect(revision?.sources[0]?.url).toBe("https://example.org/article-legacy");
    expect(revision?.sources[0]?.tier).toBe("SECONDARY");
  });

  it("ne recrée rien à la seconde exécution", async () => {
    const electionId = await seedElection();
    const politicianId = await seedPolitician();
    await seedCandidacy(politicianId, electionId);
    await seedPromise({ politicianId, text: "Idempotence : encadrer les loyers." });

    await migratePromisesToMeasures({ electionId, dryRun: false });
    const afterFirst = await db.measure.count({ where: { electionId } });
    const second = await migratePromisesToMeasures({ electionId, dryRun: false });

    expect(second.migrated).toBe(0);
    expect(second.alreadyMigrated).toBe(1);
    expect(await db.measure.count({ where: { electionId } })).toBe(afterFirst);
  });

  it("ne modifie jamais les lignes Promise", async () => {
    // La source est lue, jamais mutée : retirer le modèle est un db:push distinct, après déploiement.
    const electionId = await seedElection();
    const politicianId = await seedPolitician();
    await seedCandidacy(politicianId, electionId);
    const promiseId = await seedPromise({ politicianId, text: "Lecture seule : les loyers." });
    const before = await db.promise.findUniqueOrThrow({ where: { id: promiseId } });

    await migratePromisesToMeasures({ electionId, dryRun: false });

    const after = await db.promise.findUniqueOrThrow({ where: { id: promiseId } });
    expect(after).toEqual(before);
  });

  it("referme son compte : migrées plus déjà migrées plus rejetées égale lues", async () => {
    // Sans cette égalité, une ligne perdue en silence passerait pour un succès.
    const electionId = await seedElection();
    const politicianId = await seedPolitician();
    await seedCandidacy(politicianId, electionId);
    await seedPromise({ politicianId, text: "Compte : première." });
    await seedPromise({ politicianId, sourceUrl: null, text: "Compte : sans URL." });
    await seedPromise({ text: "Compte : pas candidat." });

    const report = await migratePromisesToMeasures({ electionId, dryRun: false });

    expect(report.migrated + report.alreadyMigrated + report.rejects.length).toBe(report.scanned);
  });
});
