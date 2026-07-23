import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import yazl from "yazl";

// DB-backed: run via `npm run test:db:477 -- <this file>`. Skipped (and the file
// stays loadable) when DATABASE_URL is unset — db-touching modules are imported
// dynamically in beforeAll, exactly like writer.test.ts.
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

let db: typeof import("@/lib/db").db;
let syncAmendmentsAN: typeof import("@/services/sync/amendments-an").syncAmendmentsAN;
let syncMetadata: typeof import("@/lib/sync").syncMetadata;
let dossierSignatureKey: typeof import("@/services/sync/amendments-an/signature-store").dossierSignatureKey;
let loadStoredDossierSignatures: typeof import("@/services/sync/amendments-an/signature-store").loadStoredDossierSignatures;

/** Valid amendment JSON in the AN feed shape. externalId = uid. */
function amendmentJson(uid: string, numero: string, dispositif: string): string {
  return JSON.stringify({
    amendement: {
      uid,
      identification: { numeroLong: numero },
      texteLegislatifRef: "PIONANR5L17B1432",
      corps: { contenuAuteur: { dispositif, exposeSommaire: `<p>expose ${uid}</p>` } },
      cycleDeVie: { sort: "En construction" },
      amendementParentRef: { "@xsi:nil": "true" },
      discussionIdentique: { "@xsi:nil": "true" },
      pointeurFragmentTexte: { division: { articleDesignation: "Article 1" } },
      signataires: { auteur: { typeAuteur: "Député" }, libelle: "M. Test" },
      legislature: "17",
    },
  });
}

let tmpDir: string;

/** Writes a ZIP from [entryPath, content] pairs. */
async function buildZip(name: string, entries: [string, string][]): Promise<string> {
  const zp = path.join(tmpDir, name);
  const zf = new yazl.ZipFile();
  for (const [entryPath, content] of entries) zf.addBuffer(Buffer.from(content), entryPath);
  zf.end();
  await new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];
    zf.outputStream.on("data", (c) => chunks.push(c as Buffer));
    zf.outputStream.on("end", () => {
      writeFileSync(zp, Buffer.concat(chunks));
      resolve();
    });
    zf.outputStream.on("error", reject);
  });
  return zp;
}

const entryPath = (dlr: string, uid: string) => `json/${dlr}/PIONANR5L17B1432/${uid}.json`;

describeIfDb("syncAmendmentsAN incremental ingestion", () => {
  const USED_LEGISLATURES = [91, 92, 93, 95, 96, 97];

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ syncAmendmentsAN } = await import("@/services/sync/amendments-an"));
    ({ syncMetadata } = await import("@/lib/sync"));
    ({ dossierSignatureKey, loadStoredDossierSignatures } =
      await import("@/services/sync/amendments-an/signature-store"));

    tmpDir = mkdtempSync(path.join(os.tmpdir(), "incremental-ingest-"));
    await db.amendment.deleteMany({ where: { externalId: { startsWith: "TEST_INC_" } } });
    for (const leg of USED_LEGISLATURES) await syncMetadata.reset(dossierSignatureKey(leg));
  });

  afterAll(async () => {
    await db.amendment.deleteMany({ where: { externalId: { startsWith: "TEST_INC_" } } });
    for (const leg of USED_LEGISLATURES) await syncMetadata.reset(dossierSignatureKey(leg));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("[1] identical ZIP on the second run: 0 dossiers changed, 0 writes", async () => {
    const leg = 91;
    const dlr = "DLR5L17N91001";
    const entries: [string, string][] = [
      [entryPath(dlr, "TEST_INC_T1_a1"), amendmentJson("TEST_INC_T1_a1", "1", "<p>d1</p>")],
      [entryPath(dlr, "TEST_INC_T1_a2"), amendmentJson("TEST_INC_T1_a2", "2", "<p>d2</p>")],
    ];
    const zip = await buildZip("t1.zip", entries);

    const r1 = await syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "incremental" });
    expect(r1.amendmentsCreated).toBe(2);
    expect(r1.dossiersChanged).toBe(1);

    const r2 = await syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "incremental" });
    expect(r2.dossiersInspected).toBe(1);
    expect(r2.dossiersChanged).toBe(0);
    expect(r2.amendmentsCreated).toBe(0);
    expect(r2.amendmentsUpdated).toBe(0);
  });

  it("[2] new dossier added: only the new dossier is parsed and its rows created", async () => {
    const leg = 92;
    const d1 = "DLR5L17N92001";
    const d2 = "DLR5L17N92002";
    const base: [string, string][] = [
      [entryPath(d1, "TEST_INC_T2_a1"), amendmentJson("TEST_INC_T2_a1", "1", "<p>d1a1</p>")],
      [entryPath(d1, "TEST_INC_T2_a2"), amendmentJson("TEST_INC_T2_a2", "2", "<p>d1a2</p>")],
    ];
    await syncAmendmentsAN({
      zipPath: await buildZip("t2-base.zip", base),
      legislature: leg,
      mode: "incremental",
    });

    const withNew: [string, string][] = [
      ...base,
      [entryPath(d2, "TEST_INC_T2_b1"), amendmentJson("TEST_INC_T2_b1", "3", "<p>d2b1</p>")],
    ];
    const r = await syncAmendmentsAN({
      zipPath: await buildZip("t2-new.zip", withNew),
      legislature: leg,
      mode: "incremental",
    });

    expect(r.dossiersInspected).toBe(2);
    expect(r.dossiersChanged).toBe(1); // only D2
    expect(r.amendmentsSeen).toBe(1); // only D2's entry was decompressed (D1 skipped)
    expect(r.amendmentsCreated).toBe(1);
    const created = await db.amendment.findUnique({ where: { externalId: "TEST_INC_T2_b1" } });
    expect(created).not.toBeNull();
  });

  it("[3] existing dossier changed (one entry's content differs): reparsed and updated", async () => {
    const leg = 93;
    const dlr = "DLR5L17N93001";
    const base: [string, string][] = [
      [entryPath(dlr, "TEST_INC_T3_a1"), amendmentJson("TEST_INC_T3_a1", "1", "<p>original</p>")],
      [entryPath(dlr, "TEST_INC_T3_a2"), amendmentJson("TEST_INC_T3_a2", "2", "<p>stable</p>")],
    ];
    await syncAmendmentsAN({
      zipPath: await buildZip("t3-base.zip", base),
      legislature: leg,
      mode: "incremental",
    });

    const changed: [string, string][] = [
      [entryPath(dlr, "TEST_INC_T3_a1"), amendmentJson("TEST_INC_T3_a1", "1", "<p>REWRITTEN</p>")],
      [entryPath(dlr, "TEST_INC_T3_a2"), amendmentJson("TEST_INC_T3_a2", "2", "<p>stable</p>")],
    ];
    const r = await syncAmendmentsAN({
      zipPath: await buildZip("t3-changed.zip", changed),
      legislature: leg,
      mode: "incremental",
    });

    expect(r.dossiersChanged).toBe(1);
    expect(r.amendmentsSeen).toBe(2); // whole dossier reparsed
    expect(r.amendmentsSubstanceChanged).toBe(1);
    const a1 = await db.amendment.findUnique({ where: { externalId: "TEST_INC_T3_a1" } });
    expect(a1?.content).toBe("<p>REWRITTEN</p>");
  });

  it("[5] resume after interruption: sigs not persisted on throw; reprocessed idempotently", async () => {
    const leg = 95;
    const dlr = "DLR5L17N95001";
    const entries: [string, string][] = [
      [entryPath(dlr, "TEST_INC_T5_a1"), amendmentJson("TEST_INC_T5_a1", "1", "<p>x1</p>")],
      [entryPath(dlr, "TEST_INC_T5_a2"), amendmentJson("TEST_INC_T5_a2", "2", "<p>x2</p>")],
    ];
    const zip = await buildZip("t5.zip", entries);

    // First successful run: rows written + signatures persisted.
    const r1 = await syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "incremental" });
    expect(r1.amendmentsCreated).toBe(2);
    const countAfter1 = await db.amendment.count({
      where: { externalId: { startsWith: "TEST_INC_T5_" } },
    });

    // Simulate an interrupted run: the on-success signature write (the last DB op)
    // never happened. Rows remain; the stored baseline is back to empty.
    await syncMetadata.reset(dossierSignatureKey(leg));

    // Next run reprocesses the same dossier (sigs empty) WITHOUT duplicating rows.
    const r2 = await syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "incremental" });
    expect(r2.dossiersChanged).toBe(1);
    expect(r2.amendmentsCreated).toBe(0);
    expect(r2.amendmentsUnchanged).toBe(2);
    const countAfter2 = await db.amendment.count({
      where: { externalId: { startsWith: "TEST_INC_T5_" } },
    });
    expect(countAfter2).toBe(countAfter1);

    // A genuine throw leaves the stored signatures untouched (cap fires before
    // the signature write), so a resume still sees work to do.
    await syncMetadata.reset(dossierSignatureKey(leg));
    await expect(
      syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "incremental", safetyCap: 1 })
    ).rejects.toThrow(/safety cap/i);
    expect(await loadStoredDossierSignatures(leg)).toEqual({});
  });

  it("[6] full resync processes every dossier regardless of stored signatures", async () => {
    const leg = 96;
    const d1 = "DLR5L17N96001";
    const d2 = "DLR5L17N96002";
    const entries: [string, string][] = [
      [entryPath(d1, "TEST_INC_T6_a1"), amendmentJson("TEST_INC_T6_a1", "1", "<p>a1</p>")],
      [entryPath(d1, "TEST_INC_T6_a2"), amendmentJson("TEST_INC_T6_a2", "2", "<p>a2</p>")],
      [entryPath(d2, "TEST_INC_T6_b1"), amendmentJson("TEST_INC_T6_b1", "3", "<p>b1</p>")],
    ];
    const zip = await buildZip("t6.zip", entries);

    // Baseline via incremental so signatures match the feed.
    await syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "incremental" });

    // Full mode ignores the matching signatures and still walks every dossier.
    const r = await syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "full" });
    expect(r.dossiersInspected).toBe(2);
    expect(r.dossiersChanged).toBe(2); // all, despite unchanged signatures
    expect(r.amendmentsSeen).toBe(3); // every entry processed
    expect(r.amendmentsUnchanged).toBe(3); // idempotent: no dup writes
  });

  it("[7] no new content: fast path decompresses nothing", async () => {
    const leg = 97;
    const dlr = "DLR5L17N97001";
    const entries: [string, string][] = [
      [entryPath(dlr, "TEST_INC_T7_a1"), amendmentJson("TEST_INC_T7_a1", "1", "<p>c1</p>")],
    ];
    const zip = await buildZip("t7.zip", entries);

    await syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "incremental" });
    const r = await syncAmendmentsAN({ zipPath: zip, legislature: leg, mode: "incremental" });
    expect(r.dossiersChanged).toBe(0);
    expect(r.amendmentsSeen).toBe(0); // no entry decompressed
    expect(r.amendmentsCreated).toBe(0);
    expect(r.amendmentsUpdated).toBe(0);
  });
});
