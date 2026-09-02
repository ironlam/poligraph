import { afterAll, beforeAll, expect, it } from "vitest";

import { upsertSearchDocument } from "../documents";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { uniqueEntityId, uniqueToken } from "./helpers";

// Two deferred imports, and neither is a convenience. `@/lib/db` throws at module load
// when DATABASE_URL is unset, and `../query` imports it as a VALUE, unlike
// `../documents` which only imports its type. A top-level import of either would fail
// the whole suite instead of skipping this block: describeIfDisposableDb skips a block, it
// cannot undo an import.
let db: typeof import("@/lib/db").db;
let searchPublic: typeof import("../query").searchPublic;
let searchPublicPage: typeof import("../query").searchPublicPage;

async function index(
  entityId: string,
  title: string,
  visibility: "PUBLIC" | "ADMIN_ONLY",
  electionId: string | null = null
): Promise<void> {
  await db.$transaction(async (tx) => {
    await upsertSearchDocument(tx, {
      entityType: "MEASURE",
      entityId,
      electionId,
      title,
      body: "Corps du document.",
      url: `/elections/presidentielle-2027/mesures/${entityId}`,
      visibility,
      sourceRevisionId: null,
      sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
    });
  });
}

describeIfDisposableDb("searchPublic", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ searchPublic, searchPublicPage } = await import("../query"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("never returns an ADMIN_ONLY document", async () => {
    const token = uniqueToken();
    const hidden = uniqueEntityId("hidden");
    await index(hidden, `Mesure confidentielle ${token}`, "ADMIN_ONLY");

    const hits = await searchPublic(token);

    expect(hits.map((h) => h.entityId)).not.toContain(hidden);
    expect(hits).toHaveLength(0);
  });

  it("filters inside the query and not after it", async () => {
    const token = uniqueToken();
    const hidden = uniqueEntityId("hidden");
    const shown = uniqueEntityId("shown");
    await index(hidden, `Confidentielle ${token}`, "ADMIN_ONLY");
    await index(shown, `Publique ${token}`, "PUBLIC");

    // Both documents match. With a limit of 1, a filter applied after the SQL would
    // let the hidden row consume the only slot and return nothing, or worse return it.
    // "Confidentielle" also sorts before "Publique", so a missing filter surfaces it first.
    const hits = await searchPublic(token, 1);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.entityId).toBe(shown);
  });

  it("scopes both lexical passes and the total to one election", async () => {
    const token = uniqueToken();
    const electionA = uniqueEntityId("election-a");
    const electionB = uniqueEntityId("election-b");
    const exactA = uniqueEntityId("exact-a");
    const variantA = uniqueEntityId("variant-a");
    const otherElection = uniqueEntityId("other-election");

    await index(exactA, `Plafonner le loyer ${token}`, "PUBLIC", electionA);
    await index(variantA, `Encadrer les loyers ${token}`, "PUBLIC", electionA);
    await index(otherElection, `Encadrer les loyers ${token}`, "PUBLIC", electionB);

    const page = await searchPublicPage(`loyer ${token}`, { electionId: electionA, limit: 10 });

    expect(page.hits.map((hit) => hit.entityId)).toEqual(
      expect.arrayContaining([exactA, variantA])
    );
    expect(page.hits.map((hit) => hit.entityId)).not.toContain(otherElection);
    expect(page.total).toBe(2);
  });

  it("keeps the historical unscoped call compatible", async () => {
    const token = uniqueToken();
    const electionA = uniqueEntityId("election-a");
    const electionB = uniqueEntityId("election-b");
    const first = uniqueEntityId("first");
    const second = uniqueEntityId("second");
    await index(first, `Mesure ${token}`, "PUBLIC", electionA);
    await index(second, `Mesure ${token}`, "PUBLIC", electionB);

    const hits = await searchPublic(token);

    expect(hits.map((hit) => hit.entityId)).toEqual(expect.arrayContaining([first, second]));
  });

  it("returns both the exact match and the morphological variant, exact first", async () => {
    const token = uniqueToken();
    const singular = uniqueEntityId("singular");
    const plural = uniqueEntityId("plural");
    await index(singular, `Plafonner le loyer ${token}`, "PUBLIC");
    await index(plural, `Encadrer les loyers ${token}`, "PUBLIC");

    const hits = await searchPublic(`loyer ${token}`);
    const ids = hits.map((h) => h.entityId);

    // The decisive case. Under the simple dictionary "loyer" is a lexeme of the first
    // document only, so an implementation that stops as soon as the exact pass returns
    // something would silently drop the plural, which is the exact thing the variant
    // pass exists to catch.
    expect(ids).toContain(singular);
    expect(ids).toContain(plural);
    expect(ids.indexOf(singular)).toBeLessThan(ids.indexOf(plural));
  });

  it("finds a variant even when another term of the query matches exactly", async () => {
    const token = uniqueToken();
    const entityId = uniqueEntityId("multiterm");
    await index(entityId, `Encadrer les loyers ${token}`, "PUBLIC");

    // Two terms, one that matches exactly and one that only its plural variant matches.
    // The fallback has to work term by term: a pass comparing the whole query at once
    // never relates "loyer <token>" to "loyers <token>".
    const hits = await searchPublic(`loyer ${token}`);

    expect(hits.map((h) => h.entityId)).toContain(entityId);
  });

  it("ignores case, accents and repeated whitespace", async () => {
    const token = uniqueToken();
    const entityId = uniqueEntityId("accents");
    await index(entityId, `Réforme fiscale et impôt ${token}`, "PUBLIC");

    const hits = await searchPublic(`   IMPÔT    ${token}  `);

    expect(hits.map((h) => h.entityId)).toContain(entityId);
  });

  it("returns nothing for an empty or whitespace-only query", async () => {
    expect(await searchPublic("")).toEqual([]);
    expect(await searchPublic("   ")).toEqual([]);
  });

  it("does not return retraite for retrait", async () => {
    const token = uniqueToken();
    const retraite = uniqueEntityId("retraite");
    await index(retraite, `Retraite à 60 ans ${token}`, "PUBLIC");

    const hits = await searchPublic(`retrait ${token}`);

    // The false positive the whole dictionary choice exists to avoid, asserted on the
    // public entry point and not on one SQL pass. The exact pass avoids it, so it can
    // only come back through the fallback: "retrait" is a prefix of "retraite", exactly
    // like "loyer" is a prefix of "loyers", so any loose match recovers both.
    expect(hits.map((hit) => hit.entityId)).not.toContain(retraite);
  });

  it("does not invent a singular by stripping a trailing s", async () => {
    const token = uniqueToken();
    const faith = uniqueEntityId("foi");
    const court = uniqueEntityId("cour");
    await index(faith, `Une question de foi ${token}`, "PUBLIC");
    await index(court, `Saisir la Cour des comptes ${token}`, "PUBLIC");

    // Deriving the singular by dropping an s invents French: fois gives foi, cours gives
    // cour, pays gives pay. Both words below are ordinary in this corpus, and "cours"
    // returning the Cour des comptes is the same class of false positive the simple
    // dictionary was chosen to avoid.
    expect((await searchPublic(`fois ${token}`)).map((h) => h.entityId)).not.toContain(faith);
    expect((await searchPublic(`cours ${token}`)).map((h) => h.entityId)).not.toContain(court);
  });

  it("does not reach a singular document from a plural query, and that is the accepted cost", async () => {
    const token = uniqueToken();
    const singular = uniqueEntityId("asymmetry");
    await index(singular, `Plafonner le loyer ${token}`, "PUBLIC");

    // The counterpart of the rule above, asserted rather than left to be discovered: the
    // expansion runs in one direction. Making it symmetric needs a morphological lexicon
    // with its exceptions, which is lot 7's subject. This test is here to fail the day
    // someone believes the substrate already does it.
    expect((await searchPublic(`loyers ${token}`)).map((h) => h.entityId)).not.toContain(singular);
    expect((await searchPublic(`loyer ${token}`)).map((h) => h.entityId)).toContain(singular);
  });

  it("treats LIKE wildcards as ordinary characters", async () => {
    const token = uniqueToken();
    const entityId = uniqueEntityId("wildcard");
    await index(entityId, `Encadrer les loyers ${token}`, "PUBLIC");

    // A bound parameter is safe against injection but its characters are still read
    // with LIKE semantics: "%%%" builds a pattern that matches every public document,
    // and "_" matches any single character.
    expect(await searchPublic("%%%")).toEqual([]);
    expect(await searchPublic("___")).toEqual([]);
    expect((await searchPublic(`%oyer% ${token}`)).map((h) => h.entityId)).not.toContain(entityId);
  });

  it("still derives the plural when the term carries punctuation", async () => {
    const token = uniqueToken();
    const entityId = uniqueEntityId("punctuation");
    await index(entityId, `Encadrer les loyers ${token}`, "PUBLIC");

    // The singular with a trailing comma against a document holding the plural. This is
    // where punctuation normalization earns its place: on the raw term the derived plural
    // would be "loyer,s", which plainto_tsquery reads as two lexemes and never matches.
    // plainto_tsquery cleans up punctuation on its own, so a query already spelled the
    // way the document is would pass without any normalization and prove nothing.
    const hits = await searchPublic(`loyer, ${token}`);

    expect(hits.map((h) => h.entityId)).toContain(entityId);
  });

  it("bounds the limit instead of passing it through to SQL", async () => {
    const token = uniqueToken();
    await index(uniqueEntityId("bounded"), `Encadrer les loyers ${token}`, "PUBLIC");

    // A negative LIMIT is an error in PostgreSQL, so an unbounded limit turns a caller
    // mistake into a 500. An excessive one turns a search box into a bulk export.
    await expect(searchPublic(token, -1)).resolves.toHaveLength(1);
    await expect(searchPublic(token, 0)).resolves.toHaveLength(1);
    await expect(searchPublic(token, 10_000)).resolves.toHaveLength(1);
  });

  it("caps the query length at 200 characters", async () => {
    // A 10 000 character query must not reach plainto_tsquery: it would be parsed in
    // full for nothing. The assertion is that the call returns instead of throwing.
    await expect(searchPublic("a".repeat(10_000))).resolves.toEqual([]);
  });
});
