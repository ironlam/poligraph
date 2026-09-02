import type { DbTransactionClient } from "@/lib/db";
import { MeasureNotFoundError } from "./errors";

/**
 * Takes a row-level lock on the Measure before anything reads its pointers.
 *
 * Every transition reads the measure's state and then writes according to what it
 * read. Without FOR UPDATE, two concurrent publications both read "no published
 * revision" and both leave a published, non-superseded revision behind. That is
 * exactly the invariant the audit command watches: it would be absurd to have it
 * violated by the code that declares it.
 *
 * Must be the first statement of every transition, before any read of the pointers.
 * createMeasure() is the exception, and not one: the row does not exist yet, so there
 * is nothing to lock.
 *
 * The client comes from the caller, typed as the repository's own DbTransactionClient
 * rather than a local alias: `@/lib/db` exports it for exactly this, and four services
 * already pass their transaction across module boundaries with it.
 */
export async function lockMeasure(tx: DbTransactionClient, measureId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Measure" WHERE id = ${measureId} FOR UPDATE
  `;
  if (rows.length === 0) throw new MeasureNotFoundError(measureId);
}

/** Serializes visibility decisions shared by every measure of one candidacy. */
export async function lockMeasureCandidacy(
  tx: DbTransactionClient,
  candidacyId: string
): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Candidacy" WHERE id = ${candidacyId} FOR UPDATE
  `;
}
