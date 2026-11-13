import { inngest } from "../client";

/**
 * Preflight quotidien, via l'API Batch (moitié prix sur chaque token, cumulable
 * avec le préfixe caché).
 *
 * Les résultats d'un batch arrivent « sous 24 h », ce qui est une expiration et
 * non un délai garanti : impossible d'attendre en bloquant dans une fonction
 * serverless. On passe donc par des étapes durables, chaque sommeil libérant le
 * runtime entre deux relevés.
 */
const POLL_ATTEMPTS = 12;
const POLL_INTERVAL = "5m";

/**
 * Off since 2026-11-13: the Anthropic account has no credit and will not be topped up for now,
 * so the batch submission failed every night. Nothing is lost: this function cannot persist its
 * report on a serverless filesystem, and the moderation session rebuilds it locally. With the
 * batch off, the run still exercises the duplicate and attribution checks.
 * Set back to true once the account has credit again.
 */
const BATCH_MODERATION_ENABLED = false;

export const moderationPreflight = inngest.createFunction(
  {
    id: "moderation-preflight",
    name: "Moderation Preflight (daily)",
    retries: 1,
    concurrency: { limit: 1, key: '"moderation-preflight"' },
  },
  { cron: "TZ=Europe/Paris 30 4 * * *" },
  async ({ step }) => {
    const batch = await step.run("submit-moderation-batch", async () => {
      if (!BATCH_MODERATION_ENABLED) {
        return {
          batchId: null as string | null,
          count: 0,
          fingerprints: {} as Record<string, string>,
        };
      }

      const { buildModerationInputs } = await import("@/lib/moderation/preflight");
      const { submitModerationBatch } = await import("@/services/affair-moderation-batch");

      const { moderationInputFingerprint } = await import("@/services/affair-moderation");

      const inputs = await buildModerationInputs();
      if (inputs.length === 0) {
        return {
          batchId: null as string | null,
          count: 0,
          fingerprints: {} as Record<string, string>,
        };
      }

      const batchId = await submitModerationBatch(inputs);
      // Snapshot fingerprints travel with the step output, so the collect step
      // can tell whether a draft changed while the batch was processing.
      const fingerprints = Object.fromEntries(
        inputs.map((i) => [i.affairId, moderationInputFingerprint(i)])
      );
      return { batchId, count: inputs.length, fingerprints };
    });

    let ready = batch.batchId === null;
    for (let attempt = 0; attempt < POLL_ATTEMPTS && !ready; attempt++) {
      await step.sleep(`wait-batch-${attempt}`, POLL_INTERVAL);
      ready = await step.run(`check-batch-${attempt}`, async () => {
        const { isBatchReady } = await import("@/services/affair-moderation-batch");
        return isBatchReady(batch.batchId!);
      });
    }

    const report = await step.run("assemble-report", async () => {
      const { runPreflight, buildModerationInputs } = await import("@/lib/moderation/preflight");

      // No batch: either it is switched off or there was no draft to submit. Never fall back
      // to one synchronous model call per draft from the cron.
      if (!batch.batchId) return runPreflight({ source: "cron", skipModeration: true });

      const { collectModerationBatch } = await import("@/services/affair-moderation-batch");
      const { moderationInputFingerprint } = await import("@/services/affair-moderation");
      const inputs = await buildModerationInputs();

      if (!ready) {
        // Batch non terminé : chaque draft retombe sur NEEDS_REVIEW, le défaut
        // sûr, inchangé. L'identifiant est journalisé pour un relevé ultérieur
        // plutôt que perdu, le batch étant déjà payé.
        console.error(
          `[preflight] ALERT batch non terminé après ${POLL_ATTEMPTS} relevés, ` +
            `batch=${batch.batchId} drafts=${batch.count}. Résultats récupérables manuellement.`
        );
        return runPreflight({ source: "cron", moderationResults: new Map() });
      }

      const { results, failures } = await collectModerationBatch(batch.batchId, inputs);

      // Reject any result whose draft changed since submission: the answer was
      // generated from the old content. Dropping it falls back to NEEDS_REVIEW.
      for (const input of inputs) {
        if (!results.has(input.affairId)) continue;
        const submitted = batch.fingerprints[input.affairId];
        if (submitted && submitted !== moderationInputFingerprint(input)) {
          results.delete(input.affairId);
          failures.set(input.affairId, "affaire modifiée pendant le batch, résultat périmé");
        }
      }

      for (const [affairId, reason] of failures) {
        console.error(`[preflight] moderateAffair (batch) failed for draft ${affairId}: ${reason}`);
      }
      return runPreflight({ source: "cron", moderationResults: results });
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
      batchId: batch.batchId,
    };
  }
);
