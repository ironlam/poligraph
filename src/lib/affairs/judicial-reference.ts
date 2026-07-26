/**
 * Folding of judicial references, so two spellings of the same reference compare
 * equal (#536, #337).
 *
 * Pure and free of database access: the Judilibre mapper and client both need it,
 * and neither may drag a `DATABASE_URL` requirement in through an import.
 */

/**
 * Strips accents, case and separators: « 96-83.698 », « 96-83698 » and « 9683698 »
 * all fold to « 9683698 ».
 *
 * Used to *find* and to *compare* references. It never decides that two decisions
 * are the same one — a shared pourvoi number is not an identity.
 */
export function foldJudicialReference(raw: string): string {
  return (
    raw
      .normalize("NFD")
      // \p{Mn} keeps this ASCII-only: a literal combining-mark range is invisible in source.
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
  );
}
