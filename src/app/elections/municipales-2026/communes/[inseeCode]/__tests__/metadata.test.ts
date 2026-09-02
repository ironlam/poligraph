import { describe, it, expect, vi, beforeEach } from "vitest";

const getCommune = vi.fn();
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/data/municipales", () => ({
  getCommune: (inseeCode: string) => getCommune(inseeCode),
  getCommuneHistorique2020: vi.fn(async () => null),
  getCommuneHistorique2014: vi.fn(async () => null),
}));

import { generateMetadata } from "@/app/elections/municipales-2026/communes/[inseeCode]/page";

const metadataFor = (inseeCode: string) =>
  generateMetadata({ params: Promise.resolve({ inseeCode }) });

beforeEach(() => getCommune.mockReset());

describe("/elections/municipales-2026/communes/[inseeCode] metadata", () => {
  it("noindex une commune inexistante au lieu de l'offrir à l'indexation", async () => {
    getCommune.mockResolvedValue(null);

    const m = await metadataFor("99999");

    expect(m.title).toBe("Commune non trouvée");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'une commune existante", async () => {
    getCommune.mockResolvedValue({
      name: "Saint-Étienne",
      departmentName: "42",
      population: 170000,
      stats: { listCount: 6, candidateCount: 300 },
    });

    const m = await metadataFor("42218");

    expect(m.title).toBe("Municipales 2026 à Saint-Étienne — Candidats et listes | Poligraph");
    expect(m.description).toContain("Saint-Étienne");
    expect(m.alternates?.canonical).toBe("/elections/municipales-2026/communes/42218");
    expect(m.robots).not.toEqual({ index: false, follow: true });
  });
});
