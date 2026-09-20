import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncHandler } from "@/lib/sync";

const h = vi.hoisted(() => ({
  findMandates: vi.fn(),
  findCommunes: vi.fn(),
  countMandates: vi.fn(),
  unexpectedDBAccess: vi.fn(),
  resolveUrl: vi.fn(),
  getText: vi.fn(),
  resolveBatch: vi.fn(),
  createCLI: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  // Permit only the reads used by dry-run and stats. Any other DB access fails,
  // including a new writer not anticipated by this test.
  db: new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_model, operation: string) => {
              const reads: Record<string, unknown> = {
                "mandate.findMany": h.findMandates,
                "commune.findMany": h.findCommunes,
                "mandate.count": h.countMandates,
              };
              const key = `${model}.${operation}`;
              if (key in reads) return reads[key];
              h.unexpectedDBAccess(key);
              throw new Error(`Unexpected DB access: ${key}`);
            },
          }
        ),
    }
  ),
}));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText = h.getText;
  },
}));
vi.mock("../rne-resource", () => ({
  resolveRneResourceUrl: h.resolveUrl,
  RNE_MAIRES_FRAGMENTS: ["maires"],
}));
vi.mock("@/lib/identity", () => ({ resolveBatch: h.resolveBatch }));
vi.mock("@/lib/sync", () => ({ createCLI: h.createCLI }));

import { getRNEStats, resolveParties, syncRNEMaires } from "../rne";

const CSV = [
  "Code du département;Code de la commune;Libellé de la commune;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Date de début du mandat;Date de début de la fonction",
  "01;01001;Commune test;MARTIN;Alice;F;1970-04-02;2026-03-22;2026-04-05",
].join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  h.findMandates.mockResolvedValue([
    {
      id: "old-mandate",
      politicianId: "predecessor",
      localData: { communeId: "01001", rneExternalId: "01001" },
    },
  ]);
  h.findCommunes.mockResolvedValue([{ id: "01001" }]);
  h.countMandates.mockResolvedValue(1);
  h.resolveUrl.mockResolvedValue("https://example.test/maires.csv");
  h.getText.mockResolvedValue({ data: CSV });
});

afterEach(() => {
  expect(h.unexpectedDBAccess).not.toHaveBeenCalled();
  expect(h.resolveBatch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

function expectNoIO() {
  expect(h.findMandates).not.toHaveBeenCalled();
  expect(h.findCommunes).not.toHaveBeenCalled();
  expect(h.countMandates).not.toHaveBeenCalled();
  expect(h.resolveUrl).not.toHaveBeenCalled();
  expect(h.getText).not.toHaveBeenCalled();
}

describe("RNE write suspension", () => {
  it("rejects the default invocation before any I/O", async () => {
    await expect(syncRNEMaires()).rejects.toThrow("RNE_WRITES_SUSPENDED");
    expectNoIO();
  });

  it.each([undefined, false, "false", "true", 1, null])(
    "rejects dryRun=%j, including untyped callers",
    async (dryRun) => {
      await expect(
        syncRNEMaires({ dryRun: dryRun as boolean, limit: 1, verbose: true })
      ).rejects.toThrow("RNE_WRITES_SUSPENDED");
      expectNoIO();
    }
  );

  it.each([{}, { limit: 1, verbose: true }])("keeps dry-run read-only with %j", async (options) => {
    const result = await syncRNEMaires({ ...options, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.officialsCreated).toBe(1);
    expect(result.errors).toEqual([]);
    expect(h.findMandates).toHaveBeenCalledOnce();
    expect(h.findCommunes).toHaveBeenCalledOnce();
    expect(h.getText).toHaveBeenCalledOnce();
  });

  it("keeps statistics available without external requests", async () => {
    expect(await getRNEStats()).toEqual({
      totalMaires: 1,
      totalCurrent: 1,
      totalWithNationalPresence: 1,
    });
    expect(h.countMandates).toHaveBeenCalledTimes(3);
    expect(h.getText).not.toHaveBeenCalled();
  });

  it("rejects the independent party writer before any I/O", async () => {
    await expect(resolveParties()).rejects.toThrow("RNE_WRITES_SUSPENDED");
    expectNoIO();
  });

  it("propagates the suspension through the CLI handler, including party dry-run", async () => {
    await import("../../../../scripts/sync-rne");
    const handler = h.createCLI.mock.calls[0]![0] as SyncHandler;
    for (const options of [
      {},
      { force: true },
      { resolveParties: true },
      { resolveParties: true, dryRun: true },
    ]) {
      await expect(handler.sync(options)).rejects.toThrow("RNE_WRITES_SUSPENDED");
    }
    expectNoIO();
  });
});
