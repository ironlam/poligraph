import { PARRAINAGES_FICHES_CANDIDATS } from "@/config/parrainages";
import { db } from "@/lib/db";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";

/**
 * Which politician profiles show the presidential presentations of one election, and the request
 * to recompute them. A profile reads a stored document: after an import, a new link or a deploy
 * that adds a field, that document has to be rebuilt for the block to appear.
 *
 * Only published profiles are listed: the others have no public page to recompute.
 */

const PUBLISHED = { publicationStatus: "PUBLISHED" } as const;

/** Candidates of the list who have a profile: through their candidacy or the hand-checked table. */
export async function listParrainagesRecipientIds(electionSlug: string): Promise<string[]> {
  const tableSlugs = Object.values(PARRAINAGES_FICHES_CANDIDATS[electionSlug] ?? {});
  const [viaCandidacy, viaTable] = await Promise.all([
    db.politician.findMany({
      where: {
        ...PUBLISHED,
        candidacies: {
          some: { election: { slug: electionSlug }, parrainages: { some: {} } },
        },
      },
      select: { id: true },
    }),
    tableSlugs.length
      ? db.politician.findMany({
          where: { ...PUBLISHED, slug: { in: tableSlugs } },
          select: { id: true },
        })
      : [],
  ]);
  return [...new Set([...viaCandidacy, ...viaTable].map((politician) => politician.id))];
}

/** Elected officials whose link to a presentation of this election was established. */
export async function listParrainagesPresenterIds(electionSlug: string): Promise<string[]> {
  const rows = await db.politician.findMany({
    where: { ...PUBLISHED, parrainages: { some: { election: { slug: electionSlug } } } },
    select: { id: true },
  });
  return rows.map((politician) => politician.id);
}

export interface ParrainagesFichesReport {
  electionSlug: string;
  presenters: number;
  recipients: number;
  /** Distinct profiles: a candidate may also have presented someone. */
  total: number;
  /** Null in preview. "reconcile" when the count exceeds the targeted cap. */
  mode: "targeted" | "reconcile" | null;
}

/** Preview by default. With `write`, asks for the recompute of every profile listed. */
export async function refreshParrainagesFiches(
  electionSlug: string,
  options: { write: boolean }
): Promise<ParrainagesFichesReport> {
  const [presenters, recipients] = await Promise.all([
    listParrainagesPresenterIds(electionSlug),
    listParrainagesRecipientIds(electionSlug),
  ]);
  const politicianIds = [...new Set([...presenters, ...recipients])];
  const report: ParrainagesFichesReport = {
    electionSlug,
    presenters: presenters.length,
    recipients: recipients.length,
    total: politicianIds.length,
    mode: null,
  };
  if (!options.write || politicianIds.length === 0) return report;
  const { mode } = await requestProfileRefresh({ politicianIds }, "sync:parrainages-fiches");
  return { ...report, mode };
}
