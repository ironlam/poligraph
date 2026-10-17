/**
 * Architecture guard of the historical group module (lot 5).
 *
 * What the module promises, made falsifiable:
 * - deterministic: no clock, no randomness, no network, no environment;
 * - no database and no Prisma, no framework: it only receives evidence and answers;
 * - no way to reach the current group of a person or the delivered lot 3 referential;
 * - the resolution never knows about publication, and publication never reads the resolver.
 *
 * The scan reads the call shape written in the files (syntax tree, comments ignored). A guard that
 * cannot fail proves nothing, so the scanner is also run on snippets that must be refused.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const MODULE_DIR = path.resolve(process.cwd(), "src/lib/parlement/historical-groups");

/** The only module that is not a relative import. `canonical.ts` hashes with it. */
const ALLOWED_EXTERNAL = new Set(["node:crypto"]);

/** What would let a resolution read something other than the evidence it is given. */
const FORBIDDEN_IDENTIFIERS = new Set([
  "Mandate",
  "MandateParliamentary",
  "ParliamentaryGroup",
  "AnOrgan",
  "isCurrent",
  "currentParty",
  "currentPartyId",
  "Prisma",
  "PrismaClient",
  // Clock, randomness, network, environment.
  "Date",
  "performance",
  "setTimeout",
  "setInterval",
  "fetch",
  "process",
  "XMLHttpRequest",
  "WebSocket",
  "randomUUID",
  "randomBytes",
  "randomInt",
  "console",
]);

const FORBIDDEN_MEMBERS = new Set(["Math.random", "crypto.randomUUID"]);

/** What each file may import from the module. Keeps resolution and publication apart. */
const ALLOWED_INTERNAL_IMPORTS: Record<string, readonly string[]> = {
  "resolver.ts": ["./date-semantics", "./types"],
  "date-semantics.ts": ["./types"],
  "publication.ts": ["./types"],
  "exclusion.ts": ["./types"],
  "identity.ts": ["./types"],
  // The parsers read official files and know nothing of the resolver, the runs or the publication.
  "source-shape.ts": [],
  "parse-amo30.ts": ["./civil-date", "./source-shape", "./types"],
  "parse-scrutin.ts": ["./civil-date", "./source-shape", "./types"],
  // The validation is an independent measurement: it must never import the resolver it checks.
  "official-validation.ts": ["./parse-amo30", "./parse-scrutin", "./types"],
};

function specifiersOf(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const first = node.arguments[0];
      const dynamic =
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require");
      if (dynamic && first && ts.isStringLiteral(first)) found.push(first.text);
      if (dynamic && !(first && ts.isStringLiteral(first))) found.push("<computed>");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Violations of the contract found in one source text. Empty when the file respects it. */
export function scan(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const violations: string[] = [];

  // Module files import each other with `./`. Fixtures sit one folder down and may reach the
  // module files above them with `../`, never anything else.
  const inFixtures = fileName.startsWith("__fixtures__/");
  for (const specifier of specifiersOf(source)) {
    const relative = specifier.startsWith("./") || (inFixtures && specifier.startsWith("../"));
    if (!relative && !ALLOWED_EXTERNAL.has(specifier)) {
      violations.push(`${fileName}: import of ${specifier}`);
    }
    if (relative && specifier.startsWith("../")) {
      const target = path.join(MODULE_DIR, `${specifier.slice(3)}.ts`);
      if (specifier.slice(3).includes("/") || !fs.existsSync(target)) {
        violations.push(`${fileName}: import of ${specifier} leaves the module`);
      }
    }
    const allowed = ALLOWED_INTERNAL_IMPORTS[path.basename(fileName)];
    if (relative && allowed && !allowed.includes(specifier)) {
      violations.push(`${fileName}: ${path.basename(fileName)} may not import ${specifier}`);
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text)) {
      violations.push(`${fileName}: identifier ${node.text}`);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const member = `${node.expression.text}.${node.name.text}`;
      if (FORBIDDEN_MEMBERS.has(member)) violations.push(`${fileName}: ${member}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function moduleSources(): { name: string; text: string }[] {
  const names: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) names.push(full);
    }
  };
  walk(MODULE_DIR);
  return names.sort().map((name) => ({
    name: path.relative(MODULE_DIR, name),
    text: fs.readFileSync(name, "utf8"),
  }));
}

describe("historical groups: the module respects its contract", () => {
  const sources = moduleSources();

  it("finds the module files it is meant to guard", () => {
    const names = sources.map((s) => s.name);
    for (const expected of [
      "canonical.ts",
      "civil-date.ts",
      "date-semantics.ts",
      "exclusion.ts",
      "identity.ts",
      "official-validation.ts",
      "parse-amo30.ts",
      "parse-scrutin.ts",
      "publication.ts",
      "resolver.ts",
      "run-contract.ts",
      "run-execution.ts",
      "source-shape.ts",
      "types.ts",
      "versioning.ts",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("has no database, no Prisma, no framework, no clock, no randomness, no network", () => {
    const violations = sources.flatMap((s) => scan(s.name, s.text));
    expect(violations).toEqual([]);
  });

  it("keeps the resolution apart from the publication, in both directions", () => {
    const imports = (name: string) => {
      const file = sources.find((s) => s.name === name);
      return specifiersOf(
        ts.createSourceFile(name, file?.text ?? "", ts.ScriptTarget.Latest, true)
      );
    };
    expect(imports("resolver.ts")).not.toContain("./publication");
    expect(imports("resolver.ts")).not.toContain("./run-execution");
    expect(imports("publication.ts")).not.toContain("./resolver");
    expect(imports("publication.ts")).not.toContain("./exclusion");
    // Nothing in the module reaches for the publication except the callers of the run.
    for (const s of sources) {
      if (s.name === "publication.ts") continue;
      expect(imports(s.name)).not.toContain("./publication");
    }
  });
});

describe("the guard itself can fail", () => {
  it.each([
    ["database client", 'import { db } from "@/lib/db";', "import of @/lib/db"],
    [
      "generated Prisma client",
      'import type { X } from "@/generated/prisma";',
      "@/generated/prisma",
    ],
    ["framework", 'import { cacheTag } from "next/cache";', "import of next/cache"],
    ["another application module", 'import { x } from "../an-organes";', "import of ../an-organes"],
    ["computed import", "const m = await import(name);", "<computed>"],
    ["clock", "const t = Date.now();", "identifier Date"],
    ["randomness", "const r = Math.random();", "Math.random"],
    ["network", 'const r = await fetch("https://x");', "identifier fetch"],
    ["environment", "const e = process.env.X;", "identifier process"],
    ["current mandate", "const c = mandate.isCurrent;", "identifier isCurrent"],
    ["current party", "const p = politician.currentParty;", "identifier currentParty"],
    ["lot 3 referential", "const o = db.anOrgan; type T = AnOrgan;", "identifier AnOrgan"],
    ["parliamentary group model", "type G = ParliamentaryGroup;", "identifier ParliamentaryGroup"],
  ])("refuses a %s", (_label, snippet, expected) => {
    const violations = scan("fixture.ts", snippet);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join("\n")).toContain(expected);
  });

  it("refuses a resolver that imports the publication, and a publication that imports the resolver", () => {
    expect(scan("resolver.ts", 'import { x } from "./publication";').join("\n")).toContain(
      "may not import ./publication"
    );
    expect(scan("publication.ts", 'import { x } from "./resolver";').join("\n")).toContain(
      "may not import ./resolver"
    );
  });

  it("refuses a validation that imports the resolver, and a parser that reaches past the files", () => {
    expect(scan("official-validation.ts", 'import { x } from "./resolver";').join("\n")).toContain(
      "may not import ./resolver"
    );
    expect(
      scan("official-validation.ts", 'import { x } from "./date-semantics";').join("\n")
    ).toContain("may not import ./date-semantics");
    expect(scan("parse-amo30.ts", 'import { x } from "./publication";').join("\n")).toContain(
      "may not import ./publication"
    );
    expect(scan("parse-scrutin.ts", 'import fs from "node:fs";').join("\n")).toContain(
      "import of node:fs"
    );
    expect(scan("source-shape.ts", 'import { x } from "./types";').join("\n")).toContain(
      "may not import ./types"
    );
  });

  it("lets a fixture reach the module above it, and nothing else", () => {
    expect(scan("__fixtures__/x.ts", 'import { a } from "../canonical";')).toEqual([]);
    expect(scan("__fixtures__/x.ts", 'import { a } from "../an-organes";').join("\n")).toContain(
      "leaves the module"
    );
    expect(
      scan("__fixtures__/x.ts", 'import { a } from "../../votes/group-attribution";').join("\n")
    ).toContain("leaves the module");
  });

  it("lets a file that respects the contract pass, comments and strings included", () => {
    const clean = `
      // Mentions Date.now, process and isCurrent in a comment only.
      import { createHash } from "node:crypto";
      import type { X } from "./types";
      export const label = "isCurrent and Date.now() in a string";
      export const f = (x: X) => createHash("sha256").update(String(x)).digest("hex");
    `;
    expect(scan("canonical.ts", clean)).toEqual([]);
  });
});
