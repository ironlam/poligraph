import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import type { DossierStatus, ThemeCategory } from "@/generated/prisma";

export interface ParliamentThemeSnapshot {
  dossierCount: number;
  scrutinCount: number;
  latestDossiers: {
    slug: string;
    title: string;
    shortTitle: string | null;
    status: DossierStatus;
    filingDate: Date | null;
  }[];
}

const LATEST_DOSSIERS = 3;

/**
 * What the parliament holds under one theme: two counts and the latest few dossiers.
 * Amendment scrutins are left out of the count, they arrive by the thousand and say nothing to a
 * reader coming from a programme. The theme is an enum, so the cache key space stays bounded.
 */
export async function getParliamentThemeSnapshot(
  theme: ThemeCategory
): Promise<ParliamentThemeSnapshot> {
  "use cache";
  cacheTag("legislation", "votes");
  cacheLife("synced");

  const [dossierCount, scrutinCount, latestDossiers] = await Promise.all([
    db.legislativeDossier.count({ where: { theme } }),
    db.scrutin.count({ where: { theme, type: { not: "AMENDEMENT" } } }),
    db.legislativeDossier.findMany({
      where: { theme, slug: { not: null } },
      orderBy: [{ filingDate: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      take: LATEST_DOSSIERS,
      select: { slug: true, title: true, shortTitle: true, status: true, filingDate: true },
    }),
  ]);

  return {
    dossierCount,
    scrutinCount,
    latestDossiers: latestDossiers.flatMap((d) => (d.slug ? [{ ...d, slug: d.slug }] : [])),
  };
}
