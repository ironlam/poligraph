import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import type { AffairStatus } from "@/types";

export type SlappAffairFilters = {
  status?: AffairStatus;
  limit?: number;
};

function getPublicSlappWhere(status?: AffairStatus) {
  return {
    ...getPublishedAffairWhere(),
    isSlapp: true,
    ...(status ? { status } : {}),
    politician: PUBLIC_POLITICIAN_WHERE,
  };
}

export async function getSlappAffairs(filters: SlappAffairFilters) {
  "use cache";
  cacheTag("affairs", "slapp");
  cacheLife("synced");

  return db.affair.findMany({
    where: getPublicSlappWhere(filters.status),
    take: filters.limit,
    orderBy: { slappQualifiedAt: "desc" },
    include: {
      politician: {
        select: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
        },
      },
      sources: { take: 3 },
    },
  });
}

export async function getSlappStats() {
  "use cache";
  cacheTag("affairs", "slapp");
  cacheLife("synced");

  const [total, byStatusRaw] = await Promise.all([
    db.affair.count({
      where: getPublicSlappWhere(),
    }),
    db.affair.groupBy({
      by: ["status"],
      where: getPublicSlappWhere(),
      _count: { _all: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of byStatusRaw) {
    byStatus[row.status as string] = row._count._all;
  }

  return { total, byStatus };
}
