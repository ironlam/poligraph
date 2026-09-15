import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function sourceFile(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(join(ROOT, path), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

function tsxFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [relative(ROOT, join(ROOT, path))] : [];
  });
}

function jsxElements(path: string, tagName: string): ts.JsxOpeningLikeElement[] {
  const matches: ts.JsxOpeningLikeElement[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText() === tagName
    ) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(path));
  return matches;
}

function hasFalseAttribute(element: ts.JsxOpeningLikeElement, name: string): boolean {
  return element.attributes.properties.some(
    (property) =>
      ts.isJsxAttribute(property) &&
      property.name.getText() === name &&
      property.initializer !== undefined &&
      ts.isJsxExpression(property.initializer) &&
      property.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword
  );
}

function importedNames(path: string, moduleName: string): string[] {
  return sourceFile(path).statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName
    ) {
      return [];
    }
    const bindings = statement.importClause?.namedBindings;
    return bindings && ts.isNamedImports(bindings)
      ? bindings.elements.map((element) => element.name.text)
      : [];
  });
}

function calledNames(path: string): Set<string> {
  const calls = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(path));
  return calls;
}

describe("public page performance contracts", () => {
  it("keeps public images behind the Next optimizer", () => {
    const files = [...tsxFiles("src/app"), ...tsxFiles("src/components")].filter(
      (path) =>
        !path.startsWith("src/app/admin/") &&
        !path.startsWith("src/components/admin/") &&
        !path.includes("opengraph-image") &&
        !path.includes("__tests__")
    );
    const violations = files.filter((path) =>
      jsxElements(path, "Image").some((element) =>
        element.attributes.properties.some(
          (property) => ts.isJsxAttribute(property) && property.name.getText() === "unoptimized"
        )
      )
    );

    expect(violations).toEqual([]);
  });

  it.each([
    ["src/app/statistiques/page.tsx", "getJudicialData"],
    ["src/app/statistiques/factchecks/page.tsx", "getFactCheckData"],
    ["src/app/statistiques/legislatif/page.tsx", "getLegislativeData"],
    ["src/app/statistiques/participation/page.tsx", "getParticipationData"],
  ])("loads only its visible statistics dataset in %s", (path, expectedLoader) => {
    const imports = importedNames(path, "@/lib/data/statistics");
    expect(imports).toContain(expectedLoader);
    expect(
      imports.filter((name) => name.startsWith("get") && name !== "getGroupDynamicsData")
    ).toEqual([expectedLoader]);
  });

  it("keeps statistics navigation on the server", () => {
    const file = sourceFile("src/components/stats/StatsTabs.tsx");
    const directives = file.statements
      .filter(ts.isExpressionStatement)
      .map((statement) => statement.expression)
      .filter(ts.isStringLiteral)
      .map((literal) => literal.text);

    expect(directives).not.toContain("use client");
    expect(
      jsxElements("src/components/stats/StatsTabs.tsx", "Link").every((link) =>
        hasFalseAttribute(link, "prefetch")
      )
    ).toBe(true);
  });

  it.each([
    "src/components/layout/Footer.tsx",
    "src/app/elections/presidentielle-2027/_components/CandidacyDirectoryLink.tsx",
  ])("does not preload links from %s", (path) => {
    const links = jsxElements(path, "Link");
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => hasFalseAttribute(link, "prefetch"))).toBe(true);
  });

  it("counts candidacy measures without loading complete revisions", () => {
    const calls = calledNames("src/lib/data/presidential-candidacy-field.ts");
    expect(calls.has("getPublicMeasureRollupsByElection")).toBe(true);
    expect(calls.has("getPublicMeasuresByElection")).toBe(false);
  });

  it("keeps telemetry outside cache signatures and inside executed loaders", () => {
    for (const [file, cached, loader] of [
      ["hub", "getHubMeasureContextCached", "loadHubMeasureContext"],
      ["themes-index", "getThemesIndexCached", "loadThemesIndex"],
      ["priorites", "getPrioritesDataCached", "loadPrioritesData"],
      ["subject-page", "getSubjectPageDataCached", "loadSubjectPageData"],
    ]) {
      const ast = sourceFile(`src/lib/data/${file}.ts`);
      const functions = ast.statements.filter(ts.isFunctionDeclaration);
      const boundary = functions.find((fn) => fn.name?.text === cached);
      expect(boundary, cached).toBeDefined();
      expect(boundary?.parameters.map((param) => param.name.getText(ast))).toEqual(
        file === "subject-page"
          ? ["electionId", "electionSlug", "theme"]
          : ["electionId", "electionSlug"]
      );
      const calls: string[] = [];
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) calls.push(node.expression.getText(ast));
        ts.forEachChild(node, visit);
      }
      if (boundary) visit(boundary);
      expect(calls).toContain(loader);
      expect(calls).not.toContain("observeRead");
      const executed = functions.find((fn) => fn.name?.text === loader);
      calls.length = 0;
      if (executed) visit(executed);
      expect(calls).toContain("observeRead");
    }
  });
});
