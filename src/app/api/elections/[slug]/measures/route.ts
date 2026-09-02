import { NextResponse } from "next/server";
import { buildPaginationMeta, parseStrictPagination } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import {
  getPublicElectionIdentity,
  hasPublicTrackedPresidentialCandidacy,
} from "@/lib/data/presidential-candidacy-field";
import { listPublicPresidentialMeasures } from "@/lib/data/measures";
import { isReadablePresidentialMeasureTheme } from "@/lib/presidentielle/themes";
import { themeFromSlug } from "@/lib/theme-utils";

function parseOptionalBoolean(value: string | null): boolean | null | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

const MAX_CANDIDATE_SLUG_LENGTH = 200;

export const GET = withPublicRoute(async (request, context) => {
  const { slug } = await context.params;
  if (!slug) {
    return NextResponse.json({ error: "Slug d'élection invalide" }, { status: 400 });
  }
  const searchParams = request.nextUrl.searchParams;
  const candidateSlugParam = searchParams.get("candidateSlug");
  const themeParam = searchParams.get("theme");
  const includeWithdrawn = parseOptionalBoolean(searchParams.get("includeWithdrawn"));

  if (
    candidateSlugParam !== null &&
    (candidateSlugParam.trim() === "" ||
      candidateSlugParam !== candidateSlugParam.trim() ||
      candidateSlugParam.length > MAX_CANDIDATE_SLUG_LENGTH)
  ) {
    return NextResponse.json({ error: "Candidature invalide" }, { status: 400 });
  }
  const theme = themeParam === null ? undefined : themeFromSlug(themeParam);
  if (themeParam !== null && theme === null) {
    return NextResponse.json({ error: "Thème invalide" }, { status: 400 });
  }
  if (includeWithdrawn === null) {
    return NextResponse.json({ error: "Filtre includeWithdrawn invalide" }, { status: 400 });
  }
  const pagination = parseStrictPagination(searchParams, { defaultLimit: 20, maxLimit: 100 });
  if (pagination === null) {
    return NextResponse.json({ error: "Pagination invalide" }, { status: 400 });
  }

  const election = await getPublicElectionIdentity(slug);
  if (election === null) {
    return NextResponse.json({ error: "Élection non trouvée" }, { status: 404 });
  }
  if (election.type !== "PRESIDENTIELLE") {
    return NextResponse.json(
      { error: "Ce contrat est réservé aux élections présidentielles" },
      { status: 400 }
    );
  }
  if (theme != null && !isReadablePresidentialMeasureTheme(election.slug, theme)) {
    return NextResponse.json({ error: "Thème invalide" }, { status: 400 });
  }

  const candidateSlug = candidateSlugParam ?? undefined;
  if (
    candidateSlug !== undefined &&
    !(await hasPublicTrackedPresidentialCandidacy(election.id, candidateSlug))
  ) {
    return NextResponse.json({ error: "Candidature non trouvée" }, { status: 404 });
  }

  const { page, limit } = pagination;
  const result = await listPublicPresidentialMeasures({
    electionId: election.id,
    electionSlug: election.slug,
    candidateSlug,
    theme: theme ?? undefined,
    includeWithdrawn: includeWithdrawn ?? false,
    page,
    limit,
  });

  return withCache(
    NextResponse.json({
      election,
      data: result.data,
      pagination: buildPaginationMeta(page, limit, result.total),
      meta: {
        includeWithdrawn: includeWithdrawn ?? false,
        precisionField: {
          deprecated: true,
          meaning:
            "Indique uniquement si la formulation comporte une quantité explicite, en chiffres ou en toutes lettres.",
          caveat:
            "Ce champ ne décrit pas la nature de l'engagement et n'évalue ni son coût, ni son efficacité, ni sa faisabilité.",
        },
      },
    }),
    "daily"
  );
});
