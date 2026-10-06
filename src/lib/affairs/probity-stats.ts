import { db } from "@/lib/db";
import { getCategoriesForSuper } from "@/config/labels";
import { getCertaintyLevel, type CertaintyLevel } from "@/config/certainty";
import type { ProbityStats } from "./probity-stats-format";
import {
  ADVERSE_INVOLVEMENTS,
  ADVERSE_JURISDICTION_ORDER,
  getDocumentaryAffairWhere,
} from "./public-filters";

export { formatProbityBreakdown, type ProbityStats } from "./probity-stats-format";

const EMPTY_STATS: ProbityStats = {
  total: 0,
  etabli: 0,
  prononce: 0,
  enCours: 0,
  closSansCharge: 0,
  closFavorable: 0,
};

const BUCKET_FIELD: Record<CertaintyLevel, keyof Omit<ProbityStats, "total">> = {
  ETABLI: "etabli",
  PRONONCE: "prononce",
  EN_COURS: "enCours",
  CLOS_SANS_CHARGE: "closSansCharge",
  CLOS_FAVORABLE: "closFavorable",
};

const PROBITY_CATEGORIES = getCategoriesForSuper("PROBITE");

export async function getProbityStats(politicianId: string): Promise<ProbityStats> {
  const rows = await db.affair.groupBy({
    by: ["status"],
    // Personne mise en cause (DIRECT, jamais un témoin), ordre pénal, tous statuts.
    where: {
      ...getDocumentaryAffairWhere(ADVERSE_INVOLVEMENTS),
      jurisdictionOrder: ADVERSE_JURISDICTION_ORDER,
      politicianId,
      category: { in: PROBITY_CATEGORIES },
    },
    _count: { _all: true },
  });
  const stats = { ...EMPTY_STATS };
  for (const row of rows) {
    const level = getCertaintyLevel(row.status);
    const field = BUCKET_FIELD[level];
    stats[field] += row._count._all;
    stats.total += row._count._all;
  }
  return stats;
}
