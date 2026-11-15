import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MandateTimeline } from "@/components/politicians/MandateTimeline";

/**
 * A current local mandate tied to a commune of the base links to its Territoires page (#1052).
 * A past mandate and a mandate without commune carry no such link.
 */

function mandate(overrides: Record<string, unknown>) {
  return {
    id: "m1",
    type: "MAIRE",
    isCurrent: true,
    startDate: new Date("2026-03-22"),
    endDate: null,
    role: null,
    title: "Maire de Carcassonne",
    constituency: "Carcassonne (11069)",
    institution: "Mairie",
    officialUrl: null,
    parliamentaryData: null,
    localData: { commune: { population: 46_000 } },
    ...overrides,
  };
}

function renderTimeline(mandates: Record<string, unknown>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<MandateTimeline mandates={mandates as any} />);
}

describe("MandateTimeline : lien vers le dossier de la commune", () => {
  it("relie le mandat de maire en cours à la page Territoires", () => {
    renderTimeline([mandate({})]);
    expect(screen.getByRole("link", { name: /Dossier de la commune/ })).toHaveAttribute(
      "href",
      "/territoires/communes/11069"
    );
  });

  it("relie un mandat terminé avec le libellé « historique »", () => {
    renderTimeline([mandate({ isCurrent: false, endDate: new Date("2020-06-30") })]);
    expect(
      screen.getByRole("link", { name: /Dossier de la commune \(historique\)/ })
    ).toHaveAttribute("href", "/territoires/communes/11069");
  });

  it("relie le mandat en cours d'un député à la page de son département", () => {
    renderTimeline([
      mandate({
        type: "DEPUTE",
        title: "Député du Finistère",
        constituency: "Finistère (2)",
        departmentCode: "29",
        localData: null,
      }),
    ]);
    expect(screen.getByRole("link", { name: /Page du département/ })).toHaveAttribute(
      "href",
      "/territoires/departements/finistere"
    );
    expect(screen.queryByRole("link", { name: /Dossier de la commune/ })).toBeNull();
  });

  it("ne relie pas un mandat dont la commune n'est pas en base", () => {
    renderTimeline([mandate({ localData: { commune: null } })]);
    expect(screen.queryByRole("link", { name: /Dossier de la commune/ })).toBeNull();
  });

  it("ne promet pas les décisions du conseil", () => {
    const { container } = renderTimeline([mandate({})]);
    expect(container.textContent).not.toMatch(/Décisions du conseil/);
  });
});
