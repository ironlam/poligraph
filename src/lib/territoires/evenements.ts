import { z } from "zod";
import { getJuridictionFinanciere } from "@/config/juridictions-financieres";

/**
 * Events of the "fil du territoire" (Territoires v2, lot B). Pure. An event is a type, a date
 * and a few structured fields; the sentence is rendered from those fields by a template. A
 * payload that does not match the schema of its type is never shown.
 */

const nom = z.string().trim().min(1).max(120);

const changementMaire = z.strictObject({
  type: z.literal("CHANGEMENT_MAIRE"),
  /** Full name of the mayor the register now lists. */
  nom,
  /** Full name of the previous mayor, when the previous import named one. */
  predecesseur: nom.nullable(),
});

const changementPresident = z.strictObject({
  type: z.literal("CHANGEMENT_PRESIDENT"),
  conseil: z.enum(["DEPARTEMENTAL", "REGIONAL"]),
  nom,
  predecesseur: nom.nullable(),
});

const resultatElection = z.strictObject({
  type: z.literal("RESULTAT_ELECTION"),
  /** Slug of the election page the result is published on. */
  electionSlug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  /** Label of the election as the site writes it: "Municipales 2026". */
  electionLabel: z.string().trim().min(1).max(80),
  tour: z.union([z.literal(1), z.literal(2)]),
});

/**
 * The council elected a mayor on that day. Says nothing of who held the office before: true
 * for a re-elected mayor as for a first term, which `CHANGEMENT_MAIRE` without a predecessor
 * ("devient maire") is not.
 */
const electionMaire = z.strictObject({
  type: z.literal("ELECTION_MAIRE"),
  nom,
});

/** Senatorial election in one department: the number of seats filled, nobody named. */
const electionSenateurs = z.strictObject({
  type: z.literal("ELECTION_SENATEURS"),
  electionSlug: resultatElection.shape.electionSlug,
  electionLabel: resultatElection.shape.electionLabel,
  sieges: z.number().int().min(1).max(20),
});

/**
 * A regional or territorial audit chamber published a final observations report on the
 * territory. Facts only: the chamber, the report title and the opening of that title naming the
 * body, as the source writes it. Nothing of the chamber's own assessment.
 */
const rapportCrc = z.strictObject({
  type: z.literal("RAPPORT_CRC"),
  juridictionId: z
    .number()
    .int()
    .refine((id) => getJuridictionFinanciere(id) !== undefined),
  /** Only final observations reports are kept; budget opinions are left out. */
  document: z.literal("RAPPORT_OBSERVATIONS_DEFINITIVES"),
  /** "Département de la Meuse", "Commune d'Aizier": the source's own preposition and article. */
  collectivite: z
    .string()
    .trim()
    .regex(/^(?:Commune|Département|Région) \S/)
    .max(160),
  cahier: z.number().int().min(1).max(20).nullable(),
  /** Full title of the publication, shown to the person who checks the territory. */
  titre: z.string().trim().min(1).max(500),
});

export const territoireEvenementSchema = z.discriminatedUnion("type", [
  changementMaire,
  changementPresident,
  resultatElection,
  electionMaire,
  electionSenateurs,
  rapportCrc,
]);

export type TerritoireEvenementPayload = z.infer<typeof territoireEvenementSchema>;
export type TerritoireEvenementType = TerritoireEvenementPayload["type"];

/** Fields of an event of the given type, or null when they do not match its schema. */
export function parseEvenementPayload(
  type: string,
  payload: unknown
): TerritoireEvenementPayload | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const parsed = territoireEvenementSchema.safeParse({ ...payload, type });
  return parsed.success ? parsed.data : null;
}

/** A source link is shown only when it is a plain https URL. */
export function isEvenementSourceUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const ARTICLE_COLLECTIVITE: Record<string, string> = {
  Commune: "la commune",
  Département: "le département",
  Région: "la région",
};

/** "Département de la Meuse" -> "le département de la Meuse". */
function collectiviteDansLaPhrase(libelle: string): string {
  const [tete = "", ...reste] = libelle.split(" ");
  return [ARTICLE_COLLECTIVITE[tete] ?? tete, ...reste].join(" ");
}

const CONSEIL_LABEL = { DEPARTEMENTAL: "conseil départemental", REGIONAL: "conseil régional" };

/**
 * The sentence of an event, from its fields alone. Fixed templates, the same for every
 * territory and every person: no adjective, no party, and a wording that depends neither on
 * the gender of the person named nor on the first letter of a name (no elision to get wrong).
 */
export function phraseEvenement(evenement: TerritoireEvenementPayload): string {
  switch (evenement.type) {
    case "CHANGEMENT_MAIRE":
      return evenement.predecesseur
        ? `${evenement.nom} succède à ${evenement.predecesseur} comme maire.`
        : `${evenement.nom} devient maire.`;
    case "CHANGEMENT_PRESIDENT": {
      const conseil = CONSEIL_LABEL[evenement.conseil];
      return evenement.predecesseur
        ? `${evenement.nom} succède à ${evenement.predecesseur} à la présidence du ${conseil}.`
        : `${evenement.nom} prend la présidence du ${conseil}.`;
    }
    case "RESULTAT_ELECTION":
      return `${evenement.electionLabel} : résultats du ${evenement.tour === 1 ? "1er" : "2d"} tour.`;
    case "ELECTION_MAIRE":
      return `Élection du maire par le conseil municipal : ${evenement.nom}.`;
    case "RAPPORT_CRC": {
      const juridiction = getJuridictionFinanciere(evenement.juridictionId);
      const chambre =
        juridiction?.type === "CTC"
          ? `La chambre territoriale des comptes ${juridiction.nom}`
          : `La chambre régionale des comptes ${juridiction?.nom ?? ""}`.trimEnd();
      const objet = evenement.cahier
        ? `le cahier n° ${evenement.cahier} d'un rapport`
        : "un rapport";
      return `${chambre} a publié ${objet} sur ${collectiviteDansLaPhrase(evenement.collectivite)}.`;
    }
    case "ELECTION_SENATEURS":
      return `${evenement.electionLabel} : ${
        evenement.sieges === 1 ? "1 siège pourvu" : `${evenement.sieges} sièges pourvus`
      }.`;
  }
}
