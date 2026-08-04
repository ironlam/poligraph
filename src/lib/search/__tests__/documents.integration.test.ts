import { afterAll, beforeAll, expect, it } from "vitest";
import { describeIfLocalDb } from "@/test/db-guard";
import { deleteSearchDocument, upsertSearchDocument } from "../documents";
import { uniqueEntityId } from "./helpers";

// Deferred import, and not a convenience: `@/lib/db` throws at module load when
// DATABASE_URL is unset, so a top-level import would fail the whole suite instead of
// skipping this block. describeIfLocalDb only skips the block, it cannot undo an import.
let db: typeof import("@/lib/db").db;

describeIfLocalDb("upsertSearchDocument", () => {
  beforeAll(async () => {
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

  it("fills both derived columns on insert", async () => {
    const entityId = uniqueEntityId("insert");

    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, {
        entityType: "MEASURE",
        entityId,
        title: "Encadrer les loyers",
        body: "Plafonner les loyers dans les zones tendues.",
        url: `/elections/presidentielle-2027/mesures/${entityId}`,
        visibility: "PUBLIC",
        sourceRevisionId: "rev-1",
        sourceUpdatedAt: new Date("2026-08-04T10:00:00Z"),
      });
    });

    const rows = await db.$queryRaw<{ searchText: string; lexemes: string }[]>`
      SELECT "searchText", "searchVector"::text AS lexemes
      FROM "SearchDocument"
      WHERE "entityType" = 'MEASURE'::"SearchEntityType" AND "entityId" = ${entityId}
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.searchText).toContain("encadrer les loyers");
    expect(rows[0]?.lexemes).toContain("loyers");
    // The default is an empty string: a non-empty value proves the second statement ran.
    expect(rows[0]?.searchText).not.toBe("");
  });

  it("recomputes the derived columns when the text changes", async () => {
    const entityId = uniqueEntityId("update");
    const base = {
      entityType: "MEASURE" as const,
      entityId,
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

    const rows = await db.$queryRaw<{ searchText: string; sourceRevisionId: string }[]>`
      SELECT "searchText", "sourceRevisionId"
      FROM "SearchDocument"
      WHERE "entityType" = 'MEASURE'::"SearchEntityType" AND "entityId" = ${entityId}
    `;

    // A stale searchText is the failure mode the central model exists to prevent:
    // the row is unique on (entityType, entityId), so a second call must overwrite
    // the derived columns and not leave the previous formulation searchable.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.searchText).toContain("geler");
    expect(rows[0]?.searchText).not.toContain("encadrer");
    expect(rows[0]?.sourceRevisionId).toBe("rev-2");
  });

  it("keeps the row and its text when visibility drops to ADMIN_ONLY", async () => {
    const entityId = uniqueEntityId("depublish");
    const base = {
      entityType: "MEASURE" as const,
      entityId,
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

    // Deleting on depublication would lose the indexed text and force a full
    // reindex to bring the entity back, which spec 7.2 forbids explicitly.
    expect(row).not.toBeNull();
    expect(row?.visibility).toBe("ADMIN_ONLY");
    expect(row?.searchText).toContain("loyers");
  });

  it("removes the row when the entity is deleted", async () => {
    const entityId = uniqueEntityId("delete");

    await db.$transaction(async (tx) => {
      await upsertSearchDocument(tx, {
        entityType: "MEASURE",
        entityId,
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
