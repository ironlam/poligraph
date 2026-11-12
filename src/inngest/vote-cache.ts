import { revalidateTags } from "@/lib/cache";
import { requestProfileReconcile } from "@/lib/politicians/profile-snapshot/events";

/** The counters both scrutin syncs (AN and Sénat) increment when they write a scrutin or its votes. */
interface VoteSyncWrites {
  scrutinsCreated: number;
  scrutinsUpdated: number;
  votesCreated: number;
}

/**
 * Run a scrutin sync and invalidate cached vote-derived views only after the
 * database write completed successfully. New votes change the profiles' vote stats and recent
 * votes without naming a politician, so a reconcile pass follows.
 *
 * The purge is skipped when the sync wrote nothing (unchanged archive, nothing past the Senate
 * cursor): "votes" is carried by most readers of the site, and purging it three times a day for no
 * data change regenerated every profile and listing behind it.
 */
export async function runVoteSyncWithCacheInvalidation<T extends VoteSyncWrites>(
  sync: () => Promise<T>
): Promise<T> {
  const result = await sync();
  if (result.scrutinsCreated + result.scrutinsUpdated + result.votesCreated > 0) {
    revalidateTags(["votes"], "max");
  }
  await requestProfileReconcile("sync-scrutins");
  return result;
}
