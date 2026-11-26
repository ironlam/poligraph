import { Prisma } from "@/generated/prisma";
import type { db, DbTransactionClient } from "@/lib/db";
import { normalizeText } from "@/lib/name-matching";

type Client = typeof db | DbTransactionClient;

/** Enough to tell two people of the same name apart, and nothing that ranks them. */
export type Homonym = {
  id: string;
  publicId: string | null;
  fullName: string;
  slug: string;
  civility: string | null;
  birthDate: Date | null;
  birthPlace: string | null;
  deathDate: Date | null;
  publicationStatus: string;
  party: { name: string; shortName: string | null } | null;
  externalSources: string[];
  mandates: Array<{
    type: string;
    title: string;
    institution: string;
    departmentCode: string | null;
    isCurrent: boolean;
    startDate: Date;
    endDate: Date | null;
    commune: { name: string; departmentCode: string } | null;
  }>;
};

/**
 * `translate()` arguments mirroring `normalizeText`: U+2018 and U+2019 to a straight apostrophe,
 * hyphen, en dash and em dash to a space. Written as escapes so the pairs stay countable.
 */
const FOLD_FROM = "\u2018\u2019-\u2013\u2014";
const FOLD_TO = "''   ";

/** Hard cap on what one name can return: the admin reads this list, it is not a search. */
export const HOMONYM_LIMIT = 50;

/**
 * The key two submissions of the same name share: normalized last name, then the first token of
 * the normalized first name ("Jean-Pierre" and "Jean" collide on purpose).
 */
export function homonymKey(firstName: string, lastName: string): { last: string; first: string } {
  return {
    last: normalizeText(lastName),
    first: normalizeText(firstName).split(/\s+/)[0] ?? "",
  };
}

/**
 * Ids of the profiles a new "firstName lastName" could be confused with, whatever their
 * publication status: same last name and same first given name, accents, case and hyphens
 * ignored, or an alias equal to the full name.
 *
 * Deliberately not the identity resolver: that one scores candidates and never compares last
 * names. Here nothing is scored and nothing is linked, a human reads the list.
 */
export async function findHomonymIds(
  client: Client,
  firstName: string,
  lastName: string
): Promise<string[]> {
  const { last, first } = homonymKey(firstName, lastName);
  if (!last || !first) return [];
  const full = normalizeText(`${firstName} ${lastName}`);
  // Same folding as `normalizeText` on the stored side: typographic apostrophes become straight
  // ones, hyphens and dashes become spaces. Without it "D\u2019Ornano" in the table never
  // equals the "d'ornano" the parameter holds.
  const fold = (column: Prisma.Sql) =>
    Prisma.sql`btrim(lower(unaccent(translate(${column}, ${FOLD_FROM}, ${FOLD_TO}))))`;
  const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p.id
    FROM "Politician" p
    WHERE (
        ${fold(Prisma.sql`p."lastName"`)} = ${last}
        AND split_part(${fold(Prisma.sql`p."firstName"`)}, ' ', 1) = ${first}
      )
      OR EXISTS (
        SELECT 1 FROM unnest(p.aliases) AS alias
        WHERE ${fold(Prisma.sql`alias`)} = ${full}
      )
    ORDER BY p."prominenceScore" DESC, p.id ASC
    LIMIT ${HOMONYM_LIMIT}
  `);
  return rows.map((row) => row.id);
}

/** The same profiles, with what distinguishes them. Order of `findHomonymIds` preserved. */
export async function findHomonyms(
  client: Client,
  firstName: string,
  lastName: string
): Promise<Homonym[]> {
  const ids = await findHomonymIds(client, firstName, lastName);
  if (ids.length === 0) return [];
  const rows = await client.politician.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      publicId: true,
      fullName: true,
      slug: true,
      civility: true,
      birthDate: true,
      birthPlace: true,
      deathDate: true,
      publicationStatus: true,
      currentParty: { select: { name: true, shortName: true } },
      externalIds: { select: { source: true } },
      mandates: {
        orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
        take: 5,
        select: {
          type: true,
          title: true,
          institution: true,
          departmentCode: true,
          isCurrent: true,
          startDate: true,
          endDate: true,
          localData: { select: { commune: { select: { name: true, departmentCode: true } } } },
        },
      },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        id: row.id,
        publicId: row.publicId,
        fullName: row.fullName,
        slug: row.slug,
        civility: row.civility,
        birthDate: row.birthDate,
        birthPlace: row.birthPlace,
        deathDate: row.deathDate,
        publicationStatus: row.publicationStatus,
        party: row.currentParty,
        externalSources: [...new Set(row.externalIds.map((e) => e.source))].sort(),
        mandates: row.mandates.map(({ localData, ...mandate }) => ({
          ...mandate,
          commune: localData?.commune ?? null,
        })),
      },
    ];
  });
}
