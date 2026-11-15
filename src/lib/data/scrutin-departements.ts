import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { getDepartmentName, getDepartmentSlug } from "@/config/departments";
import type { DepartementTally } from "@/lib/votes/departement-tally";

/**
 * « Le vote par département » of one scrutin (Territoires v2, lot B): the recorded positions
 * grouped by the department each member sat for ON THE DAY OF THE VOTE, read from the mandate
 * that covers the date, never from the current one (a seat changes hands).
 */

export interface ScrutinDepartement extends DepartementTally {
  code: string;
  name: string;
  slug: string;
}

/** Official order of the codes: 2A and 2B sit between 19 and 21, the overseas codes come last. */
function rang(code: string): number {
  if (code === "2A") return 20.1;
  if (code === "2B") return 20.2;
  return Number(code);
}

interface Row {
  code: string;
  position: string;
  n: number;
}

export async function getScrutinVotesParDepartement(
  scrutinId: string
): Promise<ScrutinDepartement[]> {
  "use cache";
  cacheLife("synced");
  cacheTag("votes", "politicians");

  // Every member of the two chambers at most: bounded by the 101 departments times 5 positions.
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT t.code, t.position, count(*)::int AS n
    FROM (
      SELECT v.id, v.position::text AS position, min(m."departmentCode") AS code
      FROM "Vote" v
      JOIN "Scrutin" s ON s.id = v."scrutinId"
      JOIN "Mandate" m ON m."politicianId" = v."politicianId"
        AND m.type = (CASE WHEN s.chamber = 'AN' THEN 'DEPUTE' ELSE 'SENATEUR' END)::"MandateType"
        AND m."departmentCode" IS NOT NULL
        AND m."startDate" <= s."votingDate"
        AND (m."endDate" IS NULL OR m."endDate" >= s."votingDate")
      WHERE v."scrutinId" = ${scrutinId}
      GROUP BY v.id, v.position
      HAVING count(DISTINCT m."departmentCode") = 1
    ) t
    GROUP BY 1, 2
    LIMIT 1000
  `);

  const byCode = new Map<string, ScrutinDepartement>();
  for (const row of rows) {
    const name = getDepartmentName(row.code);
    // A code without a department page (collectivities outside the referential) is left out.
    if (!name) continue;
    const dept = byCode.get(row.code) ?? {
      code: row.code,
      name,
      slug: getDepartmentSlug(name),
      pour: 0,
      contre: 0,
      abstention: 0,
      nonVotant: 0,
    };
    if (row.position === "POUR") dept.pour += row.n;
    else if (row.position === "CONTRE") dept.contre += row.n;
    else if (row.position === "ABSTENTION") dept.abstention += row.n;
    else if (row.position === "NON_VOTANT") dept.nonVotant += row.n;
    byCode.set(row.code, dept);
  }
  return [...byCode.values()].sort((a, b) => rang(a.code) - rang(b.code));
}
