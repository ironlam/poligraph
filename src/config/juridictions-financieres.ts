/**
 * Regional and territorial audit chambers (CRTC), as ccomptes.fr numbers them in its per-chamber
 * RSS feeds (`/fr/rss/juridiction/{id}`, list on `/fr/flux-rss`, read on 2026-11-22).
 *
 * Closed list: the feed client builds its address from an id of this list only, and the chamber
 * named in a notice comes from here, never from the text of the feed.
 */

export interface JuridictionFinanciere {
  /** Feed id on ccomptes.fr. */
  id: number;
  type: "CRC" | "CTC";
  /** Name after "chambre régionale des comptes" or "chambre territoriale des comptes". */
  nom: string;
}

export const JURIDICTIONS_FINANCIERES: readonly JuridictionFinanciere[] = [
  { id: 134, type: "CRC", nom: "Auvergne-Rhône-Alpes" },
  { id: 135, type: "CRC", nom: "Bourgogne-Franche-Comté" },
  { id: 136, type: "CRC", nom: "Bretagne" },
  { id: 137, type: "CRC", nom: "Centre-Val de Loire" },
  { id: 138, type: "CRC", nom: "Corse" },
  { id: 139, type: "CRC", nom: "Guadeloupe-Guyane-Martinique" },
  { id: 142, type: "CRC", nom: "Hauts-de-France" },
  { id: 143, type: "CRC", nom: "Grand Est" },
  { id: 144, type: "CRC", nom: "Île-de-France" },
  { id: 146, type: "CRC", nom: "Normandie" },
  { id: 147, type: "CRC", nom: "Nouvelle-Aquitaine" },
  { id: 149, type: "CRC", nom: "Occitanie" },
  { id: 150, type: "CRC", nom: "Pays de la Loire" },
  { id: 152, type: "CRC", nom: "Provence-Alpes-Côte d'Azur" },
  { id: 153, type: "CRC", nom: "La Réunion" },
  { id: 154, type: "CRC", nom: "Mayotte" },
  { id: 140, type: "CTC", nom: "Saint-Barthélemy" },
  { id: 145, type: "CTC", nom: "Saint-Pierre-et-Miquelon" },
  { id: 148, type: "CTC", nom: "Nouvelle-Calédonie" },
  { id: 151, type: "CTC", nom: "Polynésie française" },
  { id: 326, type: "CTC", nom: "Saint-Martin" },
];

export function getJuridictionFinanciere(id: number): JuridictionFinanciere | undefined {
  return JURIDICTIONS_FINANCIERES.find((j) => j.id === id);
}
