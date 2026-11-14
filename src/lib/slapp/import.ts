import { z } from "zod/v4";
import type { SlappCriteriaPayload } from "@/config/slapp";
import { evaluateQualification } from "./qualification";

const CriterionStateSchema = z.object({
  met: z.boolean(),
  note: z.string().optional(),
});

const ExternalQualificationSchema = z.object({
  met: z.boolean(),
  note: z.string().optional(),
  source: z.string().url().optional(),
  qualifierName: z.string().optional(),
});

export const CaseImportSchema = z.object({
  caseReference: z.string().optional(),
  affairTitle: z.string().min(1),
  politicianSlug: z.string().min(1),
  asymmetry: CriterionStateSchema,
  publicInterest: CriterionStateSchema,
  disproportion: CriterionStateSchema,
  outcomeUnfavorable: CriterionStateSchema,
  externalQualification: ExternalQualificationSchema,
});
export type CaseImportResult =
  | {
      success: true;
      data: {
        affairTitle: string;
        politicianSlug: string;
        caseReference?: string;
        criteria: SlappCriteriaPayload;
      };
    }
  | { success: false; error: string };

export function parseCaseImport(payload: unknown): CaseImportResult {
  const parsed = CaseImportSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }

  const input = parsed.data;

  const criteria: SlappCriteriaPayload = {
    asymmetry: { met: input.asymmetry.met, note: input.asymmetry.note },
    publicInterest: { met: input.publicInterest.met, note: input.publicInterest.note },
    disproportion: { met: input.disproportion.met, note: input.disproportion.note },
    outcomeUnfavorable: {
      met: input.outcomeUnfavorable.met,
      note: input.outcomeUnfavorable.note,
    },
    externalQualification: {
      met: input.externalQualification.met,
      note: input.externalQualification.note,
      source: input.externalQualification.source,
      qualifierName: input.externalQualification.qualifierName,
    },
    qualificationRule: "3of5",
  };

  const evaluation = evaluateQualification(criteria);
  if (!evaluation.qualified) {
    return {
      success: false,
      error: "Aucune règle de qualification SLAPP satisfaite (ni 3/5, ni critère 5 documenté)",
    };
  }

  criteria.qualificationRule = evaluation.rule!;

  return {
    success: true,
    data: {
      affairTitle: input.affairTitle,
      politicianSlug: input.politicianSlug,
      caseReference: input.caseReference,
      criteria,
    },
  };
}
