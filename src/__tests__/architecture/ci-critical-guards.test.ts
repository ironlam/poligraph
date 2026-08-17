import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const MUTATION_METHODS = new Set(["create", "createMany", "update", "updateMany", "upsert"]);
const FORBIDDEN_PUBLIC_MARKERS = [
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "API_KEY",
  "PRIVATE_KEY",
  "CREDENTIAL",
] as const;

interface Violation {
  file: string;
  line: number;
  message: string;
}

type SourceFileWithDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

type ExprEnv = Map<string, ts.Expression | null>;

function parseSource(source: string, fileName = "fixture.ts"): ts.SourceFile {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const diagnostics = (sf as SourceFileWithDiagnostics).parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const message = ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, "\n");
    throw new Error(`TypeScript parse error in ${fileName}: ${message}`);
  }
  return sf;
}

function readSource(file: string): ts.SourceFile {
  const source = fs.readFileSync(file, "utf8");
  return parseSource(source, file);
}

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function isTestPath(file: string): boolean {
  const parts = file.split(path.sep);
  const base = path.basename(file);
  return parts.includes("__tests__") || base.includes(".test.") || base.includes(".spec.");
}

function walkSourceFiles(root: string): string[] {
  const files: string[] = [];

  function visit(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`symlink is not allowed in CI guard scan roots: ${full}`);
      }
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        files.push(full);
      }
    }
  }

  visit(root);
  return files.sort();
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function walk(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  node.forEachChild((child) => walk(child, visitor));
}

function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr;
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

function buildEnv(sf: ts.SourceFile): ExprEnv {
  const env: ExprEnv = new Map();
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    const name = node.name.text;
    if (env.has(name)) {
      env.set(name, null);
    } else {
      env.set(name, node.initializer);
    }
  });
  return env;
}

function resolveExpression(expr: ts.Expression, env: ExprEnv, seen = new Set<string>()): ts.Expression {
  const current = unwrap(expr);
  if (!ts.isIdentifier(current)) return current;
  if (seen.has(current.text)) return current;
  const initializer = env.get(current.text);
  if (!initializer) return current;
  seen.add(current.text);
  return resolveExpression(initializer, env, seen);
}

function staticString(expr: ts.Expression, env: ExprEnv, seen = new Set<string>()): string | null {
  const current = unwrap(expr);
  if (ts.isStringLiteralLike(current)) return current.text;
  if (ts.isIdentifier(current)) {
    if (seen.has(current.text)) return null;
    const initializer = env.get(current.text);
    if (!initializer) return null;
    seen.add(current.text);
    return staticString(initializer, env, seen);
  }
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(current.left, env, new Set(seen));
    const right = staticString(current.right, env, new Set(seen));
    return left !== null && right !== null ? left + right : null;
  }
  if (ts.isTemplateExpression(current)) {
    let value = current.head.text;
    for (const span of current.templateSpans) {
      const part = staticString(span.expression, env, new Set(seen));
      if (part === null) return null;
      value += part + span.literal.text;
    }
    return value;
  }
  return null;
}

function containsStringFragment(expr: ts.Expression, fragment: string): boolean {
  let found = false;
  walk(expr, (node) => {
    if (ts.isStringLiteralLike(node) && node.text.includes(fragment)) found = true;
  });
  return found;
}

function propertyName(name: ts.PropertyName, env: ExprEnv): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) return staticString(name.expression, env);
  return null;
}

function importLocals(sf: ts.SourceFile, moduleName: string, importedName: string): Set<string> {
  const locals = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== moduleName) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === importedName) locals.add(element.name.text);
    }
  }
  return locals;
}

function allImportedLocals(sf: ts.SourceFile, importedName: string): Array<{ module: string; local: string }> {
  const imports: Array<{ module: string; local: string }> = [];
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === importedName) {
        imports.push({ module: statement.moduleSpecifier.text, local: element.name.text });
      }
    }
  }
  return imports;
}

function isProcessEnv(expr: ts.Expression, env: ExprEnv): boolean {
  const current = resolveExpression(expr, env);
  return (
    ts.isPropertyAccessExpression(current) &&
    ts.isIdentifier(current.expression) &&
    current.expression.text === "process" &&
    current.name.text === "env"
  );
}

function isGlobalJson(expr: ts.Expression, env: ExprEnv): boolean {
  const current = resolveExpression(expr, env);
  return ts.isIdentifier(current) && current.text === "JSON" && !env.has("JSON");
}

function elementName(expr: ts.Expression, env: ExprEnv): string | null {
  const current = unwrap(expr);
  if (ts.isPropertyAccessExpression(current)) return current.name.text;
  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    return staticString(current.argumentExpression, env);
  }
  return null;
}

function isJsonParseMember(expr: ts.Expression, env: ExprEnv): boolean {
  const resolved = resolveExpression(expr, env);
  if (ts.isPropertyAccessExpression(resolved)) {
    return resolved.name.text === "parse" && isGlobalJson(resolved.expression, env);
  }
  if (ts.isElementAccessExpression(resolved) && resolved.argumentExpression) {
    return staticString(resolved.argumentExpression, env) === "parse" && isGlobalJson(resolved.expression, env);
  }
  return false;
}

function jsonDestructuredAliases(sf: ts.SourceFile, env: ExprEnv): Set<string> {
  const aliases = new Set<string>();
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name) || !node.initializer) return;
    if (!isGlobalJson(node.initializer, env)) return;
    for (const element of node.name.elements) {
      const imported = element.propertyName
        ? ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName)
          ? element.propertyName.text
          : null
        : ts.isIdentifier(element.name)
          ? element.name.text
          : null;
      if (imported === "parse" && ts.isIdentifier(element.name)) aliases.add(element.name.text);
    }
  });
  return aliases;
}

function analyzePublicJsonSource(source: string, file = "src/app/api/example/route.ts"): Violation[] {
  const sf = parseSource(source, file);
  const env = buildEnv(sf);
  const canonicalImports = importLocals(sf, "@/lib/api/safe-json", "safeJsonParse");
  const importedSafeJson = allImportedLocals(sf, "safeJsonParse");
  const fakeSafeJsonLocals = new Set(
    importedSafeJson.filter((entry) => entry.module !== "@/lib/api/safe-json").map((entry) => entry.local)
  );
  const destructuredAliases = jsonDestructuredAliases(sf, env);
  const violations: Violation[] = [];

  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = unwrap(node.expression);

    if (isJsonParseMember(callee, env)) {
      violations.push({ file, line: lineOf(sf, node), message: "direct JSON.parse is forbidden" });
      return;
    }

    if (ts.isIdentifier(callee)) {
      if (destructuredAliases.has(callee.text)) {
        violations.push({ file, line: lineOf(sf, node), message: "JSON.parse alias is forbidden" });
        return;
      }
      const initializer = env.get(callee.text);
      if (initializer && isJsonParseMember(initializer, env)) {
        violations.push({ file, line: lineOf(sf, node), message: "JSON.parse alias is forbidden" });
        return;
      }
      if (callee.text === "safeJsonParse" && !canonicalImports.has(callee.text)) {
        violations.push({ file, line: lineOf(sf, node), message: "safeJsonParse must come from canonical module" });
        return;
      }
      if (fakeSafeJsonLocals.has(callee.text)) {
        violations.push({ file, line: lineOf(sf, node), message: "safeJsonParse imported from non-canonical module" });
      }
    }
  });

  return violations;
}

function exportedHandlers(sf: ts.SourceFile): Array<{ method: string; initializer: ts.Expression | null; node: ts.Node }> {
  const variables = new Map<string, ts.Expression | null>();
  const functions = new Map<string, ts.FunctionDeclaration>();
  const result: Array<{ method: string; initializer: ts.Expression | null; node: ts.Node }> = [];
  const explicitlyExported = new Map<string, string>();

  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) variables.set(declaration.name.text, declaration.initializer ?? null);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement);
    } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        explicitlyExported.set(element.name.text, element.propertyName?.text ?? element.name.text);
      }
    }
  }

  for (const statement of sf.statements) {
    const isExport = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (ts.isVariableStatement(statement) && isExport) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && HTTP_METHODS.has(declaration.name.text)) {
          result.push({ method: declaration.name.text, initializer: declaration.initializer ?? null, node: declaration });
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) && isExport && statement.name && HTTP_METHODS.has(statement.name.text)) {
      result.push({ method: statement.name.text, initializer: null, node: statement });
    }
  }

  for (const [exported, local] of explicitlyExported) {
    if (!HTTP_METHODS.has(exported)) continue;
    if (variables.has(local)) {
      result.push({ method: exported, initializer: variables.get(local) ?? null, node: sf });
    } else if (functions.has(local)) {
      result.push({ method: exported, initializer: null, node: functions.get(local)! });
    } else {
      result.push({ method: exported, initializer: null, node: sf });
    }
  }

  return result;
}

function analyzeAdminRouteSource(source: string, file = "src/app/api/admin/example/route.ts"): Violation[] {
  if (file === "src/app/api/admin/auth/route.ts") return [];
  const sf = parseSource(source, file);
  const canonicalLocals = importLocals(sf, "@/lib/api/with-admin-auth", "withAdminAuth");
  const env = buildEnv(sf);
  const violations: Violation[] = [];

  for (const handler of exportedHandlers(sf)) {
    const initializer = handler.initializer ? resolveExpression(handler.initializer, env) : null;
    const wrapped =
      initializer !== null &&
      ts.isCallExpression(initializer) &&
      ts.isIdentifier(unwrap(initializer.expression)) &&
      canonicalLocals.has((unwrap(initializer.expression) as ts.Identifier).text);
    if (!wrapped) {
      violations.push({
        file,
        line: lineOf(sf, handler.node),
        message: `${handler.method} must be directly wrapped by canonical withAdminAuth`,
      });
    }
  }

  return violations;
}

function objectPropertyValue(
  object: ts.ObjectLiteralExpression,
  wanted: string,
  env: ExprEnv
): ts.Expression | null | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property)) {
      if (propertyName(property.name, env) === wanted) return property.initializer;
    } else if (ts.isShorthandPropertyAssignment(property) && property.name.text === wanted) {
      return env.get(wanted) ?? null;
    } else if (ts.isSpreadAssignment(property)) {
      const spread = resolveExpression(property.expression, env);
      if (ts.isObjectLiteralExpression(spread)) {
        const nested = objectPropertyValue(spread, wanted, env);
        if (nested !== undefined) return nested;
      }
    }
  }
  return undefined;
}

function resolveObject(expr: ts.Expression, env: ExprEnv): ts.ObjectLiteralExpression | null {
  const resolved = resolveExpression(expr, env);
  return ts.isObjectLiteralExpression(resolved) ? resolved : null;
}

function memberChain(expr: ts.Expression, env: ExprEnv): string[] | null {
  const resolved = resolveExpression(expr, env);
  if (ts.isIdentifier(resolved)) return [resolved.text];
  if (ts.isPropertyAccessExpression(resolved)) {
    const base = memberChain(resolved.expression, env);
    return base ? [...base, resolved.name.text] : null;
  }
  if (ts.isElementAccessExpression(resolved) && resolved.argumentExpression) {
    const base = memberChain(resolved.expression, env);
    const name = staticString(resolved.argumentExpression, env);
    return base && name !== null ? [...base, name] : null;
  }
  return null;
}

function prismaMutation(call: ts.CallExpression, env: ExprEnv): { model: string; method: string } | null {
  const chain = memberChain(call.expression, env);
  if (!chain || chain.length < 3) return null;
  const method = chain.at(-1)!;
  const model = chain.at(-2)!;
  const root = chain[0]!;
  if (!MUTATION_METHODS.has(method) || !["db", "tx"].includes(root)) return null;
  return { model, method };
}

function isKnownPublished(expr: ts.Expression, env: ExprEnv): boolean | null {
  const resolved = resolveExpression(expr, env);
  if (ts.isStringLiteralLike(resolved)) return resolved.text === "PUBLISHED";
  if (ts.isPropertyAccessExpression(resolved)) {
    const chain = memberChain(resolved, env);
    if (chain?.at(-1) === "PUBLISHED") return true;
    if (chain?.at(-1) && chain.at(-1) !== "PUBLISHED") return false;
  }
  return null;
}

function objectCanPublish(object: ts.ObjectLiteralExpression, env: ExprEnv): boolean {
  for (const key of ["data", "update", "create"]) {
    const nestedExpr = objectPropertyValue(object, key, env);
    if (nestedExpr === undefined) continue;
    if (nestedExpr === null) return true;
    const nested = resolveObject(nestedExpr, env);
    if (!nested) return true;
    const status = objectPropertyValue(nested, "publicationStatus", env);
    if (status === undefined) continue;
    if (status === null) return true;
    const published = isKnownPublished(status, env);
    if (published !== false) return true;
  }
  return false;
}

function analyzePublicationSource(source: string, file = "src/services/example.ts"): Violation[] {
  const authorized = new Set(["src/lib/affairs/publish-guard.ts", "src/lib/measures/transitions.ts"]);
  if (authorized.has(file)) return [];
  const sf = parseSource(source, file);
  const env = buildEnv(sf);
  const violations: Violation[] = [];

  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const mutation = prismaMutation(node, env);
    if (!mutation || !["affair", "measure"].includes(mutation.model)) return;
    const first = node.arguments[0];
    if (!first) return;
    const args = resolveObject(first, env);
    if (!args) {
      violations.push({ file, line: lineOf(sf, node), message: "cannot prove mutation args are publication-safe" });
      return;
    }
    if (objectCanPublish(args, env)) {
      violations.push({ file, line: lineOf(sf, node), message: `direct ${mutation.model} publication write` });
    }
  });

  return violations;
}

function analyzeImporterSource(source: string, file = "scripts/import.ts"): Violation[] {
  if (file === "scripts/seed-fixtures.ts" || isTestPath(file)) return [];
  const sf = parseSource(source, file);
  const env = buildEnv(sf);
  const violations: Violation[] = [];

  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const mutation = prismaMutation(node, env);
    if (!mutation) return;
    if (mutation.model === "affair" && ["create", "createMany"].includes(mutation.method)) {
      violations.push({ file, line: lineOf(sf, node), message: "importer must use createDraftAffairFromDiscovery" });
    }
    const first = node.arguments[0];
    const args = first ? resolveObject(first, env) : null;
    if (!args) return;
    for (const key of ["data", "update", "create"]) {
      const dataExpr = objectPropertyValue(args, key, env);
      if (dataExpr === undefined || dataExpr === null) continue;
      const data = resolveObject(dataExpr, env);
      if (!data) continue;
      if (objectPropertyValue(data, "verifiedAt", env) !== undefined) {
        violations.push({ file, line: lineOf(sf, node), message: "importer must not write verifiedAt" });
      }
    }
  });

  return violations;
}

function analyzePressSource(source: string, file = "src/lib/api/example.ts"): Violation[] {
  const sf = parseSource(source, file);
  const env = buildEnv(sf);
  const violations: Violation[] = [];

  walk(sf, (node) => {
    if (ts.isIdentifier(node) && ["MEDIAPART_EMAIL", "MEDIAPART_PASSWORD"].includes(node.text)) {
      violations.push({ file, line: lineOf(sf, node), message: "publisher credential reference" });
      return;
    }
    if (ts.isStringLiteralLike(node) && node.text.includes("login_check")) {
      violations.push({ file, line: lineOf(sf, node), message: "publisher login endpoint" });
      return;
    }
    if (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) return;
    const name = ts.isShorthandPropertyAssignment(node) ? node.name.text : propertyName(node.name, env);
    if (name !== "User-Agent" && name !== "user-agent" && name !== "userAgent") return;
    const valueExpr = ts.isShorthandPropertyAssignment(node) ? env.get(node.name.text) ?? null : node.initializer;
    if (!valueExpr) {
      violations.push({ file, line: lineOf(sf, node), message: "crawler user-agent must be statically identifiable" });
      return;
    }
    const value = staticString(valueExpr, env);
    if (value === null || !value.includes("Poligraph")) {
      violations.push({ file, line: lineOf(sf, node), message: "crawler user-agent must identify Poligraph" });
    }
  });

  return violations;
}

function analyzeNextPublicSource(source: string, file = "src/example.ts"): Violation[] {
  const sf = parseSource(source, file);
  const env = buildEnv(sf);
  const violations: Violation[] = [];

  function checkName(name: string | null, node: ts.Node): void {
    if (!name || !name.startsWith("NEXT_PUBLIC_")) return;
    if (FORBIDDEN_PUBLIC_MARKERS.some((marker) => name.includes(marker))) {
      violations.push({ file, line: lineOf(sf, node), message: `public env name looks secret-bearing: ${name}` });
    }
  }

  walk(sf, (node) => {
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression, env)) {
      checkName(node.name.text, node);
      return;
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression && isProcessEnv(node.expression, env)) {
      const name = staticString(node.argumentExpression, env);
      if (name !== null) {
        checkName(name, node);
      } else if (containsStringFragment(node.argumentExpression, "NEXT_PUBLIC_")) {
        violations.push({ file, line: lineOf(sf, node), message: "dynamic NEXT_PUBLIC env name is not allowed" });
      }
    }
  });

  return violations;
}

function validateJsonLdFile(source: string, file = "src/components/seo/JsonLd.tsx"): Violation[] {
  const sf = parseSource(source, file);
  const env = buildEnv(sf);
  const violations: Violation[] = [];
  const helperDeclarations: ts.FunctionDeclaration[] = [];
  const localBindings: ts.Node[] = [];

  walk(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "safeJsonLd") helperDeclarations.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "safeJsonLd") localBindings.push(node);
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === "safeJsonLd") localBindings.push(node);
  });

  if (helperDeclarations.length !== 1 || localBindings.length !== 0) {
    violations.push({ file, line: 1, message: "JsonLd must have exactly one unshadowed safeJsonLd helper" });
    return violations;
  }

  const helper = helperDeclarations[0]!;
  if (!helper.body) {
    violations.push({ file, line: lineOf(sf, helper), message: "safeJsonLd helper has no body" });
    return violations;
  }

  const helperText = helper.getText(sf);
  const transpiled = ts.transpileModule(`${helperText}\n(globalThis as unknown as { __ciSafeJsonLd?: typeof safeJsonLd }).__ciSafeJsonLd = safeJsonLd;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const sandbox = {} as { __ciSafeJsonLd?: (data: object) => string };
  Function("globalThis", transpiled)(sandbox);
  const helperFn = sandbox.__ciSafeJsonLd;
  if (!helperFn) {
    violations.push({ file, line: lineOf(sf, helper), message: "cannot execute safeJsonLd helper contract" });
    return violations;
  }
  const payload = { value: "</script><script>alert(1)</script>" };
  const serialized = helperFn(payload);
  if (serialized.toLowerCase().includes("</script")) {
    violations.push({ file, line: lineOf(sf, helper), message: "safeJsonLd does not neutralize </script>" });
  }

  walk(sf, (node) => {
    if (!ts.isJsxAttribute(node) || node.name.text !== "dangerouslySetInnerHTML") return;
    const initializer = node.initializer;
    if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) {
      violations.push({ file, line: lineOf(sf, node), message: "dangerouslySetInnerHTML must use object expression" });
      return;
    }
    const object = resolveObject(initializer.expression, env);
    if (!object) {
      violations.push({ file, line: lineOf(sf, node), message: "dangerouslySetInnerHTML value must be inline object" });
      return;
    }
    const html = objectPropertyValue(object, "__html", env);
    const expression = html ? resolveExpression(html, env) : null;
    if (
      !expression ||
      !ts.isCallExpression(expression) ||
      !ts.isIdentifier(unwrap(expression.expression)) ||
      (unwrap(expression.expression) as ts.Identifier).text !== "safeJsonLd"
    ) {
      violations.push({ file, line: lineOf(sf, node), message: "JSON-LD sink must call the unique safeJsonLd helper" });
    }
  });

  return violations;
}

function analyzeDangerousHtmlSource(source: string, file: string): Violation[] {
  if (file === "src/components/seo/JsonLd.tsx") return validateJsonLdFile(source, file);
  const sf = parseSource(source, file);
  const violations: Violation[] = [];
  walk(sf, (node) => {
    if (ts.isJsxAttribute(node) && node.name.text === "dangerouslySetInnerHTML") {
      violations.push({ file, line: lineOf(sf, node), message: "dangerouslySetInnerHTML outside canonical JsonLd" });
    }
  });
  return violations;
}

function formatViolations(violations: Violation[]): string {
  return violations.map((v) => `${v.file}:${v.line} ${v.message}`).join("\n");
}

function repositoryViolations(): Violation[] {
  const violations: Violation[] = [];
  const srcFiles = walkSourceFiles(path.join(ROOT, "src"));
  const scriptFiles = walkSourceFiles(path.join(ROOT, "scripts"));

  for (const file of srcFiles) {
    const rel = relative(file);
    if (isTestPath(file)) continue;
    const source = fs.readFileSync(file, "utf8");

    if (rel.startsWith("src/app/api/") && !rel.startsWith("src/app/api/admin/") && rel.endsWith("/route.ts")) {
      violations.push(...analyzePublicJsonSource(source, rel));
    }
    if (rel.startsWith("src/app/api/admin/") && rel.endsWith("/route.ts")) {
      violations.push(...analyzeAdminRouteSource(source, rel));
    }
    if (file.endsWith(".tsx")) violations.push(...analyzeDangerousHtmlSource(source, rel));
    violations.push(...analyzePublicationSource(source, rel));
    violations.push(...analyzePressSource(source, rel));
    violations.push(...analyzeNextPublicSource(source, rel));

    const sf = parseSource(source, rel);
    walk(sf, (node) => {
      if (ts.isIdentifier(node) && node.text === "$executeRawUnsafe") {
        violations.push({ file: rel, line: lineOf(sf, node), message: "$executeRawUnsafe is forbidden" });
      }
    });
  }

  for (const file of scriptFiles) {
    const rel = relative(file);
    if (isTestPath(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    violations.push(...analyzePublicationSource(source, rel));
    violations.push(...analyzePressSource(source, rel));
    violations.push(...analyzeNextPublicSource(source, rel));
    if (rel.startsWith("scripts/") || rel.startsWith("src/services/sync/")) {
      violations.push(...analyzeImporterSource(source, rel));
    }
  }

  const httpClientPath = path.join(ROOT, "src/lib/api/http-client.ts");
  const httpClientSource = fs.readFileSync(httpClientPath, "utf8");
  const httpClientViolations = analyzePressSource(httpClientSource, "src/lib/api/http-client.ts");
  violations.push(...httpClientViolations);

  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  envExample.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const name = trimmed.split("=", 1)[0]!.trim();
    if (
      name.startsWith("NEXT_PUBLIC_") &&
      FORBIDDEN_PUBLIC_MARKERS.some((marker) => name.includes(marker))
    ) {
      violations.push({ file: ".env.example", line: index + 1, message: `public env name looks secret-bearing: ${name}` });
    }
  });

  return violations;
}

describe("CI-01 critical guard contracts", () => {
  it("fails closed when repository traversal hits an unreadable directory", () => {
    if (process.platform === "win32") return;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ci01-walk-"));
    const locked = path.join(temp, "locked");
    fs.mkdirSync(locked);
    fs.writeFileSync(path.join(locked, "violation.ts"), "db.$executeRawUnsafe('SELECT 1')");
    fs.chmodSync(locked, 0o000);
    try {
      expect(() => walkSourceFiles(temp)).toThrow();
    } finally {
      fs.chmodSync(locked, 0o700);
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects direct and aliased JSON.parse but accepts canonical safeJsonParse import", () => {
    const invalid = [
      `export const GET = () => JSON.parse(raw);`,
      `export const GET = () => JSON["parse"](raw);`,
      `const { parse } = JSON; export const GET = () => parse(raw);`,
      `const parseJson = JSON.parse; export const GET = () => parseJson(raw);`,
      `export const GET = () => JSON?.parse(raw);`,
      `function safeJsonParse(raw: string) { return { success: true, data: JSON.parse(raw) }; } export const GET = () => safeJsonParse(raw);`,
      `import { safeJsonParse } from "./fake"; export const GET = () => safeJsonParse(raw);`,
    ];
    for (const source of invalid) expect(analyzePublicJsonSource(source)).not.toEqual([]);

    const valid = `
      import { safeJsonParse as parseJson } from "@/lib/api/safe-json";
      export const GET = () => parseJson(raw);
    `;
    expect(analyzePublicJsonSource(valid)).toEqual([]);
  });

  it("requires every exported admin handler to be directly wrapped", () => {
    const invalid = `
      import { withAdminAuth } from "@/lib/api/with-admin-auth";
      export const GET = withAdminAuth(handler);
      export const POST = async () => secretResponse();
    `;
    expect(analyzeAdminRouteSource(invalid).some((v) => v.message.startsWith("POST"))).toBe(true);

    const lure = `
      import { withAdminAuth } from "@/lib/api/with-admin-auth";
      const unused = withAdminAuth(handler);
      export const POST = async () => secretResponse();
    `;
    expect(analyzeAdminRouteSource(lure)).not.toEqual([]);

    const valid = `
      import { withAdminAuth as protect } from "@/lib/api/with-admin-auth";
      export const GET = protect(handler);
      export const POST = protect(otherHandler);
    `;
    expect(analyzeAdminRouteSource(valid)).toEqual([]);
  });

  it("ties JSON-LD sinks to the unique helper and tests the helper payload behavior", () => {
    const valid = `
      function safeJsonLd(data: object): string {
        return JSON.stringify(data).replace(/<\\/script/gi, "<\\\\/script");
      }
      export function X() {
        const data = { value: "x" };
        return <script dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
      }
    `;
    expect(validateJsonLdFile(valid)).toEqual([]);

    const unsafeHelper = `
      function safeJsonLd(data: object): string { return JSON.stringify(data); }
      export function X() { return <script dangerouslySetInnerHTML={{ __html: safeJsonLd({ value: "x" }) }} />; }
    `;
    expect(validateJsonLdFile(unsafeHelper)).not.toEqual([]);

    const unsafeSink = `
      function safeJsonLd(data: object): string {
        return JSON.stringify(data).replace(/<\\/script/gi, "<\\\\/script");
      }
      function other(data: object) { return JSON.stringify(data); }
      export function X() { return <script dangerouslySetInnerHTML={{ __html: other({ value: "x" }) }} />; }
    `;
    expect(validateJsonLdFile(unsafeSink)).not.toEqual([]);

    expect(
      analyzeDangerousHtmlSource(
        `export function X() { return <div dangerouslySetInnerHTML={{ __html: sanitize(html) }} />; }`,
        "src/components/JsonLdUnsafe.tsx"
      )
    ).not.toEqual([]);
  });

  it("detects Affair/Measure publication through intermediate data and aliases without blocking Politician", () => {
    const invalid = [
      `const data = { publicationStatus: "PUBLISHED" }; db.affair.update({ where: { id }, data });`,
      `const status = PublicationStatus.PUBLISHED; db.affair.update({ where: { id }, data: { publicationStatus: status } });`,
      `const affairs = db.affair; affairs.update({ where: { id }, data: { publicationStatus: "PUBLISHED" } });`,
      `db.measure.upsert({ where: { id }, create: { publicationStatus: "DRAFT" }, update: { ["publicationStatus"]: "PUBLISHED" } });`,
      `const data = { publicationStatus: value }; db.affair.update({ where: { id }, data });`,
    ];
    for (const source of invalid) expect(analyzePublicationSource(source)).not.toEqual([]);

    expect(
      analyzePublicationSource(
        `db.politician.update({ where: { id }, data: { publicationStatus: PublicationStatus.PUBLISHED } });`
      )
    ).toEqual([]);
    expect(
      analyzePublicationSource(
        `db.affair.update({ where: { id }, data: { publicationStatus: "PUBLISHED" } });`,
        "src/lib/affairs/publish-guard.ts"
      )
    ).toEqual([]);
  });

  it("rejects importer affair creation aliases and verifiedAt writes, with a realistic positive helper case", () => {
    expect(
      analyzeImporterSource(`const affairs = db.affair; affairs.create({ data: affair });`)
    ).not.toEqual([]);
    expect(
      analyzeImporterSource(`const now = new Date(); db.affair.update({ where: { id }, data: { verifiedAt: now } });`)
    ).not.toEqual([]);
    expect(
      analyzeImporterSource(`db.affair.update({ where: { id }, data: { ["verifiedAt"]: new Date() } });`)
    ).not.toEqual([]);
    expect(
      analyzeImporterSource(`await createDraftAffairFromDiscovery(discovery);`)
    ).toEqual([]);
  });

  it("requires every explicit crawler user-agent to identify Poligraph", () => {
    expect(
      analyzePressSource(`const headers = { "User-Agent": "Mozilla/" + "5.0" };`)
    ).not.toEqual([]);
    expect(analyzePressSource(`const options = { userAgent: "curl/8" };`)).not.toEqual([]);
    expect(
      analyzePressSource(`const ua = "Poligraph/1.0 (https://poligraph.fr)"; const options = { userAgent: ua };`)
    ).toEqual([]);
    expect(analyzePressSource(`const x = process.env.MEDIAPART_EMAIL;`)).not.toEqual([]);
  });

  it("detects static and composed NEXT_PUBLIC secret-like names", () => {
    expect(analyzeNextPublicSource(`const x = process.env.NEXT_PUBLIC_PRIVATE_KEY;`)).not.toEqual([]);
    expect(
      analyzeNextPublicSource(`const x = process.env["NEXT_PUBLIC_" + "PRIVATE_KEY"];`)
    ).not.toEqual([]);
    expect(analyzeNextPublicSource(`const x = process.env.NEXT_PUBLIC_SITE_URL;`)).toEqual([]);
  });

  it("holds all critical contracts on the repository", () => {
    const violations = repositoryViolations();
    expect(formatViolations(violations), formatViolations(violations)).toBe("");
  });
});
