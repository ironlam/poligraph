import { db } from "@/lib/db";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import type { refreshPoliticianProfile } from "./refresh";

const PAGE_SIZE = 50;
export const MAX_FAILED_IDS = 20;

export type ReconcileBatchInput = {
  cursor: string | null;
  budgetMs: number;
  invalidationsLeft: number;
};

export type ReconcileBatchResult = {
  /** Last processed id, or null once the end of the table is reached. */
  cursor: string | null;
  processed: number;
  updated: number;
  invalidated: number;
  deferred: number;
  failures: number;
  /** First ids that failed, bounded to MAX_FAILED_IDS. */
  failedIds: string[];
};

export type ReconcileBatchDeps = {
  listIds: (cursor: string | null, take: number) => Promise<string[]>;
  refresh: typeof refreshPoliticianProfile;
  now: () => number;
};

export async function listPublicPoliticianIds(
  cursor: string | null,
  take: number
): Promise<string[]> {
  const rows = await db.politician.findMany({
    where: { ...PUBLIC_POLITICIAN_WHERE, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: "asc" },
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

const noRevalidate = () => {};

/**
 * Refreshes public politicians by ascending id until the time budget is spent. Once the
 * invalidation budget is exhausted, documents are still written but their cache tag is left
 * alone ("deferred"): they go live when the page cache expires on its own.
 */
export async function runReconcileBatch(
  input: ReconcileBatchInput,
  deps: ReconcileBatchDeps,
  reason = "reconcile"
): Promise<ReconcileBatchResult> {
  const startedAt = deps.now();
  let cursor = input.cursor;
  let invalidationsLeft = input.invalidationsLeft;
  const result: ReconcileBatchResult = {
    cursor,
    processed: 0,
    updated: 0,
    invalidated: 0,
    deferred: 0,
    failures: 0,
    failedIds: [],
  };

  for (;;) {
    const page = await deps.listIds(cursor, PAGE_SIZE);
    for (const id of page) {
      try {
        const outcome =
          invalidationsLeft > 0
            ? await deps.refresh(id, reason)
            : await deps.refresh(id, reason, { revalidate: noRevalidate });
        if (outcome.status === "updated") {
          result.updated++;
          if (invalidationsLeft > 0) {
            invalidationsLeft--;
            result.invalidated++;
          } else {
            result.deferred++;
          }
        }
      } catch (error) {
        // refresh only logs its revalidate failure, so a build or write error would vanish:
        // log it here with the id, then carry on with the walk.
        // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
        console.error(
          JSON.stringify({
            event: "[profile-snapshot] reconcile failure",
            politicianId: id,
            message: error instanceof Error ? error.message : String(error),
          })
        );
        result.failures++;
        if (result.failedIds.length < MAX_FAILED_IDS) result.failedIds.push(id);
      }
      result.processed++;
      cursor = id;
      result.cursor = id;
      if (deps.now() - startedAt >= input.budgetMs) return result;
    }
    if (page.length < PAGE_SIZE) {
      result.cursor = null;
      return result;
    }
  }
}
