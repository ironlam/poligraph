import { describe, expect, it } from "vitest";
import { getCollectivitesForRegion } from "@/config/collectivites-particulieres";
import { getRegionBySlug } from "@/config/regions";
import type { PresidenceBlock } from "@/lib/data/territoires";
import { regionPhraseReponse } from "../region-bandeau";

const NON_ETABLIE: PresidenceBlock = {
  state: "NON_ETABLI",
  person: null,
  title: null,
  lastConfirmedAt: null,
  source: null,
  registre: null,
};
const PERSONNE = { slug: "anne-exemple", fullName: "Anne Exemple", photoUrl: null, civility: null };

function phrase(slug: string, presidence: PresidenceBlock = NON_ETABLIE) {
  const segments = regionPhraseReponse({
    presidence,
    collectivitesParticulieres: getCollectivitesForRegion(getRegionBySlug(slug)!.code),
  });
  return { segments, text: segments.map((s) => s.text).join("") };
}

describe("phrase réponse du bandeau région", () => {
  it("nomme la présidence établie avec un lien vers sa fiche", () => {
    const { segments, text } = phrase("bretagne", {
      ...NON_ETABLIE,
      state: "ETABLI",
      person: PERSONNE,
    });
    expect(segments[0]).toEqual({ text: "Anne Exemple", href: "/politiques/anne-exemple" });
    expect(text).toBe("Anne Exemple préside le conseil régional.");
  });

  it("cite le nom du registre sans lien", () => {
    const registre = { fullName: "Dominique Registre", title: null };
    const { segments, text } = phrase("bretagne", { ...NON_ETABLIE, registre });
    expect(text).toBe(
      "Dominique Registre préside le conseil régional, d'après le registre national des élus."
    );
    expect(segments.some((s) => s.href)).toBe(false);
  });

  it("dit la présidence non établie sans nommer personne, même si une personne traîne", () => {
    const { segments, text } = phrase("bretagne", { ...NON_ETABLIE, person: PERSONNE });
    expect(text).toBe("La présidence n'est pas établie dans nos données.");
    expect(segments.some((s) => s.href)).toBe(false);
  });

  it("ne parle pas de conseil régional là où une collectivité unique exerce les compétences", () => {
    const { segments, text } = phrase("corse", {
      ...NON_ETABLIE,
      state: "ETABLI",
      person: PERSONNE,
    });
    expect(text).toBe(
      "Anne Exemple préside la collectivité. Collectivité compétente : Collectivité de Corse. Voir la note."
    );
    expect(text).not.toContain("conseil régional");
    expect(segments.at(-2)).toEqual({ text: "Voir la note", href: "#collectivite" });
  });
});
