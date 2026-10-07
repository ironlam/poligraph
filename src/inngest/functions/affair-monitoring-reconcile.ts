import { inngest } from "../client";

// Never throws on per-affair failures (they are counted in `failed`): a retry would
// replay the whole sweep, and tomorrow's run picks the leftovers up anyway.
export const affairMonitoringReconcile = inngest.createFunction(
  {
    id: "affair-monitoring/reconcile",
    retries: 1,
    concurrency: { limit: 1, key: '"affair-monitoring"' },
  },
  { cron: "TZ=Europe/Paris 30 5 * * *" },
  async ({ step }) => {
    return step.run("reconcile", async () => {
      const { reconcileAllAffairMonitoring } = await import("@/lib/affairs/monitoring/reconcile");
      return reconcileAllAffairMonitoring();
    });
  }
);
