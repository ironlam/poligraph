import { HTTPClient } from "@/lib/api/http-client";
import { WIKIDATA_RATE_LIMIT_MS } from "@/config/rate-limits";

/**
 * Read Wikidata's "image" claim (P18) for many entities at once.
 *
 * P18 is authoritative for our purpose: the claim hangs off the item that *is*
 * the person, so there is no name matching involved and therefore no risk of
 * attaching a stranger's face. Searching Commons by name would have that risk,
 * which is why it is not offered here.
 */

/** wbgetentities accepts at most 50 ids per request. */
const BATCH_SIZE = 50;

const client = new HTTPClient({ rateLimitMs: WIKIDATA_RATE_LIMIT_MS });

interface WbEntitiesResponse {
  entities?: Record<
    string,
    {
      claims?: {
        P18?: Array<{ mainsnak?: { datavalue?: { value?: string } }; rank?: string }>;
      };
    }
  >;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Map of Q-id to Commons filename, holding only entities that carry a P18.
 *
 * A deprecated claim is skipped: editors use that rank to mark an image as the
 * wrong person or otherwise unsuitable, which is exactly what we must not
 * publish.
 */
export async function fetchP18Filenames(qids: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const unique = [...new Set(qids.filter(Boolean))];

  for (const batch of chunk(unique, BATCH_SIZE)) {
    const url =
      `https://www.wikidata.org/w/api.php?action=wbgetentities` +
      `&ids=${batch.join("|")}&props=claims&format=json&origin=*`;

    const { data } = await client.get<WbEntitiesResponse>(url);

    for (const [qid, entity] of Object.entries(data.entities ?? {})) {
      const claim = entity.claims?.P18?.find((c) => c.rank !== "deprecated");
      const filename = claim?.mainsnak?.datavalue?.value;
      if (filename) found.set(qid, filename);
    }
  }

  return found;
}

/**
 * Recover the Commons filename from a thumbnail URL we stored earlier.
 *
 * The filename sits in the second-to-last path segment, percent-encoded. This
 * lets the repair and crop passes work without going back to Wikidata.
 */
export function filenameFromThumbnailUrl(url: string): string | null {
  const segments = url.split("/");
  if (segments.length < 2) return null;
  const candidate = segments[segments.length - 2];
  if (!candidate) return null;
  try {
    return decodeURIComponent(candidate);
  } catch {
    return null;
  }
}
