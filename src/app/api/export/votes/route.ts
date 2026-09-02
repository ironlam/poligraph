import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCSV, formatDateForCSV, createCSVResponse } from "@/lib/csv";
import { VOTING_RESULT_LABELS, CHAMBER_LABELS } from "@/config/labels";
import { parsePagination } from "@/lib/api/pagination";
import { Chamber as ChamberEnum, VotingResult as VotingResultEnum } from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";

export const dynamic = "force-dynamic";

export const GET = withPublicRoute(async (request) => {
  const searchParams = request.nextUrl.searchParams;

  // Optional filters. An API client gets an explicit 400 rather than a
  // silently-ignored filter: a bad value used to reach Prisma and 500.
  const chamberParam = searchParams.get("chamber");
  const chamber = pickEnumValue(chamberParam, ChamberEnum);
  if (chamberParam && !chamber) {
    return NextResponse.json({ error: "Chambre invalide" }, { status: 400 });
  }

  const resultParam = searchParams.get("result");
  const result = pickEnumValue(resultParam, VotingResultEnum);
  if (resultParam && !result) {
    return NextResponse.json({ error: "Résultat de vote invalide" }, { status: 400 });
  }

  const legislatureParam = searchParams.get("legislature");
  const legislature = legislatureParam ? Number(legislatureParam) : undefined;
  if (legislatureParam && !Number.isInteger(legislature)) {
    return NextResponse.json({ error: "Législature invalide" }, { status: 400 });
  }

  const { limit } = parsePagination(searchParams, { defaultLimit: 10000, maxLimit: 50000 });

  // Build where clause
  const where: Record<string, unknown> = {};

  if (chamber) {
    where.chamber = chamber;
  }

  if (result) {
    where.result = result;
  }

  if (legislature !== undefined) {
    where.legislature = legislature;
  }

  // Fetch scrutins
  const scrutins = await db.scrutin.findMany({
    where,
    orderBy: { votingDate: "desc" },
    take: limit,
  });

  // Transform to flat structure for CSV
  const data = scrutins.map((s) => ({
    id: s.id,
    externalId: s.externalId,
    slug: s.slug || "",
    title: s.title,
    votingDate: formatDateForCSV(s.votingDate),
    legislature: s.legislature,
    chamber: CHAMBER_LABELS[s.chamber] || s.chamber,
    votesFor: s.votesFor,
    votesAgainst: s.votesAgainst,
    votesAbstain: s.votesAbstain,
    totalVotes: s.votesFor + s.votesAgainst + s.votesAbstain,
    result: VOTING_RESULT_LABELS[s.result],
    sourceUrl: s.sourceUrl || "",
    pageUrl: `${SITE_URL}/parlement/votes/${s.slug || s.id}`,
  }));

  const columns = [
    { key: "id" as const, header: "ID" },
    { key: "externalId" as const, header: "ID Externe" },
    { key: "slug" as const, header: "Slug" },
    { key: "title" as const, header: "Titre" },
    { key: "votingDate" as const, header: "Date du Vote" },
    { key: "legislature" as const, header: "Legislature" },
    { key: "chamber" as const, header: "Chambre" },
    { key: "votesFor" as const, header: "Pour" },
    { key: "votesAgainst" as const, header: "Contre" },
    { key: "votesAbstain" as const, header: "Abstention" },
    { key: "totalVotes" as const, header: "Total Votants" },
    { key: "result" as const, header: "Resultat" },
    { key: "sourceUrl" as const, header: "Source URL" },
    { key: "pageUrl" as const, header: "Page URL" },
  ];

  const csv = toCSV(data, columns);
  const filename = `votes-${chamber ? chamber.toLowerCase() + "-" : ""}${new Date().toISOString().split("T")[0]}.csv`;

  return createCSVResponse(csv, filename);
});
