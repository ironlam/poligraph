import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const MUTATIONS = new Set(["create", "createMany", "update", "updateMany", "upsert"]);
const SECRET_MARKERS = ["SECRET", "TOKEN", "PASSWORD", "API_KEY", "PRIVATE_KEY", "CREDENTIAL"];
const PUBLICATION_BUILDERS = new Map([
  ["buildPrismaData", "@/services/affairs/proposals"],
]);

type Env = Map<string, ts.Expression | null>;
interface Violation { file: string; line: number; message: string }
type SF = ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] };

function parse(source: string, file = "fixture.ts"): ts.SourceFile {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const diagnostic = (sf as SF).parseDiagnostics?.[0];
  if (diagnostic) {
    throw new Error(`TypeScript parse error in ${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
  }
  return sf;
}

function walk(node: ts.Node, fn: (node: ts.Node) => void): void {
  fn(node);
  node.forEachChild((child) => walk(child, fn));
}

function line(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function testPath(file: string): boolean {
  const parts = file.split(path.sep);
  const name = path.basename(file);
  return parts.includes("__tests__") || name.includes(".test.") || name.includes(".spec.");
}

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symlink in guard scan root: ${full}`);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) found.push(full);
    }
  };
  visit(root);
  return found.sort();
}

function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) || ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) current = current.expression;
  return current;
}

function envFor(sf: ts.SourceFile): Env {
  const env: Env = new Map();
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    if (env.has(node.name.text)) env.set(node.name.text, null);
    else env.set(node.name.text, node.initializer);
  });
  return env;
}

function resolve(expr: ts.Expression, env: Env, seen = new Set<string>()): ts.Expression {
  const current = unwrap(expr);
  if (!ts.isIdentifier(current) || seen.has(current.text)) return current;
  const initializer = env.get(current.text);
  if (!initializer) return current;
  seen.add(current.text);
  return resolve(initializer, env, seen);
}

function staticString(expr: ts.Expression, env: Env, seen = new Set<string>()): string | null {
  const current = unwrap(expr);
  if (ts.isStringLiteralLike(current)) return current.text;
  if (ts.isIdentifier(current)) {
    if (seen.has(current.text)) return null;
    const initializer = env.get(current.text);
    if (!initializer) return null;
    seen.add(current.text);
    return staticString(initializer, env, seen);
  }
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = staticString(current.left, env, new Set(seen));
    const b = staticString(current.right, env, new Set(seen));
    return a === null || b === null ? null : a + b;
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

function propertyName(name: ts.PropertyName, env: Env): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return ts.isComputedPropertyName(name) ? staticString(name.expression, env) : null;
}

function imports(sf: ts.SourceFile, imported: string): Array<{ local: string; module: string }> {
  const result: Array<{ local: string; module: string }> = [];
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      if ((element.propertyName?.text ?? element.name.text) === imported) {
        result.push({ local: element.name.text, module: statement.moduleSpecifier.text });
      }
    }
  }
  return result;
}

function importSet(sf: ts.SourceFile, module: string, imported: string): Set<string> {
  return new Set(imports(sf, imported).filter((x) => x.module === module).map((x) => x.local));
}

function memberChain(expr: ts.Expression, env: Env): string[] | null {
  const current = resolve(expr, env);
  if (ts.isIdentifier(current)) return [current.text];
  if (ts.isPropertyAccessExpression(current)) {
    const base = memberChain(current.expression, env);
    return base ? [...base, current.name.text] : null;
  }
  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    const base = memberChain(current.expression, env);
    const name = staticString(current.argumentExpression, env);
    return base && name !== null ? [...base, name] : null;
  }
  return null;
}

function objectValue(object: ts.ObjectLiteralExpression, wanted: string, env: Env): ts.Expression | null | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name, env) === wanted) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === wanted) return env.get(wanted) ?? null;
    if (ts.isSpreadAssignment(property)) {
      const spread = resolve(property.expression, env);
      if (ts.isObjectLiteralExpression(spread)) {
        const nested = objectValue(spread, wanted, env);
        if (nested !== undefined) return nested;
      }
    }
  }
  return undefined;
}

function objectExpr(expr: ts.Expression, env: Env): ts.ObjectLiteralExpression | null {
  const resolved = resolve(expr, env);
  return ts.isObjectLiteralExpression(resolved) ? resolved : null;
}

function prismaMutation(call: ts.CallExpression, env: Env): { model: string; method: string } | null {
  const chain = memberChain(call.expression, env);
  if (!chain || chain.length < 3 || !["db", "tx"].includes(chain[0]!)) return null;
  const method = chain.at(-1)!;
  const model = chain.at(-2)!;
  return MUTATIONS.has(method) ? { model, method } : null;
}

function isGlobalJson(expr: ts.Expression, env: Env): boolean {
  const value = resolve(expr, env);
  return ts.isIdentifier(value) && value.text === "JSON" && !env.has("JSON");
}

function jsonParseMember(expr: ts.Expression, env: Env): boolean {
  const value = resolve(expr, env);
  if (ts.isPropertyAccessExpression(value)) return value.name.text === "parse" && isGlobalJson(value.expression, env);
  return ts.isElementAccessExpression(value) && !!value.argumentExpression &&
    staticString(value.argumentExpression, env) === "parse" && isGlobalJson(value.expression, env);
}

function analyzeJson(source: string, file = "src/app/api/demo/route.ts"): Violation[] {
  const sf = parse(source, file);
  const env = envFor(sf);
  const canonical = importSet(sf, "@/lib/api/safe-json", "safeJsonParse");
  const fake = new Set(imports(sf, "safeJsonParse").filter((x) => x.module !== "@/lib/api/safe-json").map((x) => x.local));
  const destructured = new Set<string>();
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name) || !node.initializer || !isGlobalJson(node.initializer, env)) return;
    for (const element of node.name.elements) {
      const original = element.propertyName
        ? (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName) ? element.propertyName.text : null)
        : (ts.isIdentifier(element.name) ? element.name.text : null);
      if (original === "parse" && ts.isIdentifier(element.name)) destructured.add(element.name.text);
    }
  });

  const violations: Violation[] = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = unwrap(node.expression);
    if (jsonParseMember(callee, env)) {
      violations.push({ file, line: line(sf, node), message: "direct JSON.parse is forbidden" });
      return;
    }
    if (!ts.isIdentifier(callee)) return;
    const initializer = env.get(callee.text);
    if (destructured.has(callee.text) || (initializer && jsonParseMember(initializer, env))) {
      violations.push({ file, line: line(sf, node), message: "JSON.parse alias is forbidden" });
      return;
    }
    if (callee.text === "safeJsonParse" && !canonical.has(callee.text)) {
      violations.push({ file, line: line(sf, node), message: "safeJsonParse must be canonical" });
      return;
    }
    if (fake.has(callee.text)) violations.push({ file, line: line(sf, node), message: "safeJsonParse imported from wrong module" });
  });
  return violations;
}

function hasExport(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function exportedHandlers(sf: ts.SourceFile): Array<{ method: string; value: ts.Expression | null; node: ts.Node }> {
  const result: Array<{ method: string; value: ts.Expression | null; node: ts.Node }> = [];
  const vars = new Map<string, ts.Expression | null>();
  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) vars.set(declaration.name.text, declaration.initializer ?? null);
        if (hasExport(statement) && ts.isIdentifier(declaration.name) && HTTP_METHODS.has(declaration.name.text)) {
          result.push({ method: declaration.name.text, value: declaration.initializer ?? null, node: declaration });
        }
      }
    }
    if (hasExport(statement) && ts.isFunctionDeclaration(statement) && statement.name && HTTP_METHODS.has(statement.name.text)) {
      result.push({ method: statement.name.text, value: null, node: statement });
    }
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const method = element.name.text;
        if (HTTP_METHODS.has(method)) result.push({ method, value: vars.get(element.propertyName?.text ?? method) ?? null, node: element });
      }
    }
  }
  return result;
}

function analyzeAdmin(source: string, file = "src/app/api/admin/demo/route.ts"): Violation[] {
  if (file === "src/app/api/admin/auth/route.ts") return [];
  const sf = parse(source, file);
  const env = envFor(sf);
  const wrappers = importSet(sf, "@/lib/api/with-admin-auth", "withAdminAuth");
  const violations: Violation[] = [];
  for (const handler of exportedHandlers(sf)) {
    const value = handler.value ? resolve(handler.value, env) : null;
    const callee = value && ts.isCallExpression(value) ? unwrap(value.expression) : null;
    if (!callee || !ts.isIdentifier(callee) || !wrappers.has(callee.text)) {
      violations.push({ file, line: line(sf, handler.node), message: `${handler.method} is not wrapped by canonical withAdminAuth` });
    }
  }
  return violations;
}

function possibleStrings(expr: ts.Expression, env: Env, seen = new Set<string>()): Set<string> | null {
  const value = unwrap(expr);
  if (ts.isStringLiteralLike(value)) return new Set([value.text]);
  if (ts.isIdentifier(value)) {
    if (seen.has(value.text)) return null;
    const init = env.get(value.text);
    if (!init) return null;
    seen.add(value.text);
    return possibleStrings(init, env, seen);
  }
  if (ts.isPropertyAccessExpression(value)) return new Set([value.name.text]);
  if (ts.isElementAccessExpression(value) && value.argumentExpression) {
    const base = resolve(value.expression, env);
    if (ts.isObjectLiteralExpression(base)) {
      const strings = new Set<string>();
      for (const property of base.properties) {
        if (!ts.isPropertyAssignment(property)) return null;
        const possible = possibleStrings(property.initializer, env, new Set(seen));
        if (!possible) return null;
        for (const item of possible) strings.add(item);
      }
      return strings;
    }
  }
  return null;
}

function enclosedByPublishedElse(node: ts.Node, identifier: string): boolean {
  for (let current: ts.Node | undefined = node; current?.parent; current = current.parent) {
    const parent = current.parent;
    if (!ts.isIfStatement(parent) || parent.elseStatement !== current) continue;
    const condition = parent.expression;
    if (!ts.isBinaryExpression(condition) || ![
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
    ].includes(condition.operatorToken.kind)) continue;
    const left = condition.left.getText();
    const right = condition.right.getText();
    if ((left === identifier && /PUBLISHED/.test(right)) || (right === identifier && /PUBLISHED/.test(left))) return true;
  }
  return false;
}

function canonicalBuilder(expr: ts.Expression, sf: ts.SourceFile, env: Env): boolean {
  const value = resolve(expr, env);
  if (!ts.isCallExpression(value) || !ts.isIdentifier(unwrap(value.expression))) return false;
  const name = (unwrap(value.expression) as ts.Identifier).text;
  const module = PUBLICATION_BUILDERS.get(name);
  return !!module && importSet(sf, module, name).has(name);
}

function publicationStatusInData(
  dataExpr: ts.Expression,
  sf: ts.SourceFile,
  env: Env,
  node: ts.Node
): "published" | "safe" | "unknown" {
  if (canonicalBuilder(dataExpr, sf, env)) return "safe";
  const data = objectExpr(dataExpr, env);
  if (!data) return "unknown";
  const status = objectValue(data, "publicationStatus", env);
  if (status === undefined) return "safe";
  if (status === null) return "unknown";
  const possibilities = possibleStrings(status, env);
  if (possibilities) return possibilities.has("PUBLISHED") ? "published" : "safe";
  const resolved = resolve(status, env);
  if (ts.isIdentifier(resolved) && enclosedByPublishedElse(node, resolved.text)) return "safe";
  return "unknown";
}

function analyzePublication(source: string, file = "src/demo.ts"): Violation[] {
  const authorized = new Set(["src/lib/affairs/publish-guard.ts", "src/lib/measures/transitions.ts"]);
  if (authorized.has(file)) return [];
  const sf = parse(source, file);
  const env = envFor(sf);
  const violations: Violation[] = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const mutation = prismaMutation(node, env);
    if (!mutation || !["affair", "measure"].includes(mutation.model)) return;
    const first = node.arguments[0];
    if (!first) return;
    const args = objectExpr(first, env);
    if (!args) {
      violations.push({ file, line: line(sf, node), message: "cannot prove mutation arguments publication-safe" });
      return;
    }
    for (const key of ["data", "update", "create"]) {
      const data = objectValue(args, key, env);
      if (data === undefined) continue;
      if (data === null) {
        violations.push({ file, line: line(sf, node), message: "unknown publication data" });
        continue;
      }
      const verdict = publicationStatusInData(data, sf, env, node);
      if (verdict !== "safe") {
        violations.push({ file, line: line(sf, node), message: verdict === "published" ? `direct ${mutation.model} publication write` : "cannot prove publicationStatus non-PUBLISHED" });
      }
    }
  });
  return violations;
}

function importerPath(file: string): boolean {
  if (file.startsWith("src/services/sync/")) return true;
  if (!file.startsWith("scripts/")) return false;
  return /^(sync|import|discover|enrich|reconcile)-/.test(path.basename(file));
}

function analyzeImporter(source: string, file = "scripts/import-demo.ts"): Violation[] {
  if (file === "scripts/seed-fixtures.ts" || testPath(file)) return [];
  const sf = parse(source, file);
  const env = envFor(sf);
  const violations: Violation[] = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const mutation = prismaMutation(node, env);
    if (!mutation) return;
    if (mutation.model === "affair" && ["create", "createMany"].includes(mutation.method)) {
      violations.push({ file, line: line(sf, node), message: "importer creates Affair directly" });
    }
    if (!importerPath(file)) return;
    const args = node.arguments[0] ? objectExpr(node.arguments[0], env) : null;
    if (!args) return;
    for (const key of ["data", "update", "create"]) {
      const dataExpr = objectValue(args, key, env);
      if (!dataExpr) continue;
      const data = objectExpr(dataExpr, env);
      if (data && objectValue(data, "verifiedAt", env) !== undefined) {
        violations.push({ file, line: line(sf, node), message: "importer writes verifiedAt" });
      }
    }
  });
  return violations;
}

function staticProperty(object: ts.ObjectLiteralExpression, name: string, env: Env): string | null | undefined {
  const value = objectValue(object, name, env);
  if (value === undefined) return undefined;
  if (value === null) return null;
  return staticString(value, env);
}

function analyzeNetworkIdentity(source: string, file = "src/lib/api/demo.ts"): Violation[] {
  const sf = parse(source, file);
  const env = envFor(sf);
  const violations: Violation[] = [];
  walk(sf, (node) => {
    if (ts.isIdentifier(node) && ["MEDIAPART_EMAIL", "MEDIAPART_PASSWORD"].includes(node.text)) {
      violations.push({ file, line: line(sf, node), message: "publisher credential reference" });
    }
    if (ts.isStringLiteralLike(node) && node.text.includes("login_check")) {
      violations.push({ file, line: line(sf, node), message: "publisher login endpoint" });
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "HTTPClient" && node.arguments?.[0]) {
      const options = objectExpr(node.arguments[0], env);
      if (!options) return;
      const ua = staticProperty(options, "userAgent", env);
      if (ua !== undefined && (ua === null || !ua.includes("Poligraph"))) {
        violations.push({ file, line: line(sf, node), message: "HTTPClient userAgent must identify Poligraph" });
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "fetch" && node.arguments[1]) {
      const options = objectExpr(node.arguments[1], env);
      if (!options) return;
      const headersExpr = objectValue(options, "headers", env);
      if (!headersExpr) return;
      const headers = objectExpr(headersExpr, env);
      if (!headers) return;
      for (const name of ["User-Agent", "user-agent"]) {
        const value = staticProperty(headers, name, env);
        if (value !== undefined && (value === null || !value.includes("Poligraph"))) {
          violations.push({ file, line: line(sf, node), message: "fetch User-Agent must identify Poligraph" });
        }
      }
    }
  });
  return violations;
}

function validateHttpClientDefault(source: string): Violation[] {
  const file = "src/lib/api/http-client.ts";
  const sf = parse(source, file);
  const env = envFor(sf);
  const defaults = env.get("DEFAULT_OPTIONS");
  if (!defaults) return [{ file, line: 1, message: "HTTPClient DEFAULT_OPTIONS missing" }];
  const object = objectExpr(defaults, env);
  const ua = object ? staticProperty(object, "userAgent", env) : null;
  return ua?.includes("Poligraph") ? [] : [{ file, line: 1, message: "HTTPClient default userAgent must identify Poligraph" }];
}

function isProcessEnv(expr: ts.Expression, env: Env): boolean {
  const current = resolve(expr, env);
  return ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "process" && current.name.text === "env";
}

function containsString(expr: ts.Expression, fragment: string): boolean {
  let found = false;
  walk(expr, (node) => { if (ts.isStringLiteralLike(node) && node.text.includes(fragment)) found = true; });
  return found;
}

function analyzePublicEnv(source: string, file = "src/demo.ts"): Violation[] {
  const sf = parse(source, file);
  const env = envFor(sf);
  const violations: Violation[] = [];
  const check = (name: string | null, node: ts.Node): void => {
    if (name?.startsWith("NEXT_PUBLIC_") && SECRET_MARKERS.some((marker) => name.includes(marker))) {
      violations.push({ file, line: line(sf, node), message: `secret-like public env ${name}` });
    }
  };
  walk(sf, (node) => {
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression, env)) check(node.name.text, node);
    if (ts.isElementAccessExpression(node) && node.argumentExpression && isProcessEnv(node.expression, env)) {
      const name = staticString(node.argumentExpression, env);
      if (name !== null) check(name, node);
      else if (containsString(node.argumentExpression, "NEXT_PUBLIC_")) {
        violations.push({ file, line: line(sf, node), message: "dynamic NEXT_PUBLIC env name" });
      }
    }
  });
  return violations;
}

function jsxName(attribute: ts.JsxAttribute, sf: ts.SourceFile): string {
  return attribute.name.getText(sf);
}

function validateJsonLd(source: string, file = "src/components/seo/JsonLd.tsx"): Violation[] {
  const sf = parse(source, file);
  const env = envFor(sf);
  const functions: ts.FunctionDeclaration[] = [];
  const shadows: ts.Node[] = [];
  walk(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "safeJsonLd") functions.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "safeJsonLd") shadows.push(node);
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === "safeJsonLd") shadows.push(node);
  });
  if (functions.length !== 1 || shadows.length) return [{ file, line: 1, message: "safeJsonLd must be unique and unshadowed" }];
  const helper = functions[0]!;
  if (!helper.body) return [{ file, line: line(sf, helper), message: "safeJsonLd body missing" }];

  const js = ts.transpileModule(
    `${helper.getText(sf)}\n(globalThis as any).__safe = safeJsonLd;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }
  ).outputText;
  const sandbox: { __safe?: (data: object) => string } = {};
  Function("globalThis", js)(sandbox);
  const serialized = sandbox.__safe?.({ value: "</script><script>alert(1)</script>" });
  const violations: Violation[] = [];
  if (!serialized || serialized.toLowerCase().includes("</script")) {
    violations.push({ file, line: line(sf, helper), message: "safeJsonLd does not neutralize script closing tag" });
  }
  walk(sf, (node) => {
    if (!ts.isJsxAttribute(node) || jsxName(node, sf) !== "dangerouslySetInnerHTML") return;
    const expression = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
    const object = expression ? objectExpr(expression, env) : null;
    const html = object ? objectValue(object, "__html", env) : undefined;
    const value = html ? resolve(html, env) : null;
    const callee = value && ts.isCallExpression(value) ? unwrap(value.expression) : null;
    if (!callee || !ts.isIdentifier(callee) || callee.text !== "safeJsonLd") {
      violations.push({ file, line: line(sf, node), message: "JSON-LD sink must call unique safeJsonLd" });
    }
  });
  return violations;
}

function analyzeHtml(source: string, file: string): Violation[] {
  if (file === "src/components/seo/JsonLd.tsx") return validateJsonLd(source, file);
  const sf = parse(source, file);
  const violations: Violation[] = [];
  walk(sf, (node) => {
    if (ts.isJsxAttribute(node) && jsxName(node, sf) === "dangerouslySetInnerHTML") {
      violations.push({ file, line: line(sf, node), message: "dangerouslySetInnerHTML outside canonical JsonLd" });
    }
  });
  return violations;
}

function repoViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const file of [...sourceFiles(path.join(ROOT, "src")), ...sourceFiles(path.join(ROOT, "scripts"))]) {
    const fileRel = rel(file);
    if (testPath(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    const inSrc = fileRel.startsWith("src/");
    if (fileRel.startsWith("src/app/api/") && !fileRel.startsWith("src/app/api/admin/") && fileRel.endsWith("/route.ts")) {
      violations.push(...analyzeJson(source, fileRel));
    }
    if (fileRel.startsWith("src/app/api/admin/") && fileRel.endsWith("/route.ts")) violations.push(...analyzeAdmin(source, fileRel));
    if (file.endsWith(".tsx")) violations.push(...analyzeHtml(source, fileRel));
    violations.push(...analyzePublication(source, fileRel));
    violations.push(...analyzeNetworkIdentity(source, fileRel));
    violations.push(...analyzePublicEnv(source, fileRel));
    if (fileRel.startsWith("scripts/") || fileRel.startsWith("src/services/sync/")) violations.push(...analyzeImporter(source, fileRel));
    if (inSrc) {
      const sf = parse(source, fileRel);
      walk(sf, (node) => {
        if (ts.isIdentifier(node) && node.text === "$executeRawUnsafe") violations.push({ file: fileRel, line: line(sf, node), message: "$executeRawUnsafe forbidden" });
      });
    }
  }
  violations.push(...validateHttpClientDefault(fs.readFileSync(path.join(ROOT, "src/lib/api/http-client.ts"), "utf8")));

  const proposalSchema = fs.readFileSync(path.join(ROOT, "src/lib/security/schemas/affair-proposal.ts"), "utf8");
  if (!proposalSchema.includes('Deliberately NOT proposable:') || /PROPOSABLE_FIELDS[\s\S]*publicationStatus/.test(proposalSchema)) {
    violations.push({ file: "src/lib/security/schemas/affair-proposal.ts", line: 1, message: "proposal whitelist must exclude publicationStatus" });
  }

  fs.readFileSync(path.join(ROOT, ".env.example"), "utf8").split(/\r?\n/).forEach((raw, index) => {
    const value = raw.trim();
    if (!value || value.startsWith("#") || !value.includes("=")) return;
    const name = value.split("=", 1)[0]!.trim();
    if (name.startsWith("NEXT_PUBLIC_") && SECRET_MARKERS.some((marker) => name.includes(marker))) {
      violations.push({ file: ".env.example", line: index + 1, message: `secret-like public env ${name}` });
    }
  });
  return violations;
}

function formatted(v: Violation[]): string { return v.map((x) => `${x.file}:${x.line} ${x.message}`).join("\n"); }

describe("CI-01 critical guard contracts", () => {
  it("fails on an unreadable subtree instead of treating it as empty", () => {
    if (process.platform === "win32") return;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ci01-"));
    const locked = path.join(temp, "locked");
    fs.mkdirSync(locked);
    fs.writeFileSync(path.join(locked, "bad.ts"), "db.$executeRawUnsafe('x')");
    fs.chmodSync(locked, 0o000);
    try { expect(() => sourceFiles(temp)).toThrow(); }
    finally { fs.chmodSync(locked, 0o700); fs.rmSync(temp, { recursive: true, force: true }); }
  });

  it("requires canonical public JSON parsing and catches aliases", () => {
    for (const source of [
      `export const GET=()=>JSON.parse(raw)`, `export const GET=()=>JSON["parse"](raw)`,
      `const {parse}=JSON; export const GET=()=>parse(raw)`, `const p=JSON.parse; export const GET=()=>p(raw)`,
      `export const GET=()=>JSON?.parse(raw)`,
      `function safeJsonParse(x:string){return JSON.parse(x)}; export const GET=()=>safeJsonParse(raw)`,
      `import {safeJsonParse} from "./fake"; export const GET=()=>safeJsonParse(raw)`,
    ]) expect(analyzeJson(source)).not.toEqual([]);
    expect(analyzeJson(`import {safeJsonParse as p} from "@/lib/api/safe-json"; export const GET=()=>p(raw)`)).toEqual([]);
  });

  it("protects every exported admin handler, not one lure call", () => {
    expect(analyzeAdmin(`import {withAdminAuth} from "@/lib/api/with-admin-auth"; export const GET=withAdminAuth(a); export const POST=async()=>x`)).not.toEqual([]);
    expect(analyzeAdmin(`import {withAdminAuth} from "@/lib/api/with-admin-auth"; const lure=withAdminAuth(a); export const POST=async()=>x`)).not.toEqual([]);
    expect(analyzeAdmin(`import {withAdminAuth as protect} from "@/lib/api/with-admin-auth"; export const GET=protect(a); export const POST=protect(b)`)).toEqual([]);
  });

  it("proves publication status writes or rejects them", () => {
    for (const source of [
      `const data={publicationStatus:"PUBLISHED"}; db.affair.update({data})`,
      `const status=PublicationStatus.PUBLISHED; db.affair.update({data:{publicationStatus:status}})`,
      `const affairs=db.affair; affairs.update({data:{publicationStatus:"PUBLISHED"}})`,
      `db.measure.upsert({create:{publicationStatus:"DRAFT"},update:{["publicationStatus"]:"PUBLISHED"}})`,
      `const data={publicationStatus:value}; db.affair.update({data})`,
    ]) expect(analyzePublication(source)).not.toEqual([]);
    expect(analyzePublication(`db.politician.update({data:{publicationStatus:PublicationStatus.PUBLISHED}})`)).toEqual([]);
    expect(analyzePublication(`const ACTION={a:"ARCHIVED",b:"REJECTED"}; const status=ACTION[action]; db.affair.update({data:{publicationStatus:status}})`)).toEqual([]);
    expect(analyzePublication(`if(status==="PUBLISHED") publish(); else db.affair.update({data:{publicationStatus:status}})`)).toEqual([]);
    expect(analyzePublication(`import {buildPrismaData} from "@/services/affairs/proposals"; db.affair.update({data:buildPrismaData(patch)})`)).toEqual([]);
  });

  it("guards importer aliases while allowing review/remediation paths", () => {
    expect(analyzeImporter(`const affairs=db.affair; affairs.create({data:a})`, "scripts/import-demo.ts")).not.toEqual([]);
    expect(analyzeImporter(`const now=new Date(); db.affair.update({data:{verifiedAt:now}})`, "scripts/sync-demo.ts")).not.toEqual([]);
    expect(analyzeImporter(`db.affair.update({data:{["verifiedAt"]:new Date()}})`, "src/services/sync/demo.ts")).not.toEqual([]);
    expect(analyzeImporter(`await createDraftAffairFromDiscovery(d)`, "scripts/import-demo.ts")).toEqual([]);
    expect(analyzeImporter(`db.affair.update({data:{verifiedAt:null}})`, "scripts/remediate-old.ts")).toEqual([]);
  });

  it("checks outbound crawler identity, not unrelated userAgent metadata", () => {
    expect(analyzeNetworkIdentity(`new HTTPClient({userAgent:"Mozilla/"+"5.0"})`)).not.toEqual([]);
    expect(analyzeNetworkIdentity(`new HTTPClient({userAgent:"Poligraph/1.0 (https://poligraph.fr)"})`)).toEqual([]);
    expect(analyzeNetworkIdentity(`fetch(url,{headers:{"User-Agent":"curl/8"}})`)).not.toEqual([]);
    expect(analyzeNetworkIdentity(`const audit={userAgent:"Mozilla/5.0"}`)).toEqual([]);
    expect(analyzeNetworkIdentity(`const x=process.env.MEDIAPART_EMAIL`)).not.toEqual([]);
  });

  it("ties JSON-LD sinks to one helper and tests the real payload behavior", () => {
    const safe=`function safeJsonLd(data:object){return JSON.stringify(data).replace(/<\\/script/gi,"<\\\\/script")}; export function X(){return <script dangerouslySetInnerHTML={{__html:safeJsonLd({x:1})}}/>}`;
    expect(validateJsonLd(safe)).toEqual([]);
    expect(validateJsonLd(`function safeJsonLd(data:object){return JSON.stringify(data)}; export function X(){return <script dangerouslySetInnerHTML={{__html:safeJsonLd({x:1})}}/>}`)).not.toEqual([]);
    expect(validateJsonLd(`function safeJsonLd(data:object){return JSON.stringify(data).replace(/<\\/script/gi,"<\\\\/script")}; function other(x:object){return JSON.stringify(x)}; export function X(){return <script dangerouslySetInnerHTML={{__html:other({x:1})}}/>}`)).not.toEqual([]);
    expect(analyzeHtml(`export function X(){return <div dangerouslySetInnerHTML={{__html:html}}/>}`, "src/components/JsonLdUnsafe.tsx")).not.toEqual([]);
  });

  it("detects static and composed NEXT_PUBLIC secret-like names", () => {
    expect(analyzePublicEnv(`const x=process.env.NEXT_PUBLIC_PRIVATE_KEY`)).not.toEqual([]);
    expect(analyzePublicEnv(`const x=process.env["NEXT_PUBLIC_"+"PRIVATE_KEY"]`)).not.toEqual([]);
    expect(analyzePublicEnv(`const x=process.env.NEXT_PUBLIC_SITE_URL`)).toEqual([]);
  });

  it("holds the contracts on the complete repository", () => {
    const violations = repoViolations();
    expect(formatted(violations), formatted(violations)).toBe("");
  });
});
