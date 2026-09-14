import { db } from "@/lib/db";
import { normalizeDossierAlias } from "@/lib/legislation/alias";

// Free-text lookup must not create an unbounded persistent cache.
export async function getDossierAliasMatches(value: string) {
  const normalizedLabel = normalizeDossierAlias(value);
  if (!normalizedLabel) return [];
  return db.legislativeDossier.findMany({
    where: { aliases: { some: { normalizedLabel, status: "PUBLISHED" } } },
    select: { id: true, slug: true, title: true, number: true, filingDate: true },
    orderBy: [{ filingDate: "desc" }, { id: "asc" }],
  });
}
