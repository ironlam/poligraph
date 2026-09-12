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
 *
 * An entry earns its place in ALLOWED_UNBOUNDED only by falling into one of three families:
 * bounded by reality (one commune, one election, one politician — at most a few dozen rows);
 * exhaustiveness required by the correctness of the code, typically a lock taken before a
 * mutation, where a `take` would leave rows unlocked; or bounded by a named constant, which this
 * detector cannot see since it only accepts a literal. A display read that could simply take a
 * `take` — a dropdown, a paginable listing — falls into none of these and has no place here: bound
 * it instead.
 */
type AllowedEntry = { count: number; reason: string };
type AllowedUnbounded = Map<string, Map<string, AllowedEntry>>;

const ALLOWED_UNBOUNDED: AllowedUnbounded = new Map([
  [
    "src/app/api/admin/partis/[id]/route.ts",
    new Map([
      [
        "PUT",
        {
          count: 1,
          reason:
            "verrouillage avant mutation : toutes les candidatures présidentielles du parti doivent être prises",
        },
      ],
    ]),
  ],
  [
    "src/app/api/admin/politiques/[id]/route.ts",
    new Map([
      [
        "PUT",
        {
          count: 1,
          reason:
            "verrouillage avant mutation : toutes les candidatures présidentielles du politique doivent être prises",
        },
      ],
    ]),
  ],
  [
    "src/lib/data/elections.ts",
    new Map([
      [
        "getCommuneResults2020",
        {
          count: 1,
          reason:
            "fiche commune 2020 : toutes les listes/candidatures de la commune doivent apparaître, une borne en tronquerait certaines",
        },
      ],
      [
        "getCommuneResults2014",
        {
          count: 1,
          reason:
            "fiche commune 2014 : toutes les listes/candidatures de la commune doivent apparaître, une borne en tronquerait certaines",
        },
      ],
    ]),
  ],
  [
    "src/lib/data/municipales.ts",
    new Map([
      [
        "getCommune",
        {
          count: 1,
          reason:
            "fiche commune : toutes les candidatures doivent apparaître, liste exhaustive par nature, une borne en tronquerait certaines",
        },
      ],
      [
        "getCumulCandidates",
        {
          count: 1,
          reason:
            "page cumul des mandats : tous les cumulards doivent apparaître, liste exhaustive par nature, une borne en tronquerait certaines",
        },
      ],
    ]),
  ],
  [
    "src/lib/data/candidates.ts",
    new Map([
      [
        "getCandidates2027ForModeration",
        {
          count: 1,
          reason:
            "modération d'une seule élection présidentielle : ensemble déjà borné par le réel, l'exhaustivité conditionne son exactitude",
        },
      ],
      [
        "getCandidateCrossCycle",
        {
          count: 1,
          reason:
            "historique cross-cycle d'un seul politique : ensemble déjà borné par le réel, l'exhaustivité conditionne son exactitude",
        },
      ],
    ]),
  ],
  [
    "src/lib/data/presidential-candidacy-field.ts",
    new Map([
      [
        "getPublicPresidentialCandidacyField",
        {
          count: 1,
          reason:
            "champ public complet d'une élection présidentielle : une borne en tronquerait des candidats",
        },
      ],
    ]),
  ],
  [
    "src/lib/data/presidential-candidates-public.ts",
    new Map([
      [
        "getPublicPresidentialCandidates",
        {
          count: 1,
          reason:
            "champ public complet d'une élection présidentielle : une borne en tronquerait des candidats",
        },
      ],
    ]),
  ],
  [
    "src/lib/data/presidentielle-2027.ts",
    new Map([
      [
        "getPresidentielle2027Candidates",
        {
          count: 1,
          reason:
            "champ admin complet d'une élection présidentielle : une borne en tronquerait des candidats",
        },
      ],
    ]),
  ],
  [
    "src/app/admin/mesures/_data/queue-query.ts",
    new Map([
      [
        "listMeasureQueueCandidates",
        {
          count: 1,
          reason:
            "liste de filtre de la file de modération : une borne masquerait des candidatures existantes sans signal pour l'utilisateur",
        },
      ],
    ]),
  ],
  [
    "src/app/admin/mesures/_data/candidacies-query.ts",
    new Map([
      [
        "listPresidentialCandidacies",
        {
          count: 1,
          reason:
            "déjà borné par la constante MAX_CANDIDACIES (200) ; le détecteur n'accepte qu'un littéral, jamais une constante nommée",
        },
      ],
    ]),
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

/**
 * Reads a source file for the guard, turning a raw `ENOENT` into a message that names the file and
 * says why it matters here: an `ALLOWED_UNBOUNDED` entry pointing at it is stale (the file was
 * renamed or removed), not a generic filesystem failure in the middle of a test run.
 */
function readSourceFile(path: string): string {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `${path} est introuvable : l'entrée d'exception dans ALLOWED_UNBOUNDED est périmée (fichier renommé ou supprimé).`
      );
    }
    throw error;
  }
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

/**
 * Nearest top-level module binding enclosing `node` (`export const NAME = ...`), used only when
 * `node` sits inside nothing but anonymous callbacks — a HOC-composed route handler such as
 * `export const PUT = withAdminAuth(withValidation(schema, async (req) => {...}))`, where neither
 * callback has a name of its own. `PUT` is the only stable label left for that shape.
 */
function topLevelBindingName(node: ts.Node, file: ts.SourceFile): string | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      ts.isVariableDeclarationList(current.parent) &&
      ts.isVariableStatement(current.parent.parent) &&
      current.parent.parent.parent === file
    ) {
      return current.name.text;
    }
    current = current.parent;
  }
  return undefined;
}

/**
 * Name of the function enclosing `node`, the stable location an `ALLOWED_UNBOUNDED` entry is
 * anchored to instead of a raw count: a file exempted by count can bound the one reviewed read and
 * add an unrelated unbounded one for free, since the total never changes. Anchoring to the
 * enclosing function name closes that hole.
 *
 * Walks up looking for a `FunctionDeclaration`, a `MethodDeclaration`, a named function
 * expression, or an arrow/anonymous function expression directly assigned to a variable
 * (`const f = async () => {}`). When the nearest enclosing function is itself anonymous — a
 * callback passed straight to a call, with no binding of its own — the search continues outward
 * to the nearest top-level exported binding, per `topLevelBindingName`.
 */
function enclosingFunctionName(node: ts.Node, file: ts.SourceFile): string | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if (ts.isFunctionExpression(current) && current.name) {
      return current.name.text;
    }
    if (
      (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return topLevelBindingName(node, file);
}

export type UnboundedRead = { line: number; functionName: string };

export function unboundedCandidacyReads(path: string, code: string): UnboundedRead[] {
  const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reads: UnboundedRead[] = [];

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
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        const functionName = enclosingFunctionName(node, file);
        if (functionName === undefined) {
          throw new Error(
            `${path}:${line} — lecture non bornée de Candidacy hors de toute fonction nommée ; ` +
              "impossible de construire une clé d'exception stable (voir ALLOWED_UNBOUNDED dans candidacy-read-bounds.test.ts)."
          );
        }
        reads.push({ line, functionName });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return reads;
}

/** Number of unbounded reads found per function, for one file. */
function unboundedCountsByFunction(
  path: string,
  readFile: (path: string) => string
): Map<string, number> {
  const reads = unboundedCandidacyReads(path, readFile(path));
  const counts = new Map<string, number>();
  for (const read of reads) {
    counts.set(read.functionName, (counts.get(read.functionName) ?? 0) + 1);
  }
  return counts;
}

/**
 * Functions with more unbounded reads than their declared count — either a function absent from
 * the allowlist entirely, or one already declared whose count no longer matches. A presence check
 * alone (`Map.has`) would let a declared function accumulate any number of unreviewed reads behind
 * a single approved name; comparing counts closes that.
 */
function findUnexpectedReads(
  files: string[],
  allowed: AllowedUnbounded,
  readFile: (path: string) => string
): string[] {
  return files.flatMap((path) => {
    const counts = unboundedCountsByFunction(path, readFile);
    const allowedFunctions = allowed.get(path);
    return [...counts.entries()].flatMap(([functionName, count]) => {
      const allowedCount = allowedFunctions?.get(functionName)?.count ?? 0;
      return count > allowedCount
        ? [`${path} dans ${functionName} : ${count} non bornée(s), ${allowedCount} autorisée(s)`]
        : [];
    });
  });
}

/** Declared exceptions whose function no longer exists, or now contains fewer unbounded reads than declared. */
function findStaleExceptions(
  allowed: AllowedUnbounded,
  readFile: (path: string) => string
): string[] {
  return [...allowed.entries()].flatMap(([path, functions]) => {
    const counts = unboundedCountsByFunction(path, readFile);
    return [...functions.entries()].flatMap(([functionName, { count: allowedCount }]) => {
      const observed = counts.get(functionName) ?? 0;
      return observed < allowedCount
        ? [`${path} : ${functionName} déclare ${allowedCount}, ${observed} trouvée(s)`]
        : [];
    });
  });
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

describe("allowlist ancrée par fonction (pas par compte)", () => {
  it("signale une lecture non déclarée même si le fichier a d'autres exceptions", () => {
    const code = [
      "declare const db: any;",
      "async function fonctionDeclaree() {",
      "  await db.candidacy.findMany({ where: { id } });",
      "}",
      "async function fonctionNonDeclaree() {",
      "  await db.candidacy.findMany({ where: { id } });",
      "}",
    ].join("\n");
    const allowed: AllowedUnbounded = new Map([
      ["fake.ts", new Map([["fonctionDeclaree", { count: 1, reason: "raison de test" }]])],
    ]);

    const unexpected = findUnexpectedReads(["fake.ts"], allowed, () => code);

    expect(unexpected).toHaveLength(1);
    expect(unexpected[0]).toContain("fonctionNonDeclaree");
  });

  it("signale une exception périmée dont la fonction n'existe plus", () => {
    const code =
      "declare const db: any;\nasync function fonctionActuelle() { await db.candidacy.findMany({ take: 50 }); }";
    const allowed: AllowedUnbounded = new Map([
      ["fake.ts", new Map([["fonctionRenommee", { count: 1, reason: "raison de test" }]])],
    ]);

    const stale = findStaleExceptions(allowed, () => code);

    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain("fonctionRenommee");
  });

  it("signale une exception périmée dont la fonction est redevenue bornée", () => {
    const code =
      "declare const db: any;\nasync function fonctionCorrigee() { await db.candidacy.findMany({ take: 50 }); }";
    const allowed: AllowedUnbounded = new Map([
      ["fake.ts", new Map([["fonctionCorrigee", { count: 1, reason: "raison de test" }]])],
    ]);

    const stale = findStaleExceptions(allowed, () => code);

    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain("fonctionCorrigee");
  });

  it("produit un message clair pour un appel hors de toute fonction nommée", () => {
    expect(() =>
      unboundedCandidacyReads(
        "a.ts",
        "declare const db: any;\nvoid db.candidacy.findMany({ where: { id } });"
      )
    ).toThrow(/hors de toute fonction nommée/);
  });

  it("signale clairement une entrée d'exception dont le fichier a disparu", () => {
    const missing: AllowedUnbounded = new Map([
      [
        "src/lib/data/ce-fichier-n-existe-plus.ts",
        new Map([["x", { count: 1, reason: "raison de test" }]]),
      ],
    ]);

    expect(() => findStaleExceptions(missing, readSourceFile)).toThrow(/introuvable/);
  });

  // Handlers composed by higher-order functions (`export const PUT = withAdminAuth(withValidation(
  // schema, async (req, ctx, body) => {...}))`) resolve every call inside them to the same
  // top-level name (`PUT`, see `topLevelBindingName`). A presence check on that name would let any
  // number of unreviewed reads hide behind one approved handler; only a count comparison catches it.
  const hocHandlerCode = (readCount: number) =>
    [
      "declare const db: any;",
      "declare function withAdminAuth(fn: unknown): unknown;",
      "declare function withValidation(schema: unknown, fn: unknown): unknown;",
      "declare const schema: unknown;",
      "export const PUT = withAdminAuth(",
      "  withValidation(schema, async (req: unknown, ctx: unknown, body: unknown) => {",
      ...Array.from(
        { length: readCount },
        () => "    await db.candidacy.findMany({ where: { id } });"
      ),
      "  })",
      ");",
    ].join("\n");

  it("un handler composé par HOC déclaré à 1 lecture qui en contient 2 échoue", () => {
    const allowed: AllowedUnbounded = new Map([
      ["fake-route.ts", new Map([["PUT", { count: 1, reason: "raison de test" }]])],
    ]);

    const unexpected = findUnexpectedReads(["fake-route.ts"], allowed, () => hocHandlerCode(2));

    expect(unexpected).toHaveLength(1);
    expect(unexpected[0]).toContain("PUT");
  });

  it("un handler composé par HOC déclaré à 1 lecture qui en contient 1 passe", () => {
    const allowed: AllowedUnbounded = new Map([
      ["fake-route.ts", new Map([["PUT", { count: 1, reason: "raison de test" }]])],
    ]);

    const unexpected = findUnexpectedReads(["fake-route.ts"], allowed, () => hocHandlerCode(1));

    expect(unexpected).toEqual([]);
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
    const unexpected = findUnexpectedReads(files, ALLOWED_UNBOUNDED, readSourceFile);

    expect(unexpected).toEqual([]);
  });

  it("ne garde pas d'exception périmée", () => {
    // An allowlist nobody prunes stops being a list of decisions and becomes noise.
    const stale = findStaleExceptions(ALLOWED_UNBOUNDED, readSourceFile);

    expect(stale).toEqual([]);
  });
});
