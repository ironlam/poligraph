/**
 * Read-only production validation for Senate public-scrutin participation.
 *
 * This script never writes candidates or enables a public reader. It reports source
 * completeness, per-senator coverage, aggregate parity, and the fail-closed state.
 */

import "dotenv/config";
import { db } from "@/lib/db";
import { aggregateSenateParticipation } from "@/lib/votes/senate-participation";
import { PARTICIPATION_METHOD_VERSION } from "@/lib/votes/participation-publication";
import { computeSenateParticipationAuditRows } from "@/services/senate-participation-audit";

async function main() {
  const [statusCounts, rows, persistedSenateRows, senateSnapshots] = await Promise.all([
    db.scrutinVoteImport.groupBy({
      by: ["status"],
      where: { scrutin: { chamber: "SENAT" } },
      _count: true,
    }),
    computeSenateParticipationAuditRows(),
    db.politicianParticipation.count({ where: { chamber: "SENAT" } }),
    db.statsSnapshot.findMany({
      where: { key: { in: ["party-participation-SENAT", "group-participation-SENAT"] } },
      select: { key: true, data: true },
    }),
  ]);

  const candidates = rows.flatMap((row) => (row.candidate ? [row.candidate] : []));
  const neutralized = rows.filter((row) => row.candidate === null);
  const partyAggregates = aggregateSenateParticipation(candidates, "party");
  const groupAggregates = aggregateSenateParticipation(candidates, "group");
  const nonEmptySenateSnapshots = senateSnapshots.filter(
    (snapshot) => Array.isArray(snapshot.data) && snapshot.data.length > 0
  );

  console.log(
    JSON.stringify(
      {
        methodVersion: PARTICIPATION_METHOD_VERSION,
        sourceCompleteness: statusCounts.map((row) => ({
          status: row.status,
          count: row._count,
        })),
        individualCoverage: {
          evaluated: rows.length,
          candidates: candidates.length,
          neutralized: neutralized.length,
          neutralizedPoliticianIds: neutralized.map((row) => row.politicianId),
        },
        aggregateParity: {
          partyMembers: partyAggregates.reduce((sum, row) => sum + row.memberCount, 0),
          groupMembers: groupAggregates.reduce((sum, row) => sum + row.memberCount, 0),
          partyAggregates: partyAggregates.length,
          groupAggregates: groupAggregates.length,
        },
        failClosed: {
          persistedSenateRows,
          nonEmptySenateSnapshots: nonEmptySenateSnapshots.map((snapshot) => snapshot.key),
          valid: persistedSenateRows === 0 && nonEmptySenateSnapshots.length === 0,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
