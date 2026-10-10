import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getAdverseAffairWhere } from "@/lib/affairs/public-filters";
import { summarizeAffairs, type MemberAffairsMap } from "@/lib/governments/affairs";

// Kept apart from `governments.ts` on purpose: only the surfaces that show affairs import it
// (members page, people and functions exports), and the MCP-01 guard lists exactly those.
/**
 * Affaires à charge des membres des gouvernements publiés, par personne. Même périmètre que les
 * agrégats publics (`getAdverseAffairWhere`), fiches publiques seulement : une personne en
 * attente de fiche n'a pas d'affaire affichée. Deux tags, pour suivre les gouvernements et les
 * affaires.
 */
export async function getGovernmentMemberAffairs(): Promise<MemberAffairsMap> {
  "use cache";
  cacheTag("gouvernements", "affairs");
  cacheLife("synced");

  const rows = await db.affair.findMany({
    where: {
      ...getAdverseAffairWhere(),
      politician: {
        ...PUBLIC_POLITICIAN_WHERE,
        mandates: {
          some: { governmentData: { government: { publicationStatus: "PUBLISHED" } } },
        },
      },
    },
    select: { politicianId: true, status: true },
  });
  return summarizeAffairs(rows);
}
