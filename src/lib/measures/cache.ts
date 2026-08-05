import { revalidateTags } from "@/lib/cache";

/**
 * Cache invalidation is NOT part of the publication transaction: revalidateTag() is a
 * call to the hosting platform, not SQL, and describing it as atomic with PostgreSQL
 * would be wrong.
 *
 * Best effort with a log, and NO retry. A retry held in memory does not survive the end
 * of the lambda, so it would buy the appearance of a guarantee and nothing else. A lost
 * invalidation leaves the page stale until its cacheLife profile expires, which is a
 * known and bounded defect. An outbox table is what fixes it properly, and it belongs to
 * no lot yet.
 *
 * Throwing here would be worse than logging: the transaction is already committed, so the
 * caller would believe the publication failed when it succeeded.
 */
export function invalidateMeasureTags(measureId: string, electionId: string): void {
  try {
    // Two specific tags, never a mass revalidation and never the global tag: purging the
    // global tag once blew through this project's hosting spend cap.
    //
    // Delegates to src/lib/cache.ts rather than calling revalidateTag directly: on this
    // Next version the second `profile` argument is mandatory, and that module already
    // owns the default. A second invalidation mechanism next to it would be one more
    // thing to keep in sync.
    revalidateTags([`measure:${measureId}`, `election-measures:${electionId}`]);
  } catch (error) {
    // The only trace of a lost invalidation, which leaves a page stale until its
    // cacheLife profile expires.
    // eslint-disable-next-line no-console -- deliberate ops signal
    console.error(`[measures] cache invalidation failed for ${measureId}`, error);
  }
}
