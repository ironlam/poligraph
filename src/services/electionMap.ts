import { db } from "@/lib/db";
import { getElectionIdBySlug } from "@/lib/elections/election-id";
import { DEPARTMENTS } from "@/config/departments";
import type { MapDepartmentData } from "@/app/api/carte/route";

export async function getElectionMapData(electionSlug = "legislatives-2024"): Promise<{
  departments: MapDepartmentData[];
  totalSeats: number;
}> {
  const electionId = await getElectionIdBySlug(electionSlug);
  if (electionId === null) return { departments: [], totalSeats: 0 };
  const candidacies = await db.candidacy.findMany({
    where: { electionId, isElected: true },
    select: {
      constituencyCode: true,
      partyId: true,
      partyLabel: true,
      party: {
        select: {
          id: true,
          name: true,
          shortName: true,
          color: true,
          politicalPosition: true,
        },
      },
      round2Votes: true,
    },
  });

  const deptMap = new Map<string, MapDepartmentData>();

  for (const c of candidacies) {
    const circoCode = c.constituencyCode || "";
    // Constituency codes format: "XX-YY" (e.g., "01-01" for dept 01 circo 01, "971-01" for dept 971 circo 01)
    const deptCode = circoCode.startsWith("97") ? circoCode.slice(0, 3) : circoCode.slice(0, 2);

    if (!deptMap.has(deptCode)) {
      const deptInfo = DEPARTMENTS[deptCode];
      deptMap.set(deptCode, {
        code: deptCode,
        name: deptInfo?.name || deptCode,
        region: deptInfo?.region || "Inconnu",
        totalSeats: 0,
        winningParty: null,
        parties: [],
      });
    }

    const dept = deptMap.get(deptCode)!;
    dept.totalSeats++;

    const partyKey = c.party?.id || c.partyLabel || "unknown";
    let partyEntry = dept.parties.find((p) => p.id === partyKey);
    if (!partyEntry) {
      partyEntry = {
        id: c.party?.id || partyKey,
        name: c.party?.name || c.partyLabel || "Inconnu",
        shortName: c.party?.shortName || c.partyLabel || "?",
        color: c.party?.color || null,
        seats: 0,
        totalVotes: 0,
        politicalPosition: c.party?.politicalPosition || null,
      };
      dept.parties.push(partyEntry);
    }
    partyEntry.seats++;
    partyEntry.totalVotes += c.round2Votes || 0;
  }

  for (const dept of deptMap.values()) {
    dept.parties.sort((a, b) => b.seats - a.seats);
    if (
      dept.parties.length === 1 ||
      (dept.parties.length > 1 && dept.parties[0]!.seats > dept.parties[1]!.seats)
    ) {
      dept.winningParty = dept.parties[0]!;
    }
  }

  const departments = Array.from(deptMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code, "fr", { numeric: true })
  );

  return {
    departments,
    totalSeats: departments.reduce((sum, d) => sum + d.totalSeats, 0),
  };
}
