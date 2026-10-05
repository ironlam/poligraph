/**
 * Garde d'attribution des affaires (spec PR A, garde d'architecture v3.3).
 *
 * Une implication INDIRECT (« Témoin/Secondaire ») n'est comptée, badgée ni présentée à charge
 * sur aucune surface publique. Le garde vérifie les points de contrôle, pas des mots-clés :
 * chaque lecture d'affaires (`db.affair.*`, filtre de relation, SQL brut sur "Affair") reçoit un
 * prédicat importé de `@/lib/affairs/public-filters`, aucun filtre d'implication n'est écrit à la
 * main, et la certitude d'une affaire passe par le helper d'attribution.
 *
 * ATTRIBUTION_DEBT recense les écarts présents au premier passage. Cliquet : une entrée sort quand
 * son code est rebranché, aucune n'entre. ALLOWED recense les exceptions assumées, une par
 * occurrence, avec leur nature et leur raison.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ALLOWED,
  ATTRIBUTION_DEBT,
  checkCoverage,
  scanAffairAttribution,
  type CoverageEntry,
  type Finding,
} from "./affair-attribution-scan";

const ROOT = process.cwd();

function scanOne(source: string, file = "src/lib/data/probe.ts"): Finding[] {
  return scanAffairAttribution([{ path: file, source }]);
}

const IMPORT_FILTERS =
  'import { getAdverseAffairWhere, getMisEnCauseWhere } from "@/lib/affairs/public-filters";\n';

describe("scanAffairAttribution", () => {
  it("signale un filtre involvement positif, notIn, NOT IN et une comparaison en mémoire", () => {
    const sources = [
      'export const w = { involvement: { in: ["DIRECT", "INDIRECT"] } };\n',
      'export const w = { involvement: { notIn: ["VICTIM", "PLAINTIFF"] } };\n',
      "export const q = Prisma.sql`SELECT 1 FROM x a WHERE a.involvement NOT IN ('VICTIM')`;\n",
      'export const f = (a: { involvement: string }) => a.involvement === "DIRECT";\n',
    ];

    for (const source of sources) {
      const findings = scanOne(source);
      expect(
        findings.map((f) => f.kind),
        source
      ).toEqual(["involvement-filter"]);
    }
  });

  it("signale un ensemble d'implications écrit à la main et son test d'appartenance", () => {
    const findings = scanOne(
      'const MIS_EN_CAUSE = ["DIRECT", "INDIRECT"];\n' +
        "export const f = (a: A) => MIS_EN_CAUSE.includes(a.involvement);\n"
    );
    expect(findings.map((f) => f.kind)).toEqual(["involvement-filter", "involvement-filter"]);
  });

  it("accepte l'ensemble partagé de public-filters et ignore une copie de champ ou un test de nullité", () => {
    const findings = scanOne(
      'import { ADVERSE_INVOLVEMENTS } from "@/lib/affairs/public-filters";\n' +
        "const SET = new Set<string>(ADVERSE_INVOLVEMENTS);\n" +
        "export const f = (a: A) => SET.has(a.involvement);\n" +
        "export const g = (a: A) => ({ involvement: a.involvement, label: L[a.involvement] });\n" +
        "export const h = (involvement: string | null) => involvement !== null;\n" +
        'export const doc = `req(involvement = "DIRECT")`;\n'
    );
    expect(findings).toEqual([]);
  });

  it("signale un compte par statut seul sur db.affair sans prédicat importé", () => {
    const findings = scanOne(
      'export const c = () => db.affair.groupBy({ by: ["status"], where: { publicationStatus: "PUBLISHED" } });\n'
    );
    expect(findings.map((f) => f.kind)).toEqual(["affair-sink"]);
  });

  it("signale un filtre de relation affairs.some avec un prédicat non approuvé", () => {
    const findings = scanOne(
      'const LOCAL_WHERE = { publicationStatus: "PUBLISHED" };\n' +
        "export const p = () => db.politician.findMany({ where: { affairs: { some: LOCAL_WHERE } } });\n"
    );
    expect(findings.map((f) => f.kind)).toEqual(["affair-sink"]);
  });

  it('signale un SQL brut qui lit "Affair"', () => {
    const findings = scanOne('export const q = Prisma.sql`SELECT 1 FROM "Affair" a`;\n');
    expect(findings.map((f) => f.kind)).toEqual(["affair-sink"]);
  });

  it("signale getCertaintyLevel appelé directement même si isAccusedInvolvement apparaît ailleurs dans le fichier", () => {
    const findings = scanOne(
      'import { getCertaintyLevel, isAccusedInvolvement } from "@/config/certainty";\n' +
        "export const guarded = (a: A) => (isAccusedInvolvement(a.involvement) ? a : null);\n" +
        "export const level = (a: A) => getCertaintyLevel(a.status);\n",
      "src/components/affairs/Probe.tsx"
    );
    expect(findings.map((f) => f.kind)).toEqual(["raw-classification"]);
  });

  it("accepte un sink qui reçoit un helper importé de public-filters", () => {
    const findings = scanOne(
      IMPORT_FILTERS +
        "export const a = () => db.affair.count({ where: getAdverseAffairWhere() });\n" +
        "export const b = (X: string) => db.affair.findMany({ where: { ...getMisEnCauseWhere(), politician: X } });\n"
    );
    expect(findings).toEqual([]);
  });

  it("refuse un helper de même nom qui ne vient pas de public-filters", () => {
    const findings = scanOne(
      'import { getAdverseAffairWhere } from "./local-filters";\n' +
        "export const a = () => db.affair.count({ where: getAdverseAffairWhere() });\n"
    );
    expect(findings.map((f) => f.kind)).toEqual(["affair-sink"]);
  });

  it("résout une constante par portée : un where approuvé ailleurs n'approuve pas celui-ci", () => {
    const findings = scanOne(
      IMPORT_FILTERS +
        "export const a = () => {\n" +
        "  const where = { ...getAdverseAffairWhere() };\n" +
        "  return db.affair.count({ where });\n" +
        "};\n" +
        "export const b = () => {\n" +
        '  const where = { publicationStatus: "PUBLISHED" };\n' +
        "  return db.affair.count({ where });\n" +
        "};\n" +
        "export const c = (where: object) => db.affair.count({ where });\n"
    );
    expect(findings.map((f) => `${f.line} ${f.kind}`)).toEqual(["8 affair-sink", "10 affair-sink"]);
  });

  it("accepte getAttributedCertaintyLevel", () => {
    const findings = scanOne(
      'import { getAttributedCertaintyLevel } from "@/config/certainty";\n' +
        "export const level = (a: A) => getAttributedCertaintyLevel(a);\n",
      "src/components/affairs/Probe.tsx"
    );
    expect(findings).toEqual([]);
  });
});

describe("checkCoverage", () => {
  const finding = (line: number): Finding => ({
    path: "src/lib/data/probe.ts",
    line,
    kind: "affair-sink",
    snippet: "db.affair.findMany({",
  });
  const entry: CoverageEntry = {
    path: "src/lib/data/probe.ts",
    snippet: "db.affair.findMany({",
    count: 2,
  };

  it("accepte le nombre exact d'occurrences", () => {
    expect(checkCoverage([finding(1), finding(9)], [entry])).toEqual({
      unlisted: [],
      miscounted: [],
      duplicated: [],
    });
  });

  it("échoue quand une occurrence identique s'ajoute", () => {
    const coverage = checkCoverage([finding(1), finding(9), finding(20)], [entry]);
    expect(coverage.miscounted).toHaveLength(1);
  });

  it("échoue quand une occurrence corrigée laisse un compte trop haut", () => {
    const coverage = checkCoverage([finding(1)], [entry]);
    expect(coverage.miscounted).toHaveLength(1);
  });

  it("exige l'égalité de ligne, pas une sous-chaîne", () => {
    const wider = { ...finding(3), snippet: "const rows = await db.affair.findMany({" };
    const coverage = checkCoverage([finding(1), finding(9), wider], [entry]);
    expect(coverage.unlisted).toEqual([wider]);
  });

  it("refuse une entrée déclarée deux fois", () => {
    expect(checkCoverage([], [entry, entry]).duplicated).toHaveLength(1);
  });
});

/** Surfaces publiques scannées (brief tâche 1, correction de plan après revue). */
const SCANNED_DIRECTORIES = [
  "src/app",
  "src/components",
  "src/config",
  "src/lib/data",
  "src/lib/api",
  "src/lib/social",
  "src/lib/email",
  "src/lib/affairs",
  "src/lib/politicians",
  "src/services/chat",
];

function isScanned(relative: string): boolean {
  if (relative.startsWith("src/app/admin/")) return false;
  if (relative.startsWith("src/app/api/admin/")) return false;
  if (relative.startsWith("src/components/admin/")) return false;
  if (relative.startsWith("src/generated/") || relative.startsWith("src/__tests__/")) return false;
  if (relative.includes("/__tests__/") || relative.includes("/__e2e__/")) return false;
  if (/\.(test|spec|stories)\.tsx?$/.test(relative)) return false;
  if (/^src\/services\/sync\/compute-[^/]*\.tsx?$/.test(relative)) return true;
  return SCANNED_DIRECTORIES.some((dir) => relative.startsWith(`${dir}/`));
}

function collectFiles(): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const relative = path.relative(ROOT, absolute).split(path.sep).join("/");
      if (!isScanned(relative)) continue;
      files.push({ path: relative, source: fs.readFileSync(absolute, "utf8") });
    }
  };
  walk(path.join(ROOT, "src"));
  return files;
}

const FILES = collectFiles();
const FINDINGS = scanAffairAttribution(FILES);

const ENTRIES: CoverageEntry[] = [...ALLOWED, ...ATTRIBUTION_DEBT];
const COVERAGE = checkCoverage(FINDINGS, ENTRIES);

describe("dépôt", () => {
  it("scanne un nombre significatif de fichiers", () => {
    // Un garde qui ne scanne rien passe toujours.
    expect(FILES.length).toBeGreaterThan(500);
    expect(FILES.some((f) => f.path === "src/lib/data/condamnations.ts")).toBe(true);
    expect(FILES.some((f) => f.path.startsWith("src/app/admin/"))).toBe(false);
  });

  it("aucun finding hors ALLOWED et ATTRIBUTION_DEBT", () => {
    expect(
      COVERAGE.unlisted.map((f) => `${f.path}:${f.line} [${f.kind}] ${f.snippet}`),
      "Lecture ou classification d'affaire sans prédicat partagé. Passer par " +
        "@/lib/affairs/public-filters ou getAttributedCertaintyLevel, ou documenter une " +
        "exception dans ALLOWED (jamais dans ATTRIBUTION_DEBT, qui ne fait que rétrécir)."
    ).toEqual([]);
  });

  it("chaque exception ALLOWED et chaque entrée de dette correspond encore à du code", () => {
    const missing = ENTRIES.filter((entry) => {
      const file = FILES.find((f) => f.path === entry.path);
      return file === undefined || !file.source.includes(entry.snippet);
    });
    expect(
      missing.map((e) => `${e.path}: ${e.snippet}`),
      "Extrait introuvable : retirer l'entrée ou la mettre à jour."
    ).toEqual([]);

    // Cliquet : une occurrence rebranchée fait baisser `count`, une entrée à zéro sort.
    expect(COVERAGE.miscounted, "Mettre `count` à jour ou retirer l'entrée.").toEqual([]);
    expect(COVERAGE.duplicated, "Entrée déclarée deux fois.").toEqual([]);
  });

  it("chaque entrée de dette de classification porte sa famille", () => {
    const classified = ATTRIBUTION_DEBT.filter((entry) =>
      FINDINGS.some(
        (f) =>
          f.kind === "raw-classification" && f.path === entry.path && f.snippet === entry.snippet
      )
    );
    expect(classified.length).toBeGreaterThan(0);
    expect(
      classified.filter((entry) => entry.family === undefined).map((e) => `${e.path}: ${e.snippet}`)
    ).toEqual([]);
  });

  it("ALLOWED porte une raison non vide pour chaque entrée", () => {
    const blank = ALLOWED.filter((entry) => entry.reason.trim().length === 0);
    expect(blank.map((e) => `${e.path}: ${e.snippet}`)).toEqual([]);
  });
});
