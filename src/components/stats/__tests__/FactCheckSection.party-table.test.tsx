import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FactCheckSection } from "@/components/stats/FactCheckSection";

const party = (shortName: string, total: number, faux: number) => ({
  name: `Parti ${shortName}`,
  shortName,
  color: null,
  slug: `parti-${shortName.toLowerCase()}`,
  totalMentions: total,
  breakdown: { vrai: total - faux - 1, trompeur: 0, faux, inverifiable: 1 },
  scoreVrai: 0,
  scoreFaux: 0,
});

// Seven parties: more than either ranking keeps, so the table is the only place showing them all.
const parties = ["PA", "PB", "PC", "PD", "PE", "PF", "PG"].map((name, i) =>
  party(name, 40 - i * 4, 3)
);

function renderSection() {
  return render(
    <FactCheckSection
      total={200}
      groups={{ vrai: 100, trompeur: 40, faux: 50, inverifiable: 10 }}
      bySource={[{ source: "Média d'exemple", count: 200 }]}
      topVraiSharePoliticians={[]}
      topFauxSharePoliticians={[]}
      topVraiShareParties={parties.slice(0, 5)}
      topFauxShareParties={parties.slice(0, 5)}
      partiesByVolume={parties}
    />
  );
}

describe("tableau complet des partis sur la page des fact-checks", () => {
  it("affiche chaque parti du tableau partagé, pas seulement les cinq d'un classement", () => {
    renderSection();
    const table = screen.getByRole("table", { name: /Répartition des verdicts par parti/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(parties.length);
    expect(within(rows[0]!).getByRole("link", { name: "PA" })).toHaveAttribute(
      "href",
      "/partis/parti-pa"
    );
    expect(within(rows[6]!).getByRole("rowheader")).toHaveTextContent("PG");
  });

  it("donne les quatre décomptes et le total de chaque ligne", () => {
    renderSection();
    const table = screen.getByRole("table", { name: /Répartition des verdicts par parti/ });
    const cells = within(within(table).getAllByRole("row")[1]!).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["36", "0", "3", "1", "40"]);
  });

  it("ancre le tableau pour qu'un lien partagé y mène", () => {
    const { container } = renderSection();
    expect(container.querySelector("#par-parti")).not.toBeNull();
  });
});
