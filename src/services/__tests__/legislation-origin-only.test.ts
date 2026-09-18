import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  download: vi.fn(),
  extract: vi.fn(),
}));

const records: Record<string, unknown> = {
  "DLR5L16N1.json": {
    dossierParlementaire: {
      "@xsi:type": "DossierLegislatif_Type",
      uid: "DLR5L16N1",
      legislature: "16",
      titreDossier: { titre: "Projet de loi test ancien", titreChemin: "test-ancien" },
      procedureParlementaire: { code: "PJL", libelle: "Projet de loi ordinaire" },
      actesLegislatifs: {
        acteLegislatif: {
          "@xsi:type": "DepotInitiative_Type",
          uid: "DEP16",
          codeActe: "AN1-DEPOT",
          texteAssocie: "PRJLANR5L16B1",
          dateActe: "2024-01-01",
        },
      },
    },
  },
  "DLR5L17N2.json": {
    dossierParlementaire: {
      "@xsi:type": "DossierLegislatif_Type",
      uid: "DLR5L17N2",
      legislature: "17",
      titreDossier: { titre: "Proposition de loi test", titreChemin: "test" },
      procedureParlementaire: { code: "PPL", libelle: "Proposition de loi ordinaire" },
      actesLegislatifs: {
        acteLegislatif: {
          "@xsi:type": "DepotInitiative_Type",
          uid: "DEP17",
          codeActe: "AN1-DEPOT",
          texteAssocie: "PIONANR5L17B2",
          dateActe: "2025-01-01",
        },
      },
    },
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    legislativeDossier: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      create: mocks.create,
    },
  },
}));
vi.mock("@/lib/download-file", () => ({ downloadFileWithRetry: mocks.download }));
vi.mock("@/lib/parsing/unzip", () => ({ extractZip: mocks.extract }));
vi.mock("fs", () => {
  const mockedFs = {
    existsSync: () => true,
    mkdirSync: () => undefined,
    rmSync: () => undefined,
    readdirSync: () => Object.keys(records),
    readFileSync: (file: string) => JSON.stringify(records[file.split(/[\\/]/).at(-1)!]),
  };
  return { ...mockedFs, default: mockedFs };
});

import { syncLegislation } from "@/services/sync/legislation";

describe("origin-only legislative backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockImplementation(async ({ where }: { where: { externalId: string } }) => ({
      id: where.externalId,
    }));
    mocks.update.mockResolvedValue({});
  });

  it("simulates historical and current dossiers without writes", async () => {
    const result = await syncLegislation({ legislature: 17, originOnly: true, dryRun: true });
    expect(result.errors).toEqual([]);
    expect(result.dossiersProcessed).toBe(2);
    expect(result.dossiersWouldUpdate).toBe(2);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { externalId: "DLR5L16N1" } });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("updates only provenance fields and does not create missing dossiers", async () => {
    mocks.findUnique.mockImplementation(async ({ where }: { where: { externalId: string } }) =>
      where.externalId === "DLR5L16N1" ? { id: where.externalId } : null
    );
    const result = await syncLegislation({ legislature: 17, originOnly: true });
    expect(result.errors).toEqual([]);
    expect(result.dossiersUpdated).toBe(1);
    expect(result.dossiersSkipped).toBe(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const update = mocks.update.mock.calls[0]![0];
    expect(Object.keys(update.data).sort()).toEqual(
      [
        "origin",
        "originDocumentRef",
        "originEvidence",
        "originFetchedAt",
        "originReason",
        "originSourceHash",
        "originSourceUrl",
      ].sort()
    );
    expect(update.data.origin).toBe("GOUVERNEMENTALE");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
