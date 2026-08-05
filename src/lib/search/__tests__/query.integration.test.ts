import { afterAll, beforeAll, expect, it } from "vitest";
import { describeIfLocalDb } from "@/test/db-guard";
import { upsertSearchDocument } from "../documents";
import { uniqueEntityId, uniqueToken } from "./helpers";

// Two deferred imports, and neither is a convenience. `@/lib/db` throws at module load
// when DATABASE_URL is unset, and `../query` imports it as a VALUE, unlike
// `../documents` which only imports its type. A top-level import of either would fail
// the whole suite instead of skipping this block: describeIfLocalDb skips a block, it
// cannot undo an import.
let db: typeof import("@/lib/db").db;
let searchPublic: typeof import("../query").searchPublic;

async function index(
  entityId: string,
  title: string,
  visibility: "PUBLIC" | "ADMIN_ONLY"
): Promise<void> {
  await db.$transaction(async (tx) => {
    await upsertSearchDocument(tx, {
      entityType: "MEASURE",
      entityId,
      title,
      body: "Corps du document.",
      url: `/elections/presidentielle-2027/mesures/${entityId}`,
      visibility,
      sourceRevisionId: null,
      sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
    });
  });
}

describeIfLocalDb("searchPublic", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ searchPublic } = await import("../query"));
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
    // something would silently drop the plural, which is the exact thing the trigram
    // column exists to catch.
    expect(ids).toContain(singular);
    expect(ids).toContain(plural);
    expect(ids.indexOf(singular)).toBeLessThan(ids.indexOf(plural));
  });

  it("finds a variant even when another term of the query matches exactly", async () => {
    const token = uniqueToken();
    const entityId = uniqueEntityId("multiterm");
    await index(entityId, `Encadrer les loyers ${token}`, "PUBLIC");

    // Two terms, one exact and one that only the trigram pass can match. A fallback
    // comparing the whole query as one substring fails here: "loyer <token>" is not a
    // substring of "loyers <token>", the plural breaks the run.
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

  it("caps the query length at 200 characters", async () => {
    // A 10 000 character query must not reach plainto_tsquery: it would be parsed in
    // full for nothing. The assertion is that the call returns instead of throwing.
    await expect(searchPublic("a".repeat(10_000))).resolves.toEqual([]);
  });
});
