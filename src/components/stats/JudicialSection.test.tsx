import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JudicialSection } from "./JudicialSection";

const PROPS = {
  maturityCounts: {
    CONDAMNATION: 1,
    PROCEDURE_VALIDEE: 1,
    ENQUETE: 0,
    INSTRUCTION_CLOSE: 0,
    CLOSE_SANS_CONDAMNATION: 0,
  },
  uniqueCondamnes: 1,
  uniqueMisEnCause: 1,
  byStatus: [],
  byCategory: [],
  critiqueByCategory: [
    {
      category: "CORRUPTION" as const,
      label: "Corruption",
      total: 1,
      parties: [{ name: "Parti test", count: 1, color: null, slug: null }],
    },
  ],
  hemicycleGroups: [],
  victimStats: { totalAffairs: 0, totalPoliticians: 0, ongoingProcedures: 0 },
};

const flat = (text: string | null) => (text ?? "").replace(/\s+/g, " ");

describe("JudicialSection, probité", () => {
  it("sous-titre et encadré fondés sur la catégorie", () => {
    const { container } = render(<JudicialSection {...PROPS} />);
    const text = flat(container.textContent);
    expect(text).toContain(
      "Condamnations et procédures validées par un juge, en implication directe, par catégorie et par parti."
    );
    expect(text).toContain(
      "Les « atteintes à la probité » regroupent la corruption, le trafic d'influence, la prise illégale d'intérêts, le favoritisme, le détournement de fonds publics, les emplois fictifs et les conflits d'intérêts. Le financement illégal de campagne ou de parti et l'incitation à la haine n'en font pas partie."
    );
    expect(text).toContain("Élus condamnés");
    expect(text).not.toContain("financement illégal, trafic");
    expect(text).not.toContain("emplois fictifs, financement illégal");
  });
});
