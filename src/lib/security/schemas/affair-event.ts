import { z } from "zod/v4";
import type { EventDraftInput } from "@/lib/affairs/events/service";
import { parseEventDateInput } from "@/lib/affairs/events/dates";
import { RETRACTION_REASON_MAX } from "@/lib/affairs/events/service";

/** Types acceptés à l'écriture : les `LEGACY_EVENT_TYPES` (issues finales) passent par `outcome`. */
export const EVENT_TYPE_VALUES = [
  "FAITS",
  "REVELATION",
  "PLAINTE",
  "ENQUETE_PRELIMINAIRE",
  "INFORMATION_JUDICIAIRE",
  "PERQUISITION",
  "GARDE_A_VUE",
  "MISE_EN_EXAMEN",
  "CONTROLE_JUDICIAIRE",
  "DETENTION_PROVISOIRE",
  "RENVOI_TRIBUNAL",
  "PROCES",
  "REQUISITOIRE",
  "JUGEMENT",
  "APPEL",
  "PROCES_APPEL",
  "ARRET_APPEL",
  "POURVOI_CASSATION",
  "ARRET_CASSATION",
  "PRESCRIPTION",
  "NON_LIEU",
  "AUTRE",
  "TEMOIN_ASSISTE",
  "CLASSEMENT_SANS_SUITE",
  "CONVOCATION_TRIBUNAL",
  "COMPARUTION_IMMEDIATE",
  "CRPC",
  "RENVOI_AUDIENCE",
  "DECISION_DEFINITIVE",
] as const;

export const EVENT_OUTCOME_VALUES = [
  "CONDAMNATION",
  "RELAXE",
  "RELAXE_PARTIELLE",
  "ACQUITTEMENT",
  "CASSATION_RENVOI",
  "CASSATION_SANS_RENVOI",
  "REJET_POURVOI",
  "AUTRE",
] as const;

export const EVENT_OCCURRENCE_VALUES = ["HELD", "SCHEDULED"] as const;
export const EVENT_SOURCE_KIND_VALUES = ["OFFICIAL", "PRESS"] as const;

const typeEnum = z.enum(EVENT_TYPE_VALUES);
const outcomeEnum = z.enum(EVENT_OUTCOME_VALUES);
const occurrenceEnum = z.enum(EVENT_OCCURRENCE_VALUES);
const sourceKindEnum = z.enum(EVENT_SOURCE_KIND_VALUES);

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((s) => {
    try {
      return ["http:", "https:"].includes(new URL(s).protocol);
    } catch {
      return false;
    }
  }, "URL invalide");

/** Chaîne optionnelle : rognée, vide ou absente devient `null`. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const optUrl = z
  .union([httpUrl, z.literal("").transform(() => null), z.null(), z.undefined()])
  .transform((v) => v ?? null);

const dateString = z.string().trim().min(1);
const optDateString = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const DATE_FORMAT_HINT = "attendu AAAA, AAAA-MM ou AAAA-MM-JJ.";

/**
 * Corps d'un brouillon. Les dates sont converties ici (précision comprise), si bien que la route
 * passe par `withValidation` et reçoit directement l'entrée du service.
 */
export const eventDraftSchema = z
  .object({
    type: typeEnum,
    date: dateString,
    dateEnd: optDateString,
    occurrence: occurrenceEnum,
    outcome: outcomeEnum.nullish().transform((v) => v ?? null),
    title: z.string().trim().min(1).max(120),
    court: optText(120),
    description: optText(1000),
    sourceUrl: optUrl,
    sourceTitle: optText(200),
    sourceKind: sourceKindEnum.nullish().transform((v) => v ?? null),
    incidental: z.boolean().optional(),
    corroborationUrl: optUrl,
  })
  .transform((body, ctx): EventDraftInput => {
    const start = parseEventDateInput(body.date);
    if (!start) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: `Date invalide : ${DATE_FORMAT_HINT}`,
      });
      return z.NEVER;
    }
    let dateEnd: Date | null = null;
    if (body.dateEnd) {
      const end = parseEventDateInput(body.dateEnd);
      if (!end) {
        ctx.addIssue({
          code: "custom",
          path: ["dateEnd"],
          message: `Date de fin invalide : ${DATE_FORMAT_HINT}`,
        });
        return z.NEVER;
      }
      if (end.precision !== start.precision) {
        ctx.addIssue({
          code: "custom",
          path: ["dateEnd"],
          message: "La date de fin doit avoir la même précision que la date.",
        });
        return z.NEVER;
      }
      dateEnd = end.date;
    }
    return {
      type: body.type,
      date: start.date,
      datePrecision: start.precision,
      dateEnd,
      occurrence: body.occurrence,
      outcome: body.outcome,
      title: body.title,
      court: body.court,
      description: body.description,
      sourceUrl: body.sourceUrl,
      sourceTitle: body.sourceTitle,
      sourceKind: body.sourceKind,
      incidental: body.incidental,
      corroborationUrl: body.corroborationUrl,
    };
  });

export const eventActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PUBLISH") }),
  z.object({
    action: z.literal("RETRACT"),
    reason: z.string().trim().min(1).max(RETRACTION_REASON_MAX),
  }),
  z.object({
    action: z.literal("CONFIRM"),
    sourceUrl: httpUrl,
    sourceTitle: optText(200),
    sourceKind: sourceKindEnum,
    outcome: outcomeEnum.nullish().transform((v) => v ?? null),
    corroborationUrl: optUrl,
  }),
]);
