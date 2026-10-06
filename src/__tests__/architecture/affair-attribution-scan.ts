/**
 * Scanner du garde d'attribution des affaires. Voir `affair-attribution-guard.test.ts`.
 *
 * Trois familles de findings, lues dans l'AST (les commentaires n'y figurent pas) :
 * - `involvement-filter` : propriété `involvement` d'un littéral objet (hors `true`/`false` de
 *   select et hors copie du champ `a.involvement`), `involvement IN | NOT IN | = | <>` dans un
 *   gabarit SQL, comparaison en mémoire `.involvement ===|!==|==|!=` (hors test de nullité),
 *   tableau littéral de valeurs de l'enum, `X.includes|has(a.involvement)` quand `X` ne vient
 *   pas de public-filters ;
 * - `affair-sink` : `db.affair.count|groupBy|findMany|findFirst|aggregate`, filtre de relation
 *   `affairs|affairsAtTime: { some | every | none | where }`, `_count.select.affairs`, SQL brut qui
 *   lit "Affair", dont le prédicat ne vient pas d'un helper approuvé de public-filters ;
 * - `raw-classification` : `getCertaintyLevel` ou `getJudicialMaturity` appelé (ou passé en
 *   callback) hors `src/config/` et `public-filters.ts`.
 *
 * `public-filters.ts` et `src/config/certainty.ts` ne sont pas scannés : ils définissent le
 * prédicat et la classification que le garde exige ailleurs.
 *
 * Limite assumée : le garde lit la forme écrite dans le fichier. Il suit une constante locale,
 * résolue par portée (`const where = { ...getAdverseAffairWhere() }`), mais pas un prédicat construit dans un autre
 * module ; dans ce cas le sink est signalé et l'occurrence se documente. Un spread approuvé
 * approuve tout l'objet : une surcharge voisine ou un NOT dans le même where n'est pas inspecté,
 * et getPublishedAffairWhere / getDocumentaryAffairWhere approuvent des sinks qui ne sont pas des
 * comptes à charge. La justesse à charge relève des tests sur la fixture partagée, pas de ce garde.
 */

import ts from "typescript";

export type FindingKind = "involvement-filter" | "affair-sink" | "raw-classification";

export type Finding = { path: string; line: number; kind: FindingKind; snippet: string };

/**
 * Entrée d'une liste du garde. `snippet` est la ligne signalée, réduite de ses espaces de bord ;
 * `count` est le nombre exact de findings qu'elle couvre (deux lignes identiques dans un fichier
 * comptent pour deux, comme deux findings de nature différente sur une même ligne).
 */
export type CoverageEntry = { path: string; snippet: string; count: number };

export type AllowedOccurrence = CoverageEntry & {
  nature:
    | "documentary-facet"
    | "identity-check"
    | "enum-listing"
    | "role-display"
    | "adverse-prefiltered"
    | "adverse-inline";
  reason: string;
};

/**
 * Écart connu et reporté. `owner` dit qui le ferme (« PR B » pour le badge de probité et les
 * compteurs de condamnation définitive, « suivi hors PR A » sinon), `reason` ce qui reste à faire.
 */
export type DebtEntry = CoverageEntry & {
  owner: "PR B" | "suivi hors PR A";
  reason: string;
};

export type Coverage = {
  /** Findings qu'aucune entrée ne couvre. */
  unlisted: Finding[];
  /** Entrées dont le nombre de findings couverts diffère de `count`. */
  miscounted: string[];
  /** Entrées déclarées deux fois (même fichier, même ligne). */
  duplicated: string[];
};

/** Rapproche les findings des entrées : égalité exacte de ligne, nombre exact d'occurrences. */
export function checkCoverage(findings: Finding[], entries: CoverageEntry[]): Coverage {
  const key = (path: string, snippet: string): string => `${path}\u0000${snippet}`;
  const expected = new Map<string, CoverageEntry>();
  const duplicated: string[] = [];
  for (const entry of entries) {
    const k = key(entry.path, entry.snippet);
    if (expected.has(k)) duplicated.push(`${entry.path}: ${entry.snippet}`);
    else expected.set(k, entry);
  }

  const actual = new Map<string, number>();
  const unlisted: Finding[] = [];
  for (const finding of findings) {
    const k = key(finding.path, finding.snippet);
    if (!expected.has(k)) unlisted.push(finding);
    else actual.set(k, (actual.get(k) ?? 0) + 1);
  }

  const miscounted = [...expected.entries()]
    .filter(([k, entry]) => (actual.get(k) ?? 0) !== entry.count)
    .map(
      ([k, entry]) =>
        `${entry.path}: ${entry.snippet} (attendu ${entry.count}, trouvé ${actual.get(k) ?? 0})`
    );

  return { unlisted, miscounted, duplicated };
}

const PUBLIC_FILTERS_MODULE = "@/lib/affairs/public-filters";

const APPROVED_HELPERS = new Set([
  "getAdverseAffairWhere",
  "getConvictionOnlyWhere",
  "getDefinitiveConvictionWhere",
  "getNonDefinitiveConvictionWhere",
  "getProbityConvictionBadgeWhere",
  "getPoliticalFinancingBadgeWhere",
  "getMisEnCauseWhere",
  "getFavorableOutcomeWhere",
  "getDocumentaryAffairWhere",
  "getPublishedAffairWhere",
  "getAdverseInvolvementSql",
  "getPublishedAffairSqlWhere",
  "getProbityConvictionBadgeSql",
]);

const SINK_METHODS = new Set(["count", "groupBy", "findMany", "findFirst", "aggregate"]);

/** Relations Prisma vers `Affair[]` : `Politician.affairs`, `Party.affairsAtTime`. */
const AFFAIR_RELATIONS = new Set(["affairs", "affairsAtTime"]);

const RELATION_PREDICATES = new Set(["some", "every", "none", "where"]);

const CLASSIFIERS = new Set(["getCertaintyLevel", "getJudicialMaturity"]);

/** Sources canoniques du prédicat et de la classification : elles définissent ce que le garde exige. */
const CANONICAL_FILES = new Set(["src/lib/affairs/public-filters.ts", "src/config/certainty.ts"]);

const COMPARISON_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

const SQL_INVOLVEMENT = /involvement"?\s*(NOT\s+IN\b|IN\b|=|<>|!=)/gi;

/** Valeurs de l'enum `Involvement`. */
const INVOLVEMENT_VALUES = new Set(["DIRECT", "INDIRECT", "MENTIONED_ONLY", "VICTIM", "PLAINTIFF"]);

/** Gabarit étiqueté qui porte du SQL : `Prisma.sql`, `sql`, `db.$queryRaw`, `db.$executeRaw`. */
const SQL_TAG = /(^|\.)(sql|\$queryRaw|\$executeRaw)$/i;

/** Appel qui reçoit une chaîne SQL brute. */
const SQL_CALL = /(^|\.)(\$queryRawUnsafe|\$executeRawUnsafe|raw)$/;

interface Context {
  path: string;
  file: ts.SourceFile;
  lines: string[];
  approvedLocals: Set<string>;
  /** Tous les noms importés de public-filters (helpers et constantes, dont ADVERSE_INVOLVEMENTS). */
  filtersImports: Set<string>;
  findings: Finding[];
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function report(ctx: Context, node: ts.Node, kind: FindingKind, position?: number): void {
  const start = position ?? node.getStart(ctx.file);
  const line = ctx.file.getLineAndCharacterOfPosition(start).line + 1;
  ctx.findings.push({ path: ctx.path, line, kind, snippet: (ctx.lines[line - 1] ?? "").trim() });
}

function collectApprovedImports(ctx: Context): void {
  const fileDir = ctx.path.slice(0, ctx.path.lastIndexOf("/"));
  for (const statement of ctx.file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const fromFilters =
      specifier === PUBLIC_FILTERS_MODULE ||
      (fileDir === "src/lib/affairs" && specifier === "./public-filters");
    if (!fromFilters) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      ctx.filtersImports.add(element.name.text);
      if (APPROVED_HELPERS.has(imported)) ctx.approvedLocals.add(element.name.text);
    }
  }
}

function bindsName(name: ts.BindingName, text: string): boolean {
  if (ts.isIdentifier(name)) return name.text === text;
  return name.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindsName(element.name, text)
  );
}

/**
 * Initialiseur de la constante que désigne `identifier`, résolue par portée : on remonte les
 * blocs englobants jusqu'à la première déclaration du nom. Un paramètre, un `let`, une
 * déstructuration ou une variable de boucle du même nom arrêtent la résolution (non approuvé).
 */
function resolveConst(identifier: ts.Identifier): ts.Expression | undefined {
  const text = identifier.text;
  let node: ts.Node | undefined = identifier.parent;

  while (node !== undefined) {
    if (ts.isFunctionLike(node)) {
      if (node.parameters.some((parameter) => bindsName(parameter.name, text))) return undefined;
    }
    if (
      (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
      node.initializer !== undefined &&
      ts.isVariableDeclarationList(node.initializer) &&
      node.initializer.declarations.some((declaration) => bindsName(declaration.name, text))
    ) {
      return undefined;
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      if (bindsName(node.variableDeclaration.name, text)) return undefined;
    }

    const statements =
      ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)
        ? node.statements
        : ts.isCaseClause(node) || ts.isDefaultClause(node)
          ? node.statements
          : undefined;
    if (statements !== undefined) {
      for (const statement of statements) {
        if (
          (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
          statement.name?.text === text
        ) {
          return undefined;
        }
        if (!ts.isVariableStatement(statement)) continue;
        const list = statement.declarationList;
        for (const declaration of list.declarations) {
          if (!bindsName(declaration.name, text)) continue;
          const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
          return isConst && ts.isIdentifier(declaration.name) ? declaration.initializer : undefined;
        }
      }
    }
    node = node.parent;
  }
  return undefined;
}

function isApprovedCall(ctx: Context, expression: ts.Expression): boolean {
  const node = unwrap(expression);
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ctx.approvedLocals.has(node.expression.text)
  );
}

/** Le prédicat Prisma passé à un sink vient-il d'un helper approuvé ? */
function isApprovedWhere(ctx: Context, expression: ts.Expression, depth = 0): boolean {
  if (depth > 5) return false;
  const node = unwrap(expression);

  if (isApprovedCall(ctx, node)) return true;

  if (ts.isIdentifier(node)) {
    const initializer = resolveConst(node);
    return initializer !== undefined && isApprovedWhere(ctx, initializer, depth + 1);
  }

  if (ts.isConditionalExpression(node)) {
    return (
      isApprovedWhere(ctx, node.whenTrue, depth + 1) &&
      isApprovedWhere(ctx, node.whenFalse, depth + 1)
    );
  }

  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property) && isApprovedWhere(ctx, property.expression, depth + 1)) {
        return true;
      }
      if (
        ts.isPropertyAssignment(property) &&
        propertyName(property.name) === "AND" &&
        ts.isArrayLiteralExpression(unwrap(property.initializer))
      ) {
        const elements = (unwrap(property.initializer) as ts.ArrayLiteralExpression).elements;
        if (elements.some((element) => isApprovedWhere(ctx, element, depth + 1))) return true;
      }
    }
  }

  return false;
}

/** Un gabarit SQL reçoit-il un fragment approuvé (directement ou via une constante locale) ? */
function isApprovedSql(ctx: Context, template: ts.TemplateLiteral, depth = 0): boolean {
  if (depth > 5 || !ts.isTemplateExpression(template)) return false;
  return template.templateSpans.some((span) => {
    const expression = unwrap(span.expression);
    if (isApprovedCall(ctx, expression)) return true;
    if (!ts.isIdentifier(expression)) return false;
    const initializer = resolveConst(expression);
    if (initializer === undefined) return false;
    const resolved = unwrap(initializer);
    const nested = ts.isTaggedTemplateExpression(resolved) ? resolved.template : resolved;
    return ts.isTemplateLiteral(nested) && isApprovedSql(ctx, nested, depth + 1);
  });
}

function templateText(template: ts.TemplateLiteral): string {
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text;
  return [template.head.text, ...template.templateSpans.map((span) => span.literal.text)].join(
    " ${} "
  );
}

function isSqlTemplate(template: ts.TemplateLiteral): boolean {
  const parent = template.parent;
  if (ts.isTaggedTemplateExpression(parent)) {
    // Les arguments de type (`db.$queryRaw<Row[]>`) ne font pas partie de `tag`.
    return SQL_TAG.test(parent.tag.getText());
  }
  return (
    ts.isCallExpression(parent) &&
    parent.arguments.includes(template) &&
    SQL_CALL.test(parent.expression.getText())
  );
}

function scanTemplate(ctx: Context, template: ts.TemplateLiteral): void {
  if (!isSqlTemplate(template)) return;
  const text = templateText(template);

  if (/"Affair"/.test(text) && !isApprovedSql(ctx, template)) {
    report(ctx, template.parent, "affair-sink");
  }

  // Position réelle de chaque `involvement` dans le gabarit, pour pointer la ligne SQL fautive.
  const raw = template.getText(ctx.file);
  const start = template.getStart(ctx.file);
  for (const match of raw.matchAll(SQL_INVOLVEMENT)) {
    report(ctx, template, "involvement-filter", start + (match.index ?? 0));
  }
}

function isNullish(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  return (
    node.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(node) && node.text === "undefined")
  );
}

/** Lecture simple du champ (`a.involvement`, `LABELS[a.involvement]`) : une copie, pas un filtre. */
function isFieldCopy(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  if (ts.isPropertyAccessExpression(node)) return node.name.text === "involvement";
  return ts.isElementAccessExpression(node) && isInvolvementOperand(node.argumentExpression);
}

/** Tableau littéral dont chaque élément est une valeur de l'enum Involvement. */
function isInvolvementSet(node: ts.ArrayLiteralExpression): boolean {
  return (
    node.elements.length > 0 &&
    node.elements.every((element) => {
      const value = unwrap(element);
      return ts.isStringLiteral(value) && INVOLVEMENT_VALUES.has(value.text);
    })
  );
}

/** Ensemble d'implications qui vient de public-filters (import direct ou constante dérivée). */
function isSharedInvolvementSet(ctx: Context, expression: ts.Expression): boolean {
  const node = unwrap(expression);
  if (!ts.isIdentifier(node)) return false;
  if (ctx.filtersImports.has(node.text)) return true;
  const initializer = resolveConst(node);
  if (initializer === undefined) return false;
  let derived = false;
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child) && ctx.filtersImports.has(child.text)) derived = true;
    child.forEachChild(visit);
  };
  visit(initializer);
  return derived;
}

function isInvolvementOperand(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  if (ts.isPropertyAccessExpression(node)) return node.name.text === "involvement";
  return ts.isIdentifier(node) && node.text === "involvement";
}

function isPrismaRoot(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && (expression.text === "db" || expression.text === "prisma");
}

function scanAffairDelegateCall(ctx: Context, node: ts.CallExpression): void {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || !SINK_METHODS.has(callee.name.text)) return;
  const delegate = callee.expression;
  if (
    !ts.isPropertyAccessExpression(delegate) ||
    delegate.name.text !== "affair" ||
    !isPrismaRoot(delegate.expression)
  ) {
    return;
  }

  const args = node.arguments[0] ? unwrap(node.arguments[0]) : undefined;
  let where: ts.Expression | undefined;
  if (args && ts.isObjectLiteralExpression(args)) {
    for (const property of args.properties) {
      if (ts.isPropertyAssignment(property) && propertyName(property.name) === "where") {
        where = property.initializer;
      } else if (ts.isShorthandPropertyAssignment(property) && property.name.text === "where") {
        where = property.name;
      }
    }
  }

  if (where === undefined || !isApprovedWhere(ctx, where)) report(ctx, node, "affair-sink");
}

/** `affairs` est-il la clé de `_count: { select: { affairs } }` ? */
function isCountSelect(property: ts.ObjectLiteralElementLike): boolean {
  const selectObject = property.parent;
  const selectProperty = selectObject.parent;
  if (!ts.isPropertyAssignment(selectProperty) || propertyName(selectProperty.name) !== "select") {
    return false;
  }
  const countProperty = selectProperty.parent.parent;
  return ts.isPropertyAssignment(countProperty) && propertyName(countProperty.name) === "_count";
}

function scanRelation(ctx: Context, property: ts.PropertyAssignment): void {
  const value = unwrap(property.initializer);

  if (isCountSelect(property) && value.kind === ts.SyntaxKind.TrueKeyword) {
    report(ctx, property, "affair-sink");
    return;
  }

  if (!ts.isObjectLiteralExpression(value)) return;
  for (const inner of value.properties) {
    if (!ts.isPropertyAssignment(inner)) continue;
    const name = propertyName(inner.name);
    if (name === undefined || !RELATION_PREDICATES.has(name)) continue;
    if (!isApprovedWhere(ctx, inner.initializer)) report(ctx, property, "affair-sink");
  }
}

function scanNode(ctx: Context, node: ts.Node): void {
  if (ts.isCallExpression(node)) {
    scanAffairDelegateCall(ctx, node);

    // Appartenance en mémoire : `SET.includes(a.involvement)`, `SET.has(involvement)`.
    const callee = node.expression;
    const [argument] = node.arguments;
    if (
      ts.isPropertyAccessExpression(callee) &&
      (callee.name.text === "includes" || callee.name.text === "has") &&
      node.arguments.length === 1 &&
      argument !== undefined &&
      isInvolvementOperand(argument) &&
      !isSharedInvolvementSet(ctx, callee.expression)
    ) {
      report(ctx, node, "involvement-filter");
    }

    if (ts.isIdentifier(node.expression) && CLASSIFIERS.has(node.expression.text)) {
      report(ctx, node, "raw-classification");
    }
    for (const argument of node.arguments) {
      if (ts.isIdentifier(argument) && CLASSIFIERS.has(argument.text)) {
        report(ctx, argument, "raw-classification");
      }
    }
  }

  if (ts.isTaggedTemplateExpression(node)) {
    scanTemplate(ctx, node.template);
  } else if (
    (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    !ts.isTaggedTemplateExpression(node.parent)
  ) {
    scanTemplate(ctx, node);
  }

  if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.parent)) {
    const name = propertyName(node.name);
    if (name === "involvement") {
      const kind = unwrap(node.initializer).kind;
      const isSelect = kind === ts.SyntaxKind.TrueKeyword || kind === ts.SyntaxKind.FalseKeyword;
      if (!isSelect && !isFieldCopy(node.initializer)) {
        report(ctx, node, "involvement-filter");
      }
    }
    if (name !== undefined && AFFAIR_RELATIONS.has(name)) scanRelation(ctx, node);
  }

  if (ts.isShorthandPropertyAssignment(node) && node.name.text === "involvement") {
    report(ctx, node, "involvement-filter");
  }

  if (ts.isArrayLiteralExpression(node) && isInvolvementSet(node)) {
    report(ctx, node, "involvement-filter");
  }

  if (
    ts.isBinaryExpression(node) &&
    COMPARISON_OPERATORS.has(node.operatorToken.kind) &&
    (isInvolvementOperand(node.left) || isInvolvementOperand(node.right)) &&
    !isNullish(node.left) &&
    !isNullish(node.right)
  ) {
    report(ctx, node, "involvement-filter");
  }
}

export function scanAffairAttribution(files: { path: string; source: string }[]): Finding[] {
  const findings: Finding[] = [];

  for (const { path, source } of files) {
    if (CANONICAL_FILES.has(path)) continue;
    const classificationAllowed = path.startsWith("src/config/");

    const ctx: Context = {
      path,
      file: ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      ),
      lines: source.split("\n"),
      approvedLocals: new Set(),
      filtersImports: new Set(),
      findings: [],
    };
    collectApprovedImports(ctx);

    const walk = (node: ts.Node): void => {
      scanNode(ctx, node);
      node.forEachChild(walk);
    };
    walk(ctx.file);

    const seen = new Set<string>();
    for (const finding of ctx.findings) {
      if (classificationAllowed && finding.kind === "raw-classification") continue;
      const key = `${finding.line}:${finding.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(finding);
    }
  }

  return findings;
}

/** Exceptions assumées, une par occurrence. */
export const ALLOWED: AllowedOccurrence[] = [
  {
    path: "src/app/api/affaires/neighbors/route.ts",
    snippet:
      'mode === "victime" ? ["VICTIM", "PLAINTIFF"] : ["DIRECT", "INDIRECT", "MENTIONED_ONLY"];',
    count: 1,
    nature: "documentary-facet",
    reason:
      "Navigation précédent/suivant du listing /affaires : même périmètre que la liste affichée.",
  },
  {
    path: "src/lib/affairs/involvement-note.ts",
    snippet: "const REQUIRES_NOTE: ReadonlySet<Involvement> = new Set<Involvement>([",
    count: 1,
    nature: "enum-listing",
    reason:
      "Implications qui exigent une note sourcée avant publication : règle de modération, pas un agrégat.",
  },
  {
    path: "src/lib/affairs/involvement-note.ts",
    snippet: "return REQUIRES_NOTE.has(involvement);",
    count: 1,
    nature: "enum-listing",
    reason: "Test d'appartenance à REQUIRES_NOTE, même règle de modération.",
  },
  {
    path: "src/lib/politicians/judicial-counts.ts",
    snippet: '(x) => x.involvement === "DIRECT" && x.jurisdictionOrder === "PENAL"',
    count: 1,
    nature: "adverse-inline",
    reason:
      "computeJudicialCounts : recopie en mémoire la partie implication et ordre du prédicat à charge (ADVERSE_INVOLVEMENTS, ADVERSE_JURISDICTION_ORDER) au lieu de l'importer ; chaque compteur filtre ensuite ses statuts. À réaligner si ADVERSE_INVOLVEMENTS change.",
  },
  {
    path: "src/lib/politicians/judicial-counts.ts",
    snippet:
      'proceduresEnCours: direct.filter((x) => getJudicialMaturity(x.status) === "PROCEDURE_VALIDEE")',
    count: 1,
    nature: "adverse-prefiltered",
    reason:
      "computeJudicialCounts : `direct` est déjà filtré sur DIRECT et l'ordre pénal juste au-dessus.",
  },
  {
    path: "src/lib/politicians/judicial-counts.ts",
    snippet: '(x) => x.involvement === "VICTIM" || x.involvement === "PLAINTIFF"',
    count: 1,
    nature: "role-display",
    reason:
      "computeJudicialCounts : compte victime ou plaignant, affiché comme un rôle, jamais à charge.",
  },
  {
    path: "src/lib/politicians/judicial-counts.ts",
    snippet: '(x) => x.involvement === "INDIRECT" || x.involvement === "MENTIONED_ONLY"',
    count: 1,
    nature: "role-display",
    reason:
      "computeJudicialCounts : un témoin est compté avec les mentions, pas avec les mis en cause.",
  },
  {
    path: "src/lib/affairs/probity-stats.ts",
    snippet: "const level = getCertaintyLevel(row.status);",
    count: 1,
    nature: "adverse-prefiltered",
    reason:
      "getProbityStats : lignes déjà limitées à DIRECT et à l'ordre pénal par getDocumentaryAffairWhere(ADVERSE_INVOLVEMENTS).",
  },
  {
    path: "src/lib/data/affairs.ts",
    snippet: "counts[getCertaintyLevel(row.status)] += row._count;",
    count: 1,
    nature: "documentary-facet",
    reason:
      "getCertaintyFacetCounts : options du filtre par stade de /affaires, même périmètre que les cartes listées (getDocumentaryAffairWhere), rien n'est compté à charge.",
  },
  {
    path: "src/lib/data/hemicycle.ts",
    snippet: "const level = getCertaintyLevel(a.status);",
    count: 1,
    nature: "adverse-prefiltered",
    reason: "getHemicycleData : affaires déjà filtrées par getAdverseAffairWhere().",
  },
  {
    path: "src/lib/data/statistics.ts",
    snippet: "const tier = getJudicialMaturity(a.status);",
    count: 1,
    nature: "adverse-prefiltered",
    reason:
      "getJudicialData : byStatus déjà limité à DIRECT et à l'ordre pénal (directFilter, getDocumentaryAffairWhere(ADVERSE_INVOLVEMENTS)).",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: "const maturity = getJudicialMaturity(a.status as AffairStatus);",
    count: 1,
    nature: "adverse-prefiltered",
    reason:
      "getPartyAffairsData : misEnCauseAffairs déjà limité à la personne mise en cause (isAccusedInvolvement) et à l'ordre pénal.",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: '(a) => getJudicialMaturity(a.status as AffairStatus) === "CONDAMNATION"',
    count: 1,
    nature: "adverse-prefiltered",
    reason: "getPartyAffairsData : même liste misEnCauseAffairs, DIRECT et ordre pénal.",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: '(a) => getJudicialMaturity(a.status as AffairStatus) === "PROCEDURE_VALIDEE"',
    count: 1,
    nature: "adverse-prefiltered",
    reason: "getPartyAffairsData : même liste misEnCauseAffairs, DIRECT et ordre pénal.",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: '(a) => getJudicialMaturity(a.status as AffairStatus) === "ENQUETE"',
    count: 1,
    nature: "adverse-prefiltered",
    reason: "getPartyAffairsData : même liste misEnCauseAffairs, DIRECT et ordre pénal.",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: '(a) => getJudicialMaturity(a.status as AffairStatus) === "CLOSE_SANS_CONDAMNATION"',
    count: 1,
    nature: "adverse-prefiltered",
    reason: "getPartyAffairsData : même liste misEnCauseAffairs, DIRECT et ordre pénal.",
  },
  {
    path: "src/lib/data/affairs.ts",
    snippet: "const level = getCertaintyLevel(row.status);",
    count: 1,
    nature: "adverse-prefiltered",
    reason: "getAdverseCertaintyCounts : lignes déjà filtrées par getAdverseAffairWhere().",
  },
  {
    path: "src/components/affairs/PartyAffairsList.tsx",
    snippet: "return getJudicialMaturity(affair.status as AffairStatus);",
    count: 1,
    nature: "adverse-prefiltered",
    reason:
      "attributedMaturity : appelé seulement après isAccusedInvolvement et l'ordre pénal testés juste au-dessus, comme les compteurs de la page de parti ; une affaire où l'élu n'est pas mis en cause ne reçoit aucun onglet de stade et ne figure que sous « Toutes ».",
  },
  {
    path: "src/app/api/affaires/route.ts",
    snippet:
      'const involvementValues = involvement !== null ? involvement.split(",") : ["DIRECT"];',
    count: 1,
    nature: "documentary-facet",
    reason:
      "API /api/affaires : périmètre d'implication choisi par le réutilisateur (DIRECT par défaut) ; chaque ligne porte semantics.statusAppliesToPolitician et countedInAdverseAggregates, rien n'y est compté à charge.",
  },
  {
    path: "src/app/api/affaires/route.ts",
    snippet: "involvement: { in: requestedInvolvements },",
    count: 1,
    nature: "documentary-facet",
    reason: "API /api/affaires : même périmètre choisi par le réutilisateur, validé contre l'enum.",
  },
  {
    path: "src/app/api/politiques/[slug]/affaires/route.ts",
    snippet:
      'const involvementValues = involvement !== null ? involvement.split(",") : ["DIRECT"];',
    count: 1,
    nature: "documentary-facet",
    reason:
      "API des affaires d'un élu : périmètre d'implication choisi par le réutilisateur (DIRECT par défaut) ; chaque ligne porte semantics.statusAppliesToPolitician.",
  },
  {
    path: "src/app/api/politiques/[slug]/affaires/route.ts",
    snippet: "involvement: { in: requestedInvolvements },",
    count: 1,
    nature: "documentary-facet",
    reason: "API des affaires d'un élu : même périmètre choisi par le réutilisateur.",
  },
  {
    path: "src/lib/api/public-contract.ts",
    snippet: "const judicialMaturity = getJudicialMaturity(affair.status);",
    count: 1,
    nature: "documentary-facet",
    reason:
      "getPublicAffairSemantics : judicialMaturity et judicialMaturityLabel décrivent l'affaire, pas la personne ; statusAppliesToPolitician et certaintyLevel (getAttributedCertaintyLevel), publiés à côté, portent l'attribution.",
  },
  {
    path: "src/components/compare/categories/DeputesComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus);",
    count: 1,
    nature: "adverse-prefiltered",
    reason:
      "countByMaturity : affaires chargées par lib/data/compare.ts avec COMPARED_AFFAIR_WHERE (DIRECT, ordre pénal).",
  },
  {
    path: "src/components/compare/categories/GroupesComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus);",
    count: 1,
    nature: "adverse-prefiltered",
    reason: "countByMaturity : affaires des membres filtrées par COMPARED_AFFAIR_WHERE.",
  },
  {
    path: "src/components/compare/categories/MinistresComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus);",
    count: 1,
    nature: "adverse-prefiltered",
    reason: "countByMaturity : affaires du ministre filtrées par COMPARED_AFFAIR_WHERE.",
  },
  {
    path: "src/components/compare/categories/PartisComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus);",
    count: 1,
    nature: "adverse-prefiltered",
    reason: "countByMaturity : affaires des membres filtrées par COMPARED_AFFAIR_WHERE.",
  },
  {
    path: "src/components/compare/categories/SenateursComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus);",
    count: 1,
    nature: "adverse-prefiltered",
    reason: "countByMaturity : affaires du sénateur filtrées par COMPARED_AFFAIR_WHERE.",
  },
  {
    path: "src/lib/affairs/affair-counts.ts",
    snippet: 'if (involvement === "MENTIONED_ONLY") affairsMentionedCount++;',
    count: 1,
    nature: "role-display",
    reason:
      "computeAffairCounts : compteur de mentions, publié comme un rôle, jamais à charge ; le compte à charge passe par ADVERSE_INVOLVEMENTS.",
  },
  {
    path: "src/lib/affairs/affair-counts.ts",
    snippet:
      'if (involvement === "VICTIM" || involvement === "PLAINTIFF") affairsVictimOrPlaintiffCount++;',
    count: 1,
    nature: "role-display",
    reason: "computeAffairCounts : compteur victime ou plaignant, publié comme un rôle.",
  },
  {
    path: "src/lib/affairs/audit-evidence.ts",
    snippet: "if (!ADVERSE_INVOLVEMENTS.includes(affair.involvement)) {",
    count: 1,
    nature: "identity-check",
    reason:
      "Audit éditorial : signale un statut de condamnation porté par une personne qui n'est pas mise en cause. L'ensemble vient de RULES.coherence.adverseInvolvements, lui-même ADVERSE_INVOLVEMENTS de certainty.ts.",
  },
  {
    path: "src/lib/affairs/audit-evidence.ts",
    snippet: "const aboutThisPerson = ADVERSE_INVOLVEMENTS.includes(affair.involvement);",
    count: 1,
    nature: "identity-check",
    reason:
      "Audit éditorial : la peine décrite ne vaut que pour la personne mise en cause, même ensemble issu des règles d'audit.",
  },
  {
    path: "src/lib/data/affairs.ts",
    snippet: 'involvements: Involvement[] = ["DIRECT"],',
    count: 4,
    nature: "documentary-facet",
    reason:
      "Valeur par défaut des fonctions de listing ; /affaires passe toujours son périmètre explicite (DEFAULT_LISTING_INVOLVEMENTS ou VICTIM_LISTING_INVOLVEMENTS).",
  },
  {
    path: "src/lib/data/affairs.ts",
    snippet: "db.affair.findMany({",
    count: 1,
    nature: "documentary-facet",
    reason:
      "queryAffairs : cartes du listing /affaires, prédicat construit par buildAffairWhere qui part de getDocumentaryAffairWhere(involvements) ; chaque carte affiche le rôle.",
  },
  {
    path: "src/lib/data/affairs.ts",
    snippet: "db.affair.count({ where }),",
    count: 1,
    nature: "documentary-facet",
    reason: "queryAffairs : total paginé du même listing documentaire.",
  },
  {
    path: "src/lib/data/affairs.ts",
    snippet:
      "const rows = await db.affair.findMany({ where, orderBy, select: { slug: true, title: true } });",
    count: 1,
    nature: "documentary-facet",
    reason: "getAffairNeighborsList : précédent/suivant, même buildAffairWhere que le listing.",
  },
  {
    path: "src/lib/politicians/profile-snapshot/request.ts",
    snippet: "{ affairs: { some: { partyAtTimeId: partyId } } },",
    count: 1,
    nature: "identity-check",
    reason:
      "Fiches à recalculer après une écriture sur un parti : tous rôles et toutes publications, sinon une fiche resterait périmée ; rien n'est affiché ni compté.",
  },
  {
    path: "src/lib/politicians/profile-snapshot/request.ts",
    snippet: "const affairs = await db.affair.findMany({",
    count: 1,
    nature: "identity-check",
    reason:
      "Fiches à recalculer après une écriture sur des affaires (et leurs affaires liées) ; rien n'est affiché ni compté.",
  },
];

/**
 * Écarts connus, bornés et attribués. Cliquet : une entrée sort quand son code est rebranché,
 * aucune n'entre (le test du dépôt plafonne le nombre d'occurrences).
 */
export const ATTRIBUTION_DEBT: DebtEntry[] = [
  {
    path: "src/config/labels.ts",
    snippet: '"mise-en-cause": ["DIRECT", "INDIRECT"],',
    count: 1,
    owner: "suivi hors PR A",
    reason:
      "INVOLVEMENT_GROUP_VALUES n'est importé nulle part mais range INDIRECT sous « Mis en cause » : à supprimer ou aligner avant toute réutilisation.",
  },
  {
    path: "src/config/labels.ts",
    snippet: 'victime: ["VICTIM", "PLAINTIFF"],',
    count: 1,
    owner: "suivi hors PR A",
    reason: "Même groupe de filtre inutilisé.",
  },
  {
    path: "src/config/labels.ts",
    snippet: 'mentionne: ["MENTIONED_ONLY"],',
    count: 1,
    owner: "suivi hors PR A",
    reason: "Même groupe de filtre inutilisé.",
  },
  {
    path: "src/lib/affairs/blocked-affairs.ts",
    snippet: "const affairs = await db.affair.findMany({",
    count: 1,
    owner: "suivi hors PR A",
    reason:
      "File de modération (brouillons inclus), lue seulement par une route admin : à sortir du périmètre scanné.",
  },
  {
    path: "src/lib/data/pipelines.ts",
    snippet: "entitiesCreated7d = await db.affair.count({",
    count: 1,
    owner: "suivi hors PR A",
    reason:
      "Compteur d'ingestion du back-office (toutes publications) : à sortir du périmètre scanné.",
  },
  {
    path: "src/lib/data/slapp.ts",
    snippet: "return db.affair.findMany({",
    count: 1,
    owner: "suivi hors PR A",
    reason:
      "Page procédures-bâillons : prédicat local sans implication ; vérifier que l'élu y est bien plaignant avant de le présenter comme auteur de la procédure.",
  },
  {
    path: "src/lib/data/slapp.ts",
    snippet: "db.affair.count({",
    count: 1,
    owner: "suivi hors PR A",
    reason: "Même prédicat local des procédures-bâillons.",
  },
  {
    path: "src/lib/data/slapp.ts",
    snippet: "db.affair.groupBy({",
    count: 1,
    owner: "suivi hors PR A",
    reason: "Même prédicat local des procédures-bâillons.",
  },
];

/**
 * Identités figées de la dette (`path|snippet`). On ne peut qu'en retirer, jamais en ajouter :
 * une entrée qui sort de ATTRIBUTION_DEBT sort aussi d'ici dans le même diff.
 */
export const FROZEN_DEBT_KEYS: readonly string[] = [
  'src/config/labels.ts|"mise-en-cause": ["DIRECT", "INDIRECT"],',
  'src/config/labels.ts|mentionne: ["MENTIONED_ONLY"],',
  'src/config/labels.ts|victime: ["VICTIM", "PLAINTIFF"],',
  "src/lib/affairs/blocked-affairs.ts|const affairs = await db.affair.findMany({",
  "src/lib/data/pipelines.ts|entitiesCreated7d = await db.affair.count({",
  "src/lib/data/slapp.ts|db.affair.count({",
  "src/lib/data/slapp.ts|db.affair.groupBy({",
  "src/lib/data/slapp.ts|return db.affair.findMany({",
];

/** Clés de dette absentes de FROZEN_DEBT_KEYS : toute entrée nouvelle, même en échange d'une sortie. */
export function unfrozenDebtKeys(
  debt: readonly CoverageEntry[],
  frozen: readonly string[] = FROZEN_DEBT_KEYS
): string[] {
  const allowed = new Set(frozen);
  return debt.map((entry) => `${entry.path}|${entry.snippet}`).filter((key) => !allowed.has(key));
}
