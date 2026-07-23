import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import yazl from "yazl";

// syncAmendmentsAN statically imports the writer/feed-state modules, which in
// turn import @/lib/db. dryRun never touches the DB, but the module import
// chain would still throw without DATABASE_URL — stub it out so this test
// stays fully offline (no DB, no network).
vi.mock("@/lib/db", () => ({ db: {} }));

import { syncAmendmentsAN } from "@/services/sync/amendments-an";

// Builds a tiny fixture ZIP with a few valid amendment JSON entries, same
// approach as zip-iterator.test.ts's "mixed.zip" case.
function buildFixtureAmendment(uid: string, numero: string) {
  return {
    amendement: {
      uid,
      identification: { numeroLong: numero, numeroOrdreDepot: numero },
      texteLegislatifRef: "PIONANR5L17B1432",
      corps: {
        contenuAuteur: {
          dispositif: `<p>Dispositif ${numero}</p>`,
          exposeSommaire: `<p>Expose ${numero}</p>`,
        },
      },
      cycleDeVie: { sort: "En construction" },
      amendementParentRef: { "@xsi:nil": "true" },
      discussionIdentique: { "@xsi:nil": "true" },
      pointeurFragmentTexte: { division: { articleDesignation: "Article 1" } },
      signataires: { auteur: { typeAuteur: "Député" }, libelle: "M. Test" },
      legislature: "17",
    },
  };
}

const FIXTURE_ENTRY_COUNT = 4;

describe("syncAmendmentsAN safety cap", () => {
  let tmpDir: string;
  let zipPath: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "safety-cap-"));
    zipPath = path.join(tmpDir, "fixture.zip");

    const zf = new yazl.ZipFile();
    for (let i = 0; i < FIXTURE_ENTRY_COUNT; i++) {
      const uid = `AMANR_TEST_${i}`;
      const numero = String(i + 1);
      zf.addBuffer(
        Buffer.from(JSON.stringify(buildFixtureAmendment(uid, numero))),
        `json/DLR5L17N54083/PIONANR5L17B1432/${uid}.json`
      );
    }
    zf.end();

    await new Promise<void>((resolve, reject) => {
      const chunks: Buffer[] = [];
      zf.outputStream.on("data", (c) => chunks.push(c as Buffer));
      zf.outputStream.on("end", () => {
        writeFileSync(zipPath, Buffer.concat(chunks));
        resolve();
      });
      zf.outputStream.on("error", reject);
    });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails loudly (does not silently truncate) when the corpus exceeds the safety cap", async () => {
    await expect(syncAmendmentsAN({ zipPath, dryRun: true, safetyCap: 2 })).rejects.toThrow(
      /safety cap/i
    );
  });

  it("processes every entry when the safety cap is above the corpus size (no truncation)", async () => {
    const stats = await syncAmendmentsAN({ zipPath, dryRun: true, safetyCap: 10 });
    expect(stats.amendmentsSeen).toBe(FIXTURE_ENTRY_COUNT);
  });
});
