import { describe, expect, it } from "vitest";
import {
  dossier,
  grandeCommune,
  papeete,
  paris,
  withMaire,
} from "@/app/territoires/communes/[code]/__tests__/fixtures";
import { communeFaitParlement, communePhraseReponse } from "../commune-bandeau";

const text = (segments: { text: string }[]) => segments.map((s) => s.text).join("");

describe("phrase réponse du bandeau commune", () => {
  it("nomme le maire établi avec un lien vers sa fiche et la date de prise de fonction", () => {
    const segments = communePhraseReponse(dossier());
    expect(segments[0]).toEqual({ text: "Camille Exemple", href: "/politiques/camille-exemple" });
    expect(text(segments)).toBe("Camille Exemple est maire depuis le 22 mars 2026.");
  });

  it("se passe de date quand aucune n'est enregistrée", () => {
    const base = dossier();
    const maire = { ...base.maire, functionStart: null, mandateStart: null };
    expect(text(communePhraseReponse({ ...base, maire }))).toBe("Camille Exemple est maire.");
  });

  it("dit le maire non établi sans nommer personne", () => {
    const segments = communePhraseReponse(withMaire("NON_ETABLI"));
    expect(text(segments)).toBe(
      "Titulaire non établi : les données enregistrées ne permettent pas de désigner le maire avec certitude."
    );
    expect(segments.some((s) => s.href)).toBe(false);
  });

  it("dit l'absence de maire en mots", () => {
    expect(text(communePhraseReponse(withMaire("ABSENT")))).toBe(
      "Aucun maire en fonction n'est enregistré."
    );
  });

  // Several holders reach the dossier as NON_ETABLI without the reason: a person left in the
  // block by mistake must never be named.
  it.each(["NON_ETABLI", "ABSENT"] as const)(
    "ne sort aucun nom d'un bloc %s qui porterait une personne",
    (state) => {
      const base = dossier();
      const segments = communePhraseReponse({ ...base, maire: { ...base.maire, state } });
      expect(text(segments)).not.toContain("Camille Exemple");
      expect(segments.some((s) => s.href)).toBe(false);
    }
  );

  it("renvoie à la note d'une collectivité à statut particulier sans la recopier", () => {
    expect(text(communePhraseReponse(paris()))).toBe(
      "Camille Exemple est maire depuis le 22 mars 2026. Statut particulier : voir la note plus bas."
    );
  });
});

describe("fait Parlement du bandeau commune", () => {
  it("ne nomme aucun député quand plusieurs circonscriptions couvrent la commune", () => {
    expect(communeFaitParlement(paris().parlement.deputes)).toEqual({
      valeur: "Plusieurs circonscriptions",
      valeurCourte: "Plusieurs circ.",
      legende: "Le député dépend de l'adresse.",
    });
  });

  it("donne la circonscription enregistrée sans député quand il n'est pas établi", () => {
    const fait = communeFaitParlement(grandeCommune().parlement.deputes);
    expect(fait.valeur).toBe("1re circonscription enregistrée");
    expect(fait.valeurCourte).toBe("1re circ.");
    expect(fait.legende).not.toContain("Dominique Député");
  });

  it("accorde la fonction à la civilité, et ne devine rien quand elle est inconnue", () => {
    const { deputes } = dossier().parlement;
    expect(communeFaitParlement(deputes).legende).toBe("Députée : Dominique Député");
    const inconnue = { ...deputes, deputes: [{ ...deputes.deputes[0]!, civility: null }] };
    expect(communeFaitParlement(inconnue).legende).toBe(
      "À l'Assemblée nationale : Dominique Député"
    );
    expect(communeFaitParlement({ ...deputes, circonscriptionEnregistree: 3 }).valeurCourte).toBe(
      "3e circ."
    );
  });

  it("dit en mots l'absence de circonscription enregistrée", () => {
    expect(communeFaitParlement(papeete().parlement.deputes).valeur).toBe(
      "Circonscription non renseignée"
    );
  });
});
