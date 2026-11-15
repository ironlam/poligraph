import { describe, expect, it } from "vitest";
import { toCSV } from "@/lib/csv";
import {
  COMMUNE_COLUMNS,
  EXPORT_DEPARTMENT_CODES,
  communeRow,
  departementRows,
  parseExportDepartmentCode,
  regionRows,
  resolveMaire,
  type CommuneExportInput,
  type MaireHolder,
} from "@/lib/territoires/exports";

const RENNES: CommuneExportInput = {
  id: "35238",
  name: "Rennes",
  departmentCode: "35",
  regionCode: "53",
  regionName: "Bretagne",
  population: 227830,
  constituencyNumber: 1,
};

function holder(overrides: Partial<MaireHolder> = {}): MaireHolder {
  return {
    slug: "nathalie-appere",
    fullName: "Nathalie Appéré",
    publicId: "PG-000001",
    publicationStatus: "PUBLISHED",
    lastConfirmedAt: new Date("2026-09-01T00:00:00Z"),
    source: "RNE",
    ...overrides,
  };
}

const IMPORTED = new Date("2026-08-10T08:00:00Z");

describe("resolveMaire", () => {
  it("names a single public holder", () => {
    expect(resolveMaire([holder()]).state).toBe("ETABLI");
  });

  it("names nobody when the single holder is not public", () => {
    expect(resolveMaire([holder({ publicationStatus: "DRAFT" })])).toEqual({
      state: "NON_ETABLI",
      holder: null,
    });
  });

  it("names nobody when two holders are current, even if one is public", () => {
    const result = resolveMaire([holder(), holder({ slug: "autre", publicationStatus: "DRAFT" })]);
    expect(result).toEqual({ state: "NON_ETABLI", holder: null });
  });

  it("says ABSENT when nothing is recorded", () => {
    expect(resolveMaire([]).state).toBe("ABSENT");
  });
});

describe("communeRow", () => {
  it("carries the mayor, their stable id and profile URL when established", () => {
    const row = communeRow(RENNES, [holder()], IMPORTED);
    expect(row).toMatchObject({
      maire_etat: "ETABLI",
      maire_nom: "Nathalie Appéré",
      maire_poligraph_id: "PG-000001",
      maire_url: "https://poligraph.fr/politiques/nathalie-appere",
      maire_source: "Répertoire National des Élus",
      maire_confirme_le: "2026-09-01",
      region: "Bretagne",
      communes_importees_le: "2026-08-10",
      url_page: "https://poligraph.fr/territoires/communes/rennes-35238",
    });
  });

  it("leaks no name, id, URL or date of a non-public mayor", () => {
    const row = communeRow(RENNES, [holder({ publicationStatus: "EXCLUDED" })], IMPORTED);
    expect(row.maire_etat).toBe("NON_ETABLI");
    expect([row.maire_nom, row.maire_poligraph_id, row.maire_url, row.maire_confirme_le]).toEqual([
      "",
      "",
      "",
      "",
    ]);
    expect(toCSV([row], COMMUNE_COLUMNS)).not.toContain("nathalie");
  });

  it("leaves an unknown population empty, never zero, and drops its source", () => {
    const row = communeRow({ ...RENNES, population: null }, [], IMPORTED);
    expect(row.population).toBeNull();
    expect(row.population_source).toBe("");
    const line = toCSV([row], COMMUNE_COLUMNS).split("\n")[1]!;
    expect(line.split(",")[6]).toBe("");
  });

  it("gives no constituency number for Paris, Lyon and Marseille", () => {
    const row = communeRow(
      { ...RENNES, id: "75056", departmentCode: "75", constituencyNumber: 1 },
      [],
      null
    );
    expect(row.circonscription_enregistree).toBeNull();
    expect(row.circonscription_couverture).toBe("PLUSIEURS");
  });

  it("marks a recorded constituency as not verified", () => {
    expect(communeRow(RENNES, [], null).circonscription_couverture).toBe("NON_VERIFIEE");
  });

  it("puts an overseas collectivity in no region", () => {
    const row = communeRow(
      { ...RENNES, id: "98735", name: "Papeete", departmentCode: "987", regionCode: null },
      [],
      null
    );
    expect(row.departement).toBe("Polynésie française");
    expect(row.code_region).toBe("");
    expect(row.region).toBe("");
  });

  it("neutralises a cell a spreadsheet would run as a formula", () => {
    const row = communeRow(RENNES, [holder({ fullName: "=HYPERLINK(1)" })], null);
    const csv = toCSV([row], COMMUNE_COLUMNS, { neutralizeFormulas: true });
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});

describe("parseExportDepartmentCode", () => {
  it.each([
    ["35", "35"],
    ["2a", "2A"],
    ["974", "974"],
    ["987", "987"],
  ])("accepts %s", (raw, code) => {
    expect(parseExportDepartmentCode(raw)).toBe(code);
  });

  it.each(["984", "989", "00", "20", "../35", "35/../..", "35.csv", "", "9999"])(
    "refuses %s",
    (raw) => {
      expect(parseExportDepartmentCode(raw)).toBeNull();
    }
  );

  it("covers the five DROM and the six COM that have communes", () => {
    for (const code of [
      "971",
      "972",
      "973",
      "974",
      "976",
      "975",
      "977",
      "978",
      "986",
      "987",
      "988",
    ]) {
      expect(EXPORT_DEPARTMENT_CODES).toContain(code);
    }
  });
});

describe("departementRows and regionRows", () => {
  const communes = new Map([
    ["35", 333],
    ["22", 348],
    ["987", 48],
  ]);

  it("lists TAAF and Clipperton without a commune file", () => {
    const rows = departementRows({ communes, deputes: new Map(), senateurs: new Map() });
    const taaf = rows.find((r) => r.code === "984")!;
    expect(taaf.fichier_communes).toBe("");
    expect(rows.find((r) => r.code === "987")).toMatchObject({
      statut: "Collectivité d'outre-mer",
      region: "",
      communes_en_base: 48,
    });
    expect(rows.find((r) => r.code === "974")?.statut).toBe("Département d'outre-mer");
  });

  it("sums communes per region from its departments only", () => {
    const rows = regionRows(communes);
    expect(rows).toHaveLength(18);
    expect(rows.find((r) => r.code === "53")?.communes_en_base).toBe(681);
  });
});
