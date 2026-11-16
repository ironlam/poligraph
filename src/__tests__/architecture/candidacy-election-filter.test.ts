import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/**
 * `Candidacy` is filtered on `electionId`, never through the `election` relation.
 *
 * The table holds every municipal list member (over a million rows) next to a few dozen
 * presidential or senatorial rows. With `where: { election: { slug } }` the election is resolved
 * by a join, so PostgreSQL plans without knowing which election is meant and assumes an average
 * one. Combined with `ORDER BY id LIMIT n`, it walked the primary key of the whole table to find
 * 178 senatorial rows: 20 to 40 s for a read that takes half a millisecond on the `electionId`
 * index. Resolve the id first (`getElectionIdBySlug`) and filter on it.
 *
 * A relation filter stays allowed when the same `where` pins the read to one politician, one
 * party or one row by equality: those indexes bound the read to a handful of rows whatever the
 * election, and the relation then only narrows that handful (`election: { type }` across cycles).
 *
 * What it cannot see: a `where` built elsewhere and passed as a variable, and relation loads
 * (`election.candidacies`). It reads direct `db.candidacy.*` and `tx.candidacy.*` calls only.
 */
/**
 * Reads allowed to keep the relation filter, with the number of them per file and the reason.
 * An entry is a written decision, not a parking place: convert the read when the reason goes.
 */
const ALLOWED: Record<string, { count: number; reason: string }> = {
  "src/lib/data/presidential-candidates-public.ts": {
    count: 1,
    reason:
      "lecture publique du hub, comptée dans les budgets de requêtes des tests d'intégration : " +
      "résoudre l'identifiant ajouterait une requête par page. Sans tri ni limite, PostgreSQL " +
      "passe par l'index electionId (plan vérifié). À convertir quand les appelants " +
      "transmettront l'identifiant de l'élection.",
  },
};

const METHODS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "groupBy",
  "aggregate",
  "updateMany",
  "deleteMany",
]);
const SELECTIVE_KEYS = new Set(["id", "politicianId", "partyId"]);
const LOGICAL_KEYS = new Set(["AND", "OR", "NOT"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [relative(ROOT, join(ROOT, path))]
      : [];
  });
}

/** Object literals that make up a `where`: itself, its spreads, and its AND / OR / NOT branches. */
function whereObjects(node: ts.Node, file: ts.SourceFile): ts.ObjectLiteralExpression[] {
  if (ts.isObjectLiteralExpression(node)) {
    return [
      node,
      ...node.properties.flatMap((property) => {
        if (ts.isSpreadAssignment(property)) return whereObjects(property.expression, file);
        if (ts.isPropertyAssignment(property) && LOGICAL_KEYS.has(property.name.getText(file))) {
          return whereObjects(property.initializer, file);
        }
        return [];
      }),
    ];
  }
  if (ts.isParenthesizedExpression(node)) return whereObjects(node.expression, file);
  if (ts.isConditionalExpression(node)) {
    return [...whereObjects(node.whenTrue, file), ...whereObjects(node.whenFalse, file)];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => whereObjects(element, file));
  }
  return [];
}

/** `politicianId` or `politicianId: value`, but not `politicianId: { not: null }`. */
function isEquality(property: ts.ObjectLiteralElementLike): boolean {
  if (ts.isShorthandPropertyAssignment(property)) return true;
  return ts.isPropertyAssignment(property) && !ts.isObjectLiteralExpression(property.initializer);
}

export function candidacyReadsThroughElectionRelation(path: string, code: string): number[] {
  const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      METHODS.has(node.expression.name.text) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === "candidacy"
    ) {
      const [argument] = node.arguments;
      const where =
        argument !== undefined && ts.isObjectLiteralExpression(argument)
          ? argument.properties.find(
              (property): property is ts.PropertyAssignment =>
                ts.isPropertyAssignment(property) && property.name.getText(file) === "where"
            )
          : undefined;
      if (where) {
        const objects = whereObjects(where.initializer, file);
        const names = (object: ts.ObjectLiteralExpression) =>
          object.properties.flatMap((property) =>
            property.name ? [{ name: property.name.getText(file), property }] : []
          );
        const throughRelation = objects.some((object) =>
          names(object).some(({ name }) => name === "election")
        );
        // Only the top level counts: an equality inside one OR branch pins nothing.
        const pinned =
          ts.isObjectLiteralExpression(where.initializer) &&
          names(where.initializer).some(
            ({ name, property }) => SELECTIVE_KEYS.has(name) && isEquality(property)
          );
        if (throughRelation && !pinned) {
          lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return lines;
}

describe("détecteur de filtre par la relation election", () => {
  const wrap = (call: string) => `declare const db: any;\nasync function f() { ${call} }`;
  const found = (call: string) => candidacyReadsThroughElectionRelation("a.ts", wrap(call));

  it("refuse un filtre par le slug de l'élection", () => {
    expect(
      found("await db.candidacy.findMany({ where: { election: { slug }, isElected: true } });")
    ).toHaveLength(1);
  });

  it("accepte un filtre par l'identifiant de l'élection", () => {
    expect(
      found("await db.candidacy.findMany({ where: { electionId, isElected: true } });")
    ).toEqual([]);
  });

  it("refuse la relation glissée dans un spread conditionnel", () => {
    expect(
      found(
        "await db.candidacy.findMany({ where: { ...(slug ? { election: { slug } } : {}) }, take: 50 });"
      )
    ).toHaveLength(1);
  });

  it("refuse la relation dans une branche d'un AND", () => {
    expect(
      found("await db.candidacy.count({ where: { AND: [{ election: { slug } }] } });")
    ).toHaveLength(1);
  });

  it("accepte la relation quand la lecture est épinglée à un politicien", () => {
    expect(
      found(
        "await db.candidacy.findMany({ where: { politicianId, election: { type: 'PRESIDENTIELLE' } } });"
      )
    ).toEqual([]);
  });

  it("refuse un politicianId qui n'est pas une égalité", () => {
    expect(
      found(
        "await db.candidacy.findMany({ where: { politicianId: { not: null }, election: { slug } } });"
      )
    ).toHaveLength(1);
  });

  it("attrape aussi un appel transactionnel et un findFirst", () => {
    expect(found("await tx.candidacy.findFirst({ where: { election: { slug } } });")).toHaveLength(
      1
    );
  });

  it("ignore les autres modèles", () => {
    expect(found("await db.measure.findMany({ where: { election: { slug } } });")).toEqual([]);
  });
});

describe("Candidacy se filtre par electionId", () => {
  const files = sourceFiles("src").filter(
    (path) =>
      !path.includes("__tests__") &&
      !path.endsWith(".test.ts") &&
      !path.endsWith(".test.tsx") &&
      !path.startsWith(join("src", "generated"))
  );

  it("lit bien un ensemble de fichiers non vide", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("n'a aucune lecture de Candidacy filtrée par la relation election", () => {
    const offenders = files.flatMap((path) => {
      const code = readFileSync(join(ROOT, path), "utf8");
      // Parsing every file of src/ takes seconds; only the ones that name the model can offend.
      if (!code.includes("candidacy.")) return [];
      const lines = candidacyReadsThroughElectionRelation(path, code);
      return lines.length > (ALLOWED[path]?.count ?? 0)
        ? lines.map((line) => `${path}:${line}`)
        : [];
    });

    expect(offenders).toEqual([]);
  });

  it("ne garde pas d'exception périmée", () => {
    const stale = Object.entries(ALLOWED).flatMap(([path, { count }]) => {
      const found = candidacyReadsThroughElectionRelation(
        path,
        readFileSync(join(ROOT, path), "utf8")
      ).length;
      return found === count ? [] : [`${path} : ${count} déclarée(s), ${found} trouvée(s)`];
    });

    expect(stale).toEqual([]);
  });
});
