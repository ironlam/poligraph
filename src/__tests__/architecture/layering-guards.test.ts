/**
 * L-01 layering contract
 *
 * AGENTS.md §5 states the doctrine: "Pages import and render. Data modules query and cache.
 * Business logic sits in services." That sentence left one box unnamed, and the code filled it
 * in three different ways across sessions: `src/lib/data/`, `src/lib/<domain>/` and
 * `src/services/<domain>/` all became plausible homes for the same code. These guards name the
 * boxes and make the boundaries falsifiable.
 *
 * Read layer
 * - Guarantee: `src/lib/data/` never mutates. It queries and caches, nothing else.
 * - Canonical syntax: `db.<model>.findMany()`, `findUnique()`, `count()`, `aggregate()`, `groupBy()`.
 * - Forbidden: create/update/upsert/delete in any arity, and raw execution (`$executeRaw*`).
 * - Limit: the guard reads the call shape written in the file. A mutation reached through a helper
 *   defined elsewhere is that helper's violation, in that helper's directory.
 *
 * Outbound network
 * - Guarantee: inside `src/lib/`, only `src/lib/api/` talks to the network. Domain modules hold
 *   rules and may touch the database; they do not open sockets.
 * - Canonical syntax: import a client from `@/lib/api/*`, or use `HTTPClient`.
 * - Forbidden: a direct `fetch()` call anywhere else under `src/lib/`.
 * - Limit: `src/services/` is deliberately outside this rule. Orchestration is where external I/O
 *   belongs. NETWORK_EXCEPTIONS is frozen: it records three modules that predate the rule and are
 *   candidates to move into `src/lib/api/`, not a place to add new entries.
 *
 * Page data access
 * - Guarantee: no *new* public page reaches for the Prisma client. Pages render; `src/lib/data/`
 *   queries. This is the rule AGENTS.md §5 already states, made enforceable.
 * - Canonical syntax: `import { getX } from "@/lib/data/<domain>"`.
 * - Forbidden: `import { db } from "@/lib/db"` in a non-admin `page.tsx`.
 * - Limit: a ratchet, not a clean sheet. PAGE_DB_DEBT lists the pages that already do this. Entries
 *   may be removed as pages migrate; adding one fails review. Admin pages are out of scope: they
 *   are internal tooling with no caching contract.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/** Prisma delegate methods that write. `$executeRaw*` is checked separately. */
const MUTATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/**
 * Modules under `src/lib/` that called out to the network before the rule existed.
 * Frozen. Do not extend it.
 *
 * - `indexnow.ts` and `social/notify.ts` are outbound clients (search-engine ping, Slack
 *   webhook). They belong in `src/lib/api/`; moving them is a separate change.
 * - `affairs/official-decision-verification.ts` re-fetches a source URL to confirm a decision
 *   still resolves. The call is one step of a domain routine, not a reusable client.
 * - `og-utils.tsx` downloads a portrait so Satori never blocks on a dead upstream host. It is a
 *   rendering concern, and the bounded fetch is the point of the function.
 */
const NETWORK_EXCEPTIONS = new Set([
  "src/lib/indexnow.ts",
  "src/lib/social/notify.ts",
  "src/lib/affairs/official-decision-verification.ts",
  "src/lib/og-utils.tsx",
]);

/**
 * Public pages that import the Prisma client directly, recorded on 2026-08-30.
 * Ratchet: shrink this list as pages move to `src/lib/data/`, never grow it.
 */
const PAGE_DB_DEBT = new Set([
  "src/app/affaires/[slug]/page.tsx",
  "src/app/affaires/condamnations/page.tsx",
  "src/app/affaires/parti/[slug]/page.tsx",
  "src/app/comparer/votes/page.tsx",
  "src/app/departements/page.tsx",
  "src/app/elections/[slug]/page.tsx",
  "src/app/elections/municipales-2026/communes/[inseeCode]/page.tsx",
  "src/app/elections/municipales-2026/page.tsx",
  "src/app/factchecks/[slug]/page.tsx",
  "src/app/parlement/dossiers/[slug]/page.tsx",
  "src/app/parlement/dossiers/page.tsx",
  "src/app/parlement/votes/[slug]/page.tsx",
  "src/app/parlement/votes/themes/[theme]/page.tsx",
  "src/app/parlement/votes/themes/page.tsx",
  "src/app/partis/[slug]/page.tsx",
  "src/app/politiques/[slug]/page.tsx",
  "src/app/politiques/[slug]/relations/page.tsx",
  "src/app/politiques/[slug]/votes/page.tsx",
  "src/app/politiques/page.tsx",
]);

interface SourceUnit {
  /** Repository-relative path with forward slashes. */
  file: string;
  source: ts.SourceFile;
}

interface Violation {
  file: string;
  line: number;
  message: string;
}

function isExcluded(relative: string): boolean {
  return (
    relative.startsWith("src/generated/") ||
    relative.includes("/__tests__/") ||
    relative.includes("/__e2e__/") ||
    /\.(test|spec|stories)\.tsx?$/.test(relative)
  );
}

function collectUnits(): SourceUnit[] {
  const units: SourceUnit[] = [];

  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;

      const relative = path.relative(ROOT, absolute).split(path.sep).join("/");
      if (isExcluded(relative)) continue;

      units.push({
        file: relative,
        source: ts.createSourceFile(
          relative,
          fs.readFileSync(absolute, "utf8"),
          ts.ScriptTarget.Latest,
          true,
          relative.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        ),
      });
    }
  };

  walk(SRC);
  return units;
}

const UNITS = collectUnits();

function walkNodes(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walkNodes(child, visit));
}

function lineOf(unit: SourceUnit, node: ts.Node): number {
  return unit.source.getLineAndCharacterOfPosition(node.getStart(unit.source)).line + 1;
}

function format(violations: Violation[]): string {
  return violations.map((v) => `  ${v.file}:${v.line} — ${v.message}`).join("\n");
}

/** True when `expression` is a `db.<something>` or `prisma.<something>` member access. */
function isPrismaDelegate(expression: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(expression)) return false;
  const base = expression.expression;
  return ts.isIdentifier(base) && (base.text === "db" || base.text === "prisma");
}

function mutationViolations(unit: SourceUnit): Violation[] {
  const violations: Violation[] = [];

  walkNodes(unit.source, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return;

    const method = callee.name.text;

    // db.$executeRaw`...` / db.$executeRawUnsafe(...)
    if (method.startsWith("$executeRaw")) {
      const base = callee.expression;
      if (ts.isIdentifier(base) && (base.text === "db" || base.text === "prisma")) {
        violations.push({
          file: unit.file,
          line: lineOf(unit, node),
          message: `raw execution \`${method}\` in the read layer`,
        });
      }
      return;
    }

    if (!MUTATIONS.has(method)) return;
    if (!isPrismaDelegate(callee.expression)) return;

    const model = (callee.expression as ts.PropertyAccessExpression).name.text;
    violations.push({
      file: unit.file,
      line: lineOf(unit, node),
      message: `mutation \`${model}.${method}()\` in the read layer`,
    });
  });

  return violations;
}

function fetchViolations(unit: SourceUnit): Violation[] {
  const violations: Violation[] = [];

  walkNodes(unit.source, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isIdentifier(callee) || callee.text !== "fetch") return;

    violations.push({
      file: unit.file,
      line: lineOf(unit, node),
      message: "direct fetch() outside src/lib/api/",
    });
  });

  return violations;
}

function importsPrismaClient(unit: SourceUnit): ts.Node | null {
  let found: ts.Node | null = null;

  walkNodes(unit.source, (node) => {
    if (found) return;

    const specifier = ts.isImportDeclaration(node)
      ? node.moduleSpecifier
      : ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length > 0
        ? node.arguments[0]
        : undefined;

    if (specifier && ts.isStringLiteral(specifier) && specifier.text === "@/lib/db") {
      found = node;
    }
  });

  return found;
}

describe("L-01 layering contract", () => {
  it("scans a meaningful number of source files", () => {
    // Guards that silently scan nothing pass forever. Anchor the sample size.
    expect(UNITS.length).toBeGreaterThan(900);
  });

  describe("read layer", () => {
    it("keeps src/lib/data/ free of writes", () => {
      const violations = UNITS.filter((u) => u.file.startsWith("src/lib/data/")).flatMap(
        mutationViolations
      );

      expect(
        violations,
        `src/lib/data/ queries and caches; it must not write.\n${format(violations)}\n` +
          "Move the mutation to src/lib/<domain>/ (an invariant) or src/services/<domain>/ (a pipeline)."
      ).toEqual([]);
    });

    it("detects a write that is added to the read layer", () => {
      const probe: SourceUnit = {
        file: "src/lib/data/probe.ts",
        source: ts.createSourceFile(
          "probe.ts",
          'import { db } from "@/lib/db";\nexport const touch = () => db.affair.update({ where: { id: "x" } });\n',
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS
        ),
      };

      expect(mutationViolations(probe)).toHaveLength(1);
    });

    it("leaves reads alone", () => {
      const probe: SourceUnit = {
        file: "src/lib/data/probe.ts",
        source: ts.createSourceFile(
          "probe.ts",
          "export const read = () => db.affair.findMany({ take: 10 });\n" +
            "export const total = () => db.affair.count();\n",
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS
        ),
      };

      expect(mutationViolations(probe)).toEqual([]);
    });
  });

  describe("outbound network", () => {
    it("confines fetch() under src/lib/ to src/lib/api/", () => {
      const violations = UNITS.filter(
        (u) =>
          u.file.startsWith("src/lib/") &&
          !u.file.startsWith("src/lib/api/") &&
          !NETWORK_EXCEPTIONS.has(u.file)
      ).flatMap(fetchViolations);

      expect(
        violations,
        `Only src/lib/api/ talks to the network.\n${format(violations)}\n` +
          "Add a client under src/lib/api/ and import it, or move the module to src/services/."
      ).toEqual([]);
    });

    it("keeps the exception list frozen and honest", () => {
      // An exception that no longer fetches must be deleted, not left to rot.
      const stale = [...NETWORK_EXCEPTIONS].filter((file) => {
        const unit = UNITS.find((u) => u.file === file);
        return unit !== undefined && fetchViolations(unit).length === 0;
      });

      expect(
        stale,
        `These modules no longer fetch. Remove them from NETWORK_EXCEPTIONS:\n${stale.join("\n")}`
      ).toEqual([]);

      const missing = [...NETWORK_EXCEPTIONS].filter((file) => !UNITS.some((u) => u.file === file));
      expect(missing, `NETWORK_EXCEPTIONS names files that no longer exist`).toEqual([]);
    });
  });

  describe("page data access", () => {
    const publicPages = UNITS.filter(
      (u) => u.file.endsWith("/page.tsx") && !u.file.startsWith("src/app/admin/")
    );

    it("admits no new public page that imports the Prisma client", () => {
      const offenders = publicPages
        .filter((u) => !PAGE_DB_DEBT.has(u.file))
        .map((u) => ({ unit: u, node: importsPrismaClient(u) }))
        .filter((entry): entry is { unit: SourceUnit; node: ts.Node } => entry.node !== null)
        .map(({ unit, node }) => ({
          file: unit.file,
          line: lineOf(unit, node),
          message: 'imports "@/lib/db" — pages render, src/lib/data/ queries',
        }));

      expect(offenders, `New pages must read through src/lib/data/.\n${format(offenders)}`).toEqual(
        []
      );
    });

    it("shrinks the debt list as pages migrate", () => {
      // A page that stopped importing db must leave PAGE_DB_DEBT, so the ratchet keeps tightening.
      const settled = [...PAGE_DB_DEBT].filter((file) => {
        const unit = publicPages.find((u) => u.file === file);
        return unit !== undefined && importsPrismaClient(unit) === null;
      });

      expect(
        settled,
        `These pages no longer import the Prisma client. Remove them from PAGE_DB_DEBT:\n${settled.join("\n")}`
      ).toEqual([]);

      const vanished = [...PAGE_DB_DEBT].filter(
        (file) => !publicPages.some((u) => u.file === file)
      );
      expect(vanished, "PAGE_DB_DEBT names pages that no longer exist").toEqual([]);
    });
  });
});
