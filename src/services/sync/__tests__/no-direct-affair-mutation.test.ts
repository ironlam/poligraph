import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Affaires v2, lot 1 architectural guard.
//
// A sync service must never mutate an existing affair. It calls
// proposeAffairUpdate() and lets a human accept the change. Creating a new DRAFT
// affair stays allowed: nothing is overwritten and DRAFT is not public.
//
// A source scan rather than an ESLint rule, per the lot's scope. It covers the
// transactional client too (`tx.affair.update`), which is the form a future
// refactor is most likely to reach for.

const SYNC_DIR = join(process.cwd(), "src/services/sync");

const FORBIDDEN_MUTATIONS = ["update", "updateMany", "upsert", "delete", "deleteMany"] as const;

/** Any client identifier: db, tx, prisma, client... */
const MUTATION_PATTERN = new RegExp(
  String.raw`\.affair\.(${FORBIDDEN_MUTATIONS.join("|")})\s*\(`,
  "g"
);

/** Comments describing the old behaviour must not trip the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...collectTsFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("garde architectural : aucune mutation directe d'affaire dans src/services/sync", () => {
  const files = collectTsFiles(SYNC_DIR);

  it("trouve bien des fichiers à scanner", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("aucun service de sync ne fait update/updateMany/upsert/delete sur une affaire", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const match of code.matchAll(MUTATION_PATTERN)) {
        offenders.push(`${file.replace(process.cwd() + "/", "")} → .affair.${match[1]}(`);
      }
    }

    expect(offenders).toEqual([]);
  });

  // Not asserted here: "no sync service publishes an affair" (invariant I1).
  // A source scan cannot tell a `where: { publicationStatus: "PUBLISHED" }`
  // filter from a write, and several services legitimately filter on it. The
  // invariant is already enforced at the type level by
  // DiscoveredAffair.publicationStatus being the literal "DRAFT".

  it("le point de passage proposeAffairUpdate est bien utilisé par les importeurs convertis", () => {
    const discover = readFileSync(join(SYNC_DIR, "discover-affairs.ts"), "utf8");
    const judilibre = readFileSync(join(SYNC_DIR, "judilibre.ts"), "utf8");

    expect(discover).toContain("proposeAffairUpdate(");
    expect(judilibre).toContain("proposeAffairUpdate(");
  });
});
