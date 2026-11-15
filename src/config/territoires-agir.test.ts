import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "@/config/departments";
import {
  AGIR_AVERTISSEMENT,
  AGIR_VOIES,
  AGIR_VOIES_DEPARTEMENT,
  AGIR_VOIES_REGION,
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

// Every line that can be displayed: the three levels and each territorial variant of a commune.
const TOUTES_LES_VOIES = [
  ...AGIR_VOIES,
  ...AGIR_VOIES_DEPARTEMENT,
  ...AGIR_VOIES_REGION,
  ...["35", "975", "987", "988"].flatMap((code) => voiesAgir(code)),
];

describe("texte du bloc Agir", () => {
  it("ne cite que des sources officielles, en https", () => {
    const liens = [...TOUTES_LES_VOIES.flatMap((v) => v.liens), ...TRIBUNAL_SOURCES];
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
    for (const voie of TOUTES_LES_VOIES) {
      expect(voie.texte, voie.id).not.toMatch(/\d|\bmois\b|\bjours?\b|\beuros?\b/i);
      expect(voie.texte).not.toMatch(/[–—]/);
      expect(voie.liens.length, voie.id).toBeGreaterThan(0);
    }
    expect(AGIR_AVERTISSEMENT).toContain("ne remplace pas un conseil juridique");
  });
});

describe("voies affichées selon le régime de la commune", () => {
  const ids = (code: string) => voiesAgir(code).map((v) => v.id);
  const TOUTES = ["assister", "documents", "contacter", "participer", "voter", "contester"];
  // The consultation of the voters is not asserted where its application was not verified.
  const SANS_CONSULTATION = TOUTES.filter((id) => id !== "participer");
  const labels = (code: string, id: string) =>
    voiesAgir(code)
      .find((v) => v.id === id)!
      .liens.map((l) => l.label);

  // Article L. 2541-1 of the CGCT does not set L. 2121-18 nor L. 2121-26 aside for Alsace-Moselle.
  it.each(["35", "974", "57", "67", "68"])(
    "donne les quatre voies et cite le CGCT pour le code %s",
    (code) => {
      expect(ids(code)).toEqual(TOUTES);
      expect(labels(code, "assister")[0]).toContain("article L. 2121-18");
      expect(labels(code, "documents")).toHaveLength(2);
    }
  );

  it("cite le code des communes de la Nouvelle-Calédonie, pas le CGCT", () => {
    expect(ids("988")).toEqual(SANS_CONSULTATION);
    expect(labels("988", "assister")).toEqual([
      "Code des communes de la Nouvelle-Calédonie, article L. 121-15",
    ]);
    expect(labels("988", "documents")).toEqual([
      "Code des communes de la Nouvelle-Calédonie, article L. 121-19",
    ]);
    // Its list of documents was not read in full: none is named.
    expect(voiesAgir("988").find((v) => v.id === "documents")?.texte).not.toMatch(/budgets/);
  });

  it("cite le CGCT en Polynésie française, sans la fiche dont l'application n'est pas vérifiée", () => {
    expect(ids("987")).toEqual(SANS_CONSULTATION);
    expect(ids("975")).toEqual(SANS_CONSULTATION);
    expect(labels("987", "documents")).toEqual([
      "Code général des collectivités territoriales, article L. 2121-26",
    ]);
  });
});

describe("voies du département et de la région", () => {
  it.each([
    ["département", AGIR_VOIES_DEPARTEMENT, "conseil départemental", "L. 3121-11", "L. 3121-17"],
    ["région", AGIR_VOIES_REGION, "conseil régional", "L. 4132-10", "L. 4132-16"],
  ] as const)("cite les articles propres au %s", (_, voies, conseil, seances, documents) => {
    expect(voies.map((v) => v.id)).toEqual([
      "assister",
      "documents",
      "contacter",
      "participer",
      "contester",
    ]);
    expect(voies[0]?.texte).toBe(`Les séances du ${conseil} sont publiques.`);
    expect(voies[0]?.liens[0]?.label).toContain(seances);
    expect(voies[1]?.liens[0]?.label).toContain(documents);
    // No word of the commune leaks into another level.
    expect(voies.map((v) => `${v.titre} ${v.texte}`).join(" ")).not.toMatch(
      /mairie|municipal|commune/
    );
  });
});

describe("territoires sans mairie", () => {
  // Wallis-et-Futuna is made of circonscriptions, the TAAF of districts, and a collectivité took
  // the place of the commune in Saint-Barthélemy and Saint-Martin: sending a reader to
  // « la mairie » there would point to an authority that does not exist.
  it.each(["977", "978", "984", "986", "989"])("n'affiche pas le bloc pour le code %s", (code) => {
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
