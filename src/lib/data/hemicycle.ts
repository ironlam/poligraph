import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { POLITICAL_POSITION_ORDER } from "@/config/labels";
import {
  getCertaintyLevel,
  CERTAINTY_SCORE,
  isActiveCertainty,
  type CertaintyLevel,
} from "@/config/certainty";
import type { PoliticalPosition } from "@/generated/prisma";

export interface HemicycleDeputy {
  slug: string;
  firstName: string;
  lastName: string;
  /** Certainty-based severity score */
  severityScore: number;
  /** Highest certainty level among active affairs */
  maxCertaintyLevel: CertaintyLevel | null;
  /** Number of active affairs (excluding clos favorable) */
  activeAffairCount: number;
}

export interface HemicycleGroup {
  code: string;
  name: string;
  shortName: string | null;
  color: string;
  politicalPosition: PoliticalPosition | null;
  deputies: HemicycleDeputy[];
}

export async function getHemicycleData(): Promise<HemicycleGroup[]> {
  "use cache";
  cacheTag("statistics", "affairs", "politicians");
  cacheLife("synced");

  const groups = await db.parliamentaryGroup.findMany({
    where: {
      chamber: "AN",
      mandates: { some: { mandate: { isCurrent: true, type: "DEPUTE" } } },
    },
    select: {
      code: true,
      name: true,
      shortName: true,
      color: true,
      politicalPosition: true,
      mandates: {
        where: { mandate: { isCurrent: true, type: "DEPUTE" } },
        take: 1000,
        select: {
          mandate: {
            select: {
              politician: {
                select: {
                  slug: true,
                  firstName: true,
                  lastName: true,
                  affairs: {
                    where: {
                      publicationStatus: "PUBLISHED",
                      involvement: "DIRECT",
                    },
                    select: { status: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const positionIndex = (pos: PoliticalPosition | null) => {
    if (!pos) return POLITICAL_POSITION_ORDER.length;
    return POLITICAL_POSITION_ORDER.indexOf(pos);
  };

  return groups
    .sort((a, b) => positionIndex(a.politicalPosition) - positionIndex(b.politicalPosition))
    .map((g) => ({
      code: g.code,
      name: g.name,
      shortName: g.shortName,
      color: g.color || "#AAAAAA",
      politicalPosition: g.politicalPosition,
      deputies: g.mandates.map(({ mandate: m }) => {
        const affairs = m.politician.affairs;
        let maxCertainty: CertaintyLevel | null = null;
        let activeCount = 0;
        let score = 0;

        for (const a of affairs) {
          const level = getCertaintyLevel(a.status);
          if (!isActiveCertainty(level)) continue;
          activeCount++;
          const levelScore = CERTAINTY_SCORE[level];
          score += levelScore;
          if (maxCertainty === null || levelScore > CERTAINTY_SCORE[maxCertainty]) {
            maxCertainty = level;
          }
        }

        return {
          slug: m.politician.slug,
          firstName: m.politician.firstName,
          lastName: m.politician.lastName,
          severityScore: score,
          maxCertaintyLevel: maxCertainty,
          activeAffairCount: activeCount,
        };
      }),
    }));
}
