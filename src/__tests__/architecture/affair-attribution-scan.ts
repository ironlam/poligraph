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
 * Limite assumée : le garde lit la forme écrite dans le fichier. Il suit une constante locale
 * (`const where = { ...getAdverseAffairWhere() }`) mais pas un prédicat construit dans un autre
 * module ; dans ce cas le sink est signalé et l'occurrence se documente.
 */

import ts from "typescript";

export type FindingKind = "involvement-filter" | "affair-sink" | "raw-classification";

export type Finding = { path: string; line: number; kind: FindingKind; snippet: string };

export type AllowedOccurrence = {
  path: string;
  /** Extrait exact de la ligne signalée. */
  snippet: string;
  nature:
    | "documentary-facet"
    | "identity-check"
    | "enum-listing"
    | "role-display"
    | "adverse-prefiltered";
  reason: string;
};

/**
 * Famille d'un appel direct de classification (brief tâche 1, étape 5) :
 * - `guarded-before-call` : l'implication est testée juste avant, migration mécanique vers
 *   `getAttributedCertaintyLevel` ;
 * - `adverse-prefiltered` : lignes déjà filtrées par un prédicat à charge, exception ALLOWED
 *   ajoutée par la tâche qui rebranche la source.
 */
export type DebtEntry = {
  path: string;
  snippet: string;
  family?: "guarded-before-call" | "adverse-prefiltered";
};

const PUBLIC_FILTERS_MODULE = "@/lib/affairs/public-filters";

const APPROVED_HELPERS = new Set([
  "getAdverseAffairWhere",
  "getConvictionOnlyWhere",
  "getMisEnCauseWhere",
  "getFavorableOutcomeWhere",
  "getDocumentaryAffairWhere",
  "getPublishedAffairWhere",
  "getAdverseInvolvementSql",
  "getPublishedAffairSqlWhere",
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
  constants: Map<string, ts.Expression>;
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

function collectConstants(ctx: Context): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
      !ctx.constants.has(node.name.text)
    ) {
      ctx.constants.set(node.name.text, node.initializer);
    }
    node.forEachChild(visit);
  };
  visit(ctx.file);
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
    const initializer = ctx.constants.get(node.text);
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
    const initializer = ctx.constants.get(expression.text);
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
  const initializer = ctx.constants.get(node.text);
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
      constants: new Map(),
      findings: [],
    };
    collectApprovedImports(ctx);
    collectConstants(ctx);

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
    path: "src/app/affaires/page.tsx",
    snippet: '? (["VICTIM", "PLAINTIFF"] as Involvement[])',
    nature: "documentary-facet",
    reason:
      "Listing /affaires en mode victime : chaque carte affiche le rôle, rien n'est compté à charge.",
  },
  {
    path: "src/app/affaires/page.tsx",
    snippet: ': (["DIRECT", "INDIRECT", "MENTIONED_ONLY"] as Involvement[])',
    nature: "documentary-facet",
    reason:
      "Listing /affaires en mode mis en cause : un témoin y figure avec son rôle, sans badge à charge.",
  },
  {
    path: "src/app/api/affaires/neighbors/route.ts",
    snippet:
      'mode === "victime" ? ["VICTIM", "PLAINTIFF"] : ["DIRECT", "INDIRECT", "MENTIONED_ONLY"]',
    nature: "documentary-facet",
    reason:
      "Navigation précédent/suivant du listing /affaires : même périmètre que la liste affichée.",
  },
  {
    path: "src/lib/affairs/involvement-note.ts",
    snippet: "const REQUIRES_NOTE: ReadonlySet<Involvement> = new Set<Involvement>([",
    nature: "enum-listing",
    reason:
      "Implications qui exigent une note sourcée avant publication : règle de modération, pas un agrégat.",
  },
  {
    path: "src/lib/affairs/involvement-note.ts",
    snippet: "return REQUIRES_NOTE.has(involvement)",
    nature: "enum-listing",
    reason: "Test d'appartenance à REQUIRES_NOTE, même règle de modération.",
  },
  {
    path: "src/lib/politicians/judicial-counts.ts",
    snippet: '(x) => x.involvement === "DIRECT" && x.jurisdictionOrder === "PENAL"',
    nature: "role-display",
    reason: "computeJudicialCounts : compteurs à charge déjà limités à DIRECT et à l'ordre pénal.",
  },
  {
    path: "src/lib/politicians/judicial-counts.ts",
    snippet: 'direct.filter((x) => getJudicialMaturity(x.status) === "PROCEDURE_VALIDEE")',
    nature: "adverse-prefiltered",
    reason:
      "computeJudicialCounts : `direct` est déjà filtré sur DIRECT et l'ordre pénal juste au-dessus.",
  },
  {
    path: "src/lib/politicians/judicial-counts.ts",
    snippet: '(x) => x.involvement === "VICTIM" || x.involvement === "PLAINTIFF"',
    nature: "role-display",
    reason:
      "computeJudicialCounts : compte victime ou plaignant, affiché comme un rôle, jamais à charge.",
  },
  {
    path: "src/lib/politicians/judicial-counts.ts",
    snippet: '(x) => x.involvement === "INDIRECT" || x.involvement === "MENTIONED_ONLY"',
    nature: "role-display",
    reason:
      "computeJudicialCounts : un témoin est compté avec les mentions, pas avec les mis en cause.",
  },
];

/** Écarts relevés au premier passage. Cliquet : on retire, on n'ajoute pas. */
export const ATTRIBUTION_DEBT: DebtEntry[] = [
  {
    path: "src/app/affaires/[slug]/page.tsx",
    snippet: "const certainty = getCertaintyLevel(affair.status)",
    family: "guarded-before-call",
  },
  { path: "src/app/affaires/[slug]/page.tsx", snippet: '{affair.involvement !== "DIRECT" &&' },
  { path: "src/app/affaires/condamnations/opengraph-image.tsx", snippet: "db.affair.count({" },
  {
    path: "src/app/affaires/condamnations/opengraph-image.tsx",
    snippet: 'involvement: { in: ["DIRECT", "INDIRECT"] }',
  },
  {
    path: "src/app/affaires/condamnations/page.tsx",
    snippet: 'involvement: { in: ["DIRECT", "INDIRECT"] }',
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: 'const MIS_EN_CAUSE: Involvement[] = ["DIRECT", "INDIRECT"]',
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: 'const VICTIMS: Involvement[] = ["VICTIM", "PLAINTIFF"]',
  },
  { path: "src/app/affaires/parti/[slug]/page.tsx", snippet: "affairsAtTime: {" },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: "MIS_EN_CAUSE.includes(a.involvement as Involvement)",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: "VICTIMS.includes(a.involvement as Involvement)",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: "const maturity = getJudicialMaturity(a.status as AffairStatus)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: 'getJudicialMaturity(a.status as AffairStatus) === "CONDAMNATION"',
    family: "adverse-prefiltered",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: 'getJudicialMaturity(a.status as AffairStatus) === "PROCEDURE_VALIDEE"',
    family: "adverse-prefiltered",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: 'getJudicialMaturity(a.status as AffairStatus) === "CLOSE_SANS_CONDAMNATION"',
    family: "adverse-prefiltered",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: 'getJudicialMaturity(a.status as AffairStatus) === "ENQUETE"',
    family: "adverse-prefiltered",
  },
  {
    path: "src/app/affaires/parti/[slug]/page.tsx",
    snippet: 'affairsAtTime: { some: { publicationStatus: "PUBLISHED" } }',
  },
  { path: "src/app/api/affaires/route.ts", snippet: 'involvement.split(",") : ["DIRECT"]' },
  { path: "src/app/api/affaires/route.ts", snippet: "involvement: { in: requestedInvolvements }" },
  {
    path: "src/app/api/politiques/[slug]/affaires/route.ts",
    snippet: 'involvement.split(",") : ["DIRECT"]',
  },
  {
    path: "src/app/api/politiques/[slug]/affaires/route.ts",
    snippet: "involvement: { in: requestedInvolvements }",
  },
  { path: "src/app/api/search/global/route.ts", snippet: "db.$queryRaw<RawAffair[]>`" },
  {
    path: "src/app/partis/[slug]/_lib/affair-summary.ts",
    snippet: "certainty: getCertaintyLevel(affair.status as AffairStatus)",
    family: "guarded-before-call",
  },
  {
    path: "src/app/partis/[slug]/_lib/affair-summary.ts",
    snippet: "direct.map((affair) => getJudicialMaturity(affair.status as AffairStatus))",
    family: "guarded-before-call",
  },
  {
    path: "src/app/politiques/[slug]/_components/PoliticianProfileBody.tsx",
    snippet: 'affairs.filter((a) => a.involvement === "DIRECT")',
  },
  { path: "src/app/politiques/page.tsx", snippet: "affairs: { where: CONVICTION_BADGE_WHERE }" },
  { path: "src/app/politiques/page.tsx", snippet: "affairs: {" },
  { path: "src/app/politiques/page.tsx", snippet: "affairs: { some: CONVICTION_BADGE_WHERE }" },
  { path: "src/app/politiques/page.tsx", snippet: "const [counts] = await db.$queryRaw<" },
  { path: "src/app/politiques/page.tsx", snippet: "AND a.involvement = 'DIRECT'" },
  {
    path: "src/app/politiques/page.tsx",
    snippet: "AND \"publicationStatus\" = 'PUBLISHED' AND involvement = 'DIRECT'",
  },
  {
    path: "src/app/sitemap.ts",
    snippet: "const politicians = await db.$queryRaw<Array<{ slug: string;",
  },
  { path: "src/app/sitemap.ts", snippet: "const lastAffairUpdate = await db.affair.findFirst(" },
  { path: "src/app/sitemap.ts", snippet: "db.affair.findMany({" },
  {
    path: "src/app/sitemap.ts",
    snippet: 'affairsAtTime: { some: { publicationStatus: "PUBLISHED" } }',
  },
  {
    path: "src/components/affairs/AffairListingCard.tsx",
    snippet: "const certainty = getCertaintyLevel(affair.status)",
    family: "guarded-before-call",
  },
  {
    path: "src/components/affairs/AffairListingCard.tsx",
    snippet: '{accused && affair.involvement !== "DIRECT" &&',
  },
  {
    path: "src/components/affairs/AffairStatusNotice.tsx",
    snippet: 'return getJudicialMaturity(status) === "CONDAMNATION" ? "third_party"',
    family: "guarded-before-call",
  },
  {
    path: "src/components/affairs/PartyAffairsList.tsx",
    snippet: "const maturity = getJudicialMaturity(a.status as AffairStatus)",
    family: "guarded-before-call",
  },
  {
    path: "src/components/compare/categories/DeputesComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/components/compare/categories/GroupesComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/components/compare/categories/MinistresComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/components/compare/categories/PartisComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/components/compare/categories/SenateursComparison.tsx",
    snippet: "const level = getJudicialMaturity(a.status as AffairStatus)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/components/politicians/AffairsSection.tsx",
    snippet: '(a) => a.involvement === "DIRECT" || a.involvement === "INDIRECT"',
  },
  {
    path: "src/components/politicians/AffairsSection.tsx",
    snippet: 'a.involvement === "MENTIONED_ONLY"',
  },
  {
    path: "src/components/politicians/AffairsSection.tsx",
    snippet: '(a) => a.involvement === "VICTIM" || a.involvement === "PLAINTIFF"',
  },
  {
    path: "src/components/politicians/AffairsSection.tsx",
    snippet: "const level = getCertaintyLevel(affair.status)",
    family: "guarded-before-call",
  },
  { path: "src/config/labels.ts", snippet: 'involvement: "DIRECT" as const' },
  { path: "src/config/labels.ts", snippet: '"mise-en-cause": ["DIRECT", "INDIRECT"]' },
  { path: "src/config/labels.ts", snippet: 'victime: ["VICTIM", "PLAINTIFF"]' },
  { path: "src/config/labels.ts", snippet: 'mentionne: ["MENTIONED_ONLY"]' },
  {
    path: "src/lib/affairs/affair-counts.ts",
    snippet: 'if (involvement === "MENTIONED_ONLY") affairsMentionedCount++',
  },
  {
    path: "src/lib/affairs/affair-counts.ts",
    snippet: 'if (involvement === "VICTIM" || involvement === "PLAINTIFF")',
  },
  {
    path: "src/lib/affairs/audit-evidence.ts",
    snippet: "if (!ADVERSE_INVOLVEMENTS.includes(affair.involvement))",
  },
  {
    path: "src/lib/affairs/audit-evidence.ts",
    snippet: "aboutThisPerson = ADVERSE_INVOLVEMENTS.includes(affair.involvement)",
  },
  {
    path: "src/lib/affairs/blocked-affairs.ts",
    snippet: "const affairs = await db.affair.findMany(",
  },
  {
    path: "src/lib/affairs/grading-rules.ts",
    snippet: 'adverseInvolvements: ["DIRECT", "INDIRECT"] satisfies readonly',
  },
  { path: "src/lib/affairs/probity-stats.ts", snippet: "const rows = await db.affair.groupBy(" },
  {
    path: "src/lib/affairs/probity-stats.ts",
    snippet: 'involvement: { in: ["DIRECT", "INDIRECT"] }',
  },
  {
    path: "src/lib/affairs/probity-stats.ts",
    snippet: "const level = getCertaintyLevel(row.status)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/lib/api/public-contract.ts",
    snippet: "statusAppliesToPolitician ? getCertaintyLevel(affair.status) : null",
    family: "guarded-before-call",
  },
  {
    path: "src/lib/api/public-contract.ts",
    snippet: "const judicialMaturity = getJudicialMaturity(affair.status)",
    family: "guarded-before-call",
  },
  { path: "src/lib/data/affairs.ts", snippet: "involvement: { in: involvements }" },
  { path: "src/lib/data/affairs.ts", snippet: 'involvements: Involvement[] = ["DIRECT"]' },
  { path: "src/lib/data/affairs.ts", snippet: "db.affair.findMany({" },
  { path: "src/lib/data/affairs.ts", snippet: "db.affair.count({ where })" },
  {
    path: "src/lib/data/affairs.ts",
    snippet: "const rows = await db.affair.findMany({ where, orderBy, select: {",
  },
  { path: "src/lib/data/affairs.ts", snippet: 'involvement: "DIRECT"' },
  {
    path: "src/lib/data/affairs.ts",
    snippet: 'involvement: { notIn: ["VICTIM", "PLAINTIFF", "MENTIONED_ONLY"] }',
  },
  {
    path: "src/lib/data/affairs.ts",
    snippet: "const level = getCertaintyLevel(row.status)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/lib/data/affairs.ts",
    snippet: 'const VICTIM_INVOLVEMENTS: Involvement[] = ["VICTIM", "PLAINTIFF"]',
  },
  { path: "src/lib/data/affairs.ts", snippet: "involvement: { in: VICTIM_INVOLVEMENTS }" },
  {
    path: "src/lib/data/compare.ts",
    snippet: 'involvement: { in: ["DIRECT", "INDIRECT"] as Involvement[] }',
  },
  { path: "src/lib/data/compare.ts", snippet: 'involvement: { in: ["DIRECT", "INDIRECT"] }' },
  {
    path: "src/lib/data/condamnations.ts",
    snippet: 'involvement: { in: ["DIRECT", "INDIRECT"] as Involvement[] }',
  },
  { path: "src/lib/data/condamnations.ts", snippet: "AND a.involvement IN ('DIRECT','INDIRECT')" },
  { path: "src/lib/data/hemicycle.ts", snippet: "affairs: {" },
  { path: "src/lib/data/hemicycle.ts", snippet: 'involvement: "DIRECT"' },
  {
    path: "src/lib/data/hemicycle.ts",
    snippet: "const level = getCertaintyLevel(a.status)",
    family: "adverse-prefiltered",
  },
  { path: "src/lib/data/partis.ts", snippet: "affairs: { where: CONVICTION_BADGE_WHERE }" },
  { path: "src/lib/data/partis.ts", snippet: 'involvement: { notIn: ["VICTIM", "PLAINTIFF"] }' },
  {
    path: "src/lib/data/partis.ts",
    snippet: '(a) => a.involvement === "DIRECT" || a.involvement === "INDIRECT"',
  },
  {
    path: "src/lib/data/partis.ts",
    snippet: '(a) => getJudicialMaturity(a.status) === "CONDAMNATION"',
    family: "adverse-prefiltered",
  },
  {
    path: "src/lib/data/partis.ts",
    snippet: "const m = getJudicialMaturity(a.status)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/lib/data/partis.ts",
    snippet: '(a) => getJudicialMaturity(a.status) === "CLOSE_SANS_CONDAMNATION"',
    family: "adverse-prefiltered",
  },
  { path: "src/lib/data/partis.ts", snippet: "AND a.involvement NOT IN ('VICTIM', 'PLAINTIFF')" },
  { path: "src/lib/data/pipelines.ts", snippet: "entitiesCreated7d = await db.affair.count(" },
  { path: "src/lib/data/recap.ts", snippet: "certaintyLevel: getCertaintyLevel(al.affair.status)" },
  {
    path: "src/lib/data/recap.ts",
    snippet: "AND a.involvement NOT IN ('VICTIM', 'PLAINTIFF', 'MENTIONED_ONLY')",
  },
  { path: "src/lib/data/slapp.ts", snippet: "return db.affair.findMany(" },
  { path: "src/lib/data/slapp.ts", snippet: "db.affair.count({" },
  { path: "src/lib/data/slapp.ts", snippet: "db.affair.groupBy({" },
  {
    path: "src/lib/data/statistics.ts",
    snippet: 'involvement: { in: ["DIRECT" as const, "INDIRECT" as const] }',
  },
  { path: "src/lib/data/statistics.ts", snippet: "db.affair.groupBy({" },
  { path: "src/lib/data/statistics.ts", snippet: "db.affair.findMany({" },
  {
    path: "src/lib/data/statistics.ts",
    snippet: "const tier = getJudicialMaturity(a.status)",
    family: "adverse-prefiltered",
  },
  {
    path: "src/lib/politicians/profile-snapshot/request.ts",
    snippet: "{ affairs: { some: { partyAtTimeId: partyId } } }",
  },
  {
    path: "src/lib/politicians/profile-snapshot/request.ts",
    snippet: "const affairs = await db.affair.findMany(",
  },
  {
    path: "src/lib/social/generators.ts",
    snippet: "const condamnationCounts = await db.affair.groupBy(",
  },
  { path: "src/lib/social/generators.ts", snippet: 'involvement: "DIRECT"' },
  { path: "src/lib/social/generators.ts", snippet: "const affairs = await db.affair.findMany(" },
  {
    path: "src/lib/social/generators.ts",
    snippet: 'affairs: { where: { publicationStatus: "PUBLISHED", involvement:',
  },
];
