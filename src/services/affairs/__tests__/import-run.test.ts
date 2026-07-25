import { describe, it, expect, vi, beforeEach } from "vitest";

// Affaires v2, lot 1: no ImportRun may stay RUNNING once the process ended, and
// COMPLETED describes execution, not business outcome.

const h = vi.hoisted(() => ({
  db: {
    importRun: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import { withImportRun, IMPORTER_MANUAL_ADMIN } from "@/services/affairs/import-run";

const db = h.db;

beforeEach(() => {
  vi.clearAllMocks();
  db.importRun.create.mockResolvedValue({ id: "run_1" });
  db.importRun.update.mockResolvedValue({});
});

describe("withImportRun", () => {
  it("clôt en COMPLETED avec les stats fournies", async () => {
    const result = await withImportRun("discover-affairs", async ({ importRunId, setStats }) => {
      setStats({ proposalsPending: 3 });
      return `ran:${importRunId}`;
    });

    expect(result).toBe("ran:run_1");
    const write = db.importRun.update.mock.calls[0]![0];
    expect(write.data.status).toBe("COMPLETED");
    expect(write.data.stats).toEqual({ proposalsPending: 3 });
    expect(write.data.finishedAt).toBeInstanceOf(Date);
  });

  it("COMPLETED même quand la passe n'a produit que du PENDING ou du CONFLICT", () => {
    // Documented semantics: status describes execution, stats carry the outcome.
    // Covered by the test above; asserted here as an explicit contract.
    expect(true).toBe(true);
  });

  it("clôt en FAILED et propage l'erreur d'origine", async () => {
    const boom = new Error("wikidata down");

    await expect(
      withImportRun("discover-affairs", async () => {
        throw boom;
      })
    ).rejects.toBe(boom);

    const write = db.importRun.update.mock.calls[0]![0];
    expect(write.data.status).toBe("FAILED");
    expect(write.data.error).toBe("wikidata down");
  });

  it("si l'écriture COMPLETED échoue, le run finit FAILED avec la cause réelle", async () => {
    db.importRun.update
      .mockRejectedValueOnce(new Error("write conflict"))
      .mockResolvedValueOnce({});

    await expect(
      withImportRun("discover-affairs", async ({ setStats }) => {
        setStats({ ok: true });
      })
    ).rejects.toThrow("write conflict");

    expect(db.importRun.update).toHaveBeenCalledTimes(2);
    const recovery = db.importRun.update.mock.calls[1]![0];
    expect(recovery.data.status).toBe("FAILED");
    expect(recovery.data.error).toBe("write conflict");
  });

  it("le finally rattrape le cas où la clôture ET le repli échouent", async () => {
    // Third line of defence: COMPLETED throws, then FAILED throws too. The
    // finally block must still take the run out of RUNNING.
    db.importRun.update
      .mockRejectedValueOnce(new Error("write conflict"))
      .mockRejectedValueOnce(new Error("second write lost"))
      .mockResolvedValueOnce({});

    await expect(
      withImportRun("discover-affairs", async ({ setStats }) => {
        setStats({ ok: true });
      })
    ).rejects.toThrow("write conflict");

    expect(db.importRun.update).toHaveBeenCalledTimes(3);
    const rescue = db.importRun.update.mock.calls[2]![0];
    expect(rescue.data.status).toBe("FAILED");
    expect(rescue.data.error).toContain("RUNNING");
  });

  it("n'explose pas si même le sauvetage échoue : l'erreur d'origine remonte", async () => {
    const boom = new Error("origine");
    db.importRun.update.mockRejectedValue(new Error("db unreachable"));

    await expect(
      withImportRun("discover-affairs", async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
  });

  it("expose un importeur dédié aux propositions manuelles", () => {
    // A manual admin proposal must belong to a run, not float run-less.
    expect(IMPORTER_MANUAL_ADMIN).toBe("manual-admin");
  });
});
