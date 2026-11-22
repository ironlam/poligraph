import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * What a person does with the draft notice of a regional audit chamber report: choose or correct
 * its territory, publish it, or reject it. Publishing names the reviewer; rejecting gives a reason
 * that stays in the audit trail.
 */
export const rapportCrcActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("RATTACHER"),
    territoryType: z.enum(["COM", "DEP", "REG"]),
    territoryCode: z.string().regex(/^(?:[0-9]{2,3}|2[AB]|[0-9]{5}|2[AB][0-9]{3})$/),
  }),
  z.strictObject({ action: z.literal("PUBLIER"), reviewedBy: text(100) }),
  z.strictObject({ action: z.literal("REJETER"), reason: text(500) }),
]);

export type RapportCrcActionInput = z.infer<typeof rapportCrcActionSchema>;
