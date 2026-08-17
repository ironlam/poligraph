import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import ts from "typescript";

export type SensitiveDomain = "Party" | "FactCheck" | "Affair";

export interface SourceHost {
  read(path: string): string | undefined;
  resolveImport(fromPath: string, specifier: string): string | null;
}

export interface SurfaceAnalysis {
  entrypoint: string;
  domains: Set<SensitiveDomain>;
  sources: Map<string, string>;
}

export type ReviewedSurfaceInventory = Record<SensitiveDomain, Record<string, readonly string[]>>;

const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;
const DB_MODULE_PATH = "src/lib/db.ts";
const LOCAL_SOURCE_EXCLUSIONS = ["src/generated/", "/__tests__/", "src/lib/db.ts"] as const;
export const NON_PUBLIC_ENTRYPOINTS = new Set(["src/app/api/inngest/route.ts"]);

function normalized(path: string): string {
  return normalize(path).replaceAll("\\", "/");
}

function sourceFile(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function candidatePaths(basePath: string): string[] {
  if (SOURCE_EXTENSIONS.some((extension) => basePath.endsWith(extension))) return [basePath];
  return [
    ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(basePath, `index${extension}`)),
  ];
}

function isExcludedLocalSource(path: string): boolean {
  return LOCAL_SOURCE_EXCLUSIONS.some((part) => path.includes(part));
}

function resolvesToDbModule(fromPath: string, specifier: string): boolean {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return false;

  const basePath = specifier.startsWith("@/")
    ? join("src", specifier.slice(2))
    : join(dirname(fromPath), specifier);
  return candidatePaths(normalized(basePath)).some(
    (candidate) => normalized(candidate) === DB_MODULE_PATH
  );
}

export function createFileSystemSourceHost(root = process.cwd()): SourceHost {
  return {
    read(path) {
      const absolutePath = resolve(root, path);
      return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : undefined;
    },
    resolveImport(fromPath, specifier) {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;

      const basePath = specifier.startsWith("@/")
        ? join("src", specifier.slice(2))
        : join(dirname(fromPath), specifier);
      const match = candidatePaths(normalized(basePath)).find(
        (candidate) => !isExcludedLocalSource(candidate) && existsSync(resolve(root, candidate))
      );
      return match ? normalized(match) : null;
    },
  };
}

export function createMemorySourceHost(sources: Record<string, string>): SourceHost {
  const files = new Map(
    Object.entries(sources).map(([path, source]) => [normalized(path), source])
  );

  return {
    read(path) {
      return files.get(normalized(path));
    },
    resolveImport(fromPath, specifier) {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;

      const basePath = specifier.startsWith("@/")
        ? join("src", specifier.slice(2))
        : join(dirname(fromPath), specifier);
      return (
        candidatePaths(normalized(basePath)).find(
          (candidate) => !isExcludedLocalSource(candidate) && files.has(candidate)
        ) ?? null
      );
    },
  };
}

export function discoverPublicEntrypoints(root = process.cwd()): string[] {
  const appRoot = resolve(root, "src/app");

  function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === "admin" || entry.name === "__tests__") return [];
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) return walk(absolutePath);

      const path = normalized(relative(root, absolutePath));
      if (NON_PUBLIC_ENTRYPOINTS.has(path)) return [];
      const isPublicApiRoute = path.startsWith("src/app/api/") && entry.name === "route.ts";
      const isPublicPage = entry.name === "page.tsx";
      const isPublicOgImage = entry.name === "opengraph-image.tsx";
      return isPublicApiRoute || isPublicPage || isPublicOgImage ? [path] : [];
    });
  }

  return walk(appRoot).sort();
}

function localImports(path: string, source: string): string[] {
  return sourceFile(path, source).statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) return [];
      if (
        clause &&
        !clause.name &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.every((specifier) => specifier.isTypeOnly)
      ) {
        return [];
      }
      return ts.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : [];
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly || !statement.moduleSpecifier) return [];
      if (
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.every((specifier) => specifier.isTypeOnly)
      ) {
        return [];
      }
      return ts.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : [];
    }
    return [];
  });
}

function rawSqlDomains(node: ts.TaggedTemplateExpression): SensitiveDomain[] {
  const tag = node.tag.getText();
  if (!tag.includes("$queryRaw") && tag !== "Prisma.sql") return [];

  const sql = node.template.getText();
  return (
    [
      ["Party", /(?:FROM|JOIN|LEFT\s+JOIN)\s+"Party"/i],
      ["FactCheck", /(?:FROM|JOIN|LEFT\s+JOIN)\s+"FactCheck"/i],
      ["Affair", /(?:FROM|JOIN|LEFT\s+JOIN)\s+"Affair"/i],
    ] as const
  )
    .filter(([, pattern]) => pattern.test(sql))
    .map(([domain]) => domain);
}

function accessSegments(expression: ts.Expression): string[] | null {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) {
    const base = accessSegments(expression.expression);
    return base ? [...base, expression.name.text] : null;
  }
  if (ts.isElementAccessExpression(expression)) {
    const base = accessSegments(expression.expression);
    const key = expression.argumentExpression;
    return base && ts.isStringLiteralLike(key) ? [...base, key.text] : null;
  }
  return null;
}

function dbBindings(
  path: string,
  parsed: ts.SourceFile
): {
  clients: Set<string>;
  namespaces: Set<string>;
} {
  const clients = new Set<string>();
  const namespaces = new Set<string>();

  for (const statement of parsed.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause?.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !resolvesToDbModule(path, statement.moduleSpecifier.text)
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        const importedName = binding.propertyName?.text ?? binding.name.text;
        if (!binding.isTypeOnly && importedName === "db") clients.add(binding.name.text);
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
  }

  let addedAlias = true;
  while (addedAlias) {
    addedAlias = false;

    function addAlias(target: ts.Expression | ts.BindingName, source: ts.Expression): void {
      if (!ts.isIdentifier(target)) return;
      const segments = accessSegments(source);
      if (!segments) return;
      const root = segments[0];
      if (!root) return;

      if (
        (segments.length === 1 && clients.has(root)) ||
        (segments.length === 2 && namespaces.has(root) && segments[1] === "db")
      ) {
        if (!clients.has(target.text)) {
          clients.add(target.text);
          addedAlias = true;
        }
      } else if (segments.length === 1 && namespaces.has(root)) {
        if (!namespaces.has(target.text)) {
          namespaces.add(target.text);
          addedAlias = true;
        }
      }
    }

    function visitAliases(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        addAlias(node.name, node.initializer);
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        addAlias(node.left, node.right);
      }
      ts.forEachChild(node, visitAliases);
    }

    visitAliases(parsed);
  }

  return { clients, namespaces };
}

function modelAccess(
  node: ts.Node,
  clients: ReadonlySet<string>,
  namespaces: ReadonlySet<string>
): string | null {
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return null;
  const segments = accessSegments(node);
  if (!segments) return null;
  const root = segments[0];
  const directModel = segments[1];
  if (!root) return null;

  if (directModel && clients.has(root)) return directModel;
  const namespaceModel = segments[2];
  if (namespaceModel && namespaces.has(root) && directModel === "db") {
    return namespaceModel;
  }
  return null;
}

function domainForModel(model: string): SensitiveDomain | null {
  if (model === "party") return "Party";
  if (model === "factCheck" || model === "factCheckMention") return "FactCheck";
  if (model === "affair") return "Affair";
  return null;
}

export function directSensitiveDomains(path: string, source: string): Set<SensitiveDomain> {
  const domains = new Set<SensitiveDomain>();
  const parsed = sourceFile(path, source);
  const { clients, namespaces } = dbBindings(path, parsed);
  let hasDirectDbQuery = false;

  function findDirectDbQuery(node: ts.Node): void {
    if (modelAccess(node, clients, namespaces)) hasDirectDbQuery = true;
    ts.forEachChild(node, findDirectDbQuery);
  }

  findDirectDbQuery(parsed);

  function visit(node: ts.Node): void {
    const model = modelAccess(node, clients, namespaces);
    const domain = model ? domainForModel(model) : null;
    if (domain) domains.add(domain);

    if (hasDirectDbQuery && ts.isPropertyAssignment(node)) {
      const relation = node.name.getText(parsed).replaceAll(/["']/g, "");
      if (
        ["party", "currentParty", "partyAtTime", "predecessor", "successors"].includes(relation)
      ) {
        domains.add("Party");
      }
      if (["affairs", "affairsAtTime", "affairLinks"].includes(relation)) domains.add("Affair");
      if (["factCheck", "factCheckMentions"].includes(relation)) domains.add("FactCheck");
    }

    if (ts.isTaggedTemplateExpression(node)) {
      for (const domain of rawSqlDomains(node)) domains.add(domain);
    }
    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return domains;
}

export function analyzeSurface(entrypoint: string, host: SourceHost): SurfaceAnalysis {
  const sources = new Map<string, string>();
  const domains = new Set<SensitiveDomain>();
  const visited = new Set<string>();

  function visit(path: string): void {
    const normalizedPath = normalized(path);
    if (visited.has(normalizedPath)) return;
    visited.add(normalizedPath);

    const source = host.read(normalizedPath);
    if (source === undefined) return;
    sources.set(normalizedPath, source);
    for (const domain of directSensitiveDomains(normalizedPath, source)) domains.add(domain);

    for (const specifier of localImports(normalizedPath, source)) {
      const importedPath = host.resolveImport(normalizedPath, specifier);
      if (importedPath) visit(importedPath);
    }
  }

  visit(entrypoint);
  return { entrypoint: normalized(entrypoint), domains, sources };
}

export function validateReviewedInventory(
  analyses: readonly SurfaceAnalysis[],
  inventory: ReviewedSurfaceInventory
): string[] {
  const errors: string[] = [];
  const byPath = new Map(analyses.map((analysis) => [analysis.entrypoint, analysis]));

  for (const analysis of analyses) {
    for (const domain of analysis.domains) {
      if (!inventory[domain][analysis.entrypoint]) {
        errors.push(`${domain}: sensitive surface not reviewed: ${analysis.entrypoint}`);
      }
    }
  }

  for (const domain of ["Party", "FactCheck", "Affair"] as const) {
    for (const [path, invariants] of Object.entries(inventory[domain])) {
      const analysis = byPath.get(path);
      if (!analysis) errors.push(`${domain}: reviewed surface is not a public entrypoint: ${path}`);
      else if (!analysis.domains.has(domain)) {
        errors.push(`${domain}: reviewed surface is no longer sensitive: ${path}`);
      }
      if (invariants.length === 0) errors.push(`${domain}: no invariant controls ${path}`);
    }
  }

  return errors.sort();
}

export function inspectAffairsAtTimeRelations(source: string): Array<{
  hasPublishedAffairWhere: boolean;
  hasPublicPoliticianWhere: boolean;
}> {
  const parsed = sourceFile("partis.ts", source);
  const results: Array<{
    hasPublishedAffairWhere: boolean;
    hasPublicPoliticianWhere: boolean;
  }> = [];

  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(parsed).replaceAll(/["']/g, "") === "affairsAtTime" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const whereProperties = node.initializer.properties.filter(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) &&
          property.name.getText(parsed).replaceAll(/["']/g, "") === "where"
      );
      const whereProperty = whereProperties.length === 1 ? whereProperties[0] : undefined;
      const where =
        whereProperty && ts.isObjectLiteralExpression(whereProperty.initializer)
          ? whereProperty.initializer
          : null;
      const politicianProperties =
        where?.properties.filter(
          (property): property is ts.PropertyAssignment =>
            ts.isPropertyAssignment(property) &&
            property.name.getText(parsed).replaceAll(/["']/g, "") === "politician"
        ) ?? [];
      const politicianProperty =
        politicianProperties.length === 1 ? politicianProperties[0] : undefined;

      results.push({
        hasPublishedAffairWhere:
          where?.properties.some(
            (property) =>
              ts.isSpreadAssignment(property) &&
              ts.isCallExpression(property.expression) &&
              ts.isIdentifier(property.expression.expression) &&
              property.expression.expression.text === "getPublishedAffairWhere" &&
              property.expression.arguments.length === 0
          ) ?? false,
        hasPublicPoliticianWhere:
          !!politicianProperty &&
          ts.isIdentifier(politicianProperty.initializer) &&
          politicianProperty.initializer.text === "PUBLIC_POLITICIAN_WHERE",
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return results;
}

export function allAffairsAtTimeRelationsArePublic(
  source: string,
  expectedRelationCount: number
): boolean {
  const relations = inspectAffairsAtTimeRelations(source);
  return (
    relations.length === expectedRelationCount &&
    relations.every(
      (relation) => relation.hasPublishedAffairWhere && relation.hasPublicPoliticianWhere
    )
  );
}
