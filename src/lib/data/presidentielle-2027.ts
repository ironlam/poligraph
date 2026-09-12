import "server-only";
import { db } from "@/lib/db";
import type { Candidacy, Politician, Party, CandidacyStatus } from "@/generated/prisma";

export type PresidentielleCandidate = Candidacy & {
  politician: Politician | null;
  party: Party | null;
};

const STATUS_RANK: Record<NonNullable<CandidacyStatus> | "null", number> = {
  DECLARE: 0,
  PRESSENTI: 1,
  ENVISAGE: 2,
  RETIRE: 4,
  null: 3,
};

function rank(status: CandidacyStatus | null): number {
  return STATUS_RANK[status ?? "null"];
}

export async function getPresidentielle2027Candidates(): Promise<PresidentielleCandidate[]> {
  // Unbounded by design (see ALLOWED_UNBOUNDED in candidacy-read-bounds.test.ts): this is the
  // whole admin field of one presidential election, and a take would silently drop candidates.
  const rows = await db.candidacy.findMany({
    where: { election: { slug: "presidentielle-2027" } },
    include: {
      politician: true,
      party: true,
    },
  });

  return rows.sort((a, b) => {
    const rankDiff = rank(a.status) - rank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return a.candidateName.localeCompare(b.candidateName, "fr");
  });
}
