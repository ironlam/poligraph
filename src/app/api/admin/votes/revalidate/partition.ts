/** One row per requested scrutinId, as loaded by the batch query: null status
 *  means either the row was not found or it has no policy title yet. */
export interface RevalidatableRow {
  id: string;
  status: string | null;
}

export interface PartitionResult {
  toRevalidate: string[];
  skipped: Array<{ id: string; reason: "not_found" | "not_approved" }>;
}

/**
 * Pure partition: decides which requested ids are safe to revalidate. An id
 * missing from `rows` was not found in the database; an id present but whose
 * status is not APPROVED must never be revalidated (that would make an
 * unapproved title visible). No DB access here, so this is unit-testable
 * without a database.
 */
export function partitionRevalidatable(ids: string[], rows: RevalidatableRow[]): PartitionResult {
  const byId = new Map(rows.map((row) => [row.id, row]));

  const toRevalidate: string[] = [];
  const skipped: PartitionResult["skipped"] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ id, reason: "not_found" });
    } else if (row.status !== "APPROVED") {
      skipped.push({ id, reason: "not_approved" });
    } else {
      toRevalidate.push(id);
    }
  }

  return { toRevalidate, skipped };
}
