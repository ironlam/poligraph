import { buildPoliticianProfileDocument } from "./build";
import {
  deleteProfileSnapshotBuiltBefore,
  markProfileSnapshotPendingInvalidation,
  readDatabaseNow,
  readStoredProfileSlug,
  writeProfileSnapshot,
} from "./store";

export type RefreshOutcome = {
  politicianId: string;
  status: "unchanged" | "updated" | "skipped-stale" | "not-public";
  durationMs: number;
  reason: string;
  /** Whether the stored document of a no longer public politician was deleted. */
  removed: boolean;
  /**
   * Set when an updated document was stored without invalidating its page (`deferInvalidation`):
   * the row carries PENDING_INVALIDATION_HASH, so the next refresh sees a change and invalidates.
   */
  invalidationDeferred?: true;
};

export type RefreshDeps = {
  revalidate?: (tag: string) => void | Promise<void>;
  keepNonPublic?: boolean;
  /**
   * Write an updated document without invalidating its page, and mark the row pending
   * invalidation instead, for a caller out of invalidation budget. Writing silently would
   * "consume" the change: the next refresh would compare equal hashes and never invalidate.
   * Only applies to a public politician; pair it with `keepNonPublic` for the other case.
   */
  deferInvalidation?: boolean;
};

// Same cacheLife profile as `src/lib/cache.ts`. Imported lazily so tsx scripts and unit tests
// can load this module outside a Next runtime.
async function revalidateProfileTag(tag: string): Promise<void> {
  const { revalidateTag } = await import("next/cache");
  revalidateTag(tag, "minutes");
}

/**
 * Rebuilds a politician's profile document and stores it unless a later build already did.
 * Invalidates `politician:<slug>` only when the stored content changed or was first inserted,
 * with the slug read from the fresh build so a renamed politician invalidates the current URL. A
 * politician who is no longer public loses the stored document, after its page is invalidated, unless
 * `keepNonPublic` asks to leave it for a later run that can afford the invalidation.
 */
export async function refreshPoliticianProfile(
  politicianId: string,
  reason: string,
  deps: RefreshDeps = {}
): Promise<RefreshOutcome> {
  // `startedAt` is what `builtAt` stores and compares: the database clock. `t0` only times the run.
  const t0 = Date.now();
  const startedAt = await readDatabaseNow();
  const revalidate = deps.revalidate ?? revalidateProfileTag;

  let status: RefreshOutcome["status"];
  let removed = false;
  let invalidationDeferred = false;
  const document = await buildPoliticianProfileDocument({ id: politicianId });
  if (!document) {
    status = "not-public";
    // keepNonPublic: nothing to invalidate while the row stays. The read path already hides it,
    // and the orphan walk of a later run removes it with an invalidation.
    if (!deps.keepNonPublic) {
      // Invalidate first, delete second. The read path filters PUBLIC_POLITICIAN_WHERE, so the
      // row left in between is never served; and if the invalidation fails, the retry still
      // finds the row and its slug, and invalidates again. Deleting first would lose the slug on
      // a failure. Only a row built before this build started is touched: a later one is a
      // newer decision.
      const slug = await readStoredProfileSlug({ politicianId, before: startedAt });
      if (slug) {
        try {
          await revalidate(`politician:${slug}`);
        } catch (error) {
          log(outcome(politicianId, status, t0, reason, removed), { revalidateFailed: true });
          throw error;
        }
        removed = await deleteProfileSnapshotBuiltBefore({ politicianId, before: startedAt });
      }
    }
  } else {
    const { written, inserted, changed } = await writeProfileSnapshot({
      politicianId,
      document,
      startedAt,
    });
    // An insert invalidates too: the page may hold a `null` cached while the politician was not
    // public, and nothing else would replace it before the cache expires.
    status = !written ? "skipped-stale" : changed || inserted ? "updated" : "unchanged";
    if (status === "updated" && deps.deferInvalidation) {
      // Same guard as the failure path below: a row rewritten since by a later build is left
      // alone, that build compared against the right hash and owns the invalidation. A failed
      // mark is not swallowed here: the change would otherwise never be invalidated.
      await markProfileSnapshotPendingInvalidation({ politicianId, builtAt: startedAt });
      invalidationDeferred = true;
    } else if (status === "updated") {
      try {
        await revalidate(`politician:${document.identity.slug}`);
      } catch (error) {
        // The write is committed, so a retry would compare equal hashes and never invalidate:
        // swap the stored hash for a sentinel so the retry sees a change. Best effort, the
        // original error is the one rethrown.
        await markPendingInvalidation(politicianId, startedAt);
        log(outcome(politicianId, status, t0, reason, removed), {
          revalidateFailed: true,
        });
        throw error;
      }
    }
  }

  const result = outcome(politicianId, status, t0, reason, removed);
  if (invalidationDeferred) result.invalidationDeferred = true;
  log(result);
  return result;
}

async function markPendingInvalidation(politicianId: string, startedAt: Date): Promise<void> {
  try {
    await markProfileSnapshotPendingInvalidation({ politicianId, builtAt: startedAt });
  } catch (markError) {
    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
    console.error(
      JSON.stringify({
        event: "[profile-snapshot] pending-invalidation mark failed",
        politicianId,
        message: markError instanceof Error ? markError.message : String(markError),
      })
    );
  }
}

function outcome(
  politicianId: string,
  status: RefreshOutcome["status"],
  t0: number,
  reason: string,
  removed: boolean
): RefreshOutcome {
  return { politicianId, status, durationMs: Date.now() - t0, reason, removed };
}

function log(result: RefreshOutcome, extra: { revalidateFailed?: true } = {}): void {
  // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
  console.info(JSON.stringify({ event: "[profile-snapshot] refresh", ...result, ...extra }));
}
