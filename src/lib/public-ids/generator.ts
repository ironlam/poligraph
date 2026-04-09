import { db } from "@/lib/db";
import { formatPublicIdForEntity } from "./format";
import { type PublicIdEntityType } from "./types";

/**
 * Allocate the next poligraphId for an entity type by atomically incrementing
 * the PostgreSQL sequence that backs it. Safe under concurrent writes: each
 * call to nextval() is guaranteed to return a unique, monotonically increasing
 * integer. Gaps from rollbacks are expected and harmless.
 *
 * Each branch uses a static query against a literal sequence name so this
 * function is resistant to accidental SQL injection even though sequence
 * names are not user-controlled.
 *
 * @example
 * const publicId = await nextPublicId("affair"); // "AF-000543"
 */
export async function nextPublicId(entityType: PublicIdEntityType): Promise<string> {
  const sequence = await fetchNextSequenceValue(entityType);
  return formatPublicIdForEntity(entityType, sequence);
}

async function fetchNextSequenceValue(entityType: PublicIdEntityType): Promise<number> {
  let rows: { nextval: bigint }[];
  switch (entityType) {
    case "politician":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_politician_seq') AS nextval
      `;
      break;
    case "affair":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_affair_seq') AS nextval
      `;
      break;
    case "factcheck":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_factcheck_seq') AS nextval
      `;
      break;
    case "scrutin":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_scrutin_seq') AS nextval
      `;
      break;
    case "party":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_party_seq') AS nextval
      `;
      break;
    case "election":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_election_seq') AS nextval
      `;
      break;
    case "mandate":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_mandate_seq') AS nextval
      `;
      break;
    case "dossier":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_dossier_seq') AS nextval
      `;
      break;
    case "group":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_group_seq') AS nextval
      `;
      break;
    case "electoralList":
      rows = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('poligraph_electoral_list_seq') AS nextval
      `;
      break;
    default: {
      const exhaustive: never = entityType;
      throw new Error(`Unknown entity type: ${String(exhaustive)}`);
    }
  }

  const raw = rows[0]?.nextval;
  if (raw === undefined) {
    throw new Error(`Sequence returned no value for ${entityType}`);
  }
  return Number(raw);
}
