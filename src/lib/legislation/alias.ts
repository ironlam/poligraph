import { z } from "zod";

/**
 * Canonical form used for public lookup of a dossier alias.
 *
 * "Loi Duplomb", "loi-duplomb" and "duplomb" must resolve identically. The
 * leading word is a search affordance, not part of the distinctive alias.
 */
export function normalizeDossierAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bloi\b/g, " ")
    .replace(/[’'_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const dossierAliasSourcesSchema = z
  .array(
    z
      .object({
        url: z
          .string()
          .url()
          .refine((url) => ["https:", "http:"].includes(new URL(url).protocol)),
        label: z.string().trim().min(2).max(200),
      })
      .strict()
  )
  .min(1)
  .max(20);

export type DossierAliasSource = z.infer<typeof dossierAliasSourcesSchema>[number];

export function getDossierAliasSources(value: unknown): DossierAliasSource[] {
  const parsed = dossierAliasSourcesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function getPreferredDossierAlias<T extends { isPreferred: boolean }>(
  aliases: T[]
): T | undefined {
  return aliases.find((alias) => alias.isPreferred);
}
