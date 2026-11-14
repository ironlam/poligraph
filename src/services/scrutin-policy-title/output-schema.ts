import { z } from "zod";

/** Zod schema mirroring PolicyTitleOutput in types.ts (the source of truth). */
export const PolicyTitleOutputSchema = z.object({
  policyTitle: z.string().min(1).max(140),
  policySubtitle: z.string().max(400).nullable(),
  evidenceQuotes: z.array(
    z.object({
      sourceType: z.string(),
      sourceId: z.string(),
      field: z.string(),
      quote: z.string(),
    })
  ),
  selfConfidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  rationale: z.string(),
});
