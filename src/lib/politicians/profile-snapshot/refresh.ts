import { buildPoliticianProfileDocument } from "./build";
import {
  deleteProfileSnapshotBuiltBefore,
  markProfileSnapshotPendingInvalidation,
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
};

// Same cacheLife profile as `src/lib/cache.ts`. Imported lazily so tsx scripts and unit tests
// can load this module outside a Next runtime.
async function revalidateProfileTag(tag: string): Promise<void> {
  const { revalidateTag } = await import("next/cache");
  revalidateTag(tag, "minutes");
}

/**
 * Rebuilds a politician's profile document and stores it unless a later build already did.
 * Invalidates `politician:<slug>` only when the stored content actually changed, with the slug
 * read from the fresh build so a renamed politician invalidates the current URL. A politician who
 * is no longer public loses the stored document, after its page is invalidated.
 */
export async function refreshPoliticianProfile(
  politicianId: string,
  reason: string,
  deps: { revalidate?: (tag: string) => void | Promise<void> } = {}
): Promise<RefreshOutcome> {
  const startedAt = new Date();
  const revalidate = deps.revalidate ?? revalidateProfileTag;

  let status: RefreshOutcome["status"];
  let removed = false;
  const document = await buildPoliticianProfileDocument({ id: politicianId });
  if (!document) {
    status = "not-public";
    // Invalidate first, delete second. The read path filters PUBLIC_POLITICIAN_WHERE, so the row
    // left in between is never served; and if the invalidation fails, the retry still finds the
    // row and its slug, and invalidates again. Deleting first would lose the slug on a failure.
    // Only a row built before this build started is touched: a later one is a newer decision.
    const slug = await readStoredProfileSlug({ politicianId, before: startedAt });
    if (slug) {
      try {
        await revalidate(`politician:${slug}`);
      } catch (error) {
        log(outcome(politicianId, status, startedAt, reason, removed), { revalidateFailed: true });
        throw error;
      }
      removed = await deleteProfileSnapshotBuiltBefore({ politicianId, before: startedAt });
    }
  } else {
    const { written, changed } = await writeProfileSnapshot({ politicianId, document, startedAt });
    status = !written ? "skipped-stale" : changed ? "updated" : "unchanged";
    if (status === "updated") {
      try {
        await revalidate(`politician:${document.identity.slug}`);
      } catch (error) {
        // The write is committed, so a retry would compare equal hashes and never invalidate:
        // swap the stored hash for a sentinel so the retry sees a change. Best effort, the
        // original error is the one rethrown.
        await markPendingInvalidation(politicianId, startedAt);
        log(outcome(politicianId, status, startedAt, reason, removed), {
          revalidateFailed: true,
        });
        throw error;
      }
    }
  }

  const result = outcome(politicianId, status, startedAt, reason, removed);
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
  startedAt: Date,
  reason: string,
  removed: boolean
): RefreshOutcome {
  return { politicianId, status, durationMs: Date.now() - startedAt.getTime(), reason, removed };
}

function log(result: RefreshOutcome, extra: { revalidateFailed?: true } = {}): void {
  // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
  console.info(JSON.stringify({ event: "[profile-snapshot] refresh", ...result, ...extra }));
}
