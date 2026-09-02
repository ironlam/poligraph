import { NextResponse } from "next/server";
import { reverseGeocodeCommune } from "@/lib/api/geo-gouv";
import { findCommuneByInsee, type CommuneSearchScope } from "@/lib/data/commune-search";

/**
 * The `lat`+`lon` mode of the municipal commune routes.
 *
 * Shared rather than copied: the three yearly routes each carried their own version, and the
 * validation drifted between them. The response shape is a list of zero or one commune, because
 * the caller is an autocomplete that renders a list either way.
 */
export async function respondToGeolocation(
  latParam: string,
  lonParam: string,
  scope: CommuneSearchScope
): Promise<Response> {
  const latitude = parseFloat(latParam);
  const longitude = parseFloat(lonParam);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return NextResponse.json(
      { error: "lat et lon doivent être des nombres valides" },
      { status: 400 }
    );
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Coordonnées hors limites" }, { status: 400 });
  }

  const geocoded = await reverseGeocodeCommune(latitude, longitude);

  if (geocoded.status === "upstream-error") {
    return NextResponse.json({ error: "Erreur lors de la géolocalisation" }, { status: 502 });
  }
  if (geocoded.status === "not-found") {
    return NextResponse.json([]);
  }

  const commune = await findCommuneByInsee(geocoded.inseeCode, scope);
  return NextResponse.json(commune ? [commune] : []);
}
