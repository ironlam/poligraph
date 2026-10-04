import { revalidateTags } from "@/lib/cache";
import { requestProfileReconcile } from "@/lib/politicians/profile-snapshot/events";

/**
 * Run a scrutin sync and invalidate cached vote-derived views only after the
 * database write completed successfully. New votes change the profiles' vote stats and recent
 * votes without naming a politician, so a reconcile pass follows.
 */
export async function runVoteSyncWithCacheInvalidation<T>(sync: () => Promise<T>): Promise<T> {
  const result = await sync();
  revalidateTags(["votes"], "max");
  await requestProfileReconcile("sync-scrutins");
  return result;
}
