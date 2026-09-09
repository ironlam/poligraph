/**
 * The order in which politicians get a web search.
 *
 * A full pass over 22 725 published politicians spends 22 725 prepaid Brave
 * credits, so the order decides what the budget buys. Media exposure is the
 * best available proxy for "the press has written something": a minister and a
 * councillor of a 300-inhabitant village cost the same credit and do not carry
 * the same chance of a finding.
 *
 * Two tiers, national mandates first, then mayors by descending population.
 * Everyone else comes last, and on a limited budget may never be reached: that
 * is a deliberate, stated trade-off, not an oversight.
 */
import { db } from "@/lib/db";
import type { MandateType } from "@/generated/prisma";

/** Mandates whose holders the national press covers by default. */
export const NATIONAL_MANDATES: MandateType[] = [
  "PRESIDENT_REPUBLIQUE",
  "PREMIER_MINISTRE",
  "MINISTRE",
  "MINISTRE_DELEGUE",
  "SECRETAIRE_ETAT",
  "DEPUTE",
  "SENATEUR",
  "DEPUTE_EUROPEEN",
  "PRESIDENT_PARTI",
];

export interface SearchTarget {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  /** 1 = national mandate, 2 = mayor, 3 = everyone else. */
  tier: number;
  population: number | null;
}

/**
 * Next politicians to search, never-searched first, then best value.
 *
 * `webSearchCheckedAt` is a rotation cursor, the same contract the schema
 * already uses for `photoCheckedAt` and `careerCheckedAt`: NULLS FIRST means
 * never searched, and once the corpus is covered the oldest come back round.
 * A politician clean this year may be charged the next, so the pass has to
 * return rather than mark everyone done for ever.
 */
export async function selectSearchTargets(
  limit: number,
  /**
   * Restrict the pass to one tier. Measurement only: the yield of the feature
   * differs by an order of magnitude between a minister the press already
   * covers and a mayor nobody has written about, and a mixed sample cannot
   * tell the two apart.
   */
  onlyTier?: number
): Promise<SearchTarget[]> {
  const rows = await db.$queryRaw<
    {
      id: string;
      firstName: string;
      lastName: string;
      fullName: string;
      tier: number;
      population: number | null;
    }[]
  >`
    SELECT * FROM (
    SELECT p.id, p."firstName", p."lastName", p."fullName",
      CASE
        WHEN EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."politicianId" = p.id AND m."isCurrent" = true
            AND m.type = ANY(${NATIONAL_MANDATES}::"MandateType"[])
        ) THEN 1
        WHEN EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."politicianId" = p.id AND m."isCurrent" = true AND m.type = 'MAIRE'
        ) THEN 2
        ELSE 3
      END AS tier,
      (
        SELECT MAX(c.population) FROM "Mandate" m
        JOIN "MandateLocal" ml ON ml."mandateId" = m.id
        JOIN "Commune" c ON c.id = ml."communeId"
        WHERE m."politicianId" = p.id AND m."isCurrent" = true
      ) AS population,
      p."webSearchCheckedAt"
    FROM "Politician" p
    WHERE p."publicationStatus" = 'PUBLISHED'
      AND p."lastName" <> ''
    ) ranked
    WHERE (${onlyTier ?? null}::int IS NULL OR tier = ${onlyTier ?? null}::int)
    -- Jamais cherché d'abord, puis les plus anciens : la rotation prime sur la
    -- priorité, sinon un ministre monopoliserait chaque passe.
    -- La population ne départage QUE les maires : appliquée au tier 1, elle
    -- reléguait un ministre sans mandat local derrière un député-maire.
    ORDER BY "webSearchCheckedAt" ASC NULLS FIRST,
             tier ASC,
             CASE WHEN tier = 2 THEN population END DESC NULLS LAST,
             "lastName" ASC
    LIMIT ${limit}
  `;

  return rows;
}
