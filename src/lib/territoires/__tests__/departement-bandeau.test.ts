import { describe, expect, it } from "vitest";
import { getCollectivitesForDepartment } from "@/config/collectivites-particulieres";
import { getTerritoireHorsRegion } from "@/config/regions";
import type { PresidenceBlock } from "@/lib/data/territoires";
import { compteEnMots, departementPhraseReponse } from "../departement-bandeau";

const NON_ETABLIE: PresidenceBlock = {
  state: "NON_ETABLI",
  person: null,
  title: null,
  lastConfirmedAt: null,
  source: null,
  registre: null,
};
const PERSONNE = {
  slug: "claire-exemple",
  fullName: "Claire Exemple",
  photoUrl: null,
  civility: null,
};

function phrase(code: string, presidence: PresidenceBlock = NON_ETABLIE, remplace = false) {
  const segments = departementPhraseReponse(
    {
      presidence,
      territoireHorsRegion: getTerritoireHorsRegion(code),
      collectivitesParticulieres: getCollectivitesForDepartment(code),
    },
    remplace
  );
  return { segments, text: segments.map((s) => s.text).join("") };
}

describe("phrase réponse du bandeau département", () => {
  it("nomme la présidence établie avec un lien vers sa fiche", () => {
    const { segments, text } = phrase("27", { ...NON_ETABLIE, state: "ETABLI", person: PERSONNE });
    expect(segments[0]).toEqual({ text: "Claire Exemple", href: "/politiques/claire-exemple" });
    expect(text).toBe("Claire Exemple préside le conseil départemental.");
  });

  it("cite le nom du registre sans lien quand aucun mandat ne l'établit", () => {
    const registre = { fullName: "Dominique Registre", title: null };
    const { segments, text } = phrase("27", { ...NON_ETABLIE, registre });
    expect(text).toBe(
      "Dominique Registre préside le conseil départemental, d'après le registre national des élus."
    );
    expect(segments.some((s) => s.href)).toBe(false);
  });

  it("dit la présidence non établie sans nommer personne, même si une personne traîne", () => {
    const { segments, text } = phrase("27", { ...NON_ETABLIE, person: PERSONNE });
    expect(text).toBe("La présidence du conseil départemental n'est pas établie dans nos données.");
    expect(segments.some((s) => s.href)).toBe(false);
  });

  it("ne nomme aucun conseil départemental quand une collectivité le remplace", () => {
    const { segments, text } = phrase("75", NON_ETABLIE, true);
    expect(text).toBe("Collectivité compétente : Ville de Paris. Voir la note.");
    expect(segments.find((s) => s.href)).toEqual({ text: "Voir la note", href: "#collectivite" });
  });

  it("garde la présidence et renvoie à la note pour un statut particulier qui ne remplace pas", () => {
    const { text } = phrase("69");
    expect(text).toMatch(/^La présidence du conseil départemental n'est pas établie/);
    expect(text).toMatch(
      /Collectivité à statut particulier : .*Métropole de Lyon.*\. Voir la note\.$/
    );
  });

  it("donne le statut d'un territoire hors région, sans présidence", () => {
    expect(phrase("975").text).toBe("Collectivité d'outre-mer, hors de toute région.");
  });
});

describe("compte en mots", () => {
  it("dit « Aucun » plutôt que zéro et accorde le nom", () => {
    expect(compteEnMots(0, "député")).toEqual({ valeur: "Aucun", nom: "député" });
    expect(compteEnMots(1, "sénateur")).toEqual({ valeur: "1", nom: "sénateur" });
    expect(compteEnMots(1234, "commune")).toEqual({ valeur: "1 234", nom: "communes" });
  });
});
