import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import type { PublicChangelogEntry } from "@/lib/changelog/format";

/** The only filter public surfaces apply: drafts and archived entries never leave the admin. */
export const PUBLISHED_CHANGELOG_WHERE: Prisma.ChangelogEntryWhereInput = { status: "PUBLISHED" };

/** Bounded read: the page and the feed show recent history, not the whole archive. */
export const CHANGELOG_PUBLIC_LIMIT = 200;

export async function getPublishedChangelog(): Promise<PublicChangelogEntry[]> {
  "use cache";
  cacheTag("changelog");
  cacheLife("synced");

  const rows = await db.changelogEntry.findMany({
    where: PUBLISHED_CHANGELOG_WHERE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: CHANGELOG_PUBLIC_LIMIT,
    select: { id: true, type: true, date: true, title: true, body: true, sourceUrl: true },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    date: row.date.toISOString().slice(0, 10),
    title: row.title,
    body: row.body,
    sourceUrl: row.sourceUrl,
  }));
}
