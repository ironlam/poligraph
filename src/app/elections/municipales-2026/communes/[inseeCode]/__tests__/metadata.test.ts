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

/**
 * La phrase de description compte des choses, elle doit donc s'accorder avec ce qu'elle compte.
 *
 * Deux défauts vivaient sur cette ligne. « les ${listCount} listes » sortait « les 1 listes » sur
 * chaque commune ne présentant qu'une liste, c'est-à-dire la plupart. Et l'issue #871 a rendu zéro
 * atteignable sur une commune qui a pourtant des candidats : Chatain ne déclare aucune liste, la
 * phrase annonçait « les 0 listes et 9 candidats ».
 */
describe("accord de la description", () => {
  const descriptionFor = async (listCount: number, candidateCount: number) => {
    getCommune.mockResolvedValue({
      name: "Chatain",
      population: 240,
      stats: { listCount, candidateCount },
    });
    const m = await metadataFor("86063");
    return m.description ?? "";
  };

  it("ne mentionne aucune liste quand il n'y en a pas", async () => {
    const description = await descriptionFor(0, 9);

    expect(description).not.toContain("0 liste");
    expect(description).toContain("9 candidats");
  });

  it("met « liste » au singulier quand il n'y en a qu'une", async () => {
    const description = await descriptionFor(1, 13);

    expect(description).toContain("1 liste et");
    expect(description).not.toContain("1 listes");
  });

  it("met « liste » au pluriel au-delà", async () => {
    const description = await descriptionFor(3, 45);

    expect(description).toContain("3 listes");
  });

  it("accorde aussi le nombre de candidats", async () => {
    const description = await descriptionFor(1, 1);

    expect(description).toContain("1 candidat ");
    expect(description).not.toContain("1 candidats");
  });
});
