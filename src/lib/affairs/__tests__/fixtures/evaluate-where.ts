/**
 * Évaluateur minimal d'un `where` Prisma contre une ligne en mémoire, pour prouver que les
 * trois formes d'un prédicat (where Prisma, SQL, fonction) donnent le même verdict.
 * Lève sur tout opérateur non géré : un test ne doit jamais passer par ignorance.
 */
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const SCALAR_OPERATORS = new Set(["equals", "in", "notIn", "not"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesField(actual: unknown, condition: unknown, path: string): boolean {
  if (!isPlainObject(condition)) return actual === condition;
  return Object.entries(condition).every(([operator, expected]) => {
    switch (operator) {
      case "equals":
        return actual === expected;
      case "in":
        return (expected as unknown[]).includes(actual);
      case "notIn":
        return !(expected as unknown[]).includes(actual);
      case "not":
        return !matchesField(actual, expected, path);
      default:
        throw new Error(`Opérateur Prisma non géré sur "${path}": ${operator}`);
    }
  });
}

function asList(value: unknown): Where[] {
  return (Array.isArray(value) ? value : [value]) as Where[];
}

export function evaluateWhere(rowInput: object, where: Where): boolean {
  const row = rowInput as Row;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return asList(condition).every((w) => evaluateWhere(row, w));
    if (key === "OR") return asList(condition).some((w) => evaluateWhere(row, w));
    if (key === "NOT") return !asList(condition).some((w) => evaluateWhere(row, w));
    const actual = row[key];
    if (key === "politician") {
      if (!isPlainObject(actual)) {
        throw new Error('La ligne n\'a pas de relation "politician" évaluable');
      }
      return evaluateWhere(actual, condition as Where);
    }
    if (isPlainObject(condition)) {
      for (const operator of Object.keys(condition)) {
        if (!SCALAR_OPERATORS.has(operator)) {
          throw new Error(`Opérateur Prisma non géré sur "${key}": ${operator}`);
        }
      }
    }
    return matchesField(actual, condition, key);
  });
}
