import { afterAll, beforeAll, expect, it } from "vitest";
import { describeIfLocalDb } from "@/test/db-guard";
import { upsertSearchDocument } from "../documents";
import { uniqueEntityId } from "./helpers";

// Deferred import, and not a convenience: `@/lib/db` throws at module load when
// DATABASE_URL is unset, so a top-level import would fail the whole suite instead of
// skipping this block. describeIfLocalDb only skips the block, it cannot undo an import.
let db: typeof import("@/lib/db").db;

// The dictionary name cannot be a bound parameter of to_tsvector, and the unparameterized
// raw-SQL escape hatch is banned by CI, so each dictionary gets its own tagged template.
// That ban is a plain grep over src/, so it also fires on a comment that merely names the
// forbidden method. Hence the periphrasis.
async function lexemes(dictionary: "simple" | "french", word: string): Promise<string> {
  const rows =
    dictionary === "french"
      ? await db.$queryRaw<{ v: string }[]>`SELECT to_tsvector('french', ${word})::text AS v`
      : await db.$queryRaw<{ v: string }[]>`SELECT to_tsvector('simple', ${word})::text AS v`;
  return rows[0]?.v ?? "";
}

describeIfLocalDb("why the french dictionary is unusable here", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("collapses loyer into loi", async () => {
    // Measured at spike 0B. A rent search would return budget bills.
    expect(await lexemes("french", "loyer")).toContain("loi");
    expect(await lexemes("simple", "loyer")).toContain("loyer");
  });

  it("collapses retraite and the plural retraits into the same lexeme", async () => {
    // Measured on 17.10, and NOT what the spike had noted: retraite, retraites,
    // retraits and retraitement all stem to 'retrait', while the singular retrait
    // stems to 'retr'. So the stemmer confuses two unrelated subjects and misses the
    // link between a word and its own plural at the same time. RETRAIT is an act kind
    // of the measure model and retraites is one of the most searched subjects of a
    // presidential campaign, so the collision is not theoretical.
    expect(await lexemes("french", "retraite")).toBe(await lexemes("french", "retraits"));
    expect(await lexemes("french", "retrait")).not.toBe(await lexemes("french", "retraits"));

    expect(await lexemes("simple", "retraite")).not.toBe(await lexemes("simple", "retraits"));
  });

  it("does not even share a lexeme between loyer and loyers", async () => {
    // The stemmer is not merely aggressive, it is inconsistent: the plural is not
    // reduced to the same root as the singular, so it loses recall as well.
    expect(await lexemes("french", "loyers")).not.toBe(await lexemes("french", "loyer"));
  });
});

describeIfLocalDb("domain lexical corpus", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function index(entityId: string, title: string, body: string): Promise<void> {
    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, {
        entityType: "MEASURE",
        entityId,
        title,
        body,
        url: `/elections/presidentielle-2027/mesures/${entityId}`,
        visibility: "PUBLIC",
        sourceRevisionId: null,
        sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
      });
    });
  }

  async function matchesExact(entityId: string, query: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ hit: number }[]>`
      SELECT 1 AS hit FROM "SearchDocument"
      WHERE "entityId" = ${entityId}
        AND "searchVector" @@ plainto_tsquery('simple', unaccent(${query}))
    `;
    return rows.length > 0;
  }

  async function matchesSubstring(entityId: string, query: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ hit: number }[]>`
      SELECT 1 AS hit FROM "SearchDocument"
      WHERE "entityId" = ${entityId}
        AND "searchText" LIKE '%' || lower(unaccent(${query})) || '%'
    `;
    return rows.length > 0;
  }

  it("matches the exact lexeme and nothing around it", async () => {
    const entityId = uniqueEntityId("loyers");
    await index(entityId, "Encadrer les loyers", "Plafonner les loyers dans les zones tendues.");

    expect(await matchesExact(entityId, "loyer")).toBe(false); // exact lexeme only
    expect(await matchesExact(entityId, "loyers")).toBe(true);
    expect(await matchesExact(entityId, "loi")).toBe(false);
  });

  it("does not return a rent measure for a query about loi", async () => {
    const entityId = uniqueEntityId("loyer-singulier");
    await index(entityId, "Plafonner le loyer", "Un loyer de référence par zone.");

    // The singular is the whole point of this fixture. Under the french dictionary
    // "loyer" stems to 'loi', so a query about laws returns this rent measure. The
    // plural "loyers" stems to 'loyer' instead, which is why the plural-only fixture
    // of the test above stays green under a dictionary switch and proves nothing.
    expect(await matchesExact(entityId, "loyer")).toBe(true);
    expect(await matchesExact(entityId, "loi")).toBe(false);
  });

  it("does not return a pension measure for a query about retraits", async () => {
    const entityId = uniqueEntityId("retraites");
    await index(entityId, "Retraite à 60 ans", "Rétablir le départ à la retraite à 60 ans.");

    expect(await matchesExact(entityId, "retraite")).toBe(true);
    // The plural and not the singular: under the french dictionary both this document
    // and the query "retraits" reduce to 'retrait', so the false positive appears. The
    // singular "retrait" reduces to 'retr' and would match nothing, which would leave
    // this test green under a dictionary switch and prove nothing.
    expect(await matchesExact(entityId, "retraits")).toBe(false);
  });

  it("does not confuse impot and import", async () => {
    const entityId = uniqueEntityId("impots");
    // No apostrophe in the fixture on purpose: how the default parser splits "l'impôt"
    // is not what this test is about, and relying on it would make the assertion
    // depend on tokenizer details instead of on the dictionary choice.
    // Singular in the document, so the exact-lexeme assertion is meaningful.
    await index(entityId, "Réforme de la tranche supérieure", "Un impôt progressif sur le revenu.");

    // The document is written with accents and the query is not: this proves unaccent
    // runs on the write side as well as the read side.
    expect(await matchesExact(entityId, "impot")).toBe(true);
    expect(await matchesExact(entityId, "impôt")).toBe(true);
    expect(await matchesExact(entityId, "import")).toBe(false);
  });

  it("recovers the plural through the trigram column", async () => {
    const entityId = uniqueEntityId("trigram");
    await index(entityId, "Encadrer les loyers", "Plafonner les loyers.");

    // This is the division of labour of spec 7.2: the tsvector index answers exact
    // words with no false positive, the trigram column catches the morphological
    // variants the simple dictionary cannot.
    expect(await matchesExact(entityId, "loyer")).toBe(false);
    expect(await matchesSubstring(entityId, "loyer")).toBe(true);
  });
});
