import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CommuneDossier } from "@/lib/data/territoires";
import type {
  PresidentielleCommuneBlock,
  PresidentielleTourCommune,
} from "@/lib/data/territoires-presidentielle";
import { dossier } from "./fixtures";

vi.mock("server-only", () => ({}));

import { ElectionsSection } from "@/components/territoires/CommuneSections";

const NAMES = [
  "Emmanuel Macron",
  "Marine Le Pen",
  "Jean-Luc Mélenchon",
  "Éric Zemmour",
  "Valérie Pécresse",
  "Yannick Jadot",
  "Jean Lassalle",
];

function tour(round: 1 | 2, names: string[]): PresidentielleTourCommune {
  return {
    round,
    date: round === 1 ? "2022-04-10T00:00:00.000Z" : "2022-04-24T00:00:00.000Z",
    registeredVoters: 1000,
    actualVoters: 800,
    participationRate: 80,
    blankVotes: 10,
    nullVotes: 5,
    validVotes: 785,
    candidats: names.map((name, i) => ({ name, votes: 300 - i * 30, pct: 38.2 - i * 3 })),
  };
}

function block(
  slug = "presidentielle-2022",
  title = "Présidentielle 2022"
): PresidentielleCommuneBlock {
  return {
    electionSlug: slug,
    title,
    round1Date:
      slug === "presidentielle-2027" ? "2027-04-11T00:00:00.000Z" : "2022-04-10T00:00:00.000Z",
    tours: [tour(1, NAMES), tour(2, NAMES.slice(0, 2))],
    sources: [
      {
        round: 1,
        label: "Ministère de l'Intérieur",
        url: "https://www.data.gouv.fr/t1",
        publishedAt: "2022-04-14",
      },
      {
        round: 2,
        label: "Ministère de l'Intérieur",
        url: "https://www.data.gouv.fr/t2",
        publishedAt: "2022-04-28",
      },
    ],
    importedAt: "2026-10-12T08:00:00.000Z",
  };
}

function render(d: CommuneDossier) {
  const html = renderToStaticMarkup(<ElectionsSection dossier={d} />);
  const document = new DOMParser().parseFromString(html, "text/html");
  const text = document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return { html, document, text };
}

function withPresidentielles(
  blocks: PresidentielleCommuneBlock[],
  agregat: CommuneDossier["elections"]["presidentielles"]["agregatTerritoire"] = null
): CommuneDossier {
  const base = dossier();
  return {
    ...base,
    elections: { ...base.elections, presidentielles: { blocks, agregatTerritoire: agregat } },
  };
}

describe("présidentielle dans la commune", () => {
  it("montre le 2d tour avant le 1er, parts, source et lien national", () => {
    const { document, text } = render(withPresidentielles([block()]));

    expect(text).toContain("Présidentielle 2022");
    expect(text.indexOf("2d tour (24 avril 2022)")).toBeLessThan(
      text.indexOf("1er tour (10 avril 2022)")
    );
    expect(text).toContain("800 votants sur 1 000 inscrits, 785 suffrages exprimés.");
    expect(text).toContain("38,2 % · 300 voix");
    expect(text).toContain("importé le 12 octobre 2026");
    expect(document.querySelector('a[href="/elections/presidentielle-2022"]')?.textContent).toBe(
      "Résultats nationaux de cette élection"
    );
    // Each round keeps its own dataset: the second-round figures do not cite the first file.
    expect(document.querySelector('a[href="https://www.data.gouv.fr/t1"]')).not.toBeNull();
    expect(document.querySelector('a[href="https://www.data.gouv.fr/t2"]')).not.toBeNull();
    expect(text).toContain("2d tour, publié le 28 avril 2022");
    expect(text).toContain("1er tour, publié le 14 avril 2022");
  });

  it("replie les candidats du 1er tour au-delà de cinq", () => {
    const { document } = render(withPresidentielles([block()]));
    const folded = [...document.querySelectorAll("details details")].find((d) =>
      d.querySelector("summary")?.textContent?.includes("Autres candidats (2)")
    );
    expect(folded?.textContent).toContain("Jean Lassalle");
  });

  it("garde une seule ligne par type, même avec deux présidentielles", () => {
    const { document, text } = render(
      withPresidentielles([block("presidentielle-2027", "Présidentielle 2027"), block()])
    );
    // Municipales + the latest presidential: 2022 stays on the dedicated page.
    expect(document.querySelectorAll("#elections > ul > li")).toHaveLength(2);
    expect(text).not.toContain("Présidentielle 2022");
    expect(text).toContain("Tous les scrutins (3)");
    expect(
      document.querySelector('a[href="/territoires/communes/35238/elections"]')
    ).not.toBeNull();
  });

  it("n'emploie ni couleur ni étiquette de parti", () => {
    const { html } = render(withPresidentielles([block()]));
    expect(html).not.toMatch(/background-color|#[0-9a-f]{6}/i);
    expect(html).not.toContain("Renaissance");
  });

  it("garde l'encart 2027 tant que 2027 n'a pas de résultat, puis le remplace en tête", () => {
    const before = render(withPresidentielles([block()])).text;
    expect(before).toContain("Présidentielle 2027 : les résultats de la commune apparaîtront ici");

    const after = render(
      withPresidentielles([block("presidentielle-2027", "Présidentielle 2027"), block()])
    ).text;
    expect(after).not.toContain("apparaîtront ici");
    expect(after.indexOf("Présidentielle 2027")).toBeLessThan(after.indexOf("Municipales 2026"));
  });

  it("n'affiche aucun bloc sans résultat et une note honnête pour un territoire agrégé", () => {
    expect(render(withPresidentielles([])).text).not.toContain("Présidentielle 2022");
    const { text } = render(
      withPresidentielles([], {
        territoire: "Wallis-et-Futuna",
        electionTitle: "Présidentielle 2022",
      })
    );
    expect(text).toContain(
      "publie un seul résultat pour l'ensemble de Wallis-et-Futuna, sans détail par circonscription"
    );
    expect(text).not.toMatch(/\d+ voix/);
    expect(text).not.toContain("apparaîtront ici");
  });

  it("reste un composant serveur", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/territoires/CommunePresidentielle.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/^["']use client["']/m);
  });
});
