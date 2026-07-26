import { z } from "zod/v4";

// Must stay identical to the Prisma `AffairStatus` enum: a value missing here is a
// status moderation cannot set, and a value absent from Prisma passes Zod only to
// fail at the database. `PROCES` and `APPEL` used to sit in this list; both belong to
// `AffairEventType`, not to `AffairStatus`. Guarded by a test (#511).
export const VALID_STATUSES = [
  "ENQUETE_PRELIMINAIRE",
  "INSTRUCTION",
  "MISE_EN_EXAMEN",
  "RENVOI_TRIBUNAL",
  "PROCES_EN_COURS",
  "CONDAMNATION_PREMIERE_INSTANCE",
  "APPEL_EN_COURS",
  "POURVOI_EN_CASSATION",
  "CONDAMNATION_DEFINITIVE",
  "RELAXE",
  "ACQUITTEMENT",
  "NON_LIEU",
  "PRESCRIPTION",
  "CLASSEMENT_SANS_SUITE",
] as const;

const VALID_INVOLVEMENTS = ["DIRECT", "INDIRECT", "MENTIONED_ONLY", "VICTIM", "PLAINTIFF"] as const;

const VALID_SEVERITIES = ["CRITIQUE", "GRAVE", "MODEREE", "MINEURE"] as const;

const VALID_CATEGORIES = [
  "PROBITE",
  "FISCALITE",
  "FINANCEMENT_POLITIQUE",
  "ABUS_POUVOIR",
  "VIOLENCE",
  "MOEURS",
  "CONFLIT_INTERETS",
  "EMPLOI_FICTIF",
  "AUTRE",
] as const;

export const quickUpdateAffairSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  involvement: z.enum(VALID_INVOLVEMENTS).optional(),
  severity: z.enum(VALID_SEVERITIES).optional(),
  publicationStatus: z.enum(["PUBLISHED", "DRAFT", "ARCHIVED", "EXCLUDED", "REJECTED"]).optional(),
});

export const mergeAffairsSchema = z.object({
  primaryId: z.string().min(1),
  secondaryId: z.string().min(1),
});

export const moderateAffairSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["publish", "exclude", "reject", "archive"]),
});

export const bulkAffairSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.string().min(1),
  value: z.unknown().optional(),
});

export const createAffairSchema = z.object({
  title: z.string().min(1).max(500),
  politicianId: z.string().min(1),
  status: z.enum(VALID_STATUSES),
  involvement: z.enum(VALID_INVOLVEMENTS),
  severity: z.enum(VALID_SEVERITIES),
  category: z.enum(VALID_CATEGORIES),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  factsDate: z.string().nullable().optional(),
  verdictDate: z.string().nullable().optional(),
  publicationStatus: z.enum(["PUBLISHED", "DRAFT", "ARCHIVED", "EXCLUDED", "REJECTED"]).optional(),
});
