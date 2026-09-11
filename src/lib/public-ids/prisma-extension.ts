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
/**
 * Combien de valeurs déjà prises la séquence peut franchir avant d'abandonner.
 *
 * Une séquence peut se retrouver derrière les identifiants réellement
 * attribués : un backfill qui écrit `MAX + 1` sans appeler `setval`, une
 * restauration, un import. `nextval` rend alors une valeur existante et la
 * création échoue sur la contrainte d'unicité.
 *
 * Sans repli, ça a tué deux passes de production : l'import des maires
 * d'arrondissement (une fiche perdue) puis un balayage de 1 000 maires, arrêté
 * net au troisième élu. Chaque tentative avance la séquence, donc réessayer la
 * fait franchir le trou ; la borne évite de boucler si la collision vient
 * d'autre chose que du retard de séquence.
 */
export const ID_COLLISION_RETRIES = 5;

/**
 * Les colonnes en conflit d'une P2002, quelle que soit la forme du message.
 *
 * Deux formes coexistent, et le projet reçoit la seconde. Sans adaptateur,
 * Prisma remplit `meta.target`. Avec `PrismaPg`, que `src/lib/db.ts` configure,
 * `meta.target` est **undefined** et les colonnes vivent sous
 * `meta.driverAdapterError.cause.constraint.fields`, entourées de guillemets :
 * `["\"publicId\""]`. Relevé sur une vraie erreur de production.
 *
 * Ne lire que `meta.target` rendait la garde inerte là où elle devait servir.
 */
function conflictingFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = error.meta as
    | {
        target?: unknown;
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
      }
    | undefined;

  const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;
  const raw = Array.isArray(adapterFields) ? adapterFields : (meta?.target ?? []);
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((field) => String(field).replace(/"/g, ""));
}

/** Une violation d'unicité qui porte précisément sur `publicId`. */
export function isPublicIdCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  return conflictingFields(error).includes("publicId");
}

/**
 * Crée en réallouant l'identifiant tant qu'il tombe sur une valeur prise.
 *
 * Ne rattrape QUE la collision sur `publicId` : toute autre violation
 * d'unicité, un slug en double par exemple, doit remonter telle quelle, sinon
 * on boucle sur une erreur qui ne se résoudra jamais.
 *
 * Exporté pour être testable : `defineExtension` rend une fonction qui attend
 * un client, donc les hooks ne sont pas atteignables depuis un test.
 */
export async function createWithPublicId<A extends { data: { publicId?: string | null } }, R>(
  args: A,
  query: (args: A) => Promise<R>,
  allocate: () => Promise<string>,
  retries = ID_COLLISION_RETRIES
): Promise<R> {
  if (args.data.publicId) return query(args);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    args.data.publicId = await allocate();
    try {
      return await query(args);
    } catch (error) {
      if (!isPublicIdCollision(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

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
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_politician_seq') AS nextval`, "PG")
          );
        },
      },
      affair: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_affair_seq') AS nextval`, "AF")
          );
        },
      },
      factCheck: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_factcheck_seq') AS nextval`, "FC")
          );
        },
      },
      scrutin: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_scrutin_seq') AS nextval`, "SC")
          );
        },
      },
      party: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_party_seq') AS nextval`, "PT")
          );
        },
      },
      election: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_election_seq') AS nextval`, "EL")
          );
        },
      },
      mandate: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_mandate_seq') AS nextval`, "MA")
          );
        },
      },
      legislativeDossier: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_dossier_seq') AS nextval`, "DO")
          );
        },
      },
      parliamentaryGroup: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_group_seq') AS nextval`, "GP")
          );
        },
      },
      electoralList: {
        async create({ args, query }) {
          return createWithPublicId(args, query, () =>
            allocate(Prisma.sql`SELECT nextval('poligraph_electoral_list_seq') AS nextval`, "LM")
          );
        },
      },
    },
  });
}
