import "server-only";
import { db } from "@/lib/db";
import { cacheTag, cacheLife } from "next/cache";
import { getPublicFactCheckWhere, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import {
  getConvictionOnlyWhere,
  getMisEnCauseWhere,
  getFavorableOutcomeWhere,
} from "@/lib/affairs/public-filters";

export interface HomepageKPIs {
  politiciansCount: number;
  condamnationsCount: number;
  proceduresEnCoursCount: number;
  closesSansCondamnationCount: number;
  votesCount: number;
  factchecksCount: number;
}

export async function getHomepageKPIs(): Promise<HomepageKPIs> {
  "use cache";
  cacheTag("politicians", "affairs", "votes", "factchecks");
  cacheLife("synced");

  const [
    politiciansCount,
    condamnationsCount,
    proceduresEnCoursCount,
    closesSansCondamnationCount,
    votesCount,
    factchecksCount,
  ] = await Promise.all([
    db.politician.count({ where: PUBLIC_POLITICIAN_WHERE }),
    db.affair.count({
      where: { ...getConvictionOnlyWhere(), politician: PUBLIC_POLITICIAN_WHERE },
    }),
    db.affair.count({
      where: { ...getMisEnCauseWhere(), politician: PUBLIC_POLITICIAN_WHERE },
    }),
    db.affair.count({
      where: { ...getFavorableOutcomeWhere(), politician: PUBLIC_POLITICIAN_WHERE },
    }),
    db.scrutin.count(),
    db.factCheck.count({ where: getPublicFactCheckWhere() }),
  ]);

  return {
    politiciansCount,
    condamnationsCount,
    proceduresEnCoursCount,
    closesSansCondamnationCount,
    votesCount,
    factchecksCount,
  };
}
