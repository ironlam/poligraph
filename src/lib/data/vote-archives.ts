import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { VotingResult } from "@/generated/prisma";
import { SCRUTIN_RECENT_FIRST } from "@/lib/votes/scrutin-order";
import { displayTitleOf, toPublicTitleView } from "@/lib/votes/to-public-title-view";
import { archiveMonthRange, type ArchiveMonth } from "@/lib/votes/vote-archive";

export interface ArchiveMonthSummary extends ArchiveMonth {
  scrutins: number;
  days: number;
}

export interface ArchiveDay {
  /** YYYY-MM-DD. */
  date: string;
  total: number;
  amendments: number;
  /** The scrutins of the day that are not amendments, most recent first. */
  texts: Array<{ slug: string | null; title: string; result: VotingResult }>;
}

/** Every month holding at least one scrutin, most recent first. */
export async function getVoteArchiveMonths(): Promise<ArchiveMonthSummary[]> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const rows = await db.$queryRaw<
    Array<{ year: number; month: number; scrutins: number; days: number }>
  >(Prisma.sql`
    SELECT EXTRACT(YEAR FROM "votingDate")::int AS year,
           EXTRACT(MONTH FROM "votingDate")::int AS month,
           COUNT(*)::int AS scrutins,
           COUNT(DISTINCT "votingDate"::date)::int AS days
    FROM "Scrutin"
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 DESC
  `);
  return rows;
}

/**
 * The sitting days of a month, each with its counts and its scrutins on a text.
 *
 * Amendments are counted, not listed: a month can hold more than a thousand of them, and each one
 * is linked from its own day. Bounded key space (a month), safe for "use cache".
 */
export async function getVoteArchiveMonth(month: ArchiveMonth): Promise<ArchiveDay[]> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const { start, end } = archiveMonthRange(month);

  const counts = await db.$queryRaw<Array<{ date: string; total: number; amendments: number }>>(
    Prisma.sql`
      SELECT to_char("votingDate", 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS total,
             (COUNT(*) FILTER (WHERE "type" = 'AMENDEMENT'))::int AS amendments
      FROM "Scrutin"
      WHERE "votingDate" >= ${start} AND "votingDate" < ${end}
      GROUP BY 1
      ORDER BY 1 DESC
    `
  );
  if (counts.length === 0) return [];

  const texts = await db.scrutin.findMany({
    where: {
      votingDate: { gte: start, lt: end },
      // An unknown type is not an amendment, as in isIndexableScrutin.
      OR: [{ type: null }, { type: { not: "AMENDEMENT" } }],
    },
    orderBy: SCRUTIN_RECENT_FIRST,
    select: {
      slug: true,
      title: true,
      votingDate: true,
      result: true,
      chamber: true,
      sourceUrl: true,
      policyTitle: {
        select: {
          status: true,
          policyTitle: true,
          policySubtitle: true,
          officialSourceUrl: true,
          proceduralLabel: true,
        },
      },
    },
  });

  const byDay = new Map<string, ArchiveDay["texts"]>();
  for (const s of texts) {
    const day = s.votingDate.toISOString().slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push({ slug: s.slug, title: displayTitleOf(toPublicTitleView(s)), result: s.result });
    byDay.set(day, list);
  }

  return counts.map((c) => ({ ...c, texts: byDay.get(c.date) ?? [] }));
}
