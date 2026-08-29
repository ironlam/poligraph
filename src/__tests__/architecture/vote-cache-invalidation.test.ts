import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function normalized(source: string): string {
  return source.replace(/\s+/g, " ");
}

function expectInOrder(source: string, markers: string[]): void {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker, previousIndex + 1);
    expect(index, `Marqueur absent ou mal ordonné: ${marker}`).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

describe("architecture d'invalidation du cache des votes", () => {
  const grouped = withoutComments(read("src/inngest/functions/sync-scrutins.ts"));
  const dailyInngest = withoutComments(read("src/inngest/functions/sync-daily.ts"));
  const wrappers = withoutComments(read("src/inngest/index.ts"));
  const localInvalidation = withoutComments(read("src/inngest/vote-cache.ts"));
  const dailyScript = withoutComments(read("scripts/sync-daily.ts"));
  const remoteInvalidation = withoutComments(read("scripts/lib/revalidate-cache.ts"));
  const remoteCli = withoutComments(read("scripts/revalidate-cache.ts"));
  const dailyWorkflow = read(".github/workflows/sync-daily.yml");
  const weeklyWorkflow = read(".github/workflows/sync-scrutins-an.yml");

  it("lie les deux writes du sync Inngest groupé à l'invalidation", () => {
    expect(normalized(grouped)).toContain(
      "runVoteSyncWithCacheInvalidation(() => syncScrutinsAN(undefined, false, true) )"
    );
    expect(normalized(grouped)).toContain(
      "runVoteSyncWithCacheInvalidation(() => syncScrutinsSenat(null, false, true))"
    );
  });

  it("lie les étapes AN et Sénat du daily Inngest à l'invalidation", () => {
    expect(normalized(dailyInngest)).toContain(
      "runVoteSyncWithCacheInvalidation(() => syncScrutinsAN(undefined, false, true))"
    );
    expect(normalized(dailyInngest)).toContain(
      "runVoteSyncWithCacheInvalidation(() => syncScrutinsSenat(null, false, true))"
    );
  });

  it("lie les wrappers individuels AN et Sénat à l'invalidation", () => {
    const anWrapper = wrappers.slice(
      wrappers.indexOf('createSyncFunction("sync-scrutins-an"'),
      wrappers.indexOf('createSyncFunction("sync-scrutins-senat"')
    );
    const senatWrapper = wrappers.slice(
      wrappers.indexOf('createSyncFunction("sync-scrutins-senat"'),
      wrappers.indexOf('createSyncFunction("sync-press-analysis"')
    );

    expect(anWrapper).toContain("runVoteSyncWithCacheInvalidation");
    expect(anWrapper).toContain("syncScrutinsAN(undefined, false, todayOnly)");
    expect(senatWrapper).toContain("runVoteSyncWithCacheInvalidation");
    expect(senatWrapper).toContain("syncScrutinsSenat(null, false, todayOnly)");
  });

  it("invalide seulement après la résolution réussie du service Inngest", () => {
    expectInOrder(localInvalidation, [
      "const result = await sync()",
      'revalidateTags(["votes"], "max")',
      "return result",
    ]);
  });

  it("invalide les votes du GitHub Daily avant la législation et les traitements longs", () => {
    expect(dailyWorkflow).toContain("CRON_SECRET: ${{ secrets.CRON_SECRET }}");
    expect(dailyWorkflow).toContain("NEXT_PUBLIC_BASE_URL:");
    expect(dailyWorkflow).toContain("run: npm run sync:daily");
    expectInOrder(dailyScript, [
      "scripts/sync-scrutins-an.ts --today",
      "scripts/sync-scrutins-senat.ts --today",
      'name: "Votes cache revalidation"',
      'revalidateRemoteCache(["votes"])',
      'name: "Législation (active, 3j)"',
    ]);
    // "factchecks" belongs in the final purge because the Daily runs the Google
    // Fact Check step; without it a freshly imported fact-check waited out the
    // listing's 24h cache window before appearing.
    expect(dailyScript).toContain(
      'revalidateRemoteCache(["dossiers", "stats", "politicians", "factchecks"])'
    );
    expect(dailyScript).toContain("...(!DRY_RUN");
  });

  it("le Daily continue jusqu'à la revalidation après une erreur de sync partielle", () => {
    const executionLoop = dailyScript.slice(
      dailyScript.indexOf("for (const step of steps)"),
      dailyScript.indexOf("const totalDuration")
    );
    const errorHandler = executionLoop.slice(
      executionLoop.indexOf("} catch (err)"),
      executionLoop.indexOf("const duration")
    );

    expect(errorHandler).toContain("lastError =");
    expect(errorHandler).not.toContain("throw");
    expect(errorHandler).not.toContain("process.exit");
  });

  it("le weekly revalide après une sync réussie ou échouée", () => {
    expect(weeklyWorkflow).toContain("CRON_SECRET: ${{ secrets.CRON_SECRET }}");
    expect(weeklyWorkflow).toContain("NEXT_PUBLIC_BASE_URL:");
    const syncStep = weeklyWorkflow.slice(
      weeklyWorkflow.indexOf("- name: Sync Scrutins from Official AN API"),
      weeklyWorkflow.indexOf("- name: Revalidate votes cache")
    );
    const revalidationStep = weeklyWorkflow.slice(
      weeklyWorkflow.indexOf("- name: Revalidate votes cache"),
      weeklyWorkflow.indexOf("- name: Preserve sync failure after cache revalidation")
    );

    expect(syncStep).toContain("id: sync");
    expect(syncStep).toContain("continue-on-error: true");
    expect(revalidationStep).toContain(
      "if: ${{ !cancelled() && (steps.sync.outcome == 'success' || steps.sync.outcome == 'failure') }}"
    );
    expect(revalidationStep).toContain("run: npm run cache:revalidate -- votes");
    expectInOrder(weeklyWorkflow, [
      "npm run sync:scrutins-an",
      "name: Revalidate votes cache",
      "name: Preserve sync failure after cache revalidation",
    ]);
  });

  it("le weekly conserve l'échec de sync après avoir tenté la revalidation", () => {
    const failureStep = weeklyWorkflow.slice(
      weeklyWorkflow.indexOf("- name: Preserve sync failure after cache revalidation"),
      weeklyWorkflow.indexOf("- name: Show sync stats")
    );

    expect(failureStep).toContain("if: ${{ always() && steps.sync.outcome == 'failure' }}");
    expect(failureStep).toContain("exit 1");
  });

  it.each([
    ["success", "success", true, false],
    ["failure", "success", true, true],
    ["success", "failure", true, true],
    ["failure", "failure", true, true],
  ] as const)(
    "weekly: sync %s et revalidation %s donnent revalidation=%s et jobFailure=%s",
    (syncOutcome, revalidationOutcome, expectedRevalidation, expectedJobFailure) => {
      const syncContinuesOnError = weeklyWorkflow.includes("continue-on-error: true");
      const revalidationAcceptsFailure = weeklyWorkflow.includes(
        "steps.sync.outcome == 'success' || steps.sync.outcome == 'failure'"
      );
      const syncFailureIsRestored = weeklyWorkflow.includes(
        "always() && steps.sync.outcome == 'failure'"
      );
      const revalidationRuns =
        syncOutcome === "success" ||
        (syncOutcome === "failure" && syncContinuesOnError && revalidationAcceptsFailure);
      const jobFails =
        revalidationOutcome === "failure" || (syncOutcome === "failure" && syncFailureIsRestored);

      expect(revalidationRuns).toBe(expectedRevalidation);
      expect(jobFails).toBe(expectedJobFailure);
    }
  );

  it("impose endpoint, tag, authentification et échec HTTP fail-closed", () => {
    expect(remoteCli).toContain("revalidateRemoteCache(tags)");
    expect(remoteCli).toContain("process.exit(1)");
    expect(remoteInvalidation).toContain("/api/cron/revalidate");
    expect(remoteInvalidation).toContain("Authorization: `Bearer ${secret}`");
    expect(remoteInvalidation).toContain("body: JSON.stringify({ tags })");
    expect(remoteInvalidation).toContain("if (!response.ok)");
    expect(remoteInvalidation).toContain("if (!secret)");
    expect(remoteInvalidation).not.toContain("all: true");
  });
});
