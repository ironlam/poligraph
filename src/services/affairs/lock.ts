import type { DbTransactionClient } from "@/lib/db";

export class AffairNotFoundError extends Error {
  constructor(affairId: string) {
    super(`Affaire introuvable : ${affairId}`);
    this.name = "AffairNotFoundError";
  }
}

/** Serializes relation writes performed while accepting proposals for one affair. */
export async function lockAffair(tx: DbTransactionClient, affairId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Affair" WHERE id = ${affairId} FOR UPDATE
  `;
  if (rows.length === 0) throw new AffairNotFoundError(affairId);
}
