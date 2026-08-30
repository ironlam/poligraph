import { USER_AGENT } from "@/config/site";

const ENDPOINT = "https://geo.api.gouv.fr/communes";

/** One day. Coordinates do not move, and commune boundaries change once a year at most. */
const REVALIDATE_SECONDS = 86_400;

/**
 * Three outcomes, three shapes.
 *
 * "no commune here" and "the upstream API is down" are different answers and the caller owes the
 * user different responses (an empty list versus a 502). A single nullable string would collapse
 * them, and the copy of this logic in each municipales route did exactly that in one of its
 * branches.
 */
export type ReverseGeocodeResult =
  | { status: "found"; inseeCode: string }
  | { status: "not-found" }
  | { status: "upstream-error" };

/**
 * Resolve coordinates to an INSEE commune code through the government geocoder.
 *
 * The caller validates the ranges; this function assumes them valid and reports transport and
 * payload problems as `upstream-error` rather than throwing.
 */
export async function reverseGeocodeCommune(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  const url = `${ENDPOINT}?lat=${latitude}&lon=${longitude}&limit=1`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) return { status: "upstream-error" };

    const communes = (await response.json()) as Array<{ code?: unknown }>;
    if (!Array.isArray(communes) || communes.length === 0) return { status: "not-found" };

    const code = communes[0]?.code;
    if (typeof code !== "string" || code.length === 0) return { status: "not-found" };

    return { status: "found", inseeCode: code };
  } catch {
    return { status: "upstream-error" };
  }
}
