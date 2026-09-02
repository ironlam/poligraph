import "server-only";
import { db } from "@/lib/db";
import { resolveCandidateAccentColor } from "@/lib/presidentielle/candidate-accent";
import { sortPresidentialCandidatesBySurname } from "@/lib/presidentielle/candidate-order";
import type { CandidacyStatus, Prisma } from "@/generated/prisma";
import { PUBLIC_PRESIDENTIAL_EXTENSION_WHERE } from "./presidential-candidacy-policy";

/**
 * Public read authority for presidential candidacies.
 *
 * Mirrors `src/lib/data/measures.ts`: the visibility rule lives here and nowhere else, and a page must
 * read through this function, never `db.candidacy.*` directly. The one rule that matters is that a
 * candidacy whose editorial extension (`CandidacyPresidential`) is missing or `DRAFT` never surfaces.
 * `getPresidentielle2027Candidates()` does NOT apply this filter and is admin-only.
 *
 * Plain async on purpose (no "use cache"), so it stays integration-testable; the page wraps its reads
 * in a cached function, as the measures authority is wrapped.
 */

// A candidacy is publicly visible only when its presidential extension exists and is PUBLISHED. The
// `is` filter excludes candidacies with no extension row, which is the common case today (11 rows exist
// with zero published extensions).
export const PUBLIC_CANDIDACY_WHERE =
  PUBLIC_PRESIDENTIAL_EXTENSION_WHERE satisfies Prisma.CandidacyWhereInput;

export type PublicPresidentialCandidate = {
  id: string;
  candidateName: string;
  politicianSlug: string | null;
  status: CandidacyStatus | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  slogan: string | null;
  /**
   * The colour code of the candidacy, already resolved: editorial accent, else the party it is filed
   * under, else the linked politician's current party when the candidacy's own label names it.
   * Null when none of the three answers, and a caller renders a neutral slot rather than a colour.
   * See `resolveCandidateAccentColor` for why the last step is guarded.
   */
  accentColor: string | null;
  /** Wording of the source for the party, and the linked entity's sigle when there is one. */
  partyLabel: string | null;
  partyShortName: string | null;
  declaredAt: Date | null;
};

export async function getPublicPresidentialCandidates(
  electionSlug: string
): Promise<PublicPresidentialCandidate[]> {
  const rows = await db.candidacy.findMany({
    where: { election: { slug: electionSlug }, ...PUBLIC_CANDIDACY_WHERE },
    include: {
      presidentialData: true,
      // `currentParty` is read for its colour only, and only ever used when the candidacy's own
      // `partyLabel` names that same party (see `resolveCandidateAccentColor`).
      politician: {
        select: {
          slug: true,
          lastName: true,
          currentParty: { select: { color: true, name: true, shortName: true } },
        },
      },
      party: { select: { shortName: true, color: true } },
    },
    // No `orderBy`: the order is a presidential policy, not a column. Sorting here on
    // `candidateName` would file "Édouard Philippe" under E, and would disagree with the hub field,
    // which lists the same people by surname. No ranking, no proximity score.
  });

  return sortPresidentialCandidatesBySurname(rows).map((row) => ({
    id: row.id,
    candidateName: row.candidateName,
    politicianSlug: row.politician?.slug ?? null,
    status: row.status,
    sourceUrl: row.sourceUrl,
    sourceLabel: row.sourceLabel,
    slogan: row.presidentialData?.slogan ?? null,
    accentColor: resolveCandidateAccentColor({
      accentColor: row.presidentialData?.accentColor ?? null,
      candidacyParty: row.party,
      partyLabel: row.partyLabel,
      currentParty: row.politician?.currentParty ?? null,
    }),
    partyLabel: row.partyLabel,
    partyShortName: row.party?.shortName ?? null,
    declaredAt: row.presidentialData?.declaredAt ?? null,
  }));
}
