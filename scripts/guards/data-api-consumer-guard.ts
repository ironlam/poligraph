import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import ts from "typescript";

export const DATA_API_GUARD_MESSAGE =
  "The hosted database Data API is intentionally disabled. Introducing a database consumer requires a security architecture review.";

export type DataApiSignal =
  | "direct REST Data API consumer"
  | "direct GraphQL Data API consumer"
  | "PostgREST client"
  | "Supabase database operation"
  | "explicit Data API configuration";

const SOURCE_EXTENSIONS = new Set([
  ".bash",
  ".cjs",
  ".cts",
  ".env",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".mts",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const SOURCE_BASENAMES = new Set(["Dockerfile", "Makefile", ".env.example"]);
const GUARD_FILES = new Set([
  "scripts/guards/data-api-consumer-guard.ts",
  "scripts/guards/data-api-consumer-guard.test.ts",
  "src/__tests__/no-data-api-consumers.test.ts",
]);
const EXCLUDED_PREFIXES = ["docs/", "src/generated/"];
const EXCLUDED_BASENAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const SUPABASE_CLIENT_MODULES = new Set(["@supabase/supabase-js", "@supabase/ssr"]);
const SUPABASE_CLIENT_FACTORIES = new Set([
  "createClient",
  "createBrowserClient",
  "createServerClient",
]);

function basename(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}

export function shouldScanTrackedFile(file: string): boolean {
  if (GUARD_FILES.has(file) || EXCLUDED_BASENAMES.has(basename(file))) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))) return false;
  return SOURCE_BASENAMES.has(basename(file)) || SOURCE_EXTENSIONS.has(extname(file));
}

export function selectTrackedArchitectureFiles(files: readonly string[]): string[] {
  return files.filter(shouldScanTrackedFile);
}

export function trackedArchitectureFiles(root: string): string[] {
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

  return selectTrackedArchitectureFiles(files);
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function detectSupabaseDatabaseOperation(sourceFile: ts.SourceFile): boolean {
  const factoryNames = new Set<string>();
  const factoryNamespaces = new Set<string>();
  const clientNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!SUPABASE_CLIENT_MODULES.has(statement.moduleSpecifier.text)) continue;

    const importClause = statement.importClause;
    if (!importClause) continue;
    if (importClause.name) factoryNamespaces.add(importClause.name.text);
    if (importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
      factoryNamespaces.add(importClause.namedBindings.name.text);
    }
    if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
      for (const element of importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (SUPABASE_CLIENT_FACTORIES.has(importedName)) factoryNames.add(element.name.text);
      }
    }
  }

  const unwrap = (node: ts.Expression): ts.Expression => {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      return unwrap(node.expression);
    }
    return node;
  };

  const propertyName = (node: ts.Expression): string | undefined => {
    const expression = unwrap(node);
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    if (
      ts.isElementAccessExpression(expression) &&
      expression.argumentExpression &&
      ts.isStringLiteralLike(expression.argumentExpression)
    ) {
      return expression.argumentExpression.text;
    }
    return undefined;
  };

  const propertyReceiver = (node: ts.Expression): ts.Expression | undefined => {
    const expression = unwrap(node);
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      return expression.expression;
    }
    return undefined;
  };

  const requiredModule = (node: ts.Expression): string | undefined => {
    const expression = unwrap(node);
    const argument = ts.isCallExpression(expression) ? expression.arguments[0] : undefined;
    if (
      !ts.isCallExpression(expression) ||
      !ts.isIdentifier(expression.expression) ||
      expression.expression.text !== "require" ||
      expression.arguments.length !== 1 ||
      !argument ||
      !ts.isStringLiteralLike(argument)
    ) {
      return undefined;
    }
    return argument.text;
  };

  const collectCommonJsFactories = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const moduleName = requiredModule(node.initializer);
      if (moduleName && SUPABASE_CLIENT_MODULES.has(moduleName)) {
        if (ts.isIdentifier(node.name)) factoryNamespaces.add(node.name.text);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue;
            const importedName = element.propertyName?.getText(sourceFile) ?? element.name.text;
            if (SUPABASE_CLIENT_FACTORIES.has(importedName)) factoryNames.add(element.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, collectCommonJsFactories);
  };
  collectCommonJsFactories(sourceFile);

  const isFactoryExpression = (node: ts.Expression): boolean => {
    const expression = unwrap(node);
    if (ts.isIdentifier(expression)) return factoryNames.has(expression.text);
    const receiver = propertyReceiver(expression);
    const name = propertyName(expression);
    const unwrappedReceiver = receiver ? unwrap(receiver) : undefined;
    const moduleName = receiver ? requiredModule(receiver) : undefined;
    return Boolean(
      receiver &&
      name &&
      SUPABASE_CLIENT_FACTORIES.has(name) &&
      ((unwrappedReceiver &&
        ts.isIdentifier(unwrappedReceiver) &&
        factoryNamespaces.has(unwrappedReceiver.text)) ||
        (moduleName && SUPABASE_CLIENT_MODULES.has(moduleName)))
    );
  };

  const isFactoryCall = (node: ts.Expression): node is ts.CallExpression => {
    const expression = unwrap(node);
    return ts.isCallExpression(expression) && isFactoryExpression(expression.expression);
  };

  const factoryAliasCandidates: Array<{ name: string; value: ts.Expression }> = [];
  const clientCandidates: Array<{ name: string; value: ts.Expression }> = [];

  const collectAssignments = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      factoryAliasCandidates.push({ name: node.name.text, value: node.initializer });
      clientCandidates.push({ name: node.name.text, value: node.initializer });
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      factoryAliasCandidates.push({ name: node.left.text, value: node.right });
      clientCandidates.push({ name: node.left.text, value: node.right });
    }
    ts.forEachChild(node, collectAssignments);
  };
  collectAssignments(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, value } of factoryAliasCandidates) {
      if (!factoryNames.has(name) && isFactoryExpression(value)) {
        factoryNames.add(name);
        changed = true;
      }
    }
  }

  const isClientExpression = (node: ts.Expression): boolean => {
    const expression = unwrap(node);
    if (ts.isIdentifier(expression)) return clientNames.has(expression.text);
    if (isFactoryCall(expression)) return true;
    const receiver = ts.isCallExpression(expression)
      ? propertyReceiver(expression.expression)
      : undefined;
    return (
      ts.isCallExpression(expression) &&
      propertyName(expression.expression) === "schema" &&
      Boolean(receiver && isClientExpression(receiver))
    );
  };

  changed = true;
  while (changed) {
    changed = false;
    for (const { name, value } of clientCandidates) {
      if (!clientNames.has(name) && isClientExpression(value)) {
        clientNames.add(name);
        changed = true;
      }
    }
  }

  let detected = false;
  const inspectCalls = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = propertyName(node.expression);
      const receiver = propertyReceiver(node.expression);
      if ((name === "from" || name === "rpc") && receiver && isClientExpression(receiver)) {
        detected = true;
        return;
      }
    }
    ts.forEachChild(node, inspectCalls);
  };
  inspectCalls(sourceFile);
  return detected;
}

function sourceSyntaxValues(sourceFile: ts.SourceFile): string[] {
  const values: string[] = [];
  const constants = new Map<string, ts.Expression>();

  const collectConstants = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constants.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectConstants);
  };
  collectConstants(sourceFile);

  const staticText = (node: ts.Expression, seen = new Set<string>()): string => {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isParenthesizedExpression(node)) return staticText(node.expression, seen);
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return "";
      const value = constants.get(node.text);
      if (!value) return "";
      const nextSeen = new Set(seen).add(node.text);
      return staticText(value, nextSeen);
    }
    if (ts.isTemplateExpression(node)) {
      return (
        node.head.text +
        node.templateSpans
          .map((span) => staticText(span.expression, seen) + span.literal.text)
          .join("")
      );
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return staticText(node.left, seen) + staticText(node.right, seen);
    }
    return "";
  };

  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateExpression(node) ||
      ts.isBinaryExpression(node)
    ) {
      values.push(staticText(node));
    }
    if (ts.isIdentifier(node)) values.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

function isJavaScriptLike(file: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(file);
}

export function detectDataApiSignals(file: string, content: string): DataApiSignal[] {
  if (!/(?:supabase|postgrest|\/rest|\/graphql|data_api)/i.test(content)) return [];

  const sourceFile = isJavaScriptLike(file)
    ? ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file))
    : undefined;
  const searchableValues = sourceFile ? sourceSyntaxValues(sourceFile) : [content];
  const searchableText = searchableValues.join("\n");
  const signals: DataApiSignal[] = [];

  if (searchableValues.some((value) => /\/rest\/v1(?:\/|$)/i.test(value))) {
    signals.push("direct REST Data API consumer");
  }
  if (searchableValues.some((value) => /\/graphql\/v1(?:\/|$)/i.test(value))) {
    signals.push("direct GraphQL Data API consumer");
  }
  if (
    /@supabase\/postgrest-js/i.test(searchableText) ||
    (sourceFile &&
      sourceFile.statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === "@supabase/postgrest-js"
      ))
  ) {
    signals.push("PostgREST client");
  }
  if (sourceFile && detectSupabaseDatabaseOperation(sourceFile)) {
    signals.push("Supabase database operation");
  }
  if (/\b(?:SUPABASE_)?(?:DATA_API|POSTGREST)_(?:URL|ENDPOINT)\b/i.test(searchableText)) {
    signals.push("explicit Data API configuration");
  }

  return signals;
}

export function findDataApiConsumers(root: string): string[] {
  return trackedArchitectureFiles(root).flatMap((file) =>
    detectDataApiSignals(file, readFileSync(resolve(root, file), "utf8")).map(
      (signal) => `${file}: ${signal}`
    )
  );
}
