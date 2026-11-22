import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  communeFindMany: vi.fn(),
  repereCount: vi.fn(),
  repereCreateMany: vi.fn(),
  sourceFindFirst: vi.fn(),
  sourceCreate: vi.fn(),
  importDeleteMany: vi.fn(),
  importCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    commune: { findMany: h.communeFindMany },
    territoireRepere: { count: h.repereCount, createMany: h.repereCreateMany },
    repereSource: { findFirst: h.sourceFindFirst, create: h.sourceCreate },
    repereImport: { deleteMany: h.importDeleteMany, create: h.importCreate },
  },
}));

import type { OfglRow } from "@/lib/api/ofgl";
import { exercicesOfSeries, syncReperesComptes } from "@/services/sync/reperes-comptes";

// Real Brest rows of 2024 (fixtures/ofgl-comptes.csv), relabelled per exercise.
function brest(exercice: number): OfglRow[] {
  const lines = readFileSync(join(__dirname, "fixtures/ofgl-comptes.csv"), "utf8").split("\n");
  const header = (lines[1] as string).split(";");
  return lines
    .filter((l) => l.startsWith("communes2024;2024;29019;"))
    .map((l) => {
      const cells = l.split(";");
      const row: OfglRow = {};
      header.slice(1).forEach((k, i) => {
        const v = cells[i + 1] as string;
        const key = k === "code" ? "insee" : k;
        row[key] = ["exer", "code", "siren", "agregat"].includes(k)
          ? v
          : v === ""
            ? null
            : Number(v);
      });
      return { ...row, exer: String(exercice) };
    });
}

// Availability of the same year: Brest has its account, 29001 has none.
const dispo = (exercice: number): OfglRow[] =>
  [
    ["29019", "212900195", "1"],
    ["29001", "212900013", "0"],
  ].map(([code, siren, presence]) => ({
    annee: String(exercice),
    insee: code,
    siren,
    presence_budget: presence,
    insee_25: code,
    siren_25: siren,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  h.communeFindMany.mockResolvedValue([{ id: "29019" }]);
  h.repereCount.mockResolvedValue(0);
  h.sourceFindFirst.mockResolvedValue(null);
  h.sourceCreate.mockResolvedValue({ id: "src1" });
  h.importDeleteMany.mockResolvedValue({ count: 0 });
  h.importCreate.mockResolvedValue({ id: "imp1" });
  h.repereCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
});

const run = (dryRun: boolean, extra: Partial<Parameters<typeof syncReperesComptes>[0]> = {}) =>
  syncReperesComptes({
    scale: "COM",
    dryRun,
    exercices: [2023, 2024],
    source: { rows: async (y) => brest(y), disponibilite: async (y) => dispo(y) },
    ...extra,
  });

describe("import des comptes", () => {
  it("couvre la série 2018 à 2024 par défaut", () => {
    expect(exercicesOfSeries()).toEqual([2018, 2019, 2020, 2021, 2022, 2023, 2024]);
  });

  it("n'écrit rien en aperçu", async () => {
    const r = await run(true);
    expect(r.rowsPlanned).toBe(20);
    expect(r.importId).toBeNull();
    expect(h.repereCreateMany).not.toHaveBeenCalled();
    expect(h.importCreate).not.toHaveBeenCalled();
  });

  it("commence par les communes au seuil d'indexation", async () => {
    await run(true);
    expect(h.communeFindMany.mock.calls[0]?.[0].where).toEqual({ population: { gte: 1000 } });
    await run(true, { perimetre: "TOUTES" });
    expect(h.communeFindMany.mock.calls[1]?.[0].where).toEqual({});
  });

  it("écrit un lot en brouillon, source sans page de méthode unique", async () => {
    const r = await run(false);
    expect(h.sourceCreate.mock.calls[0]?.[0].data).toMatchObject({ methodSlug: null });
    expect(h.importCreate.mock.calls[0]?.[0].data).toMatchObject({ status: "DRAFT", rowCount: 20 });
    const written = h.repereCreateMany.mock.calls.flatMap((c) => c[0].data);
    expect(written).toHaveLength(20);
    expect(written.every((w: { scopeKind: string }) => w.scopeKind === "COLLECTIVITE")).toBe(true);
    expect(r).toMatchObject({ importId: "imp1", rowsWritten: 20 });
  });

  it("remplace le brouillon précédent de la même source, jamais un lot relu", async () => {
    h.sourceFindFirst.mockResolvedValue({ id: "src-existante" });
    await run(false);
    expect(h.sourceCreate).not.toHaveBeenCalled();
    expect(h.importDeleteMany.mock.calls[0]?.[0].where).toEqual({
      sourceId: "src-existante",
      status: { in: ["DRAFT", "REJECTED"] },
    });
  });

  it("s'arrête si un lot relu ou publié tient déjà un exercice", async () => {
    h.repereCount.mockResolvedValue(10);
    await expect(run(false)).rejects.toThrow(/relu ou publié/);
    expect(h.importCreate).not.toHaveBeenCalled();
  });

  it("n'écrit rien quand trop peu de territoires ont des comptes", async () => {
    h.communeFindMany.mockResolvedValue([{ id: "29019" }, { id: "29001" }, { id: "29002" }]);
    await expect(run(false)).rejects.toThrow(/couverture anormalement basse/);
    expect(h.importCreate).not.toHaveBeenCalled();
  });

  it("n'écrit rien quand le plan porte une anomalie", async () => {
    await expect(
      run(false, {
        source: {
          rows: async (y) => brest(y).map((r) => ({ ...r, montant: 1 })),
          disponibilite: async (y) => dispo(y),
        },
      })
    ).rejects.toThrow(/anomalies/);
    expect(h.repereCount).not.toHaveBeenCalled();
    expect(h.importCreate).not.toHaveBeenCalled();
  });
});
