import { NextResponse } from "next/server";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import { searchPresidentialCorpus } from "@/lib/presidentielle/corpus-search";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export const GET = withPublicRoute(async (request) => {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return withCache(
      NextResponse.json({
        state: "too_short" as const,
        query,
        total: 0,
        groups: { subjects: [], candidacies: [], measures: [] },
      }),
      "none"
    );
  }

  const result = await searchPresidentialCorpus(
    PRESIDENTIELLE_2027_SLUG,
    query,
    parseLimit(request.nextUrl.searchParams.get("limit")),
    { strategy: "lexical" }
  );
  if (result === null) {
    return withCache(NextResponse.json({ error: "Élection introuvable" }, { status: 404 }), "none");
  }

  return withCache(
    NextResponse.json({
      state: result.total > 0 ? ("results" as const) : ("empty" as const),
      query: result.query,
      total: result.total,
      groups: {
        subjects: result.subjects,
        candidacies: result.candidacies,
        measures: result.measures,
      },
    }),
    "none"
  );
});
