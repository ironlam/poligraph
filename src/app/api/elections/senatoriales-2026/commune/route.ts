import { NextRequest, NextResponse } from "next/server";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import {
  findCommunesByPostalCode,
  getCommuneCollege,
  getSittingSenators,
} from "@/lib/data/senatoriales";
import { inhabitantsPerDelegate } from "@/lib/senatoriales/college";

/**
 * Resolves a postal code, then a commune, for the Sénatoriales 2026 college lookup.
 *
 * Two modes rather than one, because a postal code is not a commune identifier. 4,204
 * of them cover several communes and one covers 46, so `?cp=` answers with the list of
 * candidates and lets the caller disambiguate, while `?insee=` answers with the full
 * college for a settled commune. Silently keeping the largest commune would give a
 * confident wrong answer, which is worse than a second click.
 *
 * Both parameters are bounded (a 5-digit code, an INSEE code), so the responses are
 * cacheable, unlike a free-text commune search.
 */

const POSTAL_CODE = /^[0-9]{5}$/;
// INSEE commune codes: 5 chars, second position may be a letter for Corsica (2A/2B).
const INSEE_CODE = /^[0-9][0-9AB][0-9]{3}$/;

export const GET = withPublicRoute(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const cp = params.get("cp");
  const insee = params.get("insee");

  if (cp !== null) {
    if (!POSTAL_CODE.test(cp)) {
      return NextResponse.json({ error: "Code postal invalide" }, { status: 400 });
    }
    const communes = await findCommunesByPostalCode(cp);
    return withCache(NextResponse.json({ postalCode: cp, communes }), "daily");
  }

  if (insee !== null) {
    if (!INSEE_CODE.test(insee)) {
      return NextResponse.json({ error: "Code INSEE invalide" }, { status: 400 });
    }
    const view = await getCommuneCollege(insee);
    if (!view) {
      return NextResponse.json({ error: "Commune inconnue" }, { status: 404 });
    }
    const senators = await getSittingSenators(view.departmentCode);
    return withCache(
      NextResponse.json({
        commune: {
          id: view.id,
          name: view.name,
          departmentCode: view.departmentCode,
          departmentName: view.departmentName,
        },
        college: view.college,
        inhabitantsPerDelegate: inhabitantsPerDelegate(view.college),
        renewal: view.renewal,
        seatsAtStake: view.seatsAtStake,
        senators,
      }),
      "daily"
    );
  }

  return NextResponse.json({ error: "Paramètre requis : cp ou insee" }, { status: 400 });
});
