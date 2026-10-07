import { inngest } from "../client";

// Partial failures are counted in `failed` and do not throw (tomorrow's run picks them up);
// only a total failure throws, so a systematic bug shows as a failed run.
export const affairMonitoringReconcile = inngest.createFunction(
  {
    id: "affair-monitoring/reconcile",
    retries: 1,
    concurrency: { limit: 1, key: '"affair-monitoring"' },
  },
  { cron: "TZ=Europe/Paris 30 5 * * *" },
  async ({ step }) => {
    const counts = await step.run("reconcile", async () => {
      const { reconcileAllAffairMonitoring } = await import("@/lib/affairs/monitoring/reconcile");
      return reconcileAllAffairMonitoring();
    });
    // Every processed affair failed: a systematic bug, make the run visible as failed.
    if (counts.failed > 0 && counts.created + counts.updated + counts.deactivated === 0) {
      throw new Error(
        `Balayage du suivi : toutes les affaires traitées ont échoué (${counts.failed}).`
      );
    }
    return counts;
  }
);
