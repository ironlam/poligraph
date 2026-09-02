/**
 * Safe parsing for numbers that arrive straight from a query string.
 *
 * The idiom this replaces looks like a guard and is not one:
 * `Math.max(1, parseInt("abc", 10))` evaluates to NaN, because Math.max
 * propagates NaN rather than discarding it. The NaN then travels into
 * `skip: (page - 1) * limit`, and Prisma serialises a NaN argument as an
 * absent one, so the page dies on "Argument `skip` is missing", an
 * unhandled 500 whose message points nowhere near the query string.
 *
 * Same intent as `pickEnumValue` in `@/lib/data/enum-guards`, for the numeric
 * half of the listing parameters: an unusable value means "use the default",
 * never "hand it to Prisma and hope".
 */

/** Query params are `string | string[]` once a key is repeated in the URL. */
type RawParam = string | string[] | null | undefined;

function firstValue(value: RawParam): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/**
 * Page number for a listing, clamped to a usable page. Anything unparseable,
 * absent, zero or negative reads as page 1 rather than crashing the listing.
 */
export function parsePageParam(value: RawParam): number {
  const parsed = parseInt(firstValue(value) ?? "", 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

/**
 * Integer filter (legislature, year…) for a Prisma `where`. An unusable value
 * yields `undefined` so the caller drops the filter instead of narrowing on a
 * NaN that Prisma refuses.
 */
export function parseIntFilter(value: RawParam): number | undefined {
  const parsed = parseInt(firstValue(value) ?? "", 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
