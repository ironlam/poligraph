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
const workflowPipeline = stripComments(readFileSync("scripts/sync-daily.ts", "utf8"));

describe("computeStats n'a qu'un seul propriétaire", () => {
  it("lit bien les deux pipelines", () => {
    // Guards the reads: an empty source would make every assertion below vacuously true.
    expect(inngestPipeline).toContain("compute-municipales-snapshots");
    expect(workflowPipeline).toContain("scripts/compute-stats.ts");
  });

  it("le pipeline Inngest n'appelle plus computeStats", () => {
    expect(inngestPipeline).not.toContain("computeStats");
    expect(inngestPipeline).not.toContain("compute-stats");
  });

  it("le workflow GitHub Actions le lance toujours", () => {
    // The complement matters as much as the removal: dropping it here too would silently stop
    // producing PoliticianParticipation and StatsSnapshot rows.
    expect(workflowPipeline).toContain("scripts/compute-stats.ts");
  });

  it("laisse les snapshots municipales à Inngest, qui en est le seul propriétaire", () => {
    // They exist nowhere else, so they must stay, and their queries average ten seconds or less.
    expect(inngestPipeline).toContain("computeMunicipalesSnapshots");
    expect(workflowPipeline).not.toContain("municipales-snapshots");
  });
});
