import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Affaires v2, lot 1 architectural guard.
//
// A sync service touches affairs through exactly two doors:
//   createDraftAffairFromDiscovery()  — new affair, always DRAFT
//   proposeAffairUpdate()             — change to an existing one, human-reviewed
//
// So no `db.affair.<mutation>` at all inside src/services/sync, `create`
// included. No file is exempt: a future `update` or `upsert` in press-analysis
// must fail this test just like anywhere else.
//
// A source scan rather than an ESLint rule, per the lot's scope. It covers the
// transactional client too (`tx.affair.update`), which is the form a future
// refactor is most likely to reach for.

const SYNC_DIR = join(process.cwd(), "src/services/sync");

const FORBIDDEN_MUTATIONS = [
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
] as const;

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

  it("aucun service de sync ne mute une affaire directement, create compris", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const match of code.matchAll(MUTATION_PATTERN)) {
        offenders.push(`${file.replace(process.cwd() + "/", "")} → .affair.${match[1]}(`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("la porte de création force DRAFT et n'accepte pas de publicationStatus", () => {
    const door = readFileSync(join(process.cwd(), "src/services/affairs/create-draft.ts"), "utf8");

    // publicationStatus is hard-coded, never a parameter.
    expect(door).toContain('publicationStatus: "DRAFT"');
    expect(stripComments(door)).not.toMatch(
      /publicationStatus\??\s*:\s*(PublicationStatus|string)/
    );
    expect(stripComments(door)).not.toMatch(/publicationStatus\s*:\s*input\./);
  });

  // Not asserted here: "no sync service publishes an affair" (invariant I1).
  // A source scan cannot tell a `where: { publicationStatus: "PUBLISHED" }`
  // filter from a write, and several services legitimately filter on it. The
  // invariant is already enforced at the type level by
  // DiscoveredAffair.publicationStatus being the literal "DRAFT".

  it("les deux portes sont bien celles qu'utilisent les importeurs", () => {
    // Judilibre ne figure plus ici : son importeur nominal a été retiré en #337, et
    // l'enrichissement qui le remplace vise une décision, jamais une affaire.
    const discover = readFileSync(join(SYNC_DIR, "discover-affairs.ts"), "utf8");
    const press = readFileSync(join(SYNC_DIR, "press-analysis.ts"), "utf8");

    expect(discover).toContain("proposeAffairUpdate(");

    // press-analysis only ever creates; it must still go through the door.
    for (const [name, code] of [
      ["discover-affairs", discover],
      ["press-analysis", press],
    ] as const) {
      expect(code, name).toContain("createDraftAffairFromDiscovery(");
    }
  });
});
