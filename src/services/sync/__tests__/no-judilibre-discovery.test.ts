import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue #337 — the name-based Judilibre discovery pipeline is removed, not disabled.
 *
 * It searched the Cour de cassation corpus for a politician's name and created
 * affairs from the hits. Over 156 decisions it produced 0 affairs: the criminal
 * chamber's corpus is pseudonymised doctrinal jurisprudence, so a public figure
 * cannot be recognised in it.
 *
 * Commenting the call sites out was not enough — the code stayed one uncomment away
 * from running. This test makes the removal structural.
 *
 * The forbidden flow:   name → Judilibre search → Affair created
 * The allowed flow:     known reference → targeted lookup → CourtDecision
 */

const ROOT = process.cwd();

/** Scheduled and pipeline code: nothing here may reach a free-text search. */
const SCHEDULED_DIRS = ["src/inngest", "src/services/sync"];

/**
 * The free-text search. It is the only client method that can take a person's name,
 * so it has no place in scheduled code. The targeted lookups are deliberately absent
 * from this list: enriching from a reference is the whole point of #337.
 */
const NAME_CAPABLE_SEARCH = /\.searchDecisions\s*\(/;

/** Symbols of the retired pipeline. None may come back anywhere. */
const REMOVED_SYMBOLS = [
  "syncJudilibre",
  "loadJudilibreDecisionCache",
  "mapJudilibreToCategory",
  "buildTitleFromDecision",
  "analyzeIfConviction",
  "mapSolutionToStatus",
];

const REMOVED_FILES = [
  "src/services/sync/judilibre.ts",
  "src/services/sync/judilibre-decisions.ts",
  "src/services/affairs/judilibre-mapping.ts",
  "scripts/sync-judilibre.ts",
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function collectSources(dir: string): string[] {
  const out: string[] = [];
  const full = join(ROOT, dir);
  if (!existsSync(full)) return out;

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walk(path);
        continue;
      }
      if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
    }
  };
  walk(full);
  return out;
}

const relative = (f: string) => f.replace(ROOT + "/", "");

describe("garde : pas de découverte Judilibre par nom (#337)", () => {
  const scheduled = SCHEDULED_DIRS.flatMap(collectSources);

  it("trouve bien des fichiers planifiés à scanner", () => {
    expect(scheduled.length).toBeGreaterThan(10);
  });

  it("aucun code planifié n'appelle la recherche plein texte", () => {
    const offenders = scheduled.filter((f) =>
      NAME_CAPABLE_SEARCH.test(stripComments(readFileSync(f, "utf8")))
    );

    expect(offenders.map(relative)).toEqual([]);
  });

  it("les fichiers du pipeline retiré n'existent plus", () => {
    const survivors = REMOVED_FILES.filter((f) => existsSync(join(ROOT, f)));

    expect(survivors).toEqual([]);
  });

  it("aucun symbole du pipeline retiré ne subsiste dans le code de production", () => {
    const production = [...collectSources("src"), ...collectSources("scripts")];
    const offenders: string[] = [];

    for (const file of production) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const symbol of REMOVED_SYMBOLS) {
        if (new RegExp(`\\b${symbol}\\b`).test(source)) {
          offenders.push(`${relative(file)} → ${symbol}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("aucune tâche Inngest ne référence Judilibre", () => {
    const offenders = collectSources("src/inngest").filter((f) =>
      /judilibre/i.test(stripComments(readFileSync(f, "utf8")))
    );

    expect(offenders.map(relative)).toEqual([]);
  });

  it("aucun script npm ne lance de synchronisation Judilibre", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const offenders = Object.entries(pkg.scripts)
      .filter(([name, cmd]) => /judilibre/i.test(`${name} ${cmd}`))
      .filter(([name]) => !name.includes("diagnostics"));

    expect(offenders).toEqual([]);
  });
});

describe("garde : la récupération ciblée reste possible (#337)", () => {
  it("le client expose toujours les recherches par référence", () => {
    const client = readFileSync(join(ROOT, "src/lib/api/judilibre.ts"), "utf8");

    // Sans cette borne, supprimer tout Judilibre rendrait le garde vert et vide.
    for (const method of ["findDecisionsByPourvoiNumber", "findDecisionByEcli", "getDecision"]) {
      expect(client).toContain(method);
    }
  });

  it("le service d'enrichissement écrit sur une décision, pas sur une affaire", () => {
    const service = stripComments(
      readFileSync(join(ROOT, "src/services/affairs/enrich-court-decision.ts"), "utf8")
    );

    expect(service).toContain("courtDecision.update");
    expect(service).not.toMatch(/\b(?:db|tx)\.affair\.(?:create|update|upsert|delete)/);
  });
});
