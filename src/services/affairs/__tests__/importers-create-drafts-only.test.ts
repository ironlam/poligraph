import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * RGPD art. 10 — un importeur ne publie pas.
 *
 * Invariant : dans les répertoires d'import, la création d'une affaire passe
 * exclusivement par `createDraftAffairFromDiscovery`, qui force DRAFT, et
 * personne n'y écrit `verifiedAt`. La mise en ligne relève d'un seul point
 * de passage, `assertPublishable()`, qui exige une validation humaine.
 *
 * Double le garde-fou CI côté `npm test`, pour qu'un écart casse en local
 * avant d'atteindre la CI.
 */

const ROOT = process.cwd();

/** Répertoires dont le code est un importeur automatisé. */
const IMPORTER_DIRS = ["scripts", "src/services/sync"];

/**
 * `seed-fixtures` peuple une base de développement, protégée par
 * SEED_BLOCKED_HOSTS, et ne touche pas `publicationStatus` : ses affaires
 * retombent sur le défaut DRAFT du schéma.
 */
const ALLOWED = new Set(["scripts/seed-fixtures.ts"]);

function collectTsFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  const out: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        // `.local` holds gitignored throwaway scripts: never shipped, never in
        // CI's checkout, so scanning it only fails this guard locally.
        if (entry === "__tests__" || entry === "node_modules" || entry === ".local") continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      const rel = relative(ROOT, full);
      if (ALLOWED.has(rel)) continue;
      out.push(rel);
    }
  };

  walk(abs);
  return out;
}

const IMPORTER_FILES = IMPORTER_DIRS.flatMap(collectTsFiles);

/** Lignes de `file` correspondant à `pattern`, préfixées du numéro de ligne. */
function matchingLines(file: string, pattern: RegExp): string[] {
  return readFileSync(join(ROOT, file), "utf8")
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ line, n }) => `${file}:${n}: ${line.trim()}`);
}

/**
 * Une requête Prisma s'étale sur plusieurs lignes : `publicationStatus` seul
 * ne dit pas s'il s'agit d'une écriture ou d'un filtre de lecture. On
 * remonte donc le contexte pour savoir quel mot-clé gouverne le champ, comme
 * le fait le garde-fou CI.
 */
const READ_CONTEXT =
  /\bwhere\b|Where|\bselect\b|\bcount\(|\bfindMany\(|\bfindFirst\(|\bfindUnique\(|\bgroupBy\(/;
const CONTEXT_DEPTH = 12;

/** Lignes correspondant à `pattern` et gouvernées par un `data:` (écriture). */
function writeContextMatches(file: string, pattern: RegExp): string[] {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  const violations: string[] = [];

  lines.forEach((line, i) => {
    if (!pattern.test(line)) return;

    const context = lines.slice(Math.max(0, i - CONTEXT_DEPTH), i + 1);
    let lastData = -1;
    let lastRead = -1;
    context.forEach((c, j) => {
      if (/\bdata:/.test(c)) lastData = j;
      if (READ_CONTEXT.test(c)) lastRead = j;
    });

    if (lastData > lastRead) {
      violations.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  });

  return violations;
}

describe("les importeurs ne créent que des brouillons", () => {
  it("trouve bien les fichiers d'import à contrôler", () => {
    // Sans ce contrôle, une erreur de chemin rendrait tous les tests
    // suivants verts en ne scannant rien.
    expect(IMPORTER_FILES.length).toBeGreaterThan(30);
    expect(IMPORTER_FILES).toContain("scripts/discover-affairs.ts");
  });

  it("aucun importeur n'appelle affair.create directement", () => {
    const violations = IMPORTER_FILES.flatMap((f) =>
      matchingLines(f, /\b(?:db|tx)\.affair\.create\b/)
    );
    expect(violations, "utilisez createDraftAffairFromDiscovery").toEqual([]);
  });

  it("aucun importeur ne date verifiedAt", () => {
    // Cible l'affectation d'une date, seule signature de la fausse
    // validation. `verifiedAt: true` (select), `verifiedAt: { not: null }`
    // (where) et `verifiedAt: null` (dépublication) restent permis.
    const violations = IMPORTER_FILES.flatMap((f) => matchingLines(f, /verifiedAt:.*new Date\(/));
    expect(violations, "la validation humaine passe par assertPublishable()").toEqual([]);
  });

  it("aucun importeur n'affecte publicationStatus PUBLISHED", () => {
    const violations = IMPORTER_FILES.flatMap((f) =>
      writeContextMatches(f, /publicationStatus:\s*"PUBLISHED"/)
    );
    expect(violations, "seul publish-guard publie une affaire").toEqual([]);
  });
});

describe("createDraftAffairFromDiscovery est le sas de création", () => {
  const source = readFileSync(join(ROOT, "src/services/affairs/create-draft.ts"), "utf8");

  it("code en dur DRAFT et verifiedAt null", () => {
    expect(source).toMatch(/publicationStatus:\s*"DRAFT"/);
    expect(source).toMatch(/verifiedAt:\s*null/);
  });

  it("n'expose ni publicationStatus ni verifiedAt en paramètre d'entrée", () => {
    const start = source.indexOf("export interface CreateDraftAffairInput");
    // Borne au corps de l'interface : la doc de la fonction en aval mentionne
    // légitimement publicationStatus pour expliquer qu'il est codé en dur.
    const input = source.slice(start, source.indexOf("\n}", start));
    expect(input).not.toMatch(/publicationStatus/);
    expect(input).not.toMatch(/verifiedAt/);
    expect(input).not.toMatch(/verifiedBy/);
  });
});
