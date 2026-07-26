import { inngest } from "../client";
import { markJobRunning, markJobCompleted, markJobFailed, updateJobProgress } from "../job-helper";

export const syncFactchecksGrouped = inngest.createFunction(
  {
    id: "sync-factchecks",
    retries: 2,
    concurrency: { limit: 1, key: '"sync-factchecks"' },
  },
  { event: "sync/factchecks" },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string | undefined;
    if (jobId) await markJobRunning(jobId);

    try {
      const fcStats = await step.run("factchecks", async () => {
        const { syncFactchecks } = await import("@/services/sync/factchecks");
        const stats = await syncFactchecks({ limit: 50 });
        if (jobId) await updateJobProgress(jobId, 100);
        return stats;
      });

      if (jobId)
        await markJobCompleted(jobId, {
          steps: ["factchecks"],
          factchecksStats: fcStats,
        });
    } catch (err) {
      if (jobId) {
        await markJobFailed(jobId, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  }
);
