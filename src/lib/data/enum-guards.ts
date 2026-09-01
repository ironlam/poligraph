/**
 * Whitelist guard for values that reach Prisma straight from a query string.
 *
 * Prisma rejects an out-of-enum value by throwing PrismaClientValidationError,
 * which on a streamed page surfaces as a 200 with an empty body (the headers
 * are already flushed), so the visitor gets a dead listing and the failure
 * never shows up as a 5xx. Guarding here keeps the filter out of the `where`
 * instead: an unknown value means "no filter", so a stale bookmark or a
 * mistyped facet still renders the listing.
 *
 * Same intent as `normalizeSort` in `@/lib/data/scrutins`, generalised over the
 * generated Prisma enums so the accepted set cannot drift from the schema.
 */
export function pickEnumValue<T extends Record<string, string>>(
  value: string | null | undefined,
  members: T
): T[keyof T] | undefined {
  if (!value) return undefined;
  return (Object.values(members) as string[]).includes(value) ? (value as T[keyof T]) : undefined;
}
