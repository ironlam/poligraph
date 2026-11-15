import { z } from "zod";

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

export const territoireEvenementSchema = z.discriminatedUnion("type", [
  changementMaire,
  changementPresident,
  resultatElection,
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
