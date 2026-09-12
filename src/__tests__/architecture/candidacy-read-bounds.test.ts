import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/**
 * Unbounded reads of `Candidacy` outside the sync services.
 *
 * A findMany without a bound has already produced a 19 MB page, and a groupBy without one shipped
 * 375 368 rows to Node to read its length. The rule is not "always add a take": in
 * `src/app/api/admin/partis/[id]/route.ts` every presidential candidacy of the party must be
 * locked before the mutation, and a bound there would leave some unlocked.
 *
 * So this guard proves only what static analysis can prove: a positive integer `take` literal that
 * no later spread can overwrite, or an explicit entry below. It deliberately does not try to infer a bound from a `where` clause, which cannot be done
 * reliably: an `id: { in: [...] }` may sit inside a relation or one branch of an OR and bound
 * nothing.
 *
 * What it does NOT guarantee: `take` bounds the rows returned, not the work a GROUP BY does, which
 * PostgreSQL runs in full before limiting the output. This is a transfer and memory guard.
 *
 * Scope: this guard only sees direct `db.candidacy.findMany` / `.groupBy` (and `tx.candidacy.*`)
 * call sites. It is blind to relation loads, e.g. `db.election.findUnique({ include: { candidacies:
 * true } })`, which read the same unbounded rows without ever writing `db.candidacy.*`. A known
 * unguarded site of that shape is tracked in the task 5 report rather than here, since fixing it is
 * a public API contract decision, not a mechanical bound.
 */
const ALLOWED_UNBOUNDED = new Map<string, { count: number; reason: string }>([
  [
    "src/app/api/admin/partis/[id]/route.ts",
    {
      count: 1,
      reason:
        "verrouillage avant mutation : toutes les candidatures présidentielles du parti doivent être prises",
    },
  ],
  [
    "src/app/api/admin/politiques/[id]/route.ts",
    {
      count: 1,
      reason:
        "verrouillage avant mutation : toutes les candidatures présidentielles du politique doivent être prises",
    },
  ],
  [
    "src/lib/data/elections.ts",
    {
      count: 2,
      reason:
        "fiches commune 2020 et 2014 : toutes les listes/candidatures de la commune doivent apparaître, une borne en tronquerait certaines",
    },
  ],
  [
    "src/lib/data/municipales.ts",
    {
      count: 2,
      reason:
        "fiche commune (toutes les candidatures) et page cumul des mandats (tous les cumulards) : listes exhaustives par nature, une borne en tronquerait certaines",
    },
  ],
  [
    "src/lib/data/candidates.ts",
    {
      count: 2,
      reason:
        "modération d'une seule élection présidentielle et historique cross-cycle d'un seul politique : ensembles déjà bornés par le réel, l'exhaustivité conditionne leur exactitude",
    },
  ],
  [
    "src/lib/data/presidential-candidacy-field.ts",
    {
      count: 1,
      reason:
        "champ public complet d'une élection présidentielle : une borne en tronquerait des candidats",
    },
  ],
  [
    "src/lib/data/presidential-candidates-public.ts",
    {
      count: 1,
      reason:
        "champ public complet d'une élection présidentielle : une borne en tronquerait des candidats",
    },
  ],
  [
    "src/lib/data/presidentielle-2027.ts",
    {
      count: 1,
      reason:
        "champ admin complet d'une élection présidentielle : une borne en tronquerait des candidats",
    },
  ],
  [
    "src/app/admin/mesures/_data/queue-query.ts",
    {
      count: 1,
      reason:
        "liste de filtre de la file de modération : une borne masquerait des candidatures existantes sans signal pour l'utilisateur",
    },
  ],
  [
    "src/app/admin/mesures/_data/candidacies-query.ts",
    {
      count: 1,
      reason:
        "déjà borné par la constante MAX_CANDIDACIES (200) ; le détecteur n'accepte qu'un littéral, jamais une constante nommée",
    },
  ],
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [relative(ROOT, join(ROOT, path))]
      : [];
  });
}

const MAX_ALLOWED_TAKE = 10_000;

/**
 * The only bound this guard can actually prove: `take` set to a positive integer literal, with
 * nothing after it that could overwrite the property.
 *
 * `take: limit` is rejected even when `limit` holds a number at run time. Static analysis cannot
 * tell, and `take: undefined` is written exactly the same way here. `{ take: 50, ...options }` is
 * rejected too, since a later spread can replace the value; `{ ...options, take: 50 }` is accepted,
 * the literal winning. Dynamic bounds go through ALLOWED_UNBOUNDED, where a human states why they
 * are safe, which is the point: an unprovable bound becomes a written decision instead of an
 * assumption.
 */
function hasLiteralTake(argument: ts.ObjectLiteralExpression, file: ts.SourceFile): boolean {
  const index = argument.properties.findIndex(
    (property) => ts.isPropertyAssignment(property) && property.name.getText(file) === "take"
  );
  if (index === -1) return false;

  // `noUncheckedIndexedAccess` is on in tsconfig.json, so an indexed access is `T | undefined`
  // whatever the preceding bounds check says.
  const property = argument.properties[index];
  if (
    !property ||
    !ts.isPropertyAssignment(property) ||
    !ts.isNumericLiteral(property.initializer)
  ) {
    return false;
  }

  const value = Number(property.initializer.text);
  if (!Number.isInteger(value) || value <= 0 || value > MAX_ALLOWED_TAKE) return false;

  return !argument.properties.slice(index + 1).some(ts.isSpreadAssignment);
}

export function unboundedCandidacyReads(path: string, code: string): number[] {
  const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["findMany", "groupBy"].includes(node.expression.name.text) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === "candidacy"
    ) {
      const [argument] = node.arguments;
      const bounded =
        argument !== undefined &&
        ts.isObjectLiteralExpression(argument) &&
        hasLiteralTake(argument, file);

      if (!bounded) {
        lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return lines;
}

describe("détecteur de lectures non bornées", () => {
  const wrap = (call: string) => `declare const db: any;\nasync function f() { ${call} }`;

  it("accepte un take littéral", () => {
    expect(
      unboundedCandidacyReads("a.ts", wrap("await db.candidacy.findMany({ take: 50 });"))
    ).toEqual([]);
  });

  it("refuse take: undefined", () => {
    expect(
      unboundedCandidacyReads("a.ts", wrap("await db.candidacy.findMany({ take: undefined });"))
    ).toHaveLength(1);
  });

  it("refuse un take non littéral, qui peut valoir undefined à l'exécution", () => {
    expect(
      unboundedCandidacyReads("a.ts", wrap("await db.candidacy.findMany({ take: limit });"))
    ).toHaveLength(1);
  });

  it("refuse un take qu'un spread postérieur peut écraser", () => {
    expect(
      unboundedCandidacyReads(
        "a.ts",
        wrap("await db.candidacy.findMany({ take: 50, ...options });")
      )
    ).toHaveLength(1);
  });

  it("accepte un take littéral placé après le spread", () => {
    expect(
      unboundedCandidacyReads(
        "a.ts",
        wrap("await db.candidacy.findMany({ ...options, take: 50 });")
      )
    ).toEqual([]);
  });

  it("refuse un take littéral hors plage", () => {
    expect(
      unboundedCandidacyReads("a.ts", wrap("await db.candidacy.findMany({ take: 500000 });"))
    ).toHaveLength(1);
  });

  it("refuse un id: { in } qui ne borne rien, placé dans une relation", () => {
    expect(
      unboundedCandidacyReads(
        "a.ts",
        wrap("await db.candidacy.findMany({ where: { election: { id: { in: ids } } } });")
      )
    ).toHaveLength(1);
  });

  it("refuse un id: { in } dans une seule branche d'un OR", () => {
    expect(
      unboundedCandidacyReads(
        "a.ts",
        wrap(
          "await db.candidacy.findMany({ where: { OR: [{ id: { in: ids } }, { isElected: true }] } });"
        )
      )
    ).toHaveLength(1);
  });

  it("ne se laisse pas tromper par un commentaire", () => {
    expect(
      unboundedCandidacyReads(
        "a.ts",
        wrap("// id: { in: ids }\n await db.candidacy.groupBy({ by: ['communeId'] });")
      )
    ).toHaveLength(1);
  });

  it("attrape aussi un appel transactionnel", () => {
    expect(
      unboundedCandidacyReads("a.ts", wrap("await tx.candidacy.findMany({ where: { partyId } });"))
    ).toHaveLength(1);
  });

  it("ignore les lectures d'autres modèles", () => {
    expect(
      unboundedCandidacyReads("a.ts", wrap("await db.measure.findMany({ where: { id } });"))
    ).toEqual([]);
  });
});

describe("bornes des lectures de Candidacy", () => {
  const files = [...sourceFiles("src/lib/data"), ...sourceFiles("src/app")].filter(
    (path) =>
      !path.includes("__tests__") && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx")
  );

  it("lit bien un ensemble de fichiers non vide", () => {
    // Guards the read: an empty list would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(100);
  });

  it("n'a pas de lecture non bornée en dehors des exceptions déclarées", () => {
    const unexpected = files.flatMap((path) => {
      const lines = unboundedCandidacyReads(path, readFileSync(join(ROOT, path), "utf8"));
      const allowed = ALLOWED_UNBOUNDED.get(path)?.count ?? 0;
      return lines.length > allowed
        ? [`${path} : ${lines.length} non bornée(s), ${allowed} autorisée(s)`]
        : [];
    });

    expect(unexpected).toEqual([]);
  });

  it("ne garde pas d'exception périmée", () => {
    // An allowlist nobody prunes stops being a list of decisions and becomes noise.
    const stale = [...ALLOWED_UNBOUNDED.entries()].flatMap(([path, entry]) => {
      const lines = unboundedCandidacyReads(path, readFileSync(join(ROOT, path), "utf8"));
      return lines.length < entry.count
        ? [`${path} : ${entry.count} déclarée(s), ${lines.length} trouvée(s)`]
        : [];
    });

    expect(stale).toEqual([]);
  });
});
