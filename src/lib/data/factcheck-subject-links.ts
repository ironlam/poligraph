import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { getPublicFactCheckWhere } from "@/lib/api/public-contract";
import { CONFIRMED_MENTION_WHERE } from "@/lib/factchecks/mention-review";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { queryCandidacy } from "./factcheck-context";

/**
 * Where a rumour page sends its reader. A fact-check without a single identified author stays
 * noindex (src/lib/seo/factcheck-robots.ts), but it names a person on a confirmed mention: the
 * reader came for that person, so the page points to everything Poligraph holds on them. Counts
 * and links only, read from the base, the same for every person.
 */
export interface FactCheckSubjectLinks {
  /**
   * Public fact-checks gathered on the person's landing: their claims, plus the fact-checks about
   * them on a confirmed mention. The same count as the landing's `claimed + about`.
   */
  factCheckCount: number;
  /**
   * At least one asset declaration (not INTERETS) with its document online. A row the HATVP
   * lists as "publication à venir" has no PDF yet: it gives the reader nothing to open.
   */
  hasPublishedAssetDeclaration: boolean;
  /** Sourced presidential 2027 candidacy, same rule as the candidacy block. */
  hasCandidacy: boolean;
}

export async function queryFactCheckSubjectLinks(
  politicianId: string
): Promise<FactCheckSubjectLinks> {
  const factCheckCount = await db.factCheckMention.count({
    where: {
      politicianId,
      factCheck: { ...getPublicFactCheckWhere(), slug: { not: null } },
      OR: [{ isClaimant: true }, { AND: [{ isClaimant: false }, CONFIRMED_MENTION_WHERE] }],
    },
  });
  const declaration = await db.declaration.findFirst({
    where: { politicianId, type: { not: "INTERETS" }, pdfUrl: { not: null } },
    select: { id: true },
  });
  const candidacy = await queryCandidacy(politicianId);

  return {
    factCheckCount,
    hasPublishedAssetDeclaration: declaration !== null,
    hasCandidacy: candidacy !== null,
  };
}

/** Cached entry point, tagged like the person's fact-check landing. */
export async function getFactCheckSubjectLinks(
  politicianId: string,
  slug: string
): Promise<FactCheckSubjectLinks> {
  "use cache";
  cacheTag("factchecks", `politician:${slug}`, "elections");
  cacheLife("synced");
  const election = await db.election.findUnique({
    where: { slug: PRESIDENTIELLE_2027_SLUG },
    select: { id: true },
  });
  if (election) cacheTag(`election-candidacies:${election.id}`);
  return queryFactCheckSubjectLinks(politicianId);
}
