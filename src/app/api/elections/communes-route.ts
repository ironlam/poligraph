import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { respondToGeolocation } from "./communes-geolocation";
import {
  getElectionIdBySlug,
  isValidDepartmentCode,
  listCommunesByDepartment,
  searchCommunesByText,
  type CommuneSearchScope,
} from "@/lib/data/commune-search";

/**
 * The commune autocomplete handler, shared by every municipal election year.
 *
 * Each year keeps its own `route.ts`, so the public URLs and the per-year OpenAPI blocks are
 * unchanged. Only the body is shared. Three copies of this dispatch is what let the 2026 one
 * lose its election filter without anybody noticing.
 */
export interface CommunesRouteConfig {
  /** Election slug, e.g. "municipales-2026". */
  slug: string;
  /** 2014 stored one Candidacy per list; later years one per candidate. */
  listCounting: CommuneSearchScope["listCounting"];
  /**
   * 2026 lets the autocomplete narrow to a department (`dept`) and to communes that already
   * have a first-round record (`resultats=1`). Earlier years ignore both.
   */
  textSearchFilters?: boolean;
}

export function createCommunesRoute(config: CommunesRouteConfig) {
  return withPublicRoute(async (request) => {
    const electionId = await getElectionIdBySlug(config.slug);
    if (!electionId) {
      return NextResponse.json({ error: `Élection ${config.slug} introuvable` }, { status: 404 });
    }

    const scope: CommuneSearchScope = { electionId, listCounting: config.listCounting };
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const dept = searchParams.get("dept");

    // Mode 1: text search. Never cached, the key would be unbounded.
    if (query !== null) {
      const options = config.textSearchFilters
        ? {
            departmentCode: dept ?? undefined,
            withRound1ResultsOnly: searchParams.get("resultats") === "1",
          }
        : {};
      return NextResponse.json(await searchCommunesByText(query, scope, options));
    }

    // Mode 2: reverse geocode.
    if (lat !== null && lon !== null) {
      return respondToGeolocation(lat, lon, scope);
    }

    // Mode 3: department filter. Cached, the set of departments is bounded.
    if (dept !== null) {
      if (!isValidDepartmentCode(dept)) {
        return NextResponse.json({ error: "Code département invalide" }, { status: 400 });
      }
      return withCache(NextResponse.json(await listCommunesByDepartment(dept, scope)), "daily");
    }

    return NextResponse.json({ error: "Paramètre requis : q, lat+lon, ou dept" }, { status: 400 });
  });
}
