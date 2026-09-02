import { afterAll, beforeAll, expect, it } from "vitest";

import { deleteSearchDocument, upsertSearchDocument } from "../documents";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { uniqueEntityId } from "./helpers";

// Deferred import, and not a convenience: `@/lib/db` throws at module load when
// DATABASE_URL is unset, so a top-level import would fail the whole suite instead of
// skipping this block. describeIfDisposableDb only skips the block, it cannot undo an import.
let db: typeof import("@/lib/db").db;

describeIfDisposableDb("upsertSearchDocument", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("leaves no row when the caller transaction fails afterwards", async () => {
    const entityId = uniqueEntityId("atomicity");

    await expect(
      db.$transaction(async (tx) => {
        await upsertSearchDocument(tx, {
          entityType: "MEASURE",
          entityId,
          electionId: null,
          title: "Encadrer les loyers",
          body: "Plafonner les loyers dans les zones tendues.",
          url: `/elections/presidentielle-2027/mesures/${entityId}`,
          visibility: "PUBLIC",
          sourceRevisionId: "rev-1",
          sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
        });
        throw new Error("caller failed after indexing");
      })
    ).rejects.toThrow("caller failed after indexing");

    const rows = await db.searchDocument.findMany({ where: { entityType: "MEASURE", entityId } });

    // The primitive must never open its own transaction: if it did, the document
    // would survive the caller's rollback and the index would describe a row that
    // does not exist.
    expect(rows).toHaveLength(0);
  });

  it("fills the search vector on insert", async () => {
    const entityId = uniqueEntityId("insert");

    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, {
        entityType: "MEASURE",
        entityId,
        electionId: null,
        title: "Encadrer les loyers",
        body: "Plafonner les loyers dans les zones tendues.",
        url: `/elections/presidentielle-2027/mesures/${entityId}`,
        visibility: "PUBLIC",
        sourceRevisionId: "rev-1",
        sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
      });
    });

    const rows = await db.$queryRaw<{ lexemes: string | null }[]>`
      SELECT "searchVector"::text AS lexemes
      FROM "SearchDocument"
      WHERE "entityType" = 'MEASURE'::"SearchEntityType" AND "entityId" = ${entityId}
    `;

    expect(rows).toHaveLength(1);
    // The column is nullable and Prisma cannot write it, so a non-null value is the proof
    // that the second statement of the upsert ran at all.
    expect(rows[0]?.lexemes).not.toBeNull();
    expect(rows[0]?.lexemes).toContain("loyers");
    expect(rows[0]?.lexemes).toContain("encadrer");
    // Words from both fields, which is what proves the vector is built from title AND body.
    expect(rows[0]?.lexemes).toContain("tendues");
  });

  it("writes and updates the structured election scope", async () => {
    const entityId = uniqueEntityId("election-scope");
    const base = {
      entityType: "MEASURE" as const,
      entityId,
      title: "Encadrer les loyers",
      body: "Zones tendues.",
      url: `/mesures/${entityId}`,
      visibility: "PUBLIC" as const,
      sourceRevisionId: null,
      sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
    };

    await db.$transaction((tx) =>
      upsertSearchDocument(tx, { ...base, electionId: "election-premiere" })
    );
    await db.$transaction((tx) =>
      upsertSearchDocument(tx, { ...base, electionId: "election-seconde" })
    );

    const row = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId } },
      select: { electionId: true },
    });
    expect(row.electionId).toBe("election-seconde");
  });

  it("recomputes the search vector when the text changes", async () => {
    const entityId = uniqueEntityId("update");
    const base = {
      entityType: "MEASURE" as const,
      entityId,
      electionId: null,
      url: `/elections/presidentielle-2027/mesures/${entityId}`,
      visibility: "PUBLIC" as const,
      sourceRevisionId: "rev-1",
      sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
    };

    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, {
        ...base,
        title: "Encadrer les loyers",
        body: "Zones tendues.",
      });
    });
    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, {
        ...base,
        title: "Geler les loyers",
        body: "Gel pendant trois ans.",
        sourceRevisionId: "rev-2",
      });
    });

    const rows = await db.$queryRaw<{ lexemes: string | null; sourceRevisionId: string }[]>`
      SELECT "searchVector"::text AS lexemes, "sourceRevisionId"
      FROM "SearchDocument"
      WHERE "entityType" = 'MEASURE'::"SearchEntityType" AND "entityId" = ${entityId}
    `;

    // A stale vector is the failure mode the central model exists to prevent: the row is
    // unique on (entityType, entityId), so a second call must overwrite the vector and
    // not leave the previous formulation searchable.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lexemes).toContain("geler");
    expect(rows[0]?.lexemes).not.toContain("encadrer");
    expect(rows[0]?.sourceRevisionId).toBe("rev-2");
  });

  it("keeps the row and its text when visibility drops to ADMIN_ONLY", async () => {
    const entityId = uniqueEntityId("depublish");
    const base = {
      entityType: "MEASURE" as const,
      entityId,
      electionId: null,
      title: "Encadrer les loyers",
      body: "Plafonner les loyers.",
      url: `/elections/presidentielle-2027/mesures/${entityId}`,
      sourceRevisionId: "rev-1",
      sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
    };

    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, { ...base, visibility: "PUBLIC" });
    });
    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, { ...base, visibility: "ADMIN_ONLY" });
    });

    const row = await db.searchDocument.findUnique({
      where: { entityType_entityId: { entityType: "MEASURE", entityId } },
    });
    const rows = await db.$queryRaw<{ lexemes: string | null }[]>`
      SELECT "searchVector"::text AS lexemes
      FROM "SearchDocument"
      WHERE "entityType" = 'MEASURE'::"SearchEntityType" AND "entityId" = ${entityId}
    `;

    // Deleting on depublication would lose the indexed text and force a full
    // reindex to bring the entity back, which spec 7.2 forbids explicitly.
    expect(row).not.toBeNull();
    expect(row?.visibility).toBe("ADMIN_ONLY");
    expect(row?.title).toBe("Encadrer les loyers");
    expect(rows[0]?.lexemes).toContain("loyers");
  });

  it("removes the row when the entity is deleted", async () => {
    const entityId = uniqueEntityId("delete");

    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, {
        entityType: "MEASURE",
        entityId,
        electionId: null,
        title: "Mesure supprimée",
        body: "Corps du document.",
        url: `/elections/presidentielle-2027/mesures/${entityId}`,
        visibility: "PUBLIC",
        sourceRevisionId: null,
        sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
      });
    });

    await db.$transaction(async (tx) => {
      await deleteSearchDocument(tx, "MEASURE", entityId);
    });

    const row = await db.searchDocument.findUnique({
      where: { entityType_entityId: { entityType: "MEASURE", entityId } },
    });
    expect(row).toBeNull();
  });

  it("does not throw when deleting an entity that was never indexed", async () => {
    // Ordinary case, not an error: an entity can be created and deleted while still
    // in draft, before anything ever indexed it.
    await expect(
      db.$transaction(async (tx) => {
        await deleteSearchDocument(tx, "MEASURE", uniqueEntityId("never-indexed"));
      })
    ).resolves.toBeUndefined();
  });
});
