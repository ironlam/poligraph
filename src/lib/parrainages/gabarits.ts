import { SEUIL_PRESENTATIONS } from "@/config/parrainages";

/**
 * Every sentence of the presentation pages comes from one of these templates, filled with counts
 * and published values. None is written by a language model. The verb is always "présenter": a
 * presentation is not an endorsement. No template states that someone presented nobody.
 */

const nombre = (value: number) => value.toLocaleString("fr-FR").replace(/ /g, " ");
const pluriel = (count: number, singulier: string, plurielForm = `${singulier}s`) =>
  `${nombre(count)} ${count > 1 ? plurielForm : singulier}`;

export const formatNombre = nombre;

/** "7 mars 2022" or "1er février 2022", from an ISO date, without any time zone shift. */
export function formatDatePublication(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  const rest = date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const day = date.getUTCDate();
  return `${day === 1 ? "1er" : day} ${rest}`;
}

/** Name of an elected official as published, first name first: "Gilles CORDIVAL". */
export const nomElu = (ligne: { firstName: string; lastName: string }) =>
  `${ligne.firstName} ${ligne.lastName}`;

/** Mandate and territory as published: "Maire, Mont-Saint-Père" or "Sénateur". */
export function mandatPublie(ligne: { mandateLabel: string; constituencyLabel: string }): string {
  return ligne.constituencyLabel
    ? `${ligne.mandateLabel}, ${ligne.constituencyLabel}`
    : ligne.mandateLabel;
}

export function phraseTableauDeBord(input: {
  total: number;
  candidats: readonly { total: number }[];
}): string {
  const auSeuil = input.candidats.filter((c) => c.total >= SEUIL_PRESENTATIONS).length;
  const publiees = `${pluriel(input.total, "présentation publiée", "présentations publiées")} pour ${pluriel(input.candidats.length, "candidat")}.`;
  if (auSeuil === 0) return publiees;
  const verbe = auSeuil > 1 ? "comptent" : "compte";
  return `${pluriel(auSeuil, "candidat")} ${verbe} au moins ${nombre(SEUIL_PRESENTATIONS)} présentations. ${publiees}`;
}

export const libelleDepartements = (count: number) =>
  count > 1 ? `${nombre(count)} départements ou collectivités` : "1 département ou collectivité";

export function phraseCandidat(input: { total: number; departements: number }): string {
  const venues = input.total > 1 ? "publiées, venues de" : "publiée, venue de";
  return `${pluriel(input.total, "présentation")} ${venues} ${libelleDepartements(input.departements)}.`;
}

export function phraseDepartement(input: { total: number; candidats: number }): string {
  const publiees = input.total > 1 ? "présentations publiées" : "présentation publiée";
  return `${nombre(input.total)}\u00a0${publiees} par des élus de ce département, pour ${pluriel(input.candidats, "candidat")}.`;
}

/** Share of the 500 reached, between 0 and 100, for the width of a bar. */
export const partDuSeuil = (total: number) =>
  Math.min(100, Math.round((total / SEUIL_PRESENTATIONS) * 100));

/** One line of a commune page: "Gilles CORDIVAL (Maire, Mont-Saint-Père) a présenté …". */
export function phrasePresentation(ligne: {
  firstName: string;
  lastName: string;
  mandateLabel: string;
  constituencyLabel: string;
  candidateName: string;
  publishedOn: string;
}): string {
  return `${nomElu(ligne)} (${mandatPublie(ligne)}) a présenté ${ligne.candidateName} (publié le ${formatDatePublication(ligne.publishedOn)}).`;
}
