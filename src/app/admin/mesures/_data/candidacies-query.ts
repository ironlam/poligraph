import { db } from "@/lib/db";

/**
 * The candidacies a measure can be created from.
 *
 * Bounded and filtered, not a full list: `Candidacy` also holds municipal candidacies (it carries a
 * `communeId`), and that table runs into the hundreds of thousands of rows. Loading it whole has
 * already produced a 19 MB page in this project.
 *
 * `politicianId` must be present. It is nullable on the model, and `createMeasure()` requires a
 * politician: a candidacy with no linked politician cannot carry a measure, so offering it would
 * only produce a failure at submit time.
 */
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
    where: { election: { type: "PRESIDENTIELLE" }, politicianId: { not: null } },
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
