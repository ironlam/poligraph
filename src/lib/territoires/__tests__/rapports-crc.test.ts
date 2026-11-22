import { describe, expect, it } from "vitest";
import { parseDocumentRapportCrc, parseTitreRapportCrc } from "../rapports-crc";

/**
 * Titles read on the per-chamber feeds of ccomptes.fr on 22 November 2026, spelled as published,
 * except "Département du Nord" and "Département de l'Aisne", written to cover the other prepositions.
 */
describe("parseTitreRapportCrc, collectivités", () => {
  it.each([
    ["Commune de Chartres (Eure-et-Loir)", "COMMUNE", "Chartres", "Eure-et-Loir"],
    ["Commune d'Aizier (Eure)", "COMMUNE", "Aizier", "Eure"],
    ["Commune d’Augirein (Ariège)", "COMMUNE", "Augirein", "Ariège"],
    ["Commune de La Roche-Posay (Vienne)", "COMMUNE", "La Roche-Posay", "Vienne"],
    [
      "Commune de Montceau-les Mines (Saône-et-Loire)",
      "COMMUNE",
      "Montceau-les Mines",
      "Saône-et-Loire",
    ],
    ["Commune de Pointe-à-Pitre (Guadeloupe)", "COMMUNE", "Pointe-à-Pitre", "Guadeloupe"],
    [
      "Commune de Voiron : les dépenses de rémunération du personnel (Isère)",
      "COMMUNE",
      "Voiron",
      "Isère",
    ],
    [
      "Commune de Marseille (Bouches-du-Rhône) cahier n° 2 : situation financière et gestion des ressources humaines",
      "COMMUNE",
      "Marseille",
      "Bouches-du-Rhône",
    ],
    ["Commune de Gaillard (Haute-Savoie) (2e avis)", "COMMUNE", "Gaillard", "Haute-Savoie"],
    ["Département de la Meuse", "DEPARTEMENT", "Meuse", "Meuse"],
    ["Département de la Gironde (Gironde)", "DEPARTEMENT", "Gironde", "Gironde"],
    [
      "Département de La Réunion - Cahier n°2 : L'autonomie des personnes agées",
      "DEPARTEMENT",
      "La Réunion",
      "La Réunion",
    ],
    ["Département du Nord", "DEPARTEMENT", "Nord", "Nord"],
    ["Département de l'Aisne", "DEPARTEMENT", "Aisne", "Aisne"],
    [
      "Région Bourgogne-Franche-Comté - alimentation durable",
      "REGION",
      "Bourgogne-Franche-Comté",
      null,
    ],
    [
      "Région Centre-Val de Loire - enquête relative à « la mobilisation et aux actions du programme européen LIFE en France » (Rapport public annuel 2027)",
      "REGION",
      "Centre-Val de Loire",
      null,
    ],
    [
      "Région Réunion - Le réseau Car Jaune - Cahier n° 1 : La gestion administrative et financière de la délégation de service public",
      "REGION",
      "Réunion",
      null,
    ],
  ])("%s", (titre, type, nom, departement) => {
    expect(parseTitreRapportCrc(titre).collectivite).toMatchObject({ type, nom, departement });
  });
});

it.each([
  ["Département de la Meuse", "Département de la Meuse"],
  ["Commune d’Augirein (Ariège)", "Commune d'Augirein"],
  ["Commune de Voiron : les dépenses de rémunération du personnel (Isère)", "Commune de Voiron"],
  ["Région Réunion - Le réseau Car Jaune - Cahier n° 1 : La gestion", "Région Réunion"],
])("libellé de la source : %s", (titre, libelle) => {
  expect(parseTitreRapportCrc(titre).collectivite?.libelle).toBe(libelle);
});

describe("parseTitreRapportCrc, hors périmètre", () => {
  it.each([
    "Communauté urbaine Caen la mer (Calvados) - Cahier n°1 : fiabilité comptable et trajectoire financière",
    "Communauté de communes du Pays fléchois (Sarthe)",
    "Syndicat mixte d'électricité de la Guadeloupe (SyMEG)",
    "Centre communal d'action sociale (CCAS) de Fléac (Charente)",
    "Caisse des écoles de la commune de Port-Louis (Guadeloupe)",
    "Service départemental d'incendie et de secours du Calvados (SDIS 14)",
    "Société publique locale \"Aménagement de l'agglomération dijonnaise\" (SPLAAD) (Côte-d'Or)",
    "Groupement d’intérêt public : L’Europe à Mayotte (Département de Mayotte)",
    "Chambre des métiers et de l'artisanat de la Région Hauts-de-France",
    "La gestion des fonds européens par la Région Occitanie (Haute-Garonne)",
    "Les stations thermales de la région Auvergne-Rhône-Alpes",
    "Collectivité de Corse - Cahier n° 1 : Les investissements dans le domaine routier",
    "Métropole Aix-Marseille-Provence (Bouches-du-Rhône), département des Bouches-du-Rhône, métropole Nice Côte d’Azur (Alpes-Maritimes), métropole Toulon Provence Méditerranée (Var), département du Var",
    "DuoDay à la chambre : deux journées d’immersion",
  ])("%s", (titre) => {
    expect(parseTitreRapportCrc(titre).collectivite).toBeNull();
  });
});

describe("parseTitreRapportCrc, cahier et avis", () => {
  it("lit le numéro de cahier sous ses graphies", () => {
    expect(
      parseTitreRapportCrc("Département de La Réunion - Cahier n°2 : Le patrimoine").cahier
    ).toBe(2);
    expect(
      parseTitreRapportCrc("Commune de Marseille (Bouches-du-Rhône) cahier n° 2 : x").cahier
    ).toBe(2);
    expect(parseTitreRapportCrc("Commune de Chartres (Eure-et-Loir)").cahier).toBeNull();
  });

  it("lit le rang d'un avis sans le prendre pour un département", () => {
    const titre = parseTitreRapportCrc("Commune de Périgny-sur-Yerres (Val-de-Marne) (2e avis)");
    expect(titre.rangAvis).toBe(2);
    expect(titre.collectivite?.departement).toBe("Val-de-Marne");
    expect(parseTitreRapportCrc("Commune de Trévoux (Ain)").rangAvis).toBeNull();
  });
});

/** Download buttons of two publication pages read on 22 November 2026, other markup removed. */
const PAGE_MEUSE = `<h2 class="title">Rapport d&#039;observations définitives</h2>
<a href="/sites/default/files/2026-10/GER202650.pdf" class="btn" data-document="Rapport d&#039;observations définitives">`;
const PAGE_GIRONDE = `<h2 class="title">Avis de contrôle budgétaire</h2>
<a href="/sites/default/files/2026-11/NAA2026-0134.pdf" class="btn" data-document="Avis de contrôle budgétaire">
<h2 class="title">Communiqué de presse</h2>
<a href="/sites/default/files/2026-11/x.pdf" class="btn" data-document="Communiqué de presse">`;

describe("parseDocumentRapportCrc", () => {
  it("reconnaît un rapport d'observations définitives", () => {
    expect(parseDocumentRapportCrc(PAGE_MEUSE)).toBe("RAPPORT_OBSERVATIONS_DEFINITIVES");
  });

  it("reconnaît un avis budgétaire malgré le communiqué joint", () => {
    expect(parseDocumentRapportCrc(PAGE_GIRONDE)).toBe("AVIS_BUDGETAIRE");
  });

  it("classe un autre document à part et rend null sans document", () => {
    expect(parseDocumentRapportCrc('<a data-document="Communiqué de presse">')).toBe("AUTRE");
    expect(parseDocumentRapportCrc("<html><body>Page introuvable</body></html>")).toBeNull();
  });
});
