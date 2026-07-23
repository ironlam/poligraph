import { describe, it, expect, afterAll, beforeAll } from "vitest";
import type { NormalizedAmendment } from "@/services/sync/amendments-an/types";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

type Writer = typeof import("@/services/sync/amendments-an/writer");
let db: typeof import("@/lib/db").db;
let writeAmendmentBatch: Writer["writeAmendmentBatch"];
let resolveParents: Writer["resolveParents"];
let resolveIdenticalGroups: Writer["resolveIdenticalGroups"];
let computeIdenticalGroupKey: Writer["computeIdenticalGroupKey"];

const base = (over: Partial<NormalizedAmendment>): NormalizedAmendment => ({
  externalId: "TEST_AMW_x",
  number: "1",
  texteRef: "PIONANR_T",
  dossierRefFromPath: null,
  article: null,
  content: null,
  summary: null,
  status: "DEPOSE",
  parentExternalId: null,
  identicalDiscussionId: null,
  authorType: null,
  authorName: null,
  legislature: 17,
  chamber: "AN",
  ...over,
});

describeIfDb("amendments-an writer", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ writeAmendmentBatch, resolveParents, resolveIdenticalGroups, computeIdenticalGroupKey } =
      await import("@/services/sync/amendments-an/writer"));
  });

  afterAll(async () => {
    await db.amendment.deleteMany({ where: { externalId: { startsWith: "TEST_AMW_" } } });
  });

  describe("writeAmendmentBatch", () => {
    it("upserts idempotently by externalId (2nd identical run writes nothing)", async () => {
      const batch = [
        base({ externalId: "TEST_AMW_a", number: "CL8" }),
        base({ externalId: "TEST_AMW_b", number: "I-390" }),
      ];
      const r1 = await writeAmendmentBatch(batch);
      expect(r1.created).toBe(2);
      expect(r1.updated).toBe(0);

      // Identical re-import is now a no-op: classified unchanged, no update issued.
      const r2 = await writeAmendmentBatch(batch);
      expect(r2.created).toBe(0);
      expect(r2.updated).toBe(0);
      expect(r2.unchanged).toBe(2);
      expect(r2.changedSubstanceAmendmentIds).toEqual([]);

      const a = await db.amendment.findUnique({ where: { externalId: "TEST_AMW_a" } });
      expect(a?.number).toBe("CL8");
    });

    it("classifies created / unchanged / metadata-only / content / summary and signals substance once", async () => {
      // Seed five existing rows.
      await writeAmendmentBatch([
        base({
          externalId: "TEST_AMW_m_same",
          content: "le dispositif inchange",
          summary: "expose stable",
          status: "DEPOSE",
        }),
        base({
          externalId: "TEST_AMW_m_meta",
          content: "le dispositif stable",
          summary: "expose stable",
          status: "DEPOSE",
        }),
        base({
          externalId: "TEST_AMW_m_content",
          content: "ancien dispositif",
          summary: "expose stable",
        }),
        base({
          externalId: "TEST_AMW_m_summary",
          content: "dispositif stable",
          summary: "ancien expose",
        }),
        base({
          externalId: "TEST_AMW_m_both",
          content: "ancien dispositif",
          summary: "ancien expose",
        }),
      ]);

      const r = await writeAmendmentBatch([
        // identical -> unchanged
        base({
          externalId: "TEST_AMW_m_same",
          content: "le dispositif inchange",
          summary: "expose stable",
          status: "DEPOSE",
        }),
        // only status changed -> metadata only, no substance signal
        base({
          externalId: "TEST_AMW_m_meta",
          content: "le dispositif stable",
          summary: "expose stable",
          status: "ADOPTE",
        }),
        // content changed, summary same -> substance
        base({
          externalId: "TEST_AMW_m_content",
          content: "nouveau dispositif complete",
          summary: "expose stable",
        }),
        // summary changed, content same -> substance
        base({
          externalId: "TEST_AMW_m_summary",
          content: "dispositif stable",
          summary: "expose reecrit",
        }),
        // both changed -> substance, signalled ONCE
        base({
          externalId: "TEST_AMW_m_both",
          content: "nouveau dispositif",
          summary: "nouvel expose",
        }),
        // brand new -> created
        base({ externalId: "TEST_AMW_m_new", content: "tout neuf" }),
      ]);

      expect(r.created).toBe(1);
      expect(r.unchanged).toBe(1);
      expect(r.metadataOnly).toBe(1);
      expect(r.contentChanged).toBe(2); // m_content + m_both
      expect(r.summaryChanged).toBe(2); // m_summary + m_both
      expect(r.substanceChanged).toBe(3); // m_content + m_summary + m_both (m_both once)
      expect(r.updated).toBe(4); // substanceChanged (3) + metadataOnly (1)

      // Signal carries exactly the three substance-changed cuids, m_both only once.
      const substanceRows = await db.amendment.findMany({
        where: {
          externalId: { in: ["TEST_AMW_m_content", "TEST_AMW_m_summary", "TEST_AMW_m_both"] },
        },
        select: { id: true },
      });
      const expectedIds = substanceRows.map((row) => row.id).sort();
      expect(r.changedSubstanceAmendmentIds).toHaveLength(3);
      expect([...r.changedSubstanceAmendmentIds].sort()).toEqual(expectedIds);

      // Metadata-only row got its status updated but kept its substance.
      const metaRow = await db.amendment.findUnique({
        where: { externalId: "TEST_AMW_m_meta" },
      });
      expect(metaRow?.status).toBe("ADOPTE");
      expect(metaRow?.content).toBe("le dispositif stable");
      expect(metaRow?.summary).toBe("expose stable");
    });

    it("reports dossier-resolved vs unresolved counts", async () => {
      const batch = [
        base({
          externalId: "TEST_AMW_d1",
          dossierRefFromPath: "TEST_AMW_NON_EXISTENT_DOSSIER_REF_1",
        }),
        base({ externalId: "TEST_AMW_d2", dossierRefFromPath: null }),
      ];
      const r = await writeAmendmentBatch(batch);
      expect(r.dossiersResolved).toBe(0);
      expect(r.dossiersUnresolved).toBe(1); // d1 had a non-existent ref; d2 had no ref (not counted either way)
    });
  });

  describe("resolveParents", () => {
    it("resolves parent links in a second pass regardless of order", async () => {
      await writeAmendmentBatch([
        base({ externalId: "TEST_AMW_child", parentExternalId: "TEST_AMW_parent" }),
        base({ externalId: "TEST_AMW_parent" }),
      ]);
      const stats = await resolveParents([
        base({ externalId: "TEST_AMW_child", parentExternalId: "TEST_AMW_parent" }),
      ]);
      expect(stats.resolved).toBe(1);
      expect(stats.deferred).toBe(0);
      const child = await db.amendment.findUnique({
        where: { externalId: "TEST_AMW_child" },
        include: { parentAmendment: true },
      });
      expect(child?.parentAmendment?.externalId).toBe("TEST_AMW_parent");
    });

    it("defers parents that aren't in the DB yet", async () => {
      await writeAmendmentBatch([
        base({ externalId: "TEST_AMW_orphan", parentExternalId: "TEST_AMW_missing_parent" }),
      ]);
      const stats = await resolveParents([
        base({ externalId: "TEST_AMW_orphan", parentExternalId: "TEST_AMW_missing_parent" }),
      ]);
      expect(stats.resolved).toBe(0);
      expect(stats.deferred).toBe(1);
    });

    it("batches two children of the same parent into one pass, and is idempotent on re-run", async () => {
      await writeAmendmentBatch([
        base({ externalId: "TEST_AMW_bp_parent" }),
        base({ externalId: "TEST_AMW_bp_child1", parentExternalId: "TEST_AMW_bp_parent" }),
        base({ externalId: "TEST_AMW_bp_child2", parentExternalId: "TEST_AMW_bp_parent" }),
      ]);
      const refs = [
        base({ externalId: "TEST_AMW_bp_child1", parentExternalId: "TEST_AMW_bp_parent" }),
        base({ externalId: "TEST_AMW_bp_child2", parentExternalId: "TEST_AMW_bp_parent" }),
      ];

      const stats = await resolveParents(refs);
      expect(stats.resolved).toBe(2);
      expect(stats.deferred).toBe(0);

      const [child1, child2] = await Promise.all([
        db.amendment.findUnique({
          where: { externalId: "TEST_AMW_bp_child1" },
          include: { parentAmendment: true },
        }),
        db.amendment.findUnique({
          where: { externalId: "TEST_AMW_bp_child2" },
          include: { parentAmendment: true },
        }),
      ]);
      expect(child1?.parentAmendment?.externalId).toBe("TEST_AMW_bp_parent");
      expect(child2?.parentAmendment?.externalId).toBe("TEST_AMW_bp_parent");

      // Re-run: already-correct FKs must not error and must remain correct
      // (the NULL-or-different OR clause makes the updateMany a no-op here).
      const rerun = await resolveParents(refs);
      expect(rerun.resolved).toBe(2);
      expect(rerun.deferred).toBe(0);

      const [child1Again, child2Again] = await Promise.all([
        db.amendment.findUnique({
          where: { externalId: "TEST_AMW_bp_child1" },
          include: { parentAmendment: true },
        }),
        db.amendment.findUnique({
          where: { externalId: "TEST_AMW_bp_child2" },
          include: { parentAmendment: true },
        }),
      ]);
      expect(child1Again?.parentAmendment?.externalId).toBe("TEST_AMW_bp_parent");
      expect(child2Again?.parentAmendment?.externalId).toBe("TEST_AMW_bp_parent");
    });
  });

  describe("resolveIdenticalGroups", () => {
    it("computes a deterministic key shared across a group", async () => {
      await writeAmendmentBatch([
        base({ externalId: "TEST_AMW_i1", identicalDiscussionId: "G1" }),
        base({ externalId: "TEST_AMW_i2", identicalDiscussionId: "G1" }),
      ]);
      const stats = await resolveIdenticalGroups([
        base({ externalId: "TEST_AMW_i1", identicalDiscussionId: "G1" }),
        base({ externalId: "TEST_AMW_i2", identicalDiscussionId: "G1" }),
      ]);
      expect(stats.groups).toBe(1);
      const i1 = await db.amendment.findUnique({ where: { externalId: "TEST_AMW_i1" } });
      const i2 = await db.amendment.findUnique({ where: { externalId: "TEST_AMW_i2" } });
      expect(i1?.identicalGroupKey).toBeTruthy();
      expect(i1?.identicalGroupKey).toBe(i2?.identicalGroupKey);
    });

    it("computeIdenticalGroupKey is deterministic for the same discussion id", () => {
      expect(computeIdenticalGroupKey("ABC")).toBe(computeIdenticalGroupKey("ABC"));
      expect(computeIdenticalGroupKey("ABC")).not.toBe(computeIdenticalGroupKey("XYZ"));
    });
  });
});
