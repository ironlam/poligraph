/**
 * Garde d'attribution des affaires (spec PR A, garde d'architecture v3.3).
 *
 * Une implication INDIRECT (« Témoin/Secondaire ») n'est comptée, badgée ni présentée à charge
 * sur aucune surface publique. Le garde vérifie les points de contrôle, pas des mots-clés :
 * chaque lecture d'affaires (`db.affair.*`, filtre de relation, SQL brut sur "Affair") reçoit un
 * prédicat importé de `@/lib/affairs/public-filters`, aucun filtre d'implication n'est écrit à la
 * main, et la certitude d'une affaire passe par le helper d'attribution.
 *
 * ALLOWED recense les exceptions assumées, une par occurrence, avec leur nature et leur raison.
 * ATTRIBUTION_DEBT recense les écarts connus et reportés, chacun avec son responsable et ce qui
 * reste à faire. Cliquet : une entrée sort quand son code est rebranché, aucune n'entre, et le
 * nombre total d'occurrences en dette est plafonné.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ALLOWED,
  ATTRIBUTION_DEBT,
  checkCoverage,
  scanAffairAttribution,
  FROZEN_DEBT_KEYS,
  unfrozenDebtKeys,
  type CoverageEntry,
  type Finding,
} from "./affair-attribution-scan";

const debtKeys = (entries: readonly CoverageEntry[]): string[] =>
  entries.map((entry) => `${entry.path}|${entry.snippet}`);

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

  it("accepte les helpers de condamnation définitive, non définitive et de badge probité", () => {
    const findings = scanOne(
      'import { getDefinitiveConvictionWhere, getNonDefinitiveConvictionWhere, getProbityConvictionBadgeWhere } from "@/lib/affairs/public-filters";\n' +
        "export const a = () => db.affair.count({ where: getDefinitiveConvictionWhere() });\n" +
        "export const b = () => db.affair.count({ where: getNonDefinitiveConvictionWhere() });\n" +
        "export const c = () => db.affair.count({ where: getProbityConvictionBadgeWhere() });\n"
    );
    expect(findings).toEqual([]);
  });

  it("accepte le helper du badge financement politique illégal", () => {
    const findings = scanOne(
      'import { getPoliticalFinancingBadgeWhere } from "@/lib/affairs/public-filters";\n' +
        "export const a = () => db.affair.count({ where: getPoliticalFinancingBadgeWhere() });\n"
    );
    expect(findings).toEqual([]);
  });

  it("accepte le jumeau SQL du badge financement politique illégal", () => {
    const findings = scanOne(
      'import { getPoliticalFinancingBadgeSql } from "@/lib/affairs/public-filters";\n' +
        'export const a = () => db.$queryRaw`SELECT 1 FROM "Affair" a WHERE ${getPoliticalFinancingBadgeSql("a")}`;\n'
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

describe("gel de la dette", () => {
  const frozen = ["src/a.ts|ligne a", "src/b.ts|ligne b"];
  const entry = (path: string, snippet: string): CoverageEntry => ({ path, snippet, count: 1 });

  it("accepte une dette qui ne fait que rétrécir", () => {
    expect(unfrozenDebtKeys([entry("src/a.ts", "ligne a")], frozen)).toEqual([]);
  });

  it("refuse une entrée nouvelle, même en échange d'une entrée retirée", () => {
    const swapped = [entry("src/a.ts", "ligne a"), entry("src/c.ts", "ligne c")];
    expect(swapped).toHaveLength(frozen.length);
    expect(unfrozenDebtKeys(swapped, frozen)).toEqual(["src/c.ts|ligne c"]);
    expect(debtKeys(swapped).sort()).not.toEqual([...frozen].sort());
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

  it("tout finding est couvert par une exception ALLOWED ou par la dette bornée", () => {
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

  it("aucune classification directe ne reste en dette", () => {
    const classified = ATTRIBUTION_DEBT.filter((entry) =>
      FINDINGS.some(
        (f) =>
          f.kind === "raw-classification" && f.path === entry.path && f.snippet === entry.snippet
      )
    );
    expect(classified.map((e) => `${e.path}: ${e.snippet}`)).toEqual([]);
  });

  it("la dette ne grossit pas : identités figées et total exact", () => {
    // Une entrée qui sort de ATTRIBUTION_DEBT sort de FROZEN_DEBT_KEYS et fait baisser ce total
    // dans le même diff ; aucune n'y entre.
    expect(debtKeys(ATTRIBUTION_DEBT).sort()).toEqual([...FROZEN_DEBT_KEYS].sort());
    expect(unfrozenDebtKeys(ATTRIBUTION_DEBT)).toEqual([]);
    expect(ATTRIBUTION_DEBT.reduce((sum, entry) => sum + entry.count, 0)).toBe(8);
  });

  it("chaque entrée de dette porte un responsable et une raison", () => {
    const incomplete = ATTRIBUTION_DEBT.filter(
      (entry) => entry.owner.trim().length === 0 || entry.reason.trim().length === 0
    );
    expect(incomplete.map((e) => `${e.path}: ${e.snippet}`)).toEqual([]);
  });

  it("ALLOWED porte une raison non vide pour chaque entrée", () => {
    const blank = ALLOWED.filter((entry) => entry.reason.trim().length === 0);
    expect(blank.map((e) => `${e.path}: ${e.snippet}`)).toEqual([]);
  });
});
