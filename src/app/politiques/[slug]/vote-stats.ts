import { cacheTag, cacheLife } from "next/cache";
import { readProfileVoteStats } from "@/lib/data/politician-profile-reads";

/**
 * One boundary, four reads in flight at most: the pool holds four connections (@/config/database)
 * and a render wider than that queues behind itself (POLIGRAPH-2X). The card reuses these stats
 * rather than computing them again, and its dissidence query is cached here with them.
 *
 * No longer read by `/politiques/[slug]`, whose vote stats come from the precomputed profile
 * document. Kept until a separate cleanup removes it.
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
