import { describe, expect, it } from "vitest";
import { dossier, withMaire } from "@/app/territoires/communes/[code]/__tests__/fixtures";
import { communeSources } from "../commune-sources";

const ligne = (lignes: ReturnType<typeof communeSources>, bloc: string) =>
  lignes.find((l) => l.bloc === bloc);

describe("sources de la page commune", () => {
  it("liste chaque bloc de la couverture, identité comprise, dans l'ordre de la matrice", () => {
    expect(communeSources(dossier()).map((l) => l.label)).toEqual([
      "Identité de la commune",
      "Maire",
      "Conseil municipal",
      "Population",
      "Circonscription législative",
      "Sénateurs du département",
      "Résultats des municipales 2026",
    ]);
  });

  it("date un fait selon ce que sa date signifie, et dit quand elle manque", () => {
    const base = dossier();
    const coverage = base.coverage.map((c) =>
      c.bloc === "maire" ? { ...c, date: "2026-10-01T00:00:00.000Z" } : c
    );
    const lignes = communeSources({ ...base, coverage });
    expect(ligne(lignes, "maire")).toMatchObject({
      etat: "dernière confirmation le 1 octobre 2026",
      source: { label: "Répertoire National des Élus" },
    });
    expect(ligne(lignes, "population")?.etat).toBe("date non enregistrée");
  });

  it("dit l'absence en mots et ne porte alors aucune source", () => {
    expect(ligne(communeSources(withMaire("NON_ETABLI")), "maire")).toMatchObject({
      etat: "non établi dans nos données",
      source: null,
    });
    expect(ligne(communeSources(withMaire("ABSENT")), "maire")?.etat).toBe(
      "aucune donnée enregistrée"
    );
    expect(ligne(communeSources(dossier()), "conseilMunicipal")?.etat).toBe(
      "non établi dans nos données"
    );
  });

  it("distingue une population millésimée vérifiée d'une population importée", () => {
    const base = dossier();
    const coverage = base.coverage.map((c) =>
      c.bloc === "population" ? { ...c, date: "2026-10-11T08:00:00.000Z" } : c
    );
    expect(ligne(communeSources({ ...base, coverage }), "population")?.etat).toBe(
      "importée le 11 octobre 2026"
    );
    const vintage = {
      millesime: 2023,
      effectiveFrom: "2026-01-01",
      producer: "INSEE",
      sourceLabel: "INSEE",
      sourceUrl: "https://www.insee.fr",
      importedAt: "2026-10-11T08:00:00.000Z",
    };
    const millesimee = { ...base, coverage, population: { ...base.population, vintage } };
    expect(ligne(communeSources(millesimee), "population")?.etat).toBe(
      "vérifiée le 11 octobre 2026"
    );
  });
});
