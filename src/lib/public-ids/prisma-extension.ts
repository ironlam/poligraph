import { Prisma, type PrismaClient } from "@/generated/prisma";

/**
 * Prisma client extension that auto-generates `publicId` (poligraphId) on
 * every `create` call across the 10 entity types that have a publicId column.
 *
 * Pass-through behaviour:
 *   - If the caller explicitly provides a publicId, it is preserved verbatim.
 *   - Otherwise, a fresh value is allocated from the entity's PostgreSQL
 *     sequence and formatted as `<PREFIX>-<6-digit sequence>`.
 *
 * Known limitation: only `create` is hooked, not `createMany`. Rows inserted
 * via `createMany` will have `publicId = NULL` until the next run of
 * `scripts/backfill-public-ids.ts`. This keeps the extension simple and lets
 * bulk sync pipelines remain unchanged during the transition window.
 *
 * The factory takes the raw (unextended) client so the hooks can call
 * `$queryRaw` without recursing back through the extension.
 */
export function createPoligraphIdExtension(rawClient: PrismaClient) {
  async function allocate(sequenceSql: Prisma.Sql, prefix: string): Promise<string> {
    const rows = await rawClient.$queryRaw<{ nextval: bigint }[]>(sequenceSql);
    const value = rows[0]?.nextval;
    if (value === undefined) {
      throw new Error(`Sequence returned no value for prefix ${prefix}`);
    }
    return `${prefix}-${String(Number(value)).padStart(6, "0")}`;
  }

  return Prisma.defineExtension({
    name: "poligraphId",
    query: {
      politician: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_politician_seq') AS nextval`,
              "PG"
            );
          }
          return query(args);
        },
      },
      affair: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_affair_seq') AS nextval`,
              "AF"
            );
          }
          return query(args);
        },
      },
      factCheck: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_factcheck_seq') AS nextval`,
              "FC"
            );
          }
          return query(args);
        },
      },
      scrutin: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_scrutin_seq') AS nextval`,
              "SC"
            );
          }
          return query(args);
        },
      },
      party: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_party_seq') AS nextval`,
              "PT"
            );
          }
          return query(args);
        },
      },
      election: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_election_seq') AS nextval`,
              "EL"
            );
          }
          return query(args);
        },
      },
      mandate: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_mandate_seq') AS nextval`,
              "MA"
            );
          }
          return query(args);
        },
      },
      legislativeDossier: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_dossier_seq') AS nextval`,
              "DO"
            );
          }
          return query(args);
        },
      },
      parliamentaryGroup: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_group_seq') AS nextval`,
              "GP"
            );
          }
          return query(args);
        },
      },
      electoralList: {
        async create({ args, query }) {
          if (!args.data.publicId) {
            args.data.publicId = await allocate(
              Prisma.sql`SELECT nextval('poligraph_electoral_list_seq') AS nextval`,
              "LM"
            );
          }
          return query(args);
        },
      },
    },
  });
}
