import { describe, expect, it } from "vitest";
import { parseEvenementPayload, phraseEvenement } from "../evenements";
import { parseTitreRapportCrc } from "../rapports-crc";

/** Payload built the way the importer will: from the title of the publication as published. */
function payload(titre: string, juridictionId = 143) {
  const lu = parseTitreRapportCrc(titre);
  return {
    juridictionId,
    document: "RAPPORT_OBSERVATIONS_DEFINITIVES",
    collectivite: lu.collectivite?.libelle,
    cahier: lu.cahier,
    titre,
  };
}

function phrase(titre: string, juridictionId?: number): string {
  const evenement = parseEvenementPayload("RAPPORT_CRC", payload(titre, juridictionId));
  if (!evenement) throw new Error(`payload refusé pour ${titre}`);
  return phraseEvenement(evenement);
}

describe("phraseEvenement, rapport d'une chambre régionale des comptes", () => {
  it.each([
    [
      "Département de la Meuse",
      143,
      "La chambre régionale des comptes Grand Est a publié un rapport sur le département de la Meuse.",
    ],
    [
      "Commune d’Aizier (Eure)",
      146,
      "La chambre régionale des comptes Normandie a publié un rapport sur la commune d'Aizier.",
    ],
    [
      "Commune de Voiron : les dépenses de rémunération du personnel (Isère)",
      134,
      "La chambre régionale des comptes Auvergne-Rhône-Alpes a publié un rapport sur la commune de Voiron.",
    ],
    [
      "Région Bourgogne-Franche-Comté - alimentation durable",
      135,
      "La chambre régionale des comptes Bourgogne-Franche-Comté a publié un rapport sur la région Bourgogne-Franche-Comté.",
    ],
    [
      "Département de La Réunion - Cahier n°2 : L'autonomie des personnes agées",
      153,
      "La chambre régionale des comptes La Réunion a publié le cahier n° 2 d'un rapport sur le département de La Réunion.",
    ],
    [
      "Commune de Saint-Pierre (Saint-Pierre-et-Miquelon)",
      145,
      "La chambre territoriale des comptes Saint-Pierre-et-Miquelon a publié un rapport sur la commune de Saint-Pierre.",
    ],
  ])("%s", (titre, juridictionId, attendue) => {
    expect(phrase(titre, juridictionId)).toBe(attendue);
  });

  it("ne reprend rien du titre au-delà du nom de la collectivité", () => {
    expect(
      phrase("Commune de Voiron : les dépenses de rémunération du personnel (Isère)", 134)
    ).not.toMatch(/dépenses|Isère/);
  });
});

describe("parseEvenementPayload, RAPPORT_CRC", () => {
  const valide = payload("Département de la Meuse");

  it("accepte un rapport d'observations définitives", () => {
    expect(parseEvenementPayload("RAPPORT_CRC", valide)).not.toBeNull();
  });

  it.each([
    ["un avis budgétaire", { document: "AVIS_BUDGETAIRE" }],
    ["une juridiction hors registre", { juridictionId: 98 }],
    ["un libellé qui n'ouvre pas sur la collectivité", { collectivite: "Syndicat mixte de X" }],
    ["un résumé ajouté", { resume: "La situation financière est tendue." }],
    ["un titre vide", { titre: " " }],
  ])("refuse %s", (_cas, modif) => {
    expect(parseEvenementPayload("RAPPORT_CRC", { ...valide, ...modif })).toBeNull();
  });
});
