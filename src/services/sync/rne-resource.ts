/**
 * Where the RNE files actually live today.
 *
 * The dataset slug on data.gouv.fr is stable; the resource URL is not. It
 * carries a publication timestamp, and the filename itself drifts: the maires
 * export moved from `elus-maires-mai.csv` to `elus-maire-mai.csv`, losing a
 * letter. A URL pinned in code returned 404 for months without anyone noticing,
 * because the sync is a manual script rather than a scheduled job.
 *
 * Resolving through the catalogue costs one request per run and removes a whole
 * class of silent breakage.
 */
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";

const DATASET_API_URL = "https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-elus-1/";

const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

interface DataGouvResource {
  title?: unknown;
  url?: unknown;
  last_modified?: unknown;
}

/**
 * The resource whose title contains every fragment, most recently published
 * first.
 *
 * Matching on fragments rather than an exact filename is deliberate: the exact
 * name is precisely what proved unstable, while "maire" and "arrondissement"
 * have survived every revision of the dataset.
 */
export async function resolveRneResourceUrl(fragments: readonly string[]): Promise<string> {
  const { data } = await client.getText(DATASET_API_URL);
  const dataset = safeJsonParseOrThrow<{ resources?: DataGouvResource[] }>(data);
  const resources = dataset.resources ?? [];

  const matches = resources
    .filter((resource): resource is DataGouvResource & { title: string; url: string } => {
      if (typeof resource.title !== "string" || typeof resource.url !== "string") return false;
      const title = resource.title.toLowerCase();
      return fragments.every((fragment) => title.includes(fragment.toLowerCase()));
    })
    .sort((a, b) => String(b.last_modified ?? "").localeCompare(String(a.last_modified ?? "")));

  const best = matches[0];
  if (!best) {
    throw new Error(
      `Aucune ressource RNE ne porte ${fragments.join(" + ")} dans son titre. ` +
        `Le jeu de données a peut-être été réorganisé : ${DATASET_API_URL}`
    );
  }
  return best.url;
}

/** Title fragments of the files this project reads. */
export const RNE_MAIRES_FRAGMENTS = ["maire"] as const;
export const RNE_ARRONDISSEMENTS_FRAGMENTS = ["arrondissement"] as const;
