import { cacheTag, cacheLife } from "next/cache";
import { readProfileVoteStats } from "@/lib/data/politician-profile-reads";

/**
 * One boundary, four reads in flight at most: the pool holds four connections (@/config/database)
 * and a render wider than that queues behind itself (POLIGRAPH-2X). The card reuses these stats
 * rather than computing them again, and its dissidence query is cached here with them.
 *
 * Moved out of `page.tsx` when the tab bodies went behind their own Suspense boundary: the profile
 * body is what needs it now, and the page no longer reads it at all.
 */
export async function getProfileVoteStats(
  politicianId: string,
  mandateType: "DEPUTE" | "SENATEUR"
) {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  return readProfileVoteStats(politicianId, mandateType);
}
