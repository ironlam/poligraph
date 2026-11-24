import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  download: vi.fn(),
  election: vi.fn(),
  stored: vi.fn(),
  createMany: vi.fn(),
  recipients: vi.fn(),
  refresh: vi.fn(),
  updateMany: vi.fn(),
  inBase: vi.fn(),
  communes: vi.fn(),
}));

vi.mock("../csv-download", () => ({ downloadBuffer: h.download }));
vi.mock("../parrainages-fiches", () => ({ listParrainagesRecipientIds: h.recipients }));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({ requestProfileRefresh: h.refresh }));
vi.mock("@/lib/db", () => {
  const tx = {
    parrainage: { createMany: h.createMany, updateMany: h.updateMany, findMany: h.inBase },
  };
  return {
    db: {
      election: { findUnique: h.election },
      commune: { findMany: h.communes },
      candidacy: { findMany: vi.fn().mockResolvedValue([]) },
      parrainage: { findMany: h.stored },
      $transaction: (run: (client: typeof tx) => Promise<void>) => run(tx),
    },
  };
});

import { COG_EVENTS_URL, syncParrainages } from "../parrainages";

const extrait = readFileSync(join(__dirname, "parrainages-2022-extrait.csv"));
const SLUG = "presidentielle-2022";
const COG_HEADER = "MOD,DATE_EFF,TYPECOM_AV,COM_AV,LIBELLE_AV,TYPECOM_AP,COM_AP,LIBELLE_AP\n";
let cog = COG_HEADER;
let liste: Buffer | string = extrait;
const missingTable = { meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } } };

beforeEach(() => {
  vi.clearAllMocks();
  cog = COG_HEADER;
  liste = extrait;
  h.download.mockImplementation(async (url: string) =>
    Buffer.from(url === COG_EVENTS_URL ? cog : liste)
  );
  h.election.mockResolvedValue({ id: "el-2022", slug: SLUG });
  h.stored.mockResolvedValue([]);
  h.recipients.mockResolvedValue(["p-arthaud", "p-lepen"]);
  h.communes.mockResolvedValue([]);
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
    liste = `${extrait.toString("utf8")}\nligne;cassée`;
    await expect(syncParrainages(SLUG, { write: true })).rejects.toThrow(/Import refusé/);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("complète le code d'une commune fusionnée depuis la liste, sur les lignes déjà en base", async () => {
    const { plan } = await syncParrainages(SLUG, { write: false });
    const stored = plan.creates.map(({ dedupeKey, candidateName, communeCode }) => ({
      dedupeKey,
      candidateName,
      communeCode,
    }));
    h.stored.mockResolvedValue(stored);
    h.inBase.mockResolvedValue(stored);
    h.communes.mockResolvedValue([{ id: "02999", name: "Mont-Exemple", departmentCode: "02" }]);
    cog = `${COG_HEADER}32,2025-01-01,COM,02524,Mont-Saint-Père,COM,02999,Mont-Exemple\n`;

    const report = await syncParrainages(SLUG, { write: true });
    expect(report).toMatchObject({ written: 0, backfilled: 1 });
    expect(report.plan.territories.viaSuccessor).toBe(1);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: stored[0]!.dedupeKey, communeCode: null },
      data: { communeCode: "02999" },
    });
  });

  it("demande le recalcul des fiches des candidats quand des présentations sont ajoutées", async () => {
    await syncParrainages(SLUG, { write: true });
    expect(h.recipients).toHaveBeenCalledWith(SLUG);
    expect(h.refresh).toHaveBeenCalledWith(
      { politicianIds: ["p-arthaud", "p-lepen"] },
      "sync:parrainages"
    );
  });

  it("ne demande aucun recalcul en aperçu, ni quand rien de nouveau n'est écrit", async () => {
    await syncParrainages(SLUG, { write: false });
    expect(h.refresh).not.toHaveBeenCalled();

    const { plan } = await syncParrainages(SLUG, { write: false });
    const stored = plan.creates.map(({ dedupeKey, candidateName, communeCode }) => ({
      dedupeKey,
      candidateName,
      communeCode,
    }));
    h.stored.mockResolvedValue(stored);
    h.inBase.mockResolvedValue(stored);
    const report = await syncParrainages(SLUG, { write: true });
    expect(report.written).toBe(0);
    expect(h.refresh).not.toHaveBeenCalled();
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
