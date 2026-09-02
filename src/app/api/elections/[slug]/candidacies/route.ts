import { NextResponse } from "next/server";
import type { CandidacyStatus } from "@/generated/prisma";
import { CANDIDACY_STATUS_LABELS } from "@/config/labels";
import { buildPaginationMeta, parseStrictPagination } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import { getPublicPresidentialCandidacyField } from "@/lib/data/presidential-candidacy-field";

const CANDIDACY_STATUSES = ["DECLARE", "PRESSENTI", "ENVISAGE", "RETIRE"] as const;

const PROGRAMME_STATES = {
  aucun_programme: {
    code: "NO_PROGRAM_IDENTIFIED",
    label: "Programme non trouvé ou pas encore traité par Poligraph",
  },
  non_depouille: {
    code: "PROGRAM_IDENTIFIED_NO_PUBLISHED_MEASURES",
    label: "Programme repéré, traitement éditorial en cours",
  },
  published: {
    code: "PUBLISHED_MEASURES",
    label: "Mesures publiées",
  },
} as const;

function parseOptionalBoolean(value: string | null): boolean | null | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export const GET = withPublicRoute(async (request, context) => {
  const { slug } = await context.params;
  if (!slug) {
    return NextResponse.json({ error: "Slug d'élection invalide" }, { status: 400 });
  }
  const searchParams = request.nextUrl.searchParams;
  const statusParam = searchParams.get("status");
  const hasPublishedMeasures = parseOptionalBoolean(searchParams.get("hasPublishedMeasures"));

  if (
    statusParam !== null &&
    !CANDIDACY_STATUSES.includes(statusParam as (typeof CANDIDACY_STATUSES)[number])
  ) {
    return NextResponse.json({ error: "Statut de candidature invalide" }, { status: 400 });
  }
  if (hasPublishedMeasures === null) {
    return NextResponse.json({ error: "Filtre hasPublishedMeasures invalide" }, { status: 400 });
  }

  const pagination = parseStrictPagination(searchParams, { defaultLimit: 20, maxLimit: 100 });
  if (pagination === null) {
    return NextResponse.json({ error: "Pagination invalide" }, { status: 400 });
  }

  const field = await getPublicPresidentialCandidacyField(slug);
  if (field === null) {
    return NextResponse.json({ error: "Élection non trouvée" }, { status: 404 });
  }
  if (field.election.type !== "PRESIDENTIELLE") {
    return NextResponse.json(
      { error: "Ce contrat est réservé aux élections présidentielles" },
      { status: 400 }
    );
  }

  const { page, limit } = pagination;
  const status = statusParam as CandidacyStatus | null;
  const filtered = field.candidacies.filter((candidacy) => {
    if (status !== null && candidacy.status !== status) return false;
    if (hasPublishedMeasures !== undefined && candidacy.measureCount > 0 !== hasPublishedMeasures) {
      return false;
    }
    return true;
  });
  const data = filtered.slice((page - 1) * limit, page * limit).map((candidacy) => {
    const programmeState = candidacy.programmeAbsence
      ? PROGRAMME_STATES[candidacy.programmeAbsence]
      : PROGRAMME_STATES.published;
    return {
      candidacyId: candidacy.id,
      candidateName: candidacy.candidateName,
      politicianSlug: candidacy.politicianSlug,
      trackingStatus: {
        code: candidacy.status,
        label: CANDIDACY_STATUS_LABELS[candidacy.status],
        source: {
          label: candidacy.sourceLabel,
          url: candidacy.sourceUrl,
        },
      },
      party: candidacy.partyLabel
        ? { label: candidacy.partyLabel, shortName: candidacy.partyShortName }
        : null,
      programmeState,
      publishedMeasureCount: candidacy.measureCount,
      themesCoveredCount: candidacy.themesCoveredCount,
      publicUrl: `/elections/${field.election.slug}/candidats/${candidacy.politicianSlug}`,
    };
  });

  return withCache(
    NextResponse.json({
      election: field.election,
      data,
      pagination: buildPaginationMeta(page, limit, filtered.length),
      meta: {
        statusScope: "PUBLIC_TRACKING_NOT_OFFICIAL_CANDIDATE_LIST",
      },
    }),
    "daily"
  );
});
