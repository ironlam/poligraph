import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "@/config/departments";
import {
  AGIR_AVERTISSEMENT,
  AGIR_VOIES,
  aUneMairie,
  siegeTribunalAdministratif,
  TRIBUNAL_SOURCES,
  voiesAgir,
} from "./territoires-agir";

const HOTES_OFFICIELS = [
  "www.legifrance.gouv.fr",
  "www.service-public.gouv.fr",
  "lannuaire.service-public.gouv.fr",
];

describe("texte du bloc Agir", () => {
  it("ne cite que des sources officielles, en https", () => {
    const liens = [...AGIR_VOIES.flatMap((v) => v.liens), ...TRIBUNAL_SOURCES];
    expect(liens.length).toBeGreaterThan(0);
    for (const lien of liens) {
      const url = new URL(lien.url);
      expect(url.protocol).toBe("https:");
      expect(HOTES_OFFICIELS, lien.url).toContain(url.hostname);
    }
  });

  // A deadline or a threshold copied here would go stale and mislead: the page sends the reader
  // to the source instead.
  it("n'écrit aucun délai, seuil ni montant", () => {
    for (const voie of AGIR_VOIES) {
      expect(voie.texte, voie.id).not.toMatch(/\d|\bmois\b|\bjours?\b|\beuros?\b/i);
      expect(voie.texte).not.toMatch(/[–—]/);
      expect(voie.liens.length, voie.id).toBeGreaterThan(0);
    }
    expect(AGIR_AVERTISSEMENT).toContain("ne remplace pas un conseil juridique");
  });
});

describe("voies affichées selon le régime de la commune", () => {
  const ids = (code: string, horsRegion = false) => voiesAgir(code, horsRegion).map((v) => v.id);

  it("donne les quatre voies sous le régime commun, outre-mer compris", () => {
    expect(ids("35")).toEqual(["assister", "documents", "contacter", "contester"]);
    expect(ids("974")).toEqual(["assister", "documents", "contacter", "contester"]);
  });

  // The CGCT articles are not cited where their application is not established.
  it.each([
    ["Polynésie française", "987", true],
    ["Nouvelle-Calédonie", "988", true],
    ["Moselle", "57", false],
    ["Bas-Rhin", "67", false],
    ["Haut-Rhin", "68", false],
  ])("ne cite pas le CGCT pour %s", (_, code, horsRegion) => {
    expect(ids(code, horsRegion)).toEqual(["contacter", "contester"]);
  });
});

describe("territoires sans mairie", () => {
  // Wallis-et-Futuna is made of circonscriptions, the TAAF of districts: sending a reader to
  // « la mairie » there would point to an authority that does not exist.
  it.each(["984", "986", "989"])("n'affiche pas le bloc pour le code %s", (code) => {
    expect(aUneMairie(code)).toBe(false);
  });

  it("l'affiche pour une commune, y compris d'une collectivité d'outre-mer", () => {
    expect(aUneMairie("35")).toBe(true);
    expect(aUneMairie("987")).toBe(true);
    expect(aUneMairie("975")).toBe(true);
  });
});

describe("siège du tribunal administratif", () => {
  it("couvre chaque département et collectivité du référentiel", () => {
    const sans = Object.keys(DEPARTMENTS).filter((code) => !siegeTribunalAdministratif(code));
    expect(sans).toEqual([]);
  });

  it("suit le ressort fixé par l'article R. 221-3", () => {
    expect(siegeTribunalAdministratif("35")).toBe("Rennes");
    expect(siegeTribunalAdministratif("2a")).toBe("Bastia");
    expect(siegeTribunalAdministratif("93")).toBe("Montreuil");
    expect(siegeTribunalAdministratif("94")).toBe("Melun");
    expect(siegeTribunalAdministratif("972")).toBe("Schœlcher");
    // Saint-Barthélemy and Saint-Martin have their own court, which sits in Basse-Terre.
    expect(siegeTribunalAdministratif("977")).toBe("Basse-Terre");
    expect(siegeTribunalAdministratif("984")).toBe("Saint-Denis");
    expect(siegeTribunalAdministratif("99")).toBeNull();
  });
});
