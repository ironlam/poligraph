/**
 * The one alphabetical order of the presidential hub.
 *
 * Every surface that lists candidacies (hub field, subject pages, themes index) shows the same
 * people, so it has to show them in the same order: two orders for the same twenty-five names reads
 * as a bug whichever one the reader meets second.
 *
 * The order is by SURNAME, which is what the pages announce. `candidateName` is "Prénom Nom", so
 * ordering on it (in SQL or otherwise) sorts by first name and files "Édouard Philippe" under E.
 * The surname comes from the linked politician, the only place the database separates the two; a
 * candidacy with no politician falls back to its full name rather than being dropped from the list.
 *
 * `Intl.Collator("fr")` so accents sort where a French reader expects them, É next to E rather than
 * after Z, and `sensitivity: "base"` so case and accents never decide the order on their own.
 */

const collator = new Intl.Collator("fr", { sensitivity: "base" });

/** The shape the order needs, so both authorities can pass their own row type unchanged. */
export type SurnameOrdered = {
  candidateName: string;
  politician: { lastName: string } | null;
};

export function presidentialCandidateSortKey(row: SurnameOrdered): string {
  return row.politician?.lastName ?? row.candidateName;
}

/**
 * Returns a new array rather than sorting in place, so a caller can order rows it does not own.
 * The tie-break on the full name keeps homonyms in a stable order instead of leaving them to
 * whatever order the query returned.
 */
export function sortPresidentialCandidatesBySurname<T extends SurnameOrdered>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      collator.compare(presidentialCandidateSortKey(a), presidentialCandidateSortKey(b)) ||
      collator.compare(a.candidateName, b.candidateName)
  );
}
