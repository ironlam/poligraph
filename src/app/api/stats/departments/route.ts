import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MandateType } from "@/generated/prisma";
import { DEPARTMENTS } from "@/config/departments";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";

export interface DepartmentStats {
  code: string;
  name: string;
  region: string;
  totalElus: number;
  deputes: number;
  senateurs: number;
  dominantParty: {
    id: string;
    name: string;
    shortName: string;
    color: string | null;
    count: number;
  } | null;
  parties: {
    id: string;
    name: string;
    shortName: string;
    color: string | null;
    count: number;
  }[];
}

export const GET = withPublicRoute(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const VALID_FILTERS = new Set(["all", "deputes", "senateurs"]);
  const filterParam = searchParams.get("filter");

  if (filterParam !== null && !VALID_FILTERS.has(filterParam)) {
    return NextResponse.json({ error: "Filtre invalide" }, { status: 400 });
  }

  const filter = (filterParam || "all") as "all" | "deputes" | "senateurs";

  const mandateTypes =
    filter === "deputes"
      ? [MandateType.DEPUTE]
      : filter === "senateurs"
        ? [MandateType.SENATEUR]
        : [MandateType.DEPUTE, MandateType.SENATEUR];

  const mandatesByDept = await db.$queryRaw<
    {
      departmentCode: string;
      mandateType: MandateType;
      partyId: string | null;
      partyName: string | null;
      partyShortName: string | null;
      partyColor: string | null;
      count: bigint;
    }[]
  >`
    SELECT
      m."departmentCode",
      m.type as "mandateType",
      p.id as "partyId",
      p.name as "partyName",
      p."shortName" as "partyShortName",
      p.color as "partyColor",
      COUNT(DISTINCT pol.id) as count
    FROM "Mandate" m
    JOIN "Politician" pol ON m."politicianId" = pol.id
    LEFT JOIN "Party" p ON pol."currentPartyId" = p.id
    WHERE m."isCurrent" = true
      AND pol."publicationStatus" = 'PUBLISHED'
      AND m."departmentCode" IS NOT NULL
      AND m.type = ANY(${mandateTypes}::"MandateType"[])
    GROUP BY m."departmentCode", m.type, p.id, p.name, p."shortName", p.color
    ORDER BY m."departmentCode", count DESC
  `;

  const deptMap = new Map<string, DepartmentStats>();

  for (const row of mandatesByDept) {
    const code = row.departmentCode;
    const deptInfo = DEPARTMENTS[code];

    if (!deptMap.has(code)) {
      deptMap.set(code, {
        code,
        name: deptInfo?.name || code,
        region: deptInfo?.region || "Inconnu",
        totalElus: 0,
        deputes: 0,
        senateurs: 0,
        dominantParty: null,
        parties: [],
      });
    }

    const dept = deptMap.get(code)!;
    const count = Number(row.count);

    dept.totalElus += count;

    if (row.mandateType === MandateType.DEPUTE) {
      dept.deputes += count;
    } else if (row.mandateType === MandateType.SENATEUR) {
      dept.senateurs += count;
    }

    if (row.partyId) {
      const existingParty = dept.parties.find((p) => p.id === row.partyId);
      if (existingParty) {
        existingParty.count += count;
      } else {
        dept.parties.push({
          id: row.partyId,
          name: row.partyName || "Inconnu",
          shortName: row.partyShortName || "?",
          color: row.partyColor,
          count,
        });
      }
    }
  }

  for (const dept of deptMap.values()) {
    dept.parties.sort((a, b) => b.count - a.count);

    if (
      dept.parties.length === 1 ||
      (dept.parties.length > 1 && dept.parties[0]!.count > dept.parties[1]!.count)
    ) {
      dept.dominantParty = dept.parties[0]!;
    }
  }

  const departments = Array.from(deptMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code, "fr", { numeric: true })
  );

  const totalStats = {
    totalDepartments: departments.length,
    totalElus: departments.reduce((sum, d) => sum + d.totalElus, 0),
    totalDeputes: departments.reduce((sum, d) => sum + d.deputes, 0),
    totalSenateurs: departments.reduce((sum, d) => sum + d.senateurs, 0),
  };

  return withCache(
    NextResponse.json({
      departments,
      stats: totalStats,
      filter,
    }),
    "stats"
  );
});
