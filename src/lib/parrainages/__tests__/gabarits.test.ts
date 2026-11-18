import { describe, expect, it } from "vitest";
import { MENTION_PRESENTATION } from "@/config/parrainages";
import {
  formatDatePublication,
  libelleDepartements,
  mandatPublie,
  nomElu,
  partDuSeuil,
  phraseCandidat,
  phraseDepartement,
  phrasePresentation,
  phraseTableauDeBord,
} from "../gabarits";

const plain = (text: string) => text.replace(/ /g, " ");
const ligne = {
  firstName: "Gilles",
  lastName: "CORDIVAL",
  mandateLabel: "Maire",
  constituencyLabel: "Mont-Saint-Père",
  candidateName: "ARTHAUD Nathalie",
  publishedOn: "2022-02-01",
};

describe("gabarits des pages de parrainages", () => {
  it("résume le tableau de bord, au singulier comme au pluriel", () => {
    const candidats = [{ total: 2636 }, { total: 576 }, { total: 293 }];
    expect(plain(phraseTableauDeBord({ total: 3505, candidats }))).toBe(
      "2 candidats comptent au moins 500 présentations. 3 505 présentations publiées pour 3 candidats."
    );
    expect(
      plain(phraseTableauDeBord({ total: 501, candidats: [{ total: 500 }, { total: 1 }] }))
    ).toBe(
      "1 candidat compte au moins 500 présentations. 501 présentations publiées pour 2 candidats."
    );
    expect(plain(phraseTableauDeBord({ total: 1, candidats: [{ total: 1 }] }))).toBe(
      "1 présentation publiée pour 1 candidat."
    );
  });

  it("résume un candidat et un département", () => {
    expect(plain(phraseCandidat({ total: 2636, departements: 107 }))).toBe(
      "2 636 présentations publiées, venues de 107 départements ou collectivités."
    );
    expect(plain(phraseCandidat({ total: 1, departements: 1 }))).toBe(
      "1 présentation publiée, venue de 1 département ou collectivité."
    );
    expect(plain(phraseDepartement({ total: 259, candidats: 31 }))).toBe(
      "259 présentations publiées par des élus de ce département, pour 31 candidats."
    );
    expect(libelleDepartements(30)).toBe("30 départements ou collectivités");
  });

  it("garde le nom, le mandat et le territoire tels que publiés", () => {
    expect(nomElu(ligne)).toBe("Gilles CORDIVAL");
    expect(mandatPublie(ligne)).toBe("Maire, Mont-Saint-Père");
    expect(mandatPublie({ mandateLabel: "Sénatrice", constituencyLabel: "" })).toBe("Sénatrice");
  });

  it("écrit « a présenté » et la date de publication, premier du mois compris", () => {
    expect(phrasePresentation(ligne)).toBe(
      "Gilles CORDIVAL (Maire, Mont-Saint-Père) a présenté ARTHAUD Nathalie (publié le 1er février 2022)."
    );
    expect(formatDatePublication("2022-03-07")).toBe("7 mars 2022");
  });

  it("remplit la barre à 500 et ne la dépasse pas", () => {
    expect(partDuSeuil(0)).toBe(0);
    expect(partDuSeuil(417)).toBe(83);
    expect(partDuSeuil(500)).toBe(100);
    expect(partDuSeuil(2636)).toBe(100);
  });

  it("ne parle jamais de soutien ni d'absence dans une phrase produite", () => {
    const phrases = [
      phraseTableauDeBord({ total: 600, candidats: [{ total: 600 }] }),
      phraseCandidat({ total: 600, departements: 40 }),
      phraseDepartement({ total: 12, candidats: 3 }),
      phrasePresentation(ligne),
    ];
    for (const phrase of phrases) {
      expect(phrase).not.toMatch(/sout|ralli|parrain|n'a (pas|présenté personne)|aucun/i);
      expect(phrase).not.toMatch(/[—–]/);
    }
    expect(MENTION_PRESENTATION).toBe("Une présentation n'est pas un soutien politique.");
  });
});
