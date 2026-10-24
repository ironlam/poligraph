import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import type { Chamber, VotingResult } from "@/generated/prisma";

export interface ChamberScrutin {
  id: string;
  slug: string | null;
  title: string;
  votingDate: Date;
  result: VotingResult;
}

export interface ChamberOverview {
  totalScrutins: number;
  latestScrutins: ChamberScrutin[];
  lastScrutinDate: Date | null;
}

const LATEST_COUNT = 5;

/** Live figures shown on a chamber page. `chamber` is an enum value, so the cache key is bounded. */
export async function getChamberOverview(chamber: Chamber): Promise<ChamberOverview> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const [totalScrutins, latestScrutins] = await Promise.all([
    db.scrutin.count({ where: { chamber } }),
    db.scrutin.findMany({
      where: { chamber },
      orderBy: { votingDate: "desc" },
      take: LATEST_COUNT,
      select: { id: true, slug: true, title: true, votingDate: true, result: true },
    }),
  ]);

  return {
    totalScrutins,
    latestScrutins,
    lastScrutinDate: latestScrutins[0]?.votingDate ?? null,
  };
}
