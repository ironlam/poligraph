import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildConvictionRateTable } from "@/components/affairs/CondamnationsStatsTable";
import { buildPartyFactCheckTable } from "@/components/stats/FactCheckSection";
import { TableShareSheet } from "./TableShareSheet";

const data = { title: "Tableau", text: "Tableau", url: "https://poligraph.fr/statistiques" };

const convictionRows = [
  {
    partyId: "1",
    partySlug: "parti-a",
    partyShortName: "PA",
    partyName: "Parti A",
    nSuivis: 300,
    nCondamnesDefinitifs: 6,
    nCondamnesPrononces: 9,
    tauxDefinitif: 0.02,
  },
  {
    partyId: "2",
    partySlug: "parti-b",
    partyShortName: "PB",
    partyName: "Parti B",
    nSuivis: 4,
    nCondamnesDefinitifs: 1,
    nCondamnesPrononces: 1,
    tauxDefinitif: 0.25,
  },
];

const party = (shortName: string, vrai: number, trompeur: number, faux: number) => ({
  name: `Parti ${shortName}`,
  shortName,
  color: null,
  slug: null,
  totalMentions: vrai + trompeur + faux + 1,
  breakdown: { vrai, trompeur, faux, inverifiable: 1 },
  scoreVrai: 0,
  scoreFaux: 0,
});

function open(table: Parameters<typeof TableShareSheet>[0]["table"]) {
  render(<TableShareSheet slug="t" label="Partager ce tableau" data={data} table={table} />);
  fireEvent.click(screen.getByRole("button", { name: "Partager ce tableau" }));
}

describe("tableau des condamnations par parti", () => {
  it("garde chaque ligne dans l'ordre reçu, avec numérateur et dénominateur", () => {
    const table = buildConvictionRateTable(convictionRows);
    expect(table.rows.map((row) => row.label)).toEqual(["PA", "PB"]);
    expect(table.rows[0]?.detail).toBe("6 sur 300");
    // fr-FR puts a narrow no-break space before the percent sign.
    expect(table.rows[0]?.value).toMatch(/^2,0\s%$/);
  });

  it("retient le taux sous le seuil, comme la page", () => {
    expect(buildConvictionRateTable(convictionRows).rows[1]?.value).toBe("n.s.");
  });

  it("écrit sur l'image l'ordre du tableau, le parti retenu et la limite du taux", () => {
    const { note } = buildConvictionRateTable(convictionRows);
    expect(note).toContain("pas par taux");
    expect(note).toContain("Parti actuel");
    expect(note).toContain("couverture médiatique");
  });

  it("dit le filtre de mandat quand le tableau est filtré", () => {
    expect(buildConvictionRateTable(convictionRows, "depute").subtitle).toContain("mandat depute");
  });
});

describe("tableau des fact-checks par parti", () => {
  it("donne à chaque parti ses trois décomptes et son total, sans trier ni couper", () => {
    const table = buildPartyFactCheckTable([party("PB", 2, 3, 9), party("PA", 8, 1, 1)], 6);
    expect(table.rows.map((row) => row.label)).toEqual(["PB", "PA"]);
    expect(table.rows[0]?.detail).toBe("2 · 3 · 9 · 1 sur 15");
    expect(table.rows[0]?.segments?.map((segment) => segment.value)).toEqual([2, 3, 9, 1]);
    expect(table.legend?.map((entry) => entry.label)).toEqual([
      "vrai",
      "trompeur",
      "faux",
      "invérifiable",
    ]);
  });

  it("dessine la barre sur le même total que le chiffre affiché", () => {
    // One "faux" out of ten must not read as a full red bar: the nine unverifiable stay in it.
    const lopsided = {
      ...party("PC", 0, 0, 1),
      totalMentions: 10,
      breakdown: { vrai: 0, trompeur: 0, faux: 1, inverifiable: 9 },
    };
    const row = buildPartyFactCheckTable([lopsided], 6).rows[0]!;
    const drawn = row.segments!.reduce((sum, segment) => sum + segment.value, 0);
    expect(drawn).toBe(lopsided.totalMentions);
    expect(row.detail).toBe("0 · 0 · 1 · 9 sur 10");
  });

  it("explique le travail des médias, sans conclure à la place du lecteur", () => {
    const table = buildPartyFactCheckTable([party("PA", 8, 1, 1)], 6);
    expect(table.note).toContain("choisissent les propos qu'ils vérifient");
    // The note describes how outlets work; it does not tell the reader what to conclude.
    expect(table.note).not.toMatch(/fiabilité/);
    expect(table.subtitle).toContain("6 médias");
  });
});

describe("TableShareSheet", () => {
  it("décrit le tableau entier en mots", () => {
    open(buildConvictionRateTable(convictionRows));
    const name =
      screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
    expect(name).toMatch(/PA : 6 sur 300, 2,0\s%/);
    expect(name).toContain("PB : 1 sur 4, n.s.");
  });

  it("ne propose que le lien quand le tableau ne tiendrait pas entier", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...convictionRows[0]!,
      partyId: String(i),
      partyShortName: `P${i}`,
    }));
    open(buildConvictionRateTable(many));
    expect(screen.queryByRole("img", { name: /Image à partager/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument();
  });
});
