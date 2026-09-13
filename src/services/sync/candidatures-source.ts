import { parse } from "csv-parse/sync";

import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";

import type { CandidatureMunicipaleCSV } from "./types";

/** Stable data.gouv.fr identifiers, independent from publication timestamps. */
export const CANDIDATURES_DATASET_ID = "69a24d41280ad1aa5193e487";
export const CANDIDATURES_RESOURCE_ID = "b929c2a4-18ec-4e8b-bc37-2ff346a867cd";

const DATA_GOUV_DATASET_API_URL = `https://www.data.gouv.fr/api/1/datasets/${CANDIDATURES_DATASET_ID}/`;

// The resource endpoint redirects to the current file URL without embedding a publication date.
const FALLBACK_CSV_URL = `https://www.data.gouv.fr/api/1/datasets/r/${CANDIDATURES_RESOURCE_ID}`;

interface DataGouvResource {
  id?: string;
  url?: string;
}

interface DataGouvDataset {
  resources?: DataGouvResource[];
}

const dataGouvClient = new HTTPClient({
  rateLimitMs: DATA_GOUV_RATE_LIMIT_MS,
  sourceName: "data.gouv.fr (candidatures)",
});

/** Resolve the current CSV URL from data.gouv.fr, retaining a stable resource fallback. */
export async function resolveCandidaturesCsvUrl(
  client: Pick<HTTPClient, "get"> = dataGouvClient
): Promise<string> {
  try {
    const { data } = await client.get<DataGouvDataset>(DATA_GOUV_DATASET_API_URL);
    const resource = data.resources?.find((candidate) => candidate.id === CANDIDATURES_RESOURCE_ID);

    if (!resource?.url) {
      throw new Error(`resource ${CANDIDATURES_RESOURCE_ID} absente ou sans URL`);
    }

    return resource.url;
  } catch (error) {
    console.warn(
      `[candidatures] Impossible de résoudre l'URL via l'API data.gouv.fr (${error}). ` +
        `Utilisation du point d'accès stable de la ressource ${CANDIDATURES_RESOURCE_ID}.`
    );
    return FALLBACK_CSV_URL;
  }
}

/** Fetch and parse the current candidatures CSV (semicolon-delimited, UTF-8). */
export async function fetchCandidaturesCSV(
  url: string = FALLBACK_CSV_URL,
  client: Pick<HTTPClient, "getBuffer"> = dataGouvClient
): Promise<CandidatureMunicipaleCSV[]> {
  console.log(`Fetching candidatures from: ${url}`);

  // HTTPClient rejects every non-2xx response before parsing, so an error page cannot become CSV rows.
  const { data: buffer } = await client.getBuffer(url);
  const text = new TextDecoder("utf-8").decode(buffer);

  const records = parse(text, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
    quote: '"',
    record_delimiter: ["\r\n", "\n"],
  }) as CandidatureMunicipaleCSV[];

  console.log(`Parsed ${records.length} candidature records`);
  return records;
}

/** Resolve the resource first, then download it so a non-2xx resource response fails the sync. */
export async function fetchResolvedCandidaturesCSV(
  clients: {
    api?: Pick<HTTPClient, "get">;
    download?: Pick<HTTPClient, "getBuffer">;
  } = {}
): Promise<CandidatureMunicipaleCSV[]> {
  const url = await resolveCandidaturesCsvUrl(clients.api);
  return fetchCandidaturesCSV(url, clients.download);
}
