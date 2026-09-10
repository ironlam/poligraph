import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `computeStats()` must run once per cycle, from GitHub Actions.
 *
 * Both daily pipelines fire on the same `0 5,11,19` schedule, and both used to call it: the
 * workflow through `scripts/compute-stats.ts`, and the Inngest function inside the Next runtime.
 * Its first step is the heaviest query in the codebase, averaging 54 s against a two minute server
 * timeout, so the Inngest copy held one of the two pool slots of a lambda that also serves page
 * requests. The workflow copy is also the sturdier one: two retries with a backoff, added for the
 * transient Supabase drops of #442.
 *
 * Keeping it out of the Next runtime is what makes a capped role viable for the request path, see
 * docs/engineering/db-statement-timeout.md.
 */

/** Drop block and line comments so the predicates below read code, not prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const inngestPipeline = stripComments(readFileSync("src/inngest/functions/sync-daily.ts", "utf8"));
const dailyScript = stripComments(readFileSync("scripts/sync-daily.ts", "utf8"));
const workflow = readFileSync(".github/workflows/sync-daily.yml", "utf8");
const packageJson = readFileSync("package.json", "utf8");

describe("computeStats n'a qu'un seul propriétaire", () => {
  it("lit bien les quatre sources", () => {
    // Guards the reads: an empty source would make every assertion below vacuously true.
    expect(inngestPipeline).toContain("compute-municipales-snapshots");
    expect(dailyScript).toContain("scripts/compute-stats.ts");
    expect(workflow).toContain("Daily Sync");
    expect(packageJson).toContain('"sync:daily"');
  });

  it("le pipeline Inngest n'appelle plus computeStats", () => {
    expect(inngestPipeline).not.toContain("computeStats");
    expect(inngestPipeline).not.toContain("compute-stats");
  });

  it("la chaîne GitHub Actions le lance toujours, de bout en bout", () => {
    // The complement matters as much as the removal: losing it here too would silently stop
    // producing PoliticianParticipation and StatsSnapshot rows. Asserting on the script alone left
    // the first link unchecked, so the workflow could drop the call and this guard stay green.
    expect(workflow).toMatch(/run:\s*npm run sync:daily/);
    expect(workflow).toMatch(/schedule:/);
    expect(packageJson).toMatch(/"sync:daily":\s*"tsx scripts\/sync-daily\.ts"/);
    expect(dailyScript).toContain("scripts/compute-stats.ts");
    expect(packageJson).toMatch(/"sync:compute-stats":\s*"tsx scripts\/compute-stats\.ts"/);
  });

  it("laisse les snapshots municipales à Inngest, qui en est le seul propriétaire", () => {
    // They exist nowhere else, so they must stay, and their queries average ten seconds or less.
    expect(inngestPipeline).toContain("computeMunicipalesSnapshots");
    expect(dailyScript).not.toContain("municipales-snapshots");
  });
});
