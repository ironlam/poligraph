import { z } from "zod/v4";
import { DEPARTMENTS } from "@/config/departments";
import { getRegionByCode } from "@/config/regions";
import { parsePartialDate } from "@/lib/mandates/dates";

export const createMandateSchema = z.object({
  politicianId: z.string().min(1),
  partyId: z.string().min(1),
  title: z.string().min(1).max(500),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
  sourceUrl: z.string().optional(),
  officialUrl: z.string().optional(),
});

export const updateMandateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  sourceUrl: z.string().optional(),
  officialUrl: z.string().optional(),
});

export const patchMandateSchema = z.object({
  officialUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
});

// --- Local mandates entered by hand (#1460) ---------------------------------

/** Types whose territory is a commune, a department, a region. */
export const MUNICIPAL_MANDATE_TYPES = [
  "MAIRE",
  "MAIRE_ARRONDISSEMENT",
  "ADJOINT_MAIRE",
  "CONSEILLER_MUNICIPAL",
] as const;
export const DEPARTMENT_MANDATE_TYPES = [
  "PRESIDENT_DEPARTEMENT",
  "VICE_PRESIDENT_DEPARTEMENT",
  "CONSEILLER_DEPARTEMENTAL",
] as const;
export const REGION_MANDATE_TYPES = [
  "PRESIDENT_REGION",
  "VICE_PRESIDENT_REGION",
  "CONSEILLER_REGIONAL",
] as const;

export const LOCAL_MANDATE_FORM_TYPES = [
  ...MUNICIPAL_MANDATE_TYPES,
  "PRESIDENT_INTERCOMMUNALITE",
  ...DEPARTMENT_MANDATE_TYPES,
  ...REGION_MANDATE_TYPES,
] as const;

const includes = (list: readonly string[], value: string) => list.includes(value);

const partialDate = z
  .string()
  .trim()
  .refine((value) => parsePartialDate(value) !== null, {
    message: "Date attendue : AAAA, AAAA-MM ou AAAA-MM-JJ",
  });

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => URL.canParse(value) && new URL(value).protocol === "https:", {
    message: "Adresse https attendue",
  });

/**
 * A local mandate typed in the admin. A date carries the precision it is written with ("2001",
 * "2001-03", "2001-03-25"), the source is mandatory, and the territory is a code, never a name.
 */
export const createLocalMandateSchema = z
  .object({
    type: z.enum(LOCAL_MANDATE_FORM_TYPES),
    title: z.string().trim().min(1).max(500),
    institution: z.string().trim().min(1).max(200),
    /** INSEE code of the commune. */
    communeId: z
      .string()
      .trim()
      .regex(/^\d[\dAB]\d{3}$/)
      .optional(),
    departmentCode: z.string().trim().max(3).optional(),
    regionCode: z.string().trim().max(3).optional(),
    epciSiren: z
      .string()
      .trim()
      .regex(/^\d{9}$/)
      .optional(),
    startDate: partialDate,
    endDate: partialDate.nullable().optional(),
    isCurrent: z.boolean(),
    sourceUrl: httpsUrl,
    officialUrl: httpsUrl.optional(),
  })
  .superRefine((body, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (includes(MUNICIPAL_MANDATE_TYPES, body.type) && !body.communeId) {
      issue("communeId", "Code INSEE de la commune requis pour ce mandat");
    }
    if (includes(DEPARTMENT_MANDATE_TYPES, body.type)) {
      if (!body.departmentCode) issue("departmentCode", "Code du département requis");
      else if (!DEPARTMENTS[body.departmentCode]) issue("departmentCode", "Département inconnu");
    }
    if (includes(REGION_MANDATE_TYPES, body.type)) {
      if (!body.regionCode) issue("regionCode", "Code de la région requis");
      else if (!getRegionByCode(body.regionCode)) issue("regionCode", "Région inconnue");
    }
    // The elected-officials register is the authority on sitting mayors: its sync adopts such a
    // mandate and rewrites its title and start date on every run.
    if (body.type === "MAIRE" && body.isCurrent) {
      issue(
        "isCurrent",
        "Un mandat de maire en cours vient du répertoire national des élus, il ne se saisit pas à la main"
      );
    }
    if (body.isCurrent && body.endDate) {
      issue("endDate", "Un mandat en cours n'a pas de date de fin");
    }
    const start = parsePartialDate(body.startDate);
    const end = body.endDate ? parsePartialDate(body.endDate) : null;
    if (start && end && end.date < start.date) {
      issue("endDate", "La fin précède le début");
    }
  });
