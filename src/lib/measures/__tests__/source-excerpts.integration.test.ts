import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { draftInput, publishSeededMeasure } from "./helpers";

// Deferred imports, same reason as draft-revision.integration.test.ts: `@/lib/db` throws at
// module load when DATABASE_URL is unset.
let db: typeof import("@/lib/db").db;
let draftMeasureRevision: typeof import("../transitions").draftMeasureRevision;
let setSourceExcerpt: typeof import("../source-excerpts").setSourceExcerpt;

const URL_PROGRAMME = "https://example.org/programme.pdf";
const EXCERPT =
  "Nous rendrons obligatoire une empreinte de décision sur chaque texte important : une fiche publique indiquera qui a été consulté, qui a été rencontré et quelles contributions ont été reçues.";

/** A published measure whose published revision also carries a written-document source with an excerpt. */
async function publishedMeasureWithExcerpt() {
  const { measureId, revisionId } = await publishSeededMeasure();
  const source = await db.measureSource.create({
    data: {
      measureRevisionId: revisionId,
      sourceKind: "PROGRAMME_PARTI",
      tier: "PRIMARY",
      url: URL_PROGRAMME,
      page: "12",
      excerpt: EXCERPT,
      publishedAt: new Date("2027-02-01T00:00:00Z"),
    },
  });
  return { measureId, revisionId, sourceId: source.id };
}

function sourceInput(page: string | null, excerpt?: string | null) {
  return {
    sourceKind: "PROGRAMME_PARTI" as const,
    tier: "PRIMARY" as const,
    url: URL_PROGRAMME,
    page,
    ...(excerpt === undefined ? {} : { excerpt }),
    publishedAt: new Date("2027-02-01T00:00:00Z"),
  };
}

describeIfDisposableDb("extrait de source", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ draftMeasureRevision } = await import("../transitions"));
    ({ setSourceExcerpt } = await import("../source-excerpts"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("reprise lors d'une correction (draftMeasureRevision)", () => {
    it("reprend l'extrait quand l'URL et la page ne changent pas", async () => {
      const { measureId } = await publishedMeasureWithExcerpt();
      const base = draftInput(measureId, "Texte corrigé.");

      const { revisionId } = await draftMeasureRevision({ ...base, sources: [sourceInput("12")] });

      const sources = await db.measureSource.findMany({ where: { measureRevisionId: revisionId } });
      expect(sources.map((s) => s.excerpt)).toEqual([EXCERPT]);
    });

    it("ne reprend pas l'extrait quand la page change : il citait un autre passage", async () => {
      const { measureId } = await publishedMeasureWithExcerpt();
      const base = draftInput(measureId, "Texte corrigé.");

      const { revisionId } = await draftMeasureRevision({ ...base, sources: [sourceInput("13")] });

      const sources = await db.measureSource.findMany({ where: { measureRevisionId: revisionId } });
      expect(sources.map((s) => s.excerpt)).toEqual([null]);
    });

    it("respecte l'extrait fourni par l'appelant, y compris null", async () => {
      const { measureId } = await publishedMeasureWithExcerpt();
      const base = draftInput(measureId, "Texte corrigé.");

      const withOther = await draftMeasureRevision({
        ...base,
        sources: [sourceInput("12", "Un autre passage du même document, fourni explicitement.")],
      });
      const withNull = await draftMeasureRevision({ ...base, sources: [sourceInput("12", null)] });

      const other = await db.measureSource.findMany({
        where: { measureRevisionId: withOther.revisionId },
      });
      const none = await db.measureSource.findMany({
        where: { measureRevisionId: withNull.revisionId },
      });
      expect(other.map((s) => s.excerpt)).toEqual([
        "Un autre passage du même document, fourni explicitement.",
      ]);
      expect(none.map((s) => s.excerpt)).toEqual([null]);
    });
  });

  describe("setSourceExcerpt", () => {
    it("écrit l'extrait sur la révision publiée et le trace dans le journal d'audit", async () => {
      const { measureId, revisionId } = await publishSeededMeasure();
      const source = await db.measureSource.create({
        data: {
          measureRevisionId: revisionId,
          sourceKind: "PROGRAMME_CANDIDAT",
          tier: "PRIMARY",
          url: URL_PROGRAMME,
          page: "3",
          publishedAt: new Date("2027-02-01T00:00:00Z"),
        },
      });

      await setSourceExcerpt({ sourceId: source.id, excerpt: EXCERPT, setBy: "relecteur" });

      const after = await db.measureSource.findUniqueOrThrow({ where: { id: source.id } });
      expect(after.excerpt).toBe(EXCERPT);
      const log = await db.auditLog.findFirstOrThrow({
        where: { action: "SET_SOURCE_EXCERPT", entityId: source.id },
      });
      expect(log.userId).toBe("relecteur");
      expect(log.changes).toEqual({ measureId, from: null, to: EXCERPT });
    });

    it("retire l'extrait avec null et garde la valeur précédente dans le journal", async () => {
      const { sourceId } = await publishedMeasureWithExcerpt();

      await setSourceExcerpt({ sourceId, excerpt: null, setBy: "relecteur" });

      const after = await db.measureSource.findUniqueOrThrow({ where: { id: sourceId } });
      expect(after.excerpt).toBeNull();
      const log = await db.auditLog.findFirstOrThrow({
        where: { action: "SET_SOURCE_EXCERPT", entityId: sourceId },
        orderBy: { createdAt: "desc" },
      });
      expect((log.changes as { from: string }).from).toBe(EXCERPT);
    });

    it("refuse une source qui n'est pas un document écrit", async () => {
      const { revisionId } = await publishSeededMeasure();
      const press = await db.measureSource.findFirstOrThrow({
        where: { measureRevisionId: revisionId, sourceKind: "ARTICLE_PRESSE" },
      });

      await expect(
        setSourceExcerpt({ sourceId: press.id, excerpt: EXCERPT, setBy: "relecteur" })
      ).rejects.toThrow(/document écrit/);
      const after = await db.measureSource.findUniqueOrThrow({ where: { id: press.id } });
      expect(after.excerpt).toBeNull();
    });

    it("refuse une révision qui n'est plus la révision publiée", async () => {
      const { measureId, sourceId } = await publishedMeasureWithExcerpt();
      // Un brouillon qui reprend la source : la source du brouillon n'est pas publiée.
      const { revisionId } = await draftMeasureRevision({
        ...draftInput(measureId, "Brouillon."),
        sources: [sourceInput("12")],
      });
      const draftSource = await db.measureSource.findFirstOrThrow({
        where: { measureRevisionId: revisionId },
      });

      await expect(
        setSourceExcerpt({ sourceId: draftSource.id, excerpt: EXCERPT, setBy: "relecteur" })
      ).rejects.toThrow(/révision publiée/);
      // La source de la révision publiée n'a pas bougé.
      const published = await db.measureSource.findUniqueOrThrow({ where: { id: sourceId } });
      expect(published.excerpt).toBe(EXCERPT);
    });

    it("refuse un extrait invalide avant toute écriture", async () => {
      const { sourceId } = await publishedMeasureWithExcerpt();

      await expect(
        setSourceExcerpt({ sourceId, excerpt: "Trop court.", setBy: "relecteur" })
      ).rejects.toThrow(/trop court/i);
      const after = await db.measureSource.findUniqueOrThrow({ where: { id: sourceId } });
      expect(after.excerpt).toBe(EXCERPT);
    });
  });
});
