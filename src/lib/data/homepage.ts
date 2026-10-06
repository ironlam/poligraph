import "server-only";
import { db } from "@/lib/db";
import { cacheTag, cacheLife } from "next/cache";
import { getPublicFactCheckWhere, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import {
  getDefinitiveConvictionWhere,
  getNonDefinitiveConvictionWhere,
  getMisEnCauseWhere,
  getFavorableOutcomeWhere,
} from "@/lib/affairs/public-filters";

export interface HomepageKPIs {
  politiciansCount: number;
  condamnationsDefinitivesCount: number;
  condamnationsNonDefinitivesCount: number;
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
    condamnationsDefinitivesCount,
    condamnationsNonDefinitivesCount,
    proceduresEnCoursCount,
    closesSansCondamnationCount,
    votesCount,
    factchecksCount,
  ] = await Promise.all([
    db.politician.count({ where: PUBLIC_POLITICIAN_WHERE }),
    db.affair.count({
      where: { ...getDefinitiveConvictionWhere(), politician: PUBLIC_POLITICIAN_WHERE },
    }),
    db.affair.count({
      where: { ...getNonDefinitiveConvictionWhere(), politician: PUBLIC_POLITICIAN_WHERE },
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
    condamnationsDefinitivesCount,
    condamnationsNonDefinitivesCount,
    proceduresEnCoursCount,
    closesSansCondamnationCount,
    votesCount,
    factchecksCount,
  };
}
