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

export type DataApiViolation = {
  file: string;
  signal: DataApiSignal;
};

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

function importModuleName(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node;
  while (current && !ts.isImportDeclaration(current)) current = current.parent;
  return current && ts.isStringLiteral(current.moduleSpecifier)
    ? current.moduleSpecifier.text
    : undefined;
}

function createVirtualProgram(
  files: Readonly<Record<string, string>>,
  root: string
): { fileNames: Map<string, string>; program: ts.Program } {
  const normalizedRoot = resolve(root).replaceAll("\\", "/");
  const normalize = (file: string) => resolve(normalizedRoot, file).replaceAll("\\", "/");
  const sources = new Map(
    Object.entries(files)
      .filter(([file]) => isJavaScriptLike(file))
      .map(([file, content]) => [normalize(file), content])
  );
  const rootNames = [...sources.entries()]
    .filter(([, content]) =>
      /(?:supabase|postgrest|\b(?:from|rpc|schema)\s*\??\s*\()/i.test(content)
    )
    .map(([file]) => file);
  const fileNames = new Map(
    [...sources.keys()].map((file) => [file, file.slice(normalizedRoot.length + 1)])
  );
  const options: ts.CompilerOptions = {
    allowJs: true,
    baseUrl: normalizedRoot,
    checkJs: false,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noLib: true,
    paths: { "@/*": ["src/*"] },
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
  };
  const defaultHost = ts.createCompilerHost(options);
  const host: ts.CompilerHost = {
    ...defaultHost,
    directoryExists: (directory) => {
      const prefix = `${directory.replaceAll("\\", "/").replace(/\/$/, "")}/`;
      return [...sources.keys()].some((file) => file.startsWith(prefix));
    },
    fileExists: (file) => sources.has(file.replaceAll("\\", "/")),
    getCurrentDirectory: () => normalizedRoot,
    getSourceFile: (file, languageVersion) => {
      const normalized = file.replaceAll("\\", "/");
      const content = sources.get(normalized);
      return content === undefined
        ? undefined
        : ts.createSourceFile(normalized, content, languageVersion, true, scriptKind(normalized));
    },
    readFile: (file) => sources.get(file.replaceAll("\\", "/")),
    realpath: (file) => file.replaceAll("\\", "/"),
  };

  return {
    fileNames,
    program: ts.createProgram({ rootNames, options, host }),
  };
}

function detectSharedSupabaseDatabaseOperations(program: ts.Program): Set<string> {
  const checker = program.getTypeChecker();
  const violations = new Set<string>();

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
    return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
      ? expression.expression
      : undefined;
  };

  const requiredModule = (node: ts.Expression): string | undefined => {
    const expression = unwrap(node);
    const argument = ts.isCallExpression(expression) ? expression.arguments[0] : undefined;
    return ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "require" &&
      expression.arguments.length === 1 &&
      argument &&
      ts.isStringLiteralLike(argument)
      ? argument.text
      : undefined;
  };

  const assignments = new Map<ts.Symbol, ts.Expression[]>();
  for (const sourceFile of program.getSourceFiles()) {
    const collect = (node: ts.Node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        const symbol = checker.getSymbolAtLocation(node.left);
        if (symbol) assignments.set(symbol, [...(assignments.get(symbol) ?? []), node.right]);
      }
      ts.forEachChild(node, collect);
    };
    collect(sourceFile);
  }

  const isSupabaseFactory = (node: ts.Expression, seen = new Set<ts.Symbol>()): boolean => {
    const expression = unwrap(node);
    if (ts.isPropertyAccessExpression(expression)) {
      const receiverSymbol = checker.getSymbolAtLocation(expression.expression);
      const receiverModule = requiredModule(expression.expression);
      return (
        SUPABASE_CLIENT_FACTORIES.has(expression.name.text) &&
        (Boolean(
          receiverSymbol?.declarations?.some((declaration) => {
            if (ts.isNamespaceImport(declaration) || ts.isImportClause(declaration)) {
              return SUPABASE_CLIENT_MODULES.has(importModuleName(declaration) ?? "");
            }
            return (
              ts.isVariableDeclaration(declaration) &&
              Boolean(
                declaration.initializer &&
                SUPABASE_CLIENT_MODULES.has(requiredModule(declaration.initializer) ?? "")
              )
            );
          })
        ) ||
          Boolean(receiverModule && SUPABASE_CLIENT_MODULES.has(receiverModule)))
      );
    }
    if (!ts.isIdentifier(expression)) return false;
    const symbol = checker.getSymbolAtLocation(expression);
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return Boolean(
      symbol.declarations?.some((declaration) => {
        if (ts.isImportSpecifier(declaration)) {
          return (
            SUPABASE_CLIENT_FACTORIES.has(
              declaration.propertyName?.text ?? declaration.name.text
            ) && SUPABASE_CLIENT_MODULES.has(importModuleName(declaration) ?? "")
          );
        }
        if (ts.isBindingElement(declaration)) {
          const variable = declaration.parent.parent;
          const name = declaration.propertyName?.getText() ?? declaration.name.getText();
          return (
            ts.isVariableDeclaration(variable) &&
            Boolean(
              variable.initializer &&
              SUPABASE_CLIENT_FACTORIES.has(name) &&
              SUPABASE_CLIENT_MODULES.has(requiredModule(variable.initializer) ?? "")
            )
          );
        }
        return (
          ts.isVariableDeclaration(declaration) &&
          Boolean(declaration.initializer && isSupabaseFactory(declaration.initializer, seen))
        );
      }) || assignments.get(symbol)?.some((value) => isSupabaseFactory(value, seen))
    );
  };

  const isSupabaseClientExpression = (
    node: ts.Expression,
    seen = new Set<ts.Symbol>()
  ): boolean => {
    const expression = unwrap(node);
    if (ts.isCallExpression(expression)) {
      if (isSupabaseFactory(expression.expression)) return true;
      const receiver = propertyReceiver(expression.expression);
      return (
        propertyName(expression.expression) === "schema" &&
        Boolean(receiver && isSupabaseClientExpression(receiver, seen))
      );
    }
    const symbol = checker.getSymbolAtLocation(expression);
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);

    if (symbol.flags & ts.SymbolFlags.Alias) {
      const target = checker.getAliasedSymbol(symbol);
      if (target !== symbol && isSupabaseClientSymbol(target, seen)) return true;
    }
    return isSupabaseClientSymbol(symbol, seen);
  };

  const isSupabaseClientSymbol = (symbol: ts.Symbol, seen: Set<ts.Symbol>): boolean =>
    Boolean(
      symbol.declarations?.some((declaration) => {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          return isSupabaseClientExpression(declaration.initializer, seen);
        }
        return (
          ts.isExportAssignment(declaration) &&
          isSupabaseClientExpression(declaration.expression, seen)
        );
      }) || assignments.get(symbol)?.some((value) => isSupabaseClientExpression(value, seen))
    );

  for (const sourceFile of program.getSourceFiles()) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const name = propertyName(node.expression);
        const receiver = propertyReceiver(node.expression);
        if (
          (name === "from" || name === "rpc") &&
          receiver &&
          isSupabaseClientExpression(receiver)
        ) {
          violations.add(sourceFile.fileName);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations;
}

export function detectDataApiSignalsInFiles(
  files: Readonly<Record<string, string>>,
  root = "/virtual"
): DataApiViolation[] {
  const violations = Object.entries(files).flatMap(([file, content]) =>
    detectDataApiSignals(file, content).map((signal) => ({ file, signal }))
  );
  const { fileNames, program } = createVirtualProgram(files, root);

  for (const absoluteFile of detectSharedSupabaseDatabaseOperations(program)) {
    const file = fileNames.get(absoluteFile);
    if (
      file &&
      !violations.some(
        (violation) => violation.file === file && violation.signal === "Supabase database operation"
      )
    ) {
      violations.push({ file, signal: "Supabase database operation" });
    }
  }

  return violations.sort((left, right) =>
    `${left.file}:${left.signal}`.localeCompare(`${right.file}:${right.signal}`)
  );
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
  if (/\b(?:SUPABASE_)?(?:DATA_API|POSTGREST)_(?:URL|ENDPOINT)\b/i.test(searchableText)) {
    signals.push("explicit Data API configuration");
  }

  return signals;
}

export function findDataApiConsumers(root: string): string[] {
  const files = Object.fromEntries(
    trackedArchitectureFiles(root).map((file) => [file, readFileSync(resolve(root, file), "utf8")])
  );
  return detectDataApiSignalsInFiles(files, root).map(({ file, signal }) => `${file}: ${signal}`);
}
