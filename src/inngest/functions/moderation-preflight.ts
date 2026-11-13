import { inngest } from "../client";

/**
 * Daily preflight: duplicate and attribution checks over the drafts, with no model opinion.
 *
 * The AI opinion used to come from Anthropic's Batch API. The account has been out of credit for
 * months and the submission failed every night, so this cron no longer asks a model anything:
 * every draft comes out NEEDS_REVIEW, the safe default. Nothing is lost, since this report cannot
 * be written to a serverless filesystem and the moderation session rebuilds it locally. The batch
 * transport still lives in `@/services/affair-moderation-batch`, with no caller left here.
 */
export const moderationPreflight = inngest.createFunction(
  {
    id: "moderation-preflight",
    name: "Moderation Preflight (daily)",
    retries: 1,
    concurrency: { limit: 1, key: '"moderation-preflight"' },
  },
  { cron: "TZ=Europe/Paris 30 4 * * *" },
  async ({ step }) => {
    const report = await step.run("assemble-report", async () => {
      const { runPreflight } = await import("@/lib/moderation/preflight");
      return runPreflight({ source: "cron", skipModeration: true });
    });

    await step.run("persist-report-best-effort", async () => {
      try {
        const { writeFile, mkdir } = await import("fs/promises");
        const path = await import("path");
        const outDir = path.join(process.cwd(), "data");
        await mkdir(outDir, { recursive: true });
        await writeFile(
          path.join(outDir, "moderation-preflight.json"),
          JSON.stringify(report, null, 2)
        );
      } catch (err) {
        console.warn("[preflight cron] could not write JSON (expected on serverless):", err);
      }
    });

    return {
      totalDrafts: report.stats.totalDrafts,
      autoPublishCandidates: report.stats.autoPublishCandidates,
      needsReview: report.stats.needsReview,
      attributionIssues: report.stats.attributionIssues,
      duplicateGroups: report.stats.duplicateGroups,
    };
  }
);
