import { z } from "zod/v4";

const CHANGELOG_TYPES = ["NOUVEAUTE", "AMELIORATION", "CORRECTION", "DONNEES"] as const;

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
  .refine((value) => {
    const day = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }, "Ce jour n'existe pas");

const httpsUrl = z
  .string()
  .max(500)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Le lien doit être une adresse https valide");

export const createChangelogSchema = z.object({
  type: z.enum(CHANGELOG_TYPES),
  date: isoDay,
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(600),
  sourceUrl: httpsUrl.nullable().optional(),
});

/** `status` is the only way to publish: the route refuses it without a source. */
export const updateChangelogSchema = z.object({
  type: z.enum(CHANGELOG_TYPES).optional(),
  date: isoDay.optional(),
  title: z.string().trim().min(1).max(140).optional(),
  body: z.string().trim().min(1).max(600).optional(),
  sourceUrl: httpsUrl.nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});
