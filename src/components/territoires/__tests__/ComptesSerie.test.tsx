import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The reader module opens the database at import; these tests only render.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { ComptesSerie } from "@/components/territoires/ComptesSerie";
import { groupComptes } from "@/lib/data/territoire-comptes";
import type { RepereRow } from "@/lib/data/territoire-reperes";

const SOURCE = {
  producer: "Observatoire des finances et de la gestion publique locales (OFGL)",
  resourceUrl: "https://data.ofgl.fr/explore/dataset/ofgl-base-departements-consolidee/",
  licenceName: "Licence Ouverte / Open Licence version 2.0 (Etalab)",
  licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
  attribution: "« Calcul OFGL, source DGFiP »",
  methodSlug: null,
  importedAt: "2026-11-22T01:05:00.000Z",
};

const row = (key: string, year: number, value: number | null, over: Partial<RepereRow> = {}) =>
  ({
    indicatorKey: `comptes_${key}`,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    scopeKind: "COMMUNE",
    scopeId: "",
    scopeLabel: null,
    value,
    unit: "€",
    sampleSize: null,
    state: value === null ? "NON_ETABLI" : "ETABLI",
    reason: null,
    source: SOURCE,
    ...over,
  }) as RepereRow;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/[ \t\n]+/g, " ")
    .trim();

// Bas-Rhin: its own accounts until 2020, the Collectivité européenne d'Alsace's from 2021.
const CEA = { scopeLabel: "Collectivité européenne d'Alsace" };
const BAS_RHIN = groupComptes([
  row("encours_dette_montant", 2024, 520647941, CEA),
  row("encours_dette_par_habitant", 2024, 267.06, CEA),
  row("encours_dette_montant", 2021, 718997162, CEA),
  row("encours_dette_par_habitant", 2021, 370.5, CEA),
  row("encours_dette_montant", 2020, 476920923),
  row("encours_dette_par_habitant", 2020, null, { reason: "POPULATION_NULLE" }),
]);

describe("série des comptes", () => {
  const html = renderToStaticMarkup(
    <ComptesSerie comptes={BAS_RHIN} territoire="Bas-Rhin (département)" />
  );

  it("donne un tableau de trois colonnes par agrégat, l'exercice le plus récent en premier", () => {
    expect(html.match(/<table/g)).toHaveLength(1);
    const rows = [...html.matchAll(/<th scope="row"[^>]*>(\d{4})<\/th>/g)].map((m) => m[1]);
    expect(rows).toEqual(["2024", "2021", "2020"]);
    expect(text(html)).toContain("Exercice Par habitant Montant total");
    expect(text(html)).toContain("2024 267 € 520,6 millions d'euros");
  });

  it("dit « Non établi » avec son motif, jamais zéro", () => {
    expect(text(html)).toContain("2020 Non établi 476,9 millions d'euros");
    expect(text(html)).toContain("la commune n'a pas d'habitant recensé");
  });

  it("nomme la collectivité qui porte les comptes et sur quels exercices", () => {
    expect(text(html)).toContain("2021 à 2024 : comptes de la Collectivité européenne d'Alsace.");
  });

  it("garde les agrégats sans exercice publié, sans tableau vide", () => {
    expect(text(html)).toContain("Dépenses de fonctionnement Méthode Aucun exercice publié.");
  });

  it("porte la période de la série dans la ligne de source", () => {
    expect(text(html)).toContain("Comptes 2020 à 2024 · Source : Calcul OFGL, source DGFiP");
  });

  it("sépare d'un intertitre les exercices dont la collectivité change", () => {
    const groups = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) =>
      text(m[1]!).replace(/\u00a0/g, " ")
    );
    expect(groups).toEqual([
      "Collectivité européenne d'Alsace 2024 267 € 520,6 millions d'euros 2021 371 € 719 millions d'euros",
      "Bas-Rhin (département) 2020 Non établi 476,9 millions d'euros",
    ]);
    // An intertitle names the rows under it for a screen reader.
    expect(html.match(/<th scope="rowgroup" colSpan="3"/g)).toHaveLength(2);
  });
});

describe("série sans changement de périmètre", () => {
  it("n'ajoute aucun intertitre, avec ou sans collectivité porteuse", () => {
    for (const over of [{}, { scopeLabel: "Ville de Paris" }]) {
      const html = renderToStaticMarkup(
        <ComptesSerie
          comptes={groupComptes([
            row("encours_dette_montant", 2024, 1, over),
            row("encours_dette_montant", 2023, 2, over),
          ])}
          territoire="Paris (commune)"
        />
      );
      expect(html).not.toContain("rowgroup");
      expect(html.match(/<tbody>/g)).toHaveLength(1);
    }
  });

  it("se déclenche sur le libellé, quel que soit le territoire", () => {
    const html = renderToStaticMarkup(
      <ComptesSerie
        comptes={groupComptes([
          row("encours_dette_montant", 2024, 1, { scopeLabel: "Ville de Paris" }),
          row("encours_dette_montant", 2018, 2),
        ])}
        territoire="Paris (commune)"
      />
    );
    expect(text(html)).toContain("Ville de Paris 2024");
    expect(text(html)).toContain("Paris (commune) 2018");
  });
});
