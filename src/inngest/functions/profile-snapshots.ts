import * as Sentry from "@sentry/nextjs";
import { inngest } from "../client";
import type { ReconcileBatchResult } from "@/lib/politicians/profile-snapshot/reconcile";
import {
  PROFILE_INVALIDATION_CAP,
  PROFILE_RECONCILE_EVENT,
  PROFILE_REFRESH_EVENT,
} from "@/lib/politicians/profile-snapshot/request";

const BATCH_BUDGET_MS = 240_000;

/**
 * Debounce semantics, from the installed inngest 3.54.2 types
 * (node_modules/inngest/components/InngestFunction.d.ts, `debounce` option):
 * - `key`: expression grouping events, here one debounce window per politician.
 * - `period`: delay after receiving the LAST trigger. Each new event with the same key
 *   reschedules the run for another `period` and replaces the triggering event with the
 *   latest one (last event wins, the period restarts).
 * - `timeout`: maximum time a debounce can be extended. If events keep arriving, the
 *   function still runs once `timeout` has elapsed.
 */
export const refreshPoliticianProfileFn = inngest.createFunction(
  {
    id: "refresh-politician-profile",
    concurrency: { limit: 1 },
    debounce: { key: "event.data.politicianId", period: "30s", timeout: "5m" },
    onFailure: async ({ event }) => {
      // The failure event wraps the original one in `data.event`.
      const politicianId = (event.data.event.data as { politicianId?: string }).politicianId;
      Sentry.captureMessage("Recalcul d'une fiche politicien en échec", {
        level: "error",
        fingerprint: ["profile-snapshot-refresh-failed"],
        tags: { politicianId: politicianId ?? "unknown" },
      });
    },
  },
  { event: PROFILE_REFRESH_EVENT },
  async ({ event, step }) => {
    const { politicianId, reason } = event.data as { politicianId: string; reason: string };
    return step.run("refresh", async () => {
      const { refreshPoliticianProfile } =
        await import("@/lib/politicians/profile-snapshot/refresh");
      return refreshPoliticianProfile(politicianId, reason);
    });
  }
);

/**
 * Same debounce semantics as above: no key, so every reconcile request shares one window and
 * the run starts 10 minutes after the last request.
 */
export const reconcilePoliticianProfilesFn = inngest.createFunction(
  {
    id: "reconcile-politician-profiles",
    concurrency: { limit: 1 },
    debounce: { period: "10m" },
  },
  { event: PROFILE_RECONCILE_EVENT },
  async ({ event, step }) => {
    const reason = `reconcile:${(event.data as { reason?: string }).reason ?? "reconcile"}`;
    const startedAt = Date.now();
    const totals = {
      batches: 0,
      processed: 0,
      updated: 0,
      invalidated: 0,
      deferred: 0,
      failures: 0,
    };

    // Steps are pure functions of their inputs (replay): state travels through return values.
    let cursor: string | null = null;
    let invalidationsLeft = PROFILE_INVALIDATION_CAP;
    for (let n = 1; ; n++) {
      const input: { cursor: string | null; invalidationsLeft: number } = {
        cursor,
        invalidationsLeft,
      };
      const batch: ReconcileBatchResult = await step.run(`batch-${n}`, async () => {
        const { runReconcileBatch, listPublicPoliticianIds } =
          await import("@/lib/politicians/profile-snapshot/reconcile");
        const { refreshPoliticianProfile } =
          await import("@/lib/politicians/profile-snapshot/refresh");
        return runReconcileBatch(
          { ...input, budgetMs: BATCH_BUDGET_MS },
          { listIds: listPublicPoliticianIds, refresh: refreshPoliticianProfile, now: Date.now },
          reason
        );
      });
      totals.batches++;
      totals.processed += batch.processed;
      totals.updated += batch.updated;
      totals.invalidated += batch.invalidated;
      totals.deferred += batch.deferred;
      totals.failures += batch.failures;
      invalidationsLeft -= batch.invalidated;
      cursor = batch.cursor;
      if (cursor === null) break;
    }

    const summary = { ...totals, durationMs: Date.now() - startedAt };
    if (summary.deferred > 0 || summary.failures > 0) {
      Sentry.captureMessage("Rattrapage des fiches politicien incomplet", {
        level: "warning",
        fingerprint: ["profile-snapshot-reconcile"],
        extra: summary,
      });
    }
    return summary;
  }
);
