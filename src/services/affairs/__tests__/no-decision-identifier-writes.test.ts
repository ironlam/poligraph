import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PROPOSABLE_FIELDS } from "@/lib/security/schemas/affair-proposal";

/**
 * Issue #545 — nothing writes a decision identifier onto an `Affair` any more.
 *
 * `ecli`, `pourvoiNumber`, `chamber` and `caseNumbers` identify a decision, and a
 * decision is not an affair: one decision carries several counts, so it reaches
 * several fiches. They belong to `CourtDecision`, written by the targeted Judilibre
 * enrichment (#337) and linked through `AffairCourtDecision` (#536).
 *
 * `court`, `verdictDate` and `caseNumber` are NOT covered here: they describe the
 * editorial state of an affair, and 23.7 % of `Affair.court` values name a body that
 * renders no decision at all. They stay writable.
 */

const ROOT = process.cwd();

/** Identifiers that may no longer be written onto an affair. */
const DECISION_IDENTIFIERS = ["ecli", "pourvoiNumber", "caseNumbers", "chamber"] as const;

/** Fields that stay on `Affair` and must remain writable. */
const EDITORIAL_FIELDS = ["court", "verdictDate", "caseNumber"] as const;

/**
 * Where an affair row is actually written. Court-decision code is excluded: it
 * writes the same field names onto a different table, which is the point.
 */
const WRITE_SURFACES = [
  "src/services/affairs/index.ts",
  "src/services/affairs/create-draft.ts",
  "src/app/api/admin/affaires/route.ts",
  "src/app/api/admin/affaires/[id]/route.ts",
];

/**
 * An assignment, not a read.
 *
 * `ecli: true` is a Prisma `select`, and `ecli: { not: null }` is a `where`: both
 * read the column. Only a value that is neither a boolean nor an object writes it.
 *
 * The whitespace sits *inside* the lookahead on purpose. With `:\s*(?!…)` in front,
 * `\s*` can backtrack to zero characters and the lookahead then passes on the space,
 * so `ecli: { not: null }` would read as a write.
 */
const ASSIGNMENT_SOURCE = (field: string) => String.raw`\b${field}\s*:(?!\s*(?:true\b|false\b|\{))`;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function collect(dir: string): string[] {
  const out: string[] = [];
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
  walk(join(ROOT, dir));
  return out;
}

const relative = (f: string) => f.replace(ROOT + "/", "");

describe("garde : aucune écriture d'identifiant de décision sur Affair (#545)", () => {
  it("les surfaces d'écriture d'affaire n'assignent plus ces champs", () => {
    const offenders: string[] = [];

    for (const rel of WRITE_SURFACES) {
      const source = stripComments(readFileSync(join(ROOT, rel), "utf8"));
      for (const field of DECISION_IDENTIFIERS) {
        const assignment = new RegExp(ASSIGNMENT_SOURCE(field), "g");
        if (assignment.test(source)) offenders.push(`${rel} → ${field}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("aucun de ces champs n'est proposable", () => {
    const offenders = DECISION_IDENTIFIERS.filter((field) =>
      (PROPOSABLE_FIELDS as readonly string[]).includes(field)
    );

    expect(offenders).toEqual([]);
  });

  it("le chemin d'auto-application a disparu, pas seulement ses champs", () => {
    // Lu dans la source plutôt qu'importé : `proposals.ts` construit le client
    // Prisma au chargement, et ce garde doit rester lexical.
    //
    // Conséquence directe : « un importeur ne mute jamais une affaire existante »
    // devient absolu, sans exception. Un chemin que personne ne peut atteindre est
    // un chemin que personne ne maintient, donc il est supprimé et non désactivé.
    const source = stripComments(
      readFileSync(join(ROOT, "src/services/affairs/proposals.ts"), "utf8")
    );

    for (const symbol of ["AUTO_APPLICABLE_FIELDS", "applyAutoCandidates", "AUTO_APPLIED"]) {
      expect(source).not.toContain(symbol);
    }
    // Et le service n'écrit plus jamais une affaire.
    expect(source).not.toMatch(/\b(?:db|tx)\.affair\.update\b/);
  });

  it("les champs éditoriaux restent proposables", () => {
    // Borne par le bas : sans elle, vider PROPOSABLE_FIELDS rendrait la règle verte.
    for (const field of ["court", "verdictDate"] as const) {
      expect(PROPOSABLE_FIELDS as readonly string[]).toContain(field);
    }
  });

  it("le formulaire admin ne propose plus de saisir ECLI ni pourvoi", () => {
    const form = readFileSync(join(ROOT, "src/components/admin/AffairForm.tsx"), "utf8");

    expect(form).not.toContain('htmlFor="ecli"');
    expect(form).not.toContain('htmlFor="pourvoiNumber"');
  });

  it("aucun service de synchronisation n'écrit ces identifiants", () => {
    // `chamber` est exclu de ce balayage : le nom est partagé avec Scrutin et
    // Amendment, où il désigne une chambre parlementaire. Sur les surfaces
    // d'écriture d'affaire ci-dessus, il est vérifié nommément.
    const unambiguous = DECISION_IDENTIFIERS.filter((f) => f !== "chamber");
    const offenders: string[] = [];

    for (const file of collect("src/services/sync")) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const field of unambiguous) {
        if (new RegExp(ASSIGNMENT_SOURCE(field)).test(source)) {
          offenders.push(`${relative(file)} → ${field}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("ne prétend pas couvrir les champs éditoriaux", () => {
    // Rend explicite ce que ce garde ne dit pas, pour qu'on ne le lise pas comme
    // une interdiction d'écrire court ou verdictDate.
    for (const field of EDITORIAL_FIELDS) {
      expect(DECISION_IDENTIFIERS as readonly string[]).not.toContain(field);
    }
  });
});
