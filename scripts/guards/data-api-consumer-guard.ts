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

function sourceTextValues(sourceFile: ts.SourceFile): string[] {
  const values: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isIdentifier(node)
    ) {
      values.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

function detectSupabaseDatabaseOperation(sourceFile: ts.SourceFile): boolean {
  const factoryNames = new Set<string>();
  const clientNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!SUPABASE_CLIENT_MODULES.has(statement.moduleSpecifier.text)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (SUPABASE_CLIENT_FACTORIES.has(importedName)) factoryNames.add(element.name.text);
    }
  }

  const isFactoryCall = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    factoryNames.has(node.expression.text);

  const collectClients = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isFactoryCall(node.initializer)
    ) {
      clientNames.add(node.name.text);
    }
    ts.forEachChild(node, collectClients);
  };
  collectClients(sourceFile);

  const isClientExpression = (node: ts.Expression): boolean => {
    if (ts.isIdentifier(node)) return clientNames.has(node.text);
    if (isFactoryCall(node)) return true;
    return (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "schema" &&
      isClientExpression(node.expression.expression)
    );
  };

  let detected = false;
  const inspectCalls = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "from" || node.expression.name.text === "rpc") &&
      isClientExpression(node.expression.expression)
    ) {
      detected = true;
      return;
    }
    ts.forEachChild(node, inspectCalls);
  };
  inspectCalls(sourceFile);
  return detected;
}

function isJavaScriptLike(file: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(file);
}

export function detectDataApiSignals(file: string, content: string): DataApiSignal[] {
  if (!/(?:supabase|postgrest|\/rest\/v1|\/graphql\/v1|data_api)/i.test(content)) return [];

  const sourceFile = isJavaScriptLike(file)
    ? ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file))
    : undefined;
  const searchableValues = sourceFile ? sourceTextValues(sourceFile) : [content];
  const searchableText = searchableValues.join("\n");
  const signals: DataApiSignal[] = [];

  if (/\/rest\/v1(?:\/|$)/i.test(searchableText)) {
    signals.push("direct REST Data API consumer");
  }
  if (/\/graphql\/v1(?:\/|$)/i.test(searchableText)) {
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
