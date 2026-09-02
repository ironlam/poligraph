import type { DbTransactionClient } from "@/lib/db";
import { generateSlug, generateUniqueSlug } from "@/lib/utils";

export const MAX_MEASURE_SLUG_LENGTH = 140;

export function buildMeasureSlug(politicianSlug: string, text: string): string {
  const base = generateSlug(`${politicianSlug} ${text}`);
  if (base.length <= MAX_MEASURE_SLUG_LENGTH) return base;

  const truncated = base.slice(0, MAX_MEASURE_SLUG_LENGTH);
  const wordBoundary = truncated.lastIndexOf("-");
  return wordBoundary > politicianSlug.length ? truncated.slice(0, wordBoundary) : truncated;
}

export async function allocateMeasureSlug(
  tx: DbTransactionClient,
  politicianId: string,
  text: string
): Promise<string> {
  const politician = await tx.politician.findUniqueOrThrow({
    where: { id: politicianId },
    select: { slug: true },
  });
  const base = buildMeasureSlug(politician.slug, text) || `mesure-${politician.slug}`;
  return generateUniqueSlug(
    base,
    async (slug) =>
      (await tx.measure.findUnique({ where: { slug }, select: { id: true } })) !== null,
    MAX_MEASURE_SLUG_LENGTH
  );
}
