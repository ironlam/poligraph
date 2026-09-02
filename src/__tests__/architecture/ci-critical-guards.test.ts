/**
 * CI-01 critical guard contract
 *
 * Public JSON
 * - Guarantee: every local TypeScript module reachable from a non-admin public route is free of
 *   the native JSON parser, except `src/lib/api/safe-json.ts`.
 * - Canonical syntax: import `safeJsonParse` from `@/lib/api/safe-json` and call it directly.
 * - Forbidden: native JSON.parse access, aliases, destructuring, binding, shadow aliases of the
 *   global JSON object, and moving that access to a reachable local helper.
 * - Limit: runtime-computed module names and third-party parser internals are not resolved. Local
 *   static imports, re-exports, and literal dynamic imports are resolved, so moving a helper within
 *   the repository is not a trivial bypass.
 *
 * Admin authentication
 * - Guarantee: every exported HTTP method in an admin route is declared in that route and directly
 *   wrapped by the canonical `withAdminAuth` import. The exact login route is exempt.
 * - Canonical syntax: `export const GET = withAdminAuth(handler)`, including import aliases and
 *   validation wrappers nested inside `withAdminAuth`.
 * - Forbidden: naked handlers, local wrapper aliases, handler re-exports, and wildcard re-exports.
 * - Limit: the guard proves the route export architecture, not the wrapper runtime implementation.
 *   Re-exports are forbidden, so an inter-file handler resolver is unnecessary.
 *
 * Affair and Measure publication
 * - Guarantee: critical Prisma delegates use direct canonical calls and cannot write PUBLISHED
 *   outside the two exact transition modules. Opaque data fails closed.
 * - Canonical syntax: `db.affair.update({ data: {...} })`, the equivalent transaction-root form,
 *   or the exact reviewed proposal builder whose schema and whitelist are checked here.
 * - Forbidden: delegate destructuring, delegate or mutation-method aliases, bind, delegate escape,
 *   PUBLISHED data, computed PUBLISHED keys, and arbitrary data builders.
 * - Limit: arbitrary runtime values are not interpreted. Explicit non-PUBLISHED values and a
 *   control-flow branch that excludes PUBLISHED are accepted; everything else fails closed.
 *
 * Importer provenance
 * - Guarantee: npm sync/import/discover/enrich/reconcile entrypoints, their local dependency graph,
 *   and permanent `src/services/sync` modules cannot create Affair rows or write a human verifiedAt.
 * - Canonical syntax: use the draft-affair service and proposal builder.
 * - Forbidden: direct/aliased Affair create or createMany and opaque Affair mutation data.
 * - Limit: remediation and human-review commands are outside the graph by command family, not by a
 *   broad directory allowlist. If an importer imports such a module, it enters the graph.
 *
 * HTTP identity
 * - Guarantee: an explicit User-Agent outside HTTPClient appears only as a direct property in the
 *   inline headers object of a direct fetch and uses USER_AGENT imported from `@/config/site`.
 *   HTTPClient identity is immutable and enforced by USER_AGENT; constructor options and caller
 *   headers cannot replace it. This remains a runtime contract in `http-client.test.ts`.
 * - Canonical syntax: HTTPClient, or `fetch(url, { headers: { "User-Agent": USER_AGENT } })`.
 * - Forbidden: hardcoded/computed values, header aliases, spreads, Headers mutations or
 *   constructors, and Request objects that carry User-Agent.
 * - Limit: fetch calls without an explicit User-Agent and incoming/audit fields named userAgent are
 *   outside this contract. HTTPClient internals are the only exact implementation exemption.
 *
 * NEXT_PUBLIC secrets
 * - Guarantee: every statically determined name in non-test source and `.env.example` is rejected
 *   when a NEXT_PUBLIC name contains a sensitive marker, independently of value provenance.
 * - Canonical syntax: non-sensitive public configuration names only.
 * - Forbidden: sensitive identifiers, properties, object/binding keys, and statically composed
 *   element-access keys.
 * - Limit: names depending on unknown runtime data are not guessed. Tests and comments are excluded;
 *   all production syntax nodes and static key components are scanned without provenance analysis.
 *
 * JSON-LD and fail-closed scanning
 * - Guarantee: dangerouslySetInnerHTML exists only in the canonical JSON-LD component and calls its
 *   single top-level const serializer, which cannot be shadowed or reassigned and whose runtime
 *   output neutralizes every case variant of </script>. Missing roots, unreadable entries, symlinks,
 *   read failures, and TypeScript parse errors throw.
 * - Canonical syntax: a direct `safeJsonLd(data)` sink in the canonical component.
 * - Forbidden: other sinks, serializer shadowing, missing/wrong replacement, and filesystem ambiguity.
 * - Limit: safe aliases are intentionally rejected to keep the sink contract direct and inspectable.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const MUTATION_METHODS = new Set(["create", "createMany", "update", "updateMany", "upsert"]);
const CRITICAL_MODELS = new Set(["affair", "measure"]);
const SECRET_MARKERS = ["SECRET", "TOKEN", "PASSWORD", "API_KEY", "PRIVATE_KEY", "CREDENTIAL"];
const SAFE_JSON_MODULE = "src/lib/api/safe-json.ts";
const ADMIN_AUTH_MODULE = "@/lib/api/with-admin-auth";
const ADMIN_AUTH_ROUTE = "src/app/api/admin/auth/route.ts";
const AFFAIR_PUBLISHER = "src/lib/affairs/publish-guard.ts";
const MEASURE_PUBLISHER = "src/lib/measures/transitions.ts";
const PROPOSAL_MODULE = "src/services/affairs/proposals.ts";
const PROPOSAL_SCHEMA = "src/lib/security/schemas/affair-proposal.ts";
const CREATE_DRAFT_SERVICE = "src/services/affairs/create-draft.ts";
const JSON_LD_MODULE = "src/components/seo/JsonLd.tsx";
const SITE_CONFIG_MODULE = "@/config/site";
const HTTP_CLIENT_MODULE = "src/lib/api/http-client.ts";
const LOCAL_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

interface Violation {
  file: string;
  line: number;
  message: string;
}

interface SourceUnit {
  absolute: string;
  file: string;
  source: string;
  sourceFile: ts.SourceFile;
  test: boolean;
}

interface ProjectModel {
  root: string;
  units: Map<string, SourceUnit>;
  program: ts.Program;
  checker: ts.TypeChecker;
}

interface PrismaMutation {
  model: string;
  method: string;
  call: ts.CallExpression;
  canonical: boolean;
}

interface PrismaAliases {
  roots: Set<string>;
  delegates: Map<string, string>;
  mutations: Map<string, { model: string; method: string }>;
  violations: Violation[];
}

type FieldVerdict = "safe" | "forbidden" | "unknown";
type SourceFileWithDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

function normalizedRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function isTestPath(file: string): boolean {
  const parts = file.split("/");
  const name = path.posix.basename(file);
  return parts.includes("__tests__") || name.includes(".test.") || name.includes(".spec.");
}

function assertReadableMode(file: string, directory: boolean): void {
  const mode = fs.lstatSync(file).mode;
  const readable = directory ? 0o555 : 0o444;
  if ((mode & readable) === 0) {
    throw new Error(`${directory ? "directory" : "file"} is not readable by guard: ${file}`);
  }
}

function collectSourceText(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (directory: string): void => {
    assertReadableMode(directory, true);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symlink in guard scan root: ${full}`);
      if (entry.isDirectory()) {
        if (
          ["node_modules", ".next", "coverage", "storybook-static", "generated"].includes(
            entry.name
          )
        ) {
          continue;
        }
        visit(full);
        continue;
      }
      if (
        !entry.isFile() ||
        !LOCAL_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ) {
        continue;
      }
      assertReadableMode(full, false);
      files.set(path.resolve(full), fs.readFileSync(full, "utf8"));
    }
  };

  visit(path.join(root, "src"));
  visit(path.join(root, "scripts"));
  return files;
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".mts")) return ts.ScriptKind.TS;
  if (file.endsWith(".cts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.TS;
}

function createModel(root: string, sourceText: Map<string, string>): ProjectModel {
  const units = new Map<string, SourceUnit>();
  for (const [absolute, source] of sourceText) {
    const file = normalizedRelative(root, absolute);
    const sourceFile = ts.createSourceFile(
      absolute,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(absolute)
    );
    const diagnostic = (sourceFile as SourceFileWithDiagnostics).parseDiagnostics?.[0];
    if (diagnostic) {
      throw new Error(
        `TypeScript parse error in ${file}: ${ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          "\n"
        )}`
      );
    }
    units.set(file, { absolute, file, source, sourceFile, test: isTestPath(file) });
  }

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
    noResolve: true,
    noLib: true,
    skipLibCheck: true,
  };
  const defaultHost = ts.createCompilerHost(options, true);
  const byAbsolute = new Map(
    [...units.values()].map((unit) => [path.resolve(unit.absolute), unit])
  );
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists(fileName) {
      return byAbsolute.has(path.resolve(fileName)) || defaultHost.fileExists(fileName);
    },
    readFile(fileName) {
      return byAbsolute.get(path.resolve(fileName))?.source ?? defaultHost.readFile(fileName);
    },
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
      const unit = byAbsolute.get(path.resolve(fileName));
      if (unit) return unit.sourceFile;
      return defaultHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile
      );
    },
  };
  const program = ts.createProgram({
    rootNames: [...byAbsolute.keys()],
    options,
    host,
  });
  return { root, units, program, checker: program.getTypeChecker() };
}

function loadRepository(root: string): ProjectModel {
  return createModel(root, collectSourceText(root));
}

function fixtureModel(files: Record<string, string>): ProjectModel {
  const root = path.resolve("/fixture");
  return createModel(
    root,
    new Map(Object.entries(files).map(([file, source]) => [path.join(root, file), source]))
  );
}

function unit(model: ProjectModel, file: string): SourceUnit {
  const found = model.units.get(file);
  if (!found) throw new Error(`missing source fixture: ${file}`);
  return found;
}

function walk(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  node.forEachChild((child) => walk(child, callback));
}

function line(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function problem(unitValue: SourceUnit, node: ts.Node, message: string): Violation {
  return { file: unitValue.file, line: line(unitValue.sourceFile, node), message };
}

function formatViolations(violations: Violation[]): string {
  return violations
    .map((violation) => `${violation.file}:${violation.line} ${violation.message}`)
    .join("\n");
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function identifierInitializer(
  identifier: ts.Identifier,
  model: ProjectModel
): ts.Expression | undefined {
  const symbol = ts.isShorthandPropertyAssignment(identifier.parent)
    ? model.checker.getShorthandAssignmentValueSymbol(identifier.parent)
    : model.checker.getSymbolAtLocation(identifier);
  for (const declaration of symbol?.getDeclarations() ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return declaration.initializer;
    }
    if (ts.isBindingElement(declaration)) {
      const variable = declaration.parent.parent;
      if (ts.isVariableDeclaration(variable) && variable.initializer) return variable.initializer;
    }
  }
  const sourceFile = identifier.getSourceFile();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === identifier.text &&
        declaration.initializer
      ) {
        return declaration.initializer;
      }
    }
  }
  return undefined;
}

function resolveExpression(
  expression: ts.Expression,
  model: ProjectModel,
  seen = new Set<ts.Symbol>()
): ts.Expression {
  const current = unwrap(expression);
  if (!ts.isIdentifier(current)) return current;
  const symbol = model.checker.getSymbolAtLocation(current);
  if (symbol && seen.has(symbol)) return current;
  const initializer = identifierInitializer(current, model);
  if (!initializer) return current;
  if (symbol) seen.add(symbol);
  return resolveExpression(initializer, model, seen);
}

function staticString(
  expression: ts.Expression,
  model: ProjectModel,
  seen = new Set<ts.Symbol>()
): string | null {
  const current = unwrap(expression);
  if (ts.isStringLiteralLike(current)) return current.text;
  if (ts.isIdentifier(current)) {
    const symbol = model.checker.getSymbolAtLocation(current);
    if (symbol && seen.has(symbol)) return null;
    const initializer = identifierInitializer(current, model);
    if (!initializer) return null;
    if (symbol) seen.add(symbol);
    return staticString(initializer, model, seen);
  }
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(current.left, model, new Set(seen));
    const right = staticString(current.right, model, new Set(seen));
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(current)) {
    let value = current.head.text;
    for (const span of current.templateSpans) {
      const part = staticString(span.expression, model, new Set(seen));
      if (part === null) return null;
      value += part + span.literal.text;
    }
    return value;
  }
  if (ts.isConditionalExpression(current)) {
    const whenTrue = staticString(current.whenTrue, model, new Set(seen));
    const whenFalse = staticString(current.whenFalse, model, new Set(seen));
    return whenTrue !== null && whenTrue === whenFalse ? whenTrue : null;
  }
  return null;
}

function propertyName(name: ts.PropertyName, model: ProjectModel): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return ts.isComputedPropertyName(name) ? staticString(name.expression, model) : null;
}

function memberName(expression: ts.Expression, model: ProjectModel): string | null {
  const current = unwrap(expression);
  if (ts.isPropertyAccessExpression(current)) return current.name.text;
  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    return staticString(current.argumentExpression, model);
  }
  return null;
}

function memberBase(expression: ts.Expression): ts.Expression | null {
  const current = unwrap(expression);
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    return current.expression;
  }
  return null;
}

function importAliases(
  sourceFile: ts.SourceFile,
  moduleName: string,
  importedName: string
): Set<string> {
  const aliases = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === importedName) {
        aliases.add(element.name.text);
      }
    }
  }
  return aliases;
}

function resolveLocalModule(
  model: ProjectModel,
  importer: string,
  specifier: string
): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  } else {
    return null;
  }

  const withoutJs = base.replace(/\.(?:js|jsx|mjs|cjs)$/, "");
  const candidates = [
    base,
    withoutJs,
    ...LOCAL_EXTENSIONS.map((extension) => `${withoutJs}${extension}`),
    ...LOCAL_EXTENSIONS.map((extension) => `${withoutJs}/index${extension}`),
  ];
  return candidates.find((candidate) => model.units.has(candidate)) ?? null;
}

function localDependencies(model: ProjectModel, sourceUnit: SourceUnit): string[] {
  const specifiers = new Set<string>();
  for (const statement of sourceUnit.sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.add(statement.moduleSpecifier.text);
    }
  }
  walk(sourceUnit.sourceFile, (node) => {
    const argument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      argument &&
      ts.isStringLiteral(argument)
    ) {
      specifiers.add(argument.text);
    }
  });
  return [...specifiers]
    .map((specifier) => resolveLocalModule(model, sourceUnit.file, specifier))
    .filter((file): file is string => file !== null);
}

function moduleGraph(model: ProjectModel, entries: Iterable<string>): Set<string> {
  const reached = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (reached.has(file)) continue;
    const sourceUnit = model.units.get(file);
    if (!sourceUnit) throw new Error(`module graph entry is not local TypeScript: ${file}`);
    reached.add(file);
    for (const dependency of localDependencies(model, sourceUnit)) {
      if (!reached.has(dependency)) queue.push(dependency);
    }
  }
  return reached;
}

function symbolFromDefaultLibrary(symbol: ts.Symbol | undefined): boolean {
  return !!symbol?.getDeclarations()?.some((declaration) => {
    const file = declaration.getSourceFile();
    return file.isDeclarationFile && /(?:^|[/\\])lib\.[^/\\]+\.d\.ts$/.test(file.fileName);
  });
}

function refersToNativeJson(
  expression: ts.Expression,
  model: ProjectModel,
  seen = new Set<ts.Symbol>()
): boolean {
  const current = unwrap(expression);
  if (ts.isIdentifier(current)) {
    const symbol = bindingIdentifierSymbol(current, model);
    if (current.text === "JSON" && symbolFromDefaultLibrary(symbol)) return true;
    if (symbol && seen.has(symbol)) return false;
    const initializer = identifierInitializer(current, model);
    if (!initializer) return current.text === "JSON" && !symbol;
    if (symbol) seen.add(symbol);
    return refersToNativeJson(initializer, model, seen);
  }
  const name = memberName(current, model);
  const base = memberBase(current);
  const unwrappedBase = base ? unwrap(base) : null;
  return (
    name === "JSON" &&
    !!unwrappedBase &&
    ts.isIdentifier(unwrappedBase) &&
    unwrappedBase.text === "globalThis"
  );
}

function isNativeJsonParseAccess(expression: ts.Expression, model: ProjectModel): boolean {
  return (
    memberName(expression, model) === "parse" &&
    !!memberBase(expression) &&
    refersToNativeJson(memberBase(expression)!, model)
  );
}

function analyzePublicJson(model: ProjectModel): Violation[] {
  const entries = [...model.units.keys()].filter(
    (file) =>
      file.startsWith("src/app/api/") &&
      !file.startsWith("src/app/api/admin/") &&
      file.endsWith("/route.ts")
  );
  const violations: Violation[] = [];
  for (const file of moduleGraph(model, entries)) {
    if (file === SAFE_JSON_MODULE) continue;
    const sourceUnit = unit(model, file);
    walk(sourceUnit.sourceFile, (node) => {
      if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        isNativeJsonParseAccess(node, model)
      ) {
        violations.push(problem(sourceUnit, node, "native JSON.parse in public API module graph"));
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer &&
        refersToNativeJson(node.initializer, model)
      ) {
        for (const element of node.name.elements) {
          const original = element.propertyName
            ? propertyName(element.propertyName, model)
            : ts.isIdentifier(element.name)
              ? element.name.text
              : null;
          if (original === "parse") {
            violations.push(
              problem(
                sourceUnit,
                element,
                "native JSON.parse destructuring in public API module graph"
              )
            );
          }
        }
      }
    });
  }
  return violations;
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    !!ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function directAdminWrapper(expression: ts.Expression | undefined, wrappers: Set<string>): boolean {
  if (!expression) return false;
  const value = unwrap(expression);
  return (
    ts.isCallExpression(value) &&
    ts.isIdentifier(unwrap(value.expression)) &&
    wrappers.has((unwrap(value.expression) as ts.Identifier).text)
  );
}

function analyzeAdminRoute(model: ProjectModel, sourceUnit: SourceUnit): Violation[] {
  if (sourceUnit.file === ADMIN_AUTH_ROUTE) return [];
  const wrappers = importAliases(sourceUnit.sourceFile, ADMIN_AUTH_MODULE, "withAdminAuth");
  const declarations = new Map<string, ts.VariableDeclaration>();
  const violations: Violation[] = [];

  for (const statement of sourceUnit.sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        declarations.set(declaration.name.text, declaration);
        if (!hasExportModifier(statement) || !HTTP_METHODS.has(declaration.name.text)) continue;
        if (!directAdminWrapper(declaration.initializer, wrappers)) {
          violations.push(
            problem(
              sourceUnit,
              declaration,
              `${declaration.name.text} must directly call canonical withAdminAuth`
            )
          );
        }
      }
      continue;
    }
    if (
      hasExportModifier(statement) &&
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      HTTP_METHODS.has(statement.name.text)
    ) {
      violations.push(
        problem(sourceUnit, statement, `${statement.name.text} must be a wrapped route constant`)
      );
      continue;
    }
    if (!ts.isExportDeclaration(statement)) continue;
    if (statement.moduleSpecifier) {
      if (!statement.exportClause) {
        violations.push(
          problem(sourceUnit, statement, "admin route wildcard re-export is forbidden")
        );
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (HTTP_METHODS.has(element.name.text)) {
            violations.push(
              problem(sourceUnit, element, "admin HTTP handler re-export is forbidden")
            );
          }
        }
      }
      continue;
    }
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      if (!HTTP_METHODS.has(element.name.text)) continue;
      const localName = element.propertyName?.text ?? element.name.text;
      const declaration = declarations.get(localName);
      if (!declaration || !directAdminWrapper(declaration.initializer, wrappers)) {
        violations.push(
          problem(
            sourceUnit,
            element,
            `${element.name.text} must directly call canonical withAdminAuth`
          )
        );
      }
    }
  }
  return violations;
}

function analyzeAdminRoutes(model: ProjectModel): Violation[] {
  const violations: Violation[] = [];
  for (const sourceUnit of model.units.values()) {
    if (sourceUnit.file.startsWith("src/app/api/admin/") && sourceUnit.file.endsWith("/route.ts")) {
      violations.push(...analyzeAdminRoute(model, sourceUnit));
    }
  }
  return violations;
}

function rootNames(model: ProjectModel, sourceUnit: SourceUnit): Set<string> {
  const roots = new Set(["db", "tx"]);
  for (const alias of importAliases(sourceUnit.sourceFile, "@/lib/db", "db")) roots.add(alias);
  walk(sourceUnit.sourceFile, (node) => {
    if (!ts.isCallExpression(node) || memberName(node.expression, model) !== "$transaction") return;
    for (const argument of node.arguments) {
      const callback = unwrap(argument);
      if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) continue;
      const first = callback.parameters[0]?.name;
      if (first && ts.isIdentifier(first)) roots.add(first.text);
    }
  });
  return roots;
}

function isPrismaRoot(
  expression: ts.Expression,
  model: ProjectModel,
  roots: Set<string>,
  seen = new Set<string>()
): boolean {
  const value = unwrap(expression);
  if (!ts.isIdentifier(value)) return false;
  if (roots.has(value.text)) return true;
  if (seen.has(value.text)) return false;
  seen.add(value.text);
  const initializer = identifierInitializer(value, model);
  return !!initializer && isPrismaRoot(initializer, model, roots, seen);
}

function directDelegate(
  expression: ts.Expression,
  model: ProjectModel,
  roots: Set<string>
): string | null {
  const name = memberName(expression, model);
  const base = memberBase(expression);
  return name && CRITICAL_MODELS.has(name) && base && isPrismaRoot(base, model, roots)
    ? name
    : null;
}

function buildPrismaAliases(model: ProjectModel, sourceUnit: SourceUnit): PrismaAliases {
  const roots = rootNames(model, sourceUnit);
  const delegates = new Map<string, string>();
  const mutations = new Map<string, { model: string; method: string }>();
  const violations: Violation[] = [];
  const declarations: ts.VariableDeclaration[] = [];
  walk(sourceUnit.sourceFile, (node) => {
    if (ts.isVariableDeclaration(node)) declarations.push(node);
  });

  for (let pass = 0; pass < 4; pass++) {
    for (const declaration of declarations) {
      if (!declaration.initializer) continue;
      if (
        ts.isObjectBindingPattern(declaration.name) &&
        isPrismaRoot(declaration.initializer, model, roots)
      ) {
        for (const element of declaration.name.elements) {
          const original = element.propertyName
            ? propertyName(element.propertyName, model)
            : ts.isIdentifier(element.name)
              ? element.name.text
              : null;
          if (original && CRITICAL_MODELS.has(original) && ts.isIdentifier(element.name)) {
            delegates.set(element.name.text, original);
          }
        }
        continue;
      }
      if (!ts.isIdentifier(declaration.name)) continue;
      const initializer = unwrap(declaration.initializer);
      const delegate = directDelegate(initializer, model, roots);
      if (delegate) {
        delegates.set(declaration.name.text, delegate);
        continue;
      }
      if (ts.isIdentifier(initializer) && delegates.has(initializer.text)) {
        delegates.set(declaration.name.text, delegates.get(initializer.text)!);
        continue;
      }
      const method = memberName(initializer, model);
      const base = memberBase(initializer);
      if (method && MUTATION_METHODS.has(method) && base) {
        const direct = directDelegate(base, model, roots);
        const aliased = ts.isIdentifier(unwrap(base))
          ? delegates.get((unwrap(base) as ts.Identifier).text)
          : undefined;
        const target = direct ?? aliased;
        if (target) mutations.set(declaration.name.text, { model: target, method });
      }
      if (
        ts.isCallExpression(initializer) &&
        memberName(initializer.expression, model) === "bind"
      ) {
        const boundTarget = memberBase(initializer.expression);
        if (!boundTarget) continue;
        const boundMethod = memberName(boundTarget, model);
        const boundBase = memberBase(boundTarget);
        if (!boundMethod || !MUTATION_METHODS.has(boundMethod) || !boundBase) continue;
        const direct = directDelegate(boundBase, model, roots);
        const aliased = ts.isIdentifier(unwrap(boundBase))
          ? delegates.get((unwrap(boundBase) as ts.Identifier).text)
          : undefined;
        const target = direct ?? aliased;
        if (target) mutations.set(declaration.name.text, { model: target, method: boundMethod });
      }
    }
  }

  for (const declaration of declarations) {
    const names: string[] = [];
    if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
    if (ts.isObjectBindingPattern(declaration.name)) {
      for (const element of declaration.name.elements) {
        if (ts.isIdentifier(element.name)) names.push(element.name.text);
      }
    }
    for (const name of names) {
      if (delegates.has(name)) {
        violations.push(
          problem(sourceUnit, declaration, "critical Prisma delegate alias is forbidden")
        );
      } else if (mutations.has(name)) {
        violations.push(
          problem(
            sourceUnit,
            declaration,
            "critical Prisma mutation method alias or bind is forbidden"
          )
        );
      }
    }
  }
  return { roots, delegates, mutations, violations };
}

function mutationCalls(
  model: ProjectModel,
  sourceUnit: SourceUnit,
  aliases: PrismaAliases
): PrismaMutation[] {
  const mutations: PrismaMutation[] = [];
  walk(sourceUnit.sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = unwrap(node.expression);
    if (ts.isIdentifier(callee)) {
      const alias = aliases.mutations.get(callee.text);
      if (alias) mutations.push({ ...alias, call: node, canonical: false });
      return;
    }
    const method = memberName(callee, model);
    const base = memberBase(callee);
    if (!method || !MUTATION_METHODS.has(method) || !base) return;
    const direct = directDelegate(base, model, aliases.roots);
    if (direct) {
      mutations.push({ model: direct, method, call: node, canonical: true });
      return;
    }
    const baseValue = unwrap(base);
    if (ts.isIdentifier(baseValue)) {
      const delegate = aliases.delegates.get(baseValue.text);
      if (delegate) mutations.push({ model: delegate, method, call: node, canonical: false });
    }
  });
  return mutations;
}

function delegateEscapeViolations(
  model: ProjectModel,
  sourceUnit: SourceUnit,
  aliases: PrismaAliases
): Violation[] {
  const violations = [...aliases.violations];
  walk(sourceUnit.sourceFile, (node) => {
    if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return;
    const delegate = directDelegate(node, model, aliases.roots);
    if (!delegate) return;
    const parentNode: ts.Node = node.parent;
    if (ts.isPropertyAccessExpression(parentNode) || ts.isElementAccessExpression(parentNode)) {
      const method = memberName(parentNode, model);
      if (
        method &&
        MUTATION_METHODS.has(method) &&
        (!ts.isCallExpression(parentNode.parent) || parentNode.parent.expression !== parentNode)
      ) {
        violations.push(
          problem(sourceUnit, parentNode, "critical Prisma mutation method must be called directly")
        );
      }
      return;
    }
    if (
      ts.isVariableDeclaration(parentNode) &&
      (aliases.delegates.has(ts.isIdentifier(parentNode.name) ? parentNode.name.text : "") ||
        ts.isObjectBindingPattern(parentNode.name))
    ) {
      return;
    }
    violations.push(problem(sourceUnit, node, `${delegate} delegate cannot escape as a value`));
  });
  return violations;
}

function objectLiteral(
  expression: ts.Expression,
  model: ProjectModel
): ts.ObjectLiteralExpression | null {
  const resolved = resolveExpression(expression, model);
  return ts.isObjectLiteralExpression(resolved) ? resolved : null;
}

function objectProperty(
  object: ts.ObjectLiteralExpression,
  wanted: string,
  model: ProjectModel
): ts.Expression | null | undefined {
  let result: ts.Expression | null | undefined;
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name, model) === wanted) {
      result = property.initializer;
    } else if (ts.isShorthandPropertyAssignment(property) && property.name.text === wanted) {
      result = identifierInitializer(property.name, model) ?? null;
    } else if (ts.isSpreadAssignment(property)) {
      const nested = objectLiteral(property.expression, model);
      if (!nested) return null;
      const nestedValue = objectProperty(nested, wanted, model);
      if (nestedValue !== undefined) result = nestedValue;
    }
  }
  return result;
}

function possibleStatusValues(
  expression: ts.Expression,
  model: ProjectModel,
  seen = new Set<ts.Symbol>()
): Set<string> | null {
  const value = unwrap(expression);
  if (ts.isStringLiteralLike(value)) return new Set([value.text]);
  if (ts.isIdentifier(value)) {
    const symbol = model.checker.getSymbolAtLocation(value);
    if (symbol && seen.has(symbol)) return null;
    const initializer = identifierInitializer(value, model);
    if (!initializer) return null;
    if (symbol) seen.add(symbol);
    return possibleStatusValues(initializer, model, seen);
  }
  if (ts.isPropertyAccessExpression(value)) {
    const base = unwrap(value.expression);
    return ts.isIdentifier(base) && /PublicationStatus$/.test(base.text)
      ? new Set([value.name.text])
      : null;
  }
  if (ts.isConditionalExpression(value)) {
    const left = possibleStatusValues(value.whenTrue, model, new Set(seen));
    const right = possibleStatusValues(value.whenFalse, model, new Set(seen));
    if (!left || !right) return null;
    return new Set([...left, ...right]);
  }
  if (ts.isElementAccessExpression(value) && value.argumentExpression) {
    const base = objectLiteral(value.expression, model);
    if (!base) return null;
    const values = new Set<string>();
    for (const property of base.properties) {
      if (!ts.isPropertyAssignment(property)) return null;
      const possible = possibleStatusValues(property.initializer, model, new Set(seen));
      if (!possible) return null;
      for (const item of possible) values.add(item);
    }
    return values;
  }
  return null;
}

function excludedPublishedBranch(node: ts.Node, identifier: string): boolean {
  for (let current: ts.Node | undefined = node; current?.parent; current = current.parent) {
    const parentNode: ts.Node = current.parent;
    if (!ts.isIfStatement(parentNode) || parentNode.elseStatement !== current) continue;
    const condition = parentNode.expression;
    if (
      !ts.isBinaryExpression(condition) ||
      ![ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(
        condition.operatorToken.kind
      )
    ) {
      continue;
    }
    const left = condition.left.getText();
    const right = condition.right.getText();
    if (
      (left === identifier && /PUBLISHED/.test(right)) ||
      (right === identifier && /PUBLISHED/.test(left))
    ) {
      return true;
    }
  }
  return false;
}

function isCanonicalProposalBuilder(
  expression: ts.Expression,
  sourceUnit: SourceUnit,
  _model: ProjectModel
): boolean {
  const value = unwrap(expression);
  if (!ts.isCallExpression(value) || !ts.isIdentifier(unwrap(value.expression))) return false;
  const local = (unwrap(value.expression) as ts.Identifier).text;
  return importAliases(
    sourceUnit.sourceFile,
    "@/services/affairs/proposals",
    "buildPrismaData"
  ).has(local);
}

function conditionExcludesPublished(condition: ts.Expression, value: ts.Expression): boolean {
  let excludes = false;
  walk(condition, (node) => {
    if (
      !ts.isBinaryExpression(node) ||
      ![ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(
        node.operatorToken.kind
      )
    ) {
      return;
    }
    const left = node.left.getText();
    const right = node.right.getText();
    const target = value.getText();
    if (
      (left === target && /PUBLISHED/.test(right)) ||
      (right === target && /PUBLISHED/.test(left))
    ) {
      excludes = true;
    }
  });
  return excludes;
}

function fieldVerdict(
  expression: ts.Expression,
  field: "publicationStatus" | "verifiedAt",
  sourceUnit: SourceUnit,
  model: ProjectModel,
  node: ts.Node
): FieldVerdict {
  if (isCanonicalProposalBuilder(expression, sourceUnit, model)) return "safe";
  const raw = unwrap(expression);
  if (
    ts.isBinaryExpression(raw) &&
    raw.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    if (field === "publicationStatus") {
      const right = objectLiteral(raw.right, model);
      const status = right ? objectProperty(right, field, model) : undefined;
      if (status && conditionExcludesPublished(raw.left, status)) return "safe";
    }
    return fieldVerdict(raw.right, field, sourceUnit, model, node);
  }
  const resolved = resolveExpression(expression, model);
  if (ts.isArrayLiteralExpression(resolved)) {
    let verdict: FieldVerdict = "safe";
    for (const element of resolved.elements) {
      if (ts.isSpreadElement(element)) return "unknown";
      const item = fieldVerdict(element, field, sourceUnit, model, node);
      if (item === "forbidden") return item;
      if (item === "unknown") verdict = item;
    }
    return verdict;
  }
  if (!ts.isObjectLiteralExpression(resolved)) return "unknown";

  let verdict: FieldVerdict = "safe";
  for (const property of resolved.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadVerdict = fieldVerdict(property.expression, field, sourceUnit, model, node);
      if (spreadVerdict === "forbidden") return spreadVerdict;
      if (spreadVerdict === "unknown") verdict = spreadVerdict;
      continue;
    }
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return "unknown";
    }
    const name = ts.isShorthandPropertyAssignment(property)
      ? property.name.text
      : propertyName(property.name, model);
    if (name === null) return "unknown";
    if (name !== field) continue;
    const value = ts.isShorthandPropertyAssignment(property)
      ? identifierInitializer(property.name, model)
      : property.initializer;
    if (!value) return "unknown";
    if (field === "verifiedAt") {
      const resolvedValue = resolveExpression(value, model);
      return resolvedValue.kind === ts.SyntaxKind.NullKeyword ? "safe" : "forbidden";
    }
    const values = possibleStatusValues(value, model);
    if (values) return values.has("PUBLISHED") ? "forbidden" : "safe";
    const resolvedValue = resolveExpression(value, model);
    if (ts.isIdentifier(resolvedValue) && excludedPublishedBranch(node, resolvedValue.text)) {
      return "safe";
    }
    return "unknown";
  }
  return verdict;
}

function mutationPayloads(
  mutation: PrismaMutation,
  model: ProjectModel
): Array<{ key: string; value: ts.Expression | null }> | null {
  const first = mutation.call.arguments[0];
  if (!first) return null;
  const args = objectLiteral(first, model);
  if (!args || args.properties.some(ts.isSpreadAssignment)) return null;
  const keys = mutation.method === "upsert" ? ["create", "update"] : ["data"];
  return keys.map((key) => ({ key, value: objectProperty(args, key, model) ?? null }));
}

function analyzePublicationUnit(model: ProjectModel, sourceUnit: SourceUnit): Violation[] {
  if ([AFFAIR_PUBLISHER, MEASURE_PUBLISHER].includes(sourceUnit.file)) return [];
  const aliases = buildPrismaAliases(model, sourceUnit);
  const violations = delegateEscapeViolations(model, sourceUnit, aliases);
  for (const mutation of mutationCalls(model, sourceUnit, aliases)) {
    if (!CRITICAL_MODELS.has(mutation.model)) continue;
    const payloads = mutationPayloads(mutation, model);
    if (!payloads) {
      violations.push(
        problem(
          sourceUnit,
          mutation.call,
          "cannot prove critical mutation arguments publication-safe"
        )
      );
      continue;
    }
    for (const payload of payloads) {
      if (!payload.value) {
        violations.push(
          problem(sourceUnit, mutation.call, `missing or opaque ${payload.key} payload`)
        );
        continue;
      }
      const verdict = fieldVerdict(
        payload.value,
        "publicationStatus",
        sourceUnit,
        model,
        mutation.call
      );
      if (verdict !== "safe") {
        violations.push(
          problem(
            sourceUnit,
            mutation.call,
            verdict === "forbidden"
              ? `direct ${mutation.model} PUBLISHED transition outside canonical publisher`
              : `cannot prove ${mutation.model} payload excludes PUBLISHED`
          )
        );
      }
    }
  }
  return violations;
}

function proposableFields(sourceUnit: SourceUnit, model: ProjectModel): Set<string> | null {
  let fields: Set<string> | null = null;
  walk(sourceUnit.sourceFile, (node) => {
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      node.name.text !== "PROPOSABLE_FIELDS" ||
      !node.initializer
    ) {
      return;
    }
    let value = unwrap(node.initializer);
    if (
      ts.isCallExpression(value) &&
      memberName(value.expression, model) === "freeze" &&
      value.arguments[0]
    ) {
      value = unwrap(value.arguments[0]);
    }
    if (!ts.isArrayLiteralExpression(value)) return;
    const names = value.elements.map((element) =>
      ts.isStringLiteralLike(element) ? element.text : null
    );
    if (names.every((name): name is string => name !== null)) fields = new Set(names);
  });
  return fields;
}

function strictSchemaFields(sourceUnit: SourceUnit, model: ProjectModel): Set<string> | null {
  let fields: Set<string> | null = null;
  walk(sourceUnit.sourceFile, (node) => {
    if (
      !ts.isCallExpression(node) ||
      memberName(node.expression, model) !== "strictObject" ||
      !node.arguments[0]
    ) {
      return;
    }
    const object = objectLiteral(node.arguments[0], model);
    if (!object) return;
    const names = object.properties.map((property) => {
      if (!ts.isPropertyAssignment(property)) return null;
      return propertyName(property.name, model);
    });
    if (names.every((name): name is string => name !== null)) fields = new Set(names);
  });
  return fields;
}

function validateProposalBuilder(model: ProjectModel): Violation[] {
  const proposal = unit(model, PROPOSAL_MODULE);
  const schema = unit(model, PROPOSAL_SCHEMA);
  const violations: Violation[] = [];
  const forbidden = ["publicationStatus", "verifiedAt"];
  const whitelist = proposableFields(schema, model);
  const schemaFields = strictSchemaFields(schema, model);
  if (!whitelist || forbidden.some((field) => whitelist.has(field))) {
    violations.push({
      file: PROPOSAL_SCHEMA,
      line: 1,
      message: "PROPOSABLE_FIELDS must explicitly exclude publicationStatus and verifiedAt",
    });
  }
  if (!schemaFields || forbidden.some((field) => schemaFields.has(field))) {
    violations.push({
      file: PROPOSAL_SCHEMA,
      line: 1,
      message: "affairPatchSchema must exclude publicationStatus and verifiedAt",
    });
  }

  let builderSafe = false;
  for (const statement of proposal.sourceFile.statements) {
    const firstParameter = ts.isFunctionDeclaration(statement)
      ? statement.parameters[0]
      : undefined;
    if (
      !ts.isFunctionDeclaration(statement) ||
      statement.name?.text !== "buildPrismaData" ||
      !hasExportModifier(statement) ||
      !statement.body ||
      statement.parameters.length !== 1 ||
      !firstParameter ||
      !ts.isIdentifier(firstParameter.name) ||
      firstParameter.type?.getText() !== "AffairPatch"
    ) {
      continue;
    }
    const parameter = firstParameter.name.text;
    const returns = statement.body.statements.filter(ts.isReturnStatement);
    const returnExpression = returns[0]?.expression;
    if (returns.length !== 1 || !returnExpression) continue;
    const returned = unwrap(returnExpression);
    if (!ts.isObjectLiteralExpression(returned) || returned.properties.length !== 1) continue;
    const only = returned.properties[0];
    if (!only) continue;
    builderSafe =
      ts.isSpreadAssignment(only) &&
      ts.isIdentifier(unwrap(only.expression)) &&
      (unwrap(only.expression) as ts.Identifier).text === parameter;
  }
  if (!builderSafe) {
    violations.push({
      file: PROPOSAL_MODULE,
      line: 1,
      message: "buildPrismaData must only copy a validated AffairPatch",
    });
  }
  return violations;
}

function importerEntries(model: ProjectModel, packageJson: string): Set<string> {
  const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
  const entries = new Set<string>();
  for (const [name, command] of Object.entries(parsed.scripts ?? {})) {
    if (!/^(sync|import|discover|enrich|reconcile)(?::|$)/.test(name)) continue;
    for (const match of command.matchAll(
      /(?:^|[\s'"(])(scripts|src)\/([\w./-]+\.(?:ts|tsx|mts|cts))/g
    )) {
      if (!match[1] || !match[2]) continue;
      const file = `${match[1]}/${match[2]}`;
      if (model.units.has(file)) entries.add(file);
    }
    for (const match of command.matchAll(/from\s+['"](\.\/src\/[^'"]+)['"]/g)) {
      if (!match[1]) continue;
      const file = resolveLocalModule(model, "package.json", match[1].slice(2));
      if (file) entries.add(file);
    }
  }
  for (const file of model.units.keys()) {
    if (file.startsWith("src/services/sync/") && !isTestPath(file)) entries.add(file);
  }
  return entries;
}

function analyzeImporterGraph(model: ProjectModel, entries: Iterable<string>): Violation[] {
  const violations: Violation[] = [];
  for (const file of moduleGraph(model, entries)) {
    const sourceUnit = unit(model, file);
    if (sourceUnit.test) continue;
    const aliases = buildPrismaAliases(model, sourceUnit);
    for (const mutation of mutationCalls(model, sourceUnit, aliases)) {
      if (mutation.model !== "affair") continue;
      if (["create", "createMany"].includes(mutation.method)) {
        if (sourceUnit.file === CREATE_DRAFT_SERVICE) continue;
        violations.push(problem(sourceUnit, mutation.call, "importer creates Affair directly"));
        continue;
      }
      const payloads = mutationPayloads(mutation, model);
      if (!payloads) {
        violations.push(
          problem(
            sourceUnit,
            mutation.call,
            "cannot prove importer Affair data excludes verifiedAt"
          )
        );
        continue;
      }
      for (const payload of payloads) {
        if (!payload.value) {
          violations.push(
            problem(
              sourceUnit,
              mutation.call,
              "cannot prove importer Affair data excludes verifiedAt"
            )
          );
          continue;
        }
        const verdict = fieldVerdict(payload.value, "verifiedAt", sourceUnit, model, mutation.call);
        if (verdict !== "safe") {
          violations.push(
            problem(
              sourceUnit,
              mutation.call,
              verdict === "forbidden"
                ? "importer writes human verifiedAt"
                : "cannot prove importer Affair data excludes verifiedAt"
            )
          );
        }
      }
    }
  }
  return violations;
}

function canonicalUserAgentSymbols(model: ProjectModel, sourceFile: ts.SourceFile): Set<ts.Symbol> {
  const symbols = new Set<ts.Symbol>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== SITE_CONFIG_MODULE ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) !== "USER_AGENT") continue;
      const symbol = model.checker.getSymbolAtLocation(element.name);
      if (symbol) symbols.add(symbol);
    }
  }
  return symbols;
}

function isCanonicalFetchUserAgent(
  property: ts.PropertyAssignment,
  model: ProjectModel,
  symbols: Set<ts.Symbol>
): boolean {
  if (propertyName(property.name, model) !== "User-Agent") return false;
  const value = unwrap(property.initializer);
  if (!ts.isIdentifier(value)) return false;
  const valueSymbol = model.checker.getSymbolAtLocation(value);
  if (!valueSymbol || !symbols.has(valueSymbol)) return false;

  const headers = property.parent;
  if (!ts.isObjectLiteralExpression(headers) || headers.properties.some(ts.isSpreadAssignment)) {
    return false;
  }
  const headersProperty = headers.parent;
  if (
    !ts.isPropertyAssignment(headersProperty) ||
    propertyName(headersProperty.name, model) !== "headers" ||
    unwrap(headersProperty.initializer) !== headers
  ) {
    return false;
  }
  const options = headersProperty.parent;
  if (!ts.isObjectLiteralExpression(options)) return false;
  const call = options.parent;
  return (
    ts.isCallExpression(call) &&
    call.arguments[1] === options &&
    ts.isIdentifier(unwrap(call.expression)) &&
    (unwrap(call.expression) as ts.Identifier).text === "fetch"
  );
}

function isUserAgentTuple(node: ts.ArrayLiteralExpression, model: ProjectModel): boolean {
  return (
    !!node.elements[0] && staticString(node.elements[0], model)?.toLowerCase() === "user-agent"
  );
}

function analyzeNetworkIdentity(model: ProjectModel, sourceUnit: SourceUnit): Violation[] {
  const violations: Violation[] = [];
  const canonicalSymbols = canonicalUserAgentSymbols(model, sourceUnit.sourceFile);
  const userAgentMessage = "direct fetch User-Agent must use inline USER_AGENT from @/config/site";
  walk(sourceUnit.sourceFile, (node) => {
    if (ts.isIdentifier(node) && ["MEDIAPART_EMAIL", "MEDIAPART_PASSWORD"].includes(node.text)) {
      violations.push(problem(sourceUnit, node, "publisher credential reference"));
    }
    if (ts.isStringLiteralLike(node) && node.text.includes("login_check")) {
      violations.push(problem(sourceUnit, node, "publisher login endpoint"));
    }
    if (sourceUnit.file === HTTP_CLIENT_MODULE) return;
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name, model)?.toLowerCase() === "user-agent" &&
      !isCanonicalFetchUserAgent(node, model, canonicalSymbols)
    ) {
      violations.push(problem(sourceUnit, node, userAgentMessage));
    }
    if (
      ts.isCallExpression(node) &&
      ["set", "append"].includes(memberName(node.expression, model) ?? "")
    ) {
      const name = node.arguments[0] ? staticString(node.arguments[0], model) : null;
      if (name?.toLowerCase() === "user-agent") {
        violations.push(problem(sourceUnit, node, userAgentMessage));
      }
    }
    if (ts.isArrayLiteralExpression(node) && isUserAgentTuple(node, model)) {
      violations.push(problem(sourceUnit, node, userAgentMessage));
    }
  });
  return violations;
}

function sensitivePublicName(name: string | null): boolean {
  return (
    !!name &&
    name.startsWith("NEXT_PUBLIC_") &&
    SECRET_MARKERS.some((marker) => name.includes(marker))
  );
}

function analyzePublicEnv(model: ProjectModel, sourceUnit: SourceUnit): Violation[] {
  const violations: Violation[] = [];
  const reported = new Set<string>();
  const check = (name: string | null, node: ts.Node): void => {
    if (!sensitivePublicName(name)) return;
    const key = `${node.getStart(sourceUnit.sourceFile)}:${name}`;
    if (reported.has(key)) return;
    reported.add(key);
    violations.push(problem(sourceUnit, node, `secret-like public env ${name}`));
  };
  walk(sourceUnit.sourceFile, (node) => {
    if (ts.isIdentifier(node)) check(node.text, node);
    if (ts.isPropertyAccessExpression(node)) check(node.name.text, node.name);
    if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      check(staticString(node.argumentExpression, model), node.argumentExpression);
    }
    if (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) {
      check(propertyName(node.name, model), node.name);
    }
    if (ts.isBindingElement(node)) {
      const nameNode = node.propertyName ?? node.name;
      const name = node.propertyName
        ? propertyName(node.propertyName, model)
        : ts.isIdentifier(node.name)
          ? node.name.text
          : null;
      check(name, nameNode);
    }
  });
  return violations;
}

function validateEnvExample(root: string): Violation[] {
  const file = path.join(root, ".env.example");
  assertReadableMode(file, false);
  const violations: Violation[] = [];
  fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const value = raw.trim();
      if (!value || value.startsWith("#") || !value.includes("=")) return;
      const name = value.split("=", 1)[0]!.trim();
      if (sensitivePublicName(name)) {
        violations.push({
          file: ".env.example",
          line: index + 1,
          message: `secret-like public env ${name}`,
        });
      }
    });
  return violations;
}

function jsxAttributeName(attribute: ts.JsxAttribute): string {
  return attribute.name.getText();
}

function bindingIdentifierSymbol(
  identifier: ts.Identifier,
  model: ProjectModel
): ts.Symbol | undefined {
  return ts.isShorthandPropertyAssignment(identifier.parent)
    ? model.checker.getShorthandAssignmentValueSymbol(identifier.parent)
    : model.checker.getSymbolAtLocation(identifier);
}

function assignmentTargetsSymbol(
  expression: ts.Expression,
  symbol: ts.Symbol,
  model: ProjectModel
): boolean {
  const target = unwrap(expression);
  if (ts.isIdentifier(target)) return bindingIdentifierSymbol(target, model) === symbol;
  if (ts.isObjectLiteralExpression(target)) {
    return target.properties.some((property) => {
      if (ts.isShorthandPropertyAssignment(property)) {
        return bindingIdentifierSymbol(property.name, model) === symbol;
      }
      if (ts.isPropertyAssignment(property)) {
        return assignmentTargetsSymbol(property.initializer, symbol, model);
      }
      return ts.isSpreadAssignment(property)
        ? assignmentTargetsSymbol(property.expression, symbol, model)
        : false;
    });
  }
  if (ts.isArrayLiteralExpression(target)) {
    return target.elements.some(
      (element) => ts.isExpression(element) && assignmentTargetsSymbol(element, symbol, model)
    );
  }
  return false;
}

function validateJsonLd(model: ProjectModel, sourceUnit: SourceUnit): Violation[] {
  const bindings: ts.Node[] = [];
  const topLevel: ts.VariableDeclaration[] = [];
  for (const statement of sourceUnit.sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "safeJsonLd") {
        topLevel.push(declaration);
      }
    }
  }
  walk(sourceUnit.sourceFile, (node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "safeJsonLd"
    ) {
      bindings.push(node);
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === "safeJsonLd") bindings.push(node);
  });
  if (bindings.length !== 1) {
    return [
      { file: sourceUnit.file, line: 1, message: "safeJsonLd must be unique and unshadowed" },
    ];
  }
  if (topLevel.length !== 1) {
    return [
      {
        file: sourceUnit.file,
        line: 1,
        message: "safeJsonLd must be one top-level const function",
      },
    ];
  }
  const helper = topLevel[0]!;
  const declarationList = helper.parent;
  const initializer = helper.initializer ? unwrap(helper.initializer) : null;
  if (
    !ts.isVariableDeclarationList(declarationList) ||
    !(declarationList.flags & ts.NodeFlags.Const) ||
    !initializer ||
    (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer))
  ) {
    return [problem(sourceUnit, helper, "safeJsonLd must be one top-level const function")];
  }
  const helperSymbol = model.checker.getSymbolAtLocation(helper.name);
  if (!helperSymbol) {
    return [problem(sourceUnit, helper, "safeJsonLd canonical symbol is missing")];
  }
  const violations: Violation[] = [];
  walk(sourceUnit.sourceFile, (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      assignmentTargetsSymbol(node.left, helperSymbol, model)
    ) {
      violations.push(problem(sourceUnit, node, "safeJsonLd must not be reassigned"));
    }
  });
  const statement = declarationList.parent;
  const javascript = ts.transpileModule(
    `${statement.getText(sourceUnit.sourceFile)}\n(globalThis as any).__safe = safeJsonLd;`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }
  ).outputText;
  const sandbox: { __safe?: (data: object) => string } = {};
  Function("globalThis", javascript)(sandbox);
  const serialized = sandbox.__safe?.({
    value: "</script><script>x</script></SCRIPT></ScRiPt>",
  });
  if (!serialized || serialized.toLowerCase().includes("</script")) {
    violations.push(
      problem(sourceUnit, helper, "safeJsonLd does not neutralize every script closing tag")
    );
  }
  walk(sourceUnit.sourceFile, (node) => {
    if (!ts.isJsxAttribute(node) || jsxAttributeName(node) !== "dangerouslySetInnerHTML") {
      return;
    }
    const expression =
      node.initializer && ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : undefined;
    const object = expression ? objectLiteral(expression, model) : null;
    const html = object ? objectProperty(object, "__html", model) : undefined;
    const value = html ? resolveExpression(html, model) : null;
    const callee = value && ts.isCallExpression(value) ? unwrap(value.expression) : null;
    if (
      !callee ||
      !ts.isIdentifier(callee) ||
      bindingIdentifierSymbol(callee, model) !== helperSymbol
    ) {
      violations.push(problem(sourceUnit, node, "JSON-LD sink must directly call safeJsonLd"));
    }
  });
  return violations;
}

function analyzeHtml(model: ProjectModel, sourceUnit: SourceUnit): Violation[] {
  if (sourceUnit.file === JSON_LD_MODULE) return validateJsonLd(model, sourceUnit);
  const violations: Violation[] = [];
  walk(sourceUnit.sourceFile, (node) => {
    if (ts.isJsxAttribute(node) && jsxAttributeName(node) === "dangerouslySetInnerHTML") {
      violations.push(
        problem(sourceUnit, node, "dangerouslySetInnerHTML outside canonical JsonLd")
      );
    }
  });
  return violations;
}

function analyzeUnsafeRaw(model: ProjectModel, sourceUnit: SourceUnit): Violation[] {
  const violations: Violation[] = [];
  walk(sourceUnit.sourceFile, (node) => {
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      memberName(node, model) === "$executeRawUnsafe"
    ) {
      violations.push(problem(sourceUnit, node, "$executeRawUnsafe forbidden"));
    }
  });
  return violations;
}

function repositoryViolations(model: ProjectModel): Violation[] {
  const violations = [...analyzePublicJson(model), ...analyzeAdminRoutes(model)];
  for (const sourceUnit of model.units.values()) {
    if (sourceUnit.test) continue;
    violations.push(...analyzePublicationUnit(model, sourceUnit));
    violations.push(...analyzeNetworkIdentity(model, sourceUnit));
    violations.push(...analyzePublicEnv(model, sourceUnit));
    violations.push(...analyzeUnsafeRaw(model, sourceUnit));
    if (sourceUnit.file.endsWith(".tsx")) violations.push(...analyzeHtml(model, sourceUnit));
  }
  violations.push(...validateProposalBuilder(model));
  const packageJson = fs.readFileSync(path.join(model.root, "package.json"), "utf8");
  violations.push(...analyzeImporterGraph(model, importerEntries(model, packageJson)));
  violations.push(...validateEnvExample(model.root));
  return violations;
}

/**
 * Timeout for the two cases that call `expectCompiles`.
 *
 * `ts.createProgram` is fully synchronous, so it blocks the worker event loop and vitest can only
 * notice the overrun once the case returns. The first program built in a worker also pays a
 * one-time cost that the second does not: parsing the default ES2022 lib set and warming the
 * TypeScript parser, binder, and checker code paths.
 *
 * Measured on 14 cores, per case: 621ms and 445ms with the machine idle. Under a deliberate 40-way
 * CPU load (about 3x oversubscription, harsher than a real full-suite run) whichever case runs
 * first reaches 5.9s while the second stays at 2.3s, so the default 5s timeout is not enough. 30s
 * leaves roughly 5x headroom over that worst measurement while still failing fast if a compile
 * ever genuinely hangs, which is what this timeout is for: the real budget is under a second.
 */
const COMPILE_CASE_TIMEOUT_MS = 30_000;

function expectCompiles(files: Record<string, string>): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci01-compile-"));
  try {
    const rootNames: string[] = [];
    for (const [file, source] of Object.entries(files)) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
      rootNames.push(target);
    }
    const program = ts.createProgram({
      rootNames,
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
        // Without an explicit empty list, TypeScript auto-includes every @types package it finds
        // by walking up from process.cwd(), so this two-file fixture pulled the repository's whole
        // ambient type surface into the program: 593 source files instead of 65, about 1.2s of
        // synchronous work per call. Under parallel vitest workers that blew past the 5s test
        // timeout. The fixtures reference no ambient package type, and dropping them only removes
        // declarations, so a clean compile here is a strictly stronger result than before.
        types: [],
      },
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    expect(diagnostics).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function messages(violations: Violation[]): string {
  return violations.map((violation) => violation.message).join("\n");
}

function jsonFixture(route: string, helper?: string): ProjectModel {
  return fixtureModel({
    "src/app/api/example/route.ts": route,
    "src/lib/api/safe-json.ts":
      "export function safeJsonParse(raw:string):unknown { try{return JSON.parse(raw)}catch{return null} }",
    ...(helper ? { "src/lib/api/untrusted-parser.ts": helper } : {}),
  });
}

function prismaFixture(
  source: string,
  file = "src/demo.ts"
): {
  model: ProjectModel;
  sourceUnit: SourceUnit;
} {
  const model = fixtureModel({
    [file]: `declare const db:any; declare const tx:any; declare const raw:any;\n${source}`,
  });
  return { model, sourceUnit: unit(model, file) };
}

function jsonLdFixture(source: string): Violation[] {
  const model = fixtureModel({ [JSON_LD_MODULE]: source });
  return validateJsonLd(model, unit(model, JSON_LD_MODULE));
}

describe("CI-01 fail-closed filesystem and parser", () => {
  it("rejects missing roots, unreadable entries, symlinks, and symlink loops", () => {
    expect(() => loadRepository("/definitely/missing/ci01-root")).toThrow();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci01-fs-"));
    const src = path.join(root, "src");
    const scripts = path.join(root, "scripts");
    fs.mkdirSync(src);
    fs.mkdirSync(scripts);
    const lockedDirectory = path.join(src, "locked");
    fs.mkdirSync(lockedDirectory);
    fs.writeFileSync(path.join(lockedDirectory, "bad.ts"), "export const x = 1");
    fs.chmodSync(lockedDirectory, 0o000);
    try {
      expect(() => loadRepository(root)).toThrow(/directory is not readable/);
    } finally {
      fs.chmodSync(lockedDirectory, 0o700);
    }
    const lockedFile = path.join(src, "locked.ts");
    fs.writeFileSync(lockedFile, "export const x = 1");
    fs.chmodSync(lockedFile, 0o000);
    try {
      expect(() => loadRepository(root)).toThrow(/file is not readable/);
    } finally {
      fs.chmodSync(lockedFile, 0o600);
    }
    fs.symlinkSync(lockedFile, path.join(src, "link.ts"));
    expect(() => loadRepository(root)).toThrow(/symlink in guard scan root/);
    fs.rmSync(path.join(src, "link.ts"));
    fs.symlinkSync(src, path.join(src, "loop"));
    expect(() => loadRepository(root)).toThrow(/symlink in guard scan root/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects TypeScript parse errors and accepts valid TS and TSX", () => {
    expect(() => fixtureModel({ "src/bad.ts": "export const =" })).toThrow(
      /TypeScript parse error/
    );
    expect(() =>
      fixtureModel({
        "src/good.ts": "export const value: number = 1",
        "src/good.tsx": "export const View = () => <div>ok</div>",
      })
    ).not.toThrow();
  });
});

describe("CI-01 public JSON contract", () => {
  const nativeCases = [
    "const parser = { parse: JSON.parse }; parser.parse(raw);",
    "const j = JSON; const parser = { parse: j.parse }; parser.parse(raw);",
    "const JSON = globalThis.JSON; JSON.parse(raw);",
    "const { parse } = JSON; parse(raw);",
    "const parseJson = JSON.parse; parseJson(raw);",
    "const parser = JSON.parse.bind(JSON); parser(raw);",
  ];

  it.each(nativeCases)("rejects native parser alias: %s", (body) => {
    const model = jsonFixture(`declare const raw:string; ${body}`);
    expect(messages(analyzePublicJson(model))).toContain("native JSON.parse");
  });

  it("follows imported local helpers from a public route", () => {
    const model = jsonFixture(
      'import { parseBody } from "@/lib/api/untrusted-parser"; declare const raw:string; export const GET=()=>parseBody(raw);',
      "export function parseBody(raw:string){ return JSON.parse(raw) }"
    );
    const violations = analyzePublicJson(model);
    expect(formatViolations(violations)).toContain(
      "src/lib/api/untrusted-parser.ts:1 native JSON.parse in public API module graph"
    );
  });

  it("follows re-exports and literal dynamic imports", () => {
    const model = fixtureModel({
      "src/app/api/example/route.ts":
        'export { parseBody as GET } from "@/lib/api/barrel"; void import("@/lib/api/dynamic")',
      "src/lib/api/barrel.ts": 'export { parseBody } from "./untrusted-parser"',
      "src/lib/api/untrusted-parser.ts":
        "export function parseBody(raw:string){ return JSON.parse(raw) }",
      "src/lib/api/dynamic.ts": "export const parse = (raw:string) => JSON.parse(raw)",
    });
    const formatted = formatViolations(analyzePublicJson(model));
    expect(formatted).toContain("src/lib/api/untrusted-parser.ts");
    expect(formatted).toContain("src/lib/api/dynamic.ts");
  });

  it(
    "accepts the canonical helper through a compilable alias import",
    () => {
      const route =
        'import { safeJsonParse } from "@/lib/api/safe-json"; declare const raw:string; const parsed = safeJsonParse(raw); void parsed;';
      const safe =
        "export function safeJsonParse(raw:string):unknown { try{return JSON.parse(raw)}catch{return null} }";
      const model = fixtureModel({
        "src/app/api/example/route.ts": route,
        "src/lib/api/safe-json.ts": safe,
      });
      expect(analyzePublicJson(model)).toEqual([]);
      expectCompiles({
        "src/app/api/example/route.ts": route,
        "src/lib/api/safe-json.ts": safe,
      });
    },
    COMPILE_CASE_TIMEOUT_MS
  );
});

describe("CI-01 admin authentication contract", () => {
  function analyze(source: string): Violation[] {
    const model = fixtureModel({ "src/app/api/admin/example/route.ts": source });
    return analyzeAdminRoute(model, unit(model, "src/app/api/admin/example/route.ts"));
  }

  it("checks every method and ignores a protected lure", () => {
    const violations = analyze(
      'import {withAdminAuth} from "@/lib/api/with-admin-auth"; const lure=withAdminAuth(handler); export const GET=withAdminAuth(handler); export const POST=async()=>secretResponse();'
    );
    expect(messages(violations)).toContain("POST must directly call canonical withAdminAuth");
  });

  it("rejects named and wildcard handler re-exports", () => {
    expect(messages(analyze('export { GET } from "./handlers"'))).toContain(
      "admin HTTP handler re-export is forbidden"
    );
    expect(messages(analyze('export * from "./handlers"'))).toContain(
      "admin route wildcard re-export is forbidden"
    );
  });

  it(
    "accepts imported aliases and nested validation in compilable TypeScript",
    () => {
      const route =
        'import {withAdminAuth as secure} from "@/lib/api/with-admin-auth"; declare const schema:unknown; declare const withValidation:(s:unknown,h:()=>Promise<Response>)=>()=>Promise<Response>; export const POST=secure(withValidation(schema,async()=>Response.json({ok:true})));';
      const auth =
        "export function withAdminAuth<T extends (...args:any[])=>any>(handler:T):T{return handler}";
      const model = fixtureModel({
        "src/app/api/admin/example/route.ts": route,
        "src/lib/api/with-admin-auth.ts": auth,
      });
      expect(analyzeAdminRoutes(model)).toEqual([]);
      expectCompiles({
        "src/app/api/admin/example/route.ts": route,
        "src/lib/api/with-admin-auth.ts": auth,
      });
    },
    COMPILE_CASE_TIMEOUT_MS
  );
});

describe("CI-01 Affair and Measure publication contract", () => {
  it("rejects delegate destructuring, aliases, bind, and computed PUBLISHED data", () => {
    const cases = [
      "const {affair}=db; affair.update({data:{publicationStatus:'PUBLISHED'}})",
      "const delegate=db.affair; delegate.create({data:{publicationStatus:'PUBLISHED'}})",
      "const delegate=db.affair; const update=delegate.update.bind(delegate); update({data:{publicationStatus:'PUBLISHED'}})",
      "const status=PublicationStatus.PUBLISHED; const data={publicationStatus:status}; db.affair.update({data})",
      "db.affair.upsert({create:{publicationStatus:'DRAFT'},update:{['publicationStatus']:'PUBLISHED'}})",
      "const makeImportedData=()=>({publicationStatus:'ARCHIVED'}); db.affair.update({data:makeImportedData()})",
    ];
    for (const source of cases) {
      const fixture = prismaFixture(
        "declare const PublicationStatus:{PUBLISHED:string}; " + source
      );
      expect(analyzePublicationUnit(fixture.model, fixture.sourceUnit), source).not.toEqual([]);
    }
  });

  it("covers both models, db/tx aliases, and every critical mutation", () => {
    const calls: string[] = ["const transaction=tx;"];
    for (const criticalModel of ["affair", "measure"]) {
      for (const rootName of ["db", "tx", "transaction"]) {
        for (const method of MUTATION_METHODS) {
          const payload =
            method === "upsert"
              ? "{create:{publicationStatus:'DRAFT'},update:{publicationStatus:'PUBLISHED'}}"
              : method === "createMany"
                ? "{data:[{publicationStatus:'PUBLISHED'}]}"
                : "{data:{publicationStatus:'PUBLISHED'}}";
          calls.push(`${rootName}.${criticalModel}.${method}(${payload});`);
        }
      }
    }
    const fixture = prismaFixture(calls.join("\n"));
    const violations = analyzePublicationUnit(fixture.model, fixture.sourceUnit).filter(
      (violation) => violation.message.includes("PUBLISHED transition")
    );
    expect(violations).toHaveLength(2 * 3 * MUTATION_METHODS.size);
    expect(messages(violations)).toContain("direct affair PUBLISHED transition");
    expect(messages(violations)).toContain("direct measure PUBLISHED transition");
  });

  it("accepts non-PUBLISHED critical transitions and unrelated Politician publication", () => {
    for (const source of [
      "db.affair.update({data:{publicationStatus:'ARCHIVED'}})",
      "db.measure.createMany({data:[{publicationStatus:'DRAFT'}]})",
      "db.politician.update({data:{publicationStatus:'PUBLISHED'}})",
      "if(status==='PUBLISHED') publish(); else db.affair.update({data:{publicationStatus:status}})",
    ]) {
      const fixture = prismaFixture(
        "declare const status:string; declare function publish():void; " + source
      );
      expect(analyzePublicationUnit(fixture.model, fixture.sourceUnit), source).toEqual([]);
    }
  });

  it("accepts only the exact proposal builder and checks its real whitelist", () => {
    const model = fixtureModel({
      "src/demo.ts":
        'import {buildPrismaData} from "@/services/affairs/proposals"; declare const db:any; declare const patch:any; db.affair.update({data:buildPrismaData(patch)})',
      [PROPOSAL_MODULE]:
        'import type {AffairPatch} from "@/lib/security/schemas/affair-proposal"; export function buildPrismaData(patch:AffairPatch){return {...patch}}',
      [PROPOSAL_SCHEMA]:
        'declare const z:any; export type AffairPatch={status?:string}; export const affairPatchSchema=z.strictObject({status:z.string()}); export const PROPOSABLE_FIELDS=Object.freeze(["status"] as const)',
    });
    expect(analyzePublicationUnit(model, unit(model, "src/demo.ts"))).toEqual([]);
    expect(validateProposalBuilder(model)).toEqual([]);

    const unsafe = fixtureModel({
      [PROPOSAL_MODULE]:
        'import type {AffairPatch} from "@/lib/security/schemas/affair-proposal"; export function buildPrismaData(patch:AffairPatch){return {...patch}}',
      [PROPOSAL_SCHEMA]:
        'declare const z:any; export type AffairPatch={publicationStatus?:string}; export const affairPatchSchema=z.strictObject({publicationStatus:z.string()}); export const PROPOSABLE_FIELDS=Object.freeze(["publicationStatus"] as const)',
    });
    expect(messages(validateProposalBuilder(unsafe))).toContain(
      "PROPOSABLE_FIELDS must explicitly exclude"
    );
  });
});

describe("CI-01 importer provenance contract", () => {
  function importer(source: string, file = "scripts/sync-demo.ts"): Violation[] {
    const model = fixtureModel({ [file]: `declare const db:any; declare const tx:any; ${source}` });
    return analyzeImporterGraph(model, [file]);
  }

  it("rejects direct, destructured, aliased, and bound Affair creation", () => {
    for (const source of [
      "db.affair.create({data:{title:'x'}})",
      "const {affair}=db; affair.create({data:{title:'x'}})",
      "const delegate=db.affair; delegate.create({data:{title:'x'}})",
      "const create=db.affair.create.bind(db.affair); create({data:{title:'x'}})",
    ]) {
      expect(messages(importer(source)), source).toContain("importer creates Affair directly");
    }
  });

  it("rejects explicit, computed, and opaque verifiedAt data", () => {
    for (const source of [
      "const now=new Date(); const data={verifiedAt:now}; db.affair.update({data})",
      "const key='verifiedAt'; const data={[key]:new Date()}; db.affair.update({data})",
      "declare function importedData():unknown; db.affair.update({data:importedData()})",
    ]) {
      const result = messages(importer(source));
      expect(result, source).toMatch(/verifiedAt/);
    }
  });

  it("derives importer entrypoints from npm command families, not all scripts", () => {
    const model = fixtureModel({
      "scripts/sync-demo.ts": 'import "../src/shared"',
      "scripts/remediate-demo.ts": "db.affair.create({data:{title:'repair'}})",
      "src/shared.ts": "declare const db:any; db.affair.create({data:{title:'x'}})",
      "src/services/sync/permanent.ts": "export const ok=true",
    });
    const packageJson = JSON.stringify({
      scripts: {
        "sync:demo": "tsx scripts/sync-demo.ts",
        "remediate:demo": "tsx scripts/remediate-demo.ts",
      },
    });
    const entries = importerEntries(model, packageJson);
    expect(entries).toContain("scripts/sync-demo.ts");
    expect(entries).toContain("src/services/sync/permanent.ts");
    expect(entries).not.toContain("scripts/remediate-demo.ts");
    expect(formatViolations(analyzeImporterGraph(model, entries))).toContain(
      "src/shared.ts:1 importer creates Affair directly"
    );
  });

  it("accepts the draft service and non-importer remediation path", () => {
    expect(
      importer(
        "declare function createDraftAffairFromDiscovery(x:unknown):void; createDraftAffairFromDiscovery({})"
      )
    ).toEqual([]);
    const model = fixtureModel({
      "scripts/remediate-old.ts":
        "declare const db:any; db.affair.update({data:{verifiedAt:new Date()}})",
    });
    expect(analyzeImporterGraph(model, [])).toEqual([]);
  });
});

describe("CI-01 outbound identity contract", () => {
  function analyze(source: string): Violation[] {
    const model = fixtureModel({ "src/demo.ts": source });
    return analyzeNetworkIdentity(model, unit(model, "src/demo.ts"));
  }

  const diagnostic = "direct fetch User-Agent must use inline USER_AGENT from @/config/site";

  it.each([
    'fetch(url,{headers:{"User-Agent":"Poligraph/1.0"}})',
    'import {USER_AGENT} from "@/other"; fetch(url,{headers:{"User-Agent":USER_AGENT}})',
    'import {USER_AGENT} from "@/config/site"; const headers={"User-Agent":USER_AGENT}; fetch(url,{headers})',
    'import {USER_AGENT} from "@/config/site"; fetch(url,{headers:{...otherHeaders,"User-Agent":USER_AGENT}})',
    'import {USER_AGENT} from "@/config/site"; new Headers({"User-Agent":USER_AGENT})',
    'import {USER_AGENT} from "@/config/site"; const headers=new Headers(); headers.set("User-Agent",USER_AGENT)',
    'import {USER_AGENT} from "@/config/site"; const headers=new Headers(); headers.append("User-Agent",USER_AGENT)',
    'import {USER_AGENT} from "@/config/site"; new Request(url,{headers:{"User-Agent":USER_AGENT}})',
    'import {USER_AGENT} from "@/config/site"; new Headers([["user-agent",USER_AGENT]])',
    'import {USER_AGENT} from "@/config/site"; const values=[["user-agent",USER_AGENT]]; new Headers(values)',
    'const computedValue="Poligraph/1.0"; fetch(url,{headers:{"User-Agent":computedValue}})',
  ])("rejects non-canonical explicit User-Agent syntax: %s", (source) => {
    expect(messages(analyze(source))).toContain(diagnostic);
  });

  it.each([
    'import {USER_AGENT} from "@/config/site"; fetch(url,{signal,headers:{Accept:"text/csv","User-Agent":USER_AGENT}})',
    'import {USER_AGENT as agent} from "@/config/site"; fetch(url,{headers:{"User-Agent":agent}})',
    'fetch(url,{headers:{Accept:"application/json"}})',
    'const value=request.headers.get("user-agent")',
    'const audit={userAgent:"Mozilla/5.0"}',
    "httpClient.get(url)",
  ])("accepts canonical or unrelated forms: %s", (source) => {
    expect(analyze(source)).toEqual([]);
  });

  it.each(["MEDIAPART_EMAIL", "MEDIAPART_PASSWORD"])(
    "rejects publisher credential reference %s",
    (credential) => {
      const violations = analyze(
        `declare const ${credential}: string; const value = ${credential};`
      );

      expect(messages(violations)).toContain("publisher credential reference");
    }
  );

  it("rejects publisher login endpoints", () => {
    const violations = analyze('const endpoint = "https://example.test/login_check";');

    expect(messages(violations)).toContain("publisher login endpoint");
  });

  it("accepts neighboring publisher names and ordinary login endpoints", () => {
    expect(
      analyze(`
        const MEDIAPART_FEED_URL = "https://example.test/feed";
        const endpoint = "https://example.test/login";
      `)
    ).toEqual([]);
  });
});

describe("CI-01 unsafe raw contract", () => {
  function analyze(source: string): Violation[] {
    const model = fixtureModel({ "src/demo.ts": source });
    return analyzeUnsafeRaw(model, unit(model, "src/demo.ts"));
  }

  it.each([
    "declare const db:any; db.$executeRawUnsafe('DELETE FROM demo')",
    "declare const db:any; db['$executeRawUnsafe']('DELETE FROM demo')",
    "declare const db:any; const method='$executeRawUnsafe'; db[method]('DELETE FROM demo')",
  ])("rejects unsafe raw member access: %s", (source) => {
    const violations = analyze(source);
    expect(messages(violations)).toContain("$executeRawUnsafe forbidden");
  });

  it.each([
    "declare const db:any; declare const query:unknown; db.$executeRaw(query)",
    "declare const db:any; declare const query:unknown; db['$executeRaw'](query)",
    "const text='$executeRawUnsafe'",
  ])("accepts safe raw and isolated string forms: %s", (source) => {
    expect(analyze(source)).toEqual([]);
  });
});

describe("CI-01 NEXT_PUBLIC secret contract", () => {
  function analyze(source: string): Violation[] {
    const model = fixtureModel({ "src/demo.ts": source });
    return analyzePublicEnv(model, unit(model, "src/demo.ts"));
  }

  it.each([
    ["env.NEXT_PUBLIC_PRIVATE_KEY", "NEXT_PUBLIC_PRIVATE_KEY"],
    ["const {NEXT_PUBLIC_TOKEN}=anything", "NEXT_PUBLIC_TOKEN"],
    ["const [NEXT_PUBLIC_PASSWORD]=values", "NEXT_PUBLIC_PASSWORD"],
    ["const NEXT_PUBLIC_SECRET=value", "NEXT_PUBLIC_SECRET"],
    ["const object={NEXT_PUBLIC_CREDENTIAL:value}", "NEXT_PUBLIC_CREDENTIAL"],
    ['const key="NEXT_PUBLIC_"+"API_KEY"; object[key]', "NEXT_PUBLIC_API_KEY"],
    ['object[`NEXT_PUBLIC_${"PRIVATE_KEY"}`]', "NEXT_PUBLIC_PRIVATE_KEY"],
  ])("rejects statically determined secret-like key: %s", (source, expectedName) => {
    expect(messages(analyze(source))).toContain(`secret-like public env ${expectedName}`);
  });

  it.each([
    "process.env.NEXT_PUBLIC_SITE_URL",
    "object.NEXT_PUBLIC_PUBLIC_API_URL",
    'process.env["NEXT_PUBLIC_"+runtime]',
    "const key=`NEXT_PUBLIC_${runtime}`; object[key]",
    "// process.env.NEXT_PUBLIC_PRIVATE_KEY\nconst safe=process.env.NEXT_PUBLIC_SITE_URL",
  ])("accepts non-sensitive, commented, or runtime-unknown names: %s", (source) => {
    expect(analyze(source)).toEqual([]);
  });

  it("covers .env.example without treating comments as keys", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci01-env-"));
    const env = path.join(root, ".env.example");
    fs.writeFileSync(env, "# NEXT_PUBLIC_PRIVATE_KEY=x\nNEXT_PUBLIC_SITE_URL=x\n");
    expect(validateEnvExample(root)).toEqual([]);
    fs.writeFileSync(env, "NEXT_PUBLIC_PRIVATE_KEY=x\n");
    expect(messages(validateEnvExample(root))).toContain("NEXT_PUBLIC_PRIVATE_KEY");
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("CI-01 JSON-LD contract", () => {
  const helper =
    'const safeJsonLd=(data:object):string=>JSON.stringify(data).replace(/<\\/script/gi,"<\\\\/script");';
  const safe = `${helper} export function JsonLd(){return <script dangerouslySetInnerHTML={{__html:safeJsonLd({x:1})}}/>}`;

  it("accepts the direct canonical serializer and multiple mixed-case payloads", () => {
    expect(jsonLdFixture(safe)).toEqual([]);
  });

  it("rejects removing or weakening the replacement", () => {
    expect(
      messages(
        jsonLdFixture(
          "const safeJsonLd=(data:object):string=>JSON.stringify(data); export function JsonLd(){return <script dangerouslySetInnerHTML={{__html:safeJsonLd({x:1})}}/>}"
        )
      )
    ).toContain("does not neutralize every script closing tag");
    expect(
      messages(
        jsonLdFixture(
          'const safeJsonLd=(data:object):string=>JSON.stringify(data).replace("</script>","<\\/script>"); export function JsonLd(){return <script dangerouslySetInnerHTML={{__html:safeJsonLd({x:1})}}/>}'
        )
      )
    ).toContain("does not neutralize every script closing tag");
  });

  it.each([
    `${safe}\nsafeJsonLd=other`,
    `${safe}\n(safeJsonLd as any)=other`,
    `${safe}\nsafeJsonLd ||= other`,
    `${safe}\nsafeJsonLd ??= other`,
    `${safe}\n({safeJsonLd}=object)`,
  ])("rejects later writes to the canonical symbol: %s", (source) => {
    expect(messages(jsonLdFixture(source))).toContain("safeJsonLd must not be reassigned");
  });

  it("requires one top-level const function and rejects shadowing", () => {
    expect(
      messages(
        jsonLdFixture(
          'function safeJsonLd(data:object){return JSON.stringify(data).replace(/<\\/script/gi,"<\\\\/script")}; export function JsonLd(){return <script dangerouslySetInnerHTML={{__html:safeJsonLd({x:1})}}/>}'
        )
      )
    ).toContain("safeJsonLd must be one top-level const function");
    expect(
      messages(jsonLdFixture(`${safe}\nconst safeJsonLd=(value:object)=>JSON.stringify(value)`))
    ).toContain("safeJsonLd must be unique and unshadowed");
    expect(
      messages(jsonLdFixture(`${safe}\nfunction other(safeJsonLd:unknown){return safeJsonLd}`))
    ).toContain("safeJsonLd must be unique and unshadowed");
  });

  it("rejects unrelated sinks and sinks outside the canonical component", () => {
    expect(
      messages(
        jsonLdFixture(
          `${helper} function other(data:object){return JSON.stringify(data)}; export function JsonLd(){return <script dangerouslySetInnerHTML={{__html:other({x:1})}}/>}`
        )
      )
    ).toContain("JSON-LD sink must directly call safeJsonLd");
    expect(
      messages(
        jsonLdFixture(
          `${helper} export function JsonLd(){return <script dangerouslySetInnerHTML={{__html:JSON.stringify({x:1})}}/>}`
        )
      )
    ).toContain("JSON-LD sink must directly call safeJsonLd");
    const model = fixtureModel({
      "src/components/Unsafe.tsx":
        "export function Unsafe(){return <div dangerouslySetInnerHTML={{__html:'x'}}/>}",
    });
    expect(messages(analyzeHtml(model, unit(model, "src/components/Unsafe.tsx")))).toContain(
      "dangerouslySetInnerHTML outside canonical JsonLd"
    );
  });
});

describe("CI-01 repository contract", () => {
  it("holds the documented CI-01 invariants on the complete repository", () => {
    const model = loadRepository(ROOT);
    const violations = repositoryViolations(model);
    expect(formatViolations(violations), formatViolations(violations)).toBe("");
    // The scan takes about 5 seconds alone and 65 seconds under the full suite's CPU contention.
  }, 90_000);
});
