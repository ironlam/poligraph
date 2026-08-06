import { db } from "@/lib/db";

/**
 * The candidacies a measure can be created from, in the 2027 hub.
 *
 * Scoped, not a full list (issue #660, decisions of 2026-08-06):
 * - the presidential election 2027 only, by slug, not merely the PRESIDENTIELLE type (which also holds
 *   2022 and earlier);
 * - status `DECLARE` only: attaching a measure to a merely pressentie or envisagée candidacy would lend
 *   a programme to someone who has not declared;
 * - a sourced candidacy only (`sourceUrl` and `sourceLabel`), per the doctrine that a declared candidacy
 *   is sourced.
 *
 * This is the display side of the rule. The server action re-checks the same conditions
 * (`assertHubMeasureCandidacy`), because a selector filter is not an authorization.
 *
 * `politicianId` must be present: it is nullable on the model and `createMeasure()` requires a
 * politician, so a candidacy without one would only fail at submit time. The bound stays because
 * `Candidacy` also holds municipal rows and loading it whole has already produced a 19 MB page.
 */
const HUB_ELECTION_SLUG = "presidentielle-2027";
const MAX_CANDIDACIES = 200;

export type CandidacyOption = {
  id: string;
  politicianId: string;
  electionId: string;
  candidateName: string;
  electionTitle: string;
};

export async function listPresidentialCandidacies(): Promise<CandidacyOption[]> {
  const rows = await db.candidacy.findMany({
    where: {
      election: { slug: HUB_ELECTION_SLUG },
      status: "DECLARE",
      sourceUrl: { not: null },
      sourceLabel: { not: null },
      politicianId: { not: null },
    },
    select: {
      id: true,
      politicianId: true,
      electionId: true,
      candidateName: true,
      election: { select: { title: true } },
    },
    // Alphabetical, and the page says so: any other order on a list of candidates is a ranking.
    orderBy: [{ candidateName: "asc" }],
    take: MAX_CANDIDACIES,
  });

  return rows.flatMap((row) =>
    row.politicianId === null
      ? []
      : [
          {
            id: row.id,
            politicianId: row.politicianId,
            electionId: row.electionId,
            candidateName: row.candidateName,
            electionTitle: row.election.title,
          },
        ]
  );
}
