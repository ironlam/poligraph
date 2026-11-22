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
  const html = renderToStaticMarkup(<ComptesSerie comptes={BAS_RHIN} />);

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
});
