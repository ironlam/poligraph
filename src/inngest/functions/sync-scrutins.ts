import { inngest } from "../client";
import { markJobRunning, markJobCompleted, markJobFailed, updateJobProgress } from "../job-helper";
import { runVoteSyncWithCacheInvalidation } from "../vote-cache";

export const syncScrutins = inngest.createFunction(
  {
    id: "sync-scrutins",
    retries: 2,
    concurrency: { limit: 1, key: '"sync-scrutins"' },
  },
  { event: "sync/scrutins" },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string | undefined;
    if (jobId) await markJobRunning(jobId);

    try {
      const anStats = await step.run("scrutins-an", async () => {
        const { syncScrutinsAN } = await import("@/services/sync/scrutins-an");
        const stats = await runVoteSyncWithCacheInvalidation(() =>
          syncScrutinsAN(undefined, false, false, false, false, 7)
        );
        if (jobId) await updateJobProgress(jobId, 50);
        return stats;
      });

      const senatStats = await step.run("scrutins-senat", async () => {
        const { syncScrutinsSenat, currentSenateSession } =
          await import("@/services/sync/scrutins-senat");
        return runVoteSyncWithCacheInvalidation(() =>
          syncScrutinsSenat(currentSenateSession(), false, false)
        );
      });

      if (jobId)
        await markJobCompleted(jobId, {
          steps: ["scrutins-an", "scrutins-senat"],
          anStats,
          senatStats,
        });
    } catch (err) {
      if (jobId) {
        await markJobFailed(jobId, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  }
);
