import { z } from "zod";

export const GENERATED_CONTEXT_DRAFT_ACTION = "GENERATE_CONTEXT_DRAFT";
export const MEASURE_CONTEXT_PROMPT_VERSION = "measure-context-v9";

export const generatedContextClaimSchema = z
  .object({
    text: z.string().trim().min(10).max(500),
    evidenceUnitIds: z.array(z.string().min(1)).min(1).max(8),
  })
  .strict();

export type GeneratedContextClaim = z.infer<typeof generatedContextClaimSchema>;

const generatedContextAuditSchema = z.object({
  claims: z.array(generatedContextClaimSchema).max(6),
});

export function readGeneratedContextClaims(changes: unknown): GeneratedContextClaim[] {
  const parsed = generatedContextAuditSchema.safeParse(changes);
  return parsed.success ? parsed.data.claims : [];
}
