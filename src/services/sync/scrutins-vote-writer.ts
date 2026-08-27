import { db } from "@/lib/db";
import type { Chamber, ScrutinType, VotePosition } from "@/generated/prisma";

export interface WriteVotesParams {
  scrutinId: string;
  votingDate: Date;
  chamber: Chamber;
  scrutinType: ScrutinType | null;
  votes: Array<{ politicianId: string; position: VotePosition }>;
}

/**
 * Atomic vote rewrite for a single scrutin.
 *
 * Used by sync-scrutins-an and sync-scrutins-senat after a votesHash mismatch.
 * Deletes existing votes for the scrutin and re-creates with the new positions.
 *
 * The `votingDate` and `chamber` fields are denormalized from `Scrutin` to
 * avoid forced JOINs in "recent votes for politician" sort queries (slow
 * query #2 in the perf report) and "votes for politician filtered by chamber
 * + date range" queries (slow query #3, getPoliticianVotingStats).
 *
 * This is one of TWO write surfaces that must populate the denormalized
 * fields. The other is `scripts/seed-fixtures.ts` for test fixtures — both
 * must keep these fields in sync. Phase 5b adds a Postgres trigger to handle
 * the rare case where `Scrutin.votingDate` or `Scrutin.chamber` is updated
 * post-creation (e.g. an editor correcting a date).
 */
export async function writeVotesForScrutin(params: WriteVotesParams): Promise<void> {
  if (!params.votingDate) {
    throw new Error("writeVotesForScrutin: votingDate is required (Phase 5a denormalization)");
  }
  if (!params.chamber) {
    throw new Error("writeVotesForScrutin: chamber is required (Phase 5a denormalization)");
  }

  await db.vote.deleteMany({
    where: { scrutinId: params.scrutinId },
  });

  if (params.votes.length > 0) {
    await db.vote.createMany({
      data: params.votes.map((v) => ({
        scrutinId: params.scrutinId,
        politicianId: v.politicianId,
        position: v.position,
        votingDate: params.votingDate,
        chamber: params.chamber,
        scrutinType: params.scrutinType,
      })),
      skipDuplicates: true,
    });
  }
}
