import { db } from "@/lib/db";

/**
 * The id of an election, to filter `Candidacy` on `electionId`.
 *
 * `Candidacy` holds every municipal list member next to a few dozen presidential or senatorial
 * rows. Filtered through the relation (`election: { slug }`), PostgreSQL does not know which
 * election is meant when it plans the query, and may walk the whole table: a 178-row read took 20
 * to 40 s that way. With the id it reads the `electionId` index. The guard is
 * src/__tests__/architecture/candidacy-election-filter.test.ts.
 */
export async function getElectionIdBySlug(slug: string): Promise<string | null> {
  const election = await db.election.findUnique({ where: { slug }, select: { id: true } });
  return election?.id ?? null;
}
