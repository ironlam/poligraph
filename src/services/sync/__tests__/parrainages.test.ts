import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  download: vi.fn(),
  election: vi.fn(),
  stored: vi.fn(),
  createMany: vi.fn(),
  inBase: vi.fn(),
}));

vi.mock("../csv-download", () => ({ downloadBuffer: h.download }));
vi.mock("@/lib/db", () => {
  const tx = { parrainage: { createMany: h.createMany, findMany: h.inBase } };
  return {
    db: {
      election: { findUnique: h.election },
      commune: { findMany: vi.fn().mockResolvedValue([]) },
      candidacy: { findMany: vi.fn().mockResolvedValue([]) },
      parrainage: { findMany: h.stored },
      $transaction: (run: (client: typeof tx) => Promise<void>) => run(tx),
    },
  };
});

import { syncParrainages } from "../parrainages";

const extrait = readFileSync(join(__dirname, "parrainages-2022-extrait.csv"));
const SLUG = "presidentielle-2022";
const missingTable = { meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } } };

beforeEach(() => {
  vi.clearAllMocks();
  h.download.mockResolvedValue(extrait);
  h.election.mockResolvedValue({ id: "el-2022", slug: SLUG });
  h.stored.mockResolvedValue([]);
  // By default the base holds, after the insert, exactly what was inserted.
  h.inBase.mockImplementation(async () =>
    h.createMany.mock.calls.flatMap(([args]) => args.data as { candidateName: string }[])
  );
});

describe("syncParrainages", () => {
  it("n'écrit rien sans write, même quand tout est prêt", async () => {
    const report = await syncParrainages(SLUG, { write: false });
    expect(report.plan.creates).toHaveLength(31);
    expect(report).toMatchObject({ linesRead: 31, tableReady: true, stored: 0, written: 0 });
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("donne un aperçu quand la table n'existe pas encore, et refuse d'écrire", async () => {
    h.stored.mockRejectedValue(missingTable);
    expect((await syncParrainages(SLUG, { write: false })).tableReady).toBe(false);
    await expect(syncParrainages(SLUG, { write: true })).rejects.toThrow(
      /Table Parrainage absente/
    );
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("écrit les lignes manquantes et recompte la base contre le fichier", async () => {
    const report = await syncParrainages(SLUG, { write: true });
    expect(report.written).toBe(31);
    expect(h.createMany.mock.calls[0]?.[0].data).toHaveLength(31);
    expect(h.inBase).toHaveBeenCalledWith({
      where: { electionId: "el-2022" },
      select: { candidateName: true },
    });
  });

  it("fait échouer la transaction quand la base ne retrouve pas les totaux du fichier", async () => {
    h.inBase.mockResolvedValue([{ candidateName: "ARTHAUD Nathalie" }]);
    await expect(syncParrainages(SLUG, { write: true })).rejects.toThrow(
      /Totaux différents du fichier[\s\S]*ARTHAUD Nathalie : 3 dans le fichier, 1 en base/
    );
  });

  it("refuse d'écrire un fichier bloqué", async () => {
    h.download.mockResolvedValue(Buffer.from(`${extrait.toString("utf8")}\nligne;cassée`));
    await expect(syncParrainages(SLUG, { write: true })).rejects.toThrow(/Import refusé/);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("refuse une élection sans liste connue ou absente de la base", async () => {
    await expect(syncParrainages("presidentielle-1965", { write: false })).rejects.toThrow(
      /Aucune liste de parrainages connue/
    );
    h.election.mockResolvedValue(null);
    await expect(syncParrainages(SLUG, { write: false })).rejects.toThrow(/Élection introuvable/);
    expect(h.download).not.toHaveBeenCalled();
  });
});
